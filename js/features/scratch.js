/* ============================================================
   SCRATCH PAD (NHÁP) — bảng nháp trống, bật/tắt thoải mái
   - Nút 📝 trên thanh công cụ PDF (hoặc phím N) để bật/tắt
   - Tắt chỉ ẩn đi, nội dung nháp được giữ nguyên khi bật lại
   - Nhiều trang nháp: nút ＋ tạo trang trắng mới, ‹ › để chuyển trang
   - Bút / tẩy / màu / cỡ nét / xoá trang; kéo header để di chuyển,
     kéo góc phải dưới để đổi kích thước
   ============================================================ */
(function () {
  'use strict';

  const btn = document.getElementById('scratchBtn');
  if (!btn) return;

  const LS_KEY = 'scratchPadV1';
  const COLORS = ['#1e293b', '#ef4444', '#2563eb', '#16a34a'];
  const SIZES = [2, 4, 8];
  const MIN_W = 150, MIN_H = 130;

  const state = {
    open: false,
    tool: 'pen',            // pen | eraser | line | arrow | rect | ellipse | circle | tri | rtri | coord
    dash: false,
    color: COLORS[0],
    size: 2,
    sheets: [[]],           // mỗi trang = mảng nét {c, w, e, p:[[x,y],...]}
    cur: 0,
    box: null               // {x,y,w,h}
  };

  /* ---------- Khôi phục (best-effort) ---------- */
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved && Array.isArray(saved.sheets) && saved.sheets.length) {
      state.sheets = saved.sheets;
      state.cur = Math.min(saved.cur || 0, saved.sheets.length - 1);
      if (saved.box) state.box = saved.box;
      if (saved.color) state.color = saved.color;
      if (saved.size) state.size = saved.size;
    }
  } catch (_) {}

  let saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          sheets: state.sheets, cur: state.cur, box: state.box, color: state.color, size: state.size
        }));
      } catch (_) {}
    }, 400);
  }

  /* ---------- DOM ---------- */
  const panel = document.createElement('div');
  panel.className = 'scratch-panel';
  panel.id = 'scratchPanel';
  panel.innerHTML = `
    <div class="scratch-head" id="scratchHead">
      <span class="scratch-title">📝 Nháp</span>
      <div class="scratch-pages">
        <button type="button" class="scratch-mini" id="scPrev" title="Trang trước">‹</button>
        <span id="scPage">1/1</span>
        <button type="button" class="scratch-mini" id="scNext" title="Trang sau">›</button>
        <button type="button" class="scratch-mini" id="scAdd" title="Tạo trang nháp trống mới">＋</button>
      </div>
      <button type="button" class="scratch-mini scratch-close" id="scClose" title="Ẩn nháp (nội dung được giữ lại)">✕</button>
    </div>
    <div class="scratch-tools">
      <span id="scTools"></span>
      <select class="sc-shape-sel" id="scShapeSel" title="Hình đặc biệt"></select>
      <button type="button" class="scratch-mini" id="scGraphBtn" title="Vẽ đồ thị hàm số y = f(x)">📈</button>
      <button type="button" class="scratch-mini" id="scDash" title="Nét đứt (cho hình học)">┅</button>
      <span class="scratch-sep"></span>
      <span id="scColors"></span>
      <span class="scratch-sep"></span>
      <span id="scSizes"></span>
      <button type="button" class="scratch-mini scratch-clear" id="scClear" title="Xoá trang nháp này">🗑️</button>
    </div>
    <div class="scratch-graph-bar" id="scGraphBar">
      <span class="sc-gl">y =</span>
      <input type="text" id="scExpr" placeholder="x^2-2x+1 · sin(x) · 1/x · sqrt(x)" autocomplete="off" spellcheck="false">
      <span class="sc-gl" title="Khoảng x hiển thị: từ -a đến a">±</span>
      <input type="number" id="scRange" value="6" min="1" max="1000" step="1" title="Khoảng x: -a … a (chỉ áp dụng cho đồ thị đầu tiên)">
      <button type="button" id="scPlot">Vẽ</button>
    </div>
    <div class="scratch-body"><canvas id="scCanvas"></canvas></div>
    ${['n','s','e','w','ne','nw','se','sw'].map(d => `<div class="sc-rz sc-rz-${d}" data-dir="${d}"></div>`).join('')}`;
  document.body.appendChild(panel);

  const $ = id => panel.querySelector('#' + id);
  const head = $('scratchHead'), canvas = $('scCanvas'), body = panel.querySelector('.scratch-body');
  const ctx = canvas.getContext('2d');
  const toast = m => { try { window.App.toast(m); } catch (_) {} };

  const TOOLS = [
    ['pen', '✏️', 'Bút tự do'], ['eraser', '🧽', 'Tẩy'],
    ['line', '╱', 'Đoạn thẳng (giữ Shift: góc 15°)'], ['arrow', '↗', 'Mũi tên / vectơ'],
    ['rect', '▭', 'Hình chữ nhật (giữ Shift: vuông)'], ['ellipse', '⬭', 'Elip (giữ Shift: tròn)'],
    ['circle', '◯', 'Đường tròn: kéo từ tâm ra bán kính'], ['tri', '△', 'Tam giác (cân, trong khung kéo)'],
    ['rtri', '◺', 'Tam giác vuông'], ['coord', '✛', 'Trục toạ độ Oxy']
  ];
  TOOLS.forEach(([id, ic, tip]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'scratch-mini sc-tool'; b.dataset.tool = id; b.title = tip; b.textContent = ic;
    $('scTools').appendChild(b);
  });

  const SPECIAL = [
    ['eqtri', 'Tam giác đều (kéo cạnh đáy)'], ['ritri2', 'Tam giác vuông cân'], ['square', 'Hình vuông'],
    ['rhombus', 'Hình thoi'], ['trap', 'Hình thang cân'], ['para', 'Hình bình hành'],
    ['pent', 'Ngũ giác đều (kéo từ tâm)'], ['hex', 'Lục giác đều (kéo từ tâm)']
  ];
  const sel = $('scShapeSel');
  sel.innerHTML = '<option value="">▾ Hình đặc biệt</option>' + SPECIAL.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

  /* swatch màu + cỡ nét */
  COLORS.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sc-swatch'; b.dataset.color = c; b.style.background = c;
    $('scColors').appendChild(b);
  });
  SIZES.forEach(s => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sc-size'; b.dataset.size = s;
    b.innerHTML = `<span style="width:${s + 3}px;height:${s + 3}px"></span>`;
    $('scSizes').appendChild(b);
  });

  /* ---------- Vị trí / kích thước ---------- */
  function defaultBox() {
    const w = Math.min(300, window.innerWidth - 24), h = Math.min(320, window.innerHeight - 120);
    return { x: Math.max(12, window.innerWidth - w - 24), y: 90, w, h };
  }
  function clampBox() {
    const b = state.box;
    b.w = Math.max(MIN_W, Math.min(b.w, window.innerWidth - 8));
    b.h = Math.max(MIN_H, Math.min(b.h, window.innerHeight - 8));
    b.x = Math.max(4 - b.w + 80, Math.min(b.x, window.innerWidth - 80));
    b.y = Math.max(0, Math.min(b.y, window.innerHeight - 40));
  }
  function applyBox() {
    clampBox();
    const b = state.box;
    panel.style.left = b.x + 'px'; panel.style.top = b.y + 'px';
    panel.style.width = b.w + 'px'; panel.style.height = b.h + 'px';
  }

  /* ---------- Vẽ ---------- */
  const strokes = () => state.sheets[state.cur];

  function fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = body.clientWidth, h = body.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    redraw();
  }
  function shapePath(s) {
    const [a, b] = s.p, [x1, y1] = a, [x2, y2] = b;
    const dx = x2 - x1, dy = y2 - y1;
    ctx.beginPath();
    switch (s.t) {
      case 'line': ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); break;
      case 'arrow': {
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        const L = Math.hypot(dx, dy); if (L < 2) break;
        const ang = Math.atan2(dy, dx), h = Math.min(14 + s.w * 1.5, L * 0.5);
        ctx.moveTo(x2, y2); ctx.lineTo(x2 - h * Math.cos(ang - 0.45), y2 - h * Math.sin(ang - 0.45));
        ctx.moveTo(x2, y2); ctx.lineTo(x2 - h * Math.cos(ang + 0.45), y2 - h * Math.sin(ang + 0.45));
        break;
      }
      case 'rect': ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(dx), Math.abs(dy)); break;
      case 'ellipse': ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(dx) / 2, Math.abs(dy) / 2, 0, 0, Math.PI * 2); break;
      case 'circle': ctx.arc(x1, y1, Math.hypot(dx, dy), 0, Math.PI * 2); break;
      case 'tri': ctx.moveTo((x1 + x2) / 2, y1); ctx.lineTo(x2, y2); ctx.lineTo(x1, y2); ctx.closePath(); break;
      case 'rtri': ctx.moveTo(x1, y1); ctx.lineTo(x1, y2); ctx.lineTo(x2, y2); ctx.closePath(); break;
      case 'eqtri': {
        const L = Math.hypot(dx, dy) || 1, h = Math.sqrt(3) / 2 * L;
        const cx = (x1 + x2) / 2 + dy / L * h, cy = (y1 + y2) / 2 - dx / L * h;
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(cx, cy); ctx.closePath(); break;
      }
      case 'ritri2': {
        const m = Math.max(Math.abs(dx), Math.abs(dy)), sx = Math.sign(dx || 1), sy = Math.sign(dy || 1);
        ctx.moveTo(x1, y1); ctx.lineTo(x1, y1 + sy * m); ctx.lineTo(x1 + sx * m, y1 + sy * m); ctx.closePath(); break;
      }
      case 'square': {
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        ctx.rect(x1, y1, Math.sign(dx || 1) * m, Math.sign(dy || 1) * m); break;
      }
      case 'rhombus': {
        const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
        ctx.moveTo(cx, y1); ctx.lineTo(x2, cy); ctx.lineTo(cx, y2); ctx.lineTo(x1, cy); ctx.closePath(); break;
      }
      case 'trap': {
        const ix = dx * 0.25;
        ctx.moveTo(x1 + ix, y1); ctx.lineTo(x2 - ix, y1); ctx.lineTo(x2, y2); ctx.lineTo(x1, y2); ctx.closePath(); break;
      }
      case 'para': {
        const sk = dx * 0.25;
        ctx.moveTo(x1 + sk, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2 - sk, y2); ctx.lineTo(x1, y2); ctx.closePath(); break;
      }
      case 'pent': case 'hex': {
        const n = s.t === 'pent' ? 5 : 6, R = Math.hypot(dx, dy);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + 2 * Math.PI * i / n;
          i ? ctx.lineTo(x1 + R * Math.cos(a), y1 + R * Math.sin(a)) : ctx.moveTo(x1 + R * Math.cos(a), y1 + R * Math.sin(a));
        }
        ctx.closePath(); break;
      }
      case 'coord': {
        const ah = 8;
        ctx.moveTo(x1, y2); ctx.lineTo(x2, y2);            // trục hoành
        ctx.moveTo(x2 - ah, y2 - ah / 2); ctx.lineTo(x2, y2); ctx.lineTo(x2 - ah, y2 + ah / 2);
        ctx.moveTo(x1, y2); ctx.lineTo(x1, y1);            // trục tung
        ctx.moveTo(x1 - ah / 2, y1 + ah); ctx.lineTo(x1, y1); ctx.lineTo(x1 + ah / 2, y1 + ah);
        break;
      }
    }
  }
  /* ---------- Đồ thị hàm số ---------- */
  const fnCache = new Map();
  const NAMES = ['asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sqrt', 'cbrt', 'floor', 'ceil', 'sin', 'cos', 'tan', 'abs', 'exp', 'sgn', 'log', 'ln', 'pi', 'x', 'e'];
  const FN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
    ln: Math.log, log: Math.log10, exp: Math.exp, floor: Math.floor, ceil: Math.ceil, sgn: Math.sign };
  /* Bộ phân tích biểu thức an toàn (không dùng eval): + - * / ^, ngoặc, nhân ngầm (2x, 3(x+1)), hàm, pi, e */
  function compile(src) {
    if (fnCache.has(src)) return fnCache.get(src);
    const str = src.toLowerCase().replace(/π/g, 'pi').replace(/\s+/g, '').replace(/,/g, '.').replace(/\*\*/g, '^').replace(/[×·]/g, '*');
    const T = [], re = /(\d+\.?\d*|\.\d+)|([a-z]+)|([-+*\/^()])|(.)/g;
    let m;
    while ((m = re.exec(str))) {
      if (m[1]) T.push({ n: parseFloat(m[1]) });
      else if (m[2]) {
        let w = m[2];
        while (w) {
          const nm = NAMES.find(k => w.startsWith(k));
          if (!nm) throw new Error('không hiểu "' + w + '"');
          T.push({ id: nm }); w = w.slice(nm.length);
        }
      } else if (m[3]) T.push({ op: m[3] });
      else throw new Error('ký tự lạ "' + m[4] + '"');
    }
    if (!T.length) throw new Error('trống');
    let i = 0;
    const isOp = o => T[i] && T[i].op === o;
    function expr() {
      let l = term();
      while (isOp('+') || isOp('-')) { const o = T[i++].op, r = term(), a = l; l = o === '+' ? x => a(x) + r(x) : x => a(x) - r(x); }
      return l;
    }
    function term() {
      let l = unary();
      for (;;) {
        if (isOp('*') || isOp('/')) { const o = T[i++].op, r = unary(), a = l; l = o === '*' ? x => a(x) * r(x) : x => a(x) / r(x); }
        else if (T[i] && (T[i].n !== undefined || T[i].id || isOp('('))) { const r = unary(), a = l; l = x => a(x) * r(x); }
        else break;
      }
      return l;
    }
    function unary() {
      if (isOp('-')) { i++; const a = unary(); return x => -a(x); }
      if (isOp('+')) { i++; return unary(); }
      return power();
    }
    function power() {
      const b = atom();
      if (isOp('^')) { i++; const e = unary(); return x => Math.pow(b(x), e(x)); }
      return b;
    }
    function atom() {
      const t = T[i++];
      if (!t) throw new Error('thiếu biểu thức');
      if (t.n !== undefined) { const v = t.n; return () => v; }
      if (t.op === '(') { const e = expr(); if (!isOp(')')) throw new Error('thiếu dấu )'); i++; return e; }
      if (t.id) {
        if (t.id === 'x') return x => x;
        if (t.id === 'pi') return () => Math.PI;
        if (t.id === 'e') return () => Math.E;
        const f = FN[t.id], a = isOp('(') ? atom() : unary();
        return x => f(a(x));
      }
      throw new Error('sai cú pháp');
    }
    const fn = expr();
    if (i < T.length) throw new Error('thừa ký tự');
    fnCache.set(src, fn);
    return fn;
  }
  function niceStep(sc) {
    const raw = 40 / sc, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 5, 10].map(k => k * mag).find(v => v >= raw);
  }
  const fmtNum = v => String(+v.toFixed(6));
  function paintGraph(s) {
    const W = canvas.width / (window.devicePixelRatio || 1), H = canvas.height / (window.devicePixelRatio || 1);
    const { ox, oy, sc } = s;
    if (s.axes) {
      const step = niceStep(sc);
      const k0x = Math.ceil((-ox) / sc / step), k1x = Math.floor((W - ox) / sc / step);
      const k0y = Math.ceil((oy - H) / sc / step), k1y = Math.floor(oy / sc / step);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(100,116,139,.2)'; ctx.beginPath();
      for (let k = k0x; k <= k1x; k++) { if (!k) continue; const x = ox + k * step * sc; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let k = k0y; k <= k1y; k++) { if (!k) continue; const y = oy - k * step * sc; ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      ctx.strokeStyle = '#475569'; ctx.fillStyle = '#475569'; ctx.lineWidth = 1.4; ctx.font = '10px sans-serif';
      const ax = Math.min(Math.max(ox, 6), W - 6), ay = Math.min(Math.max(oy, 6), H - 6);
      ctx.beginPath();
      ctx.moveTo(0, ay); ctx.lineTo(W, ay); ctx.moveTo(W - 8, ay - 4); ctx.lineTo(W, ay); ctx.lineTo(W - 8, ay + 4);
      ctx.moveTo(ax, H); ctx.lineTo(ax, 0); ctx.moveTo(ax - 4, 8); ctx.lineTo(ax, 0); ctx.lineTo(ax + 4, 8);
      for (let k = k0x; k <= k1x; k++) { if (!k) continue; const x = ox + k * step * sc; ctx.moveTo(x, ay - 3); ctx.lineTo(x, ay + 3); }
      for (let k = k0y; k <= k1y; k++) { if (!k) continue; const y = oy - k * step * sc; ctx.moveTo(ax - 3, y); ctx.lineTo(ax + 3, y); }
      ctx.stroke();
      ctx.textAlign = 'center';
      for (let k = k0x; k <= k1x; k++) { if (!k) continue; ctx.fillText(fmtNum(k * step), ox + k * step * sc, Math.min(ay + 14, H - 2)); }
      ctx.textAlign = ax > W - 26 ? 'right' : 'left';
      for (let k = k0y; k <= k1y; k++) { if (!k) continue; ctx.fillText(fmtNum(k * step), ax > W - 26 ? ax - 6 : ax + 6, oy - k * step * sc + 3); }
      ctx.textAlign = 'left'; ctx.font = 'italic 12px sans-serif';
      ctx.fillText('O', ax + 5, Math.min(ay + 14, H - 2)); ctx.fillText('x', W - 12, ay - 8); ctx.fillText('y', ax + 8, 12);
    }
    let fn; try { fn = compile(s.expr); } catch (_) { return; }
    ctx.strokeStyle = s.c; ctx.lineWidth = s.w; ctx.beginPath();
    let pen = false, py = 0;
    for (let px = 0; px <= W; px++) {
      let yv; try { yv = fn((px - ox) / sc); } catch (_) { yv = NaN; }
      const y = oy - yv * sc;
      if (!isFinite(y) || Math.abs(y) > H * 20) { pen = false; continue; }
      if (pen && Math.abs(y - py) > H) pen = false;       // ngắt ở tiệm cận (1/x, tan x…)
      if (!pen) { ctx.moveTo(px, y); pen = true; } else ctx.lineTo(px, y);
      py = y;
    }
    ctx.stroke();
    ctx.fillStyle = s.c; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('y = ' + s.expr, 8, s.lab || 16);
  }
  const GRAPH_COLORS = ['#2563eb', '#ef4444', '#16a34a', '#9333ea', '#ea580c'];

  function paintStroke(s) {
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = s.e ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.c; ctx.fillStyle = s.c; ctx.lineWidth = s.w;
    if (s.t === 'graph') {
      paintGraph(s);
    } else if (s.t) {
      if (s.d) ctx.setLineDash([s.w * 3 + 3, s.w * 2 + 3]);
      shapePath(s); ctx.stroke();
    } else if (s.p.length === 1) {
      ctx.beginPath(); ctx.arc(s.p[0][0], s.p[0][1], s.w / 2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(s.p[0][0], s.p[0][1]);
      for (let i = 1; i < s.p.length; i++) ctx.lineTo(s.p[i][0], s.p[i][1]);
      ctx.stroke();
    }
    ctx.restore();
  }
  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes().forEach(paintStroke);
  }

  let drawing = null;
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const isShape = t => t !== 'pen' && t !== 'eraser';
  function constrain(st, e) {
    // Shift: ép vuông / tròn / góc bội 15°
    if (!e.shiftKey || !st.t) return;
    const [x1, y1] = st.p[0]; let [x2, y2] = st.p[1];
    const dx = x2 - x1, dy = y2 - y1;
    if (st.t === 'line' || st.t === 'arrow' || st.t === 'eqtri') {
      const L = Math.hypot(dx, dy), a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
      x2 = x1 + L * Math.cos(a); y2 = y1 + L * Math.sin(a);
    } else if (!['circle', 'pent', 'hex', 'square', 'ritri2'].includes(st.t)) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      x2 = x1 + Math.sign(dx || 1) * m; y2 = y1 + Math.sign(dy || 1) * m;
    }
    st.p[1] = [x2, y2];
  }
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const tool = state.tool, eraser = tool === 'eraser', p0 = pos(e);
    if (isShape(tool)) {
      drawing = { t: tool, c: state.color, w: state.size, d: state.dash, p: [p0, p0] };
    } else {
      drawing = { c: state.color, w: eraser ? state.size * 4 : state.size, e: eraser, p: [p0] };
    }
    strokes().push(drawing);
    redraw();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    if (drawing.t) { drawing.p[1] = pos(e); constrain(drawing, e); }
    else drawing.p.push(pos(e));
    redraw(); // vẽ lại cả trang để tẩy (destination-out) luôn đúng thứ tự
  });
  const endDraw = e => {
    if (!drawing) return;
    // bỏ hình quá nhỏ (chạm nhầm)
    if (drawing.t && Math.hypot(drawing.p[1][0] - drawing.p[0][0], drawing.p[1][1] - drawing.p[0][1]) < 3) {
      const a = strokes(); a.splice(a.indexOf(drawing), 1); redraw();
    }
    drawing = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    save();
  };
  canvas.addEventListener('pointerup', endDraw);
  canvas.addEventListener('pointercancel', endDraw);

  /* ---------- UI ---------- */
  function updateUI() {
    $('scPage').textContent = (state.cur + 1) + '/' + state.sheets.length;
    $('scPrev').disabled = state.cur === 0;
    $('scNext').disabled = state.cur === state.sheets.length - 1;
    panel.querySelectorAll('.sc-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === state.tool));
    $('scDash').classList.toggle('active', state.dash);
    sel.value = SPECIAL.some(([v]) => v === state.tool) ? state.tool : '';
    sel.classList.toggle('active', !!sel.value);
    panel.querySelectorAll('.sc-swatch').forEach(b => b.classList.toggle('active', b.dataset.color === state.color));
    panel.querySelectorAll('.sc-size').forEach(b => b.classList.toggle('active', +b.dataset.size === state.size));
    panel.classList.toggle('eraser', state.tool === 'eraser');
    btn.classList.toggle('active', state.open);
  }

  function setOpen(v) {
    state.open = v;
    panel.classList.toggle('show', v);
    if (v) {
      if (!state.box) state.box = defaultBox();
      applyBox();
      fitCanvas();
    }
    updateUI();
  }
  const toggle = () => { setOpen(!state.open); toast(state.open ? '📝 Bật nháp' : 'Đã ẩn nháp (vẫn được giữ lại)'); };

  btn.addEventListener('click', toggle);
  $('scClose').addEventListener('click', () => { setOpen(false); toast('Đã ẩn nháp (vẫn được giữ lại)'); });

  panel.querySelectorAll('.sc-tool').forEach(b => b.addEventListener('click', () => { state.tool = b.dataset.tool; updateUI(); }));
  sel.addEventListener('change', () => { if (sel.value) { state.tool = sel.value; updateUI(); } });
  const graphBar = $('scGraphBar');
  $('scGraphBtn').addEventListener('click', () => {
    graphBar.classList.toggle('show');
    $('scGraphBtn').classList.toggle('active', graphBar.classList.contains('show'));
    if (graphBar.classList.contains('show')) $('scExpr').focus();
  });
  function plot() {
    const src = $('scExpr').value.trim();
    if (!src) return toast('Nhập hàm số, ví dụ x^2-2x+1');
    try { compile(src); } catch (err) { return toast('⚠️ Hàm chưa đúng: ' + err.message); }
    const W = body.clientWidth, H = body.clientHeight;
    const list = strokes(), graphs = list.filter(g => g.t === 'graph'), first = graphs[0];
    const xr = Math.max(1, Math.min(1000, parseFloat($('scRange').value) || 6));
    const base = first ? { ox: first.ox, oy: first.oy, sc: first.sc, axes: false }
                       : { ox: W / 2, oy: H / 2, sc: W / (2 * xr), axes: true };
    list.push({ t: 'graph', expr: src, c: GRAPH_COLORS[graphs.length % GRAPH_COLORS.length], w: Math.max(2, state.size),
                lab: 16 + 15 * graphs.length, p: [[0, 0], [0, 0]], ...base });
    redraw(); save();
  }
  $('scPlot').addEventListener('click', plot);
  $('scExpr').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); plot(); } e.stopPropagation(); });
  $('scRange').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); plot(); } e.stopPropagation(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (state.open) fitCanvas(); }).observe(body);
  $('scDash').addEventListener('click', () => { state.dash = !state.dash; updateUI(); });
  panel.querySelectorAll('.sc-swatch').forEach(b => b.addEventListener('click', () => {
    state.color = b.dataset.color; if (state.tool === 'eraser') state.tool = 'pen'; updateUI(); save();
  }));
  panel.querySelectorAll('.sc-size').forEach(b => b.addEventListener('click', () => {
    state.size = +b.dataset.size; updateUI(); save();
  }));

  function goto(i) {
    state.cur = Math.max(0, Math.min(i, state.sheets.length - 1));
    updateUI(); redraw(); save();
  }
  $('scPrev').addEventListener('click', () => goto(state.cur - 1));
  $('scNext').addEventListener('click', () => goto(state.cur + 1));
  $('scAdd').addEventListener('click', () => {
    state.sheets.push([]);
    goto(state.sheets.length - 1);
    toast('📄 Đã tạo trang nháp trống');
  });
  $('scClear').addEventListener('click', () => {
    if (!strokes().length) return toast('Trang nháp đang trống');
    state.sheets[state.cur] = [];
    redraw(); save();
    toast('🗑️ Đã xoá trang nháp');
  });

  /* ---------- Kéo di chuyển / đổi kích thước ---------- */
  let drag = null;
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    drag = { type: 'move', sx: e.clientX, sy: e.clientY, bx: state.box.x, by: state.box.y };
    head.setPointerCapture(e.pointerId);
  });
  panel.querySelectorAll('.sc-rz').forEach(h => {
    h.addEventListener('pointerdown', e => {
      const b = state.box;
      drag = { type: 'size', dir: h.dataset.dir, sx: e.clientX, sy: e.clientY, bx: b.x, by: b.y, bw: b.w, bh: b.h };
      h.setPointerCapture(e.pointerId);
      e.preventDefault(); e.stopPropagation();
    });
    h.addEventListener('pointermove', onMove);
    h.addEventListener('pointerup', onUp);
    h.addEventListener('pointercancel', onUp);
  });
  function onMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy, b = state.box;
    if (drag.type === 'move') { b.x = drag.bx + dx; b.y = drag.by + dy; }
    else {
      const d = drag.dir;
      if (d.includes('e')) b.w = Math.max(MIN_W, drag.bw + dx);
      if (d.includes('s')) b.h = Math.max(MIN_H, drag.bh + dy);
      if (d.includes('w')) { b.w = Math.max(MIN_W, drag.bw - dx); b.x = drag.bx + drag.bw - b.w; }
      if (d.includes('n')) { b.h = Math.max(MIN_H, drag.bh - dy); b.y = drag.by + drag.bh - b.h; }
    }
    applyBox();
    if (drag.type === 'size') fitCanvas();
  }
  function onUp() { if (drag) { drag = null; fitCanvas(); save(); } }
  head.addEventListener('pointermove', onMove);
  head.addEventListener('pointerup', onUp);
  head.addEventListener('pointercancel', onUp);

  window.addEventListener('resize', () => { if (state.open) { applyBox(); fitCanvas(); } });

  /* ---------- Phím tắt: N bật/tắt nháp ---------- */
  document.addEventListener('keydown', e => {
    const t = e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!document.body.classList.contains('on-reader')) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); toggle(); }
  });

  updateUI();
  window.ScratchPad = { open: () => setOpen(true), close: () => setOpen(false), toggle };
})();
