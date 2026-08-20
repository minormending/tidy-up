/* What it means to merge two devices' tidy-up progress.

   Only progress travels. Jobs, photos and voice clips do not, and that is a
   deliberate line rather than an omission:

     • Photos and recordings never leave the device. idb.js says so and it stays
       true — a photo of a child's room and a parent's recorded voice are not
       going near a shared database, and one photo is fifty times the size a
       room can hold anyway.
     • Job definitions already have a way to travel: the setup code. It carries
       names, timers, icons and colours, and it deliberately keeps whatever
       photos and recordings are already on the receiving device. Live-syncing
       the job list as well would fight that, and a merge that reshuffles jobs
       could break a device's photoId and audioId associations for no gain.
     • chimeOn is per-device, because one tablet is often the muted one.
     • supportLevel and defaultSeconds are setup, so they ride the setup code.

   So: the setup code configures a device, live sync keeps the day's progress the
   same on both. */

const SyncState = (() => {
  const FIELDS = ['stars', 'starsEpoch', 'weekStart', 'weeks', 'done', 'doneEpoch', 'sessions'];

  const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

  /* Store.today() produces "2026-8-9", not "2026-08-09", so these cannot be
     compared as strings — "2026-8-9" sorts after "2026-8-10". */
  function dayValue(s) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s == null ? '' : s));
    return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : -1;
  }

  /* Rebuild today's counts with its job ids in sorted order.

     This is not tidiness. kidsync decides "already in sync" by comparing the
     serialised state against what is in the room, so two devices that hold the
     same counts in a different key order each see the other as different and
     republish forever — a write loop that never settles. Object key order is
     insertion order, and markDone inserts in whatever order jobs happen to be
     finished, so the two devices genuinely do disagree unless this is imposed. */
  function canonDone(done) {
    if (!done || typeof done !== 'object') return null;
    const src = done.counts || {};
    const counts = {};
    Object.keys(src).sort().forEach(id => { counts[id] = num(src[id]); });
    return { date: String(done.date == null ? '' : done.date), counts: counts };
  }

  /** The travelling subset, in a canonical form. Everything that goes on the
      wire passes through here, so serialisation is deterministic on both
      devices regardless of the order things happened locally. */
  function subset(state) {
    const out = {};
    FIELDS.forEach(f => { if (state[f] !== undefined) out[f] = state[f]; });
    out.done = canonDone(out.done);
    out.weeks = mergeWeeks([out.weeks]);
    out.sessions = mergeSessions([out.sessions]);
    return out;
  }

  /* Weeks are an archive: merged by the week they belong to, keeping the higher
     total, newest twelve. Nothing here is ever lowered. */
  function mergeWeeks(lists) {
    const byStart = new Map();
    lists.forEach(list => (Array.isArray(list) ? list : []).forEach(w => {
      if (!w || !Number.isFinite(Number(w.start))) return;
      const start = num(w.start);
      byStart.set(start, Math.max(byStart.get(start) || 0, num(w.stars)));
    }));
    return [...byStart.entries()]
      .sort((x, y) => x[0] - y[0])
      .slice(-12)
      .map(pair => ({ start: pair[0], stars: pair[1] }));
  }

  /* This week's stars, and the week they belong to.

     weekStart is the clock. A device whose week is older is not behind on
     stars — it is still holding last week's total, which belongs in the archive
     rather than in this week's count. Taking the max across different weeks
     would resurrect last week's stars into this one.

     Whatever loses is archived rather than dropped, because the app promises
     that nothing ever takes a star away and a merge is not an exception. */
  function mergeStars(a, b) {
    const ae = num(a.starsEpoch), be = num(b.starsEpoch);
    const epoch = Math.max(ae, be);

    /* A grown-up pressing "Clear this week" has to win, and a max would undo
       it instantly. The epoch is what makes clearing possible at all. */
    if (ae !== be) {
      const win = ae > be ? a : b;
      return { stars: num(win.stars), weekStart: num(win.weekStart), starsEpoch: epoch, archive: [] };
    }

    const aw = num(a.weekStart), bw = num(b.weekStart);
    if (aw === bw) {
      return { stars: Math.max(num(a.stars), num(b.stars)), weekStart: aw, starsEpoch: epoch, archive: [] };
    }

    const newer = aw > bw ? a : b;
    const older = aw > bw ? b : a;
    const archive = num(older.stars) > 0
      ? [{ start: num(older.weekStart), stars: num(older.stars) }]
      : [];
    return { stars: num(newer.stars), weekStart: num(newer.weekStart), starsEpoch: epoch, archive };
  }

  /* Today's counts, per job.

     A job can honestly be done more than once, so the tempting merge is to add
     the two devices' counts together. That does not converge: every echo of a
     merge adds again and the numbers climb on their own. The higher of the two
     is the convergent answer, and it only undercounts in the narrow case where
     the same job was genuinely done on both devices while they were apart. */
  function mergeDone(a, b) {
    const ae = num(a.doneEpoch), be = num(b.doneEpoch);
    const epoch = Math.max(ae, be);

    /* "Let them do today again" clears the counts, which a max would refill. */
    if (ae !== be) {
      const win = ae > be ? a : b;
      return { done: canonDone(win.done), doneEpoch: epoch };
    }

    const ad = canonDone(a.done), bd = canonDone(b.done);
    if (!ad) return { done: bd, doneEpoch: epoch };
    if (!bd) return { done: ad, doneEpoch: epoch };

    /* A later day supersedes rather than merges: yesterday's counts are not
       part of today, and the store clears them at midnight anyway. */
    if (ad.date !== bd.date) {
      return { done: dayValue(ad.date) >= dayValue(bd.date) ? ad : bd, doneEpoch: epoch };
    }

    /* Sorted, so the two devices serialise this identically. */
    const counts = {};
    [...new Set([...Object.keys(ad.counts), ...Object.keys(bd.counts)])].sort().forEach(id => {
      counts[id] = Math.max(num(ad.counts[id]), num(bd.counts[id]));
    });
    return { done: { date: ad.date, counts: counts }, doneEpoch: epoch };
  }

  /* Runs are a log: union by start time, newest sixty. Rebuilt field by field
     rather than copied, so only these five numbers can ever travel. */
  function mergeSessions(lists) {
    const byAt = new Map();
    lists.forEach(list => (Array.isArray(list) ? list : []).forEach(s => {
      if (!s || !Number.isFinite(Number(s.at))) return;
      const at = num(s.at);
      if (byAt.has(at)) return;
      byAt.set(at, {
        at: at,
        level: num(s.level),
        earned: num(s.earned),
        tasks: num(s.tasks),
        beatTimer: num(s.beatTimer)
      });
    }));
    return [...byAt.values()].sort((x, y) => x.at - y.at).slice(-60);
  }

  /** Merge two progress subsets into a new one. Neither argument is modified. */
  function merge(a, b) {
    const left = a && typeof a === 'object' ? a : {};
    const right = b && typeof b === 'object' ? b : {};

    const stars = mergeStars(left, right);
    const done = mergeDone(left, right);

    return {
      stars: stars.stars,
      weekStart: stars.weekStart,
      starsEpoch: stars.starsEpoch,
      weeks: mergeWeeks([left.weeks, right.weeks, stars.archive]),
      done: done.done,
      doneEpoch: done.doneEpoch,
      sessions: mergeSessions([left.sessions, right.sessions])
    };
  }

  /** Fold an incoming subset into the live store state, in place.
      Returns true if anything actually changed. */
  function applyTo(state, incoming) {
    if (!incoming || typeof incoming !== 'object') return false;
    const before = JSON.stringify(subset(state));
    Object.assign(state, merge(subset(state), incoming));
    return JSON.stringify(subset(state)) !== before;
  }

  return { FIELDS, subset, merge, applyTo, dayValue, canonDone };
})();
