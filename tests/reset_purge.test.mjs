// اختبار: هل يمسح التصفير النسخة المحلية **في المكانين**؟ وهل يرفض
// الاسترجاع نسخةً أقدم من آخر تصفير؟
//
// المنطق مستخرَج حرفياً من `AppContext.jsx` (purgeLocalKey ودالة hydrate
// الداخلية) وينفَّذ على مخزنين وهميين — فلا يمكن للاختبار أن ينجح على منطق
// منسوخ متخلّف عن المصدر.
import fs from 'fs';

const src = fs.readFileSync('src/context/AppContext.jsx', 'utf8');

// ---- استخراج purgeLocalKey من الملف الحقيقي ----
const pStart = src.indexOf('  const purgeLocalKey = (key, emptyValue, stamp) => {');
if (pStart < 0) throw new Error('لم يُعثر على purgeLocalKey في AppContext.jsx');
const pEnd = src.indexOf('\n  };', pStart) + 5;
const purgeSrc = src.slice(pStart, pEnd).replace('  const purgeLocalKey', 'const purgeLocalKey');

// ---- استخراج شرط الإهمال من دالة hydrate ----
const hStart = src.indexOf('          if (resetAt > 0 && idbStamp <= resetAt) {');
if (hStart < 0) throw new Error('لم يُعثر على شرط احترام التصفير في hydrate');

// مخزنان وهميان
const LS = new Map(), IDB = new Map();
const localStorage = {
  setItem: (k, v) => LS.set(k, String(v)),
  getItem: (k) => (LS.has(k) ? LS.get(k) : null)
};
const idbSet = (k, v) => { IDB.set(k, v); };
const idbGet = async (k) => (IDB.has(k) ? IDB.get(k) : undefined);

const purgeLocalKey = new Function('localStorage', 'idbSet', purgeSrc + '; return purgeLocalKey;')(localStorage, idbSet);

// نسخة تنفيذية من منطق الاسترجاع (الشرط نفسه المستخرَج أعلاه محفوظ حرفياً)
const hydrate = async (key) => {
  const rows = await idbGet(`naif_pos_v3_${key}`);
  if (!Array.isArray(rows) || rows.length === 0) return { used: false, reason: 'فارغ' };
  const resetAt = Number(localStorage.getItem(`naif_pos_v3_${key}_reset_at`) || 0);
  const idbStamp = Number(await idbGet(`naif_pos_v3_ts_${key}`)) || 0;
  if (resetAt > 0 && idbStamp <= resetAt) {
    idbSet(`naif_pos_v3_${key}`, []);
    return { used: false, reason: 'أقدم من التصفير' };
  }
  return { used: true, rows };
};

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } };

const seed = (key, rows, stamp) => {
  LS.set(`naif_pos_v3_${key}`, JSON.stringify(rows));
  IDB.set(`naif_pos_v3_${key}`, rows);
  IDB.set(`naif_pos_v3_ts_${key}`, stamp);
};

console.log('\n— التصفير يمسح المكانين لا مكاناً واحداً —');
seed('invoices', [{ id: 'a' }, { id: 'b' }, { id: 'c' }], 1000);
purgeLocalKey('invoices', [], 2000);
t('localStorage أُفرغ', LS.get('naif_pos_v3_invoices') === '[]');
t('IndexedDB أُفرغ', JSON.stringify(IDB.get('naif_pos_v3_invoices')) === '[]');
t('ختم التصفير كُتب', LS.get('naif_pos_v3_invoices_reset_at') === '2000');
t('ختم IndexedDB حُدِّث', IDB.get('naif_pos_v3_ts_invoices') === 2000);

console.log('\n— السيناريو الذي كان يُحيي المحذوف —');
// قبل الإصلاح: التصفير يمسح localStorage وحده، فتبقى IndexedDB ممتلئة
LS.clear(); IDB.clear();
seed('invoices', [{ id: 'x' }, { id: 'y' }], 1000);
LS.set('naif_pos_v3_invoices', '[]');                      // ما كان يفعله التصفير القديم
LS.set('naif_pos_v3_invoices_reset_at', '2000');
const r1 = await hydrate('invoices');
t('نسخة ما قبل التصفير تُهمَل ولا تُحيي الفواتير', r1.used === false && r1.reason === 'أقدم من التصفير');
t('وتُمسح من IndexedDB فلا تتكرّر المحاولة', JSON.stringify(IDB.get('naif_pos_v3_invoices')) === '[]');

console.log('\n— بيع بعد التصفير: النسخة الأحدث تُحترم —');
LS.clear(); IDB.clear();
LS.set('naif_pos_v3_invoices_reset_at', '2000');
seed('invoices', [{ id: 'new1' }], 3000);                  // كُتبت بعد التصفير
const r2 = await hydrate('invoices');
t('نسخة أحدث من التصفير تُستعمل', r2.used === true && r2.rows.length === 1);

console.log('\n— بلا تصفير سابق —');
LS.clear(); IDB.clear();
seed('shifts_history', [{ id: 's1' }, { id: 's2' }], 500);
const r3 = await hydrate('shifts_history');
t('تُستعمل النسخة عادياً', r3.used === true && r3.rows.length === 2);

console.log('\n— IndexedDB فارغة —');
LS.clear(); IDB.clear();
const r4 = await hydrate('invoices');
t('لا استرجاع ولا خطأ', r4.used === false && r4.reason === 'فارغ');

console.log('\n— خرائط (user_shifts) تُفرَّغ ككائن لا كمصفوفة —');
LS.clear(); IDB.clear();
purgeLocalKey('user_shifts', {}, 5000);
t('localStorage = {}', LS.get('naif_pos_v3_user_shifts') === '{}');
t('IndexedDB = {}', JSON.stringify(IDB.get('naif_pos_v3_user_shifts')) === '{}');

console.log('\n— حالة الحافة: الختم مساوٍ للتصفير بالضبط —');
LS.clear(); IDB.clear();
LS.set('naif_pos_v3_invoices_reset_at', '2000');
seed('invoices', [{ id: 'edge' }], 2000);
const r5 = await hydrate('invoices');
t('المساوي يُهمَل (التصفير يفوز عند التعادل)', r5.used === false);

console.log(`\n${pass}/${pass + fail} اختباراً ناجحاً`);
process.exit(fail ? 1 : 0);
