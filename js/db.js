// IndexedDB layer. Content and progress are separate stores: importing a pack
// only ever writes to content/audio/packs, never to progress/sessions.

export const DB_NAME = "german-trainer";
export const DB_VERSION = 1;
export const STORES = {
  content: "id",
  audio: "filename",
  packs: "packId",
  progress: "contentId",
  sessions: "sessionId",
  meta: "key",
};

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const from = event.oldVersion;
      if (from < 1) {
        const content = db.createObjectStore("content", { keyPath: "id" });
        content.createIndex("level", "level");
        const audio = db.createObjectStore("audio", { keyPath: "filename" });
        audio.createIndex("packId", "packId");
        db.createObjectStore("packs", { keyPath: "packId" });
        const progress = db.createObjectStore("progress", { keyPath: "contentId" });
        progress.createIndex("due_at", "srs.due_at");
        const sessions = db.createObjectStore("sessions", { keyPath: "sessionId" });
        sessions.createIndex("started_at", "started_at");
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function store(db, name, mode) {
  return db.transaction(name, mode).objectStore(name);
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function get(storeName, key) {
  const db = await openDB();
  return wrap(store(db, storeName, "readonly").get(key));
}

export async function getAll(storeName) {
  const db = await openDB();
  return wrap(store(db, storeName, "readonly").getAll());
}

export async function put(storeName, value) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(value);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
  });
}

export async function putMany(storeName, values) {
  if (!values.length) return;
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  const os = tx.objectStore(storeName);
  for (const value of values) os.put(value);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(values.length);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
  });
}

export async function clear(storeName) {
  const db = await openDB();
  return wrap(store(db, storeName, "readwrite").clear());
}

export async function count(storeName) {
  const db = await openDB();
  return wrap(store(db, storeName, "readonly").count());
}

export async function del(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(key);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/** Replace every record in one atomic transaction (used by backup restore). */
export async function replaceAll(storeName, values) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  const os = tx.objectStore(storeName);
  os.clear();
  for (const value of values) os.put(value);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(values.length);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
  });
}

/** Replace several stores in ONE transaction (progress + sessions restore). */
export async function replaceStores(valuesByStore) {
  const db = await openDB();
  const names = Object.keys(valuesByStore);
  if (!names.length) return 0;
  const tx = db.transaction(names, "readwrite");
  let total = 0;
  for (const name of names) {
    const os = tx.objectStore(name);
    os.clear();
    for (const value of valuesByStore[name]) {
      os.put(value);
      total += 1;
    }
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(total);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
  });
}

export async function estimateStorage() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}

export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
