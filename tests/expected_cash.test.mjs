// اختبار الصيغة الموحّدة للنقدية المتوقّعة — يستخرج الدوال من الملف الحقيقي
// (`useShiftMetrics.js`) حرفياً بدل إعادة كتابتها، فلا ينجح على منطق منسوخ
// متخلّف عن المصدر.
import fs from 'fs';

const src = fs.readFileSync('src/utils/useShiftMetrics.js', 'utf8');
// يُقتطع تعريف كل دالة حتى أول `export` بعده أو نهاية الملف، ثم تُجرَّد
// يُقتطع تعريف كل دالة حتى أول `export` بعده أو نهاية الملف، ثم تُجرَّد
// كلمة export — فالنصّ يُنفَّذ داخل new Function لا كوحدة.
const pick = (name) => {
  const i = src.indexOf('export const ' + name + ' =');
  if (i < 0) throw new Error('لم يُعثر على ' + name + ' في useShiftMetrics.js');
  const nextExport = src.indexOf('\nexport ', i + 10);
  const end = nextExport > -1 ? nextExport : src.length;
  return src.slice(i, end).replace('export const', 'const').trimEnd();
};
const code = [pick('computeExpectedCash'), pick('sumDrawerCashOut'), pick('sumDrawerCashIn')].join('\n');
const { computeExpectedCash, sumDrawerCashOut, sumDrawerCashIn } =
  new Function(code + '; return { computeExpectedCash, sumDrawerCashOut, sumDrawerCashIn };')();

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = Math.abs(Number(got) - Number(want)) < 0.005;
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} — توقّعنا ${want} وجاء ${got}`); }
};

console.log('\n— الصيغة الأساسية —');
t('درج فارغ', computeExpectedCash({}), 0);
t('عهدة 500 بلا حركة', computeExpectedCash({ startCash: 500 }), 500);
t('عهدة + مبيعات نقدية', computeExpectedCash({ startCash: 500, cashSales: 300 }), 800);
t('المرتجع النقدي يُخصم', computeExpectedCash({ startCash: 500, cashSales: 300, cashRefunds: 100 }), 700);
t('إيداع وسحب', computeExpectedCash({ startCash: 100, cashIn: 50, cashOut: 30 }), 120);
t('المصروف والمشتريات تُخصمان', computeExpectedCash({ startCash: 1000, cashExpenses: 200, cashPurchases: 300 }), 500);

console.log('\n— حالة الوردية الحقيقية المختبَرة حيّاً —');
// وردية نايف: عهدة 0، بيع نقدي 20 ثم إرجاعه، ثم تقسيم كاش 72.5
t('بيع 20 + إرجاع 20 + تقسيم كاش 72.5 ← 72.5',
  computeExpectedCash({ startCash: 0, cashSales: 92.5, cashRefunds: 20 }), 72.5);

console.log('\n— السالب مسموح ولا يُقصّ —');
// درج سُحبت عهدته ثم صُرف منه مرتجع: الرقم السالب حقيقة محاسبية لا خطأ يُخفى
t('سحب أكبر من الرصيد يعطي سالباً', computeExpectedCash({ startCash: 100, cashOut: 300 }), -200);

console.log('\n— القيم غير الرقمية تُعامَل صفراً —');
t('undefined و null ونص', computeExpectedCash({ startCash: undefined, cashSales: null, cashIn: 'abc', cashOut: 25 }), -25);

console.log('\n— استثناءات جمع الحركات (منع الخصم المزدوج) —');
const tx = [
  { type: 'out', amount: 100 },                                     // سحب عادي
  { type: 'out', subType: 'expense', amount: 50 },                  // مصروف: يُخصم من قائمة المصروفات
  { type: 'out', subType: 'purchase', amount: 70 },                 // مشتريات: تُخصم من قائمة المشتريات
  { type: 'out', category: 'مرتجع مبيعات نقدية', amount: 20 },       // مرتجع: يُخصم عبر cashRefunds
  { type: 'treasury_drop', amount: 200 },                           // ترحيل للخزينة: يُحتسب
];
t('cashOut يستثني المصروف والمشتريات والمرتجع', sumDrawerCashOut(tx), 300);

const txIn = [
  { type: 'in', amount: 80 },
  { type: 'in', amount: 500, countedInStartCash: true },   // العهدة الافتتاحية لا تُجمع ثانيةً
  { type: 'in', amount: 40, status: 'pending' },           // معلّقة لم تصل بعد
  { type: 'in', subType: 'expense', amount: 10 },
];
t('cashIn يستثني العهدة والمعلّق', sumDrawerCashIn(txIn), 80);

console.log('\n— التكامل: الحركات + الصيغة —');
t('وردية كاملة',
  computeExpectedCash({
    startCash: 500,
    cashSales: 1000,
    cashRefunds: 100,
    cashIn: sumDrawerCashIn(txIn),
    cashOut: sumDrawerCashOut(tx),
    cashExpenses: 50,
    cashPurchases: 70
  }),
  500 + 1000 - 100 + 80 - 300 - 50 - 70);

console.log(`\n${pass}/${pass + fail} اختباراً ناجحاً`);
process.exit(fail ? 1 : 0);
