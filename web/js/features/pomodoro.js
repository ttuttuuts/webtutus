/* Feature module: Pomodoro */
(function () {
  window.Features = window.Features || {};
  window.Features['pomodoro'] = {
    title: 'Pomodoro',
    icon: '🍅',
    desc: 'Đếm giờ học 25/5, streak.',
    render(mount, cfg) {
      mount.innerHTML = `
        <div class="feature-placeholder">
          <div class="ph-icon">🍅</div>
          <h2>${cfg.title} đang phát triển</h2>
          <p>${cfg.desc} Sẽ sớm có mặt trong bản cập nhật tiếp theo.</p>
          <button class="ph-btn" onclick="location.hash='#/home'">← Về trang chủ</button>
        </div>`;
    }
  };
})();