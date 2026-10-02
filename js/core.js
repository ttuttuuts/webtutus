/* ============================================================
   CORE — theme, router, sidebar, login, calc bridge, utils
   ============================================================ */
(function () {
  'use strict';

  window.App = window.App || {};
  window.Features = window.Features || {};

  /* ---------- TOAST / UTILS ---------- */
  window.App.toast = function (msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(window.App.toast._t);
    window.App.toast._t = setTimeout(() => el.classList.remove('show'), 2400);
  };
  window.App.showSaveToast = function (msg) {
    const el = document.getElementById('saveToast');
    if (!el) return;
    el.textContent = msg || '💾 Đã lưu';
    el.classList.add('show');
    clearTimeout(window.App.showSaveToast._t);
    window.App.showSaveToast._t = setTimeout(() => el.classList.remove('show'), 1200);
  };
  window.App.formatDate = function (ts) {
    const d = new Date(ts), now = new Date(), diff = (now - d) / 1000;
    if (diff < 60) return 'vừa xong';
    if (diff < 3600) return Math.floor(diff / 60) + ' phút trước';
    if (diff < 86400) return Math.floor(diff / 3600) + ' giờ trước';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' ngày trước';
    return d.toLocaleDateString('vi-VN');
  };
  window.App.formatSize = function (bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  /* ---------- THEME ---------- */
  const THEME_KEY = 'pdfReader_theme';
  window.App.applyTheme = function (dark) {
    document.body.classList.toggle('dark', dark);
    const icon = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    if (icon) icon.textContent = dark ? '☀️' : '🌙';
    if (label) label.textContent = dark ? 'Chế độ sáng' : 'Chế độ tối';
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (_) {}
    try {
      const frame = document.getElementById('calcFrame');
      if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ type: 'theme', dark }, '*');
      }
    } catch (_) {}
  };

  /* ---------- ROUTER ---------- */
  const SITE_NAME = 'HoTroHocTap';
  const ROUTES = {
    '': { page: 'home', title: 'Trang chủ' },
    'home': { page: 'home', title: 'Trang chủ' },
    'pdf': { page: 'reader', title: 'Đọc PDF' },
    'reader': { page: 'reader', title: 'Đọc PDF' },
    'formulas': { page: 'formula', title: 'Sổ tay công thức' },
    'notes': { page: 'feature', title: 'Sổ tay ghi chú', icon: '📝', desc: 'Ghi chú cho từng file PDF.' },
    'flashcard': { page: 'feature', title: 'Flashcard & SRS', icon: '🃏', desc: 'Ôn tập theo lịch 1-3-7-15 ngày.' },
    'pomodoro': { page: 'feature', title: 'Pomodoro', icon: '🍅', desc: 'Đếm giờ học 25/5, streak.' },
    'stats': { page: 'feature', title: 'Thống kê học tập', icon: '📊', desc: 'Biểu đồ thời gian học.' },
    'todo': { page: 'feature', title: 'To-do & Deadline', icon: '✅', desc: 'Quản lý bài tập theo môn.' },
    'dictionary': { page: 'feature', title: 'Từ điển tra nhanh', icon: '🔤', desc: 'Tra Anh–Việt trong popup.' },
    'tts': { page: 'feature', title: 'Đọc văn bản (TTS)', icon: '🔊', desc: 'Nghe đọc to đoạn văn bản.' },
    'mindmap': { page: 'feature', title: 'Sơ đồ tư duy', icon: '🗺️', desc: 'Kéo thả node tạo mind map.' },
  };

  window.App.ROUTES = ROUTES;
  window.App.SITE_NAME = SITE_NAME;

  let lastRouteWasReader = false;

  function getCurrentRoute() {
    const raw = location.hash.replace(/^#\/?/, '');
    return ROUTES[raw] ? raw : 'home';
  }

  window.App.navigateTo = function (route) {
    if (!ROUTES[route]) route = 'home';
    const h = '#/' + route;
    if (location.hash === h) window.App.handleRoute();
    else location.hash = h;
  };

  /* ---------- NAV PILL (nền xanh trượt mượt) ---------- */
  function placeNavPill(animate) {
    const pill = document.getElementById('navPill');
    const nav = document.querySelector('.sb-nav');
    if (!pill || !nav) return;
    const activeItem = nav.querySelector('.sb-item.active');
    if (!activeItem) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1';

    const navRect = nav.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    const top = itemRect.top - navRect.top;
    const h = itemRect.height;

    const isSoon = activeItem.classList.contains('soon');
    pill.classList.toggle('soon', isSoon);

    if (!animate) {
      const prev = pill.style.transition;
      pill.style.transition = 'none';
      pill.style.transform = `translateY(${top}px)`;
      pill.style.height = h + 'px';
      void pill.offsetHeight;
      pill.style.transition = prev || '';
    } else {
      pill.style.transform = `translateY(${top}px)`;
      pill.style.height = h + 'px';
    }
  }
  window.App.placeNavPill = placeNavPill;

  function renderFeature(route, cfg) {
    const iconEl = document.getElementById('featureIcon');
    const titleEl = document.getElementById('featureTitle');
    const descEl = document.getElementById('featureDesc');
    const mount = document.getElementById('featureMount');

    if (iconEl) iconEl.textContent = cfg.icon || '🔧';
    if (titleEl) titleEl.textContent = cfg.title || 'Tính năng';
    if (descEl) descEl.textContent = cfg.desc || 'Đang phát triển.';

    const feat = window.Features[route];
    if (feat && typeof feat.render === 'function') {
      feat.render(mount, cfg);
    } else {
      mount.innerHTML = `
        <div class="feature-placeholder">
          <div class="ph-icon">${cfg.icon || '🚧'}</div>
          <h2>${cfg.title || 'Tính năng'} đang phát triển</h2>
          <p>${cfg.desc || 'Chức năng này sẽ sớm có mặt trong bản cập nhật tiếp theo.'}</p>
          <button class="ph-btn" onclick="location.hash='#/home'">← Về trang chủ</button>
        </div>`;
    }
  }

  window.App.handleRoute = function handleRoute() {
    const route = getCurrentRoute();
    const cfg = ROUTES[route];
    const wasOnReader = lastRouteWasReader;
    const nowOnReader = cfg.page === 'reader';
    lastRouteWasReader = nowOnReader;

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sb-item[data-route]').forEach(it => {
      it.classList.toggle('active', it.dataset.route === route);
    });
    document.body.classList.toggle('on-reader', nowOnReader);

    if (cfg.page === 'feature') {
      renderFeature(route, cfg);
      document.getElementById('page-feature').classList.add('active');
    } else {
      const el = document.getElementById('page-' + cfg.page);
      if (el) el.classList.add('active');
    }

    document.title = (cfg.title ? cfg.title + ' — ' : '') + SITE_NAME;

    /* Trượt pill sang vị trí mục đang active */
    requestAnimationFrame(() => placeNavPill(true));

    if (window.PdfModule && typeof window.PdfModule.onRouteChange === 'function') {
      window.PdfModule.onRouteChange({ route, cfg, wasOnReader, nowOnReader });
    }

    closeSidebar();
  };

  window.addEventListener('hashchange', () => window.App.handleRoute());

  /* ---------- SIDEBAR ---------- */
  const sbToggle = document.getElementById('sbToggle');
  const sidebar = document.getElementById('sidebar');
  const sbBackdrop = document.getElementById('sbBackdrop');

  function isMobile() { return window.matchMedia('(max-width: 820px)').matches; }
  function openSidebarDrawer() { sidebar.classList.add('open'); sbBackdrop.classList.add('show'); }
  function closeSidebarDrawer() { sidebar.classList.remove('open'); sbBackdrop.classList.remove('show'); }
  function closeSidebar() { closeSidebarDrawer(); updateToggleIcon(); }
  window.App.closeSidebar = closeSidebar;

  function updateToggleIcon() {
    if (isMobile()) {
      sbToggle.textContent = sidebar.classList.contains('open') ? '✕' : '☰';
    } else {
      const c = document.getElementById('dashboard').classList.contains('sidebar-collapsed');
      sbToggle.textContent = c ? '›' : '‹';
    }
  }

  function toggleSidebar() {
    if (isMobile()) {
      if (sidebar.classList.contains('open')) closeSidebarDrawer(); else openSidebarDrawer();
    } else {
      document.getElementById('dashboard').classList.toggle('sidebar-collapsed');
      setTimeout(() => {
        if (window.PdfModule && typeof window.PdfModule.onResize === 'function') {
          window.PdfModule.onResize();
        }
        placeNavPill(false);
      }, 320);
    }
    updateToggleIcon();
  }

  if (sbToggle) sbToggle.addEventListener('click', toggleSidebar);
  if (sbBackdrop) sbBackdrop.addEventListener('click', () => { closeSidebarDrawer(); updateToggleIcon(); });
  window.addEventListener('resize', () => {
    updateToggleIcon();
    placeNavPill(false);
  });

  /* ---------- NAV CLICKS ---------- */
  document.querySelectorAll('[data-route]').forEach(el => {
    el.addEventListener('click', () => window.App.navigateTo(el.dataset.route));
  });

  /* ---------- LOGIN ---------- */
  const LOGIN_KEY = 'pdfReaderLoggedIn';
  const loginScreen = document.getElementById('loginScreen');
  const loginForm = document.getElementById('loginForm');
  const loginUser = document.getElementById('loginUser');
  const logoutBtn = document.getElementById('logoutBtn');
  const dashboard = document.getElementById('dashboard');

  window.App.showApp = function () {
    loginScreen.classList.add('hidden');
    dashboard.classList.add('show');
    if (!location.hash || location.hash === '#' || location.hash === '#/') {
      history.replaceState(null, '', '#/home');
    }
    window.App.handleRoute();
    /* Đặt pill không animation lần đầu */
    requestAnimationFrame(() => placeNavPill(false));
  };
  window.App.showLogin = function () {
    loginScreen.classList.remove('hidden');
    dashboard.classList.remove('show');
    setTimeout(() => loginUser.focus(), 100);
  };

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sessionStorage.setItem(LOGIN_KEY, '1');
    window.App.showApp();
    window.App.toast('👋 Chào mừng!');
  });

  logoutBtn.addEventListener('click', () => {
    if (!confirm('Đăng xuất và về trang chủ?')) return;
    sessionStorage.removeItem(LOGIN_KEY);
    localStorage.removeItem('pdfReader_lastFileId');
    localStorage.removeItem('pdfReader_rightFileId');
    localStorage.removeItem('pdfReader_split');
    document.body.classList.remove('on-reader', 'viewing');
    history.replaceState(null, '', location.pathname);
    window.App.showLogin();
    window.App.toast('🚪 Đã đăng xuất');
  });

  window.App.LOGIN_KEY = LOGIN_KEY;

  /* ---------- THEME TOGGLE ---------- */
  document.getElementById('themeToggle').addEventListener('click', () => {
    const willBeDark = !document.body.classList.contains('dark');
    window.App.applyTheme(willBeDark);
    window.App.toast(willBeDark ? '🌙 Chế độ tối' : '☀️ Chế độ sáng');
  });

  /* ---------- HOTKEYS ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault(); toggleSidebar(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      const willBeDark = !document.body.classList.contains('dark');
      window.App.applyTheme(willBeDark);
      window.App.toast(willBeDark ? '🌙 Chế độ tối' : '☀️ Chế độ sáng');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      if (document.getElementById('calcFrame').classList.contains('show')) {
        try { document.getElementById('calcFrame').contentWindow.postMessage({ type: 'calc-minimize' }, '*'); } catch(_){}
        window.App.minimizeCalculator();
      } else {
        window.App.openCalculator();
      }
    }
  });

  /* ---------- CALCULATOR BRIDGE ---------- */
  const calcFrame = document.getElementById('calcFrame');
  const calcFab = document.getElementById('calcFab');

  window.App.openCalculator = function () {
    calcFrame.classList.add('show');
    calcFab.classList.remove('show');
    try {
      const dark = document.body.classList.contains('dark');
      calcFrame.contentWindow.postMessage({ type: 'theme', dark }, '*');
      calcFrame.contentWindow.postMessage({ type: 'calc-open' }, '*');
    } catch (_) {}
  };
  window.App.minimizeCalculator = function () {
    calcFrame.classList.remove('show');
    calcFab.classList.add('show');
  };
  window.App.closeCalculator = function () {
    calcFrame.classList.remove('show');
    calcFab.classList.remove('show');
  };

  document.getElementById('calcOpenBtn')?.addEventListener('click', window.App.openCalculator);
  document.getElementById('calcCardBtn')?.addEventListener('click', window.App.openCalculator);
  calcFab.addEventListener('click', window.App.openCalculator);

  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'calc-minimized') window.App.minimizeCalculator();
    else if (e.data.type === 'calc-closed') window.App.closeCalculator();
  });

  /* ---------- INIT THEME + PILL ---------- */
  window.App.applyTheme(localStorage.getItem(THEME_KEY) === 'dark');

  window.addEventListener('load', () => {
    requestAnimationFrame(() => placeNavPill(false));
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => requestAnimationFrame(() => placeNavPill(false)));
  }
})();