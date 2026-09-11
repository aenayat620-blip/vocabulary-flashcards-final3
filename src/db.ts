import type { AppData, Category, VocabularyItem } from './types';

const DB_NAME = 'VocabularyFlashcardsDB';
const DB_VERSION = 1;
const STORE_NAME = 'appData';
const KEY = 'main';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB open error', request.error);
      reject(new Error('نمی‌توان به حافظه دائمی دسترسی پیدا کرد.'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

  return dbPromise;
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    try {
      const granted = await navigator.storage.persist();
      return granted;
    } catch {
      return false;
    }
  }
  return false;
}

export async function loadAppData(): Promise<AppData> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(KEY);

      request.onsuccess = () => {
        const data = request.result as AppData | undefined;
        if (data && data.backupVersion) {
          resolve(data);
        } else {
          // First launch – create empty structure
          const empty: AppData = {
            categories: [],
            vocabulary: [],
            settings: {
              studyDirection: 'en-fa',
              defaultCardOrder: 'shuffled',
              autoPronounce: true,
              repeatDifficult: true,
              preferredReviewMode: 'smart',
              dailyReviewTarget: 20,
              theme: 'notebook',
            },
            currentSession: null,
            stats: {
              totalWordsStudied: 0,
              totalReviews: 0,
              totalCorrect: 0,
              totalIncorrect: 0,
              totalUnsure: 0,
              currentStreak: 0,
              longestStreak: 0,
              lastStudyDate: null,
            },
            backupVersion: 1,
          };
          resolve(empty);
        }
      };

      request.onerror = () => {
        reject(new Error('خطا در خواندن داده‌ها از حافظه.'));
      };
    });
  } catch (err) {
    console.error(err);
    throw new Error('دسترسی به IndexedDB ممکن نیست. داده‌ها ذخیره نخواهند شد.');
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(data, KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error(request.error);
        reject(new Error('ذخیره اطلاعات با مشکل مواجه شد.'));
      };
    });
  } catch (err) {
    console.error(err);
    throw new Error('ذخیره اطلاعات با مشکل مواجه شد.');
  }
}

export async function clearAllData(): Promise<void> {
  const empty: AppData = {
    categories: [],
    vocabulary: [],
    settings: {
      studyDirection: 'en-fa',
      defaultCardOrder: 'shuffled',
      autoPronounce: true,
      repeatDifficult: true,
      preferredReviewMode: 'smart',
      dailyReviewTarget: 20,
      theme: 'notebook',
    },
    currentSession: null,
    stats: {
      totalWordsStudied: 0,
      totalReviews: 0,
      totalCorrect: 0,
      totalIncorrect: 0,
      totalUnsure: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastStudyDate: null,
    },
    backupVersion: 1,
  };
  await saveAppData(empty);
}

// Helper to get single items safely
export function getVocabularyById(data: AppData, wordId: string): VocabularyItem | undefined {
  return data.vocabulary.find((v) => v.wordId === wordId);
}

export function getCategoryById(data: AppData, categoryId: string): Category | undefined {
  return data.categories.find((c) => c.categoryId === categoryId);
}
