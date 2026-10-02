/* Feature module: To-do & Deadline */
(function () {
  'use strict';
  window.Features = window.Features || {};

  const STORAGE_KEY = 'pdfReader_todos_v1';
  const SUBJECTS = ['Toán', 'Lý', 'Hoá', 'Anh', 'Văn', 'Sử', 'Địa', 'Sinh', 'Khác'];
  const PRIORITIES = { high: 'Cao', normal: 'Bình thường', low: 'Thấp' };

  let tasks = [];
  let filter = 'all';
  let search = '';
  let editingId = null;
  let tickInterval = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      tasks = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(tasks)) tasks = [];
    } catch (_) { tasks = []; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (_) {}
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function parseDeadline(s) {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function classify(task) {
    if (task.done) return 'done';
    const dl = parseDeadline(task.deadline);
    if (!dl) return 'future';
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    if (dl < now) return 'overdue';
    if (dl <= todayEnd) return 'today';
    return 'future';
  }
  function formatDeadline(dl) {
    if (!dl) return { text: 'Không có hạn', cls: '' };
    const now = new Date();
    const diff = dl - now;
    const absDiff = Math.abs(diff);
    const min = 60 * 1000, hour = 60 * min, day = 24 * hour;
    const dateStr = dl.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = dl.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (diff < 0) {
      if (absDiff < hour) return { text: `Quá hạn ${Math.round(absDiff / min)} phút`, cls: 'overdue' };
      if (absDiff < day) return { text: `Quá hạn ${Math.round(absDiff / hour)} giờ`, cls: 'overdue' };
      if (absDiff < 7 * day) return { text: `Quá hạn ${Math.round(absDiff / day)} ngày`, cls: 'overdue' };
      return { text: `Quá hạn — ${dateStr}`, cls: 'overdue' };
    }
    if (diff < hour) return { text: `Còn ${Math.round(diff / min)} phút`, cls: 'today' };
    if (diff < day) return { text: `Còn ${Math.round(diff / hour)} giờ`, cls: 'today' };
    if (diff < 3 * day) return { text: `Còn ${Math.round(diff / day)} ngày`, cls: 'soon' };
    return { text: `${dateStr} ${timeStr}`, cls: '' };
  }

  function renderStats() {
    const overdue = tasks.filter(t => classify(t) === 'overdue').length;
    const today = tasks.filter(t => classify(t) === 'today').length;
    const active = tasks.filter(t => !t.done).length;
    const done = tasks.filter(t => t.done).length;
    return `
      <div class="td-stats">
        <div class="td-stat overdue"><div class="n">${overdue}</div><div class="l">Quá hạn</div></div>
        <div class="td-stat today"><div class="n">${today}</div><div class="l">Hôm nay</div></div>
        <div class="td-stat"><div class="n">${active}</div><div class="l">Chưa xong</div></div>
        <div class="td-stat done"><div class="n">${done}</div><div class="l">Đã xong</div></div>
      </div>`;
  }

  function renderTaskItem(task) {
    const dl = parseDeadline(task.deadline);
    const dlInfo = formatDeadline(dl);
    const prio = task.priority || 'normal';
    return `
      <div class="td-item ${task.done ? 'done' : ''}" data-id="${task.id}">
        <button class="td-check ${task.done ? 'checked' : ''}" data-act="toggle" title="${task.done ? 'Bỏ đánh dấu' : 'Đánh dấu xong'}"></button>
        <div class="td-main">
          <div class="td-title">${escapeHtml(task.title)}</div>
          <div class="td-meta">
            ${task.subject ? `<span class="td-tag subject">${escapeHtml(task.subject)}</span>` : ''}
            ${prio !== 'normal' ? `<span class="td-tag prio-${prio}">${PRIORITIES[prio]}</span>` : ''}
            <span class="td-time ${dlInfo.cls}">🕒 ${dlInfo.text}</span>
          </div>
        </div>
        <div class="td-actions">
          <button class="td-btn" data-act="edit" title="Sửa">✏️</button>
          <button class="td-btn del" data-act="del" title="Xoá">🗑️</button>
        </div>
      </div>`;
  }

  function renderList() {
    let list = tasks.slice();
    if (filter === 'active') list = list.filter(t => !t.done);
    else if (filter === 'done') list = list.filter(t => t.done);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.subject || '').toLowerCase().includes(q) ||
        (t.note || '').toLowerCase().includes(q)
      );
    }
    if (list.length === 0) {
      return `<div class="td-empty"><span class="ico">📭</span>Chưa có công việc nào.<br>Bấm <b>＋ Thêm công việc</b> để bắt đầu.</div>`;
    }
    const groups = { overdue: [], today: [], future: [], done: [] };
    list.forEach(t => groups[classify(t)].push(t));
    const byDl = (a, b) => {
      const da = parseDeadline(a.deadline)?.getTime() ?? Infinity;
      const db = parseDeadline(b.deadline)?.getTime() ?? Infinity;
      return da - db;
    };
    groups.overdue.sort(byDl);
    groups.today.sort(byDl);
    groups.future.sort(byDl);
    groups.done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const labels = {
      overdue: '🔥 Quá hạn',
      today: '⏰ Hôm nay',
      future: '📅 Sắp tới',
      done: '✅ Đã hoàn thành'
    };
    let html = '';
    for (const key of ['overdue', 'today', 'future', 'done']) {
      const arr = groups[key];
      if (arr.length === 0) continue;
      html += `
        <div class="td-group ${key}">
          <h3 class="td-group-title">${labels[key]}<span class="cnt">${arr.length}</span></h3>
          <div class="td-list">${arr.map(renderTaskItem).join('')}</div>
        </div>`;
    }
    return html;
  }

  function render(mount) {
    load();
    mount.innerHTML = `
      <div class="td-wrap">
        <div class="td-toolbar">
          <button class="td-add-btn" id="tdAddBtn">＋ Thêm công việc</button>
          <div class="td-filter" id="tdFilter">
            <button class="td-filter-btn active" data-filter="all">Tất cả</button>
            <button class="td-filter-btn" data-filter="active">Chưa xong</button>
            <button class="td-filter-btn" data-filter="done">Đã xong</button>
          </div>
          <input type="text" class="td-search" id="tdSearch" placeholder="🔍 Tìm công việc...">
        </div>
        <div id="tdStats"></div>
        <div id="tdList"></div>
      </div>

      <div class="td-modal" id="tdModal">
        <div class="td-modal-card">
          <div class="td-modal-head">
            <span id="tdModalTitle">Thêm công việc</span>
            <button class="td-modal-close" id="tdModalClose">✕</button>
          </div>
          <div class="td-modal-body">
            <div class="td-field">
              <label>Tên công việc *</label>
              <input type="text" id="tdInpTitle" placeholder="VD: Làm bài tập chương 3..." maxlength="200">
            </div>
            <div class="td-field-row">
              <div class="td-field">
                <label>Môn học</label>
                <select id="tdInpSubject">
                  <option value="">— Chọn môn —</option>
                  ${SUBJECTS.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
              </div>
              <div class="td-field">
                <label>Ưu tiên</label>
                <select id="tdInpPrio">
                  <option value="normal">Bình thường</option>
                  <option value="high">Cao</option>
                  <option value="low">Thấp</option>
                </select>
              </div>
            </div>
            <div class="td-field">
              <label>Hạn chót</label>
              <input type="datetime-local" id="tdInpDeadline">
            </div>
            <div class="td-field">
              <label>Ghi chú</label>
              <textarea id="tdInpNote" rows="3" placeholder="Chi tiết thêm..." maxlength="1000"></textarea>
            </div>
          </div>
          <div class="td-modal-foot">
            <button class="td-modal-btn cancel" id="tdModalCancel">Huỷ</button>
            <button class="td-modal-btn save" id="tdModalSave">Lưu</button>
          </div>
        </div>
      </div>
    `;

    const modalEl = mount.querySelector('#tdModal');
    const listEl = mount.querySelector('#tdList');
    const statsEl = mount.querySelector('#tdStats');
    const searchEl = mount.querySelector('#tdSearch');
    const filterEl = mount.querySelector('#tdFilter');

    function refresh() {
      statsEl.innerHTML = renderStats();
      listEl.innerHTML = renderList();
    }
    function openModal(task) {
      editingId = task ? task.id : null;
      mount.querySelector('#tdModalTitle').textContent = task ? 'Sửa công việc' : 'Thêm công việc';
      mount.querySelector('#tdInpTitle').value = task ? task.title : '';
      mount.querySelector('#tdInpSubject').value = task ? (task.subject || '') : '';
      mount.querySelector('#tdInpPrio').value = task ? (task.priority || 'normal') : 'normal';
      mount.querySelector('#tdInpDeadline').value = task ? (task.deadline || '') : '';
      mount.querySelector('#tdInpNote').value = task ? (task.note || '') : '';
      modalEl.classList.add('show');
      setTimeout(() => mount.querySelector('#tdInpTitle').focus(), 100);
    }
    function closeModal() {
      modalEl.classList.remove('show');
      editingId = null;
    }

    filterEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.td-filter-btn');
      if (!btn) return;
      filter = btn.dataset.filter;
      filterEl.querySelectorAll('.td-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
      refresh();
    });
    searchEl.addEventListener('input', () => { search = searchEl.value.trim(); refresh(); });
    mount.querySelector('#tdAddBtn').addEventListener('click', () => openModal(null));

    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.td-item');
      if (!item) return;
      const id = item.dataset.id;
      const task = tasks.find(t => t.id === id);
      if (!task) return;
      const actBtn = e.target.closest('[data-act]');
      if (!actBtn) return;
      const act = actBtn.dataset.act;
      if (act === 'toggle') {
        task.done = !task.done;
        task.doneAt = task.done ? Date.now() : 0;
        save(); refresh();
      } else if (act === 'del') {
        if (!confirm(`Xoá "${task.title}"?`)) return;
        tasks = tasks.filter(t => t.id !== id);
        save(); refresh();
        window.App && window.App.toast && window.App.toast('🗑️ Đã xoá');
      } else if (act === 'edit') {
        openModal(task);
      }
    });

    mount.querySelector('#tdModalClose').addEventListener('click', closeModal);
    mount.querySelector('#tdModalCancel').addEventListener('click', closeModal);
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalEl && modalEl.classList.contains('show')) closeModal();
    });

    mount.querySelector('#tdModalSave').addEventListener('click', () => {
      const title = mount.querySelector('#tdInpTitle').value.trim();
      if (!title) {
        mount.querySelector('#tdInpTitle').focus();
        window.App && window.App.toast && window.App.toast('⚠️ Nhập tên công việc');
        return;
      }
      const data = {
        title,
        subject: mount.querySelector('#tdInpSubject').value,
        priority: mount.querySelector('#tdInpPrio').value,
        deadline: mount.querySelector('#tdInpDeadline').value || '',
        note: mount.querySelector('#tdInpNote').value.trim()
      };
      if (editingId) {
        const t = tasks.find(x => x.id === editingId);
        if (t) { Object.assign(t, data); t.updatedAt = Date.now(); }
        window.App && window.App.toast && window.App.toast('✏️ Đã cập nhật');
      } else {
        tasks.push({ id: uid(), ...data, done: false, createdAt: Date.now(), doneAt: 0 });
        window.App && window.App.toast && window.App.toast('✅ Đã thêm công việc');
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
      refresh();
    }, 60000);
  }

  window.Features['todo'] = {
    title: 'To-do & Deadline',
    icon: '✅',
    desc: 'Quản lý bài tập theo môn.',
    render
  };
})();