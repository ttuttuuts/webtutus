/* Feature module: Đếm ngược kì thi */
(function () {
  'use strict';
  window.Features = window.Features || {};

  const STORAGE_KEY = 'pdfReader_exams_v1';
  const SUBJECTS = ['Toán', 'Lý', 'Hoá', 'Anh', 'Văn', 'Sử', 'Địa', 'Sinh', 'Khác'];
  const DEFAULT_NOTIFY = {
    enabled: true, mode: 'milestones', before: [10080, 1440, 60],
    dailyHour: 7, dailyMinute: 0, dailyFrom: 0
  };
  const OFFSET_OPTIONS = [
    { mins: 20160, label: '2 tuần' }, { mins: 10080, label: '1 tuần' },
    { mins: 4320, label: '3 ngày' }, { mins: 2880, label: '2 ngày' },
    { mins: 1440, label: '1 ngày' }, { mins: 720, label: '12 giờ' },
    { mins: 180, label: '3 giờ' }, { mins: 60, label: '1 giờ' }
  ];

  let exams = [], editingId = null, tickInterval = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      exams = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(exams)) exams = [];
    } catch (_) { exams = []; }
    exams.forEach(e => {
      if (!e.notify) e.notify = Object.assign({}, DEFAULT_NOTIFY, { before: DEFAULT_NOTIFY.before.slice() });
      else {
        if (!Array.isArray(e.notify.before)) e.notify.before = DEFAULT_NOTIFY.before.slice();
        if (typeof e.notify.enabled !== 'boolean') e.notify.enabled = true;
        if (e.notify.mode !== 'daily') e.notify.mode = 'milestones';
        if (!Number.isFinite(e.notify.dailyHour)) e.notify.dailyHour = 7;
        if (!Number.isFinite(e.notify.dailyMinute)) e.notify.dailyMinute = 0;
        if (!Number.isFinite(e.notify.dailyFrom)) e.notify.dailyFrom = 0;
      }
    });
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(exams)); } catch (_) {} }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function pad2(n) { return String(n).padStart(2, '0'); }

  function getRemaining(target) {
    const diff = target - Date.now();
    if (diff <= 0) return { done: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
    const s = Math.floor(diff / 1000);
    return { done: false, days: Math.floor(s/86400), hours: Math.floor((s%86400)/3600), minutes: Math.floor((s%3600)/60), seconds: s%60 };
  }
  function formatDateVN(ts) {
    const d = new Date(ts);
    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    return `${days[d.getDay()]}, ngày ${d.getDate()} tháng ${d.getMonth()+1} năm ${d.getFullYear()} • ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function renderExamCard(exam, isNext) {
    const dl = new Date(exam.datetime).getTime();
    const rem = getRemaining(dl);
    const created = exam.createdAt || Date.now();
    const total = dl - created, elapsed = Date.now() - created;
    const pct = total > 0 ? Math.max(0, Math.min(100, (elapsed/total)*100)) : 100;

    let cls = '';
    if (isNext && !rem.done) cls += ' next';
    if (rem.done) cls += ' done';
    if (!rem.done && rem.days <= 3) cls += ' critical';
    else if (!rem.done && rem.days <= 7) cls += ' urgent';

    const nf = exam.notify || DEFAULT_NOTIFY;
    let notifyBadge;
    if (!nf.enabled) notifyBadge = `<span class="notify-badge off">🔕 Tắt</span>`;
    else if (nf.mode === 'daily') notifyBadge = `<span class="notify-badge">🔔 Hàng ngày ${pad2(nf.dailyHour||7)}:${pad2(nf.dailyMinute||0)}</span>`;
    else notifyBadge = `<span class="notify-badge">🔔 ${(nf.before||[]).length} mốc</span>`;

    const timeHtml = rem.done
      ? `<div class="ex-done-badge">✅ Đã thi xong</div>`
      : `<div class="ex-countdown">
          <div class="ex-unit"><div class="ex-num" data-tick="days">${rem.days}</div><div class="ex-lbl">Ngày</div></div>
          <div class="ex-sep">:</div>
          <div class="ex-unit"><div class="ex-num" data-tick="hours">${pad2(rem.hours)}</div><div class="ex-lbl">Giờ</div></div>
          <div class="ex-sep">:</div>
          <div class="ex-unit"><div class="ex-num" data-tick="minutes">${pad2(rem.minutes)}</div><div class="ex-lbl">Phút</div></div>
          <div class="ex-sep">:</div>
          <div class="ex-unit"><div class="ex-num" data-tick="seconds">${pad2(rem.seconds)}</div><div class="ex-lbl">Giây</div></div>
        </div>`;

    return `<div class="ex-card${cls}" data-id="${exam.id}">
      <div class="ex-head">
        <div class="ex-title-row">
          ${isNext && !rem.done ? '<span class="ex-next-badge">🎯 Kì thi gần nhất</span>' : ''}
          <div class="ex-title">${escapeHtml(exam.name)}</div>
        </div>
        <div class="ex-actions">
          <button class="ex-btn" data-act="edit">✏️</button>
          <button class="ex-btn del" data-act="del">🗑️</button>
        </div>
      </div>
      <div class="ex-meta">
        ${exam.subject ? `<span class="ex-tag">${escapeHtml(exam.subject)}</span>` : ''}
        <span class="ex-when">📅 ${formatDateVN(dl)}</span>
        ${exam.location ? `<span class="ex-where">📍 ${escapeHtml(exam.location)}</span>` : ''}
        ${notifyBadge}
      </div>
      ${timeHtml}
      ${!rem.done ? `<div class="ex-progress-wrap"><div class="ex-progress"><div class="ex-progress-fill" style="width:${pct.toFixed(2)}%"></div></div><div class="ex-progress-label">Đã qua <b>${pct.toFixed(1)}%</b> thời gian chuẩn bị</div></div>` : ''}
      ${exam.note ? `<div class="ex-note">💬 ${escapeHtml(exam.note)}</div>` : ''}
    </div>`;
  }

  function renderList() {
    if (exams.length === 0) return `<div class="ex-empty"><span class="ico">⏳</span>Chưa có kì thi nào.<br>Bấm <b>＋ Thêm kì thi</b> để bắt đầu đếm ngược.</div>`;
    const now = Date.now();
    const sorted = exams.slice().sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
    const next = sorted.find(e => new Date(e.datetime).getTime() > now);
    const nextId = next ? next.id : null;
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

  function notifyBlockHtml(prefix, exam) {
    const nf = exam ? (exam.notify || DEFAULT_NOTIFY) : DEFAULT_NOTIFY;
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
            <option value="3"${(nf.dailyFrom??0)===3?' selected':''}>3 ngày cuối</option>
            <option value="7"${(nf.dailyFrom??0)===7?' selected':''}>7 ngày cuối</option>
            <option value="14"${(nf.dailyFrom??0)===14?' selected':''}>14 ngày cuối</option>
            <option value="30"${(nf.dailyFrom??0)===30?' selected':''}>30 ngày cuối</option>
            <option value="60"${(nf.dailyFrom??0)===60?' selected':''}>60 ngày cuối</option>
            <option value="90"${(nf.dailyFrom??0)===90?' selected':''}>90 ngày cuối</option>
          </select>
        </div>
        <div class="nf-daily-hint">💡 Ví dụ: chọn 7 ngày cuối → mỗi sáng nhận "Còn X ngày nữa là thi"</div>
      </div>
    </div>`;
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
          <div class="ex-modal-head"><span id="exModalTitle">Thêm kì thi</span><button class="ex-modal-close" id="exModalClose">✕</button></div>
          <div class="ex-modal-body">
            <div class="ex-field"><label>Tên kì thi *</label><input type="text" id="exInpName" placeholder="VD: Kiểm tra 1 tiết chương 3..." maxlength="200"></div>
            <div class="ex-field-row">
              <div class="ex-field"><label>Môn học</label><select id="exInpSubject"><option value="">— Chọn môn —</option>${SUBJECTS.map(s => `<option value="${s}">${s}</option>`).join('')}</select></div>
              <div class="ex-field"><label>Địa điểm</label><input type="text" id="exInpLocation" placeholder="VD: Phòng A201" maxlength="100"></div>
            </div>
            <div class="ex-field"><label>Ngày giờ thi *</label><input type="datetime-local" id="exInpDatetime"></div>
            <div class="ex-field"><label>🔔 Nhắc nhở cho kì thi này</label><div id="exNotifyMount"></div></div>
            <div class="ex-field"><label>Ghi chú</label><textarea id="exInpNote" rows="2" placeholder="VD: Cần mang máy tính..." maxlength="500"></textarea></div>
          </div>
          <div class="ex-modal-foot">
            <button class="ex-modal-btn cancel" id="exModalCancel">Huỷ</button>
            <button class="ex-modal-btn save" id="exModalSave">Lưu</button>
          </div>
        </div>
      </div>`;

    if (window.App && window.App.enhanceAllDT) window.App.enhanceAllDT(mount);

    const modalEl = mount.querySelector('#exModal');
    const listEl = mount.querySelector('#exList');
    const nfMount = mount.querySelector('#exNotifyMount');

    let currentMode = 'milestones';

    function refresh() { listEl.innerHTML = renderList(); }

    function bindNotifyBlock(mode) {
      currentMode = mode;
      const nfBlock = nfMount.querySelector('#exNotifyBlock');
      if (!nfBlock) return;
      const nfEnabled = nfBlock.querySelector('#exInpNotifyEnabled');
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

    function tick() {
      if (!mount.isConnected) return;
      const now = Date.now();
      listEl.querySelectorAll('.ex-card').forEach(card => {
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
        const total = dl - created, elapsed = now - created;
        const pct = total > 0 ? Math.max(0, Math.min(100, (elapsed/total)*100)) : 100;
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
      const nf = exam ? (exam.notify || DEFAULT_NOTIFY) : DEFAULT_NOTIFY;
      nfMount.innerHTML = notifyBlockHtml('ex', { notify: nf });
      bindNotifyBlock(nf.mode || 'milestones');
      modalEl.classList.add('show');
      setTimeout(() => mount.querySelector('#exInpName').focus(), 100);
    }
    function closeModal() { modalEl.classList.remove('show'); editingId = null; }

    mount.querySelector('#exAddBtn').addEventListener('click', () => openModal(null));

    listEl.addEventListener('click', (e) => {
      const card = e.target.closest('.ex-card');
      if (!card) return;
      const id = card.dataset.id;
      const exam = exams.find(x => x.id === id);
      if (!exam) return;
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'del') {
        if (!confirm(`Xoá kì thi "${exam.name}"?`)) return;
        exams = exams.filter(x => x.id !== id);
        window.Notify && window.Notify.resetSentForItem && window.Notify.resetSentForItem(id, 'exam');
        save(); refresh();
        window.App && window.App.toast && window.App.toast('🗑️ Đã xoá');
      } else if (act.dataset.act === 'edit') openModal(exam);
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
      const nfBlock = nfMount.querySelector('#exNotifyBlock');
      const enabledVal = nfBlock.querySelector('#exInpNotifyEnabled').checked;
      let notifyData;
      if (currentMode === 'daily') {
        const timeVal = nfBlock.querySelector('#exInpDailyTime').value || '07:00';
        const [hh, mm] = timeVal.split(':');
        const fromVal = parseInt(nfBlock.querySelector('#exInpDailyFrom').value, 10) || 0;
        notifyData = { enabled: enabledVal, mode: 'daily', before: [], dailyHour: parseInt(hh,10)||7, dailyMinute: parseInt(mm,10)||0, dailyFrom: fromVal };
      } else {
        const before = Array.from(nfBlock.querySelectorAll('[data-offset]:checked')).map(cb => parseInt(cb.dataset.offset, 10)).sort((a,b) => b-a);
        const beforeFinal = (enabledVal && before.length === 0) ? DEFAULT_NOTIFY.before.slice() : before;
        notifyData = { enabled: enabledVal, mode: 'milestones', before: beforeFinal, dailyHour: 7, dailyMinute: 0, dailyFrom: 0 };
      }
      const data = {
        name,
        subject: mount.querySelector('#exInpSubject').value,
        location: mount.querySelector('#exInpLocation').value.trim(),
        datetime: dt,
        note: mount.querySelector('#exInpNote').value.trim(),
        notify: notifyData
      };
      if (editingId) {
        const t = exams.find(x => x.id === editingId);
        if (t) {
          Object.assign(t, data);
          t.updatedAt = Date.now();
          window.Notify && window.Notify.resetSentForItem && window.Notify.resetSentForItem(t.id, 'exam');
        }
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
      if (!mount.isConnected) { clearInterval(tickInterval); tickInterval = null; return; }
      tick();
    }, 1000);
  }

  window.Features['exam'] = {
    title: 'Đếm ngược kì thi', icon: '⏳',
    desc: 'Đếm ngược tới ngày thi, xem thời gian còn lại.', render
  };
})();