/* ============================================================
   NOTIFY MODULE — Thông báo deadline + kì thi + hàng ngày
   ============================================================ */
(function () {
  'use strict';

  const ENABLED_KEY = 'pdfReader_notify_enabled';
  const SENT_KEY = 'pdfReader_notify_sent';
  const SETTINGS_KEY = 'pdfReader_notify_settings';
  const LAST_DAILY_KEY = 'pdfReader_notify_lastDaily';
  const CHECK_INTERVAL = 30 * 1000;

  const DEFAULT_SETTINGS = {
    dailyEnabled: false,
    dailyHour: 7,
    dailyMinute: 0,
    tasksEnabled: true,
    examsEnabled: true,
    contentTasks: true,
    contentOverdue: true,
    contentExams: true
  };

  let checkTimer = null;
  let swRegistration = null;
  let settings = Object.assign({}, DEFAULT_SETTINGS);

  /* ---------- STORAGE ---------- */
  function readJSON(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (_) { return fallback; }
  }
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      settings = Object.assign({}, DEFAULT_SETTINGS, raw ? JSON.parse(raw) : {});
    } catch (_) { settings = Object.assign({}, DEFAULT_SETTINGS); }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
  }

  function isEnabled() {
    return localStorage.getItem(ENABLED_KEY) === '1';
  }
  function setEnabled(v) {
    try { localStorage.setItem(ENABLED_KEY, v ? '1' : '0'); } catch (_) {}
    if (v) startChecking(); else stopChecking();
    updateUI();
  }

  function getSent() { return readJSON(SENT_KEY, {}); }
  function saveSent(o) {
    try {
      const now = Date.now();
      const clean = {};
      for (const k in o) if (now - o[k] < 7 * 86400000) clean[k] = o[k];
      localStorage.setItem(SENT_KEY, JSON.stringify(clean));
    } catch (_) {}
  }
  function wasSent(key) { return !!getSent()[key]; }
  function markSent(key) {
    const o = getSent();
    o[key] = Date.now();
    saveSent(o);
  }

  function toast(msg) {
    if (window.App && window.App.toast) window.App.toast(msg);
  }

  /* ---------- PERMISSION ---------- */
  async function ensurePermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try { return await Notification.requestPermission(); }
    catch (_) { return 'denied'; }
  }

  /* ---------- SHOW ---------- */
  async function showNotify(title, body, opts) {
    if (!isEnabled()) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const options = Object.assign({
      body: body || '',
      icon: 'icons/icon-192.svg',
      badge: 'icons/icon-192.svg',
      tag: 'hoctrohoctap',
      requireInteraction: false,
      data: { url: './#/home' }
    }, opts || {});

    try {
      if (swRegistration) {
        await swRegistration.showNotification(title, options);
      } else {
        const n = new Notification(title, options);
        n.onclick = () => { window.focus(); n.close(); };
      }
    } catch (_) {
      try { new Notification(title, options); } catch (__) {}
    }
  }

  /* ---------- CHECK TASKS ---------- */
  function checkTasks() {
    if (!settings.tasksEnabled) return;
    const tasks = readJSON('pdfReader_todos_v1', []);
    if (!Array.isArray(tasks)) return;
    const now = Date.now();

    for (const t of tasks) {
      if (t.done || !t.deadline) continue;
      const dl = new Date(t.deadline).getTime();
      if (isNaN(dl)) continue;
      const diff = dl - now;

      const wins = [
        { key: 'overdue_1h', cond: diff < 0 && diff > -3600000, msg: 'đã quá hạn!', urgent: true },
        { key: '5min',  cond: diff > 0 && diff <= 5 * 60000, msg: 'còn 5 phút' },
        { key: '30min', cond: diff > 5 * 60000 && diff <= 30 * 60000, msg: 'còn 30 phút' },
        { key: '1h',    cond: diff > 30 * 60000 && diff <= 3600000, msg: 'còn 1 giờ' },
        { key: '3h',    cond: diff > 3600000 && diff <= 3 * 3600000, msg: 'còn 3 giờ' },
        { key: '1d',    cond: diff > 3 * 3600000 && diff <= 86400000, msg: 'còn 1 ngày' }
      ];

      for (const w of wins) {
        if (!w.cond) continue;
        const k = `task_${t.id}_${w.key}`;
        if (wasSent(k)) continue;
        markSent(k);
        showNotify(
          (w.urgent ? '🚨 ' : '📋 ') + t.title,
          `Deadline ${w.msg}` + (t.subject ? ` • ${t.subject}` : ''),
          { tag: `task_${t.id}`, requireInteraction: !!w.urgent, data: { url: './#/todo' } }
        );
        break;
      }
    }
  }

  /* ---------- CHECK EXAMS ---------- */
  function checkExams() {
    if (!settings.examsEnabled) return;
    const exams = readJSON('pdfReader_exams_v1', []);
    if (!Array.isArray(exams)) return;
    const now = Date.now();

    for (const e of exams) {
      const dl = new Date(e.datetime).getTime();
      if (isNaN(dl)) continue;
      const diff = dl - now;
      if (diff < 0) continue;
      const days = diff / 86400000;

      const wins = [
        { key: '1h',  cond: days <= 1 / 24 && days > 0, msg: 'còn 1 giờ!', urgent: true },
        { key: '1d',  cond: days <= 1 && days > 1 / 24, msg: 'còn 1 ngày' },
        { key: '3d',  cond: days <= 3 && days > 1, msg: 'còn 3 ngày' },
        { key: '7d',  cond: days <= 7 && days > 3, msg: 'còn 7 ngày' },
        { key: '14d', cond: days <= 14 && days > 7, msg: 'còn 2 tuần' }
      ];

      for (const w of wins) {
        if (!w.cond) continue;
        const k = `exam_${e.id}_${w.key}`;
        if (wasSent(k)) continue;
        markSent(k);
        showNotify(
          (w.urgent ? '🚨 ' : '⏳ ') + e.name,
          `Kì thi ${w.msg}` + (e.subject ? ` • ${e.subject}` : '') + (e.location ? ` • ${e.location}` : ''),
          { tag: `exam_${e.id}`, requireInteraction: !!w.urgent, data: { url: './#/exam' } }
        );
        break;
      }
    }
  }

  /* ---------- CHECK DAILY ---------- */
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
  }

  function buildDailySummary() {
    const now = new Date();
    const tasks = readJSON('pdfReader_todos_v1', []);
    const exams = readJSON('pdfReader_exams_v1', []);
    const lines = [];

    if (settings.contentTasks && Array.isArray(tasks)) {
      const todayTasks = tasks.filter(t => !t.done && t.deadline && sameDay(new Date(t.deadline), now));
      if (todayTasks.length > 0) lines.push(`📋 ${todayTasks.length} task hôm nay`);
    }
    if (settings.contentOverdue && Array.isArray(tasks)) {
      const overdueTasks = tasks.filter(t => !t.done && t.deadline && new Date(t.deadline) < now);
      if (overdueTasks.length > 0) lines.push(`🔥 ${overdueTasks.length} task quá hạn`);
    }
    if (settings.contentExams && Array.isArray(exams)) {
      const upcoming = exams.filter(e => {
        const d = new Date(e.datetime);
        return d > now && (d - now) <= 7 * 86400000;
      });
      if (upcoming.length > 0) {
        const next = upcoming.sort((a, b) => new Date(a.datetime) - new Date(b.datetime))[0];
        const daysLeft = Math.ceil((new Date(next.datetime) - now) / 86400000);
        lines.push(`⏳ ${next.name} còn ${daysLeft} ngày`);
      }
    }
    if (lines.length === 0) lines.push('Không có task nào — nghỉ ngơi thôi! 🎉');
    return lines.join(' • ');
  }

  function checkDaily() {
    if (!settings.dailyEnabled) return;
    if (!isEnabled()) return;

    const now = new Date();
    const todayKey = now.toDateString();
    const lastSent = localStorage.getItem(LAST_DAILY_KEY) || '';
    if (lastSent === todayKey) return;

    const nowMin = now.getHours() * 60 + now.getMinutes();
    const targetMin = settings.dailyHour * 60 + settings.dailyMinute;
    if (nowMin < targetMin) return;

    const body = buildDailySummary();
    showNotify('📚 Nhắc học tập hôm nay', body, {
      tag: 'daily',
      data: { url: './#/home' }
    });
    try { localStorage.setItem(LAST_DAILY_KEY, todayKey); } catch (_) {}
  }

  function checkAll() {
    try { checkTasks(); } catch (_) {}
    try { checkExams(); } catch (_) {}
    try { checkDaily(); } catch (_) {}
  }

  function startChecking() {
    stopChecking();
    checkAll();
    checkTimer = setInterval(checkAll, CHECK_INTERVAL);
  }
  function stopChecking() {
    if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
  }

  /* ---------- UI: SIDEBAR BUTTON ---------- */
  function updateUI() {
    const btn = document.getElementById('notifyToggle');
    if (!btn) return;
    const icon = document.getElementById('notifyIcon');
    const label = document.getElementById('notifyLabel');
    const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    const on = isEnabled() && perm === 'granted';
    if (icon) icon.textContent = on ? '🔔' : '🔕';
    if (label) label.textContent = on ? 'Thông báo đang bật' : 'Cài đặt thông báo';
    btn.classList.toggle('on', on);
  }

  /* ---------- SETTINGS MODAL ---------- */
  function refreshSettingsUI() {
    const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    const permEl = document.getElementById('nfPermStatus');
    const permBtn = document.getElementById('nfPermBtn');
    const permRow = document.getElementById('nfPermRow');
    if (permEl) {
      if (perm === 'granted') permEl.textContent = '✅ Đã được cấp quyền';
      else if (perm === 'denied') permEl.textContent = '🚫 Đã bị từ chối — vào cài đặt trình duyệt';
      else if (perm === 'unsupported') permEl.textContent = '⚠️ Trình duyệt không hỗ trợ';
      else permEl.textContent = '🔕 Chưa bật';
    }
    if (permBtn) {
      permBtn.style.display = perm === 'granted' ? 'none' : '';
      permBtn.textContent = perm === 'denied' ? 'Bị từ chối' : 'Bật';
      permBtn.disabled = perm === 'denied' || perm === 'unsupported';
    }
    if (permRow) permRow.classList.toggle('ok', perm === 'granted');

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
    set('nfDailyEnabled', settings.dailyEnabled);
    set('nfTasksEnabled', settings.tasksEnabled);
    set('nfExamsEnabled', settings.examsEnabled);
    set('nfContentTasks', settings.contentTasks);
    set('nfContentOverdue', settings.contentOverdue);
    set('nfContentExams', settings.contentExams);

    const timeEl = document.getElementById('nfDailyTime');
    if (timeEl) {
      const hh = String(settings.dailyHour).padStart(2, '0');
      const mm = String(settings.dailyMinute).padStart(2, '0');
      timeEl.value = `${hh}:${mm}`;
    }

    const timeRow = document.getElementById('nfTimeRow');
    if (timeRow) timeRow.style.display = settings.dailyEnabled ? '' : 'none';

    const contentBlock = document.getElementById('nfContentBlock');
    if (contentBlock) contentBlock.style.display = settings.dailyEnabled ? '' : 'none';
  }

  function openSettings() {
    const modal = document.getElementById('nfModal');
    if (!modal) return;
    loadSettings();
    refreshSettingsUI();
    modal.classList.add('show');
  }
  function closeSettings() {
    const modal = document.getElementById('nfModal');
    if (modal) modal.classList.remove('show');
  }

  function bindSettingsUI() {
    const modal = document.getElementById('nfModal');
    if (!modal || modal._bound) return;
    modal._bound = true;

    document.getElementById('nfModalClose')?.addEventListener('click', closeSettings);
    document.getElementById('nfCancelBtn')?.addEventListener('click', closeSettings);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeSettings(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('show')) closeSettings();
    });

    // Permission button
    document.getElementById('nfPermBtn')?.addEventListener('click', async () => {
      const p = await ensurePermission();
      if (p === 'granted') {
        setEnabled(true);
        toast('🔔 Đã bật thông báo');
      } else if (p === 'denied') {
        toast('🚫 Bạn đã từ chối quyền thông báo');
      }
      refreshSettingsUI();
    });

    // Toggle daily
    document.getElementById('nfDailyEnabled')?.addEventListener('change', (e) => {
      settings.dailyEnabled = e.target.checked;
      refreshSettingsUI();
    });

    // Time
    document.getElementById('nfDailyTime')?.addEventListener('change', (e) => {
      const [h, m] = (e.target.value || '07:00').split(':');
      settings.dailyHour = parseInt(h, 10) || 0;
      settings.dailyMinute = parseInt(m, 10) || 0;
    });

    // Other toggles
    document.getElementById('nfTasksEnabled')?.addEventListener('change', (e) => { settings.tasksEnabled = e.target.checked; });
    document.getElementById('nfExamsEnabled')?.addEventListener('change', (e) => { settings.examsEnabled = e.target.checked; });
    document.getElementById('nfContentTasks')?.addEventListener('change', (e) => { settings.contentTasks = e.target.checked; });
    document.getElementById('nfContentOverdue')?.addEventListener('change', (e) => { settings.contentOverdue = e.target.checked; });
    document.getElementById('nfContentExams')?.addEventListener('change', (e) => { settings.contentExams = e.target.checked; });

    // Save
    document.getElementById('nfSaveBtn')?.addEventListener('click', async () => {
      // Nếu user bật daily mà chưa có quyền → xin quyền
      if (settings.dailyEnabled && (!('Notification' in window) || Notification.permission !== 'granted')) {
        const p = await ensurePermission();
        if (p !== 'granted') {
          toast('⚠️ Cần cấp quyền thông báo trước');
          refreshSettingsUI();
          return;
        }
        setEnabled(true);
      }
      saveSettings();
      // Nếu bật daily thì đảm bảo overall enabled
      if (settings.dailyEnabled && Notification.permission === 'granted') setEnabled(true);
      startChecking();
      toast('💾 Đã lưu cài đặt');
      closeSettings();
    });

    // Test
    document.getElementById('nfTestBtn')?.addEventListener('click', async () => {
      const p = await ensurePermission();
      if (p !== 'granted') {
        toast('⚠️ Cần cấp quyền thông báo trước');
        refreshSettingsUI();
        return;
      }
      // Force show even if not "enabled"
      const wasEnabled = isEnabled();
      if (!wasEnabled) setEnabled(true);
      const body = buildDailySummary();
      await showNotify('📚 Nhắc học tập (thử)', body, { tag: 'test' });
      toast('🔔 Đã gửi thông báo thử');
    });

    // Sidebar button → open settings
    const btn = document.getElementById('notifyToggle');
    if (btn) btn.addEventListener('click', openSettings);
  }

  /* ---------- INIT ---------- */
  async function init() {
    loadSettings();

    if ('serviceWorker' in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register('sw.js', { scope: './' });
      } catch (err) {
        console.warn('[SW] đăng ký thất bại:', err);
      }
    }

    bindSettingsUI();

    if (isEnabled() && Notification.permission === 'granted') {
      startChecking();
    }

    updateUI();

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && isEnabled()) checkAll();
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'notify-click') {
          const url = e.data.data && e.data.data.url;
          if (url && window.App && window.App.navigateTo) {
            const route = url.replace(/^\.\/#\/?/, '');
            window.App.navigateTo(route || 'home');
          }
        }
      });
    }
  }

  window.Notify = {
    init,
    isEnabled,
    checkAll,
    show: showNotify,
    openSettings,
    closeSettings
  };
})();