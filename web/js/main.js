/* ============================================================
   MAIN — chạy sau khi tất cả module đã đăng ký
   ============================================================ */
window.addEventListener('DOMContentLoaded', async () => {
  /* Init PDF module (mở IndexedDB, list file đã lưu) */
  if (window.PdfModule && typeof window.PdfModule.init === 'function') {
    await window.PdfModule.init();
  }

  /* Hiện dashboard nếu đã login, ngược lại hiện login */
  if (sessionStorage.getItem('pdfReaderLoggedIn') === '1') {
    window.App.showApp();
    if (window.PdfModule && typeof window.PdfModule.loadLast === 'function') {
      window.PdfModule.loadLast();
    }
  } else {
    window.App.showLogin();
  }
});