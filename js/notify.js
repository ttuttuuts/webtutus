/* ============================================================
   NOTIFY MODULE — Per-item notification
   ============================================================ */
(function () {
  'use strict';

  const ENABLED_KEY = 'pdfReader_notify_enabled';
  const SENT_KEY = 'pdfReader_notify_sent';
  const SETTINGS_KEY = 'pdfReader_notify_settings';
  const LAST_DAILY_KEY = 'pdfReader_notify_lastDaily';
  const CHECK_INTERVAL = 30 * 1000;
  const WINDOW_MS = 3600000;

  const DEFAULT_SETTINGS = {
    dailyEnabled: false, dailyHour: 7, dailyMinute: 0,
    contentTasks: true, contentOverdue: true, contentExams: true
  };

  const TASK_DEFAULT = {
    enabled: true, mode: 'milestones', before: [1440, 60, 30],
    dailyHour: 7, dailyMinute: 0, dailyFrom: 0
  };
  const EXAM_DEFAULT = {
    enabled: true, mode: 'milestones', before: [10080, 1440, 60],
    dailyHour: 7, dailyMinute: 0, dailyFrom: 0
  };

  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let checkTimer = null;
  let swRegistration = null;

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

  function isEnabled() { return localStorage.getItem(ENABLED_KEY) === '1'; }
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
      for (const k in o) if (now - o[k] < 30 * 86400000) clean[k] = o[k];
      localStorage.setItem(SENT_KEY, JSON.stringify(clean));
    } catch (_) {}
  }
  function wasSent(k) { return !!getSent()[k]; }
  function markSent(k) { const o = getSent(); o[k] = Date.now(); saveSent(o); }

  function resetSentForItem(id, type) {
    const o = getSent();
    const prefix = (type === 'task') ? `task_${id}_` : `exam_${id}_`;
    let changed = false;
    for (const k in o) if (k.startsWith(prefix)) { delete o[k]; changed = true; }
    if (changed) saveSent(o);
  }
  function resetAllSent() { saveSent({}); }

  function toast(msg) { if (window.App && window.App.toast) window.App.toast(msg); }

  async function ensurePermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try { return await Notification.requestPermission(); }
    catch (_) { return 'denied'; }
  }

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
      if (swRegistration) await swRegistration.showNotification(title, options);
      else {
        const n = new Notification(title, options);
        n.onclick = () => { window.focus(); n.close(); };
      }
    } catch (_) { try { new Notification(title, options); } catch (__) {} }
  }

  function formatOffset(mins) {
    if (mins >= 1440 && mins % 1440 === 0) return `còn ${mins / 1440} ngày`;
    if (mins >= 60 && mins % 60 === 0) return `còn ${mins / 60} giờ`;
    return `còn ${mins} phút`;
  }

  function normalizeTaskNotify(nf) {
    const def = TASK_DEFAULT;
    if (!nf || typeof nf !== 'object') {
      return { enabled: true, mode: 'milestones', before: def.before.slice(), dailyHour: 7, dailyMinute: 0, dailyFrom: 0 };
    }
    const enabled = nf.enabled !== false;
    const mode = (nf.mode === 'daily') ? 'daily' : 'milestones';
    let before = Array.isArray(nf.before) ? nf.before.slice() : [];
    if (enabled && mode === 'milestones' && before.length === 0) before = def.before.slice();
    return {
      enabled, mode, before,
      dailyHour: Number.isFinite(nf.dailyHour) ? nf.dailyHour : 7,
      dailyMinute: Number.isFinite(nf.dailyMinute) ? nf.dailyMinute : 0,
      dailyFrom: Number.isFinite(nf.dailyFrom) ? nf.dailyFrom : 0
    };
  }
  function normalizeExamNotify(nf) {
    const def = EXAM_DEFAULT;
    if (!nf || typeof nf !== 'object') {
      return { enabled: true, mode: 'milestones', before: def.before.slice(), dailyHour: 7, dailyMinute: 0, dailyFrom: 0 };
    }
    const enabled = nf.enabled !== false;
    const mode = (nf.mode === 'daily') ? 'daily' : 'milestones';
    let before = Array.isArray(nf.before) ? nf.before.slice() : [];
    if (enabled && mode === 'milestones' && before.length === 0) before = def.before.slice();
    return {
      enabled, mode, before,
      dailyHour: Number.isFinite(nf.dailyHour) ? nf.dailyHour : 7,
      dailyMinute: Number.isFinite(nf.dailyMinute) ? nf.dailyMinute : 0,
      dailyFrom: Number.isFinite(nf.dailyFrom) ? nf.dailyFrom : 0
    };
  }

  function todayDateKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  function isAfterTargetTime(hour, minute) {
    const now = new Date();
    return (now.getHours() * 60 + now.getMinutes()) >= (hour * 60 + minute);
  }
  function daysUntil(target) {
    const diff = target - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / 86400000);
  }

  function checkTasks() {
    const tasks = readJSON('pdfReader_todos_v1', []);
    if (!Array.isArray(tasks)) return;
    const now = Date.now();
    const dateKey = todayDateKey();

    for (const t of tasks) {
      if (t.done || !t.deadline) continue;
      const nf = normalizeTaskNotify(t.notify);
      if (!nf.enabled) continue;

      const dl = new Date(t.deadline).getTime();
      if (isNaN(dl)) continue;
      const diff = dl - now;
      const dlHash = String(dl);

      if (diff < 0 && diff > -WINDOW_MS) {
        const k = `task_${t.id}_${dlHash}_overdue`;
        if (!wasSent(k)) {
          markSent(k);
          showNotify('🚨 ' + t.title, 'Đã quá hạn!', {
            tag: `task_${t.id}`, requireInteraction: true, data: { url: './#/todo' }
          });
        }
      }

      if (diff <= 0) continue;

      if (nf.mode === 'daily') {
        const daysLeft = daysUntil(dl);
        if (nf.dailyFrom > 0 && daysLeft > nf.dailyFrom) continue;
        if (!isAfterTargetTime(nf.dailyHour, nf.dailyMinute)) continue;
        const k = `task_${t.id}_${dlHash}_daily_${dateKey}`;
        if (wasSent(k)) continue;
        markSent(k);
        const body = daysLeft <= 0 ? `Deadline hôm nay!` : `Còn ${daysLeft} ngày nữa đến hạn`;
        showNotify('📋 ' + t.title, body + (t.subject ? ` • ${t.subject}` : ''), {
          tag: `task_${t.id}`, data: { url: './#/todo' }
        });
      } else {
        for (const mins of nf.before) {
          const targetMs = mins * 60000;
          const k = `task_${t.id}_${dlHash}_${mins}`;
          if (wasSent(k)) continue;
          if (diff <= targetMs && diff > targetMs - WINDOW_MS) {
            markSent(k);
            showNotify(
              '📋 ' + t.title,
              `Deadline ${formatOffset(mins)}` + (t.subject ? ` • ${t.subject}` : ''),
              { tag: `task_${t.id}`, data: { url: './#/todo' } }
            );
          }
        }
      }
    }
  }

  function checkExams() {
    const exams = readJSON('pdfReader_exams_v1', []);
    if (!Array.isArray(exams)) return;
    const now = Date.now();
    const dateKey = todayDateKey();

    for (const e of exams) {
      const nf = normalizeExamNotify(e.notify);
      if (!nf.enabled) continue;

      const dl = new Date(e.datetime).getTime();
      if (isNaN(dl)) continue;
      const diff = dl - now;
      if (diff <= 0) continue;
      const dlHash = String(dl);

      if (nf.mode === 'daily') {
        const daysLeft = daysUntil(dl);
        if (nf.dailyFrom > 0 && daysLeft > nf.dailyFrom) continue;
        if (!isAfterTargetTime(nf.dailyHour, nf.dailyMinute)) continue;
        const k = `exam_${e.id}_${dlHash}_daily_${dateKey}`;
        if (wasSent(k)) continue;
        markSent(k);
        const body = daysLeft <= 0 ? `Kì thi hôm nay!` : `Còn ${daysLeft} ngày nữa là thi`;
        showNotify('⏳ ' + e.name, body + (e.subject ? ` • ${e.subject}` : '') + (e.location ? ` • ${e.location}` : ''), {
          tag: `exam_${e.id}`, data: { url: './#/exam' }
        });
      } else {
        for (const mins of nf.before) {
          const targetMs = mins * 60000;
          const k = `exam_${e.id}_${dlHash}_${mins}`;
          if (wasSent(k)) continue;
          if (diff <= targetMs && diff > targetMs - WINDOW_MS) {
            markSent(k);
            showNotify(
              '⏳ ' + e.name,
              `Kì thi ${formatOffset(mins)}` + (e.subject ? ` • ${e.subject}` : '') + (e.location ? ` • ${e.location}` : ''),
              { tag: `exam_${e.id}`, data: { url: './#/exam' } }
            );
          }
        }
      }
    }
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function buildDailySummary() {
    const now = new Date();
    const tasks = readJSON('pdfReader_todos_v1', []);
    const exams = readJSON('pdfReader_exams_v1', []);
    const lines = [];

    if (settings.contentTasks && Array.isArray(tasks)) {
      const list = tasks.filter(t => !t.done && t.deadline && sameDay(new Date(t.deadline), now));
      if (list.length > 0) lines.push(`📋 ${list.length} task hôm nay`);
    }
    if (settings.contentOverdue && Array.isArray(tasks)) {
      const list = tasks.filter(t => !t.done && t.deadline && new Date(t.deadline) < now);
      if (list.length > 0) lines.push(`🔥 ${list.length} task quá hạn`);
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
    if (!settings.dailyEnabled || !isEnabled()) return;
    const now = new Date();
    const todayKey = now.toDateString();
    if (localStorage.getItem(LAST_DAILY_KEY) === todayKey) return;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const targetMin = settings.dailyHour * 60 + settings.dailyMinute;
    if (nowMin < targetMin) return;

    showNotify('📚 Nhắc học tập hôm nay', buildDailySummary(), {
      tag: 'daily', data: { url: './#/home' }
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
    set('nfContentTasks', settings.contentTasks);
    set('nfContentOverdue', settings.contentOverdue);
    set('nfContentExams', settings.contentExams);

    const timeEl = document.getElementById('nfDailyTime');
    if (timeEl) {
      timeEl.value = `${String(settings.dailyHour).padStart(2, '0')}:${String(settings.dailyMinute).padStart(2, '0')}`;
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

    document.getElementById('nfPermBtn')?.addEventListener('click', async () => {
      const p = await ensurePermission();
      if (p === 'granted') { setEnabled(true); toast('🔔 Đã bật thông báo'); }
      else if (p === 'denied') toast('🚫 Bạn đã từ chối quyền thông báo');
      refreshSettingsUI();
    });

    document.getElementById('nfDailyEnabled')?.addEventListener('change', (e) => {
      settings.dailyEnabled = e.target.checked;
      refreshSettingsUI();
    });
    document.getElementById('nfDailyTime')?.addEventListener('change', (e) => {
      const [h, m] = (e.target.value || '07:00').split(':');
      settings.dailyHour = parseInt(h, 10) || 0;
      settings.dailyMinute = parseInt(m, 10) || 0;
    });
    document.getElementById('nfContentTasks')?.addEventListener('change', (e) => { settings.contentTasks = e.target.checked; });
    document.getElementById('nfContentOverdue')?.addEventListener('change', (e) => { settings.contentOverdue = e.target.checked; });
    document.getElementById('nfContentExams')?.addEventListener('change', (e) => { settings.contentExams = e.target.checked; });

    document.getElementById('nfSaveBtn')?.addEventListener('click', async () => {
      if (settings.dailyEnabled && (!('Notification' in window) || Notification.permission !== 'granted')) {
        const p = await ensurePermission();
        if (p !== 'granted') { toast('⚠️ Cần cấp quyền thông báo trước'); refreshSettingsUI(); return; }
        setEnabled(true);
      }
      saveSettings();
      if (settings.dailyEnabled && Notification.permission === 'granted') setEnabled(true);
      startChecking();
      toast('💾 Đã lưu cài đặt');
      closeSettings();
    });

    document.getElementById('nfTestBtn')?.addEventListener('click', async () => {
      const p = await ensurePermission();
      if (p !== 'granted') { toast('⚠️ Cần cấp quyền thông báo trước'); refreshSettingsUI(); return; }
      if (!isEnabled()) setEnabled(true);
      await showNotify('📚 Nhắc học tập (thử)', buildDailySummary(), { tag: 'test' });
      toast('🔔 Đã gửi thông báo thử');
    });

    const btn = document.getElementById('notifyToggle');
    if (btn) btn.addEventListener('click', openSettings);
  }

  async function init() {
    loadSettings();
    if ('serviceWorker' in navigator) {
      try { swRegistration = await navigator.serviceWorker.register('sw.js', { scope: './' }); }
      catch (err) { console.warn('[SW] đăng ký thất bại:', err); }
    }
    bindSettingsUI();
    if (isEnabled() && Notification.permission === 'granted') startChecking();
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
    init, isEnabled, checkAll, show: showNotify,
    openSettings, closeSettings,
    resetSentForItem, resetAllSent
  };
})();