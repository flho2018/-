// =========================================================================
//  مولّد أوامر TSPL لملصقات الباركود الحرارية
// =========================================================================
//  لماذا لا يكفي HTML:
//  المتصفّح يطبع صفحةً، لا ملصقاً. فمهما ضُبط `@page` تبقى الطابعة تتعامل
//  مع الخرج كورقة: هوامش يفرضها المتصفّح، وتحجيم يختلف بين جهاز وآخر،
//  وباركود يُرسم صورةً فتتغيّر سماكة خطوطه مع الدقّة فيصعب مسحه. ولهذا
//  كانت شكوى «طباعة الباركود غير احترافية» صحيحة ولا يعالجها ضبط CSS.
//
//  TSPL لغة طابعات الملصقات الحرارية نفسها (TSC / Xprinter / Godex وما
//  يتوافق معها). فيها المقاس بالملّيمتر صراحةً، والباركود يُولَّد داخل
//  الطابعة بخطوطها لا كصورة — فيخرج بمقاس مضبوط وقابلاً للمسح دائماً.
//
//  ⚠️ حدّ حقيقي يجب معرفته: TSPL **لا يدعم العربية** في أمر TEXT، لأن
//  خطوط الطابعة الداخلية بلا محارف عربية ولا تشكيل اتصال الحروف. فالنصوص
//  العربية (اسم المنتج، اسم المتجر) تُرسَل فقط إن كانت لاتينية/رقمية،
//  وإلا تُحذف من الملصق بدل أن تُطبع رموزاً مشوّهة. من يريد اسماً عربياً
//  على الملصق يبقى على مسار HTML. هذا قرار صريح لا نقص.
// =========================================================================

/** هل النص قابل للطباعة بخط الطابعة الداخلي؟ (لاتيني/أرقام/رموز أساسية) */
export const isPrintableAscii = (text) => {
  const s = String(text ?? '').trim();
  if (!s) return false;
  return /^[\x20-\x7E]+$/.test(s);
};

/** تنظيف نص قبل إدراجه داخل علامتي اقتباس في أمر TSPL */
export const escapeTspl = (text) =>
  String(text ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * ترميز الباركود المدعوم في TSPL.
 * EAN13 و UPCA يشترطان طولاً وأرقاماً فقط؛ وإلا نرجع إلى CODE128 الذي
 * يقبل أي محرف — أفضل من ملصق تخرجه الطابعة فارغاً بلا سبب ظاهر.
 */
export const resolveSymbology = (symbology, code) => {
  const c = String(code ?? '').trim();
  const digits = /^\d+$/.test(c);
  const s = String(symbology || 'CODE128').toUpperCase();
  if (s === 'EAN13' && digits && c.length === 13) return 'EAN13';
  if (s === 'UPCA' && digits && c.length === 12) return 'UPCA';
  if (s === 'CODE39') return '39';
  return '128';
};

/** مم ← نقاط حسب دقّة الطابعة (203 نقطة/بوصة هي الشائعة، و300 للأدقّ) */
export const mmToDots = (mm, dpi = 203) =>
  Math.round((Number(mm) || 0) * (Number(dpi) || 203) / 25.4);

/**
 * بناء أوامر TSPL لملصق منتج واحد بعدد نسخ.
 * يرجع نصّاً واحداً يُرسل خاماً إلى الطابعة.
 */
export const buildTsplLabel = ({
  product = {},
  copies = 1,
  settings = {},
  storeInfo = {}
} = {}) => {
  const dpi = Number(settings.dpi) || 203;
  const widthMm = Number(settings.customWidth) || 50;
  const heightMm = Number(settings.customHeight) || 25;
  const gapMm = Number(settings.gap) || 2;

  const marginLeft = mmToDots(Number(settings.marginLeft) || 2, dpi);
  const marginTop = mmToDots(Number(settings.marginTop) || 2, dpi);

  const code = String(product.barcode ?? '').trim();
  const lines = [];

  // ترويسة الملصق: المقاس بالملّيمتر صراحةً — هذا هو جوهر الفرق عن HTML
  lines.push(`SIZE ${widthMm} mm,${heightMm} mm`);
  lines.push(`GAP ${gapMm} mm,0 mm`);
  lines.push(`DIRECTION ${settings.orientation === 'landscape' ? 1 : 0}`);
  lines.push('CLS');

  // المحتوى يُبنى من الأعلى للأسفل، وكل عنصر يدفع المؤشّر بارتفاعه
  let y = marginTop;
  const lineGap = mmToDots(1, dpi);

  // اسم المتجر واسم المنتج: لاتيني فقط (انظر تعليق الرأس)
  const storeName = storeInfo?.nameEn || storeInfo?.name;
  if (settings.showStoreName !== false && isPrintableAscii(storeName)) {
    lines.push(`TEXT ${marginLeft},${y},"2",0,1,1,"${escapeTspl(storeName)}"`);
    y += mmToDots(3, dpi) + lineGap;
  }

  const prodName = product.nameEn || product.name;
  if (settings.showProductName !== false && isPrintableAscii(prodName)) {
    lines.push(`TEXT ${marginLeft},${y},"2",0,1,1,"${escapeTspl(String(prodName).slice(0, 28))}"`);
    y += mmToDots(3, dpi) + lineGap;
  }

  // الباركود — يُولَّد داخل الطابعة، لا كصورة
  if (code) {
    const sym = resolveSymbology(settings.symbology, code);
    const bcHeightDots = mmToDots(Number(settings.barcodeHeight) || 12, dpi);
    const narrow = Math.max(1, Math.round(Number(settings.barcodeWidth) || 2));
    const readable = settings.showBarcodeText === false ? 0 : 2;   // 2 = النص أسفل الباركود
    lines.push(`BARCODE ${marginLeft},${y},"${sym}",${bcHeightDots},${readable},0,${narrow},${narrow * 2},"${escapeTspl(code)}"`);
    y += bcHeightDots + mmToDots(readable ? 4 : 1, dpi);
  }

  // السعر: أرقام ورمز العملة — يُطبع دائماً لأنه لا يحتاج حروفاً عربية
  if (settings.showPrice !== false) {
    const price = Number(product.sellingPrice ?? product.price ?? 0).toFixed(2);
    const currency = settings.showCurrency === false ? '' : ' SAR';
    lines.push(`TEXT ${marginLeft},${y},"3",0,1,1,"${escapeTspl(price + currency)}"`);
    y += mmToDots(4, dpi);
  }

  const n = Math.max(1, Math.min(999, Math.round(Number(copies) || 1)));
  lines.push(`PRINT ${n},1`);

  return lines.join('\n') + '\n';
};

/**
 * هل يصلح هذا الملصق لمسار TSPL؟
 * بلا باركود لا معنى للملصق الحراري. ويُشترط تفعيل QZ ووضع TSPL صراحةً،
 * فالارتداد إلى HTML هو السلوك الآمن الافتراضي.
 */
export const canUseTspl = (product, storeInfo) => {
  if (!storeInfo?.printers?.useQz) return false;
  if (storeInfo?.barcodeLabelSettings?.useTspl !== true) return false;
  return Boolean(String(product?.barcode ?? '').trim());
};
