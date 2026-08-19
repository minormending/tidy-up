/* Two ways out of this device.

   A backup file carries everything, photos and voice clips included.
   A setup code is a QR of the job list only - names, timers, support
   level - because a QR holds about 2.9KB and one photo is fifty times
   that. Scanning it with the tablet's own camera opens the app already
   configured, then the photos get taken on that device. */
const Backup = (() => {
  const FILE_VERSION = 1;
  const SETUP_VERSION = 1;

  function $(id) { return document.getElementById(id); }

  /* ---- base64url ---- */

  function toBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(encoded) {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '==='.slice((padded.length + 3) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function dataUrlToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return res.blob();
  }

  /* ---- backup file ---- */

  async function buildBundle() {
    const state = Store.get();
    const tasks = [];
    for (const task of Store.tasks()) {
      const photo = await Media.get(task.photoId);
      const audio = await Media.get(task.audioId);
      tasks.push({
        id: task.id,
        label: task.label,
        seconds: task.seconds,
        seedPhoto: task.seedPhoto || null,
        photo: photo ? await blobToDataUrl(photo) : null,
        audio: audio ? await blobToDataUrl(audio) : null
      });
    }
    return {
      app: 'tidy-up',
      version: FILE_VERSION,
      exportedAt: new Date().toISOString(),
      supportLevel: state.supportLevel,
      defaultSeconds: state.defaultSeconds,
      chimeOn: state.chimeOn,
      stars: state.stars,
      weekStart: state.weekStart,
      weeks: state.weeks,
      tasks: tasks
    };
  }

  function stamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  async function exportFile(button) {
    const original = button ? button.textContent : null;
    if (button) { button.disabled = true; button.textContent = 'Packing…'; }
    try {
      const bundle = await buildBundle();
      const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'tidy-up-backup-' + stamp() + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      window.alert('Could not build the backup file.');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  }

  async function importFile(file) {
    let bundle;
    try {
      bundle = JSON.parse(await file.text());
    } catch (err) {
      window.alert('That file is not a Tidy Up backup.');
      return false;
    }
    if (!bundle || bundle.app !== 'tidy-up' || !Array.isArray(bundle.tasks)) {
      window.alert('That file is not a Tidy Up backup.');
      return false;
    }
    if (bundle.version > FILE_VERSION) {
      window.alert('That backup came from a newer version of the app.');
      return false;
    }
    const when = bundle.exportedAt ? new Date(bundle.exportedAt).toLocaleDateString() : 'an unknown date';
    if (!window.confirm('Replace everything on this device with the backup from ' + when +
      '? The current jobs, photos, and recordings are removed.')) return false;

    for (const task of Store.tasks()) {
      await Media.remove(task.photoId);
      await Media.remove(task.audioId);
    }

    const tasks = [];
    for (const t of bundle.tasks) {
      const task = {
        id: t.id,
        label: t.label || '',
        seconds: Number(t.seconds) || bundle.defaultSeconds || 150,
        seedPhoto: t.seedPhoto || null,
        photoId: null,
        audioId: null
      };
      if (t.photo) task.photoId = await Media.put(await dataUrlToBlob(t.photo), 'photo');
      if (t.audio) task.audioId = await Media.put(await dataUrlToBlob(t.audio), 'voice');
      tasks.push(task);
    }

    Store.set({
      tasks: tasks,
      supportLevel: bundle.supportLevel || 1,
      defaultSeconds: bundle.defaultSeconds || 150,
      chimeOn: bundle.chimeOn !== false,
      stars: Number(bundle.stars) || 0,
      weekStart: bundle.weekStart || 0,
      weeks: Array.isArray(bundle.weeks) ? bundle.weeks : []
    });
    Store.clearToday();
    return true;
  }

  /* ---- setup code ---- */

  function setupPayload() {
    const state = Store.get();
    return [SETUP_VERSION, state.supportLevel, state.defaultSeconds,
      Store.tasks().map(t => [t.id, t.label || '', t.seconds])];
  }

  function setupUrl() {
    const base = location.origin + location.pathname;
    return base + '#setup=' + toBase64Url(JSON.stringify(setupPayload()));
  }

  function setupSvg() {
    const url = setupUrl();
    const code = QR.encode(url, { ecl: 'M' });
    return { svg: QR.svg(code, { label: 'Setup code', light: '#ffffff', dark: '#2c2c2a' }),
      bytes: url.length, version: code.version };
  }

  function parseSetup(encoded) {
    let data;
    try { data = JSON.parse(fromBase64Url(encoded)); } catch (err) { return null; }
    if (!Array.isArray(data) || data[0] !== SETUP_VERSION || !Array.isArray(data[3])) return null;
    const jobs = data[3].filter(j => Array.isArray(j) && typeof j[0] === 'string');
    if (!jobs.length) return null;
    return { supportLevel: Number(data[1]) || 1, defaultSeconds: Number(data[2]) || 150, jobs: jobs };
  }

  /* Jobs keep their id, so a device that already has photos for a job
     keeps them when the same setup is scanned again. */
  async function applySetup(setup) {
    const existing = Store.tasks();
    const keep = new Set(setup.jobs.map(j => j[0]));
    for (const task of existing) {
      if (!keep.has(task.id)) {
        await Media.remove(task.photoId);
        await Media.remove(task.audioId);
      }
    }
    const tasks = setup.jobs.map(job => {
      const prior = existing.find(t => t.id === job[0]);
      return {
        id: job[0],
        label: job[1] || '',
        seconds: Number(job[2]) || setup.defaultSeconds,
        seedPhoto: prior ? prior.seedPhoto : null,
        photoId: prior ? prior.photoId : null,
        audioId: prior ? prior.audioId : null
      };
    });
    Store.set({ tasks: tasks, supportLevel: setup.supportLevel, defaultSeconds: setup.defaultSeconds });
  }

  /* ---- an incoming code ---- */

  function pendingSetup() {
    const match = /[#&]setup=([A-Za-z0-9\-_]+)/.exec(location.hash || '');
    return match ? parseSetup(match[1]) : null;
  }

  function clearHash() {
    history.replaceState(null, '', location.origin + location.pathname);
  }

  function offerSetup(setup) {
    const banner = $('setup-banner');
    const withPhotos = Store.tasks().filter(t => t.photoId).length;
    banner.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = 'A setup code was scanned: ' + setup.jobs.length +
      (setup.jobs.length === 1 ? ' job' : ' jobs') +
      '. Loading it replaces the job list. Photos and recordings are not in a code — ' +
      (withPhotos ? 'any already on this device are kept for jobs with the same name.'
                  : 'they are taken on this device afterwards.');
    banner.appendChild(p);

    const row = document.createElement('div');
    row.className = 'btn-row';

    const load = document.createElement('button');
    load.className = 'btn';
    load.textContent = 'Load this setup';
    load.addEventListener('click', async () => {
      await applySetup(setup);
      clearHash();
      banner.hidden = true;
      Parent.refresh();
    });

    const ignore = document.createElement('button');
    ignore.className = 'btn btn--quiet';
    ignore.textContent = 'Ignore';
    ignore.addEventListener('click', () => { clearHash(); banner.hidden = true; });

    row.appendChild(load);
    row.appendChild(ignore);
    banner.appendChild(row);
    banner.hidden = false;
  }

  function init() {
    $('export-file').addEventListener('click', e => exportFile(e.currentTarget));

    const picker = $('import-file');
    picker.addEventListener('change', async () => {
      if (picker.files && picker.files[0]) {
        const ok = await importFile(picker.files[0]);
        picker.value = '';
        if (ok) Parent.refresh();
      }
    });

    const show = $('show-setup-code');
    const holder = $('setup-code');
    show.addEventListener('click', () => {
      if (!holder.hidden) { holder.hidden = true; show.textContent = 'Show setup code'; return; }
      try {
        const made = setupSvg();
        holder.innerHTML = made.svg;
        const note = document.createElement('p');
        note.className = 'hint';
        note.textContent = 'Point the other device’s camera at this. It opens the app with these ' +
          Store.tasks().length + ' jobs already set up. Photos and recordings do not fit in a code.';
        holder.appendChild(note);
        holder.hidden = false;
        show.textContent = 'Hide setup code';
      } catch (err) {
        window.alert('Too many jobs to fit in one code. Use a backup file instead.');
      }
    });

    /* A code scanned while the app is already open only changes the hash,
       so watch for that as well as for a fresh load. */
    window.addEventListener('hashchange', () => {
      const incoming = pendingSetup();
      if (incoming) {
        Parent.open();
        offerSetup(incoming);
      }
    });

    const setup = pendingSetup();
    if (setup) {
      Parent.open();
      offerSetup(setup);
    } else if (location.hash) {
      clearHash();
    }
  }

  return { init, exportFile, importFile, setupUrl, setupSvg, parseSetup, applySetup };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Backup;
