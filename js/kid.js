/* The child's side of the app. No words appear anywhere in here on purpose:
   one picture, one timer, one button. */
const Kid = (() => {
  const RING = 283;
  const REST_AFTER_MS = 6000;
  const STAR_PATH = 'M12 2.6l2.9 6.1 6.6.9-4.8 4.7 1.2 6.7-5.9-3.2-5.9 3.2 1.2-6.7L2.5 9.6l6.6-.9z';
  const TICK_PATH = 'M4.5 12.5l5 5 10-11';

  const el = {};
  let session = null;
  let ticker = null;
  let restTimer = null;
  let wakeLock = null;
  let voice = null;

  function $(id) { return document.getElementById(id); }

  function starSvg() {
    return '<svg viewBox="0 0 24 24" class="glyph" aria-hidden="true"><path d="' + STAR_PATH + '"/></svg>';
  }

  function tickSvg() {
    return '<svg viewBox="0 0 24 24" class="glyph tile-check" aria-hidden="true">' +
      '<path d="' + TICK_PATH + '" fill="none" stroke="currentColor" stroke-width="3" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function show(name) {
    document.querySelectorAll('.screen').forEach(s => {
      s.hidden = s.dataset.screen !== name;
    });
    /* Hidden mid-job, where it would sit on top of the progress bar on a
       narrow screen, and in the panel it opens. */
    const corner = document.getElementById('parent-corner');
    if (corner) corner.hidden = name === 'task' || name === 'parent';
  }

  function level() { return Store.get().supportLevel || 1; }

  /* A photo of the real bin beats everything; an icon tinted to the
     job's colour is the fallback, and it is what a job starts with. */
  async function paintPicture(node, task) {
    const fromCamera = await Media.url(task.photoId);
    node.innerHTML = '';
    node.style.backgroundImage = '';
    node.style.backgroundColor = '';
    node.classList.remove('is-icon');

    if (fromCamera) {
      node.style.backgroundImage = 'url("' + fromCamera + '")';
      return;
    }
    if (task.seedPhoto) {
      node.style.backgroundImage = 'url("' + task.seedPhoto + '")';
      return;
    }
    node.classList.add('is-icon');
    node.style.backgroundColor = task.color || '#f1efe8';
    node.innerHTML = Icons.svg(task.icon || 'star', Store.inkFor(task.color));
  }

  function fillStars(node, count, slots) {
    const filled = Math.max(0, Math.min(count, slots));
    let html = '';
    for (let i = 0; i < slots; i++) {
      html += '<div class="star-slot' + (i < filled ? ' is-filled' : '') + '">' + starSvg() + '</div>';
    }
    node.innerHTML = html;
  }

  /* ---- start screen ---- */

  async function renderStart() {
    const done = Store.doneToday();
    const tasks = Store.tasks();

    /* Today's jobs, not the week's total: at five, a row that fills in
       across one afternoon means something and a weekly tally does not.
       The running total is in the grown-up panel. */
    fillStars(el.weekStars, done.length, tasks.length);

    el.tileGrid.innerHTML = '';
    el.tileGrid.style.gridTemplateColumns = 'repeat(' + (tasks.length <= 2 ? tasks.length || 1 : 2) + ', 1fr)';

    for (const task of tasks) {
      const btn = document.createElement('button');
      btn.className = 'tile' + (done.indexOf(task.id) >= 0 ? ' is-done' : '');
      btn.dataset.taskId = task.id;
      btn.setAttribute('aria-label', task.label || 'A tidy-up job');
      btn.innerHTML = tickSvg();

      const picture = document.createElement('span');
      picture.className = 'tile-picture';
      await paintPicture(picture, task);
      btn.appendChild(picture);

      const label = document.createElement('span');
      label.className = 'tile-label';
      label.textContent = task.label || '';
      btn.appendChild(label);

      el.tileGrid.appendChild(btn);
    }

    const pending = tasks.filter(t => done.indexOf(t.id) < 0);
    el.goButton.hidden = pending.length === 0;
    show('start');
  }

  function onTileTap(event) {
    const btn = event.target.closest('.tile');
    if (!btn) return;
    Chime.unlock();
    const task = Store.task(btn.dataset.taskId);
    if (!task) return;
    if (btn.classList.contains('is-done')) {
      playVoice(task);
      return;
    }
    startSession([task.id]);
  }

  function onGo() {
    Chime.unlock();
    const done = Store.doneToday();
    const queue = Store.tasks().filter(t => done.indexOf(t.id) < 0).map(t => t.id);
    if (queue.length) startSession(queue);
  }

  /* ---- a run ---- */

  async function startSession(queue) {
    session = { queue: queue, index: 0, earned: 0, beat: 0 };
    await requestWakeLock();
    if (level() >= 4) return showAllAtOnce();
    await showTask();
  }

  async function showTask() {
    const task = Store.task(session.queue[session.index]);
    if (!task) return finishSession();

    el.taskGrid.hidden = true;
    el.timerWrap.hidden = false;

    await paintPicture(el.taskPhoto, task);
    el.taskPhoto.setAttribute('aria-label', task.label || 'A tidy-up job');
    el.taskLabel.textContent = task.label || '';

    const total = Store.tasks().length || 1;
    const doneCount = Store.doneToday().length;
    el.progressFill.style.width = Math.round((doneCount / total) * 100) + '%';

    show('task');
    startTimer(task);
    if (level() === 1) playVoice(task);
  }

  function startTimer(task) {
    stopTimer();
    const seconds = Number(task.seconds) || Store.get().defaultSeconds;
    if (level() >= 3 || !seconds) {
      el.timerWrap.classList.add('is-untimed');
      return;
    }
    el.timerWrap.classList.remove('is-untimed');
    el.ringFill.classList.remove('is-low');
    el.ringFill.style.strokeDashoffset = '0';

    const endsAt = Date.now() + seconds * 1000;
    session.timedOut = false;
    ticker = setInterval(() => {
      const left = Math.max(0, endsAt - Date.now());
      const spent = 1 - left / (seconds * 1000);
      el.ringFill.style.strokeDashoffset = String(Math.min(RING, RING * spent));
      if (left <= seconds * 1000 * 0.2) el.ringFill.classList.add('is-low');
      if (left <= 0) {
        stopTimer();
        session.timedOut = true;
        /* Time running out is not a failure. One soft tone, and the
           button still works. */
        Chime.timeUp();
      }
    }, 100);
  }

  function stopTimer() {
    if (ticker) clearInterval(ticker);
    ticker = null;
  }

  async function onCheck() {
    if (!session) return;
    stopTimer();
    if (level() >= 4) return completeAll();

    const task = Store.task(session.queue[session.index]);
    if (task) {
      Store.markDone(task.id);
      Store.awardStar();
      session.earned += 1;
      if (!session.timedOut) session.beat += 1;
    }
    Chime.star();
    session.index += 1;
    if (session.index >= session.queue.length) return finishSession();
    await showTask();
  }

  /* ---- the last rung of the ladder: every job on one screen ---- */

  async function showAllAtOnce() {
    el.timerWrap.hidden = true;
    el.taskGrid.hidden = false;
    el.taskGrid.innerHTML = '';
    for (const id of session.queue) {
      const task = Store.task(id);
      if (!task) continue;
      const cell = document.createElement('button');
      cell.className = 'task-cell';
      cell.dataset.taskId = task.id;
      cell.setAttribute('aria-label', task.label || 'A tidy-up job');

      const picture = document.createElement('span');
      picture.className = 'tile-picture';
      await paintPicture(picture, task);
      cell.appendChild(picture);

      const label = document.createElement('span');
      label.className = 'tile-label';
      label.textContent = task.label || '';
      cell.appendChild(label);

      el.taskGrid.appendChild(cell);
    }
    el.progressFill.style.width = '0%';
    el.timerWrap.classList.add('is-untimed');
    el.taskLabel.textContent = '';
    show('task');
  }

  function completeAll() {
    session.queue.forEach(id => {
      Store.markDone(id);
      Store.awardStar();
      session.earned += 1;
    });
    Chime.star();
    finishSession();
  }

  /* A wrong tap should not trap them. Stars already earned stay earned -
     nothing here takes one back - and the rest of the run is dropped. */
  function abortSession() {
    stopTimer();
    if (session && session.earned > 0) {
      Store.recordSession({
        tasks: session.queue.length,
        earned: session.earned,
        beatTimer: session.beat,
        level: level(),
        stopped: true
      });
    }
    session = null;
    releaseWakeLock();
    return renderStart();
  }

  /* ---- ending ---- */

  function finishSession() {
    const earned = session ? session.earned : 0;
    Store.recordSession({
      tasks: session ? session.queue.length : 0,
      earned: earned,
      beatTimer: session ? session.beat : 0,
      level: level()
    });

    const allDone = Store.tasks().every(t => Store.doneToday().indexOf(t.id) >= 0);
    session = null;
    releaseWakeLock();

    if (!allDone) return renderStart();

    fillStars(el.sessionStars, earned, Math.max(earned, 1));
    show('done');
    Chime.finish();
    /* The app puts itself away. There is nothing to play with afterwards. */
    clearTimeout(restTimer);
    restTimer = setTimeout(() => show('rest'), REST_AFTER_MS);
  }

  /* ---- voice prompts ---- */

  async function playVoice(task) {
    const url = await Media.url(task.audioId);
    if (!url) return;
    if (voice) voice.pause();
    voice = new Audio(url);
    voice.play().catch(() => { /* needs a tap first on some browsers */ });
  }

  function onPhotoTap(event) {
    const cell = event.target.closest('.task-cell');
    const id = cell ? cell.dataset.taskId : (session ? session.queue[session.index] : null);
    const task = Store.task(id);
    if (task) playVoice(task);
  }

  /* ---- screen wake ---- */

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) { /* not available, not important */ }
  }

  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  /* Waking from the resting screen takes a deliberate press, so a stray
     poke does not start it all again. */
  function bindRestWake() {
    let timer = null;
    const rest = $('screen-rest');
    const begin = () => { timer = setTimeout(() => { clearTimeout(restTimer); renderStart(); }, 1200); };
    const cancel = () => { clearTimeout(timer); };
    rest.addEventListener('pointerdown', begin);
    rest.addEventListener('pointerup', cancel);
    rest.addEventListener('pointercancel', cancel);
    rest.addEventListener('pointerleave', cancel);
  }

  function init() {
    el.weekStars = $('week-stars');
    el.tileGrid = $('tile-grid');
    el.goButton = $('go-button');
    el.timerWrap = $('timer-wrap');
    el.taskGrid = $('task-grid');
    el.taskPhoto = $('task-photo');
    el.ringFill = $('ring-fill');
    el.progressFill = $('progress-fill');
    el.sessionStars = $('session-stars');
    el.taskLabel = $('task-label');

    el.tileGrid.addEventListener('click', onTileTap);
    el.goButton.addEventListener('click', onGo);
    el.taskPhoto.addEventListener('click', onPhotoTap);
    el.taskGrid.addEventListener('click', onPhotoTap);
    $('check-button').addEventListener('click', onCheck);
    $('task-back').addEventListener('click', abortSession);
    $('replay-button').addEventListener('click', () => Chime.finish());
    bindRestWake();

    return renderStart();
  }

  return { init, renderStart, show };
})();
