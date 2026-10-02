/* Feature module: Flashcard & SRS */
(function () {
  window.Features = window.Features || {};
  window.Features['flashcard'] = {
    title: 'Flashcard & SRS',
    icon: '🃏',
    desc: 'Ôn tập theo lịch 1-3-7-15 ngày.',
    render(mount, cfg) {
      mount.innerHTML = `
        <div class="feature-placeholder">
          <div class="ph-icon">🃏</div>
          <h2>${cfg.title} đang phát triển</h2>
          <p>${cfg.desc} Sẽ sớm có mặt trong bản cập nhật tiếp theo.</p>
          <button class="ph-btn" onclick="location.hash='#/home'">← Về trang chủ</button>
        </div>`;
    }
  };
})();