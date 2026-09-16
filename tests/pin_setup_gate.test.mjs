// اختبار بوابة تهيئة رقم الدخول — يستخرج منطق pinSetupTarget من AppContext
// الحقيقي حرفياً بدل إعادة كتابته، فلا يمكن للاختبار أن ينجح على منطق وهمي.
import fs from 'fs';

const src = fs.readFileSync('src/context/AppContext.jsx', 'utf8');
const start = src.indexOf('  const pinSetupTarget = useMemo(() => {');
const end = src.indexOf('  }, [users, firebaseUser]);', start);
if (start < 0 || end < 0) throw new Error('لم يُعثر على pinSetupTarget في AppContext.jsx');
const body = src.slice(src.indexOf('{', start + 30) + 1, end);

const isHashedPin = (h) => typeof h === 'string' && h.length > 20;
const AUTH = { 'fl.ho2018@gmail.com': { role: 'admin' }, 'f3@flower-house.com': { role: 'cashier' } };
const getRoleByEmail = (e) => (e ? AUTH[String(e).trim().toLowerCase()] || null : null);
const pinSetupTarget = new Function('users', 'firebaseUser', 'isHashedPin', 'getRoleByEmail', body);
const run = (users, email) => pinSetupTarget(users, email ? { email } : null, isHashedPin, getRoleByEmail);

const HASH = 'x'.repeat(64);
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } };

console.log('\n— تثبيت نظيف: لا أحد يملك تجزئة —');
t('يُستهدف صاحب دور admin', run([{ id: 'a', role: 'cashier' }, { id: 'b', role: 'admin' }], null)?.id === 'b');
t('بلا admin يُستهدف أول مفعّل', run([{ id: 'a', role: 'cashier' }], null)?.id === 'a');
t('يعمل بلا حساب Firebase معروف', !!run([{ id: 'b', role: 'admin' }], 'f3@flower-house.com'));

console.log('\n— المدير وحده بلا رقم (حالة المتجر الحقيقية) —');
const store = [
  { id: 'u-naif', role: 'supervisor', pinHash: HASH },
  { id: 'user-2', role: 'admin' },
  { id: 'user-1', role: 'cashier', pinHash: HASH }
];
t('تُفتح لبريد المدير في Firebase', run(store, 'fl.ho2018@gmail.com')?.id === 'user-2');
t('تُمنع على جهاز كاشير — لا تصعيد صلاحيات', run(store, 'f3@flower-house.com') === null);
t('تُمنع على بريد مجهول', run(store, 'stranger@x.com') === null);
t('تُمنع بلا تسجيل دخول', run(store, null) === null);

console.log('\n— لا تمسّ رقماً قائماً أبداً —');
t('المدير يملك تجزئة ← لا شاشة', run([{ id: 'user-2', role: 'admin', pinHash: HASH }], 'fl.ho2018@gmail.com') === null);
t('الجميع يملك ← لا شاشة', run(store.map(u => ({ ...u, pinHash: HASH })), 'fl.ho2018@gmail.com') === null);

console.log('\n— المعطّل لا يُحتسب —');
t('مدير معطّل لا يُستهدف', run([{ id: 'u', role: 'supervisor', pinHash: HASH }, { id: 'user-2', role: 'admin', isActive: false }], 'fl.ho2018@gmail.com') === null);
t('تجزئة معطّل لا تُعدّ وجوداً', run([{ id: 'x', role: 'cashier', pinHash: HASH, isActive: false }, { id: 'user-2', role: 'admin' }], null)?.id === 'user-2');

console.log('\n— حالات فارغة —');
t('لا مستخدمين ← لا شاشة', run([], 'fl.ho2018@gmail.com') === null);

console.log(`\n${pass}/${pass + fail} اختباراً ناجحاً`);
process.exit(fail ? 1 : 0);
