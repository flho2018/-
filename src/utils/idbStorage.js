/**
 * =========================================================================
 *  محرك التخزين المحلي عالي السعة (IndexedDB Storage Engine)
 * =========================================================================
 *  - يحل مشكلة حد 5-10MB في localStorage عبر توفير مساحة تخزين تصل لمئات
 *    الميجابايت للفواتير، المخزون، وسجل الورديات، والنسخ الاحتياطية.
 *  - تخزين كائنات JavaScript مباشرة بدون إجهاد المعالج بـ JSON.stringify.
 *  - ترحيل تلقائي للبيانات القديمة من localStorage إلى IndexedDB عند أول إقلاع.
 * =========================================================================
 */

const DB_NAME = 'flower_house_pos_db';
const DB_VERSION = 1;
const STORE_NAME = 'pos_store';

let dbPromise = null;

export const openIDB = () => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
};

/**
 * جلب قيمة من IndexedDB
 */
export const idbGet = async (key, fallback = null) => {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        resolve(req.result !== undefined ? req.result : fallback);
      };
      req.onerror = () => {
        console.warn(`[IndexedDB] Error reading key "${key}":`, req.error);
        resolve(fallback);
      };
    });
  } catch (err) {
    console.warn(`[IndexedDB] Failed to get key "${key}":`, err?.message);
    return fallback;
  }
};

/**
 * حفظ قيمة في IndexedDB (يدعم الكائنات والمصفوفات مباشرة بدون JSON.stringify)
 */
export const idbSet = async (key, value) => {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);

      req.onsuccess = () => resolve(true);
      req.onerror = () => {
        console.warn(`[IndexedDB] Error setting key "${key}":`, req.error);
        reject(req.error);
      };
    });
  } catch (err) {
    console.warn(`[IndexedDB] Failed to set key "${key}":`, err?.message);
    return false;
  }
};

/**
 * حذف مفتاح من IndexedDB
 */
export const idbRemove = async (key) => {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    return false;
  }
};

/**
 * جلب جميع المفاتيح المحفوظة
 */
export const idbGetAllKeys = async () => {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
};

/**
 * حفظ آمن في localStorage يتفادى QuotaExceededError ولا يُوقف عمل النظام إطلاقاً
 */
export const safeLocalStorageSet = (key, value) => {
  try {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, str);
    return true;
  } catch (e) {
    // خطأ تجاوز الحصة الشائع في المتصفحات
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
      console.warn(`[Storage] LocalStorage quota reached for "${key}". Relying on IndexedDB storage.`);
    } else {
      console.warn(`[Storage] Failed to save "${key}" to LocalStorage:`, e?.message);
    }
    return false;
  }
};

/**
 * ترحيل تلقائي وسلس من localStorage إلى IndexedDB لمرة واحدة
 */
export const migrateLocalStorageToIndexedDB = async () => {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const isMigrated = await idbGet('__pos_migrated_from_ls__', false);
    if (isMigrated) return;

    console.info('[Storage] Migrating legacy LocalStorage keys to IndexedDB...');
    const keysToMigrate = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('naif_pos_') || key.startsWith('naif_local_') || key.startsWith('naif_latest_'))) {
        keysToMigrate.push(key);
      }
    }

    for (const rawKey of keysToMigrate) {
      try {
        const rawVal = localStorage.getItem(rawKey);
        if (rawVal !== null) {
          let parsed;
          try {
            parsed = JSON.parse(rawVal);
          } catch {
            parsed = rawVal;
          }
          await idbSet(rawKey, parsed);
        }
      } catch (err) {
        console.warn(`[Storage] Could not migrate key: ${rawKey}`, err?.message);
      }
    }

    await idbSet('__pos_migrated_from_ls__', true);
    console.info(`[Storage] Successfully migrated ${keysToMigrate.length} items to IndexedDB.`);
  } catch (err) {
    console.warn('[Storage] Migration warning:', err?.message);
  }
};

/**
 * قراءة إحصائيات سعة التخزين الحالية (المستخدمة والمتبقية)
 */
export const getStorageUsageEstimate = async () => {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usageMB = (estimate.usage / (1024 * 1024)).toFixed(2);
      const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(0);
      const percent = estimate.quota ? ((estimate.usage / estimate.quota) * 100).toFixed(1) : '0';
      return {
        supported: true,
        usageMB: Number(usageMB),
        quotaMB: Number(quotaMB),
        percent: Number(percent)
      };
    } catch {
      // ignore
    }
  }
  return { supported: false, usageMB: 0, quotaMB: 0, percent: 0 };
};
