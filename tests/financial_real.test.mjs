// =========================================================================
//  اختبارات مالية على الكود الحيّ — بديل `financial_calculations.test.cjs`
// =========================================================================
//  المشكلة في الملف القديم: **ينسخ** الدوال بدل أن يستوردها. فكان ١٧ اختباراً
//  تمرّ خضراء على نسخة من المنطق قد تكون متخلّفة عن الملف الحقيقي بأشهر —
//  اختبارٌ يطمئن ولا يحمي. وهذا أسوأ من غياب الاختبار، لأن غيابه معروف.
//
//  هنا نمطان، كلاهما يمسّ الكود الحيّ:
//   ١) **استيراد مباشر** لـ `security.js` (بلا استيرادات، فتُستورد كما هي).
//   ٢) **استخراج النصّ حرفياً** من `AppContext.jsx` و `helpers.js` — للمنطق
//      المدفون داخل ملفات ضخمة لها استيرادات. أي تعديل في المصدر يظهر هنا
//      فوراً، ولا يمكن للاختبار أن ينجح على منطق قديم.
// =========================================================================
import fs from 'fs';
import { hashPin, verifyPin, isHashedPin, validatePinStrength } from '../src/utils/security.js';

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

// ---------------------------------------------------------------- الضريبة
// `getCartTotals` مدفونة داخل AppContext (٦٧٠٠ سطر وله استيرادات)، فتُستخرج
// حرفياً وتُنفَّذ بحالة وهمية. هذه أهم دالة مالية في البرنامج: كل فاتورة تمرّ بها.
const ctxSrc = fs.readFileSync('src/context/AppContext.jsx', 'utf8');
const ctStart = ctxSrc.indexOf('  const getCartTotals = () => {');
if (ctStart < 0) throw new Error('لم يُعثر على getCartTotals في AppContext.jsx');
const ctEnd = ctxSrc.indexOf('\n  };', ctStart) + 5;
const ctBody = ctxSrc.slice(ctStart, ctEnd).replace('  const getCartTotals', 'const getCartTotals');

const makeTotals = (cart, cartDiscount, storeInfo) =>
  new Function('cart', 'cartDiscount', 'storeInfo', ctBody + '; return getCartTotals();')(cart, cartDiscount, storeInfo);

const item = (price, qty, discount = 0) => ({ unitPrice: price, qty, discount });
const NO_DISC = { type: 'fixed', value: 0 };

console.log('\n— الضريبة شاملة (السعر يحوي الضريبة) —');
{
  const r = makeTotals([item(115, 1)], NO_DISC, { taxEnabled: true, taxRate: 15, taxInclusive: true });
  t('الإجمالي يبقى 115', near(r.total, 115));
  t('الخاضع = 100', near(r.taxableAmount, 100));
  t('الضريبة = 15', near(r.taxAmount, 15));
  t('الخاضع + الضريبة = الإجمالي', near(r.taxableAmount + r.taxAmount, r.total));
}

console.log('\n— الضريبة غير شاملة (تُضاف فوق السعر) —');
{
  const r = makeTotals([item(100, 1)], NO_DISC, { taxEnabled: true, taxRate: 15, taxInclusive: false });
  t('الخاضع = 100', near(r.taxableAmount, 100));
  t('الضريبة = 15', near(r.taxAmount, 15));
  t('الإجمالي = 115', near(r.total, 115));
}

console.log('\n— الضريبة معطّلة (حالة المتجر اليوم) —');
{
  const r = makeTotals([item(100, 2)], NO_DISC, { taxEnabled: false });
  t('الإجمالي = 200', near(r.total, 200));
  t('لا ضريبة', near(r.taxAmount, 0));
  t('معدّل الضريبة صفر', near(r.taxRate, 0));
}

console.log('\n— الخصم النسبي يُحسب بعد خصومات الأصناف لا قبلها —');
{
  // صنفان 100 لكلٍّ، وخصم صنف 20، ثم خصم عام 10٪
  // الصحيح: (200 − 20) × 10٪ = 18 — لا 200 × 10٪ = 20
  const r = makeTotals([item(100, 1, 20), item(100, 1)], { type: 'percent', value: 10 }, { taxEnabled: false });
  t('الخصم العام = 18 لا 20', near(r.globalDiscount, 18));
  t('مجموع الخصم = 38', near(r.totalDiscount, 38));
  t('الإجمالي = 162', near(r.total, 162));
}

console.log('\n— الخصم لا يتجاوز قيمة السلة —');
{
  const r = makeTotals([item(50, 1)], { type: 'fixed', value: 500 }, { taxEnabled: false });
  t('الخصم يُقصّ عند 50', near(r.globalDiscount, 50));
  t('الإجمالي صفر لا سالب', near(r.total, 0));
}

console.log('\n— الكميات والأسعار غير الصالحة لا تُفسد الإجمالي —');
{
  const r = makeTotals([{ unitPrice: 'abc', qty: 2 }, item(10, 3)], NO_DISC, { taxEnabled: false });
  t('النص يُعامَل صفراً والإجمالي = 30', near(r.total, 30));
  t('سلة فارغة = صفر', near(makeTotals([], NO_DISC, { taxEnabled: false }).total, 0));
}

console.log('\n— كل المبالغ المُرجَعة أرقام صالحة —');
{
  const r = makeTotals([item(33.333, 3)], NO_DISC, { taxEnabled: true, taxRate: 15, taxInclusive: true });
  t('لا NaN في أي حقل', Object.values(r).every(v => typeof v !== 'number' || Number.isFinite(v)));
  t('الأرقام مقرّبة لمنزلتين', String(r.taxAmount) === String(Number(r.taxAmount.toFixed(2))));
}

// ------------------------------------------------------------ ZATCA TLV
const helpSrc = fs.readFileSync('src/utils/helpers.js', 'utf8');
const tlvStart = helpSrc.indexOf('function getTLV(');
const tlvEnd = helpSrc.indexOf('\nexport const generateBarcode', tlvStart) > -1
  ? helpSrc.indexOf('\nexport const generateBarcode', tlvStart)
  : helpSrc.indexOf('\nexport const SEQ_BARCODE_MAX', tlvStart);
const tlvSrc = helpSrc.slice(tlvStart, tlvEnd).replace(/export function/g, 'function');
const { generateZatcaTLV } = new Function(tlvSrc + '; return { generateZatcaTLV };')();

const decodeTLV = (b64) => {
  const bytes = Buffer.from(b64, 'base64');
  const out = {};
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i], len = bytes[i + 1];
    out[tag] = bytes.slice(i + 2, i + 2 + len).toString('utf8');
    i += 2 + len;
  }
  return out;
};

console.log('\n— رمز ZATCA الضريبي (TLV) —');
{
  const b64 = generateZatcaTLV('بيت الورد', '310123456700003', '2026-09-16T10:00:00Z', '115.00', '15.00');
  const d = decodeTLV(b64);
  t('الوسم 1 = اسم البائع', d[1] === 'بيت الورد');
  t('الوسم 2 = الرقم الضريبي', d[2] === '310123456700003');
  t('الوسم 3 = الوقت', d[3] === '2026-09-16T10:00:00Z');
  t('الوسم 4 = الإجمالي', d[4] === '115.00');
  t('الوسم 5 = الضريبة', d[5] === '15.00');
  t('الترميز base64 صالح', Buffer.from(b64, 'base64').toString('base64').replace(/=+$/, '') === b64.replace(/=+$/, ''));
}

console.log('\n— اسم متجر طويل لا يُفسد الرمز (طول TLV بايت واحد) —');
{
  // الحرف العربي بايتان، فـ200 حرف = 400 بايت > 255: يجب أن يُقصّ لا أن يلتفّ
  const longName = 'و'.repeat(200);
  const d = decodeTLV(generateZatcaTLV(longName, '310123456700003', '2026-09-16T10:00:00Z', '1.00', '0.15'));
  t('الاسم قُصّ ضمن 255 بايت', Buffer.byteLength(d[1], 'utf8') <= 255);
  t('بقية الوسوم سليمة بعد القصّ', d[2] === '310123456700003' && d[4] === '1.00');
}

// --------------------------------------------------------------- الأرقام
console.log('\n— تجزئة رمز الدخول (استيراد مباشر من security.js) —');
{
  const h = hashPin('7391');
  t('التجزئة بصيغة v2 معترف بها', isHashedPin(h));
  t('الرقم الصحيح يُقبل', verifyPin('7391', { pinHash: h }));
  t('الرقم الخاطئ يُرفض', !verifyPin('7392', { pinHash: h }));
  t('تجزئتان لنفس الرقم مختلفتان (ملح عشوائي)', hashPin('7391') !== hashPin('7391'));
  t('كلتاهما تتحقّقان', verifyPin('7391', { pinHash: hashPin('7391') }));
  t('نص صريح لا يُقبل كتجزئة', !isHashedPin('7391'));
  t('مستخدم بلا تجزئة يُرفض', !verifyPin('7391', {}));
}

console.log('\n— قوة رمز الدخول —');
{
  t('أربعة أرقام تُقبل', validatePinStrength('7391').valid);
  t('ثلاثة تُرفض', !validatePinStrength('739').valid);
  t('خمسة تُرفض (لوحة الدخول لا تقبلها)', !validatePinStrength('73915').valid);
  t('رقم مكرّر يُرفض', !validatePinStrength('1111').valid);
  t('رقم شائع يُرفض', !validatePinStrength('1234').valid);
  t('حروف تُرفض', !validatePinStrength('abcd').valid);
}

console.log(`\n${pass}/${pass + fail} اختباراً ناجحاً`);
process.exit(fail ? 1 : 0);
