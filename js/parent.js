/* The grown-up side. Words are allowed in here. */
const Parent = (() => {
  const MAX_AUDIO_MS = 12000;
  const PHOTO_MAX = 720;

  const LEVELS = [
    { n: 1, title: 'Full help', body: 'One picture, your voice plays on its own, timer running.' },
    { n: 2, title: 'Voice on request', body: 'Picture and timer. They tap the picture if they want to hear you.' },
    { n: 3, title: 'No timer', body: 'Just the picture and the button. Voice still on tap.' },
    { n: 4, title: 'All at once', body: 'Every job on one screen, one button. Almost "go and tidy up".' }
  ];

  let recorder = null;
  let gate = null;
  let syncCard = null;
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

  /* The button, the hold and the ring all come from suite/gate.js. A plain tap
     still does nothing -- the hold is what keeps a five-year-old out. */
  function bindCorner() {
    gate = Gate.mount({
      id: 'parent-corner',           // Kid.show hides it by id, from the other file
      hidden: true,                  // Kid.show decides, and it boots on the door
      onOpen: open,
    });
  }

  function open() {
    render();
    Kid.show('parent');
  }

  function close() {
    stopPreview();
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

    const thumb = el('button', 'thumb');
    thumb.type = 'button';
    thumb.setAttribute('aria-label', 'Change the picture for ' + (task.label || 'this job'));
    paintThumb(thumb, task, (await Media.url(task.photoId)) || task.seedPhoto);
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

    body.appendChild(actions);
    thumb.addEventListener('click', () => togglePicker(task, body));
    row.appendChild(body);

    const move = el('div', 'task-move');
    move.appendChild(moveButton(task, 'up', index === 0));
    move.appendChild(removeButton(task));
    move.appendChild(moveButton(task, 'down', index === total - 1));
    row.appendChild(move);

    return row;
  }

  function moveButton(task, direction, atEnd) {
    const up = direction === 'up';
    const button = el('button', 'move-button');
    button.type = 'button';
    button.disabled = atEnd;
    button.setAttribute('aria-label',
      'Move ' + (task.label || 'this job') + (up ? ' up' : ' down'));
    button.innerHTML = '<svg viewBox="0 0 24 24" class="move-glyph" aria-hidden="true">' +
      '<path d="' + (up ? 'M6 14.5l6-6 6 6' : 'M6 9.5l6 6 6-6') + '" fill="none" ' +
      'stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    button.addEventListener('click', () => {
      Store.moveTask(task.id, up ? -1 : 1);
      render();
    });
    return button;
  }

  function removeButton(task) {
    const button = el('button', 'move-button move-button--remove');
    button.type = 'button';
    button.setAttribute('aria-label', 'Remove ' + (task.label || 'this job'));
    button.innerHTML = '<svg viewBox="0 0 24 24" class="move-glyph" aria-hidden="true">' +
      '<path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.6" ' +
      'stroke-linecap="round"/></svg>';
    button.addEventListener('click', async () => {
      if (!window.confirm('Remove "' + (task.label || 'this job') + '"?')) return;
      await Store.removeTask(task.id);
      render();
    });
    return button;
  }

  /* ---- choosing a picture ---- */

  /* The thumbnail is the control, so it carries a small pencil to say so. */
  function paintThumb(thumb, task, photoUrl) {
    thumb.innerHTML = '';
    thumb.classList.remove('is-icon');
    thumb.style.backgroundImage = '';
    thumb.style.backgroundColor = '';

    if (photoUrl) {
      thumb.style.backgroundImage = 'url("' + photoUrl + '")';
    } else {
      thumb.classList.add('is-icon');
      thumb.style.backgroundColor = task.color || '#f1efe8';
      thumb.innerHTML = Icons.svg(task.icon || 'star', Store.inkFor(task.color));
    }

    const badge = el('span', 'thumb-edit');
    badge.innerHTML = Icons.svg('pencil', '#6f6a5e');
    thumb.appendChild(badge);
  }

  function togglePicker(task, body) {
    const open = body.querySelector('.picture-picker');
    if (open) { open.remove(); return; }
    body.querySelectorAll('.picture-picker').forEach(n => n.remove());

    const picker = el('div', 'picture-picker');

    if (task.photoId) {
      picker.appendChild(el('p', 'hint',
        'A photo of the real bin is being used, which beats any icon. Remove it to go back to one.'));
      const drop = el('button', 'btn btn--quiet', 'Remove the photo');
      drop.addEventListener('click', async () => {
        await Media.remove(task.photoId);
        Store.updateTask(task.id, { photoId: null });
        render();
      });
      picker.appendChild(drop);
      body.appendChild(picker);
      return;
    }

    const thumb = body.parentElement ? body.parentElement.querySelector('.thumb') : null;

    /* Colour first: with one-colour icons it is doing as much work as the
       shape in telling one tile from another. */
    picker.appendChild(el('p', 'picker-heading', 'Colour'));
    const swatches = el('div', 'swatch-row');
    picker.appendChild(swatches);

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'input icon-search';
    search.placeholder = 'Search icons \u2014 try bin, ball, bag';
    search.setAttribute('aria-label', 'Search icons');
    picker.appendChild(search);

    const results = el('div', 'icon-results');
    picker.appendChild(results);

    function ink() { return Store.inkFor(task.color); }

    function iconCell(name) {
      const text = Icons.label(name);
      const cell = el('button', 'icon-cell' + (name === task.icon ? ' is-current' : ''));
      cell.innerHTML = Icons.svg(name, ink());
      cell.title = text;
      cell.setAttribute('aria-label', text);
      cell.addEventListener('click', () => {
        Store.updateTask(task.id, { icon: name });
        repaint();
      });
      return cell;
    }

    function paintSwatches() {
      swatches.innerHTML = '';
      Store.PALETTE.forEach(pair => {
        const swatch = el('button', 'swatch' + (pair.bg === task.color ? ' is-current' : ''));
        swatch.style.backgroundColor = pair.bg;
        swatch.innerHTML = Icons.svg(task.icon || 'star', pair.ink);
        swatch.setAttribute('aria-label', 'Use this colour');
        swatch.addEventListener('click', () => {
          Store.updateTask(task.id, { color: pair.bg });
          repaint();
        });
        swatches.appendChild(swatch);
      });
    }

    function paintResults() {
      const query = search.value.trim();
      results.innerHTML = '';

      if (!query) {
        Icons.GROUPS.forEach(group => {
          results.appendChild(el('p', 'picker-heading', group.title));
          const grid = el('div', 'icon-grid');
          group.items.forEach(item => grid.appendChild(iconCell(item[0])));
          results.appendChild(grid);
        });
        return;
      }

      const found = Icons.search(query);
      if (!found.length) {
        results.appendChild(el('p', 'hint', 'Nothing matches that. Try a plainer word \u2014 bin, ball, bag, pet.'));
        return;
      }
      results.appendChild(el('p', 'picker-heading', found.length === 1 ? '1 match' : found.length + ' matches'));
      const grid = el('div', 'icon-grid');
      found.forEach(name => grid.appendChild(iconCell(name)));
      results.appendChild(grid);
    }

    /* Repaint in place rather than re-rendering the whole job list, so
       choosing a colour does not shut the picker or wipe the search. */
    function repaint() {
      paintSwatches();
      paintResults();
      if (thumb) paintThumb(thumb, task, null);
    }

    search.addEventListener('input', paintResults);
    search.addEventListener('search', paintResults);
    repaint();

    body.appendChild(picker);
    picker.scrollIntoView({ block: 'nearest' });
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
      nudge.textContent = 'They have finished inside the timer every run for the last ' + recent.length +
        '. That is usually the moment to give them less help, not more stars.';
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

  /* ---- two devices at once ---- */

  /* The card, the pairing flow and every string in it come from
     suite/sync-card.js. What is this app's is the prose -- what travels and
     what does not is different in every game -- and claiming the room, which is
     tangled up with how a clear merges. */
  function renderSync() {
    if (syncCard) return syncCard.render();
    syncCard = SyncCard.mount({
      host: '#sync-card',
      handle: () => Sync.handle(),
      noun: 'device',
      lede: [
        'Keeps the day the same on both: a job finished on the tablet shows as '
        + 'done on your phone a moment later. Stars, today\u2019s ticks and the run '
        + 'log travel.',
        'Jobs, photos and recordings do not. Those move with a backup file or the '
        + 'setup code above \u2014 a photo of your child\u2019s room and your recorded '
        + 'voice stay on the device they were made on.',
      ],
      joinNote: 'Type the code shown on the other device. Connecting merges the two, '
        + 'and nothing is ever lowered, so no star or tick is lost either way.',
      onCreated: (code) => { Store.get().syncRoom = code; Store.save(); },
      onLeft: () => Sync.forgetRoom(),
    });
  }

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
    renderSync();
  }

  function init() {
    bindCorner();
    $('parent-close').addEventListener('click', close);
    $('add-task').addEventListener('click', () => { Store.addTask(); render(); });

    const seconds = $('default-seconds');
    seconds.addEventListener('input', () => { $('seconds-out').textContent = seconds.value; });
    seconds.addEventListener('change', () => Store.set({ defaultSeconds: Number(seconds.value) }));

    $('chime-toggle').addEventListener('change', e => Store.set({ chimeOn: e.target.checked }));


    /* Repaint when a remote change lands or the connection state moves.

       Never while a job is running. screen-task owns the screen for the length
       of one job — it has a draining ring and a single button, and repainting
       under a five-year-old mid-task is worse than showing a count that is a
       few seconds stale. The pick grid and the finished summary are both
       passive, so those are safe to refresh. */
    Sync.onRender(() => {
      if (!$('screen-parent').hidden) { render(); return; }
      if (!$('screen-start').hidden) Kid.renderStart();
      else if (!$('screen-rest').hidden) Kid.renderRest();
    });

    $('reset-today').addEventListener('click', () => { Store.clearToday(); render(); });
    $('reset-stars').addEventListener('click', () => {
      if (window.confirm("Clear this week's stars?")) { Store.resetStars(); render(); }
    });
  }

  return { init, open, refresh: render };
})();
