/* Feature module: To-do & Deadline */
(function () {
  'use strict';
  window.Features = window.Features || {};

  const STORAGE_KEY = 'pdfReader_todos_v1';
  const SUBJECTS = ['Toán', 'Lý', 'Hoá', 'Anh', 'Văn', 'Sử', 'Địa', 'Sinh', 'Khác'];
  const PRIORITIES = { high: 'Cao', normal: 'Bình thường', low: 'Thấp' };
  const DEFAULT_NOTIFY = {
    enabled: true, mode: 'milestones', before: [1440, 60, 30],
    dailyHour: 7, dailyMinute: 0, dailyFrom: 0
  };
  const OFFSET_OPTIONS = [
    { mins: 2880, label: '2 ngày' }, { mins: 1440, label: '1 ngày' },
    { mins: 720, label: '12 giờ' }, { mins: 360, label: '6 giờ' },
    { mins: 180, label: '3 giờ' }, { mins: 60, label: '1 giờ' },
    { mins: 30, label: '30 phút' }, { mins: 15, label: '15 phút' },
    { mins: 5, label: '5 phút' }
  ];

  let tasks = [], filter = 'all', search = '', editingId = null, tickInterval = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      tasks = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(tasks)) tasks = [];
    } catch (_) { tasks = []; }
    tasks.forEach(t => {
      if (!t.notify) t.notify = Object.assign({}, DEFAULT_NOTIFY, { before: DEFAULT_NOTIFY.before.slice() });
      else {
        if (!Array.isArray(t.notify.before)) t.notify.before = DEFAULT_NOTIFY.before.slice();
        if (typeof t.notify.enabled !== 'boolean') t.notify.enabled = true;
        if (t.notify.mode !== 'daily') t.notify.mode = 'milestones';
        if (!Number.isFinite(t.notify.dailyHour)) t.notify.dailyHour = 7;
        if (!Number.isFinite(t.notify.dailyMinute)) t.notify.dailyMinute = 0;
        if (!Number.isFinite(t.notify.dailyFrom)) t.notify.dailyFrom = 0;
      }
    });
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (_) {} }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function parseDeadline(s) { if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d; }
  function pad2(n) { return String(n).padStart(2, '0'); }

  function formatDateFull(d) {
    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    return `${days[d.getDay()]}, ngày ${d.getDate()} tháng ${d.getMonth()+1} năm ${d.getFullYear()} • ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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
    const now = new Date(), diff = dl - now, absDiff = Math.abs(diff);
    const min = 60000, hour = 60*min, day = 24*hour;
    if (diff < 0) {
      if (absDiff < hour) return { text: `Quá hạn ${Math.round(absDiff/min)} phút`, cls: 'overdue' };
      if (absDiff < day) return { text: `Quá hạn ${Math.round(absDiff/hour)} giờ`, cls: 'overdue' };
      if (absDiff < 7*day) return { text: `Quá hạn ${Math.round(absDiff/day)} ngày`, cls: 'overdue' };
      return { text: `Quá hạn — ${formatDateFull(dl)}`, cls: 'overdue' };
    }
    if (diff < hour) return { text: `Còn ${Math.round(diff/min)} phút`, cls: 'today' };
    if (diff < day) return { text: `Còn ${Math.round(diff/hour)} giờ`, cls: 'today' };
    if (diff < 3*day) return { text: `Còn ${Math.round(diff/day)} ngày`, cls: 'soon' };
    return { text: formatDateFull(dl), cls: '' };
  }

  function renderStats() {
    const overdue = tasks.filter(t => classify(t) === 'overdue').length;
    const today = tasks.filter(t => classify(t) === 'today').length;
    const active = tasks.filter(t => !t.done).length;
    const done = tasks.filter(t => t.done).length;
    return `<div class="td-stats">
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
    const nf = task.notify || DEFAULT_NOTIFY;
    let notifyBadge;
    if (!nf.enabled) notifyBadge = `<span class="notify-badge off">🔕 Tắt</span>`;
    else if (nf.mode === 'daily') notifyBadge = `<span class="notify-badge">🔔 Hàng ngày ${pad2(nf.dailyHour||7)}:${pad2(nf.dailyMinute||0)}</span>`;
    else notifyBadge = `<span class="notify-badge">🔔 ${(nf.before||[]).length} mốc</span>`;
    return `<div class="td-item ${task.done?'done':''}" data-id="${task.id}">
      <button class="td-check ${task.done?'checked':''}" data-act="toggle"></button>
      <div class="td-main">
        <div class="td-title">${escapeHtml(task.title)}</div>
        <div class="td-meta">
          ${task.subject ? `<span class="td-tag subject">${escapeHtml(task.subject)}</span>` : ''}
          ${prio !== 'normal' ? `<span class="td-tag prio-${prio}">${PRIORITIES[prio]}</span>` : ''}
          <span class="td-time ${dlInfo.cls}">🕒 ${dlInfo.text}</span>
          ${notifyBadge}
        </div>
      </div>
      <div class="td-actions">
        <button class="td-btn" data-act="edit">✏️</button>
        <button class="td-btn del" data-act="del">🗑️</button>
      </div>
    </div>`;
  }

  function renderList() {
    let list = tasks.slice();
    if (filter === 'active') list = list.filter(t => !t.done);
    else if (filter === 'done') list = list.filter(t => t.done);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => (t.title||'').toLowerCase().includes(q) || (t.subject||'').toLowerCase().includes(q) || (t.note||'').toLowerCase().includes(q));
    }
    if (list.length === 0) return `<div class="td-empty"><span class="ico">📭</span>Chưa có công việc nào.<br>Bấm <b>＋ Thêm công việc</b> để bắt đầu.</div>`;
    const groups = { overdue: [], today: [], future: [], done: [] };
    list.forEach(t => groups[classify(t)].push(t));
    const byDl = (a,b) => (parseDeadline(a.deadline)?.getTime() ?? Infinity) - (parseDeadline(b.deadline)?.getTime() ?? Infinity);
    groups.overdue.sort(byDl); groups.today.sort(byDl); groups.future.sort(byDl);
    groups.done.sort((a,b) => (b.doneAt||0) - (a.doneAt||0));
    const labels = { overdue: '🔥 Quá hạn', today: '⏰ Hôm nay', future: '📅 Sắp tới', done: '✅ Đã hoàn thành' };
    let html = '';
    for (const key of ['overdue','today','future','done']) {
      const arr = groups[key];
      if (arr.length === 0) continue;
      html += `<div class="td-group ${key}"><h3 class="td-group-title">${labels[key]}<span class="cnt">${arr.length}</span></h3><div class="td-list">${arr.map(renderTaskItem).join('')}</div></div>`;
    }
    return html;
  }

  function notifyBlockHtml(prefix, task) {
    const nf = task ? (task.notify || DEFAULT_NOTIFY) : DEFAULT_NOTIFY;
    const isDaily = nf.mode === 'daily';
    const hh = pad2(nf.dailyHour ?? 7), mm = pad2(nf.dailyMinute ?? 0);
    return `<div class="nf-block" id="${prefix}NotifyBlock">
      <div class="nf-block-head">
        <div class="nf-block-title">Bật thông báo</div>
        <label class="nf-switch"><input type="checkbox" id="${prefix}InpNotifyEnabled"${nf.enabled!==false?' checked':''}><span></span></label>
      </div>
      <div class="nf-mode-tabs">
        <button type="button" class="nf-mode-tab${!isDaily?' active':''}" data-mode="milestones">🎯 Mốc cố định</button>
        <button type="button" class="nf-mode-tab${isDaily?' active':''}" data-mode="daily">📅 Hàng ngày</button>
      </div>
      <div class="nf-mode-pane nf-mode-milestones" style="${isDaily?'display:none':''}">
        <div class="nf-block-grid">
          ${OFFSET_OPTIONS.map(o => `<label class="nf-block-item"><input type="checkbox" data-offset="${o.mins}"${(nf.before||[]).includes(o.mins)?' checked':''}><span>${o.label}</span></label>`).join('')}
        </div>
      </div>
      <div class="nf-mode-pane nf-mode-daily" style="${isDaily?'':'display:none'}">
        <div class="nf-daily-row">
          <div class="nf-daily-label"><div class="nf-daily-title">⏰ Giờ nhắc mỗi ngày</div><div class="nf-daily-desc">Bắn vào giờ này mỗi ngày</div></div>
          <input type="time" class="nf-time" id="${prefix}InpDailyTime" value="${hh}:${mm}">
        </div>
        <div class="nf-daily-row">
          <div class="nf-daily-label"><div class="nf-daily-title">📆 Bắt đầu nhắc trước</div><div class="nf-daily-desc">Chỉ nhắc khi còn ít hơn số ngày này</div></div>
          <select class="nf-select" id="${prefix}InpDailyFrom">
            <option value="0"${(nf.dailyFrom??0)===0?' selected':''}>Từ bây giờ</option>
            <option value="1"${(nf.dailyFrom??0)===1?' selected':''}>1 ngày cuối</option>
            <option value="3"${(nf.dailyFrom??0)===3?' selected':''}>3 ngày cuối</option>
            <option value="7"${(nf.dailyFrom??0)===7?' selected':''}>7 ngày cuối</option>
            <option value="14"${(nf.dailyFrom??0)===14?' selected':''}>14 ngày cuối</option>
            <option value="30"${(nf.dailyFrom??0)===30?' selected':''}>30 ngày cuối</option>
          </select>
        </div>
        <div class="nf-daily-hint">💡 Ví dụ: chọn 7 ngày cuối → mỗi sáng nhận "Còn X ngày nữa đến hạn"</div>
      </div>
    </div>`;
  }

  function render(mount) {
    load();
    mount.innerHTML = `
      <div class="td-wrap">
        <div class="td-toolbar">
          <button class="td-add-btn" id="tdAddBtn">＋ Thêm công việc</button>
          <div class="td-filter" id="tdFilter">
            <div class="td-filter-pill" id="tdFilterPill"></div>
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
          <div class="td-modal-head"><span id="tdModalTitle">Thêm công việc</span><button class="td-modal-close" id="tdModalClose">✕</button></div>
          <div class="td-modal-body">
            <div class="td-field"><label>Tên công việc *</label><input type="text" id="tdInpTitle" placeholder="VD: Làm bài tập chương 3..." maxlength="200"></div>
            <div class="td-field-row">
              <div class="td-field"><label>Môn học</label><select id="tdInpSubject"><option value="">— Chọn môn —</option>${SUBJECTS.map(s => `<option value="${s}">${s}</option>`).join('')}</select></div>
              <div class="td-field"><label>Ưu tiên</label><select id="tdInpPrio"><option value="normal">Bình thường</option><option value="high">Cao</option><option value="low">Thấp</option></select></div>
            </div>
            <div class="td-field"><label>Hạn chót</label><input type="datetime-local" id="tdInpDeadline"></div>
            <div class="td-field"><label>🔔 Nhắc nhở cho công việc này</label><div id="tdNotifyMount"></div></div>
            <div class="td-field"><label>Ghi chú</label><textarea id="tdInpNote" rows="2" placeholder="Chi tiết thêm..." maxlength="1000"></textarea></div>
          </div>
          <div class="td-modal-foot">
            <button class="td-modal-btn cancel" id="tdModalCancel">Huỷ</button>
            <button class="td-modal-btn save" id="tdModalSave">Lưu</button>
          </div>
        </div>
      </div>`;

    if (window.App && window.App.enhanceAllDT) window.App.enhanceAllDT(mount);

    const modalEl = mount.querySelector('#tdModal');
    const listEl = mount.querySelector('#tdList');
    const statsEl = mount.querySelector('#tdStats');
    const searchEl = mount.querySelector('#tdSearch');
    const filterEl = mount.querySelector('#tdFilter');
    const pillEl = mount.querySelector('#tdFilterPill');
    const nfMount = mount.querySelector('#tdNotifyMount');

    let currentMode = 'milestones';

    function placeFilterPill(animate) {
      const activeBtn = filterEl.querySelector('.td-filter-btn.active');
      if (!pillEl || !activeBtn) return;
      const fRect = filterEl.getBoundingClientRect();
      const bRect = activeBtn.getBoundingClientRect();
      const left = bRect.left - fRect.left + filterEl.scrollLeft;
      const width = bRect.width;
      if (!animate) {
        const prev = pillEl.style.transition;
        pillEl.style.transition = 'none';
        pillEl.style.transform = `translateX(${left}px)`;
        pillEl.style.width = width + 'px';
        void pillEl.offsetWidth;
        pillEl.style.transition = prev;
      } else {
        pillEl.style.transform = `translateX(${left}px)`;
        pillEl.style.width = width + 'px';
      }
    }

    function bindNotifyBlock(mode) {
      currentMode = mode;
      const nfBlock = nfMount.querySelector('#tdNotifyBlock');
      if (!nfBlock) return;
      const nfEnabled = nfBlock.querySelector('#tdInpNotifyEnabled');
      nfEnabled.addEventListener('change', () => nfBlock.classList.toggle('off', !nfEnabled.checked));
      nfBlock.classList.toggle('off', !nfEnabled.checked);
      nfBlock.querySelectorAll('.nf-mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const m = tab.dataset.mode;
          if (m === currentMode) return;
          currentMode = m;
          nfBlock.querySelectorAll('.nf-mode-tab').forEach(t => t.classList.toggle('active', t === tab));
          nfBlock.querySelector('.nf-mode-milestones').style.display = (m === 'milestones') ? '' : 'none';
          nfBlock.querySelector('.nf-mode-daily').style.display = (m === 'daily') ? '' : 'none';
        });
      });
    }

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
      const nf = task ? (task.notify || DEFAULT_NOTIFY) : DEFAULT_NOTIFY;
      nfMount.innerHTML = notifyBlockHtml('td', { notify: nf });
      bindNotifyBlock(nf.mode || 'milestones');
      modalEl.classList.add('show');
      setTimeout(() => mount.querySelector('#tdInpTitle').focus(), 100);
    }
    function closeModal() { modalEl.classList.remove('show'); editingId = null; }

    filterEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.td-filter-btn');
      if (!btn) return;
      if (btn.dataset.filter === filter) return;
      filter = btn.dataset.filter;
      filterEl.querySelectorAll('.td-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
      placeFilterPill(true);
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
        /* Reset sent → có thể bắn lại cho lần tới */
        window.Notify && window.Notify.resetSentForItem && window.Notify.resetSentForItem(task.id, 'task');
        save(); refresh();
      } else if (act === 'del') {
        if (!confirm(`Xoá "${task.title}"?`)) return;
        tasks = tasks.filter(t => t.id !== id);
        window.Notify && window.Notify.resetSentForItem && window.Notify.resetSentForItem(id, 'task');
        save(); refresh();
        window.App && window.App.toast && window.App.toast('🗑️ Đã xoá');
      } else if (act === 'edit') openModal(task);
    });

    mount.querySelector('#tdModalClose').addEventListener('click', closeModal);
    mount.querySelector('#tdModalCancel').addEventListener('click', closeModal);
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalEl.classList.contains('show')) closeModal();
    });

    mount.querySelector('#tdModalSave').addEventListener('click', () => {
      const title = mount.querySelector('#tdInpTitle').value.trim();
      if (!title) { mount.querySelector('#tdInpTitle').focus(); window.App && window.App.toast && window.App.toast('⚠️ Nhập tên công việc'); return; }
      const nfBlock = nfMount.querySelector('#tdNotifyBlock');
      const enabledVal = nfBlock.querySelector('#tdInpNotifyEnabled').checked;
      let notifyData;
      if (currentMode === 'daily') {
        const timeVal = nfBlock.querySelector('#tdInpDailyTime').value || '07:00';
        const [hh, mm] = timeVal.split(':');
        const fromVal = parseInt(nfBlock.querySelector('#tdInpDailyFrom').value, 10) || 0;
        notifyData = { enabled: enabledVal, mode: 'daily', before: [], dailyHour: parseInt(hh,10)||7, dailyMinute: parseInt(mm,10)||0, dailyFrom: fromVal };
      } else {
        const before = Array.from(nfBlock.querySelectorAll('[data-offset]:checked')).map(cb => parseInt(cb.dataset.offset, 10)).sort((a,b) => b-a);
        const beforeFinal = (enabledVal && before.length === 0) ? DEFAULT_NOTIFY.before.slice() : before;
        notifyData = { enabled: enabledVal, mode: 'milestones', before: beforeFinal, dailyHour: 7, dailyMinute: 0, dailyFrom: 0 };
      }
      const data = {
        title,
        subject: mount.querySelector('#tdInpSubject').value,
        priority: mount.querySelector('#tdInpPrio').value,
        deadline: mount.querySelector('#tdInpDeadline').value || '',
        note: mount.querySelector('#tdInpNote').value.trim(),
        notify: notifyData
      };
      if (editingId) {
        const t = tasks.find(x => x.id === editingId);
        if (t) {
          Object.assign(t, data);
          t.updatedAt = Date.now();
          /* Reset sent → nếu deadline đổi, mốc mới bắn lại */
          window.Notify && window.Notify.resetSentForItem && window.Notify.resetSentForItem(t.id, 'task');
        }
        window.App && window.App.toast && window.App.toast('✏️ Đã cập nhật');
      } else {
        tasks.push({ id: uid(), ...data, done: false, createdAt: Date.now(), doneAt: 0 });
        window.App && window.App.toast && window.App.toast('✅ Đã thêm công việc');
      }
      save(); closeModal(); refresh();
    });

    refresh();
    requestAnimationFrame(() => placeFilterPill(false));

    if (window._tdFilterRO) window._tdFilterRO.disconnect();
    window._tdFilterRO = new ResizeObserver(() => {
      if (!mount.isConnected) { window._tdFilterRO.disconnect(); window._tdFilterRO = null; return; }
      placeFilterPill(false);
    });
    window._tdFilterRO.observe(filterEl);

    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(() => {
      if (!mount.isConnected) { clearInterval(tickInterval); tickInterval = null; return; }
      refresh();
    }, 60000);
  }

  window.Features['todo'] = {
    title: 'To-do & Deadline', icon: '✅',
    desc: 'Quản lý bài tập theo môn.', render
  };
})();