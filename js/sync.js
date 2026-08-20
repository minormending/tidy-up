/* Live sync plumbing. The rules live in sync-state.js, which is kept free of
   Store and the DOM so it can be tested on its own; this file is the wiring.

   Optional throughout. If the module never loads, the network is gone, or no
   room is paired, everything here is inert and the app behaves exactly as it
   did before. Tidy Up is a local app that can sync, not a sync app. */

const Sync = (() => {
  const GAME = 'tidy-up';

  let handle = null;      // the kidsync instance, once it is up
  let pushing = false;    // set while we write, so we can ignore our own echo
  let applying = false;   // set while a remote state lands, to avoid a write loop
  let onChange = null;    // the app's repaint hook

  function state() { return Store.get(); }

  /** Publish local progress. Debounced inside kidsync, so calling this from
      every Store.save() is cheap. */
  function push() {
    if (!handle || applying) return;
    pushing = true;
    try { handle.set(SyncState.subset(state())); }
    catch (err) { /* offline writes queue inside the SDK; nothing to do here */ }
    finally { pushing = false; }
  }

  /** kidsync's merge hook. Runs on the travelling subset, never on live state. */
  function merge(local, remote) {
    return SyncState.merge(local || {}, remote || {});
  }

  /* Joining a room must never cost a child stars.

     The epochs behind "Clear this week" and "Let them do today again" are
     monotonic, so a room that has been cleared a few times carries higher
     numbers than a device that has never cleared anything. Merging that in
     cold would read as a fresh clear and wipe the joining device. So on first
     contact the local epochs are lifted to meet the room's, which puts both
     sides on equal footing and makes the merge purely additive. Clears after
     that point are still higher, so they still win. */
  function levelEpochs(incoming) {
    const s = state();
    s.starsEpoch = Math.max(Number(s.starsEpoch) || 0, Number(incoming.starsEpoch) || 0);
    s.doneEpoch = Math.max(Number(s.doneEpoch) || 0, Number(incoming.doneEpoch) || 0);
  }

  /** A merged state arrived from kidsync. Fold it in and repaint. */
  function apply(incoming) {
    if (pushing) return;                        // the echo of our own write
    if (!incoming || typeof incoming !== 'object') return;

    const room = handle && handle.roomCode;
    applying = true;
    try {
      if (room && state().syncRoom !== room) {
        levelEpochs(incoming);
        state().syncRoom = room;
      }
      const changed = SyncState.applyTo(state(), incoming);
      Store.save();                             // push stays suppressed while applying
      if (changed && onChange) onChange();
    } catch (err) {
      /* A room holding something this app cannot read changes nothing here. */
    } finally {
      applying = false;
    }
  }

  /* Forget the room, so rejoining later counts as first contact again rather
     than inheriting a clear that happened while this device was away. */
  function forgetRoom() {
    delete state().syncRoom;
    Store.save();
  }

  function attach(instance) {
    handle = instance;
    if (onChange) onChange();
    instance.onStatusChange(() => { if (onChange) onChange(); });
  }

  return {
    game: GAME,
    attach,
    push,
    merge,
    apply,
    forgetRoom,
    initialState: () => SyncState.subset(Store.get()),
    handle: () => handle,
    onRender: fn => { onChange = fn; }
  };
})();
