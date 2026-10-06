/* Feature module: Trò chuyện với AI
   - Gọi API trực tiếp từ trình duyệt bằng API key của chính bạn (lưu trong localStorage)
   - Hỗ trợ: Gemini, OpenAI, Groq, OpenRouter, Anthropic (Claude), hoặc endpoint tương thích OpenAI tự nhập
   - Streaming, dừng giữa chừng, lưu lịch sử, render markdown cơ bản */
(function () {
  'use strict';
  window.Features = window.Features || {};

  const CFG_KEY = 'webtutus_chat_cfg_v1';
  const HIS_KEY = 'webtutus_chat_history_v1';
  const MAX_CONTEXT = 30;

  const PROVIDERS = {
    free:       { label: '🆓 Miễn phí (không cần key)', kind: 'openai', nokey: true, base: 'https://text.pollinations.ai/openai', model: 'openai', hint: 'Dùng dịch vụ công khai miễn phí, không cần đăng ký hay nhập key. Có thể chậm hoặc bị giới hạn khi đông người.' },
    gemini:     { label: 'Google Gemini',        kind: 'openai',    base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', hint: 'Lấy key miễn phí tại aistudio.google.com/apikey' },
    openai:     { label: 'OpenAI',               kind: 'openai',    base: 'https://api.openai.com/v1',                                 model: 'gpt-4o-mini',      hint: 'platform.openai.com/api-keys' },
    groq:       { label: 'Groq',                 kind: 'openai',    base: 'https://api.groq.com/openai/v1',                            model: 'llama-3.3-70b-versatile', hint: 'console.groq.com/keys' },
    openrouter: { label: 'OpenRouter',           kind: 'openai',    base: 'https://openrouter.ai/api/v1',                              model: 'openai/gpt-4o-mini', hint: 'openrouter.ai/keys' },
    anthropic:  { label: 'Anthropic (Claude)',   kind: 'anthropic', base: 'https://api.anthropic.com/v1',                              model: 'claude-haiku-4-5-20251001', hint: 'console.anthropic.com/settings/keys' },
    custom:     { label: 'Tự nhập (OpenAI-compatible)', kind: 'openai', base: '',                                                      model: '',                 hint: 'Nhập Base URL, ví dụ http://localhost:11434/v1 (Ollama)' }
  };

  const DEFAULT_SYSTEM = 'Bạn là trợ lý học tập thân thiện trong ứng dụng HoTroHocTap. Luôn trả lời bằng tiếng Việt (trừ khi người dùng yêu cầu ngôn ngữ khác), giải thích rõ ràng, có ví dụ, ngắn gọn dễ hiểu. Khi giải bài, trình bày từng bước.';

  const SUGGESTS = [
    'Giải thích định luật II Newton bằng ví dụ đời thường',
    'Cách nhớ các thì trong tiếng Anh nhanh nhất?',
    'Tóm tắt cách giải phương trình bậc hai',
    'Lập kế hoạch ôn thi 2 tuần cho mình'
  ];

  let cfg = loadCfg();
  let msgs = loadHis();
  let controller = null;
  let busy = false;

  function loadCfg() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch (_) {}
    if (!PROVIDERS[c.provider]) c.provider = 'free';
    c.keys = c.keys && typeof c.keys === 'object' ? c.keys : {};
    c.models = c.models && typeof c.models === 'object' ? c.models : {};
    c.bases = c.bases && typeof c.bases === 'object' ? c.bases : {};
    if (typeof c.system !== 'string' || !c.system.trim()) c.system = DEFAULT_SYSTEM;
    return c;
  }
  function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (_) {} }
  function loadHis() {
    try {
      const h = JSON.parse(localStorage.getItem(HIS_KEY) || '[]');
      return Array.isArray(h) ? h.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') : [];
    } catch (_) { return []; }
  }
  function saveHis() { try { localStorage.setItem(HIS_KEY, JSON.stringify(msgs.slice(-200))); } catch (_) {} }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ---------- markdown cơ bản (an toàn: escape trước) ---------- */
  function inline(s) {
    return s
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  }
  function md(src) {
    const blocks = [];
    let t = esc(src).replace(/```([\w+-]*)\n?([\s\S]*?)(```|$)/g, (_, lang, code) => {
      blocks.push('<pre><code>' + code.replace(/\n$/, '') + '</code></pre>');
      return '\u0000' + (blocks.length - 1) + '\u0000';
    });
    const lines = t.split('\n');
    let html = '', list = null;
    const closeList = () => { if (list) { html += '</' + list + '>'; list = null; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      let m;
      if ((m = line.match(/^\u0000(\d+)\u0000$/))) { closeList(); html += blocks[+m[1]]; continue; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { closeList(); html += `<h4>${inline(m[2])}</h4>`; continue; }
      if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
        if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
        html += `<li>${inline(m[1])}</li>`; continue;
      }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
        html += `<li>${inline(m[1])}</li>`; continue;
      }
      closeList();
      if (!line.trim()) { html += '<div class="ch-gap"></div>'; continue; }
      html += `<p>${inline(line)}</p>`;
    }
    closeList();
    return html.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i]);
  }

  /* ---------- CSS ---------- */
  function injectCss() {
    if (document.getElementById('chatCss')) return;
    const st = document.createElement('style');
    st.id = 'chatCss';
    st.textContent = `
.ch-wrap{display:flex;flex-direction:column;height:calc(100vh - 200px);min-height:440px;max-width:900px;margin:0 auto;background:#fff;border:1.5px solid var(--line,#e2e8f0);border-radius:16px;overflow:hidden}
.ch-bar{display:flex;gap:8px;align-items:center;padding:10px 12px;border-bottom:1.5px solid var(--line,#e2e8f0);flex-wrap:wrap}
.ch-bar .ch-model{margin-left:auto;font-size:12px;color:#64748b;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50%}
.ch-btn{padding:7px 12px;border-radius:9px;border:1.5px solid var(--line,#e2e8f0);background:#fff;color:#475569;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.ch-btn:hover{background:#f0f6ff;color:var(--blue-deep,#1e40af)}
.ch-settings{padding:12px;border-bottom:1.5px solid var(--line,#e2e8f0);background:#f8fafc;display:none;gap:10px;grid-template-columns:1fr 1fr}
.ch-settings.open{display:grid}
.ch-settings label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:#64748b}
.ch-settings .full{grid-column:1/-1}
.ch-settings input,.ch-settings select,.ch-settings textarea{padding:8px 10px;border:1.5px solid var(--line,#e2e8f0);border-radius:9px;font-family:inherit;font-size:13px;background:#fff;color:#0f172a;width:100%;box-sizing:border-box}
.ch-settings textarea{resize:vertical;min-height:60px}
.ch-settings .ch-hint{font-size:11.5px;font-weight:500;color:#94a3b8}
.ch-msgs{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth}
.ch-empty{margin:auto;text-align:center;color:#64748b;max-width:460px}
.ch-empty .ch-big{font-size:44px}
.ch-empty h3{margin:6px 0 4px;color:#0f172a;font-size:18px}
.ch-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:14px}
.ch-chip{padding:8px 12px;border-radius:99px;border:1.5px solid var(--line,#e2e8f0);background:#fff;font-family:inherit;font-size:12.5px;font-weight:600;color:#475569;cursor:pointer}
.ch-chip:hover{background:#f0f6ff;color:var(--blue-deep,#1e40af);border-color:var(--blue-2,#3b82f6)}
.ch-row{display:flex;gap:8px;align-items:flex-start}
.ch-row.user{flex-direction:row-reverse}
.ch-av{width:30px;height:30px;border-radius:50%;flex:none;display:grid;place-items:center;font-size:16px;background:#e0ecff}
.ch-row.user .ch-av{background:#dcfce7}
.ch-bub{max-width:82%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.55;word-wrap:break-word;overflow-wrap:anywhere;background:#f1f5f9;color:#0f172a;position:relative}
.ch-row.user .ch-bub{background:linear-gradient(135deg,var(--blue-2,#3b82f6),var(--blue,#2563eb));color:#fff;white-space:pre-wrap}
.ch-bub.err{background:#fef2f2;color:#b91c1c;border:1.5px solid #fecaca}
.ch-bub p{margin:0 0 2px}
.ch-bub .ch-gap{height:6px}
.ch-bub h4{margin:8px 0 4px;font-size:14.5px}
.ch-bub ul,.ch-bub ol{margin:4px 0 4px 20px;padding:0}
.ch-bub code{background:rgba(100,116,139,.18);padding:1px 5px;border-radius:5px;font-family:Consolas,Menlo,monospace;font-size:12.5px}
.ch-bub pre{background:#0f172a;color:#e2e8f0;padding:10px 12px;border-radius:10px;overflow-x:auto;margin:6px 0}
.ch-bub pre code{background:none;padding:0;color:inherit}
.ch-copy{display:block;margin-top:6px;border:none;background:none;color:#94a3b8;font-size:11.5px;font-weight:700;cursor:pointer;padding:0;font-family:inherit}
.ch-copy:hover{color:var(--blue,#2563eb)}
.ch-dots span{display:inline-block;width:6px;height:6px;border-radius:50%;background:#94a3b8;margin:0 2px;animation:chDot 1s infinite}
.ch-dots span:nth-child(2){animation-delay:.15s}.ch-dots span:nth-child(3){animation-delay:.3s}
@keyframes chDot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.ch-input{display:flex;gap:8px;padding:10px 12px;border-top:1.5px solid var(--line,#e2e8f0);align-items:flex-end}
.ch-input textarea{flex:1;resize:none;max-height:140px;padding:10px 12px;border:1.5px solid var(--line,#e2e8f0);border-radius:12px;font-family:inherit;font-size:14px;line-height:1.4;background:#fff;color:#0f172a;outline:none}
.ch-input textarea:focus{border-color:var(--blue-2,#3b82f6)}
.ch-send{padding:10px 16px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--blue-2,#3b82f6),var(--blue,#2563eb));color:#fff;font-family:inherit;font-weight:800;font-size:13.5px;cursor:pointer;white-space:nowrap}
.ch-send.stop{background:linear-gradient(135deg,#f87171,#dc2626)}
@media (max-width:820px){.ch-wrap{height:calc(100vh - 170px)}.ch-settings{grid-template-columns:1fr}.ch-bub{max-width:90%}}
body.dark .ch-wrap{background:#0f172a;border-color:#293548}
body.dark .ch-bar,body.dark .ch-input{border-color:#293548}
body.dark .ch-btn,body.dark .ch-chip{background:#0b1220;border-color:#293548;color:#cbd5e1}
body.dark .ch-btn:hover,body.dark .ch-chip:hover{background:#111c30;color:#93c5fd}
body.dark .ch-settings{background:#0b1220;border-color:#293548}
body.dark .ch-settings input,body.dark .ch-settings select,body.dark .ch-settings textarea,body.dark .ch-input textarea{background:#0b1220;border-color:#293548;color:#e2e8f0}
body.dark .ch-empty h3{color:#e2e8f0}
body.dark .ch-bub{background:#1e293b;color:#e2e8f0}
body.dark .ch-row.user .ch-bub{color:#fff}
body.dark .ch-bub.err{background:#450a0a;color:#fca5a5;border-color:#7f1d1d}
body.dark .ch-av{background:#1e3a5f}
body.dark .ch-row.user .ch-av{background:#14532d}`;
    document.head.appendChild(st);
  }

  /* ---------- gọi API (streaming) ---------- */
  function currentConn() {
    const p = PROVIDERS[cfg.provider];
    return {
      kind: p.kind,
      base: (cfg.bases[cfg.provider] || p.base || '').replace(/\/+$/, ''),
      model: (cfg.models[cfg.provider] || p.model || '').trim(),
      key: (cfg.keys[cfg.provider] || '').trim()
    };
  }

  async function streamReply(history, onDelta, signal) {
    const c = currentConn();
    if (!c.base) throw new Error('Chưa nhập Base URL. Mở ⚙️ Cài đặt AI để điền.');
    if (!c.model) throw new Error('Chưa nhập tên model. Mở ⚙️ Cài đặt AI để điền.');
    if (!c.key && cfg.provider !== 'custom' && !PROVIDERS[cfg.provider].nokey) throw new Error('Chưa có API key. Mở ⚙️ Cài đặt AI và dán key vào nhé.');

    let url, headers, body;
    const ctx = history.slice(-MAX_CONTEXT).map(m => ({ role: m.role, content: m.content }));
    if (c.kind === 'anthropic') {
      url = c.base + '/messages';
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': c.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      };
      body = { model: c.model, max_tokens: 2048, stream: true, system: cfg.system, messages: ctx };
    } else {
      url = c.base + '/chat/completions';
      headers = { 'Content-Type': 'application/json' };
      if (c.key) headers['Authorization'] = 'Bearer ' + c.key;
      body = { model: c.model, stream: true, messages: [{ role: 'system', content: cfg.system }].concat(ctx) };
    }

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json();
        detail = (j.error && (j.error.message || j.error)) || j.message || JSON.stringify(j);
        if (Array.isArray(j) && j[0] && j[0].error) detail = j[0].error.message;
      } catch (_) {}
      if (res.status === 401 || res.status === 403) detail = 'API key không hợp lệ hoặc không có quyền. ' + (detail || '');
      if (res.status === 429) detail = 'Đã vượt giới hạn gọi API (429), thử lại sau ít phút. ' + (detail || '');
      throw new Error(`Lỗi ${res.status}: ${String(detail).slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          let piece = '';
          if (c.kind === 'anthropic') {
            if (j.type === 'content_block_delta' && j.delta && j.delta.text) piece = j.delta.text;
            else if (j.type === 'error') throw new Error((j.error && j.error.message) || 'Lỗi từ Anthropic');
          } else if (j.choices && j.choices[0] && j.choices[0].delta) {
            piece = j.choices[0].delta.content || '';
          }
          if (piece) { full += piece; onDelta(full); }
        } catch (e) { if (e instanceof SyntaxError) continue; throw e; }
      }
    }
    if (!full) throw new Error('AI không trả về nội dung. Kiểm tra lại model hoặc thử câu hỏi khác.');
    return full;
  }

  /* ---------- UI ---------- */
  function render(mount) {
    injectCss();
    if (controller) { try { controller.abort(); } catch (_) {} controller = null; }
    busy = false;

    mount.innerHTML = `
      <div class="ch-wrap">
        <div class="ch-bar">
          <button class="ch-btn" id="chNew">🗑️ Cuộc trò chuyện mới</button>
          <button class="ch-btn" id="chSet">⚙️ Cài đặt AI</button>
          <span class="ch-model" id="chModel"></span>
        </div>
        <div class="ch-settings" id="chSettings">
          <label>Nhà cung cấp
            <select id="chProv">${Object.keys(PROVIDERS).map(k => `<option value="${k}">${esc(PROVIDERS[k].label)}</option>`).join('')}</select>
          </label>
          <label>Model <input id="chModelIn" type="text" autocomplete="off" spellcheck="false"></label>
          <label class="full" id="chBaseWrap">Base URL <input id="chBaseIn" type="text" autocomplete="off" spellcheck="false"></label>
          <label class="full" id="chKeyWrap">API key <input id="chKey" type="password" autocomplete="off" placeholder="Dán API key vào đây">
            <span class="ch-hint" id="chHint"></span>
          </label>
          <label class="full">Chỉ dẫn hệ thống (tuỳ chọn) <textarea id="chSys"></textarea></label>
          <div class="full ch-hint">🔒 Key chỉ lưu trong trình duyệt của bạn (localStorage) và gửi thẳng tới nhà cung cấp, không qua server nào khác. Không dùng trên máy công cộng.</div>
          <div class="full"><button class="ch-btn" id="chSave">💾 Lưu cài đặt</button></div>
        </div>
        <div class="ch-msgs" id="chMsgs"></div>
        <div class="ch-input">
          <textarea id="chText" rows="1" placeholder="Hỏi AI bất cứ điều gì… (Enter để gửi, Shift+Enter xuống dòng)"></textarea>
          <button class="ch-send" id="chSend">Gửi ➤</button>
        </div>
      </div>`;

    const $ = id => mount.querySelector('#' + id);
    const box = $('chMsgs'), text = $('chText'), sendBtn = $('chSend');
    const settings = $('chSettings'), prov = $('chProv');

    function refreshModelLabel() {
      const c = currentConn();
      $('chModel').textContent = c.key || cfg.provider === 'custom' || PROVIDERS[cfg.provider].nokey ? `${PROVIDERS[cfg.provider].label} · ${c.model || '—'}` : '⚠️ Chưa có API key';
    }
    function fillSettings() {
      const p = PROVIDERS[prov.value];
      $('chModelIn').value = cfg.models[prov.value] || p.model;
      $('chBaseIn').value = cfg.bases[prov.value] || p.base;
      $('chBaseWrap').style.display = (prov.value === 'custom') ? '' : 'none';
      $('chKey').value = cfg.keys[prov.value] || '';
      $('chHint').textContent = p.hint;
      $('chKeyWrap').style.display = p.nokey ? 'none' : '';
    }
    prov.value = cfg.provider;
    fillSettings();
    $('chSys').value = cfg.system;
    refreshModelLabel();
    if (!currentConn().key && cfg.provider !== 'custom' && !PROVIDERS[cfg.provider].nokey) settings.classList.add('open');

    prov.addEventListener('change', fillSettings);
    $('chSet').addEventListener('click', () => settings.classList.toggle('open'));
    $('chSave').addEventListener('click', () => {
      const k = prov.value;
      cfg.provider = k;
      cfg.keys[k] = $('chKey').value.trim();
      cfg.models[k] = $('chModelIn').value.trim() || PROVIDERS[k].model;
      cfg.bases[k] = $('chBaseIn').value.trim() || PROVIDERS[k].base;
      cfg.system = $('chSys').value.trim() || DEFAULT_SYSTEM;
      saveCfg();
      refreshModelLabel();
      settings.classList.remove('open');
      if (window.App && App.toast) App.toast('💾 Đã lưu cài đặt AI');
    });

    function scrollBottom() { box.scrollTop = box.scrollHeight; }

    function addRow(role, content, opts) {
      opts = opts || {};
      const row = document.createElement('div');
      row.className = 'ch-row ' + role;
      row.innerHTML = `<div class="ch-av">${role === 'user' ? '🧑' : '🤖'}</div><div class="ch-bub${opts.err ? ' err' : ''}"></div>`;
      const bub = row.querySelector('.ch-bub');
      if (role === 'user') bub.textContent = content;
      else if (opts.err) bub.textContent = content;
      else bub.innerHTML = content ? md(content) : '<span class="ch-dots"><span></span><span></span><span></span></span>';
      if (role === 'assistant' && !opts.err && content) addCopy(bub, content);
      box.appendChild(row);
      scrollBottom();
      return bub;
    }
    function addCopy(bub, content) {
      const b = document.createElement('button');
      b.className = 'ch-copy';
      b.textContent = '📋 Sao chép';
      b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(content); b.textContent = '✓ Đã chép'; }
        catch (_) { b.textContent = 'Không chép được'; }
        setTimeout(() => (b.textContent = '📋 Sao chép'), 1500);
      });
      bub.appendChild(b);
    }

    function renderAll() {
      box.innerHTML = '';
      if (!msgs.length) {
        box.innerHTML = `
          <div class="ch-empty">
            <div class="ch-big">🤖</div>
            <h3>Trò chuyện với AI</h3>
            <div>Hỏi bài, nhờ giải thích khái niệm, dịch, tóm tắt, lên kế hoạch ôn thi…</div>
            <div class="ch-chips">${SUGGESTS.map(s => `<button class="ch-chip">${esc(s)}</button>`).join('')}</div>
          </div>`;
        box.querySelectorAll('.ch-chip').forEach(b => b.addEventListener('click', () => { text.value = b.textContent; send(); }));
        return;
      }
      msgs.forEach(m => addRow(m.role, m.content));
    }

    function setBusy(v) {
      busy = v;
      sendBtn.textContent = v ? '■ Dừng' : 'Gửi ➤';
      sendBtn.classList.toggle('stop', v);
    }

    async function send() {
      if (busy) return;
      const q = text.value.trim();
      if (!q) return;
      if (!msgs.length) box.innerHTML = '';
      text.value = ''; autoGrow();
      msgs.push({ role: 'user', content: q });
      saveHis();
      const userBub = addRow('user', q);
      const bub = addRow('assistant', '');
      setBusy(true);
      controller = new AbortController();
      let partial = '';
      try {
        const full = await streamReply(msgs, t => { partial = t; bub.innerHTML = md(t); scrollBottom(); }, controller.signal);
        msgs.push({ role: 'assistant', content: full });
        saveHis();
        bub.innerHTML = md(full);
        addCopy(bub, full);
      } catch (e) {
        if (e.name === 'AbortError') {
          if (partial) {
            msgs.push({ role: 'assistant', content: partial });
            saveHis();
            bub.innerHTML = md(partial);
            addCopy(bub, partial);
          } else bub.closest('.ch-row').remove();
        } else {
          const msg = (e instanceof TypeError)
            ? 'Không kết nối được tới API (mất mạng, sai Base URL, hoặc nhà cung cấp chặn gọi từ trình duyệt/CORS).'
            : e.message;
          bub.classList.add('err');
          bub.textContent = '⚠️ ' + msg;
          msgs.pop(); /* bỏ câu hỏi lỗi khỏi lịch sử để không lệch lượt user/assistant */
          saveHis();
          userBub.closest('.ch-row').remove();
          text.value = q; autoGrow();
        }
      } finally {
        controller = null;
        setBusy(false);
        scrollBottom();
      }
    }

    function autoGrow() {
      text.style.height = 'auto';
      text.style.height = Math.min(text.scrollHeight, 140) + 'px';
    }

    sendBtn.addEventListener('click', () => { if (busy && controller) controller.abort(); else send(); });
    text.addEventListener('input', autoGrow);
    text.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    });
    $('chNew').addEventListener('click', () => {
      if (busy && controller) controller.abort();
      if (msgs.length && !confirm('Xoá cuộc trò chuyện hiện tại và bắt đầu cuộc mới?')) return;
      msgs = []; saveHis(); renderAll();
    });

    renderAll();
    setTimeout(() => text.focus(), 50);
  }

  window.Features['chat'] = {
    title: 'Trò chuyện với AI',
    icon: '🤖',
    desc: 'Hỏi bài, giải thích, tóm tắt cùng trợ lý AI.',
    render
  };
})();
