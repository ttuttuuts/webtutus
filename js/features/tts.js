/* Feature module: Đọc văn bản (TTS)
   2 nguồn giọng:
   1) Giọng hệ thống qua Web Speech API (speechSynthesis).
   2) Giọng tiếng Việt (Piper/VITS chạy ngay trong trình duyệt, tải model 1 lần rồi dùng offline). */
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
    audio: null,         // <audio> đang phát (giọng AI)
    ui: null             // tham chiếu DOM của lần render hiện tại
  };

  /* ---------- Giọng tiếng Việt (Piper) ---------- */
  const PIPER_VER = '1.0.3';
  const PIPER_VOICES = [
    { id: 'piper:vais1000', voice: 'vi_VN-vais1000-medium', sid: 0, label: 'Tiếng Việt (giọng AI)' }
  ];
  const piperOf = id => PIPER_VOICES.find(v => v.id === id) || null;

  /* Tự chạy Piper: onnxruntime-web (UMD, qua <script>) + piper_phonemize (wasm) + model từ HuggingFace.
     Không dùng bundler nên không phụ thuộc esm.sh. */
  const ORT_BASE   = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';
  const PHON_JS    = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@' + PIPER_VER + '/dist/piper-DeOu3H9E.js';
  const PHON_WASM  = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
  const HF_BASE    = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/vi/vi_VN/';
  const MODEL_PATH = {
    'vi_VN-vais1000-medium':    'vais1000/medium/',
    'vi_VN-25hours_single-low': '25hours_single/low/',
    'vi_VN-vivos-x_low':        'vivos/x_low/'
  };

  let ortReady = null, phonReady = null;
  const sessions = {};                       // voice -> Promise<{session, cfg}>

  function loadOrt() {
    if (window.ort) return Promise.resolve(window.ort);
    if (!ortReady) {
      ortReady = new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = ORT_BASE + 'ort.min.js';
        sc.onload = () => {
          const o = window.ort;
          o.env.wasm.wasmPaths = ORT_BASE;
          o.env.wasm.numThreads = 1;          // không cần SharedArrayBuffer
          o.env.wasm.proxy = false;
          res(o);
        };
        sc.onerror = () => rej(new Error('Không tải được onnxruntime-web'));
        document.head.appendChild(sc);
      }).catch(e => { ortReady = null; throw e; });
    }
    return ortReady;
  }
  function loadPhon() {
    if (!phonReady) phonReady = import(PHON_JS).catch(e => { phonReady = null; throw e; });
    return phonReady;
  }

  async function cachedFetch(url, onProg) {
    let cache = null;
    try { cache = await caches.open('hoctrohoctap-piper'); } catch (_) {}
    if (cache) {
      const hit = await cache.match(url);
      if (hit) return hit.blob();
    }
    const r = await fetch(url);
    if (!r.ok) throw new Error('Tải model lỗi (' + r.status + ')');
    const total = +(r.headers.get('Content-Length') || 0);
    const rd = r.body && r.body.getReader();
    const parts = []; let loaded = 0;
    if (rd) {
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        parts.push(value); loaded += value.length;
        if (onProg && total) onProg(loaded, total);
      }
    } else parts.push(new Uint8Array(await r.arrayBuffer()));
    const blob = new Blob(parts);
    if (cache) { try { await cache.put(url, new Response(blob)); } catch (_) {} }
    return blob;
  }

  function getSession(voice, onProg) {
    if (!sessions[voice]) {
      sessions[voice] = (async () => {
        const ort = await loadOrt();
        const base = HF_BASE + MODEL_PATH[voice] + voice + '.onnx';
        const cfg = JSON.parse(await (await cachedFetch(base + '.json')).text());
        const buf = await (await cachedFetch(base, onProg)).arrayBuffer();
        const session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
        return { session, cfg };
      })().catch(e => { delete sessions[voice]; throw e; });
    }
    return sessions[voice];
  }

  async function phonemize(text, espeakVoice) {
    const mod = await loadPhon();
    return new Promise(async (resolve, reject) => {
      let done = false;
      try {
        const inst = await mod.createPiperPhonemize({
          print: l => {
            if (done) return;
            try { const j = JSON.parse(l); done = true; resolve(j.phoneme_ids); } catch (_) {}
          },
          printErr: () => {},
          locateFile: f => f.endsWith('.wasm') ? PHON_WASM + '.wasm' : (f.endsWith('.data') ? PHON_WASM + '.data' : f)
        });
        try {
          inst.callMain(['-l', espeakVoice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
        } catch (_) {}
        if (!done) reject(new Error('Không phân tích được văn bản'));
      } catch (e) { reject(e); }
    });
  }

  function floatToWav(f32, rate) {
    const n = f32.length, v = new DataView(new ArrayBuffer(44 + n * 2));
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const x = Math.max(-1, Math.min(1, f32[i]));
      v.setInt16(44 + i * 2, x < 0 ? x * 32768 : x * 32767, true);
    }
    return new Blob([v], { type: 'audio/wav' });
  }

  async function piperPredict(pv, text, onProg) {
    const ort = await loadOrt();
    const { session, cfg } = await getSession(pv.voice, onProg);
    const ids = await phonemize(text, cfg.espeak.voice);
    const inf = cfg.inference || {};
    const feeds = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids, x => BigInt(x)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale ?? 0.667, (inf.length_scale ?? 1) * YOUNG, inf.noise_w ?? 0.8]), [3])
    };
    if ((cfg.num_speakers || 1) > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(pv.sid || 0)]), [1]);
    const out = await session.run(feeds);
    const data = out.output ? out.output.data : out[Object.keys(out)[0]].data;
    return floatToWav(data, (cfg.audio && cfg.audio.sample_rate) || 22050);
  }

  const wavCache = new Map();          // key -> Promise<objectURL>
  let synthQueue = Promise.resolve();  // tạo giọng lần lượt, không chạy song song
  function synthPiper(pv, text) {
    const key = pv.id + '|' + text;
    if (wavCache.has(key)) return wavCache.get(key);
    const job = synthQueue.then(async () => {
      const wav = await piperPredict(pv, text, (l, t) => {
        if (st.ui) st.ui.progText.textContent = 'Đang tải model giọng… ' + Math.round(l * 100 / t) + '% (chỉ lần đầu)';
      });
      return URL.createObjectURL(wav);
    });
    synthQueue = job.catch(() => {});
    job.catch(() => wavCache.delete(key));
    wavCache.set(key, job);
    return job;
  }
  function clearWavCache() {
    wavCache.forEach(p => p.then(u => URL.revokeObjectURL(u)).catch(() => {}));
    wavCache.clear();
  }
  const YOUNG = 1.1;   // giọng AI: nâng tông ~10% nhưng giữ nguyên tốc độ
  let actx = null;
  function brighten(a) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = actx || new AC();
      if (actx.state === 'suspended') actx.resume().catch(() => {});
      const src = actx.createMediaElementSource(a);
      const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90;           // bớt ù trầm
      const mid = actx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 2800; mid.Q.value = 0.9; mid.gain.value = 2.5;
      const air = actx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 6000; air.gain.value = 4;  // thêm độ trong
      src.connect(hp); hp.connect(mid); mid.connect(air); air.connect(actx.destination);
    } catch (_) {}
  }
  function stopAudio() {
    const a = st.audio;
    if (a) { a.onended = a.onerror = null; a.pause(); st.audio = null; }
  }

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

  function cleanText(t) {
    const d = document.createElement('textarea');
    for (let k = 0; k < 2 && /&[a-zA-Z#0-9]+;/.test(t); k++) { d.innerHTML = t; t = d.value; }
    return t.replace(/&ag\s*ave;/g, 'à').replace(/([.!?…])(["”“])(?=["“”A-ZÀ-Ỹ])/g, '$1$2 ')
            .replace(/([.!?…]["”]?)(?=[A-ZÀ-Ỹ])/g, '$1 ');
  }

  function buildChunks(text) {
    text = cleanText(text);
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
  function rankVoice(v) {
    const n = v.name || '';
    if (/HoaiMy/i.test(n)) return 0;                 // Edge: Microsoft HoaiMy Online (Natural) – trong, mượt
    if (/Natural|Neural|Online/i.test(n)) return 1;
    if (/Google/i.test(n)) return 2;
    return 3;
  }
  function refreshVoices() {
    st.voices = synth ? synth.getVoices() : [];
    const ui = st.ui;
    if (!ui) return;
    const prefs = loadPrefs();
    const vi = st.voices.filter(v => /^vi/i.test(v.lang)).sort((a, b) => rankVoice(a) - rankVoice(b));
    const opt = (v, i) => `<option value="${escapeHtml(v.voiceURI)}">${i === 0 ? '✨ ' : ''}${escapeHtml(v.name)}</option>`;
    let html = '';
    if (vi.length) html += `<optgroup label="Giọng hệ thống (tự nhiên nhất)">${vi.map(opt).join('')}</optgroup>`;
    html += `<optgroup label="Giọng AI offline">${PIPER_VOICES.map(v =>
      `<option value="${v.id}">${escapeHtml(v.label)}</option>`).join('')}</optgroup>`;
    ui.voice.innerHTML = html;
    ui.voice.disabled = false;
    const want = prefs.voice;
    if (want && (piperOf(want) || vi.some(v => v.voiceURI === want))) ui.voice.value = want;
    else if (vi.length && rankVoice(vi[0]) <= 2) ui.voice.value = vi[0].voiceURI;   // tự chọn giọng hay nhất
    else ui.voice.value = PIPER_VOICES[0].id;
    ui.viWarn.style.display = (!vi.length) ? 'block' : 'none';
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
    if (!synth && !piperOf(st.ui && st.ui.voice.value)) return;
    if (i < 0) i = 0;
    if (i >= st.chunks.length) { finish(); return; }
    st.idx = i;
    st.dirty = false;
    const my = ++st.token;
    stopAudio();
    const pv = piperOf(st.ui && st.ui.voice.value);
    if (pv) { if (synth) synth.cancel(); speakPiper(i, pv, my); return; }
    if (!synth) return;
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

  function speakPiper(i, pv, my) {
    const ui = st.ui;
    highlight(i);
    ui.progText.textContent = 'Đang tạo giọng…';
    synthPiper(pv, st.chunks[i].text.trim()).then(url => {
      if (my !== st.token) return;
      updateProgress();
      const a = new Audio(url);
      a.preservesPitch = false;
      a.playbackRate = parseFloat(ui.rate.value) * YOUNG;
      a.volume = parseFloat(ui.volume.value);
      a.onended = () => { if (my === st.token) speakChunk(i + 1); };
      a.onerror = () => { if (my !== st.token) return; toast('⚠️ Không phát được âm thanh'); stop(); };
      brighten(a);
      st.audio = a;
      if (st.status === 'playing') a.play().catch(() => {});
      /* tạo sẵn câu kế tiếp để đọc liền mạch */
      const nx = st.chunks[i + 1];
      if (nx) synthPiper(pv, nx.text.trim()).catch(() => {});
    }).catch(err => {
      if (my !== st.token) return;
      console.error(err);
      toast('⚠️ Giọng AI lỗi: ' + ((err && err.message) || err) + ' (cần Internet lần đầu)');
      stop();
    });
  }

  function finish() {
    st.token++;
    stopAudio(); clearWavCache();
    st.idx = 0;
    setStatus('idle');
    toast('✅ Đã đọc xong');
  }

  function stop() {
    st.token++;
    stopAudio(); clearWavCache();
    if (synth) synth.cancel();
    st.idx = 0;
    setStatus('idle');
  }

  function start() {
    const ui = st.ui;
        if (!synth && !piperOf(ui.voice.value)) { toast('Trình duyệt không hỗ trợ đọc văn bản'); return; }
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
      if (st.audio) st.audio.pause(); else if (synth) synth.pause();
      setStatus('paused');
    } else {
      setStatus('playing');
      if (st.dirty) speakChunk(st.idx);
      else if (st.audio) st.audio.play().catch(() => {});
      else if (piperOf(st.ui.voice.value)) { /* đang tạo giọng, sẽ tự phát khi xong */ }
      else synth.resume();
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
              ℹ️ Máy chưa có giọng hệ thống tiếng Việt nên đang dùng giọng AI offline. Giọng hay nhất: mở bằng Microsoft Edge để có "HoaiMy Online (Natural)" (miễn phí). Muốn thêm giọng hệ thống: trên Windows: Cài đặt → Thời gian &amp; ngôn ngữ → Giọng nói → thêm giọng Tiếng Việt. Chrome/Edge trên Android và Safari thường có sẵn.
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
    ui.pitch.value = num(prefs.pv === 2 ? prefs.pitch : undefined, 1.25);
    ui.volume.value = num(prefs.volume, 1);

    function persist() {
      savePrefs({
        pv: 2, text: ui.text.value, voice: ui.voice.value,
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
      el.addEventListener('input', () => {
        updateLabels(); persist();
        if (st.audio) { st.audio.playbackRate = parseFloat(ui.rate.value) * YOUNG; st.audio.volume = parseFloat(ui.volume.value); }
      });
      el.addEventListener('change', () => {          // áp dụng ngay khi thả thanh trượt
        if (piperOf(ui.voice.value)) return;          // giọng AI đã áp dụng trực tiếp ở trên
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

    refreshVoices();
  }

  window.Features['tts'] = {
    title: 'Đọc văn bản (TTS)',
    icon: '🔊',
    desc: 'Nghe đọc to đoạn văn bản.',
    render
  };
})();
