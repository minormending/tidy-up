/* All state lives on this device. localStorage holds the small stuff,
   IndexedDB holds photos and voice clips. */
const Store = (() => {
  const KEY = 'tidyup.v1';
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  /* Each job gets a soft background and a matching ink for its icon.
     With one-colour icons the colour is doing real work telling the
     tiles apart, so it is chosen at creation and then left alone. */
  const PALETTE = [
    { bg: '#e6f1fb', ink: '#185fa5' },
    { bg: '#eeedfe', ink: '#534ab7' },
    { bg: '#e1f5ee', ink: '#0f6e56' },
    { bg: '#faece7', ink: '#993c1d' },
    { bg: '#fbeeda', ink: '#854f0b' },
    { bg: '#eaf3de', ink: '#3b6d11' },
    { bg: '#fcebeb', ink: '#a32d2d' },
    { bg: '#f1efe8', ink: '#5f5e5a' }
  ];

  const SEED = [
    { id: 'seed-blocks', label: 'Blocks in the bin', icon: 'cube', color: PALETTE[0].bg },
    { id: 'seed-books', label: 'Books on the shelf', icon: 'books', color: PALETTE[1].bg },
    { id: 'seed-clothes', label: 'Clothes in the basket', icon: 't-shirt', color: PALETTE[2].bg },
    { id: 'seed-cars', label: 'Cars in the box', icon: 'car', color: PALETTE[3].bg }
  ];

  /* Only the background travels in a backup or a setup code; the ink is
     looked up from it, so an unknown colour still gets readable ink. */
  function inkFor(bg) {
    const found = PALETTE.find(p => p.bg === bg);
    return found ? found.ink : '#5f5e5a';
  }

  const DEFAULTS = {
    version: 1,
    supportLevel: 1,
    defaultSeconds: 150,
    chimeOn: true,
    tasks: [],
    stars: 0,
    weekStart: 0,
    weeks: [],
    sessions: [],
    done: null
  };

  let state = null;
  let firstRun = false;

  function seedTasks(seconds) {
    return SEED.map(seed => ({
      id: seed.id,
      label: seed.label,
      icon: seed.icon,
      color: seed.color,
      photoId: null,
      audioId: null,
      seconds: seconds
    }));
  }

  function startOfWeek(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d.getTime();
  }

  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (err) { saved = null; }
    /* Nothing stored yet means nobody has set this up on this device. */
    firstRun = !saved;
    state = Object.assign({}, DEFAULTS, saved || {});
    if (!Array.isArray(state.tasks) || state.tasks.length === 0) {
      state.tasks = seedTasks(state.defaultSeconds);
    }
    /* Older saves recorded a list of finished jobs rather than counts. */
    if (state.done && Array.isArray(state.done.ids)) {
      const counts = {};
      state.done.ids.forEach(id => { counts[id] = 1; });
      state.done = { date: state.done.date, counts: counts };
    }

    /* Older saves predate icons and tile colours. */
    state.tasks.forEach((t, i) => {
      if (typeof t.icon !== 'string' || !t.icon) t.icon = 'star';
      if (!t.color) t.color = PALETTE[i % PALETTE.length].bg;
      delete t.emoji;
    });
    if (!Array.isArray(state.weeks)) state.weeks = [];
    if (!Array.isArray(state.sessions)) state.sessions = [];
    rollWeek();
    save();
    return state;
  }

  /* Stars roll over on their own each week so the board never becomes a
     wall of hundreds of stars that means nothing. */
  function rollWeek() {
    const thisWeek = startOfWeek(Date.now());
    if (!state.weekStart) {
      state.weekStart = thisWeek;
      return;
    }
    if (thisWeek > state.weekStart) {
      if (state.stars > 0) {
        state.weeks.push({ start: state.weekStart, stars: state.stars });
        state.weeks = state.weeks.slice(-12);
      }
      state.stars = 0;
      state.weekStart = thisWeek;
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (err) { /* private mode or full: the session still runs */ }
  }

  function get() { return state; }

  function isFirstRun() { return firstRun; }

  function tasks() { return state.tasks; }

  function task(id) { return state.tasks.find(t => t.id === id) || null; }

  function set(patch) {
    Object.assign(state, patch);
    save();
  }

  function addTask() {
    const t = {
      id: 'task-' + Math.random().toString(36).slice(2, 9),
      label: '',
      icon: 'star',
      color: PALETTE[state.tasks.length % PALETTE.length].bg,
      photoId: null,
      audioId: null,
      seconds: state.defaultSeconds
    };
    state.tasks.push(t);
    save();
    return t;
  }

  function updateTask(id, patch) {
    const t = task(id);
    if (!t) return null;
    Object.assign(t, patch);
    save();
    return t;
  }

  async function removeTask(id) {
    const t = task(id);
    if (!t) return;
    await Media.remove(t.photoId);
    await Media.remove(t.audioId);
    state.tasks = state.tasks.filter(x => x.id !== id);
    save();
  }

  function moveTask(id, delta) {
    const i = state.tasks.findIndex(t => t.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= state.tasks.length) return;
    const [t] = state.tasks.splice(i, 1);
    state.tasks.splice(j, 0, t);
    save();
  }

  /* Stars are only ever earned. Nothing in the app takes one back. */
  function awardStar() {
    rollWeek();
    state.stars += 1;
    save();
    return state.stars;
  }

  function recordSession(entry) {
    state.sessions.push(Object.assign({ at: Date.now() }, entry));
    state.sessions = state.sessions.slice(-60);
    save();
  }

  /* How many times each job has been finished today. A job can be done
     again - blocks get tidied more than once - so this counts rather than
     just remembering that it happened. Clears itself at midnight. */
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function doneCounts() {
    if (!state.done || state.done.date !== today()) return {};
    return state.done.counts || {};
  }

  function doneCount(id) {
    return doneCounts()[id] || 0;
  }

  /* The jobs done at least once today, for "what is left" and progress. */
  function doneToday() {
    const counts = doneCounts();
    return Object.keys(counts).filter(id => counts[id] > 0);
  }

  function markDone(id) {
    if (!state.done || state.done.date !== today()) state.done = { date: today(), counts: {} };
    if (!state.done.counts) state.done.counts = {};
    state.done.counts[id] = (state.done.counts[id] || 0) + 1;
    save();
  }

  function clearToday() {
    state.done = { date: today(), counts: {} };
    save();
  }

  function resetStars() {
    state.stars = 0;
    state.weekStart = startOfWeek(Date.now());
    save();
  }

  return {
    load, save, get, set, tasks, task, isFirstRun,
    addTask, updateTask, removeTask, moveTask,
    awardStar, recordSession, resetStars,
    doneToday, doneCounts, doneCount, markDone, clearToday,
    seedTasks, PALETTE, inkFor, WEEK_MS
  };
})();
