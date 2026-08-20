/* Joins the app's classic scripts to kidsync, which is an ES module.

   kidsync is loaded with a DYNAMIC import inside a try/catch. It pulls the
   Firebase SDK from a CDN, and a static import would mean an unreachable CDN —
   or simply being offline, which for this app is the normal case — takes the
   whole page down with it. This way a failed load is one console line and a
   tidy-up session that runs exactly as it always did.

   Everything it touches goes through the Sync global, so the seam is visible
   from both sides. */

import { firebaseConfig } from './firebase-config.js';

async function boot() {
  if (typeof Sync === 'undefined') return;      // app scripts did not load

  let createSync;
  try {
    ({ createSync } = await import('./kidsync.js'));
  } catch (err) {
    console.warn('[sync] could not load the sync module — staying local-only.', err.message);
    return;
  }

  try {
    const handle = await createSync({
      firebaseConfig,
      game: Sync.game,
      initialState: Sync.initialState(),
      merge: Sync.merge,
      onChange: Sync.apply
    });
    Sync.attach(handle);
  } catch (err) {
    console.warn('[sync] could not start syncing — staying local-only.', err.message);
  }
}

/* app.js boots on DOMContentLoaded and registers first, so the store is loaded
   and the screens painted by the time this runs. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
