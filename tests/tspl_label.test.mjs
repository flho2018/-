// اختبار مولّد أوامر TSPL — يستورد الوحدة الحقيقية مباشرةً
// (`tsplLabel.js` بلا استيرادات، فيصحّ استيرادها في اختبار .mjs — انظر §9).
import {
  buildTsplLabel,
  resolveSymbology,
  mmToDots,
  isPrintableAscii,
  escapeTspl,
  canUseTspl
} from '../src/utils/tsplLabel.js';

let pass = 0, fail = 0;
const t = (name, cond) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
};

console.log('\n— تحويل المقاس بالملّيمتر إلى نقاط —');
t('50مم عند 203dpi = 400 نقطة', mmToDots(50, 203) === 400);
t('25مم عند 203dpi = 200 نقطة', mmToDots(25, 203) === 200);
t('50مم عند 300dpi = 591 نقطة', mmToDots(50, 300) === 591);
t('قيمة غير رقمية ← صفر', mmToDots(undefined, 203) === 0);

console.log('\n— اختيار الترميز: الرجوع الآمن إلى CODE128 —');
t('EAN13 بـ13 رقماً يُقبل', resolveSymbology('EAN13', '6281000000017') === 'EAN13');
t('EAN13 بطول خاطئ ← 128', resolveSymbology('EAN13', '62810') === '128');
t('EAN13 بحروف ← 128', resolveSymbology('EAN13', 'ABC1234567890') === '128');
t('UPCA بـ12 رقماً يُقبل', resolveSymbology('UPCA', '012345678905') === 'UPCA');
t('UPCA بطول خاطئ ← 128', resolveSymbology('UPCA', '01234') === '128');
t('CODE39 يُمرَّر كـ39', resolveSymbology('CODE39', 'ABC-123') === '39');
t('بلا ترميز محدّد ← 128', resolveSymbology(undefined, '0000001') === '128');

console.log('\n— كشف النص غير القابل للطباعة بخط الطابعة —');
t('لاتيني يُقبل', isPrintableAscii('Rose Bouquet') === true);
t('أرقام ورموز تُقبل', isPrintableAscii('SKU-100/2 (A)') === true);
t('عربي يُرفض', isPrintableAscii('باقة ورد') === false);
t('مختلط يُرفض', isPrintableAscii('Rose باقة') === false);
t('فارغ يُرفض', isPrintableAscii('   ') === false);

console.log('\n— تهريب علامات الاقتباس —');
t('الاقتباس يُهرَّب', escapeTspl('say "hi"') === 'say \\"hi\\"');
t('الشرطة العكسية تُهرَّب', escapeTspl('a\\b') === 'a\\\\b');

console.log('\n— بناء ملصق كامل —');
const label = buildTsplLabel({
  product: { name: 'باقة جوري', nameEn: 'Rose Bouquet', barcode: '0000001', sellingPrice: 125 },
  copies: 3,
  settings: { customWidth: 50, customHeight: 25, gap: 2, dpi: 203, barcodeHeight: 12, symbology: 'CODE128' },
  storeInfo: { name: 'بيت الورد', nameEn: 'Flower House' }
});
t('المقاس بالملّيمتر صريح', label.includes('SIZE 50 mm,25 mm'));
t('الفجوة بالملّيمتر', label.includes('GAP 2 mm,0 mm'));
t('CLS قبل الرسم', label.includes('CLS'));
t('أمر الباركود موجود بالرمز 128', /BARCODE \d+,\d+,"128",/.test(label));
t('الباركود نفسه في الأمر', label.includes('"0000001"'));
t('السعر بمنزلتين وعملة', label.includes('125.00 SAR'));
t('عدد النسخ صحيح', label.includes('PRINT 3,1'));
t('الاسم الإنجليزي طُبع', label.includes('Flower House') && label.includes('Rose Bouquet'));
t('لا حرف عربي في الخرج', !/[؀-ۿ]/.test(label));

console.log('\n— بلا اسم لاتيني: يُحذف النص ولا يُطبع مشوّهاً —');
const arOnly = buildTsplLabel({
  product: { name: 'باقة جوري', barcode: '0000002', sellingPrice: 10 },
  settings: { dpi: 203 },
  storeInfo: { name: 'بيت الورد' }
});
t('لا حرف عربي', !/[؀-ۿ]/.test(arOnly));
t('الباركود يبقى', arOnly.includes('"0000002"'));
t('السعر يبقى', arOnly.includes('10.00 SAR'));
t('نسخة واحدة افتراضاً', arOnly.includes('PRINT 1,1'));

console.log('\n— حدود عدد النسخ —');
t('صفر يصير واحداً', buildTsplLabel({ product: { barcode: '1' }, copies: 0 }).includes('PRINT 1,1'));
t('سالب يصير واحداً', buildTsplLabel({ product: { barcode: '1' }, copies: -5 }).includes('PRINT 1,1'));
t('فوق 999 يُقصّ', buildTsplLabel({ product: { barcode: '1' }, copies: 99999 }).includes('PRINT 999,1'));

console.log('\n— بوابة التشغيل: الارتداد إلى HTML هو الافتراض —');
const prod = { barcode: '0000001' };
t('QZ مطفأ ← لا TSPL', canUseTspl(prod, { printers: { useQz: false }, barcodeLabelSettings: { useTspl: true } }) === false);
t('TSPL مطفأ ← لا TSPL', canUseTspl(prod, { printers: { useQz: true }, barcodeLabelSettings: { useTspl: false } }) === false);
t('بلا باركود ← لا TSPL', canUseTspl({ barcode: '' }, { printers: { useQz: true }, barcodeLabelSettings: { useTspl: true } }) === false);
t('الاثنان مفعّلان وباركود موجود ← نعم', canUseTspl(prod, { printers: { useQz: true }, barcodeLabelSettings: { useTspl: true } }) === true);
t('إعدادات فارغة ← لا TSPL', canUseTspl(prod, {}) === false);

console.log(`\n${pass}/${pass + fail} اختباراً ناجحاً`);
process.exit(fail ? 1 : 0);
