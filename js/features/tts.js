/* Feature module: Đọc văn bản (TTS)
   Dùng Web Speech API (speechSynthesis) — chạy offline, không cần server. */
(function () {
  'use strict';
  window.Features = window.Features || {};

  const KEY = 'hoctrohoctap_tts';
  const MAX_CHARS = 50000;
  const MAX_CHUNK = 180;            // Chrome hay tự ngắt utterance dài → chia nhỏ
  const synth = window.speechSynthesis || null;

  /* ---------- state ---------- */
  const st = {
    chunks: [],          // [{ text, para }]
    idx: 0,
    status: 'idle',      // idle | playing | paused
    token: 0,            // chống event cũ sau khi cancel
    total: 0,            // tổng ký tự
    dirty: false,        // đổi cài đặt lúc đang pause
    voices: [],
    ui: null             // tham chiếu DOM của lần render hiện tại
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(msg) { if (window.App && window.App.toast) window.App.toast(msg); }

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; }
  }
  function savePrefs(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (_) {}
  }

  /* ---------- tách câu ---------- */
  function splitLong(s) {
    const out = [];
    while (s.length > MAX_CHUNK) {
      let cut = -1;
      const win = s.slice(0, MAX_CHUNK);
      const m = Math.max(win.lastIndexOf(', '), win.lastIndexOf('; '), win.lastIndexOf(': '));
      cut = m > 40 ? m + 2 : win.lastIndexOf(' ') + 1;
      if (cut <= 0) cut = MAX_CHUNK;
      out.push(s.slice(0, cut));
      s = s.slice(cut);
    }
    if (s) out.push(s);
    return out;
  }

  function buildChunks(text) {
    const chunks = [];
    text.split(/\n+/).forEach((para, p) => {
      if (!para.trim()) return;
      const sentences = para.match(/[\s\S]+?(?:[.!?…]+["'”’)\]]*(?=\s|$)|$)\s*/g) || [para];
      sentences.forEach(s => {
        if (!s.trim()) return;
        splitLong(s).forEach(part => { if (part.trim()) chunks.push({ text: part, para: p }); });
      });
    });
    return chunks;
  }

  /* ---------- voices ---------- */
  function refreshVoices() {
    st.voices = synth ? synth.getVoices() : [];
    const ui = st.ui;
    if (!ui) return;
    const prefs = loadPrefs();
    const vi = st.voices.filter(v => /^vi/i.test(v.lang));
    const other = st.voices.filter(v => !/^vi/i.test(v.lang));
    const opt = v => `<option value="${escapeHtml(v.voiceURI)}">${escapeHtml(v.name)} (${escapeHtml(v.lang)})</option>`;
    let html = '';
    if (vi.length) html += `<optgroup label="Tiếng Việt">${vi.map(opt).join('')}</optgroup>`;
    if (other.length) html += `<optgroup label="Ngôn ngữ khác">${other.map(opt).join('')}</optgroup>`;
    if (!html) html = '<option value="">Giọng mặc định của trình duyệt</option>';
    ui.voice.innerHTML = html;

    const want = prefs.voice;
    if (want && st.voices.some(v => v.voiceURI === want)) ui.voice.value = want;
    else if (vi.length) ui.voice.value = vi[0].voiceURI;

    ui.viWarn.style.display = (st.voices.length && !vi.length) ? 'block' : 'none';
  }

  function getVoice() {
    const uri = st.ui && st.ui.voice.value;
    return st.voices.find(v => v.voiceURI === uri) || null;
  }

  /* ---------- hiển thị đọc theo ---------- */
  function renderReader() {
    const ui = st.ui;
    let html = '', curPara = -1;
    st.chunks.forEach((c, i) => {
      if (c.para !== curPara) {
        if (curPara !== -1) html += '</p>';
        html += '<p>';
        curPara = c.para;
      }
      html += `<span class="tts-s" data-i="${i}">${escapeHtml(c.text)}</span>`;
    });
    if (curPara !== -1) html += '</p>';
    ui.reader.innerHTML = html;
  }

  function spanOf(i) { return st.ui && st.ui.reader.querySelector(`.tts-s[data-i="${i}"]`); }

  function highlight(i) {
    const ui = st.ui;
    if (!ui) return;
    const prev = ui.reader.querySelector('.tts-s.cur');
    if (prev) { prev.classList.remove('cur'); prev.textContent = st.chunks[+prev.dataset.i].text; }
    const el = spanOf(i);
    if (!el) return;
    el.classList.add('cur');
    const r = ui.reader, er = el.getBoundingClientRect(), rr = r.getBoundingClientRect();
    if (er.top < rr.top + 20 || er.bottom > rr.bottom - 20) {
      r.scrollTo({ top: r.scrollTop + (er.top - rr.top) - r.clientHeight / 3, behavior: 'smooth' });
    }
    updateProgress();
  }

  function markWord(i, charIndex, lead) {
    const el = spanOf(i);
    if (!el) return;
    const text = st.chunks[i].text;
    const pos = Math.min(text.length, charIndex + lead);
    const m = /^\S+/.exec(text.slice(pos));
    if (!m) return;
    el.innerHTML = escapeHtml(text.slice(0, pos)) +
      '<mark class="tts-word">' + escapeHtml(m[0]) + '</mark>' +
      escapeHtml(text.slice(pos + m[0].length));
  }

  function updateProgress() {
    const ui = st.ui;
    if (!ui) return;
    let done = 0;
    for (let i = 0; i < st.idx; i++) done += st.chunks[i].text.length;
    const pct = st.total ? Math.min(100, Math.round(done / st.total * 100)) : 0;
    ui.fill.style.width = (st.status === 'idle' ? 0 : pct) + '%';
    ui.progText.textContent = st.status === 'idle'
      ? ''
      : `Câu ${Math.min(st.idx + 1, st.chunks.length)}/${st.chunks.length} • ${pct}%`;
  }

  function setStatus(s) {
    st.status = s;
    const ui = st.ui;
    if (!ui) return;
    const active = s !== 'idle';
    ui.editor.style.display = active ? 'none' : '';
    ui.readerBox.style.display = active ? '' : 'none';
    ui.playBtn.textContent = s === 'playing' ? '⏸️ Tạm dừng' : (s === 'paused' ? '▶️ Tiếp tục' : '▶️ Đọc');
    ui.stopBtn.disabled = !active;
    ui.prevBtn.disabled = !active;
    ui.nextBtn.disabled = !active;
    ui.wave.classList.toggle('on', s === 'playing');
    updateProgress();
  }

  /* ---------- điều khiển đọc ---------- */
  function speakChunk(i) {
    if (!synth) return;
    if (i < 0) i = 0;
    if (i >= st.chunks.length) { finish(); return; }
    st.idx = i;
    st.dirty = false;
    const my = ++st.token;
    const raw = st.chunks[i].text;
    const lead = raw.length - raw.trimStart().length;
    const u = new SpeechSynthesisUtterance(raw.trim());
    const v = getVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'vi-VN'; }
    const ui = st.ui;
    u.rate = parseFloat(ui.rate.value);
    u.pitch = parseFloat(ui.pitch.value);
    u.volume = parseFloat(ui.volume.value);
    u.onboundary = e => {
      if (my !== st.token) return;
      if (e.name && e.name !== 'word') return;
      markWord(i, e.charIndex, lead);
    };
    u.onend = () => { if (my === st.token) speakChunk(i + 1); };
    u.onerror = e => {
      if (my !== st.token) return;
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      toast('⚠️ Không đọc được: ' + (e.error || 'lỗi giọng đọc'));
      stop();
    };
    highlight(i);
    if (synth.speaking || synth.pending || synth.paused) {
      synth.cancel();
      setTimeout(() => { if (my === st.token) synth.speak(u); }, 60);
    } else {
      synth.speak(u);
    }
  }

  function finish() {
    st.token++;
    st.idx = 0;
    setStatus('idle');
    toast('✅ Đã đọc xong');
  }

  function stop() {
    st.token++;
    if (synth) synth.cancel();
    st.idx = 0;
    setStatus('idle');
  }

  function start() {
    if (!synth) { toast('Trình duyệt không hỗ trợ đọc văn bản'); return; }
    const ui = st.ui;
    let text = ui.text.value;
    const a = ui.text.selectionStart, b = ui.text.selectionEnd;
    if (b > a && text.slice(a, b).trim()) text = text.slice(a, b);   // chỉ đọc phần bôi chọn
    text = text.trim();
    if (!text) { toast('Hãy nhập hoặc dán văn bản trước'); ui.text.focus(); return; }
    st.chunks = buildChunks(text);
    if (!st.chunks.length) { toast('Không có nội dung để đọc'); return; }
    st.total = st.chunks.reduce((n, c) => n + c.text.length, 0);
    renderReader();
    setStatus('playing');
    speakChunk(0);
  }

  function togglePlay() {
    if (st.status === 'idle') return start();
    if (st.status === 'playing') {
      synth.pause();
      setStatus('paused');
    } else {
      setStatus('playing');
      if (st.dirty) speakChunk(st.idx); else synth.resume();
    }
  }

  function jump(delta) {
    if (st.status === 'idle') return;
    const n = Math.max(0, Math.min(st.chunks.length - 1, st.idx + delta));
    setStatus('playing');
    speakChunk(n);
  }

  /* dừng khi rời trang TTS hoặc đóng tab */
  window.addEventListener('hashchange', () => {
    if (!/^#\/tts/.test(location.hash) && st.status !== 'idle') stop();
  });
  window.addEventListener('beforeunload', () => { if (synth) synth.cancel(); });

  /* ---------- render ---------- */
  function render(mount) {
    if (st.status !== 'idle') stop();
    const prefs = loadPrefs();
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

    mount.innerHTML = `
      <div class="tts-wrap">
        <div class="tts-card">
          <div id="ttsEditor">
            <div class="tts-toolbar">
              <label class="tts-tool" for="ttsFile" title="Mở file .txt / .md">📂 Mở file
                <input type="file" id="ttsFile" accept=".txt,.md,.markdown,.log,.csv,text/plain" hidden>
              </label>
              <button class="tts-tool" id="ttsPaste" type="button">📋 Dán</button>
              <button class="tts-tool danger" id="ttsClear" type="button">🗑️ Xoá</button>
              <span class="tts-count" id="ttsCount">0 ký tự</span>
            </div>
            <textarea id="ttsText" class="tts-text" maxlength="${MAX_CHARS}" spellcheck="false"
              placeholder="Nhập hoặc dán văn bản cần nghe…&#10;&#10;Mẹo: bôi đen một đoạn rồi bấm Đọc để chỉ nghe đoạn đó."></textarea>
          </div>

          <div id="ttsReaderBox" class="tts-reader-box" style="display:none">
            <div class="tts-reader" id="ttsReader"></div>
          </div>

          <div class="tts-progress">
            <div class="tts-progress-bar"><div class="tts-progress-fill" id="ttsFill"></div></div>
            <div class="tts-progress-text" id="ttsProgText"></div>
          </div>

          <div class="tts-controls">
            <div class="tts-wave" id="ttsWave"><i></i><i></i><i></i><i></i><i></i></div>
            <button class="tts-ctl" id="ttsPrev" type="button" title="Câu trước" disabled>⏮️</button>
            <button class="tts-play" id="ttsPlay" type="button">▶️ Đọc</button>
            <button class="tts-ctl" id="ttsNext" type="button" title="Câu sau" disabled>⏭️</button>
            <button class="tts-ctl" id="ttsStop" type="button" title="Dừng" disabled>⏹️</button>
          </div>
        </div>

        <div class="tts-card tts-settings">
          <div class="tts-field tts-field-wide">
            <label for="ttsVoice">Giọng đọc</label>
            <select id="ttsVoice"><option value="">Đang tải giọng đọc…</option></select>
            <div class="tts-warn" id="ttsViWarn" style="display:none">
              ⚠️ Máy chưa có giọng tiếng Việt. Trên Windows: Cài đặt → Thời gian &amp; ngôn ngữ → Giọng nói → thêm giọng Tiếng Việt. Chrome/Edge trên Android và Safari thường có sẵn.
            </div>
          </div>
          <div class="tts-field">
            <label for="ttsRate">Tốc độ <b id="ttsRateVal"></b></label>
            <input type="range" id="ttsRate" min="0.5" max="2" step="0.1">
          </div>
          <div class="tts-field">
            <label for="ttsPitch">Cao độ <b id="ttsPitchVal"></b></label>
            <input type="range" id="ttsPitch" min="0" max="2" step="0.1">
          </div>
          <div class="tts-field">
            <label for="ttsVolume">Âm lượng <b id="ttsVolumeVal"></b></label>
            <input type="range" id="ttsVolume" min="0" max="1" step="0.05">
          </div>
        </div>
      </div>`;

    const $ = id => mount.querySelector('#' + id);
    const ui = st.ui = {
      editor: $('ttsEditor'), text: $('ttsText'), count: $('ttsCount'),
      readerBox: $('ttsReaderBox'), reader: $('ttsReader'),
      fill: $('ttsFill'), progText: $('ttsProgText'),
      playBtn: $('ttsPlay'), stopBtn: $('ttsStop'), prevBtn: $('ttsPrev'), nextBtn: $('ttsNext'),
      wave: $('ttsWave'), voice: $('ttsVoice'), viWarn: $('ttsViWarn'),
      rate: $('ttsRate'), pitch: $('ttsPitch'), volume: $('ttsVolume')
    };

    ui.text.value = typeof prefs.text === 'string' ? prefs.text : '';
    ui.rate.value = num(prefs.rate, 1);
    ui.pitch.value = num(prefs.pitch, 1);
    ui.volume.value = num(prefs.volume, 1);

    function persist() {
      savePrefs({
        text: ui.text.value, voice: ui.voice.value,
        rate: parseFloat(ui.rate.value), pitch: parseFloat(ui.pitch.value), volume: parseFloat(ui.volume.value)
      });
    }
    function updateLabels() {
      $('ttsRateVal').textContent = parseFloat(ui.rate.value).toFixed(1) + '×';
      $('ttsPitchVal').textContent = parseFloat(ui.pitch.value).toFixed(1);
      $('ttsVolumeVal').textContent = Math.round(parseFloat(ui.volume.value) * 100) + '%';
    }
    function updateCount() {
      const n = ui.text.value.length;
      ui.count.textContent = n.toLocaleString('vi-VN') + ' ký tự';
    }

    ui.text.addEventListener('input', () => { updateCount(); persist(); });

    [ui.rate, ui.pitch, ui.volume].forEach(el => {
      el.addEventListener('input', () => { updateLabels(); persist(); });
      el.addEventListener('change', () => {          // áp dụng ngay khi thả thanh trượt
        if (st.status === 'playing') speakChunk(st.idx);
        else if (st.status === 'paused') st.dirty = true;
      });
    });
    ui.voice.addEventListener('change', () => {
      persist();
      if (st.status === 'playing') speakChunk(st.idx);
      else if (st.status === 'paused') st.dirty = true;
    });

    ui.playBtn.addEventListener('click', togglePlay);
    ui.stopBtn.addEventListener('click', stop);
    ui.prevBtn.addEventListener('click', () => jump(-1));
    ui.nextBtn.addEventListener('click', () => jump(1));

    /* bấm vào câu để đọc từ câu đó */
    ui.reader.addEventListener('click', e => {
      const s = e.target.closest('.tts-s');
      if (!s || st.status === 'idle') return;
      setStatus('playing');
      speakChunk(+s.dataset.i);
    });

    $('ttsClear').addEventListener('click', () => {
      if (ui.text.value && !confirm('Xoá toàn bộ văn bản?')) return;
      ui.text.value = '';
      updateCount(); persist(); ui.text.focus();
    });

    $('ttsPaste').addEventListener('click', async () => {
      try {
        const t = await navigator.clipboard.readText();
        if (!t) { toast('Clipboard đang trống'); return; }
        ui.text.value = t.slice(0, MAX_CHARS);
        updateCount(); persist();
      } catch (_) {
        toast('Không đọc được clipboard — hãy dán bằng Ctrl+V');
        ui.text.focus();
      }
    });

    $('ttsFile').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) { toast('File quá lớn (tối đa 2 MB)'); return; }
      const r = new FileReader();
      r.onload = () => {
        ui.text.value = String(r.result).slice(0, MAX_CHARS);
        updateCount(); persist();
        toast('📂 Đã mở ' + f.name);
      };
      r.onerror = () => toast('Không đọc được file');
      r.readAsText(f, 'UTF-8');
    });

    updateLabels();
    updateCount();
    setStatus('idle');

    if (!synth) {
      ui.voice.innerHTML = '<option value="">Không hỗ trợ</option>';
      ui.playBtn.disabled = true;
      toast('Trình duyệt này không hỗ trợ đọc văn bản');
      return;
    }
    refreshVoices();
    if (!st.voicesBound) {
      st.voicesBound = true;
      synth.addEventListener('voiceschanged', refreshVoices);
    }
    /* một số trình duyệt nạp giọng trễ */
    setTimeout(refreshVoices, 400);
  }

  window.Features['tts'] = {
    title: 'Đọc văn bản (TTS)',
    icon: '🔊',
    desc: 'Nghe đọc to đoạn văn bản.',
    render
  };
})();
