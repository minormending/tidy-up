/* All state lives on this device. localStorage holds the small stuff,
   IndexedDB holds photos and voice clips. */
const Store = (() => {
  const KEY = 'tidyup.v1';
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  /* Soft tile backgrounds, assigned when a job is created so that
     reordering the list does not shuffle the colours. */
  const COLORS = ['#e6f1fb', '#eeedfe', '#e1f5ee', '#faece7', '#fbeeda', '#eaf3de', '#fcebeb', '#f1efe8'];

  const SEED = [
    { id: 'seed-blocks', label: 'Blocks in the bin', emoji: '\u{1F9F1}', color: COLORS[0] },
    { id: 'seed-books', label: 'Books on the shelf', emoji: '\u{1F4DA}', color: COLORS[1] },
    { id: 'seed-clothes', label: 'Clothes in the basket', emoji: '\u{1F455}', color: COLORS[2] },
    { id: 'seed-cars', label: 'Cars in the box', emoji: '\u{1F697}', color: COLORS[3] }
  ];

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
      emoji: seed.emoji,
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
    /* Older saves predate emoji and tile colours. */
    state.tasks.forEach((t, i) => {
      if (typeof t.emoji !== 'string') t.emoji = '';
      if (!t.color) t.color = COLORS[i % COLORS.length];
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
      emoji: '\u{2B50}',
      color: COLORS[state.tasks.length % COLORS.length],
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

  /* Which jobs are already finished today, so a tile can show a tick and
     cannot be run twice for another star. Clears itself at midnight. */
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function doneToday() {
    if (!state.done || state.done.date !== today()) return [];
    return state.done.ids;
  }

  function markDone(id) {
    if (!state.done || state.done.date !== today()) state.done = { date: today(), ids: [] };
    if (state.done.ids.indexOf(id) < 0) state.done.ids.push(id);
    save();
  }

  function clearToday() {
    state.done = { date: today(), ids: [] };
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
    doneToday, markDone, clearToday,
    seedTasks, COLORS, WEEK_MS
  };
})();
