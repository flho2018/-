// =========================================================================
//  اختبار ترحيل الرصيد بين الورديات — «آخر وردية مغلقة» يجب أن تكون الأخيرة
// =========================================================================
//  العطل الذي يحرسه هذا الملف وقع في المتجر فعلاً: كاشيرة أغلقت ثلاث ورديات
//  في يوم واحد (‎18:33 بنقد ٥٠، ثم ‎18:37 بنقد ٥٠، ثم ‎18:38 بنقد ١٠٠)،
//  وعند فتح الوردية التالية بدأ الرصيد المرحَّل بـ **٥٠** بدل **١٠٠**.
//
//  السبب: `lastUserClosedShift` كانت مكتوبة **ثلاث مرات حرفياً**
//  (PosRegister، ShiftHeaderModal، CurrentShiftDrawerTab) بصيغة
//  `(shiftsHistory||[]).find(...)` — أي **أول عنصر مطابق في المصفوفة**، لا
//  آخر وردية زمنياً. وترتيب المصفوفة بعد المزامنة **الأقدم أولاً** (تفصيل
//  السبب في تعليق findLastClosedShift داخل useShiftMetrics.js).
//
//  النمط: استخراج الدالة المشتركة حرفياً من مصدرها ثم تنفيذها (§9)، فلا
//  يمكن للاختبار أن ينجح على منطق منسوخ متخلّف عن المصدر.
// =========================================================================
import fs from 'fs';

let pass = 0, fail = 0;
const t = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
};

// ---------------------------------------------------------------------
//  ١. الدالة المشتركة — مستخرَجة حرفياً من useShiftMetrics.js
// ---------------------------------------------------------------------
const metricsSrc = fs.readFileSync('src/utils/useShiftMetrics.js', 'utf8');
const fnStart = metricsSrc.indexOf('export const findLastClosedShift =');
if (fnStart < 0) throw new Error('findLastClosedShift غير موجودة في useShiftMetrics.js');
const fnEnd = metricsSrc.indexOf('\nexport ', fnStart + 10);
const fnSrc = metricsSrc
  .slice(fnStart, fnEnd > -1 ? fnEnd : metricsSrc.length)
  .replace('export const', 'const')
  .trimEnd();
// السطر الجديد إلزامي: النصّ المقتطع قد ينتهي بتعليق `//` فيبتلع ما بعده على نفس السطر
const findLastClosedShift = new Function(fnSrc + '\nreturn findLastClosedShift;')();

// ---------------------------------------------------------------------
//  بيانات الحالة الحقيقية التي وقعت في المتجر (2026-09-16)
// ---------------------------------------------------------------------
const FATIMA = { id: 'user-1788635756843', name: 'فاطمة' };
const mk = (closedAt, actualCash, extra = {}) => ({
  id: `shift-${closedAt}`,
  userId: 'user-1788635756843',
  cashierId: 'user-1788635756843',
  cashierName: 'فاطمة',
  status: 'closed',
  closedAt,
  actualCash,
  ...extra,
});
const s1833 = mk('2026-09-16T18:33:21.175Z', 50);
const s1837 = mk('2026-09-16T18:37:10.958Z', 50);
const s1838 = mk('2026-09-16T18:38:44.598Z', 100);   // الأخيرة فعلاً

console.log('\n— الحالة الحقيقية: ثلاث ورديات لنفس الكاشيرة —');
t('الترتيب الأقدم أولاً (كما يعود من السحابة) ← ١٠٠',
  findLastClosedShift([s1833, s1837, s1838], FATIMA)?.actualCash === 100,
  `رجع ${findLastClosedShift([s1833, s1837, s1838], FATIMA)?.actualCash}`);
t('الترتيب الأحدث أولاً (كما يكتبه closeShift محلياً) ← ١٠٠',
  findLastClosedShift([s1838, s1837, s1833], FATIMA)?.actualCash === 100);
t('ترتيب مبعثر ← ١٠٠',
  findLastClosedShift([s1837, s1833, s1838], FATIMA)?.actualCash === 100);

console.log('\n— عزل الكاشيرين —');
const zameela = {
  id: 'shift-other', userId: 'user-9', cashierId: 'user-9',
  cashierName: 'فاطمة',            // زميلة تحمل نفس الاسم المعروض
  status: 'closed', closedAt: '2026-09-16T23:00:00.000Z', actualCash: 777,
};
t('لا يلتقط وردية زميلة بنفس الاسم رغم أنها أحدث',
  findLastClosedShift([zameela, s1838], FATIMA)?.actualCash === 100,
  `رجع ${findLastClosedShift([zameela, s1838], FATIMA)?.actualCash}`);
t('سجل قديم بلا أي معرّف يُطابَق بالاسم (توافق خلفي)',
  findLastClosedShift([{ cashierName: 'فاطمة', status: 'closed', closedAt: '2026-09-16T19:00:00.000Z', actualCash: 33 }], FATIMA)?.actualCash === 33);
t('سجل بمعرّف مختلف لا يُطابَق بالاسم ولو كان وحده',
  findLastClosedShift([zameela], FATIMA) === null);

console.log('\n— حالات حافة —');
t('لا ورديات ← null', findLastClosedShift([], FATIMA) === null);
t('مصفوفة غير معرّفة ← null', findLastClosedShift(undefined, FATIMA) === null);
t('وردية مفتوحة لا تُحتسب', findLastClosedShift([{ ...s1838, status: 'open' }], FATIMA) === null);
t('عنصر فارغ في المصفوفة لا يرمي', findLastClosedShift([null, s1838, undefined], FATIMA)?.actualCash === 100);
t('بلا closedAt يسقط على updatedAt',
  findLastClosedShift([
    { ...s1833, closedAt: undefined, updatedAt: '2026-09-16T20:00:00.000Z', actualCash: 11 },
    { ...s1838, closedAt: undefined, updatedAt: '2026-09-16T19:00:00.000Z', actualCash: 22 },
  ], FATIMA)?.actualCash === 11);
t('بلا مستخدم يسقط على admin', findLastClosedShift([
  { id: 'a', userId: 'admin', status: 'closed', closedAt: '2026-09-16T10:00:00.000Z', actualCash: 5 },
], null)?.actualCash === 5);

// ---------------------------------------------------------------------
//  ٢. حارس ارتداد: الشاشات الثلاث تستعمل الدالة المشتركة ولا تعيد كتابتها
// ---------------------------------------------------------------------
console.log('\n— الشاشات الثلاث تستعمل المصدر الواحد —');
const SCREENS = [
  'src/components/pos/PosRegister.jsx',
  'src/components/cashier/ShiftHeaderModal.jsx',
  'src/components/cashier/tabs/CurrentShiftDrawerTab.jsx',
];
for (const file of SCREENS) {
  const src = fs.readFileSync(file, 'utf8');
  const short = file.split('/').pop();
  t(`${short}: يستورد findLastClosedShift`,
    /import\s*\{[^}]*\bfindLastClosedShift\b[^}]*\}\s*from\s*['"][^'"]*useShiftMetrics['"]/.test(src));
  t(`${short}: يستدعيها لبناء lastUserClosedShift`,
    /lastUserClosedShift\s*=\s*(React\.)?useMemo\(\s*\(\)\s*=>\s*findLastClosedShift\(/.test(src));
  // الارتداد الذي نخشاه: عودة `.find()` بلا فرز زمني
  t(`${short}: لا نسخة محلية بـ .find() بلا فرز`,
    !/shiftsHistory\s*\|\|\s*\[\]\)\.find\(/.test(src));
}

console.log(`\n${'='.repeat(52)}`);
console.log(`النتيجة: ${pass} ناجح · ${fail} فاشل`);
console.log('='.repeat(52));
process.exit(fail > 0 ? 1 : 0);
