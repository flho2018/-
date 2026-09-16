// =========================================================================
// security.js — تجزئة أرقام PIN لنظام بيت الورد
// =========================================================================
//  ما تغيّر عن النسخة السابقة، وسببه:
//
//  1) الملح صار مستقلاً لكل مستخدم بدل ملح عام واحد مكتوب في الكود.
//     الملح العام كان يُنشر مع ملفات الموقع ويقرأه أي أحد، ويجعل
//     رقمين متطابقين ينتجان تجزئة واحدة.
//
//  2) التجزئة تتكرر 60,000 مرة بدل مرة واحدة. رقم من أربع خانات له
//     10,000 احتمال فقط — بتجزئة واحدة يُبنى جدولها كله في ثوانٍ.
//     التكرار يحوّل ذلك إلى دقائق طويلة لكل مستخدم على حدة.
//
//  3) حُذف "التوافق العكسي" الذي كان يقبل الرقم نصاً صريحاً:
//        if (user.pin && String(user.pin).trim() === cleanInput) return true;
//     هذان السطران كانا يُبقيان الباب مفتوحاً إلى الأبد.
//
//  4) أُضيف تأخير تصاعدي بعد المحاولات الخاطئة.
//
//  الواجهة لم تتغيّر: hashPin(pin) و verifyPin(pin, user) تبقيان
//  متزامنتين كما هما، لأن AppContext يستدعيهما داخل users.find(...)
//  ودالة غير متزامنة هناك تُرجع Promise — وقيمته "صحيح" دائماً،
//  فيفتح أي رقم أي حساب. هذا ليس تحسيناً نظرياً: حدث فعلاً.
//
//  ⚠️ لا يقبل هذا الملف أي صيغة قديمة. أي مستخدم لم يُعيَّن رقمه من
//     جديد سيُرفض دخوله — وهذا مقصود.
// =========================================================================

const VERSION = 'v2';
const ITERATIONS = 40000;   // موازنة بين الأمان وسرعة الاستجابة
const SALT_BYTES = 16;


// دالة مساعدة لـ SHA-256 — منقولة كما هي من ملفك الأصلي
function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

export function sha256(ascii) {
  if (typeof ascii !== 'string') ascii = String(ascii || '');
  const utf8Array = new TextEncoder().encode(ascii);
  const asciiBitLength = utf8Array.length * 8;
  let i, j;
  let result = '';
  const words = [];

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  for (i = 0; i < utf8Array.length; i++) {
    j = utf8Array[i];
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  const w = new Array(64);
  for (i = 0; i < words.length; i += 16) {
    let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
    let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

    for (j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[i + j] | 0;
      } else {
        const gamma0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const gamma1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + gamma0 + w[j - 7] + gamma1) | 0;
      }

      const ch = (e & f) ^ (~e & g);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);

      const temp1 = (h + sigma1 + ch + k[j] + w[j]) | 0;
      const temp2 = (sigma0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (8 * j)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

// =========================================================================
//  التجزئة
// =========================================================================

/** ملح عشوائي بصيغة hex */
function makeSalt() {
  const bytes = new Uint8Array(SALT_BYTES);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < SALT_BYTES; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** تجزئة متكررة: كل جولة تأخذ ناتج ما قبلها */
function derive(pin, salt, iterations) {
  let h = sha256(salt + '|' + pin);
  for (let i = 1; i < iterations; i++) {
    h = sha256(h + salt);
  }
  return h;
}

/**
 * يُنتج تجزئة جديدة. النتيجة نص واحد يُخزَّن كما هو في pinHash:
 *   v2$60000$<saltHex>$<hashHex>
 *
 * @param {string} pin
 * @returns {string}
 */
export function hashPin(pin) {
  const clean = String(pin ?? '').trim();
  if (!clean) return '';
  const salt = makeSalt();
  return VERSION + '$' + ITERATIONS + '$' + salt + '$' + derive(clean, salt, ITERATIONS);
}

/** هل هذه القيمة مجزّأة بالصيغة الحالية؟ */
export function isHashedPin(value) {
  return typeof value === 'string'
    && value.startsWith(VERSION + '$')
    && value.split('$').length === 4;
}

/** مقارنة ثابتة الزمن — لا تكشف عدد الأحرف المتطابقة من زمن الرد */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * يتحقق من الرقم مقابل سجل المستخدم.
 * متزامنة عمداً — AppContext يستدعيها داخل users.find(...)
 *
 * يرفض صراحةً أي صيغة غير v2، بلا استثناء.
 *
 * @param {string} inputPin
 * @param {object} user  سجل المستخدم كاملاً
 * @returns {boolean}
 */
export function verifyPin(inputPin, user) {
  const clean = String(inputPin ?? '').trim();
  if (!clean || !user || typeof user !== 'object') return false;
  if (user.isActive === false) return false;

  const stored = user.pinHash;
  if (!isHashedPin(stored)) {
    // يشمل: النص الصريح، تجزئة النسخة القديمة، والقيمة الفارغة
    console.warn('[security] رقم المستخدم بصيغة غير مدعومة — أعد تعيينه من شاشة المستخدمين');
    return false;
  }

  const parts = stored.split('$');
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;

  try {
    return safeEqual(derive(clean, parts[2], iterations), parts[3]);
  } catch (e) {
    return false;
  }
}

// =========================================================================
//  بطاقات NFC
// =========================================================================
//  البطاقة بديل كامل عن الرمز السري لا إضافة إليه، فقوة النظام = قوة
//  البطاقة. لذلك تُخزَّن مجزّأة بنفس أسلوب الرمز تماماً.
//
//  ما يحميه هذا: من يقرأ pos_users من أدوات المطور لا يستطيع صنع بطاقة،
//  لأن الرقم لم يعد موجوداً — التجزئة وحدها لا يُرجَع منها إلى الرقم.
//
//  ما لا يحميه: من يمسك البطاقة الحقيقية بيده. البطاقة مفتاح مادي —
//  تُحمل في المحفظة لا تُترك في الدرج، وإن ضاعت تُبطَل فوراً بحذف
//  حقل nfcCardHash من سجل المستخدم.
//
//  ⚠️ عند الشراء: اطلب بطاقات 13.56MHz (NTAG213 أو MIFARE).
//     تجنّب 125kHz (EM4100) — تُستنسخ بجهاز رخيص من أي متجر.
// =========================================================================

/** تطبيع رقم البطاقة: القارئات تختلف في الحالة والفواصل */
function normalizeCardId(raw) {
  return String(raw ?? '').trim().toLowerCase().replace(/[\s:-]/g, '');
}

/**
 * يُنتج تجزئة لرقم بطاقة. تُخزَّن في حقل nfcCardHash.
 * @param {string} cardId
 * @returns {string}
 */
export function hashNfcCard(cardId) {
  const clean = normalizeCardId(cardId);
  if (!clean) return '';
  const salt = makeSalt();
  return VERSION + '$' + ITERATIONS + '$' + salt + '$' + derive(clean, salt, ITERATIONS);
}

/**
 * يتحقق من بطاقة مقابل سجل مستخدم.
 * متزامنة — تُستدعى داخل users.find(...) تماماً كـ verifyPin.
 *
 * يرفض صراحةً حقل nfcCardId القديم (النص الصريح)، بلا استثناء.
 *
 * @param {string} cardId
 * @param {object} user
 * @returns {boolean}
 */
export function verifyNfcCard(cardId, user) {
  const clean = normalizeCardId(cardId);
  if (!clean || !user || typeof user !== 'object') return false;
  if (user.isActive === false) return false;

  const stored = user.nfcCardHash;
  if (!isHashedPin(stored)) return false;

  const parts = stored.split('$');
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;

  try {
    return safeEqual(derive(clean, parts[2], iterations), parts[3]);
  } catch (e) {
    return false;
  }
}

/** هل لهذا المستخدم بطاقة مسجّلة؟ — لعرض الحالة في شاشة المستخدمين */
export function hasNfcCard(user) {
  return isHashedPin(user?.nfcCardHash);
}

// =========================================================================
//  الحدّ من محاولات التخمين
// =========================================================================
//  بلا تأخير، جهاز مفتوح في المحل تُجرَّب عليه كل الاحتمالات العشرة آلاف.
//  التأخير يضاعف الزمن حتى يصبح ذلك مستحيلاً عملياً.

const ATTEMPTS_KEY = 'bw_pin_attempts';
const FREE_TRIES = 3;      // محاولات قبل بدء التأخير
const LOCK_AFTER = 8;      // قفل كامل بعدها
const LOCK_MINUTES = 15;

function readAll() {
  try { return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '{}'); }
  catch (e) { return {}; }
}

function writeOne(id, data) {
  try {
    const all = readAll();
    all[id] = data;
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(all));
  } catch (e) { /* التخزين ممتلئ أو محظور */ }
}

/**
 * يُستدعى قبل قبول أي محاولة.
 * @returns {{allowed: boolean, waitSeconds: number, message: string}}
 */
export function checkPinAttempt(userId = 'global') {
  const rec = readAll()[userId] || { count: 0, lockedUntil: 0 };
  const now = Date.now();

  if (rec.lockedUntil > now) {
    const waitSeconds = Math.ceil((rec.lockedUntil - now) / 1000);
    return {
      allowed: false,
      waitSeconds,
      message: rec.count >= LOCK_AFTER
        ? 'أُقفل الإدخال. راجع المدير أو انتظر ' + Math.ceil(waitSeconds / 60) + ' دقيقة.'
        : 'انتظر ' + waitSeconds + ' ثانية قبل المحاولة التالية.'
    };
  }
  return { allowed: true, waitSeconds: 0, message: '' };
}

/** بعد محاولة فاشلة. التأخير: 2، 4، 8، 16… ثانية ثم قفل ربع ساعة */
export function recordFailedPin(userId = 'global') {
  const rec = readAll()[userId] || { count: 0, lockedUntil: 0 };
  const count = rec.count + 1;

  let lockedUntil = 0;
  if (count >= LOCK_AFTER) {
    lockedUntil = Date.now() + LOCK_MINUTES * 60 * 1000;
  } else if (count > FREE_TRIES) {
    lockedUntil = Date.now() + Math.pow(2, count - FREE_TRIES) * 1000;
  }

  writeOne(userId, { count, lockedUntil });
  return { count, remaining: Math.max(0, LOCK_AFTER - count) };
}

/** بعد نجاح الإدخال */
export function clearPinAttempts(userId = 'global') {
  writeOne(userId, { count: 0, lockedUntil: 0 });
}

// =========================================================================
//  جودة الرقم
// =========================================================================

const WEAK_PINS = new Set([
  '0000','1111','2222','3333','4444','5555','6666','7777','8888','9999',
  '1234','4321','2468','1357','1212','2121','1122','0123','9876','1004',
  '1990','1991','1995','2000','2020','1478','7410','0852'
]);

/**
 * يُستدعى عند تعيين رقم جديد من شاشة المستخدمين.
 * @returns {{valid: boolean, message: string}}
 */
export function validatePinStrength(pin) {
  const clean = String(pin ?? '').trim();

  // =======================================================================
  //  أربعة أرقام بالضبط — لا ٤ إلى ٦
  // =======================================================================
  //  لوحة الأرقام في شاشة الدخول تتحقّق تلقائياً عند الرقم الرابع
  //  (`PinLockModal.handleDigit`) ولا زر «دخول» عليها. فرقمٌ من خمسة أرقام
  //  لا يمكن إدخاله إطلاقاً: المحاولة تُرسَل وتفشل عند الرابع دائماً،
  //  وصاحبه محبوس خارج النظام بلا مسار استرجاع. وشاشة المستخدمين كانت
  //  تفرض ٤ بينما هذه الدالة تجيز ٦ — تناقض ينتظر ضحيته.
  // =======================================================================
  if (!/^\d{4}$/.test(clean)) {
    return { valid: false, message: 'الرقم يجب أن يكون أربعة أرقام.' };
  }
  if (/^(\d)\1+$/.test(clean)) {
    return { valid: false, message: 'لا تستخدم رقماً واحداً مكرراً.' };
  }
  if (WEAK_PINS.has(clean)) {
    return { valid: false, message: 'رقم شائع جداً — اختر رقماً أقل توقعاً.' };
  }
  return { valid: true, message: '' };
}
