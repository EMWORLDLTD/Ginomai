const DATABASE = 'GinomaiWeb';
let opening;
export function openStore() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('workspace');
      request.result.createObjectStore('bibles', {keyPath: 'code'});
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {opening = null; reject(Error('This browser could not open local storage. Allow site storage and retry.'));};
    request.onblocked = () => {opening = null; reject(Error('Close other Ginomai Web tabs and retry opening storage.'));};
  });
  return opening;
}
export async function readWorkspace() {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const request = db.transaction('workspace').objectStore('workspace').get('current');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readBibles() {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const request = db.transaction('bibles').objectStore('bibles').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
// A restore commits its library and service together, or neither is saved.
export async function writeWorkspace(workspace, bibles = []) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['workspace', 'bibles'], 'readwrite');
    transaction.objectStore('workspace').put(workspace, 'current');
    for (const bible of bibles) transaction.objectStore('bibles').put(bible);
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error || Error('Local storage is full or unavailable. Export a backup before closing.'));
  });
}
