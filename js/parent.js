/* The grown-up side. Words are allowed in here. */
const Parent = (() => {
  const HOLD_MS = 1600;
  const MAX_AUDIO_MS = 12000;
  const PHOTO_MAX = 720;

  const LEVELS = [
    { n: 1, title: 'Full help', body: 'One picture, your voice plays on its own, timer running.' },
    { n: 2, title: 'Voice on request', body: 'Picture and timer. He taps the picture if he wants to hear you.' },
    { n: 3, title: 'No timer', body: 'Just the picture and the button. Voice still on tap.' },
    { n: 4, title: 'All at once', body: 'Every job on one screen, one button. Almost "go and tidy up".' }
  ];

  let recorder = null;
  let recordingFor = null;
  let preview = null;

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---- getting in ---- */

  function bindCorner() {
    const corner = $('parent-corner');
    let timer = null;
    const begin = () => {
      corner.classList.add('is-holding');
      timer = setTimeout(open, HOLD_MS);
    };
    const cancel = () => {
      corner.classList.remove('is-holding');
      clearTimeout(timer);
    };
    corner.addEventListener('pointerdown', begin);
    corner.addEventListener('pointerup', cancel);
    corner.addEventListener('pointercancel', cancel);
    corner.addEventListener('pointerleave', cancel);
  }

  function open() {
    $('parent-corner').classList.remove('is-holding');
    render();
    Kid.show('parent');
    $('parent-corner').hidden = true;
  }

  function close() {
    stopPreview();
    $('parent-corner').hidden = false;
    Kid.renderStart();
  }

  /* ---- media capture ---- */

  function shrinkPhoto(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, PHOTO_MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const side = Math.min(w, h);
        const canvas = document.createElement('canvas');
        canvas.width = side;
        canvas.height = side;
        const ctx = canvas.getContext('2d');
        /* Square crop from the middle: every picture slot in the app is
           square, so crop once here rather than letting CSS do it. */
        ctx.drawImage(img, (img.width - img.width * (side / w)) / 2, (img.height - img.height * (side / h)) / 2,
          img.width * (side / w), img.height * (side / h), 0, 0, side, side);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('no blob')), 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }

  async function setPhoto(task, file) {
    try {
      const blob = await shrinkPhoto(file);
      await Media.remove(task.photoId);
      const id = await Media.put(blob, 'photo');
      Store.updateTask(task.id, { photoId: id });
      render();
    } catch (err) {
      window.alert('That picture could not be read. Try another one.');
    }
  }

  function canRecord() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  async function toggleRecord(task, button) {
    if (recorder && recordingFor === task.id) return stopRecording();
    if (recorder) stopRecording();

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      window.alert('No microphone access. You can still add a sound file instead.');
      return;
    }

    const chunks = [];
    recorder = new MediaRecorder(stream);
    recordingFor = task.id;
    button.textContent = 'Stop';
    button.classList.add('is-recording');

    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      recorder = null;
      recordingFor = null;
      if (chunks.length) {
        const blob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' });
        await Media.remove(task.audioId);
        const id = await Media.put(blob, 'voice');
        Store.updateTask(task.id, { audioId: id });
      }
      render();
    };

    recorder.start();
    setTimeout(() => { if (recorder && recordingFor === task.id) stopRecording(); }, MAX_AUDIO_MS);
  }

  function stopRecording() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  function stopPreview() {
    if (preview) { preview.pause(); preview = null; }
  }

  async function playClip(task) {
    const url = await Media.url(task.audioId);
    if (!url) return;
    stopPreview();
    preview = new Audio(url);
    preview.play().catch(() => {});
  }

  /* ---- task rows ---- */

  async function taskRow(task, index, total) {
    const row = el('div', 'task-row');

    const thumb = el('div', 'thumb');
    const url = (await Media.url(task.photoId)) || task.seedPhoto;
    if (url) thumb.style.backgroundImage = 'url("' + url + '")';
    if (!task.photoId) thumb.appendChild(el('span', 'thumb-tag', 'placeholder'));
    row.appendChild(thumb);

    const body = el('div', 'task-body');

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'input';
    name.value = task.label || '';
    name.placeholder = 'Blocks in the blue bin';
    name.addEventListener('change', () => Store.updateTask(task.id, { label: name.value.trim() }));
    body.appendChild(name);

    const secs = el('label', 'field field--row');
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '30';
    range.max = '600';
    range.step = '15';
    range.value = String(task.seconds || Store.get().defaultSeconds);
    const out = el('b', null, range.value + 's');
    range.addEventListener('input', () => { out.textContent = range.value + 's'; });
    range.addEventListener('change', () => Store.updateTask(task.id, { seconds: Number(range.value) }));
    secs.appendChild(el('span', null, 'Timer'));
    secs.appendChild(range);
    secs.appendChild(out);
    body.appendChild(secs);

    const actions = el('div', 'btn-row');

    const photoLabel = el('label', 'btn btn--quiet', task.photoId ? 'Change photo' : 'Add photo');
    const photoInput = document.createElement('input');
    photoInput.type = 'file';
    photoInput.accept = 'image/*';
    photoInput.capture = 'environment';
    photoInput.hidden = true;
    photoInput.addEventListener('change', () => {
      if (photoInput.files && photoInput.files[0]) setPhoto(task, photoInput.files[0]);
    });
    photoLabel.appendChild(photoInput);
    actions.appendChild(photoLabel);

    if (canRecord()) {
      const rec = el('button', 'btn btn--quiet', task.audioId ? 'Re-record voice' : 'Record voice');
      rec.addEventListener('click', () => toggleRecord(task, rec));
      actions.appendChild(rec);
    }

    if (task.audioId) {
      const play = el('button', 'btn btn--quiet', 'Play');
      play.addEventListener('click', () => playClip(task));
      actions.appendChild(play);
    }

    const up = el('button', 'btn btn--quiet', 'Up');
    up.disabled = index === 0;
    up.addEventListener('click', () => { Store.moveTask(task.id, -1); render(); });
    actions.appendChild(up);

    const down = el('button', 'btn btn--quiet', 'Down');
    down.disabled = index === total - 1;
    down.addEventListener('click', () => { Store.moveTask(task.id, 1); render(); });
    actions.appendChild(down);

    const del = el('button', 'btn btn--quiet btn--danger', 'Remove');
    del.addEventListener('click', async () => {
      if (!window.confirm('Remove "' + (task.label || 'this job') + '"?')) return;
      await Store.removeTask(task.id);
      render();
    });
    actions.appendChild(del);

    body.appendChild(actions);
    row.appendChild(body);
    return row;
  }

  /* ---- the fading ladder ---- */

  function renderLevels() {
    const list = $('level-list');
    const current = Store.get().supportLevel || 1;
    list.innerHTML = '';
    LEVELS.forEach(level => {
      const b = el('button', 'level' + (level.n === current ? ' is-current' : ''));
      b.appendChild(el('span', 'level-title', level.n + '. ' + level.title));
      b.appendChild(el('span', 'level-body', level.body));
      b.addEventListener('click', () => { Store.set({ supportLevel: level.n }); render(); });
      list.appendChild(b);
    });

    /* Suggest stepping down only when the runs actually say so. */
    const recent = Store.get().sessions.filter(s => s.level === current).slice(-6);
    const clean = recent.length >= 4 && recent.every(s => s.tasks > 0 && s.beatTimer >= s.tasks);
    const nudge = $('fade-nudge');
    nudge.hidden = !(clean && current < 4);
    if (!nudge.hidden) {
      nudge.textContent = 'He has finished inside the timer every run for the last ' + recent.length +
        '. That is usually the moment to give him less help, not more stars.';
    }
  }

  /* ---- stars and history ---- */

  function dayLabel(ms) {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function renderStars() {
    const state = Store.get();
    $('star-summary').textContent = state.stars + (state.stars === 1 ? ' star' : ' stars') +
      ' this week, since ' + dayLabel(state.weekStart) + '.';

    const hist = $('week-history');
    hist.innerHTML = '';
    const weeks = state.weeks.slice(-8).reverse();
    if (!weeks.length) {
      hist.appendChild(el('p', 'hint', 'Earlier weeks will show up here once one has passed.'));
    } else {
      weeks.forEach(w => {
        const line = el('div', 'history-line');
        line.appendChild(el('span', null, 'Week of ' + dayLabel(w.start)));
        line.appendChild(el('b', null, w.stars + ''));
        hist.appendChild(line);
      });
    }

    const log = $('session-log');
    log.innerHTML = '';
    const runs = state.sessions.slice(-10).reverse();
    if (!runs.length) {
      log.appendChild(el('p', 'hint', 'Nothing yet.'));
      return;
    }
    runs.forEach(run => {
      const line = el('div', 'history-line');
      const when = new Date(run.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      line.appendChild(el('span', null, when + ' · level ' + run.level));
      line.appendChild(el('b', null, run.earned + '/' + run.tasks + ' done, ' + run.beatTimer + ' in time'));
      log.appendChild(line);
    });
  }

  /* ---- render ---- */

  async function render() {
    const state = Store.get();
    const list = $('task-list');
    list.innerHTML = '';
    const tasks = Store.tasks();
    for (let i = 0; i < tasks.length; i++) {
      list.appendChild(await taskRow(tasks[i], i, tasks.length));
    }

    $('default-seconds').value = String(state.defaultSeconds);
    $('seconds-out').textContent = String(state.defaultSeconds);
    $('chime-toggle').checked = state.chimeOn !== false;

    renderLevels();
    renderStars();
  }

  function init() {
    bindCorner();
    $('parent-close').addEventListener('click', close);
    $('add-task').addEventListener('click', () => { Store.addTask(); render(); });

    const seconds = $('default-seconds');
    seconds.addEventListener('input', () => { $('seconds-out').textContent = seconds.value; });
    seconds.addEventListener('change', () => Store.set({ defaultSeconds: Number(seconds.value) }));

    $('chime-toggle').addEventListener('change', e => Store.set({ chimeOn: e.target.checked }));

    $('reset-today').addEventListener('click', () => { Store.clearToday(); render(); });
    $('reset-stars').addEventListener('click', () => {
      if (window.confirm("Clear this week's stars?")) { Store.resetStars(); render(); }
    });
  }

  return { init, open, refresh: render };
})();
