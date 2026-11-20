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

  const state = {
    open: false,
    tool: 'pen',            // 'pen' | 'eraser'
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
      <button type="button" class="scratch-mini sc-tool active" id="scPen" title="Bút">✏️</button>
      <button type="button" class="scratch-mini sc-tool" id="scEraser" title="Tẩy">🧽</button>
      <span class="scratch-sep"></span>
      <span id="scColors"></span>
      <span class="scratch-sep"></span>
      <span id="scSizes"></span>
      <button type="button" class="scratch-mini scratch-clear" id="scClear" title="Xoá trang nháp này">🗑️</button>
    </div>
    <div class="scratch-body"><canvas id="scCanvas"></canvas></div>
    <div class="scratch-grip" id="scGrip" title="Kéo để đổi kích thước"></div>`;
  document.body.appendChild(panel);

  const $ = id => panel.querySelector('#' + id);
  const head = $('scratchHead'), canvas = $('scCanvas'), body = panel.querySelector('.scratch-body');
  const ctx = canvas.getContext('2d');
  const toast = m => { try { window.App.toast(m); } catch (_) {} };

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
    const w = Math.min(460, window.innerWidth - 24), h = Math.min(520, window.innerHeight - 120);
    return { x: Math.max(12, window.innerWidth - w - 24), y: 90, w, h };
  }
  function clampBox() {
    const b = state.box;
    b.w = Math.max(260, Math.min(b.w, window.innerWidth - 8));
    b.h = Math.max(220, Math.min(b.h, window.innerHeight - 8));
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
  function paintStroke(s) {
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = s.e ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.c; ctx.fillStyle = s.c; ctx.lineWidth = s.w;
    if (s.p.length === 1) {
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
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const eraser = state.tool === 'eraser';
    drawing = { c: state.color, w: eraser ? state.size * 4 : state.size, e: eraser, p: [pos(e)] };
    strokes().push(drawing);
    paintStroke(drawing);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    drawing.p.push(pos(e));
    redraw(); // vẽ lại cả trang để tẩy (destination-out) luôn đúng thứ tự
  });
  const endDraw = e => {
    if (!drawing) return;
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
    $('scPen').classList.toggle('active', state.tool === 'pen');
    $('scEraser').classList.toggle('active', state.tool === 'eraser');
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

  $('scPen').addEventListener('click', () => { state.tool = 'pen'; updateUI(); });
  $('scEraser').addEventListener('click', () => { state.tool = 'eraser'; updateUI(); });
  panel.querySelectorAll('.sc-swatch').forEach(b => b.addEventListener('click', () => {
    state.color = b.dataset.color; state.tool = 'pen'; updateUI(); save();
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
  $('scGrip').addEventListener('pointerdown', e => {
    drag = { type: 'size', sx: e.clientX, sy: e.clientY, bw: state.box.w, bh: state.box.h };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  const onMove = e => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (drag.type === 'move') { state.box.x = drag.bx + dx; state.box.y = drag.by + dy; }
    else { state.box.w = drag.bw + dx; state.box.h = drag.bh + dy; }
    applyBox();
    if (drag.type === 'size') fitCanvas();
  };
  const onUp = () => { if (drag) { drag = null; fitCanvas(); save(); } };
  head.addEventListener('pointermove', onMove);
  $('scGrip').addEventListener('pointermove', onMove);
  head.addEventListener('pointerup', onUp);
  $('scGrip').addEventListener('pointerup', onUp);
  head.addEventListener('pointercancel', onUp);
  $('scGrip').addEventListener('pointercancel', onUp);

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
