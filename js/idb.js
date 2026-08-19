/* Blob storage for photos and voice clips.
   Media never leaves the device: no network calls, nothing in the repo. */
const Media = (() => {
  const DB_NAME = 'tidyup';
  const STORE = 'media';
  const urls = new Map();
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(mode, run) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  function newId(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  async function put(blob, prefix) {
    const id = newId(prefix || 'm');
    await tx('readwrite', store => store.put(blob, id));
    return id;
  }

  async function get(id) {
    if (!id) return null;
    try { return await tx('readonly', store => store.get(id)); }
    catch (err) { return null; }
  }

  async function url(id) {
    if (!id) return null;
    if (urls.has(id)) return urls.get(id);
    const blob = await get(id);
    if (!blob) return null;
    const objectUrl = URL.createObjectURL(blob);
    urls.set(id, objectUrl);
    return objectUrl;
  }

  async function remove(id) {
    if (!id) return;
    if (urls.has(id)) {
      URL.revokeObjectURL(urls.get(id));
      urls.delete(id);
    }
    try { await tx('readwrite', store => store.delete(id)); } catch (err) { /* already gone */ }
  }

  return { put, get, url, remove };
})();
