/* Feature module: To-do & Deadline */
(function () {
  window.Features = window.Features || {};
  window.Features['todo'] = {
    title: 'To-do & Deadline',
    icon: '✅',
    desc: 'Quản lý bài tập theo môn.',
    render(mount, cfg) {
      mount.innerHTML = `
        <div class="feature-placeholder">
          <div class="ph-icon">✅</div>
          <h2>${cfg.title} đang phát triển</h2>
          <p>${cfg.desc} Sẽ sớm có mặt trong bản cập nhật tiếp theo.</p>
          <button class="ph-btn" onclick="location.hash='#/home'">← Về trang chủ</button>
        </div>`;
    }
  };
})();