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
  const SIZES = [2, 4, 7];   // giống 3 cỡ nét của bút PDF
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
      <button type="button" class="scratch-mini" id="scImgBtn" title="Chèn ảnh (hoặc dán Ctrl+V / kéo thả ảnh vào đây)">🖼️</button>
      <input type="file" id="scImgInput" accept="image/*" hidden>
      <button type="button" class="scratch-mini" id="scGraphBtn" title="Vẽ đồ thị hàm số y = f(x)">📈</button>
      <button type="button" class="scratch-mini" id="scDash" title="Nét đứt (cho hình học)">┅</button>
      <span class="scratch-sep"></span>
      <span id="scColors"></span>
      <input type="color" class="sc-color-input" id="scColorInput" title="Chọn màu bất kỳ (dùng chung với bút PDF)">
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
  const eraserCur = document.createElement('div');
  eraserCur.className = 'sc-eraser-cursor';
  document.body.appendChild(eraserCur);

  const $ = id => panel.querySelector('#' + id);
  const head = $('scratchHead'), canvas = $('scCanvas'), body = panel.querySelector('.scratch-body');
  const ctx = canvas.getContext('2d');
  const toast = m => { try { window.App.toast(m); } catch (_) {} };

  const TOOLS = [
    ['pen', '✏️', 'Bút tự do'], ['eraser', '🧽', 'Tẩy'], ['select', '⬚', 'Chọn: khoanh vùng (hoặc bấm vào nét/ảnh) rồi kéo để di chuyển · Delete để xoá'],
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
  const shapeSel = $('scShapeSel');
  shapeSel.innerHTML = '<option value="">▾ Hình đặc biệt</option>' + SPECIAL.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

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
  function shapePath(s, c = ctx) {
    const [a, b] = s.p, [x1, y1] = a, [x2, y2] = b;
    const dx = x2 - x1, dy = y2 - y1;
    c.beginPath();
    switch (s.t) {
      case 'line': c.moveTo(x1, y1); c.lineTo(x2, y2); break;
      case 'arrow': {
        c.moveTo(x1, y1); c.lineTo(x2, y2);
        const L = Math.hypot(dx, dy); if (L < 2) break;
        const ang = Math.atan2(dy, dx), h = Math.min(14 + s.w * 1.5, L * 0.5);
        c.moveTo(x2, y2); c.lineTo(x2 - h * Math.cos(ang - 0.45), y2 - h * Math.sin(ang - 0.45));
        c.moveTo(x2, y2); c.lineTo(x2 - h * Math.cos(ang + 0.45), y2 - h * Math.sin(ang + 0.45));
        break;
      }
      case 'rect': c.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(dx), Math.abs(dy)); break;
      case 'ellipse': c.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(dx) / 2, Math.abs(dy) / 2, 0, 0, Math.PI * 2); break;
      case 'circle': c.arc(x1, y1, Math.hypot(dx, dy), 0, Math.PI * 2); break;
      case 'tri': c.moveTo((x1 + x2) / 2, y1); c.lineTo(x2, y2); c.lineTo(x1, y2); c.closePath(); break;
      case 'rtri': c.moveTo(x1, y1); c.lineTo(x1, y2); c.lineTo(x2, y2); c.closePath(); break;
      case 'eqtri': {
        const L = Math.hypot(dx, dy) || 1, h = Math.sqrt(3) / 2 * L;
        const cx = (x1 + x2) / 2 + dy / L * h, cy = (y1 + y2) / 2 - dx / L * h;
        c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(cx, cy); c.closePath(); break;
      }
      case 'ritri2': {
        const m = Math.max(Math.abs(dx), Math.abs(dy)), sx = Math.sign(dx || 1), sy = Math.sign(dy || 1);
        c.moveTo(x1, y1); c.lineTo(x1, y1 + sy * m); c.lineTo(x1 + sx * m, y1 + sy * m); c.closePath(); break;
      }
      case 'square': {
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        c.rect(x1, y1, Math.sign(dx || 1) * m, Math.sign(dy || 1) * m); break;
      }
      case 'rhombus': {
        const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
        c.moveTo(cx, y1); c.lineTo(x2, cy); c.lineTo(cx, y2); c.lineTo(x1, cy); c.closePath(); break;
      }
      case 'trap': {
        const ix = dx * 0.25;
        c.moveTo(x1 + ix, y1); c.lineTo(x2 - ix, y1); c.lineTo(x2, y2); c.lineTo(x1, y2); c.closePath(); break;
      }
      case 'para': {
        const sk = dx * 0.25;
        c.moveTo(x1 + sk, y1); c.lineTo(x2, y1); c.lineTo(x2 - sk, y2); c.lineTo(x1, y2); c.closePath(); break;
      }
      case 'pent': case 'hex': {
        const n = s.t === 'pent' ? 5 : 6, R = Math.hypot(dx, dy);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + 2 * Math.PI * i / n;
          i ? c.lineTo(x1 + R * Math.cos(a), y1 + R * Math.sin(a)) : c.moveTo(x1 + R * Math.cos(a), y1 + R * Math.sin(a));
        }
        c.closePath(); break;
      }
      case 'coord': {
        const ah = 8;
        c.moveTo(x1, y2); c.lineTo(x2, y2);            // trục hoành
        c.moveTo(x2 - ah, y2 - ah / 2); c.lineTo(x2, y2); c.lineTo(x2 - ah, y2 + ah / 2);
        c.moveTo(x1, y2); c.lineTo(x1, y1);            // trục tung
        c.moveTo(x1 - ah / 2, y1 + ah); c.lineTo(x1, y1); c.lineTo(x1 + ah / 2, y1 + ah);
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

  const imgCache = new Map();
  function getImg(src) {
    let im = imgCache.get(src);
    if (!im) { im = new Image(); im.onload = () => redraw(); im.src = src; imgCache.set(src, im); }
    return im;
  }
  function paintImg(s) {
    const im = getImg(s.src);
    if (im.complete && im.naturalWidth) ctx.drawImage(im, s.x, s.y, s.w, s.h);
  }
  function paintStroke(s) {
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = s.e ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.c; ctx.fillStyle = s.c; ctx.lineWidth = s.w;
    if (s.t === 'img') {
      paintImg(s);
    } else if (s.t === 'graph') {
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
    drawOverlay();
  }

  /* ---------- CHỌN / DI CHUYỂN / CHÈN ẢNH ---------- */
  /* ---------- HOÀN TÁC / LÀM LẠI / SAO CHÉP ---------- */
  const undoStack = [], redoStack = [];
  const cloneStroke = s => ({ ...s, p: s.p && s.p.map(q => q.slice()) });
  const snap = () => ({ sheets: state.sheets.map(sh => sh.map(cloneStroke)), cur: state.cur });
  function pushUndo() { if (window.UndoBus) window.UndoBus.last = 'scratch'; undoStack.push(snap()); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; }
  function restore(sn) {
    state.sheets = sn.sheets; state.cur = Math.min(sn.cur, state.sheets.length - 1);
    sel = null; sdrag = null; updateUI(); redraw(); save();
  }
  function undo() {
    if (!undoStack.length) return toast('Không còn gì để hoàn tác');
    redoStack.push(snap()); restore(undoStack.pop());
  }
  function redo() {
    if (!redoStack.length) return toast('Không còn gì để làm lại');
    undoStack.push(snap()); restore(redoStack.pop());
  }
  if (window.UndoBus) window.UndoBus.scratch = { undo, redo, canUndo: () => undoStack.length > 0, canRedo: () => redoStack.length > 0, isOpen: () => state.open };
  let clip = null, pasteN = 0;
  function copySel() {
    if (!sel || !sel.items.length) return false;
    clip = sel.items.map(cloneStroke); pasteN = 0; return true;
  }
  function pasteClip() {
    if (!clip) return false;
    pushUndo(); pasteN++;
    const hasAxes = strokes().some(g => g.t === 'graph' && g.axes);
    const items = clip.map(c0 => { const c = cloneStroke(c0); moveItem(c, 18 * pasteN, 18 * pasteN); if (c.t === 'graph' && hasAxes) c.axes = false; return c; });
    items.forEach(i => strokes().push(i));
    state.tool = 'select'; sel = { items };
    updateUI(); redraw(); save(); return true;
  }
  let sel = null;          // { items: [stroke refs] }
  let sdrag = null;        // { type: 'lasso'|'move'|'resize', ... }
  function recorder() {
    const pts = [];
    return { pts, beginPath() {}, closePath() {}, moveTo(x, y) { pts.push([x, y]); }, lineTo(x, y) { pts.push([x, y]); },
      rect(x, y, w, h) { pts.push([x, y], [x + w, y + h]); }, ellipse(x, y, rx, ry) { pts.push([x - rx, y - ry], [x + rx, y + ry]); },
      arc(x, y, r) { pts.push([x - r, y - r], [x + r, y + r]); } };
  }
  function bboxOf(s) {
    let pts;
    if (s.t === 'img') return [s.x, s.y, s.x + s.w, s.y + s.h];
    if (s.t === 'graph') {
      let fn; try { fn = compile(s.expr); } catch (_) { return null; }
      const W = canvas.width / (window.devicePixelRatio || 1), H = canvas.height / (window.devicePixelRatio || 1);
      pts = [];
      for (let px = 0; px <= W; px += 4) {
        let v; try { v = fn((px - s.ox) / s.sc); } catch (_) { continue; }
        const y = s.oy - v * s.sc; if (isFinite(y) && y > -H && y < 2 * H) pts.push([px, y]);
      }
    } else if (s.t) { const r = recorder(); shapePath(s, r); pts = r.pts; }
    else pts = s.p;
    if (!pts || !pts.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(q => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
    const pad = (s.w || 0) / 2;
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  }
  function inPoly(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function pickByLasso(poly) {
    return strokes().filter(s => {
      if (s.e) return false;
      if (!s.t) { const n = s.p.filter(q => inPoly(q[0], q[1], poly)).length; return n >= s.p.length / 2; }
      const b = bboxOf(s); if (!b) return false;
      return inPoly((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, poly);
    });
  }
  function selBox() {
    if (!sel || !sel.items.length) return null;
    let box = null;
    sel.items.forEach(s => { const b = bboxOf(s); if (!b) return; box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b.slice(); });
    return box && [box[0] - 5, box[1] - 5, box[2] + 5, box[3] + 5];
  }
  const inBox = (q, b, pad = 0) => b && q[0] >= b[0] - pad && q[0] <= b[2] + pad && q[1] >= b[1] - pad && q[1] <= b[3] + pad;
  function singleImg() { return sel && sel.items.length === 1 && sel.items[0].t === 'img' ? sel.items[0] : null; }
  const handleOf = b => [b[2], b[3]];
  function moveItem(s, dx, dy) {
    if (s.t === 'img') { s.x += dx; s.y += dy; }
    else if (s.t === 'graph') { s.ox += dx; s.oy += dy; }
    if (s.p) s.p.forEach(q => { q[0] += dx; q[1] += dy; });
  }
  function drawOverlay() {
    const dpr = window.devicePixelRatio || 1;
    ctx.save(); ctx.scale(dpr, dpr);
    const b = selBox();
    if (b) {
      ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#2563eb'; ctx.fillStyle = 'rgba(37,99,235,.07)';
      ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
      if (singleImg()) { ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.fillRect(b[2] - 6, b[3] - 6, 12, 12); ctx.strokeRect(b[2] - 6, b[3] - 6, 12, 12); }
    }
    if (sdrag && sdrag.type === 'lasso' && sdrag.pts.length > 1) {
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#2563eb'; ctx.fillStyle = 'rgba(37,99,235,.08)';
      ctx.beginPath(); sdrag.pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  function clearSel() { if (sel || sdrag) { sel = null; sdrag = null; redraw(); } }
  function selectDown(q) {
    const b = selBox(), im = singleImg();
    if (b && im) { const h = handleOf(b); if (Math.hypot(q[0] - h[0], q[1] - h[1]) <= 10) { sdrag = { type: 'resize', start: q, w0: im.w, h0: im.h }; return; } }
    if (b && inBox(q, b, 4)) { sdrag = { type: 'move', last: q }; return; }
    sdrag = { type: 'lasso', pts: [q] };
    if (sel) { sel = null; redraw(); }
  }
  function selectMove(q) {
    if (!sdrag) return;
    if (sdrag.type === 'lasso') { sdrag.pts.push(q); redraw(); }
    else if (sdrag.type === 'move') {
      const dx = q[0] - sdrag.last[0], dy = q[1] - sdrag.last[1]; sdrag.last = q;
      if (!sdrag.moved) pushUndo();
      sel.items.forEach(s => moveItem(s, dx, dy)); sdrag.moved = true; redraw();
    } else {
      const im = singleImg(); if (!im) return;
      const w = Math.max(24, sdrag.w0 + (q[0] - sdrag.start[0]));
      if (!sdrag.moved) pushUndo();
      im.w = w; im.h = w * sdrag.h0 / sdrag.w0; sdrag.moved = true; redraw();
    }
  }
  function selectUp() {
    const d = sdrag; sdrag = null;
    if (!d) return;
    if (d.type === 'lasso') {
      const pts = d.pts;
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (len < 8) {                      // chỉ bấm: chọn nét/ảnh nằm trên cùng dưới con trỏ
        const q = pts[0], list = strokes();
        for (let i = list.length - 1; i >= 0; i--) if (!list[i].e && hits(list[i], q[0], q[1], 6)) { sel = { items: [list[i]] }; break; }
      } else {
        const items = pickByLasso(pts);
        sel = items.length ? { items } : null;
        if (!items.length) toast('Không có nét nào trong vùng khoanh');
      }
    } else if (d.moved) save();
    redraw();
  }
  function deleteSel() {
    if (!sel) return;
    pushUndo();
    const set = new Set(sel.items);
    state.sheets[state.cur] = strokes().filter(s => !set.has(s));
    const gs = strokes().filter(g => g.t === 'graph');
    if (gs.length && !gs.some(g => g.axes)) gs[0].axes = true;
    sel = null; redraw(); save();
  }
  function hoverSelect(q) {
    const b = selBox(), im = singleImg();
    if (b && im && Math.hypot(q[0] - b[2], q[1] - b[3]) <= 10) canvas.style.cursor = 'nwse-resize';
    else if (b && inBox(q, b, 4)) canvas.style.cursor = 'move';
    else canvas.style.cursor = 'crosshair';
  }

  /* chèn ảnh: nút 🖼️, dán Ctrl+V, kéo thả */
  function addImage(src, w0, h0) {
    const W = body.clientWidth, H = body.clientHeight, k = Math.min(1, W * 0.6 / w0, H * 0.6 / h0);
    const w = w0 * k, h = h0 * k, it = { t: 'img', src, x: (W - w) / 2, y: (H - h) / 2, w, h };
    pushUndo(); strokes().push(it); state.tool = 'select'; sel = { items: [it] };
    updateUI(); redraw(); save();
  }
  function loadImageFile(file) {
    if (!file || !/^image\//.test(file.type)) return false;
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const MAX = 700, k = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight));
        const cw = Math.max(1, Math.round(im.naturalWidth * k)), ch = Math.max(1, Math.round(im.naturalHeight * k));
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        cv.getContext('2d').drawImage(im, 0, 0, cw, ch);
        addImage(cv.toDataURL(/png|gif|webp|svg/.test(file.type) ? 'image/png' : 'image/jpeg', 0.85), cw, ch);
        toast('🖼️ Đã chèn ảnh — kéo để di chuyển, kéo góc để đổi cỡ');
      };
      im.onerror = () => toast('⚠️ Không đọc được ảnh này');
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
    return true;
  }
  $('scImgBtn').addEventListener('click', () => $('scImgInput').click());
  $('scImgInput').addEventListener('change', e => { [...e.target.files].forEach(loadImageFile); e.target.value = ''; });
  panel.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  panel.addEventListener('drop', e => {
    const files = [...(e.dataTransfer?.files || [])].filter(f => /^image\//.test(f.type));
    if (!files.length) return;
    e.preventDefault(); files.forEach(loadImageFile);
  });
  document.addEventListener('paste', e => {
    if (!state.open) return;
    const t = e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || e.target.isContentEditable) return;
    const f = [...(e.clipboardData?.files || [])].find(x => /^image\//.test(x.type));
    if (f) { e.preventDefault(); loadImageFile(f); }
    else if (clip) { e.preventDefault(); pasteClip(); }     // dán nét/hình/ảnh đã Ctrl+C trong nháp
  });
  const typing = el => { const t = el.tagName; return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable; };
  document.addEventListener('copy', e => {
    if (!state.open || typing(e.target) || String(window.getSelection()).trim()) return;
    if (copySel()) { e.preventDefault(); toast('📋 Đã sao chép — Ctrl+V để dán'); }
  });
  document.addEventListener('cut', e => {
    if (!state.open || typing(e.target) || String(window.getSelection()).trim()) return;
    if (copySel()) { e.preventDefault(); deleteSel(); toast('✂️ Đã cắt — Ctrl+V để dán'); }
  });
  document.addEventListener('keydown', e => {
    if (!state.open) return;
    const t = e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.target.isContentEditable) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (!window.UndoBus) {      // nếu không có bộ điều phối của pdf.js thì tự xử lý
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
      }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel && sel.items.length) { e.preventDefault(); deleteSel(); }
    else if (e.key === 'Escape' && sel) clearSel();
  });

  let drawing = null, erasing = false, eraseUndone = false;
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  /* Tẩy giống tẩy trên PDF: bán kính = cỡ nét × 4, chạm vào nét nào xoá nguyên nét đó */
  const eraseRadius = () => state.size * 4;
  function hits(s, x, y, r) {
    if (s.t === 'img') return x >= s.x - r && x <= s.x + s.w + r && y >= s.y - r && y <= s.y + s.h + r;
    if (s.t === 'graph') {
      let fn; try { fn = compile(s.expr); } catch (_) { return false; }
      const W = canvas.width / (window.devicePixelRatio || 1);
      for (let px = Math.max(0, x - r); px <= Math.min(W, x + r); px += 1) {
        let v; try { v = fn((px - s.ox) / s.sc); } catch (_) { continue; }
        const py = s.oy - v * s.sc;
        if (isFinite(py) && Math.hypot(px - x, py - y) <= r + s.w / 2) return true;
      }
      return false;
    }
    if (s.t) {
      const dpr = window.devicePixelRatio || 1;
      ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      shapePath(s); ctx.lineWidth = s.w + 2 * r;
      const ok = ctx.isPointInStroke(x * dpr, y * dpr);
      ctx.restore();
      return ok;
    }
    for (const q of s.p) if (Math.hypot(q[0] - x, q[1] - y) <= r + s.w / 2) return true;
    return false;
  }
  function eraseAt(x, y) {
    const r = eraseRadius(), before = strokes().length;
    const kept = strokes().filter(s => s.e || !hits(s, x, y, r));
    if (kept.length !== before && !eraseUndone) { pushUndo(); eraseUndone = true; }
    state.sheets[state.cur] = kept;
    // nếu xoá mất trục toạ độ của đồ thị đầu tiên thì chuyển trục sang đồ thị kế tiếp
    const gs = strokes().filter(g => g.t === 'graph');
    if (gs.length && !gs.some(g => g.axes)) gs[0].axes = true;
    return strokes().length !== before;
  }
  function moveEraserCursor(e) {
    const d = eraseRadius() * 2;
    eraserCur.style.width = d + 'px'; eraserCur.style.height = d + 'px';
    eraserCur.style.left = e.clientX + 'px'; eraserCur.style.top = e.clientY + 'px';
    eraserCur.classList.add('show');
  }
  canvas.addEventListener('pointerleave', () => eraserCur.classList.remove('show'));
  const isShape = t => t !== 'pen' && t !== 'eraser' && t !== 'select';
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
    if (tool === 'select') { selectDown(p0); return; }
    if (eraser) { erasing = true; eraseUndone = false; if (eraseAt(p0[0], p0[1])) redraw(); moveEraserCursor(e); return; }
    pushUndo();
    if (isShape(tool)) {
      drawing = { t: tool, c: state.color, w: state.size, d: state.dash, p: [p0, p0.slice()] };
    } else {
      drawing = { c: state.color, w: state.size, p: [p0] };
    }
    strokes().push(drawing);
    redraw();
  });
  canvas.addEventListener('pointermove', e => {
    if (state.tool === 'select') { const q = pos(e); if (sdrag) selectMove(q); else hoverSelect(q); return; }
    if (state.tool === 'eraser') moveEraserCursor(e);
    if (erasing) { const q = pos(e); if (eraseAt(q[0], q[1])) redraw(); return; }
    if (!drawing) return;
    if (drawing.t) { drawing.p[1] = pos(e); constrain(drawing, e); }
    else drawing.p.push(pos(e));
    redraw(); // vẽ lại cả trang để tẩy (destination-out) luôn đúng thứ tự
  });
  const endDraw = e => {
    if (sdrag) { selectUp(); try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} return; }
    if (erasing) {
      erasing = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      save(); return;
    }
    if (!drawing) return;
    // bỏ hình quá nhỏ (chạm nhầm)
    if (drawing.t && Math.hypot(drawing.p[1][0] - drawing.p[0][0], drawing.p[1][1] - drawing.p[0][1]) < 3) {
      const a = strokes(); a.splice(a.indexOf(drawing), 1); undoStack.pop(); redraw();
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
    shapeSel.value = SPECIAL.some(([v]) => v === state.tool) ? state.tool : '';
    shapeSel.classList.toggle('active', !!shapeSel.value);
    panel.querySelectorAll('.sc-swatch').forEach(b => b.classList.toggle('active', b.dataset.color === state.color));
    panel.querySelectorAll('.sc-size').forEach(b => b.classList.toggle('active', +b.dataset.size === state.size));
    panel.classList.toggle('eraser', state.tool === 'eraser');
    if (state.tool !== 'select' && sel) { sel = null; if (state.open) redraw(); }
    canvas.style.cursor = state.tool === 'select' ? 'crosshair' : '';
    if (state.tool !== 'eraser') eraserCur.classList.remove('show');
    $('scColorInput').value = state.color;
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

  /* ---------- ĐỒNG BỘ với bút/tẩy trên file PDF (PenSync do pdf.js cung cấp) ---------- */
  const sync = window.PenSync;
  const pushSync = o => { if (sync) sync.set(o); };
  if (sync) {
    const st = sync.get();
    if (st.color) state.color = st.color;
    if (SIZES.includes(st.width)) state.size = st.width;
    if (st.tool === 'pen' || st.tool === 'eraser') state.tool = st.tool;
    sync.onChange(o => {
      if (o.color) state.color = o.color;
      if (SIZES.includes(o.width)) state.size = o.width;
      if (o.tool === 'pen' || o.tool === 'eraser') state.tool = o.tool;
      updateUI();
    });
  }
  panel.querySelectorAll('.sc-tool').forEach(b => b.addEventListener('click', () => {
    state.tool = b.dataset.tool; updateUI();
    if (state.tool === 'pen' || state.tool === 'eraser') pushSync({ tool: state.tool });
  }));
  $('scColorInput').addEventListener('input', e => {
    state.color = e.target.value; if (state.tool === 'eraser') state.tool = 'pen';
    updateUI(); pushSync({ color: state.color, tool: state.tool === 'pen' ? 'pen' : undefined }); save();
  });
  shapeSel.addEventListener('change', () => { if (shapeSel.value) { state.tool = shapeSel.value; updateUI(); } });
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
    pushUndo();
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
    state.color = b.dataset.color; if (state.tool === 'eraser') state.tool = 'pen'; updateUI(); pushSync({ color: state.color }); save();
  }));
  panel.querySelectorAll('.sc-size').forEach(b => b.addEventListener('click', () => {
    state.size = +b.dataset.size; updateUI(); pushSync({ width: state.size }); save();
  }));

  function goto(i) {
    sel = null; sdrag = null;
    state.cur = Math.max(0, Math.min(i, state.sheets.length - 1));
    updateUI(); redraw(); save();
  }
  $('scPrev').addEventListener('click', () => goto(state.cur - 1));
  $('scNext').addEventListener('click', () => goto(state.cur + 1));
  $('scAdd').addEventListener('click', () => {
    pushUndo(); state.sheets.push([]);
    goto(state.sheets.length - 1);
    toast('📄 Đã tạo trang nháp trống');
  });
  $('scClear').addEventListener('click', () => {
    if (!strokes().length) return toast('Trang nháp đang trống');
    pushUndo(); state.sheets[state.cur] = []; sel = null;
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

  /* chặn menu chuột phải của trình duyệt trên toàn bộ web (kể cả ô nhập chữ, iframe không thuộc phạm vi) */
  document.addEventListener('contextmenu', e => e.preventDefault(), true);

  updateUI();
  window.ScratchPad = { open: () => setOpen(true), close: () => setOpen(false), toggle };
})();
