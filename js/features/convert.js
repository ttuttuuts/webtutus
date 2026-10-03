/* Feature module: Chuyển đổi sang PDF */
(function () {
  'use strict';
  window.Features = window.Features || {};

  const ACCEPTED_EXT = ['jpg','jpeg','png','webp','gif','bmp','txt','md','log','json','csv','html','htm','docx'];
  const IMAGE_EXT = ['jpg','jpeg','png','webp','gif','bmp'];
  const TEXT_EXT = ['txt','md','log','json','csv','html','htm'];
  const MAX_FILE_SIZE = 30 * 1024 * 1024;

  let files = [];
  let converting = false;

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function getExt(name) { const m = /\.([^.]+)$/.exec(name); return m ? m[1].toLowerCase() : ''; }
  function isImage(name) { return IMAGE_EXT.includes(getExt(name)); }
  function isText(name) { return TEXT_EXT.includes(getExt(name)); }
  function isDocx(name) { return getExt(name) === 'docx'; }
  function formatBytes(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b/1024).toFixed(1) + ' KB'; return (b/1048576).toFixed(1) + ' MB'; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function toast(msg) { if (window.App && window.App.toast) window.App.toast(msg); }

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh')); };
      img.src = url;
    });
  }
  function readText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(file, 'UTF-8');
    });
  }
  async function readDocx(file) {
    if (!window.mammoth) throw new Error('Thiếu mammoth.js');
    const buffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
    return (result && result.value) ? result.value : '';
  }

  async function renderTextToCanvas(text) {
    if (!window.html2canvas) throw new Error('Thiếu html2canvas');
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;left:-99999px;top:0;width:800px;padding:0;background:#fff;color:#000;font-family:"Segoe UI",Arial,sans-serif;font-size:14px;line-height:1.65;white-space:pre-wrap;word-wrap:break-word;';
    div.textContent = text;
    document.body.appendChild(div);
    try {
      const canvas = await window.html2canvas(div, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
      });
      return canvas;
    } finally {
      document.body.removeChild(div);
    }
  }

  function addImageToPdf(pdf, source, srcW, srcH, opts, isFirstPage) {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const m = opts.margin;
    const availW = pageW - m * 2;
    const availH = pageH - m * 2;

    const ratio = Math.min(availW / srcW, availH / srcH);
    const w = srcW * ratio;
    const h = srcH * ratio;

    if (!isFirstPage) pdf.addPage();
    pdf.addImage(source, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h);
  }

  function addLongCanvasToPdf(pdf, canvas, opts, isFirstPage) {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const m = opts.margin;
    const availW = pageW - m * 2;
    const availH = pageH - m * 2;

    const mmPerPx = availW / canvas.width;
    const maxSliceH = Math.max(1, Math.floor(availH / mmPerPx));
    const totalSlices = Math.max(1, Math.ceil(canvas.height / maxSliceH));

    for (let i = 0; i < totalSlices; i++) {
      const y0 = i * maxSliceH;
      const sliceH = Math.min(maxSliceH, canvas.height - y0);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext('2d');
      ctx.drawImage(canvas, 0, y0, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

      const mmW = canvas.width * mmPerPx;
      const mmH = sliceH * mmPerPx;

      if (!isFirstPage || i > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', m, m, mmW, mmH);
    }
    return totalSlices;
  }

  function updateProgress(cur, total, name) {
    const el = document.getElementById('cvProgress');
    if (!el) return;
    el.style.display = 'block';
    const fill = el.querySelector('.cv-progress-fill');
    const text = el.querySelector('.cv-progress-text');
    const pct = total > 0 ? ((cur + 1) / total) * 100 : 0;
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = `${cur + 1}/${total} — ${name}`;
  }
  function hideProgress() {
    const el = document.getElementById('cvProgress');
    if (el) el.style.display = 'none';
  }

  async function convertAll(opts) {
    if (files.length === 0) { toast('⚠️ Chưa có file nào'); return; }
    if (converting) return;
    if (!window.jspdf || !window.jspdf.jsPDF) { toast('⚠️ Thiếu jsPDF — kiểm tra kết nối'); return; }

    converting = true;
    const btn = document.getElementById('cvConvertBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang chuyển...'; }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: opts.orientation === 'landscape' ? 'l' : 'p',
      unit: 'mm',
      format: opts.pageSize
    });

    let firstPage = true;
    let pageCount = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        const file = item.file;
        updateProgress(i, files.length, file.name);

        if (isImage(file.name)) {
          const img = await readImage(file);
          addImageToPdf(pdf, img, img.width, img.height, opts, firstPage);
          firstPage = false;
          pageCount++;
        } else if (isText(file.name)) {
          const text = await readText(file);
          if (text.trim()) {
            const canvas = await renderTextToCanvas(text);
            const pages = addLongCanvasToPdf(pdf, canvas, opts, firstPage);
            firstPage = false;
            pageCount += pages;
          }
        } else if (isDocx(file.name)) {
          const text = await readDocx(file);
          if (text.trim()) {
            const canvas = await renderTextToCanvas(text);
            const pages = addLongCanvasToPdf(pdf, canvas, opts, firstPage);
            firstPage = false;
            pageCount += pages;
          }
        }

        await new Promise(r => setTimeout(r, 20));
      }

      if (pageCount === 0) { toast('⚠️ Không có nội dung để chuyển'); }
      else {
        const d = new Date();
        const name = `converted_${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}.pdf`;
        pdf.save(name);
        toast(`✅ Đã tạo PDF (${pageCount} trang)`);
      }
    } catch (err) {
      console.error(err);
      toast('❌ Lỗi: ' + (err.message || 'Không xác định'));
    } finally {
      converting = false;
      if (btn) { btn.disabled = false; btn.textContent = '🚀 Chuyển sang PDF'; }
      hideProgress();
    }
  }

  function render(mount) {
    files = [];
    mount.innerHTML = `
      <div class="cv-wrap">
        <label class="cv-drop" id="cvDrop" for="cvFileInput">
          <input type="file" id="cvFileInput" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.txt,.md,.log,.json,.csv,.html,.htm,.docx" hidden />
          <div class="cv-drop-icon">📄</div>
          <div class="cv-drop-title">Chọn file hoặc kéo thả vào đây</div>
          <div class="cv-drop-hint">JPG · PNG · WEBP · GIF · BMP · TXT · MD · CSV · JSON · HTML · DOCX</div>
        </label>

        <div class="cv-options">
          <div class="cv-opt">
            <label>Khổ giấy</label>
            <select id="cvPageSize">
              <option value="a4">A4</option>
              <option value="a3">A3</option>
              <option value="a5">A5</option>
              <option value="letter">Letter</option>
            </select>
          </div>
          <div class="cv-opt">
            <label>Chiều</label>
            <select id="cvOrientation">
              <option value="portrait">Dọc</option>
              <option value="landscape">Ngang</option>
            </select>
          </div>
          <div class="cv-opt">
            <label>Lề (mm)</label>
            <input type="number" id="cvMargin" value="15" min="0" max="50" step="1">
          </div>
        </div>

        <div class="cv-list" id="cvList"></div>

        <div class="cv-progress" id="cvProgress" style="display:none">
          <div class="cv-progress-bar"><div class="cv-progress-fill"></div></div>
          <div class="cv-progress-text">Đang xử lý…</div>
        </div>

        <div class="cv-actions">
          <button class="cv-clear-btn" id="cvClearBtn">🗑️ Xoá hết</button>
          <button class="cv-convert-btn" id="cvConvertBtn">🚀 Chuyển sang PDF</button>
        </div>
      </div>
    `;

    const dropEl = mount.querySelector('#cvDrop');
    const fileInput = mount.querySelector('#cvFileInput');
    const listEl = mount.querySelector('#cvList');

    function renderList() {
      if (files.length === 0) { listEl.innerHTML = ''; return; }
      listEl.innerHTML = files.map(({id, file}) => {
        const ext = getExt(file.name);
        const kind = isImage(file.name) ? '🖼️' : isDocx(file.name) ? '📘' : '📝';
        return `
          <div class="cv-item" data-id="${id}">
            <div class="cv-item-icon">${kind}</div>
            <div class="cv-item-info">
              <div class="cv-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
              <div class="cv-item-meta">${formatBytes(file.size)} • ${ext.toUpperCase()}</div>
            </div>
            <button class="cv-item-del" data-del="${id}" title="Xoá">✕</button>
          </div>`;
      }).join('');
    }

    function addFiles(arr) {
      let added = 0;
      for (const f of arr) {
        const ext = getExt(f.name);
        if (!ACCEPTED_EXT.includes(ext)) { toast(`⚠️ .${ext} không hỗ trợ`); continue; }
        if (f.size > MAX_FILE_SIZE) { toast(`⚠️ ${f.name} > 30MB`); continue; }
        files.push({ id: uid(), file: f });
        added++;
      }
      if (added > 0) toast(`📎 Đã thêm ${added} file`);
      renderList();
    }

    dropEl.addEventListener('dragover', e => { e.preventDefault(); dropEl.classList.add('over'); });
    dropEl.addEventListener('dragleave', () => dropEl.classList.remove('over'));
    dropEl.addEventListener('drop', e => {
      e.preventDefault();
      dropEl.classList.remove('over');
      if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', e => {
      if (e.target.files) addFiles(e.target.files);
      fileInput.value = '';
    });

    listEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-del]');
      if (!btn) return;
      files = files.filter(x => x.id !== btn.dataset.del);
      renderList();
    });

    mount.querySelector('#cvClearBtn').addEventListener('click', () => {
      if (files.length === 0) return;
      if (!confirm('Xoá hết file trong danh sách?')) return;
      files = [];
      renderList();
    });

    mount.querySelector('#cvConvertBtn').addEventListener('click', async () => {
      const opts = {
        pageSize: mount.querySelector('#cvPageSize').value,
        orientation: mount.querySelector('#cvOrientation').value,
        margin: parseFloat(mount.querySelector('#cvMargin').value) || 0
      };
      await convertAll(opts);
    });

    renderList();
  }

  window.Features['convert'] = {
    title: 'Chuyển file → PDF',
    icon: '📄',
    desc: 'Đổi ảnh, text, docx… sang PDF.',
    render
  };
})();