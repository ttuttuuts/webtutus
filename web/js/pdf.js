/* ============================================================
   PDF READER MODULE
   ============================================================ */
(function () {
  'use strict';

  let pdfDoc = null, currentFile = null, currentName = 'document', currentFileId = null, currentScale = 1;
  let allLines = [], selectedEls = [], popupCollapsed = false, userMovedPopup = false, popupPos = { x: 0, y: 0 };
  let activeTool = null, penColor = '#ef4444', penWidth = 2, allStrokes = [];
  let marqueeActive = false, marqueeStart = { x: 0, y: 0 }, marqueeEnd = { x: 0, y: 0 };
  let pointerX = 0, pointerY = 0, pointerInViewer = false, rafUpdate = null;
  let rightPdfDoc = null, rightFile = null, rightScale = 1, rightHidden = false, rightFileId = null, rightBaseFit = null;
  let selectMode = false, leftRenderVersion = 0, rightRenderVersion = 0, leftObserver = null, rightObserver = null;
  let panState = { active: false, moved: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, pointerId: null };
  let pendingRestoreScroll = 0, lastRenderedWidth = 0;
  const LINE_HIT_RATIO = 0.5;
  const DPR = window.devicePixelRatio || 1;
  const RENDER_ROOT_MARGIN = 800;
  const B_DOUBLE_MS = 280;
  let bPressCount = 0, bPressTimer = null;

  const toast = (m) => window.App.toast(m);
  const showSaveToast = (m) => window.App.showSaveToast(m);
  const formatSize = (b) => window.App.formatSize(b);
  const formatDate = (t) => window.App.formatDate(t);

  /* ---------- DOM ---------- */
  const dropEl = document.getElementById('drop'), fileInput = document.getElementById('fileInput'), fileInput2 = document.getElementById('fileInput2');
  const viewer = document.getElementById('viewer'), viewer2 = document.getElementById('viewer2');
  const pagesEl = document.getElementById('pages'), pages2El = document.getElementById('pages2');
  const hintLabel = document.getElementById('hintLabel'), holdHint = document.getElementById('holdHint');
  const toolbar = document.getElementById('toolbar'), fileNameEl = document.getElementById('fileName'), pageBadge = document.getElementById('pageBadge');
  const zoomGroup = document.getElementById('zoomGroup'), zoomLabel = document.getElementById('zoomLabel');
  const colorPicker = document.getElementById('colorPicker'), marqueeBox = document.getElementById('marqueeBox');
  const penGroup = document.getElementById('penGroup'), penBtn = document.getElementById('penBtn'), eraserBtn = document.getElementById('eraserBtn');
  const penColorInput = document.getElementById('penColor'), penClear = document.getElementById('penClear'), eraserCursor = document.getElementById('eraserCursor');
  const selectModeBtn = document.getElementById('selectModeBtn');
  const popup = document.getElementById('popup'), popupHead = document.getElementById('popupHead'), popupTitle = document.getElementById('popupTitle');
  const popupBody = document.getElementById('popupBody'), popupToggle = document.getElementById('popupToggle');
  const popupCopy = document.getElementById('popupCopy'), popupGoogle = document.getElementById('popupGoogle'), popupGemini = document.getElementById('popupGemini');
  const savedFilesBtn = document.getElementById('savedFilesBtn'), savedPanel = document.getElementById('savedPanel'), savedList = document.getElementById('savedList'), savedCount = document.getElementById('savedCount');
  const viewerContainer = document.getElementById('viewerContainer');
  const splitBtn = document.getElementById('splitBtn'), swapBtn = document.getElementById('swapBtn'), closeSplitBtn = document.getElementById('closeSplitBtn');
  const pickRightFile = document.getElementById('pickRightFile'), paneEmpty = document.getElementById('paneEmpty'), paneRightTitle = document.getElementById('paneRightTitle');
  const changeRightFileBtn = document.getElementById('changeRightFileBtn'), hideRightBtn = document.getElementById('hideRightBtn');
  const paneZoomIn = document.getElementById('paneZoomIn'), paneZoomOut = document.getElementById('paneZoomOut'), paneZoomLabel = document.getElementById('paneZoomLabel');
  const musicBtn = document.getElementById('musicBtn'), musicPanel = document.getElementById('musicPanel'), musicClose = document.getElementById('musicClose');
  const musicInput = document.getElementById('musicInput'), musicPlayBtn = document.getElementById('musicPlayBtn'), musicLocalBtn = document.getElementById('musicLocalBtn');
  const musicEmbed = document.getElementById('musicEmbed'), musicIframe = document.getElementById('musicIframe');
  const musicLocalWrap = document.getElementById('musicLocalWrap'), musicAudio = document.getElementById('musicAudio'), musicFile = document.getElementById('musicFile');

  function getEraserRadiusCanvas() { return penWidth * 4; }

  /* ---------- HINTS ---------- */
  function autoHideHint() {
    if (!holdHint) return;
    holdHint.classList.remove('hidden-hint');
    clearTimeout(holdHint._hideT);
    holdHint._hideT = setTimeout(() => holdHint.classList.add('hidden-hint'), 4000);
  }
  function showHintTemporarily() {
    if (!holdHint) return;
    holdHint.classList.remove('hidden-hint');
    clearTimeout(holdHint._hideT);
    holdHint._hideT = setTimeout(() => holdHint.classList.add('hidden-hint'), 3000);
  }

  /* ---------- PANE ZOOM ---------- */
  function updatePaneZoomUI() { paneZoomLabel.textContent = Math.round(rightScale * 100) + '%'; }
  paneZoomIn.addEventListener('click', e => { e.stopPropagation(); if (!rightPdfDoc) return; rightScale = Math.min(rightScale + 0.25, 3); updatePaneZoomUI(); renderRightPages(); });
  paneZoomOut.addEventListener('click', e => { e.stopPropagation(); if (!rightPdfDoc) return; rightScale = Math.max(rightScale - 0.25, 0.5); updatePaneZoomUI(); renderRightPages(); });

  /* ---------- SELECT MODE ---------- */
  function updateSelectModeUI() {
    selectModeBtn.classList.toggle('active', selectMode);
    viewer.classList.toggle('select-mode', selectMode);
    if (activeTool) return;
    if (selectMode) { hintLabel.textContent = '✂️ Chế độ chọn — kéo để tạo khung'; showHintTemporarily(); }
    else { hintLabel.textContent = 'Kéo chuột để cuộn — nhấn B 2 lần để chọn vùng'; showHintTemporarily(); }
  }
  selectModeBtn.addEventListener('click', () => {
    selectMode = !selectMode;
    if (selectMode && activeTool) { activeTool = null; updateToolUI(); }
    updateSelectModeUI();
    toast(selectMode ? '✂️ Bật chọn vùng' : '✋ Tắt chọn');
  });

  /* ---------- MUSIC ---------- */
  musicBtn.addEventListener('click', () => {
    const showing = musicPanel.classList.toggle('show');
    musicBtn.classList.toggle('active', showing);
    if (showing) setTimeout(() => musicInput.focus(), 100);
  });
  musicClose.addEventListener('click', () => { musicPanel.classList.remove('show'); musicBtn.classList.remove('active'); });
  function extractYouTubeId(url) {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : null;
  }
  function playMusic() {
    const val = musicInput.value.trim();
    if (!val) return toast('Nhập link YouTube hoặc tên bài hát');
    const ytId = extractYouTubeId(val);
    if (ytId) {
      musicEmbed.classList.add('show'); musicLocalWrap.classList.remove('show');
      musicAudio.pause();
      musicIframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`;
      toast('🎵 Đang phát trên YouTube');
    } else {
      window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(val)}`, '_blank');
      toast('🔍 Đã tìm trên YouTube');
    }
  }
  musicPlayBtn.addEventListener('click', playMusic);
  musicInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); playMusic(); } });
  musicLocalBtn.addEventListener('click', () => musicFile.click());
  musicFile.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    musicLocalWrap.classList.add('show'); musicEmbed.classList.remove('show');
    musicIframe.src = '';
    musicAudio.src = URL.createObjectURL(file);
    musicAudio.play().catch(() => {});
    toast('🎵 Đang phát: ' + file.name);
    musicFile.value = '';
  });

  /* ---------- INDEXEDDB ---------- */
  const DB_NAME = 'pdf-reader-db', DB_VERSION = 1, STORE = 'files';
  let db = null;
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => { const d = e.target.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }
  function dbPut(item) { return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(item); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
  function dbGet(id) { return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  function dbGetAll() { return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }); }
  function dbDelete(id) { return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
  function makeFileId(file) { return `${file.name}_${file.size}_${file.lastModified}`; }
  async function saveFileToDB(file) {
    const id = makeFileId(file);
    const existing = await dbGet(id); if (existing) return existing;
    const buffer = await file.arrayBuffer();
    const item = { id, name: file.name, size: file.size, lastModified: file.lastModified, buffer, strokes: [], scrollTop: 0, rightScrollTop: 0, savedAt: Date.now(), createdAt: Date.now() };
    await dbPut(item);
    return item;
  }
  async function updateStrokesInDB(id, strokes) {
    if (!id) return;
    const item = await dbGet(id); if (!item) return;
    item.strokes = strokes.map(s => ({ pageIdx: s.pageIdx, color: s.color, width: s.width, points: s.points.map(p => ({ x: p.x, y: p.y })) }));
    item.savedAt = Date.now();
    await dbPut(item);
  }
  let saveTimer = null, scrollSaveTimer = null, rightScrollSaveTimer = null;
  function scheduleSaveStrokes() {
    if (!currentFileId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await updateStrokesInDB(currentFileId, allStrokes); showSaveToast('💾 Đã lưu nét vẽ'); refreshSavedList(); } catch (_) {}
    }, 400);
  }
  function scheduleSaveScroll() {
    if (!currentFileId) return;
    pendingRestoreScroll = viewer.scrollTop;
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(async () => { try { const item = await dbGet(currentFileId); if (!item) return; item.scrollTop = viewer.scrollTop; await dbPut(item); } catch (_) {} }, 500);
  }
  function scheduleSaveRightScroll() {
    if (!rightFileId) return;
    clearTimeout(rightScrollSaveTimer);
    rightScrollSaveTimer = setTimeout(async () => { try { const item = await dbGet(rightFileId); if (!item) return; item.rightScrollTop = viewer2.scrollTop; await dbPut(item); } catch (_) {} }, 500);
  }

  async function refreshSavedList() {
    const items = await dbGetAll();
    items.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    savedCount.textContent = items.length;
    if (items.length === 0) { savedList.innerHTML = `<div class="saved-empty">Chưa có file nào được lưu.<br>Kéo file PDF vào để bắt đầu.</div>`; return; }
    savedList.innerHTML = '';
    for (const item of items) {
      const div = document.createElement('div');
      div.className = 'saved-item' + (item.id === currentFileId ? ' current' : '');
      div.dataset.id = item.id;
      const strokeCount = (item.strokes || []).length;
      div.innerHTML = `
        <div class="saved-item-icon">📄</div>
        <div class="saved-item-info">
          <div class="saved-item-name-row">
            <div class="saved-item-name" title="${item.name}">${item.name}</div>
            <button class="saved-item-del" data-del="${item.id}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
          <div class="saved-item-meta">
            <span>${formatSize(item.size)}</span><span class="dot-sep">•</span>
            <span>${formatDate(item.savedAt || item.createdAt)}</span>
            ${strokeCount > 0 ? `<span class="dot-sep">•</span><span class="stroke-badge">✏️ ${strokeCount}</span>` : ''}
          </div>
        </div>`;
      div.addEventListener('click', e => {
        if (e.target.closest('.saved-item-del')) return;
        loadSavedFile(item.id);
        savedPanel.classList.remove('show');
        savedFilesBtn.classList.remove('active');
      });
      div.querySelector('.saved-item-del').addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(`Xoá "${item.name}" khỏi danh sách?`)) return;
        await dbDelete(item.id);
        if (item.id === currentFileId) { currentFileId = null; localStorage.removeItem('pdfReader_lastFileId'); }
        if (item.id === rightFileId) { rightFileId = null; localStorage.removeItem('pdfReader_rightFileId'); }
        refreshSavedList();
        toast('🗑️ Đã xoá');
      });
      savedList.appendChild(div);
    }
  }

  async function loadSavedFile(id) {
    try {
      const item = await dbGet(id);
      if (!item) { toast('❌ Không tìm thấy file'); return; }
      if (currentFileId && currentFileId !== id) {
        try { await updateStrokesInDB(currentFileId, allStrokes); const oldItem = await dbGet(currentFileId); if (oldItem) { oldItem.scrollTop = viewer.scrollTop; await dbPut(oldItem); } } catch (_) {}
      }
      const fileBlob = new Blob([item.buffer], { type: 'application/pdf' });
      const fileObj = new File([fileBlob], item.name, { type: 'application/pdf' });
      currentFileId = id; currentFile = fileObj;
      currentName = item.name.replace(/\.pdf$/i, '');
      localStorage.setItem('pdfReader_lastFileId', id);
      currentScale = 1; userMovedPopup = false;
      allStrokes = (item.strokes || []).map(s => ({ pageIdx: s.pageIdx, color: s.color, width: s.width, points: s.points.map(p => ({ x: p.x, y: p.y })) }));
      activeTool = null;
      fileNameEl.textContent = item.name;
      pageBadge.textContent = '…';
      zoomLabel.textContent = '100%';
      toolbar.classList.add('show'); zoomGroup.classList.add('show'); colorPicker.classList.add('show'); penGroup.classList.add('show');
      splitBtn.disabled = false;
      document.body.classList.add('viewing');
      dropEl.style.display = 'none';
      viewer.classList.add('show');
      pdfDoc = await pdfjsLib.getDocument({ data: item.buffer.slice(0) }).promise;
      pageBadge.textContent = pdfDoc.numPages + ' trang';
      await renderAllPages();
      updateToolUI(); updateSelectModeUI();
      refreshSavedList();
      autoHideHint();
      pendingRestoreScroll = item.scrollTop || 0;
      if (viewer.clientWidth > 0 && pendingRestoreScroll > 0) { await new Promise(r => setTimeout(r, 100)); viewer.scrollTop = pendingRestoreScroll; pendingRestoreScroll = 0; }
      const strokeMsg = allStrokes.length > 0 ? ` — đã khôi phục ${allStrokes.length} nét vẽ` : '';
      toast('✅ Đã mở lại: ' + item.name + strokeMsg);
    } catch (_) { toast('❌ Không mở được file đã lưu'); }
  }

  savedFilesBtn.addEventListener('click', e => {
    e.stopPropagation();
    const showing = savedPanel.classList.toggle('show');
    savedFilesBtn.classList.toggle('active', showing);
    if (showing) refreshSavedList();
  });
  document.addEventListener('click', e => {
    if (e.target.closest('#savedPanel')) return;
    if (e.target.closest('#savedFilesBtn')) return;
    savedPanel.classList.remove('show');
    savedFilesBtn.classList.remove('active');
  });

  /* ---------- TEXT EXTRACTION ---------- */
  function groupIntoLines(viewport, textContent) {
    const tx = viewport.transform, lines = [];
    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue;
      const m = pdfjsLib.Util.transform(tx, item.transform);
      const x = m[4], y = m[5], fontH = Math.hypot(m[1], m[3]) || 10;
      let line = null;
      for (const l of lines) { if (Math.abs(l.y - y) < fontH * 0.55) { line = l; break; } }
      if (!line) { line = { y, fontH, items: [] }; lines.push(line); }
      line.items.push({ text: item.str, x, width: item.width || 0 });
    }
    lines.sort((a, b) => a.y - b.y);
    return lines;
  }
  function buildLineText(line) {
    line.items.sort((a, b) => a.x - b.x);
    const fontH = line.fontH || 10, threshold = fontH * 0.18;
    let text = '', prevEnd = null;
    for (const it of line.items) {
      if (prevEnd !== null && (it.x - prevEnd) > threshold) text += ' ';
      text += it.text;
      prevEnd = it.x + it.width;
    }
    return text.replace(/\s+/g, ' ').trim();
  }
  function buildTextLayer(viewport, textContent, wrap) {
    const layer = document.createElement('div');
    layer.className = 'text-layer';
    const lines = groupIntoLines(viewport, textContent), hits = [];
    for (const line of lines) {
      const text = buildLineText(line); if (!text) continue;
      line.items.sort((a, b) => a.x - b.x);
      const first = line.items[0], last = line.items[line.items.length - 1];
      const minX = first.x, maxX = last.x + last.width, fontH = line.fontH || 10;
      const span = document.createElement('div');
      span.className = 'line-hit';
      span.style.left = Math.max(0, minX - 2) + 'px';
      span.style.top = (line.y - fontH * 1.15) + 'px';
      span.style.width = Math.max(8, (maxX - minX) + 4) + 'px';
      span.style.height = Math.max(8, fontH * 1.5) + 'px';
      span.dataset.text = text;
      span._globalIndex = allLines.length;
      allLines.push(span);
      hits.push(span);
      layer.appendChild(span);
    }
    wrap._lineHits = hits;
    return layer;
  }

  /* ---------- DRAWING ---------- */
  function redrawStrokes(canvas, pageIdx) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of allStrokes) {
      if (s.pageIdx !== pageIdx) continue;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
      ctx.lineWidth = s.width;
      if (s.points.length === 1) { const p = s.points[0]; ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, s.width / 2, 0, Math.PI * 2); ctx.fill(); continue; }
      ctx.beginPath();
      ctx.moveTo(s.points[0].x * canvas.width, s.points[0].y * canvas.height);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * canvas.width, s.points[i].y * canvas.height);
      ctx.stroke();
    }
  }
  function eraseAt(canvas, pageIdx, px, py, radiusPx) {
    const before = allStrokes.length, r2 = radiusPx * radiusPx;
    allStrokes = allStrokes.filter(s => {
      if (s.pageIdx !== pageIdx) return true;
      for (const p of s.points) {
        const sx = p.x * canvas.width, sy = p.y * canvas.height;
        const dx = sx - px, dy = sy - py;
        if (dx * dx + dy * dy <= r2) return false;
      }
      return true;
    });
    const changed = before !== allStrokes.length;
    if (changed) redrawStrokes(canvas, pageIdx);
    return changed;
  }
  function setupDrawCanvas(wrap, pageIdx) {
    const canvas = document.createElement('canvas');
    canvas.className = 'draw-canvas';
    canvas.dataset.pageIdx = pageIdx;
    canvas.width = parseInt(wrap.style.width);
    canvas.height = parseInt(wrap.style.height);
    if (activeTool) canvas.style.pointerEvents = 'auto';
    wrap.appendChild(canvas);
    redrawStrokes(canvas, pageIdx);
    setupDrawEvents(canvas, pageIdx);
    return canvas;
  }
  function setupDrawEvents(canvas, pageIdx) {
    let drawing = false, currentStroke = null;
    const getCanvasPos = e => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
      return { px: (e.clientX - rect.left) * scaleX, py: (e.clientY - rect.top) * scaleY, nx: (e.clientX - rect.left) / rect.width, ny: (e.clientY - rect.top) / rect.height };
    };
    canvas.addEventListener('pointerdown', e => {
      if (!activeTool) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault(); e.stopPropagation();
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      drawing = true;
      const { px, py, nx, ny } = getCanvasPos(e);
      if (activeTool === 'pen') {
        currentStroke = { pageIdx, color: penColor, width: penWidth, points: [{ x: nx, y: ny }] };
        allStrokes.push(currentStroke);
        redrawStrokes(canvas, pageIdx);
      } else if (activeTool === 'eraser') eraseAt(canvas, pageIdx, px, py, getEraserRadiusCanvas());
    });
    canvas.addEventListener('pointermove', e => {
      if (activeTool === 'eraser') { pointerX = e.clientX; pointerY = e.clientY; pointerInViewer = true; scheduleEraserCursorUpdate(); }
      if (!drawing || !activeTool) return;
      e.preventDefault();
      const { px, py, nx, ny } = getCanvasPos(e);
      if (activeTool === 'pen' && currentStroke) { currentStroke.points.push({ x: nx, y: ny }); redrawStrokes(canvas, pageIdx); }
      else if (activeTool === 'eraser') eraseAt(canvas, pageIdx, px, py, getEraserRadiusCanvas());
    });
    const end = e => {
      if (!drawing) return;
      drawing = false; currentStroke = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      if (activeTool === 'pen' || activeTool === 'eraser') scheduleSaveStrokes();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', e => { if (e.buttons === 0) end(e); });
  }
  function updateToolUI() {
    const isPen = activeTool === 'pen', isEraser = activeTool === 'eraser', hasTool = isPen || isEraser;
    penBtn.classList.toggle('active', isPen);
    eraserBtn.classList.toggle('active', isEraser);
    penGroup.classList.toggle('active', hasTool);
    penGroup.classList.toggle('eraser-mode', isEraser);
    viewer.classList.toggle('pen-mode', isPen);
    viewer.classList.toggle('eraser-mode', isEraser);
    document.querySelectorAll('.draw-canvas').forEach(c => {
      c.style.pointerEvents = hasTool ? 'auto' : 'none';
      c.style.cursor = isEraser ? 'none' : (isPen ? 'crosshair' : 'default');
    });
    if (isPen) { hintLabel.textContent = '✏️ Đang bật bút vẽ'; showHintTemporarily(); eraserCursor.classList.remove('show'); }
    else if (isEraser) {
      hintLabel.textContent = '🧽 Đang bật cục tẩy'; showHintTemporarily();
      updateEraserCursorSize();
      if (pointerInViewer) { eraserCursor.style.left = pointerX + 'px'; eraserCursor.style.top = pointerY + 'px'; eraserCursor.classList.add('show'); }
    } else {
      hintLabel.textContent = selectMode ? '✂️ Chế độ chọn — kéo để tạo khung' : 'Kéo chuột để cuộn — nhấn B 2 lần để chọn vùng';
      eraserCursor.classList.remove('show');
    }
  }
  penBtn.addEventListener('click', () => {
    activeTool = (activeTool === 'pen') ? null : 'pen';
    if (activeTool) { selectMode = false; updateSelectModeUI(); }
    updateToolUI();
    toast(activeTool === 'pen' ? '✏️ Bật bút vẽ' : 'Đã tắt bút vẽ');
  });
  eraserBtn.addEventListener('click', () => {
    activeTool = (activeTool === 'eraser') ? null : 'eraser';
    if (activeTool) { selectMode = false; updateSelectModeUI(); }
    updateToolUI();
    toast(activeTool === 'eraser' ? '🧽 Bật cục tẩy' : 'Đã tắt cục tẩy');
  });
  penColorInput.addEventListener('input', e => { penColor = e.target.value; });
  document.querySelectorAll('.pen-size').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pen-size').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      penWidth = parseInt(btn.dataset.size, 10);
      updateEraserCursorSize();
    });
  });
  penClear.addEventListener('click', async () => {
    if (allStrokes.length === 0) return toast('Chưa có nét vẽ nào');
    if (!confirm('Xoá tất cả nét vẽ?')) return;
    allStrokes = [];
    document.querySelectorAll('.draw-canvas').forEach(c => redrawStrokes(c, parseInt(c.dataset.pageIdx, 10)));
    scheduleSaveStrokes();
    toast('🗑️ Đã xoá hết nét vẽ');
  });
  function updateEraserCursorSize() {
    const anyCanvas = document.querySelector('.draw-canvas');
    let displayScale = currentScale;
    if (anyCanvas) { const rect = anyCanvas.getBoundingClientRect(); if (anyCanvas.width > 0) displayScale = rect.width / anyCanvas.width; }
    const diameter = getEraserRadiusCanvas() * 2 * displayScale;
    eraserCursor.style.width = diameter + 'px';
    eraserCursor.style.height = diameter + 'px';
  }
  function scheduleEraserCursorUpdate() {
    if (rafUpdate) return;
    rafUpdate = requestAnimationFrame(() => {
      rafUpdate = null;
      if (activeTool !== 'eraser' || !pointerInViewer) { eraserCursor.classList.remove('show'); return; }
      eraserCursor.style.left = pointerX + 'px';
      eraserCursor.style.top = pointerY + 'px';
      eraserCursor.classList.add('show');
    });
  }
  document.addEventListener('pointermove', e => {
    if (activeTool !== 'eraser') return;
    pointerX = e.clientX; pointerY = e.clientY;
    const rect = viewer.getBoundingClientRect();
    pointerInViewer = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!pointerInViewer) { eraserCursor.classList.remove('show'); return; }
    updateEraserCursorSize();
    scheduleEraserCursorUpdate();
  }, { passive: true });
  viewer.addEventListener('pointerleave', () => { pointerInViewer = false; eraserCursor.classList.remove('show'); });
  viewer.addEventListener('scroll', () => { if (activeTool === 'eraser' && pointerInViewer) { updateEraserCursorSize(); scheduleEraserCursorUpdate(); } }, { passive: true });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (!pdfDoc) return;
    if (!document.body.classList.contains('on-reader')) return;
    if (e.key === 'b' || e.key === 'B') {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      bPressCount++;
      clearTimeout(bPressTimer);
      if (bPressCount >= 2) { bPressCount = 0; selectModeBtn.click(); }
      else bPressTimer = setTimeout(() => { bPressCount = 0; penBtn.click(); }, B_DOUBLE_MS);
      return;
    }
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); eraserBtn.click(); }
    if (e.key === 'Escape') {
      if (activeTool) { activeTool = null; updateToolUI(); }
      if (selectMode) { selectMode = false; updateSelectModeUI(); }
    }
  });

  function updateMarqueeBox() {
    const x = Math.min(marqueeStart.x, marqueeEnd.x), y = Math.min(marqueeStart.y, marqueeEnd.y);
    const w = Math.abs(marqueeEnd.x - marqueeStart.x), h = Math.abs(marqueeEnd.y - marqueeStart.y);
    marqueeBox.style.left = x + 'px'; marqueeBox.style.top = y + 'px';
    marqueeBox.style.width = w + 'px'; marqueeBox.style.height = h + 'px';
  }
  viewer.addEventListener('pointerdown', e => {
    if (activeTool) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target.closest('.toolbar') || e.target.closest('.popup')) return;
    if (e.target.closest('.draw-canvas')) return;
    if (selectMode) {
      e.preventDefault();
      marqueeActive = true;
      marqueeStart = { x: e.clientX, y: e.clientY };
      marqueeEnd = { x: e.clientX, y: e.clientY };
      updateMarqueeBox();
      marqueeBox.classList.add('show');
      try { viewer.setPointerCapture(e.pointerId); } catch (_) {}
    } else {
      if (e.pointerType === 'mouse') {
        panState.active = true; panState.moved = false;
        panState.startX = e.clientX; panState.startY = e.clientY;
        panState.scrollLeft = viewer.scrollLeft; panState.scrollTop = viewer.scrollTop;
        panState.pointerId = e.pointerId;
      }
    }
  });
  viewer.addEventListener('pointermove', e => {
    if (panState.active) {
      const dx = e.clientX - panState.startX, dy = e.clientY - panState.startY;
      if (!panState.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) { panState.moved = true; viewer.classList.add('panning'); try { viewer.setPointerCapture(panState.pointerId); } catch (_) {} }
      if (panState.moved) { e.preventDefault(); viewer.scrollLeft = panState.scrollLeft - dx; viewer.scrollTop = panState.scrollTop - dy; }
      return;
    }
    if (!marqueeActive) return;
    marqueeEnd = { x: e.clientX, y: e.clientY };
    updateMarqueeBox();
  });
  function finishMarquee(e) {
    if (!marqueeActive) return;
    marqueeActive = false;
    marqueeBox.classList.remove('show');
    try { viewer.releasePointerCapture(e.pointerId); } catch (_) {}
    const rect = { left: Math.min(marqueeStart.x, marqueeEnd.x), top: Math.min(marqueeStart.y, marqueeEnd.y), right: Math.max(marqueeStart.x, marqueeEnd.x), bottom: Math.max(marqueeStart.y, marqueeEnd.y) };
    if ((rect.right - rect.left) < 6 && (rect.bottom - rect.top) < 6) { clearSelection(); return; }
    const hits = [];
    for (const el of allLines) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      const iLeft = Math.max(r.left, rect.left), iTop = Math.max(r.top, rect.top);
      const iRight = Math.min(r.right, rect.right), iBottom = Math.min(r.bottom, rect.bottom);
      if (iRight <= iLeft || iBottom <= iTop) continue;
      const vRatio = (iBottom - iTop) / r.height;
      if (vRatio >= LINE_HIT_RATIO) hits.push(el);
    }
    hits.sort((a, b) => a._globalIndex - b._globalIndex);
    for (const el of selectedEls) el.classList.remove('selected', 'flash');
    selectedEls = hits;
    for (const el of hits) { el.classList.add('selected'); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 500); }
    if (hits.length > 0) showPopup(); else hidePopup();
  }
  viewer.addEventListener('pointerup', e => {
    if (panState.active) { panState.active = false; panState.moved = false; viewer.classList.remove('panning'); try { viewer.releasePointerCapture(panState.pointerId); } catch (_) {} return; }
    finishMarquee(e);
  });
  viewer.addEventListener('pointercancel', e => {
    if (panState.active) { panState.active = false; panState.moved = false; viewer.classList.remove('panning'); try { viewer.releasePointerCapture(panState.pointerId); } catch (_) {} return; }
    finishMarquee(e);
  });
  viewer.addEventListener('dblclick', e => {
    if (activeTool || !pdfDoc) return;
    if (e.target.closest('.toolbar') || e.target.closest('.popup')) return;
    if (e.target.closest('.draw-canvas')) return;
    const x = e.clientX, y = e.clientY;
    let target = null;
    for (const el of allLines) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { target = el; break; }
    }
    if (!target) return;
    if (target.classList.contains('selected')) { target.classList.remove('selected', 'flash'); selectedEls = selectedEls.filter(el => el !== target); }
    else {
      target.classList.add('selected', 'flash');
      setTimeout(() => target.classList.remove('flash'), 500);
      if (!selectedEls.includes(target)) selectedEls.push(target);
      selectedEls.sort((a, b) => a._globalIndex - b._globalIndex);
    }
    if (selectedEls.length > 0) showPopup(); else hidePopup();
  });

  /* ---------- POPUP ---------- */
  function showPopup() {
    const lines = selectedEls.map(el => el.dataset.text);
    popupTitle.textContent = `Đã chọn ${selectedEls.length} dòng`;
    popupBody.textContent = lines.join('\n') || '(Không có chữ)';
    popupBody.scrollTop = 0;
    popup.classList.add('show');
    const lastEl = selectedEls[selectedEls.length - 1];
    requestAnimationFrame(() => { if (!userMovedPopup) positionPopupUnder(lastEl); else clampPopupInViewport(); });
  }
  function positionPopupUnder(lastEl) {
    if (!lastEl || !popup.classList.contains('show')) return;
    const rect = lastEl.getBoundingClientRect();
    popup.style.visibility = 'hidden';
    const pr = popup.getBoundingClientRect();
    popup.style.visibility = '';
    const GAP = 8;
    let top = rect.bottom + GAP, left = rect.left + rect.width / 2 - pr.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - pr.width - 8));
    if (top + pr.height > window.innerHeight - 8) { top = rect.top - pr.height - GAP; if (top < 8) top = 8; }
    popup.style.top = top + 'px'; popup.style.left = left + 'px';
    popupPos = { x: left, y: top };
  }
  function clampPopupInViewport() {
    const pr = popup.getBoundingClientRect();
    const x = Math.max(4, Math.min(pr.left, window.innerWidth - pr.width - 4));
    const y = Math.max(4, Math.min(pr.top, window.innerHeight - pr.height - 4));
    popup.style.left = x + 'px'; popup.style.top = y + 'px';
    popupPos = { x, y };
  }
  let scrollRaf = null;
  viewer.addEventListener('scroll', () => {
    if (!popup.classList.contains('show')) return;
    if (userMovedPopup) return;
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      if (selectedEls.length > 0 && selectedEls[selectedEls.length - 1].isConnected) positionPopupUnder(selectedEls[selectedEls.length - 1]);
    });
  }, { passive: true });
  window.addEventListener('resize', () => { if (popup.classList.contains('show')) clampPopupInViewport(); });
  let draggingPopup = false, dragOffsetX = 0, dragOffsetY = 0;
  popupHead.addEventListener('pointerdown', e => {
    if (e.target.closest('.popup-toggle')) return;
    if (e.button !== 0) return;
    const rect = popup.getBoundingClientRect();
    draggingPopup = true;
    dragOffsetX = e.clientX - rect.left; dragOffsetY = e.clientY - rect.top;
    popupHead.classList.add('dragging');
    try { popupHead.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault(); e.stopPropagation();
  });
  popupHead.addEventListener('pointermove', e => {
    if (!draggingPopup) return;
    const pr = popup.getBoundingClientRect();
    const x = Math.max(4, Math.min(e.clientX - dragOffsetX, window.innerWidth - pr.width - 4));
    const y = Math.max(4, Math.min(e.clientY - dragOffsetY, window.innerHeight - pr.height - 4));
    popup.style.left = x + 'px'; popup.style.top = y + 'px';
    popupPos = { x, y }; userMovedPopup = true;
  });
  function endDrag(e) { if (!draggingPopup) return; draggingPopup = false; popupHead.classList.remove('dragging'); try { popupHead.releasePointerCapture(e.pointerId); } catch (_) {} }
  popupHead.addEventListener('pointerup', endDrag);
  popupHead.addEventListener('pointercancel', endDrag);
  popupHead.addEventListener('dblclick', e => {
    if (e.target.closest('.popup-toggle')) return;
    userMovedPopup = false;
    if (selectedEls.length > 0) { positionPopupUnder(selectedEls[selectedEls.length - 1]); toast('📍 Đã bám lại vào dòng'); }
  });
  function togglePopup() {
    popupCollapsed = !popupCollapsed;
    popup.classList.toggle('collapsed', popupCollapsed);
    popupToggle.textContent = popupCollapsed ? '<>' : '><';
    requestAnimationFrame(() => {
      if (userMovedPopup) clampPopupInViewport();
      else if (selectedEls.length > 0 && selectedEls[selectedEls.length - 1].isConnected) positionPopupUnder(selectedEls[selectedEls.length - 1]);
    });
  }
  popupToggle.addEventListener('click', e => { e.stopPropagation(); togglePopup(); });
  function hidePopup() { popup.classList.remove('show'); }
  function clearSelection() {
    for (const el of selectedEls) el.classList.remove('selected', 'dragging', 'flash');
    selectedEls = []; hidePopup(); userMovedPopup = false;
  }

  /* ---------- RENDERING ---------- */
  function createPlaceholder(pageIdx, width, height) {
    const wrap = document.createElement('div');
    wrap.className = 'page-container';
    wrap.style.width = width + 'px';
    wrap.style.height = height + 'px';
    wrap.dataset.pageIdx = pageIdx;
    wrap.dataset.rendered = '0';
    wrap._lineHits = [];
    return wrap;
  }
  async function renderPageInto(renderer, wrap) {
    if (wrap.dataset.rendered === '1') return;
    if (renderer.version !== renderer.currentVersion()) return;
    wrap.dataset.rendered = '1';
    const pageIdx = parseInt(wrap.dataset.pageIdx, 10), pageNum = pageIdx + 1;
    try {
      const page = await renderer.pdfDoc.getPage(pageNum);
      if (renderer.version !== renderer.currentVersion()) { wrap.dataset.rendered = '0'; return; }
      const baseVp = page.getViewport({ scale: 1 });
      const fitScale = Math.min(renderer.availWidth() / baseVp.width, 2);
      const scale = fitScale * renderer.scale();
      const displayViewport = page.getViewport({ scale });
      const dprViewport = page.getViewport({ scale: scale * DPR });
      const cssW = Math.floor(displayViewport.width), cssH = Math.floor(displayViewport.height);
      if (parseInt(wrap.style.width) !== cssW) wrap.style.width = cssW + 'px';
      if (parseInt(wrap.style.height) !== cssH) wrap.style.height = cssH + 'px';
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(dprViewport.width); canvas.height = Math.floor(dprViewport.height);
      canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: dprViewport }).promise;
      if (renderer.version !== renderer.currentVersion()) { wrap.dataset.rendered = '0'; return; }
      wrap.insertBefore(canvas, wrap.firstChild);
      const textContent = await page.getTextContent();
      if (renderer.version !== renderer.currentVersion()) { wrap.dataset.rendered = '0'; return; }
      const textLayer = buildTextLayer(displayViewport, textContent, wrap);
      wrap.appendChild(textLayer);
      setupDrawCanvas(wrap, pageIdx);
      updateEraserCursorSize();
    } catch (_) { wrap.dataset.rendered = '0'; wrap.innerHTML = ''; }
  }
  function unrenderPage(wrap) {
    if (wrap.dataset.rendered !== '1') return;
    const hits = wrap._lineHits || [];
    for (const h of hits) {
      h.classList.remove('selected');
      const i1 = allLines.indexOf(h); if (i1 >= 0) allLines.splice(i1, 1);
      const i2 = selectedEls.indexOf(h); if (i2 >= 0) selectedEls.splice(i2, 1);
    }
    wrap._lineHits = [];
    wrap.innerHTML = '';
    wrap.dataset.rendered = '0';
    if (selectedEls.length === 0) hidePopup();
  }
  async function renderAllPages() {
    if (!pdfDoc) return;
    const myVersion = ++leftRenderVersion;
    if (leftObserver) { leftObserver.disconnect(); leftObserver = null; }
    pagesEl.innerHTML = '';
    allLines = []; selectedEls = []; hidePopup();
    const availWidth = Math.max((viewer.clientWidth || 800) - 48, 320);
    const wraps = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      if (myVersion !== leftRenderVersion) return;
      const page = await pdfDoc.getPage(i);
      if (myVersion !== leftRenderVersion) return;
      const base = page.getViewport({ scale: 1 });
      const fitScale = Math.min(availWidth / base.width, 2);
      const viewport = page.getViewport({ scale: fitScale * currentScale });
      const wrap = createPlaceholder(i - 1, Math.floor(viewport.width), Math.floor(viewport.height));
      pagesEl.appendChild(wrap);
      wraps.push(wrap);
    }
    lastRenderedWidth = viewer.clientWidth || 0;
    const renderer = { pdfDoc, version: myVersion, currentVersion: () => leftRenderVersion, availWidth: () => Math.max((viewer.clientWidth || 800) - 48, 320), scale: () => currentScale };
    leftObserver = new IntersectionObserver(entries => {
      if (myVersion !== leftRenderVersion) return;
      for (const entry of entries) {
        const wrap = entry.target;
        if (entry.isIntersecting) renderPageInto(renderer, wrap);
        else unrenderPage(wrap);
      }
    }, { root: viewer, rootMargin: `${RENDER_ROOT_MARGIN}px 0px`, threshold: 0 });
    wraps.forEach(w => leftObserver.observe(w));
    if (wraps[0]) renderPageInto(renderer, wraps[0]);
  }
  async function renderRightPages() {
    if (!rightPdfDoc) return;
    const myVersion = ++rightRenderVersion;
    if (rightObserver) { rightObserver.disconnect(); rightObserver = null; }
    pages2El.innerHTML = '';
    const availWidth = Math.max((viewer2.offsetWidth || 400) - 40, 220);
    if (rightBaseFit === null) {
      const firstPage = await rightPdfDoc.getPage(1);
      if (myVersion !== rightRenderVersion) return;
      const baseVp = firstPage.getViewport({ scale: 1 });
      rightBaseFit = Math.min(availWidth / baseVp.width, 2);
    }
    const wraps = [];
    for (let i = 1; i <= rightPdfDoc.numPages; i++) {
      if (myVersion !== rightRenderVersion) return;
      const page = await rightPdfDoc.getPage(i);
      if (myVersion !== rightRenderVersion) return;
      const viewport = page.getViewport({ scale: rightBaseFit * rightScale });
      const wrap = document.createElement('div');
      wrap.className = 'page-container';
      wrap.style.width = Math.floor(viewport.width) + 'px';
      wrap.style.height = Math.floor(viewport.height) + 'px';
      wrap.dataset.pageIdx = i - 1;
      wrap.dataset.rendered = '0';
      wrap._lineHits = [];
      pages2El.appendChild(wrap);
      wraps.push(wrap);
    }
    const renderer = { pdfDoc: rightPdfDoc, version: myVersion, currentVersion: () => rightRenderVersion, availWidth: () => Math.max((viewer2.offsetWidth || 400) - 40, 220), scale: () => rightScale, _fixedFit: rightBaseFit };
    rightObserver = new IntersectionObserver(entries => {
      if (myVersion !== rightRenderVersion) return;
      for (const entry of entries) {
        const wrap = entry.target;
        if (entry.isIntersecting) renderRightPageInto(renderer, wrap);
        else unrenderRightPage(wrap);
      }
    }, { root: viewer2, rootMargin: `${RENDER_ROOT_MARGIN}px 0px`, threshold: 0 });
    wraps.forEach(w => rightObserver.observe(w));
    if (wraps[0]) renderRightPageInto(renderer, wraps[0]);
  }
  async function renderRightPageInto(renderer, wrap) {
    if (wrap.dataset.rendered === '1') return;
    if (renderer.version !== renderer.currentVersion()) return;
    wrap.dataset.rendered = '1';
    const pageNum = parseInt(wrap.dataset.pageIdx, 10) + 1;
    try {
      const page = await renderer.pdfDoc.getPage(pageNum);
      if (renderer.version !== renderer.currentVersion()) { wrap.dataset.rendered = '0'; return; }
      const scale = renderer._fixedFit * renderer.scale();
      const viewport = page.getViewport({ scale });
      const dprVp = page.getViewport({ scale: scale * DPR });
      const cssW = Math.floor(viewport.width), cssH = Math.floor(viewport.height);
      wrap.style.width = cssW + 'px';
      wrap.style.height = cssH + 'px';
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(dprVp.width); canvas.height = Math.floor(dprVp.height);
      canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: dprVp }).promise;
      if (renderer.version !== renderer.currentVersion()) { wrap.dataset.rendered = '0'; return; }
      wrap.appendChild(canvas);
    } catch (_) { wrap.dataset.rendered = '0'; wrap.innerHTML = ''; }
  }
  function unrenderRightPage(wrap) { if (wrap.dataset.rendered !== '1') return; wrap.innerHTML = ''; wrap.dataset.rendered = '0'; }

  /* ---------- SPLIT / RIGHT PANE ---------- */
  async function loadIntoRight(file) {
    if (!file) return;
    rightRenderVersion++;
    if (rightObserver) { rightObserver.disconnect(); rightObserver = null; }
    try { const item = await saveFileToDB(file); rightFileId = item.id; localStorage.setItem('pdfReader_rightFileId', item.id); } catch (_) { rightFileId = null; }
    rightFile = file; rightScale = 1; rightBaseFit = null;
    updatePaneZoomUI();
    paneRightTitle.textContent = file.name;
    paneRightTitle.title = file.name;
    paneEmpty.style.display = 'none';
    pages2El.style.display = 'flex';
    try {
      const buffer = await file.arrayBuffer();
      rightPdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
      await renderRightPages();
      refreshSavedList();
      if (rightFileId) { try { const item = await dbGet(rightFileId); await new Promise(r => setTimeout(r, 80)); if (item && item.rightScrollTop) viewer2.scrollTop = item.rightScrollTop; } catch (_) {} }
      toast('✅ Đã mở file 2: ' + file.name);
    } catch (_) { toast('❌ Không đọc được file 2'); paneEmpty.style.display = 'flex'; pages2El.style.display = 'none'; }
  }
  splitBtn.addEventListener('click', () => { if (viewerContainer.classList.contains('split')) closeSplit(); else openSplit(); });
  function openSplit() {
    viewerContainer.classList.add('split');
    splitBtn.classList.add('active');
    splitBtn.title = 'Đóng chế độ 2 file';
    localStorage.setItem('pdfReader_split', '1');
    hideRightBtn.style.display = '';
    if (rightHidden) { viewerContainer.classList.add('right-hidden'); hideRightBtn.textContent = '🙈'; }
    else { hideRightBtn.textContent = '👁️'; }
    rightBaseFit = null;
    if (!rightPdfDoc) { paneEmpty.style.display = 'flex'; pages2El.style.display = 'none'; }
    else { paneEmpty.style.display = 'none'; pages2El.style.display = 'flex'; setTimeout(() => renderRightPages(), 100); }
    updatePaneZoomUI();
    toast('⊞ Đã bật chế độ 2 file');
  }
  function closeSplit() {
    viewerContainer.classList.remove('split');
    viewerContainer.classList.remove('right-hidden');
    splitBtn.classList.remove('active');
    splitBtn.title = 'Mở 2 file cùng lúc';
    localStorage.removeItem('pdfReader_split');
    hideRightBtn.style.display = 'none';
  }
  closeSplitBtn.addEventListener('click', closeSplit);
  hideRightBtn.addEventListener('click', () => {
    if (!viewerContainer.classList.contains('split')) return;
    rightHidden = !rightHidden;
    viewerContainer.classList.toggle('right-hidden', rightHidden);
    if (rightHidden) { hideRightBtn.textContent = '🙈'; toast('🙈 Ẩn file 2'); }
    else { hideRightBtn.textContent = '👁️'; rightBaseFit = null; toast('👁️ Hiện file 2'); if (rightPdfDoc) setTimeout(() => renderRightPages(), 100); }
  });
  swapBtn.addEventListener('click', async () => {
    if (!rightFile || !currentFile) return toast('Cần có cả 2 file');
    if (!confirm('Đổi vị trí 2 file?')) return;
    if (currentFileId) { try { await updateStrokesInDB(currentFileId, allStrokes); const oldItem = await dbGet(currentFileId); if (oldItem) { oldItem.scrollTop = viewer.scrollTop; await dbPut(oldItem); } } catch (_) {} }
    if (rightFileId) { try { const oldRightItem = await dbGet(rightFileId); if (oldRightItem) { oldRightItem.rightScrollTop = viewer2.scrollTop; await dbPut(oldRightItem); } } catch (_) {} }
    leftRenderVersion++; rightRenderVersion++;
    const oldLeftFile = currentFile, oldLeftId = currentFileId, oldLeftScale = currentScale;
    const oldRightFile = rightFile, oldRightId = rightFileId, oldRightScale = rightScale;
    rightFile = null; rightPdfDoc = null; rightFileId = null; rightBaseFit = null;
    if (rightObserver) { rightObserver.disconnect(); rightObserver = null; }
    pages2El.innerHTML = '';
    currentFile = oldRightFile; currentFileId = oldRightId; currentScale = oldRightScale;
    zoomLabel.textContent = Math.round(currentScale * 100) + '%';
    if (oldRightId) localStorage.setItem('pdfReader_lastFileId', oldRightId);
    let rightStrokes = [];
    if (oldRightId) { try { const item = await dbGet(oldRightId); if (item && item.strokes) rightStrokes = item.strokes; } catch (_) {} }
    allStrokes = rightStrokes.map(s => ({ pageIdx: s.pageIdx, color: s.color, width: s.width, points: s.points.map(p => ({ x: p.x, y: p.y })) }));
    fileNameEl.textContent = oldRightFile.name;
    try { const buffer = await oldRightFile.arrayBuffer(); pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise; pageBadge.textContent = pdfDoc.numPages + ' trang'; await renderAllPages(); updateToolUI(); updateSelectModeUI(); } catch (_) { return toast('❌ Lỗi đổi file'); }
    if (viewerContainer.classList.contains('split')) {
      if (!oldLeftId) { try { const item = await saveFileToDB(oldLeftFile); rightFileId = item.id; } catch (_) {} }
      else rightFileId = oldLeftId;
      if (rightFileId) localStorage.setItem('pdfReader_rightFileId', rightFileId);
      rightFile = oldLeftFile; rightScale = oldLeftScale; rightBaseFit = null;
      updatePaneZoomUI();
      paneRightTitle.textContent = oldLeftFile.name;
      paneEmpty.style.display = 'none';
      pages2El.style.display = 'flex';
      try { const buffer = await oldLeftFile.arrayBuffer(); rightPdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise; await renderRightPages(); } catch (_) {}
    } else {
      rightFile = oldLeftFile; rightFileId = oldLeftId; rightScale = oldLeftScale; rightBaseFit = null;
      if (rightFileId) localStorage.setItem('pdfReader_rightFileId', rightFileId);
      else localStorage.removeItem('pdfReader_rightFileId');
    }
    refreshSavedList();
    toast('⇄ Đã đổi vị trí 2 file');
  });
  pickRightFile.addEventListener('click', () => fileInput2.click());
  changeRightFileBtn.addEventListener('click', () => fileInput2.click());
  fileInput2.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) {
      if (rightFileId) { dbGet(rightFileId).then(item => { if (item) { item.rightScrollTop = viewer2.scrollTop; dbPut(item); } }).catch(() => {}); }
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (!isPdf) toast('⚠️ Chỉ hỗ trợ PDF');
      else loadIntoRight(file);
    }
    fileInput2.value = '';
  });
  viewer2.addEventListener('dragover', e => e.preventDefault());
  viewer2.addEventListener('drop', async e => {
    e.preventDefault();
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return toast('⚠️ Chỉ hỗ trợ PDF');
    await loadIntoRight(file);
  });

  /* ---------- FILE LOAD ---------- */
  async function handleFile(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) { toast('⚠️ Vui lòng chọn file PDF'); return; }
    leftRenderVersion++;
    if (leftObserver) { leftObserver.disconnect(); leftObserver = null; }
    if (currentFileId) { try { await updateStrokesInDB(currentFileId, allStrokes); const oldItem = await dbGet(currentFileId); if (oldItem) { oldItem.scrollTop = viewer.scrollTop; await dbPut(oldItem); } } catch (_) {} }
    try {
      const item = await saveFileToDB(file);
      currentFileId = item.id; currentFile = file;
      currentName = file.name.replace(/\.pdf$/i, '');
      localStorage.setItem('pdfReader_lastFileId', item.id);
      currentScale = 1; userMovedPopup = false; activeTool = null;
      pendingRestoreScroll = 0;
      zoomLabel.textContent = '100%';
      allStrokes = (item.strokes || []).map(s => ({ pageIdx: s.pageIdx, color: s.color, width: s.width, points: s.points.map(p => ({ x: p.x, y: p.y })) }));
      fileNameEl.textContent = file.name;
      pageBadge.textContent = '…';
      toolbar.classList.add('show'); zoomGroup.classList.add('show'); colorPicker.classList.add('show'); penGroup.classList.add('show');
      splitBtn.disabled = false;
      document.body.classList.add('viewing');
      dropEl.style.display = 'none';
      viewer.classList.add('show');
      pagesEl.innerHTML = '';
      const buffer = await file.arrayBuffer();
      pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
      pageBadge.textContent = pdfDoc.numPages + ' trang';
      await renderAllPages();
      updateToolUI(); updateSelectModeUI();
      refreshSavedList();
      autoHideHint();
      const strokeMsg = allStrokes.length > 0 ? ` — khôi phục ${allStrokes.length} nét vẽ cũ` : '';
      toast('✅ Đã tải — kéo để cuộn, B×2 để chọn vùng' + strokeMsg);
    } catch (_) {
      pagesEl.innerHTML = '<div style="padding:40px 0;text-align:center">❌ Không đọc được file này.</div>';
      toast('❌ Đọc file thất bại');
    }
  }
  colorPicker.addEventListener('click', e => {
    const btn = e.target.closest('.swatch');
    if (!btn) return;
    const rgb = btn.dataset.color;
    document.documentElement.style.setProperty('--hl-bg', `rgba(${rgb}, 0.55)`);
    document.documentElement.style.setProperty('--hl-border', `rgba(${rgb}, 0.95)`);
    colorPicker.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    toast('🎨 Đã đổi màu');
  });
  popupCopy.addEventListener('click', async () => {
    const text = selectedEls.map(el => el.dataset.text).join('\n');
    if (!text) return toast('Chưa có dòng nào');
    try { await navigator.clipboard.writeText(text); toast('📋 Đã sao chép'); }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('📋 Đã sao chép'); }
  });
  popupGoogle.addEventListener('click', async () => {
    const text = selectedEls.map(el => el.dataset.text).join(' ').trim();
    if (!text) return toast('Chưa có dòng nào');
    try { await navigator.clipboard.writeText(text); } catch (_) {}
    window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank', 'noopener');
    toast('🔍 Đã tìm Google');
  });
  popupGemini.addEventListener('click', async () => {
    const text = selectedEls.map(el => el.dataset.text).join('\n').trim();
    if (!text) return toast('Chưa có dòng nào');
    try { await navigator.clipboard.writeText(text); toast('✨ Đã copy'); } catch (_) {}
    window.open(`https://gemini.google.com/app?q=${encodeURIComponent(text)}`, '_blank', 'noopener');
  });
  document.getElementById('changeFileBtn').addEventListener('click', () => fileInput.click());
  document.getElementById('zoomIn').addEventListener('click', () => { if (!pdfDoc) return; currentScale = Math.min(currentScale + 0.25, 3); updateZoom(); });
  document.getElementById('zoomOut').addEventListener('click', () => { if (!pdfDoc) return; currentScale = Math.max(currentScale - 0.25, 0.5); updateZoom(); });
  async function updateZoom() {
    zoomLabel.textContent = Math.round(currentScale * 100) + '%';
    if (!pdfDoc) return;
    const wasMoved = userMovedPopup, savedPos = { ...popupPos };
    const oldScroll = viewer.scrollTop;
    await renderAllPages();
    viewer.scrollTop = oldScroll;
    if (wasMoved && selectedEls.length > 0) { popup.classList.add('show'); popup.style.left = savedPos.x + 'px'; popup.style.top = savedPos.y + 'px'; userMovedPopup = true; }
    updateEraserCursorSize();
  }
  fileInput.addEventListener('change', e => { handleFile(e.target.files[0]); fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach(evt => dropEl.addEventListener(evt, e => { e.preventDefault(); dropEl.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(evt => dropEl.addEventListener(evt, e => { e.preventDefault(); dropEl.classList.remove('is-over'); }));
  dropEl.addEventListener('drop', e => { const file = e.dataTransfer.files && e.dataTransfer.files[0]; handleFile(file); });
  dropEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (currentFileId) dbGet(currentFileId).then(item => { if (item) { item.scrollTop = viewer.scrollTop; dbPut(item); } }).catch(() => {});
      if (rightFileId) dbGet(rightFileId).then(item => { if (item) { item.rightScrollTop = viewer2.scrollTop; dbPut(item); } }).catch(() => {});
    }
  });
  window.addEventListener('blur', () => {
    if (marqueeActive) { marqueeActive = false; marqueeBox.classList.remove('show'); }
    panState.active = false; panState.moved = false;
    viewer.classList.remove('panning');
    pointerInViewer = false; eraserCursor.classList.remove('show');
    if (currentFileId) {
      clearTimeout(saveTimer); clearTimeout(scrollSaveTimer);
      updateStrokesInDB(currentFileId, allStrokes).catch(() => {});
      dbGet(currentFileId).then(item => { if (item) { item.scrollTop = viewer.scrollTop; dbPut(item); } }).catch(() => {});
    }
    if (rightFileId) { clearTimeout(rightScrollSaveTimer); dbGet(rightFileId).then(item => { if (item) { item.rightScrollTop = viewer2.scrollTop; dbPut(item); } }).catch(() => {}); }
  });
  window.addEventListener('beforeunload', () => {
    if (currentFileId) { updateStrokesInDB(currentFileId, allStrokes).catch(() => {}); dbGet(currentFileId).then(item => { if (item) { item.scrollTop = viewer.scrollTop; dbPut(item); } }).catch(() => {}); }
    if (rightFileId) dbGet(rightFileId).then(item => { if (item) { item.rightScrollTop = viewer2.scrollTop; dbPut(item); } }).catch(() => {});
  });
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (rightPdfDoc && rightScale === 1) { rightBaseFit = null; renderRightPages(); } }, 300);
  });
  viewer.addEventListener('scroll', scheduleSaveScroll, { passive: true });
  viewer2.addEventListener('scroll', scheduleSaveRightScroll, { passive: true });

  /* ---------- PUBLIC API ---------- */
  window.PdfModule = {
    init: async function () {
      try {
        await openDB();
        await refreshSavedList();
        updateSelectModeUI();
        updatePaneZoomUI();
      } catch (err) { console.error('IndexedDB init failed:', err); savedCount.textContent = '!'; }
    },
    loadLast: async function () {
      const lastId = localStorage.getItem('pdfReader_lastFileId');
      if (!lastId) return;
      await new Promise(r => setTimeout(r, 200));
      const item = await dbGet(lastId);
      if (!item) { localStorage.removeItem('pdfReader_lastFileId'); return; }
      await loadSavedFile(lastId);
      const rightId = localStorage.getItem('pdfReader_rightFileId');
      const wasSplit = localStorage.getItem('pdfReader_split') === '1';
      if (rightId) {
        const rightItem = await dbGet(rightId);
        if (rightItem) {
          const fileBlob = new Blob([rightItem.buffer], { type: 'application/pdf' });
          const fileObj = new File([fileBlob], rightItem.name, { type: 'application/pdf' });
          await loadIntoRight(fileObj);
          rightFileId = rightId;
          if (wasSplit) {
            viewerContainer.classList.add('split');
            splitBtn.classList.add('active');
            splitBtn.title = 'Đóng chế độ 2 file';
            hideRightBtn.style.display = '';
            hideRightBtn.textContent = '👁️';
            rightBaseFit = null;
            setTimeout(() => renderRightPages(), 200);
          }
        }
      }
    },
    onRouteChange: function ({ wasOnReader, nowOnReader }) {
      if (wasOnReader && !nowOnReader && currentFileId && viewer.scrollTop > 0) {
        pendingRestoreScroll = viewer.scrollTop;
        dbGet(currentFileId).then(item => { if (item) { item.scrollTop = viewer.scrollTop; return dbPut(item); } }).catch(() => {});
      }
      if (!wasOnReader && nowOnReader) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (!pdfDoc) return;
          const curW = viewer.clientWidth;
          if (curW > 0 && lastRenderedWidth > 0 && Math.abs(curW - lastRenderedWidth) > 50) {
            const target = pendingRestoreScroll || viewer.scrollTop;
            renderAllPages().then(() => requestAnimationFrame(() => { if (target > 0) viewer.scrollTop = target; pendingRestoreScroll = 0; }));
          } else if (pendingRestoreScroll > 0) { viewer.scrollTop = pendingRestoreScroll; pendingRestoreScroll = 0; }
        }));
      }
    },
    onResize: function () {
      if (!pdfDoc || !document.body.classList.contains('on-reader')) return;
      const curW = viewer.clientWidth;
      if (curW > 0 && lastRenderedWidth > 0 && Math.abs(curW - lastRenderedWidth) > 50) {
        const target = viewer.scrollTop || pendingRestoreScroll;
        renderAllPages().then(() => requestAnimationFrame(() => { if (target > 0) viewer.scrollTop = target; }));
      }
    }
  };
})();