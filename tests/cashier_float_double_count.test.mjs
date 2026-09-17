// =========================================================================
//  اختبار: «عهدة الكاشير» لا تحسب النقد الواحد مرتين
// =========================================================================
//  العرَض الذي وقع في المتجر (2026-09-17): كاشيرة فتحت وردية بصفر وباعت
//  ٢٧٥ نقداً على أربع ورديات متتابعة، ولم يُسحب منها شيء (صفر حركات درج،
//  ودفتر الخزينة فارغ). النقد الحقيقي في الدرج **٢٧٥** — وعرضت شاشة
//  الخزينة **٤٧٥**.
//
//  السبب: الوردية تُغلق فتبقى `handoverStatus: 'pending'` بكامل نقدها،
//  ثم يفتح الكاشير وردية جديدة **بنفس النقد** رصيداً افتتاحياً. فيصير على
//  المال الواحد مُطالبتان: واحدة في مجموع المعلّقات وأخرى داخل `startCash`،
//  و`cashierTotalCash` يجمعهما.
//
//  يستخرج هذا الملف `effectivePendingOf` حرفياً من AppContext.jsx وينفّذه
//  على **بيانات المتجر الحقيقية**، فلا يمكن أن ينجح على منطق منسوخ.
// =========================================================================
import fs from 'fs';

// الدالة المشتركة مستخرَجة حرفياً من مصدرها الوحيد
const metricsSrc = fs.readFileSync('src/utils/useShiftMetrics.js', 'utf8');
const effStart = metricsSrc.indexOf('export const effectivePendingHandover =');
if (effStart < 0) throw new Error('effectivePendingHandover غير موجودة في useShiftMetrics.js');
const effEnd = metricsSrc.indexOf('\nexport ', effStart + 10);
const effSrc = metricsSrc
  .slice(effStart, effEnd > -1 ? effEnd : metricsSrc.length)
  .replace('export const', 'const')
  .trimEnd();
// السطر الجديد إلزامي: النصّ المقتطع قد ينتهي بتعليق `//` فيبتلع ما بعده على نفس السطر
const effectivePendingHandover =
  new Function(`${effSrc}\nreturn effectivePendingHandover;`)();

const build = (allUserShifts) => (s) => effectivePendingHandover(s, allUserShifts);

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = Math.abs(Number(got) - Number(want)) < 0.005;
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} — توقّعنا ${want} وجاء ${got}`); }
};

// ---------------------------------------------------------------------
//  بيانات المتجر الحقيقية — فاطمة، 2026-09-17
// ---------------------------------------------------------------------
const U = 'user-1788635756843';
const sh = (id, openedAt, closedAt, startCash, actualCash) => ({
  id, userId: U, cashierId: U, cashierName: 'فاطمة',
  status: closedAt ? 'closed' : 'open', isOpen: !closedAt,
  openedAt, closedAt, startCash,
  ...(closedAt ? { actualCash, handoverAmount: actualCash, handoverStatus: 'pending' } : {}),
});

const s1 = sh('s1', '2026-09-17T02:46:01Z', '2026-09-17T02:49:12Z', 0, 50);
const s2 = sh('s2', '2026-09-17T02:50:11Z', '2026-09-17T02:51:08Z', 50, 50);
const s3 = sh('s3', '2026-09-17T02:52:26Z', '2026-09-17T02:52:55Z', 50, 100);
const s4 = sh('s4', '2026-09-17T03:01:15Z', null, 100, null);   // مفتوحة الآن
const REAL = [s1, s2, s3, s4];

console.log('\n— الحالة الحقيقية: ثلاث ورديات رُحّل نقدها والرابعة مفتوحة —');
{
  const eff = build(REAL);
  t('وردية ٠٢:٤٩ (٥٠) رُحّلت كاملةً ← ٠', eff(s1), 0);
  t('وردية ٠٢:٥١ (٥٠) رُحّلت كاملةً ← ٠', eff(s2), 0);
  t('وردية ٠٢:٥٢ (١٠٠) رُحّلت كاملةً ← ٠', eff(s3), 0);
  const total = [s1, s2, s3].reduce((n, s) => n + eff(s), 0);
  t('مجموع المعلّقات ← ٠ (كان ٢٠٠)', total, 0);
  // النقد الحقيقي = درج الوردية المفتوحة وحدها
  t('عهدة الكاشير = ٠ معلّق + ٢٧٥ درج ← ٢٧٥ (كان ٤٧٥)', total + (100 + 175), 275);
}

console.log('\n— الترحيل الجزئي: الباقي يبقى معلّقاً بحقّه —');
{
  const a = sh('a', '2026-09-17T08:00:00Z', '2026-09-17T09:00:00Z', 0, 300);
  const b = sh('b', '2026-09-17T09:30:00Z', null, 100, null);   // رُحّل ١٠٠ فقط
  const eff = build([a, b]);
  t('٣٠٠ معلّقة ورُحّل ١٠٠ ← يبقى ٢٠٠', eff(a), 200);
}

console.log('\n— ما يجب ألّا يُسقَط —');
{
  // وردية أُغلقت ولم تُفتح بعدها وردية: النقد ما زال بذمة الكاشير
  const a = sh('a', '2026-09-17T08:00:00Z', '2026-09-17T09:00:00Z', 0, 120);
  t('لا وردية تالية ← يبقى كامل المبلغ معلّقاً', build([a])(a), 120);
}
{
  // الوردية التالية بدأت بصفر: الكاشير سلّم النقد فعلاً
  const a = sh('a', '2026-09-17T08:00:00Z', '2026-09-17T09:00:00Z', 0, 120);
  const b = sh('b', '2026-09-17T10:00:00Z', null, 0, null);
  t('الوردية التالية بدأت بصفر ← يبقى ١٢٠ معلّقاً', build([a, b])(a), 120);
}
{
  // وردية كاشير آخر لا تُسقط معلّقات غيره
  const a = sh('a', '2026-09-17T08:00:00Z', '2026-09-17T09:00:00Z', 0, 120);
  const other = { id: 'x', userId: 'user-9', cashierId: 'user-9', isOpen: true, openedAt: '2026-09-17T09:30:00Z', startCash: 500 };
  t('وردية كاشير آخر لا تُسقط المعلّق', build([a, other])(a), 120);
}
{
  // وردية فُتحت **قبل** الإغلاق لا تُعدّ ترحيلاً
  const a = sh('a', '2026-09-17T08:00:00Z', '2026-09-17T12:00:00Z', 0, 120);
  const earlier = sh('e', '2026-09-17T07:00:00Z', '2026-09-17T07:30:00Z', 90, 90);
  t('وردية أقدم لا تُعدّ ترحيلاً', build([a, earlier])(a), 120);
}
{
  // مبلغ صفري لا يُحتسب أصلاً
  const a = sh('a', '2026-09-17T08:00:00Z', '2026-09-17T09:00:00Z', 0, 0);
  t('نقد صفر ← ٠', build([a])(a), 0);
}
{
  // ختم rolled_over الصريح من openNewShift: القيمة المتبقية تُحترم كما هي
  const a = { ...sh('a', '2026-09-17T08:00:00Z', '2026-09-17T09:00:00Z', 0, 300), handoverAmount: 200, rolledAmount: 100 };
  const b = sh('b', '2026-09-17T09:30:00Z', null, 100, null);
  t('المختوم صراحةً يُحترم رقمه المتبقي', build([a, b])(a), 200);
}

{
  // وردية استُلم نقدها فعلاً لا تبقى معلّقة مهما قالت بقية الحقول
  const a = { ...sh('a', '2026-09-17T08:00:00Z', '2026-09-17T09:00:00Z', 0, 120), handoverStatus: 'received' };
  t('المستلَمة ← ٠', build([a])(a), 0);
  const b = { ...sh('b', '2026-09-17T08:00:00Z', '2026-09-17T09:00:00Z', 0, 120), handoverStatus: 'settled' };
  t('المسوّاة بالتصفير ← ٠', build([b])(b), 0);
}
{
  // سجل بلا معرّف مستخدم: لا نستنتج ترحيلاً بلا هوية — يبقى معلّقاً
  const a = { id: 'a', status: 'closed', closedAt: '2026-09-17T09:00:00Z', actualCash: 70, handoverAmount: 70, handoverStatus: 'pending' };
  t('سجل قديم بلا معرّف ← يبقى معلّقاً', build([a])(a), 70);
}

// ---------------------------------------------------------------------
//  قاعدة المتجر: كل كاشير يحتفظ بنقده حتى يسحبه المدير، ولا يتداخل
//  حساب كاشير مع آخر
// ---------------------------------------------------------------------
console.log('\n— قاعدة العهدة: ترحيل لنفس المستخدم · خصم بالسحب · لا تداخل —');
{
  // بند ٢: النقد يُرحَّل لنفس المستخدم عبر ورديّاته
  const a = sh('a', '2026-09-17T08:00:00Z', '2026-09-17T09:00:00Z', 0, 100);
  const b = sh('b', '2026-09-17T09:10:00Z', '2026-09-17T10:00:00Z', 100, 160);
  const c = sh('c', '2026-09-17T10:10:00Z', null, 160, null);
  const eff = build([a, b, c]);
  t('الوردية الأولى رُحّلت ← ٠', eff(a), 0);
  t('الثانية رُحّلت ← ٠', eff(b), 0);
  t('المعلّق كله صفر — النقد في الدرج الجاري', eff(a) + eff(b), 0);
}
{
  // بند ٣: يُخصم عند سحب المدير — الوردية المستلَمة تخرج من الحساب
  const a = { ...sh('a', '2026-09-17T08:00:00Z', '2026-09-17T09:00:00Z', 0, 100), handoverStatus: 'received', handoverAmount: 0 };
  t('بعد سحب المدير ← ٠', build([a])(a), 0);
  // سحب جزئي: الباقي يظل بذمة الكاشير
  const b = { ...sh('b', '2026-09-17T08:00:00Z', '2026-09-17T09:00:00Z', 0, 100), handoverAmount: 40 };
  t('سحب جزئي ← يبقى ٤٠ بذمته', build([b])(b), 40);
}
{
  // بند ٤: لا تداخل بين كاشيرين — وردية زميل لا تُسقط ولا تُضيف
  const fa = sh('fa', '2026-09-17T08:00:00Z', '2026-09-17T09:00:00Z', 0, 100);
  const ro = { id: 'ro', userId: 'user-ROWAN', cashierId: 'user-ROWAN', cashierName: 'روان',
    status: 'closed', closedAt: '2026-09-17T09:30:00Z', openedAt: '2026-09-17T08:30:00Z',
    actualCash: 300, handoverAmount: 300, handoverStatus: 'pending' };
  const roOpen = { id: 'ro2', userId: 'user-ROWAN', cashierId: 'user-ROWAN', isOpen: true,
    openedAt: '2026-09-17T10:00:00Z', startCash: 300 };
  const eff = build([fa, ro, roOpen]);
  t('نقد فاطمة لا يتأثر بترحيل روان', eff(fa), 100);
  t('نقد روان رُحّل لورديتها هي ← ٠', eff(ro), 0);
}

// ---------------------------------------------------------------------
//  حارس المسار الكامل: كل من يسأل عن العهدة يسأل المصدر نفسه
// ---------------------------------------------------------------------
console.log('\n— المسار كامل من مصدر واحد —');
const CONSUMERS = [
  ['src/context/AppContext.jsx', 'ملخّص الخزينة وتأكيد الاستلام'],
  ['src/components/cashier/tabs/ShiftsHistoryTab.jsx', 'سجل الورديات'],
];
for (const [file, label] of CONSUMERS) {
  const s = fs.readFileSync(file, 'utf8');
  t(`${label}: يستورد الدالة المشتركة`,
    /import\s*\{[^}]*\beffectivePendingHandover\b[^}]*\}\s*from\s*['"][^'"]*useShiftMetrics['"]/s.test(s) ? 1 : 0, 1);
  t(`${label}: يستدعيها فعلاً`,
    /effectivePendingHandover\s*\(/.test(s) ? 1 : 0, 1);
}
{
  const ctx = fs.readFileSync('src/context/AppContext.jsx', 'utf8');
  t('تأكيد الاستلام يرفض مالاً رُحّل',
    /stillPending\s*<=\s*0\.005/.test(ctx) ? 1 : 0, 1);
  const hist = fs.readFileSync('src/components/cashier/tabs/ShiftsHistoryTab.jsx', 'utf8');
  t('سجل الورديات لا يعرض زر الاستلام على المُرحَّل',
    /isRolled\s*\?\s*null/.test(hist) ? 1 : 0, 1);

  // المدير يجب أن يستطيع السحب في أي وقت — لا بعد إغلاق الوردية فقط
  t('يوجد مسار سحب من المدير (withdrawCashierDrawer)',
    /const withdrawCashierDrawer\s*=/.test(ctx) ? 1 : 0, 1);
  t('السحب لا يتجاوز ما بذمة الكاشير',
    /numAmount\s*>\s*held\s*\+\s*0\.005/.test(ctx) ? 1 : 0, 1);
  t('السحب يُخصم من الدرج الجاري أولاً بحركة treasury_drop',
    /type:\s*'treasury_drop'[\s\S]{0,400}?سحب عهدة الكاشير/.test(ctx) ? 1 : 0, 1);
  t('السحب يُصفّي ورديات نفس الكاشير فقط',
    /\(s\.userId \|\| s\.cashierId\) !== cashierUserId/.test(ctx) ? 1 : 0, 1);
  t('رصيد كل كاشير مفصول باسمه (cashierBalances)',
    /const cashierBalances\s*=/.test(ctx) ? 1 : 0, 1);

  // الإغلاق الآلي كان يُغلق بـ `startCash` لأن الوردية المفتوحة بلا `actualCash`
  // ⇒ وردية نقدها ٢٧٥ تُغلق على ١٠٠ فتتبخّر ١٧٥ ويُسجَّل عجز وهمي بها
  t('الإغلاق الآلي يستعمل النقد المحسوب من السجلات',
    /closeShift\(\s*computeOpenShiftCash\(existingShift\)/.test(ctx) ? 1 : 0, 1);
  t('الإغلاق الآلي لم يعد يسقط على startCash',
    /closeShift\(existingShift\.actualCash \?\? existingShift\.startCash/.test(ctx) ? 0 : 1, 1);
  t('يوجد مصدر واحد لما يحمله الكاشير الآن',
    /const getCashierHeldCash\s*=/.test(ctx) ? 1 : 0, 1);

  // نوافذ فتح الوردية الثلاث تسأل «كم بذمّته الآن؟» لا «بكم أُغلقت آخر وردية؟»
  const DIALOGS = [
    ['src/components/pos/PosRegister.jsx', 'شاشة الكاشير'],
    ['src/components/cashier/ShiftHeaderModal.jsx', 'نافذة رأس الوردية'],
    ['src/components/cashier/tabs/CurrentShiftDrawerTab.jsx', 'تبويب الدرج'],
  ];
  for (const [file, label] of DIALOGS) {
    const s = fs.readFileSync(file, 'utf8');
    t(`${label}: يعبّئ الرصيد من getCashierHeldCash`,
      /getCashierHeldCash\(currentUser\?\.id\)/.test(s) ? 1 : 0, 1);
    t(`${label}: لا يعبّئ من actualCash مباشرةً`,
      /setOpeningCashInput\(String\(lastUserClosedShift\.actualCash\)\)/.test(s) ? 0 : 1, 1);
  }
  {
    const dt = fs.readFileSync('src/components/cashier/tabs/CurrentShiftDrawerTab.jsx', 'utf8');
    t('تبويب الدرج لا يفتح وردية بصفر بلا سؤال',
      /await openNewShift\(0\)/.test(dt) ? 0 : 1, 1);
  }

  const mt = fs.readFileSync('src/components/cashier/tabs/ManagerTreasuryTab.jsx', 'utf8');
  t('الخزينة تعرض رصيد كل كاشير',
    /treasurySummary\.cashierBalances/.test(mt) ? 1 : 0, 1);
  t('الخزينة فيها زر سحب لكل كاشير',
    /setWithdrawTarget\(c\)/.test(mt) ? 1 : 0, 1);
  t('الخزينة تستدعي withdrawCashierDrawer',
    /withdrawCashierDrawer\s*\(\s*\{/.test(mt) ? 1 : 0, 1);
}

console.log(`\n${'='.repeat(52)}`);
console.log(`النتيجة: ${pass} ناجح · ${fail} فاشل`);
console.log('='.repeat(52));
process.exit(fail > 0 ? 1 : 0);
