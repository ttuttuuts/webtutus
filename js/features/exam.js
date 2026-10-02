/* Feature module: Đếm ngược kì thi */
(function () {
  'use strict';
  window.Features = window.Features || {};

  const STORAGE_KEY = 'pdfReader_exams_v1';
  const SUBJECTS = ['Toán', 'Lý', 'Hoá', 'Anh', 'Văn', 'Sử', 'Địa', 'Sinh', 'Khác'];

  let exams = [];
  let editingId = null;
  let tickInterval = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      exams = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(exams)) exams = [];
    } catch (_) { exams = []; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(exams)); } catch (_) {}
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function pad2(n) { return String(n).padStart(2, '0'); }

  function getRemaining(target) {
    const now = Date.now();
    const diff = target - now;
    if (diff <= 0) return { done: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
    const totalSec = Math.floor(diff / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return { done: false, days, hours, minutes, seconds };
  }

  function formatDateVN(ts) {
    const d = new Date(ts);
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return `${days[d.getDay()]}, ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} • ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function renderExamCard(exam, isNext) {
    const dl = new Date(exam.datetime).getTime();
    const rem = getRemaining(dl);
    const created = exam.createdAt || Date.now();
    const total = dl - created;
    const elapsed = Date.now() - created;
    const pct = total > 0 ? Math.max(0, Math.min(100, (elapsed / total) * 100)) : 100;

    let cls = '';
    if (isNext && !rem.done) cls += ' next';
    if (rem.done) cls += ' done';
    if (!rem.done && rem.days <= 3) cls += ' critical';
    else if (!rem.done && rem.days <= 7) cls += ' urgent';

    const timeHtml = rem.done ? `
      <div class="ex-done-badge">✅ Đã thi xong</div>
    ` : `
      <div class="ex-countdown">
        <div class="ex-unit"><div class="ex-num" data-tick="days">${rem.days}</div><div class="ex-lbl">Ngày</div></div>
        <div class="ex-sep">:</div>
        <div class="ex-unit"><div class="ex-num" data-tick="hours">${pad2(rem.hours)}</div><div class="ex-lbl">Giờ</div></div>
        <div class="ex-sep">:</div>
        <div class="ex-unit"><div class="ex-num" data-tick="minutes">${pad2(rem.minutes)}</div><div class="ex-lbl">Phút</div></div>
        <div class="ex-sep">:</div>
        <div class="ex-unit"><div class="ex-num" data-tick="seconds">${pad2(rem.seconds)}</div><div class="ex-lbl">Giây</div></div>
      </div>
    `;

    return `
      <div class="ex-card${cls}" data-id="${exam.id}">
        <div class="ex-head">
          <div class="ex-title-row">
            ${isNext && !rem.done ? '<span class="ex-next-badge">🎯 Kì thi gần nhất</span>' : ''}
            <div class="ex-title">${escapeHtml(exam.name)}</div>
          </div>
          <div class="ex-actions">
            <button class="ex-btn" data-act="edit" title="Sửa">✏️</button>
            <button class="ex-btn del" data-act="del" title="Xoá">🗑️</button>
          </div>
        </div>
        <div class="ex-meta">
          ${exam.subject ? `<span class="ex-tag">${escapeHtml(exam.subject)}</span>` : ''}
          <span class="ex-when">📅 ${formatDateVN(dl)}</span>
          ${exam.location ? `<span class="ex-where">📍 ${escapeHtml(exam.location)}</span>` : ''}
        </div>
        ${timeHtml}
        ${!rem.done ? `
          <div class="ex-progress-wrap">
            <div class="ex-progress"><div class="ex-progress-fill" style="width:${pct.toFixed(2)}%"></div></div>
            <div class="ex-progress-label">Đã qua <b>${pct.toFixed(1)}%</b> thời gian chuẩn bị</div>
          </div>
        ` : ''}
        ${exam.note ? `<div class="ex-note">💬 ${escapeHtml(exam.note)}</div>` : ''}
      </div>
    `;
  }

  function renderList() {
    if (exams.length === 0) {
      return `<div class="ex-empty"><span class="ico">⏳</span>Chưa có kì thi nào.<br>Bấm <b>＋ Thêm kì thi</b> để bắt đầu đếm ngược.</div>`;
    }
    const now = Date.now();
    const sorted = exams.slice().sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
    const nextExam = sorted.find(e => new Date(e.datetime).getTime() > now);
    const nextId = nextExam ? nextExam.id : null;

    const upcoming = sorted.filter(e => new Date(e.datetime).getTime() > now);
    const past = sorted.filter(e => new Date(e.datetime).getTime() <= now);

    let html = '';
    if (upcoming.length > 0) {
      html += `<div class="ex-group"><h3 class="ex-group-title">🔜 Sắp tới<span class="cnt">${upcoming.length}</span></h3><div class="ex-list">`;
      html += upcoming.map(e => renderExamCard(e, e.id === nextId)).join('');
      html += `</div></div>`;
    }
    if (past.length > 0) {
      html += `<div class="ex-group past"><h3 class="ex-group-title">✅ Đã qua<span class="cnt">${past.length}</span></h3><div class="ex-list">`;
      html += past.map(e => renderExamCard(e, false)).join('');
      html += `</div></div>`;
    }
    return html;
  }

  function render(mount) {
    load();
    mount.innerHTML = `
      <div class="ex-wrap">
        <div class="ex-toolbar">
          <button class="ex-add-btn" id="exAddBtn">＋ Thêm kì thi</button>
          <div class="ex-hint-box">💡 Đếm ngược tự động cập nhật mỗi giây</div>
        </div>
        <div id="exList"></div>
      </div>

      <div class="ex-modal" id="exModal">
        <div class="ex-modal-card">
          <div class="ex-modal-head">
            <span id="exModalTitle">Thêm kì thi</span>
            <button class="ex-modal-close" id="exModalClose">✕</button>
          </div>
          <div class="ex-modal-body">
            <div class="ex-field">
              <label>Tên kì thi *</label>
              <input type="text" id="exInpName" placeholder="VD: Kiểm tra 1 tiết chương 3..." maxlength="200">
            </div>
            <div class="ex-field-row">
              <div class="ex-field">
                <label>Môn học</label>
                <select id="exInpSubject">
                  <option value="">— Chọn môn —</option>
                  ${SUBJECTS.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
              </div>
              <div class="ex-field">
                <label>Địa điểm</label>
                <input type="text" id="exInpLocation" placeholder="VD: Phòng A201" maxlength="100">
              </div>
            </div>
            <div class="ex-field">
              <label>Ngày giờ thi *</label>
              <input type="datetime-local" id="exInpDatetime">
            </div>
            <div class="ex-field">
              <label>Ghi chú</label>
              <textarea id="exInpNote" rows="2" placeholder="VD: Cần mang máy tính, học kỹ phần đạo hàm..." maxlength="500"></textarea>
            </div>
          </div>
          <div class="ex-modal-foot">
            <button class="ex-modal-btn cancel" id="exModalCancel">Huỷ</button>
            <button class="ex-modal-btn save" id="exModalSave">Lưu</button>
          </div>
        </div>
      </div>
    `;

    const modalEl = mount.querySelector('#exModal');
    const listEl = mount.querySelector('#exList');

    function refresh() { listEl.innerHTML = renderList(); }

    function tick() {
      if (!mount.isConnected) return;
      const now = Date.now();
      const cards = listEl.querySelectorAll('.ex-card');
      cards.forEach(card => {
        const id = card.dataset.id;
        const exam = exams.find(e => e.id === id);
        if (!exam) return;
        const dl = new Date(exam.datetime).getTime();
        const rem = getRemaining(dl);

        const currentlyDone = card.classList.contains('done');
        if (rem.done !== currentlyDone) { refresh(); return; }
        if (rem.done) return;

        const dEl = card.querySelector('[data-tick="days"]');
        const hEl = card.querySelector('[data-tick="hours"]');
        const mEl = card.querySelector('[data-tick="minutes"]');
        const sEl = card.querySelector('[data-tick="seconds"]');
        if (dEl) dEl.textContent = rem.days;
        if (hEl) hEl.textContent = pad2(rem.hours);
        if (mEl) mEl.textContent = pad2(rem.minutes);
        if (sEl) sEl.textContent = pad2(rem.seconds);

        const created = exam.createdAt || now;
        const total = dl - created;
        const elapsed = now - created;
        const pct = total > 0 ? Math.max(0, Math.min(100, (elapsed / total) * 100)) : 100;
        const fill = card.querySelector('.ex-progress-fill');
        if (fill) fill.style.width = pct.toFixed(2) + '%';
        const pctLabel = card.querySelector('.ex-progress-label b');
        if (pctLabel) pctLabel.textContent = pct.toFixed(1) + '%';

        card.classList.remove('urgent', 'critical');
        if (rem.days <= 3) card.classList.add('critical');
        else if (rem.days <= 7) card.classList.add('urgent');
      });
    }

    function openModal(exam) {
      editingId = exam ? exam.id : null;
      mount.querySelector('#exModalTitle').textContent = exam ? 'Sửa kì thi' : 'Thêm kì thi';
      mount.querySelector('#exInpName').value = exam ? exam.name : '';
      mount.querySelector('#exInpSubject').value = exam ? (exam.subject || '') : '';
      mount.querySelector('#exInpLocation').value = exam ? (exam.location || '') : '';
      mount.querySelector('#exInpDatetime').value = exam ? exam.datetime : '';
      mount.querySelector('#exInpNote').value = exam ? (exam.note || '') : '';
      modalEl.classList.add('show');
      setTimeout(() => mount.querySelector('#exInpName').focus(), 100);
    }
    function closeModal() {
      modalEl.classList.remove('show');
      editingId = null;
    }

    mount.querySelector('#exAddBtn').addEventListener('click', () => openModal(null));

    listEl.addEventListener('click', (e) => {
      const card = e.target.closest('.ex-card');
      if (!card) return;
      const id = card.dataset.id;
      const exam = exams.find(x => x.id === id);
      if (!exam) return;
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.dataset.act;
      if (a === 'del') {
        if (!confirm(`Xoá kì thi "${exam.name}"?`)) return;
        exams = exams.filter(x => x.id !== id);
        save(); refresh();
        window.App && window.App.toast && window.App.toast('🗑️ Đã xoá');
      } else if (a === 'edit') {
        openModal(exam);
      }
    });

    mount.querySelector('#exModalClose').addEventListener('click', closeModal);
    mount.querySelector('#exModalCancel').addEventListener('click', closeModal);
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalEl.classList.contains('show')) closeModal();
    });

    mount.querySelector('#exModalSave').addEventListener('click', () => {
      const name = mount.querySelector('#exInpName').value.trim();
      const dt = mount.querySelector('#exInpDatetime').value;
      if (!name) { mount.querySelector('#exInpName').focus(); window.App && window.App.toast && window.App.toast('⚠️ Nhập tên kì thi'); return; }
      if (!dt) { mount.querySelector('#exInpDatetime').focus(); window.App && window.App.toast && window.App.toast('⚠️ Chọn ngày giờ thi'); return; }
      const data = {
        name,
        subject: mount.querySelector('#exInpSubject').value,
        location: mount.querySelector('#exInpLocation').value.trim(),
        datetime: dt,
        note: mount.querySelector('#exInpNote').value.trim()
      };
      if (editingId) {
        const t = exams.find(x => x.id === editingId);
        if (t) { Object.assign(t, data); t.updatedAt = Date.now(); }
        window.App && window.App.toast && window.App.toast('✏️ Đã cập nhật');
      } else {
        exams.push({ id: uid(), ...data, createdAt: Date.now() });
        window.App && window.App.toast && window.App.toast('✅ Đã thêm kì thi');
      }
      save(); closeModal(); refresh();
    });

    refresh();

    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(() => {
      if (!mount.isConnected) {
        clearInterval(tickInterval);
        tickInterval = null;
        return;
      }
      tick();
    }, 1000);
  }

  window.Features['exam'] = {
    title: 'Đếm ngược kì thi',
    icon: '⏳',
    desc: 'Đếm ngược tới ngày thi, xem thời gian còn lại.',
    render
  };
})();