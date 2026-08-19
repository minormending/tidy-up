/* Bootstrap. Everything runs from this one page; there is no router. */
(function () {
  /* Kid.init paints the first screen asynchronously, so it has to finish
     before anything else is allowed to change screens. */
  async function boot() {
    Store.load();
    await Kid.init();
    Parent.init();
    Backup.init();

    /* A device nobody has set up yet holds placeholder pictures and no
       recordings, so the child's screen has nothing worth showing.
       Backup.init may already have opened the panel for a scanned setup
       code, in which case leave it be. */
    if (Store.isFirstRun() && document.getElementById('screen-parent').hidden) {
      Parent.open();
    }
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
