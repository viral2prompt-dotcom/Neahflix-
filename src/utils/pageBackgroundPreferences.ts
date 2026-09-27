export type BackgroundPage = 'home' | 'movies' | 'series' | 'anime' | 'settings';
export type PageBackground = { color: string; imageId?: string };
export type PageBackgroundPreferences = {
  mode: 'global' | 'custom';
  global: PageBackground;
  pages: Record<BackgroundPage, PageBackground>;
};

const STORAGE_KEY = 'neahflix_page_backgrounds_v1';
const DB_NAME = 'neahflix-preferences';
const STORE_NAME = 'background-images';
export const PAGE_BACKGROUND_CHANGED = 'neahflix:page-background-changed';

const defaults = (): PageBackgroundPreferences => ({
  mode: 'global',
  global: { color: '#020b1d' },
  pages: {
    home: { color: '#020b1d' }, movies: { color: '#020b1d' }, series: { color: '#020b1d' },
    anime: { color: '#020b1d' }, settings: { color: '#020b1d' },
  },
});

export const getPageBackgroundPreferences = (): PageBackgroundPreferences => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '');
    const base = defaults();
    return {
      mode: parsed?.mode === 'custom' ? 'custom' : 'global',
      global: { ...base.global, ...parsed?.global },
      pages: { ...base.pages, ...parsed?.pages },
    };
  } catch { return defaults(); }
};

export const savePageBackgroundPreferences = (prefs: PageBackgroundPreferences) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event(PAGE_BACKGROUND_CHANGED));
};

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export const saveBackgroundImage = async (id: string, image: Blob) => {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(image, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
};

export const loadBackgroundImage = async (id?: string): Promise<string | undefined> => {
  if (!id) return undefined;
  const db = await openDb();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob ? URL.createObjectURL(blob) : undefined;
};

export const routeBackgroundPage = (pathname: string): BackgroundPage | null => {
  if (pathname === '/') return 'home';
  if (pathname === '/movies') return 'movies';
  if (pathname === '/tv-shows') return 'series';
  if (pathname === '/anime') return 'anime';
  if (pathname === '/settings') return 'settings';
  return null;
};
