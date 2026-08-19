/* Bootstrap. Everything runs from this one page; there is no router. */
(function () {
  function boot() {
    Store.load();
    Kid.init();
    Parent.init();
  }

  /* Offline shell, so the tablet does not need wi-fi to run a session. */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* fine without it */ });
    });
  }

  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
