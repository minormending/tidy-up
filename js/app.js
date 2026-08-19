/* Bootstrap. Everything runs from this one page; there is no router. */
(function () {
  function boot() {
    Store.load();
    Kid.init();
  }

  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
