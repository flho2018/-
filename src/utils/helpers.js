import { INITIAL_PAYMENT_METHODS } from './initialData';
import { DEFAULT_PAYMENT_ICONS } from './paymentIcons';

// مساعدة في حسابات المبالغ والضريبة وتوليد الأكواد
export const formatMoney = (amount, currency = 'ر.س') => {
  const val = Number(amount) || 0;
  return `${val.toFixed(2)} ${currency}`;
};

export const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export const formatShiftDateTime = (dateStr) => {
  if (!dateStr) return { dayName: '', date: '', time: '', fullFormatted: '' };
  const d = new Date(dateStr);
  const dayName = ARABIC_DAYS[d.getDay()] || '';
  const dateFormatted = d.toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeFormatted = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
  return {
    dayName,
    date: dateFormatted,
    time: timeFormatted,
    fullFormatted: `يوم ${dayName} ${dateFormatted} • ${timeFormatted}`
  };
};

export const formatShiftDuration = (startStr, endStr) => {
  if (!startStr || !endStr) return '';
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  const diffMs = Math.max(0, end - start);
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${minutes} دقيقة`;
  return `${hours} ساعة و ${minutes} دقيقة`;
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const dayName = ARABIC_DAYS[d.getDay()] || '';
  const dateFormatted = d.toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dayName}، ${dateFormatted}`;
};

// =========================================================================
//  رقم الفاتورة — رمز الجهاز لا رمز الكاشير
// =========================================================================
//  العطل الذي يعالجه هذا: كان الرمز يُشتقّ من معرّف مستخدم POS
//  (`user-1` ← `C1`)، والتسلسل يُحسب من مصفوفة الفواتير المحلية.
//  وكلاهما يفشل في نظام متعدّد الأجهزة:
//
//   • جهازان يعملان بنفس حساب الكاشير (وهو الوضع الطبيعي في المحل)
//     يحملان نفس الرمز `C1` — فالرمز لا يميّز شيئاً.
//   • المصفوفة المحلية تتأخّر عن السحابة بنبضة مزامنة كاملة، فالجهازان
//     يريان نفس أعلى تسلسل ويُنتجان نفس الرقم في نفس الثانية.
//
//  النتيجة كانت فاتورتين برقم واحد — وتكرار رقم الفاتورة مخالفة في
//  الفاتورة الإلكترونية، لا مجرد إزعاج في التقارير.
//
//  الحل: الرمز من `clientId` (المعرّف الثابت للجهاز في localStorage،
//  وهو نفسه الذي تعتمده المزامنة للتمييز بين الأجهزة)، والتسلسل يُحسب
//  **ضمن فواتير هذا الجهاز وحده**. فلا يحتاج جهازٌ أن يعرف ماذا باع
//  الآخر كي يرقّم فاتورته — وهذا ما يجعل الرقم مناعةً من تأخّر المزامنة
//  لا مجرد تقليلاً لاحتماله.
//
//  هوية الكاشير لم تضع: هي مخزَّنة في حقل `cashierId` على الفاتورة
//  نفسها، وهو المصدر الصحيح لها — لا نصٌّ داخل الرقم لم يكن فريداً أصلاً.
// =========================================================================

/** رمز مختصر ثابت للجهاز مشتقّ من clientId — أربعة محارف base36 */
export const deviceCodeFromClientId = (clientId) => {
  const s = String(clientId || '');
  if (!s) return '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase().slice(-4).padStart(4, '0');
};

export const generateInvoiceNumber = (count = 1, user = null, existingInvoices = [], clientId = '') => {
  const today = new Date();
  const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  const deviceCode = deviceCodeFromClientId(clientId);
  const scope = deviceCode ? `INV-${datePrefix}-${deviceCode}-` : `INV-${datePrefix}-`;

  // كل الأرقام المستعملة اليوم — حارس أخير ضد التكرار مهما كانت الصيغة.
  // يشمل الفواتير بالصيغة القديمة (`INV-date-C1-0004`) فلا يتصادم رقم
  // جديد مع رقم أصدره نفس الجهاز قبل هذا التغيير في نفس اليوم.
  const usedToday = new Set();
  let maxSeq = 0;

  for (const inv of (Array.isArray(existingInvoices) ? existingInvoices : [])) {
    const num = String(inv?.invoiceNumber || '');
    if (!num.includes(datePrefix)) continue;
    usedToday.add(num);
    // التسلسل يُقاس ضمن نطاق هذا الجهاز وحده
    if (deviceCode && !num.startsWith(scope)) continue;
    const n = parseInt(num.split('-').pop(), 10);
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
  }

  let next = Math.max(Number(count) || 1, maxSeq + 1);
  let candidate = `${scope}${String(next).padStart(4, '0')}`;
  // لا يدور أكثر من عدد فواتير اليوم — فالخروج مضمون
  while (usedToday.has(candidate) && next < 99999) {
    next += 1;
    candidate = `${scope}${String(next).padStart(4, '0')}`;
  }
  return candidate;
};

// إنشاء مصفوفة TLV لهيئة الزكاة والضريبة والجمارك (ZATCA e-Invoice QR TLV)
function getTLV(tag, value) {
  const encoder = new TextEncoder();
  let str = String(value ?? '');
  let valBytes = encoder.encode(str);
  // طول TLV بايت واحد فقط (0-255). الحرف العربي بايتان في UTF-8، فاسم
  // متجر طويل قد يتجاوز 255 بايت فيلتفّ الطول ويُفسد رمز QR صامتاً.
  // نقصّ على حدود المحارف (لا نصف حرف) حتى يبقى الطول ضمن بايت واحد.
  if (valBytes.length > 255) {
    console.warn('[ZATCA] قيمة TLV تجاوزت 255 بايت — قُصّت لتفادي إفساد رمز QR');
    while (valBytes.length > 255 && str.length > 0) {
      str = str.slice(0, -1);
      valBytes = encoder.encode(str);
    }
  }
  const tagByte = [tag];
  const lenByte = [valBytes.length];
  return new Uint8Array([...tagByte, ...lenByte, ...valBytes]);
}

export function generateZatcaTLV(sellerName, vatNumber, timeStamp, totalAmount, vatAmount) {
  try {
    // لا نحقن رقماً ضريبياً تجريبياً: رقم '300000000000003' رقم اختبار
    // معروف يجعل QR يبدو صحيحاً وهو غير مطابق قانونياً. عند غياب الرقم
    // الحقيقي نترك الحقل فارغاً وننبّه — والأصل ألّا يُطبع QR ضريبي أصلاً
    // ما دامت الضريبة معطّلة أو الرقم غير مُدخَل.
    if (!vatNumber) {
      console.warn('[ZATCA] لا يوجد رقم ضريبي مُدخَل — رمز QR الضريبي غير مطابق');
    }
    const tlv1 = getTLV(1, sellerName || '');
    const tlv2 = getTLV(2, vatNumber || '');
    const tlv3 = getTLV(3, timeStamp || new Date().toISOString());
    const tlv4 = getTLV(4, (Number(totalAmount) || 0).toFixed(2));
    const tlv5 = getTLV(5, (Number(vatAmount) || 0).toFixed(2));

    const totalLen = tlv1.length + tlv2.length + tlv3.length + tlv4.length + tlv5.length;
    const combined = new Uint8Array(totalLen);
    let offset = 0;
    for (const arr of [tlv1, tlv2, tlv3, tlv4, tlv5]) {
      combined.set(arr, offset);
      offset += arr.length;
    }

    // Convert to base64
    let binary = '';
    for (let i = 0; i < combined.byteLength; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  } catch (e) {
    console.error('TLV Generation Error:', e);
    return `${sellerName}|${vatNumber}|${timeStamp}|${totalAmount}|${vatAmount}`;
  }
}
// توليد باركود فريد قياسي للمنتج (EAN/Code128 format)
// `generateBarcode` (المولّد العشوائي القديم) حُذفت: حلّ محلّها
// `generateSequentialBarcode` أدناه، ولم يبق لها مستدعٍ في المشروع.
// الإبقاء على مولّد عشوائي بجانب تسلسلي دعوةٌ لأن يُستعمل الخطأ منهما.

export const SEQ_BARCODE_MAX = 999999;

export const generateSequentialBarcode = (products = []) => {
  const used = new Set();
  let max = 0;

  for (const p of (Array.isArray(products) ? products : [])) {
    const code = String(p?.barcode ?? '').trim();
    if (!code) continue;
    used.add(code);
    if (/^\d{7}$/.test(code)) {
      const n = Number(code);
      if (n <= SEQ_BARCODE_MAX && n > max) max = n;
    }
  }

  let next = max + 1;
  let candidate = String(next).padStart(7, '0');
  // تخطّي أي رقم محجوز يدوياً حتى لا يتكرر باركودان
  while (used.has(candidate) && next < SEQ_BARCODE_MAX) {
    next += 1;
    candidate = String(next).padStart(7, '0');
  }
  return candidate;
};

// إنشاء روابط الواتساب المباشرة لسطح المكتب والجوال
export const getWhatsAppUrls = (phone = '', text = '') => {
  let cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('05')) {
    cleanPhone = '966' + cleanPhone.substring(1);
  } else if (cleanPhone.startsWith('5')) {
    cleanPhone = '966' + cleanPhone;
  }
  
  const encodedText = encodeURIComponent(text || '');
  
  return {
    // 1. رابط تشغيل تطبيق الواتساب المباشر المثبت على الكمبيوتر أو الجوال (Protocol Handler)
    desktopAppUrl: cleanPhone ? `whatsapp://send?phone=${cleanPhone}&text=${encodedText}` : `whatsapp://send?text=${encodedText}`,
    // 2. رابط واتساب ويب لمتصفح الكمبيوتر
    webUrl: cleanPhone ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}` : `https://web.whatsapp.com/send?text=${encodedText}`,
    // 3. رابط wa.me العالمي
    universalUrl: cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`
  };
};

export const getWhatsAppUrl = (phone = '', text = '') => {
  const urls = getWhatsAppUrls(phone, text);
  return urls.universalUrl;
};


// قالب رسالة الفاتورة للعميل عبر الواتساب
export const buildInvoiceWhatsAppMessage = (invoice, storeInfo) => {
  if (!invoice) return '';
  const storeName = storeInfo?.name || 'بيت الورد للزهور والهدايا';
  const phone = storeInfo?.phone || storeInfo?.whatsappNumber || '';
  const itemsText = (invoice.items || [])
    .map((item, idx) => `▫️ ${item.product?.name || item.name} (${item.qty} × ${(item.unitPrice || item.price || 0).toFixed(2)}) = ${(item.total || (item.qty * (item.unitPrice || item.price || 0)) || 0).toFixed(2)} ر.س`)
    .join('\n');

  const isTaxActive = storeInfo?.taxEnabled !== false && Number(storeInfo?.taxRate || 0) > 0 && Number(invoice.taxRate || 0) > 0 && Number(invoice.taxAmount || 0) > 0;
  const isInclusive = invoice.taxInclusive !== false;

  let taxSection = '';
  let titleHeading = isTaxActive ? 'فاتورتك الضريبية الإلكترونية' : 'فاتورة مبيعاتك';

  if (isTaxActive) {
    if (isInclusive) {
      taxSection = `💵 *المبلغ الخاضع للضريبة:* ${(invoice.taxableAmount || (invoice.total - invoice.taxAmount) || 0).toFixed(2)} ر.س\n🧾 *ضريبة القيمة المضافة (${invoice.taxRate}% مشمولة):* ${(invoice.taxAmount || 0).toFixed(2)} ر.س\n`;
    } else {
      taxSection = `💵 *المجموع قبل الضريبة:* ${(invoice.subtotal || 0).toFixed(2)} ر.س\n🧾 *ضريبة القيمة المضافة (+${invoice.taxRate}% مضافة):* +${(invoice.taxAmount || 0).toFixed(2)} ر.س\n`;
    }
  } else {
    if (invoice.discount > 0) {
      taxSection = `💵 *المجموع الفرعي:* ${(invoice.subtotal || 0).toFixed(2)} ر.س\n`;
    }
  }

  return `🌸 *${storeName}* 🌸
عزيزنا العميل: *${invoice.customer?.name || 'العميل الكريم'}*
نشكر لك تسوقك معنا، إليك تفاصيل ${titleHeading}:

📄 *رقم الفاتورة:* ${invoice.invoiceNumber}
📅 *التاريخ والوقت:* ${formatDate(invoice.date)}
👤 *الكاشير:* ${invoice.cashier || 'الكاشير الرئيسي'}

🛒 *الأصناف:*
${itemsText}

──────────────────
${invoice.discount > 0 ? `🎁 *الخصم:* -${(invoice.discount || 0).toFixed(2)} ر.س\n` : ''}${taxSection}💳 *الإجمالي النهائي:* *${(invoice.total || 0).toFixed(2)} ر.س*
💰 *طريقة الدفع:* ${resolvePaymentMethodName(invoice, storeInfo?.paymentMethods)}
${isTaxActive ? (isInclusive ? '📌 *الأسعار شاملة ضريبة القيمة المضافة*' : '📌 *تمت إضافة ضريبة القيمة المضافة*') : ''}
──────────────────
${storeInfo?.invoiceFooter || 'نسعد دائماً بخدمتكم ونتمنى لكم يوماً سعيداً 🌸'}
${phone ? `📞 للتواصل: ${phone}` : ''}`;
};

// قالب تقرير إغلاق الوردية للمدير عبر الواتساب (Z-Report)
export const buildShiftWhatsAppMessage = (shift, storeInfo, managerName = 'المدير العام') => {
  if (!shift) return '';
  const storeName = storeInfo?.name || 'بيت الورد للزهور والهدايا';
  const currency = storeInfo?.currency || 'ر.س';
  const totalSales = Number(shift.totalSales) || ((Number(shift.cashSales) || 0) + (Number(shift.cardSales) || 0) + (Number(shift.creditSales) || 0));
  // مهم: نستخدم فحص "غير موجود" وليس || لأن القيمة صفر قيمة صحيحة.
  // مع || كان الدرج الفارغ (صفر) يُعتبر "غير محصى" فيُطبع تقرير يقول "الخزينة مطابقة"
  // بينما العجز كامل — وهذا يخفي أي نقص نقدي عن المدير.
  const expectedCash = (shift.expectedCash !== undefined && shift.expectedCash !== null && shift.expectedCash !== '')
    ? Number(shift.expectedCash)
    : ((Number(shift.startCash) || 0) + (Number(shift.cashSales) || 0) + (Number(shift.cashIn) || 0) - (Number(shift.cashOut) || 0));
  const actualCash = (shift.actualCash !== undefined && shift.actualCash !== null && shift.actualCash !== '')
    ? Number(shift.actualCash)
    : expectedCash;
  const difference = actualCash - expectedCash;

  let paymentsListText = '';
  if (shift.paymentMethodsBreakdown && typeof shift.paymentMethodsBreakdown === 'object') {
    const list = Object.values(shift.paymentMethodsBreakdown).filter(m => Number(m.amount) > 0);
    if (list.length > 0) {
      paymentsListText = list.map(m => `🔹 *مبيعات ${m.name}:* ${Number(m.amount).toFixed(2)} ${currency} (${m.count || 1} فواتير)`).join('\n');
    }
  }

  if (!paymentsListText) {
    const parts = [];
    if (Number(shift.cashSales) > 0) parts.push(`💰 *مبيعات النقد (كاش):* ${(Number(shift.cashSales) || 0).toFixed(2)} ${currency}`);
    if (Number(shift.cardSales) > 0) parts.push(`💳 *مبيعات الشبكة والبطاقات:* ${(Number(shift.cardSales) || 0).toFixed(2)} ${currency}`);
    if (Number(shift.creditSales) > 0) parts.push(`📑 *مبيعات الآجل:* ${(Number(shift.creditSales) || 0).toFixed(2)} ${currency}`);
    if (Number(shift.bankSales || shift.transferSales) > 0) parts.push(`🌐 *مبيعات تحويل بنكي:* ${(Number(shift.bankSales || shift.transferSales) || 0).toFixed(2)} ${currency}`);
    if (Number(shift.visaSales) > 0) parts.push(`💳 *مبيعات فيزا:* ${(Number(shift.visaSales) || 0).toFixed(2)} ${currency}`);
    if (Number(shift.tamaraSales) > 0) parts.push(`✨ *مبيعات تمارا:* ${(Number(shift.tamaraSales) || 0).toFixed(2)} ${currency}`);
    if (Number(shift.ninjaSales) > 0) parts.push(`⚡ *مبيعات نينجا:* ${(Number(shift.ninjaSales) || 0).toFixed(2)} ${currency}`);
    paymentsListText = parts.join('\n');
  }

  const cashRefundsText = Number(shift.cashRefunds) > 0 ? `🔄 *مرتجعات نقدية:* -${Number(shift.cashRefunds).toFixed(2)} ${currency}\n` : '';
  const expensesText = Number(shift.totalExpenses) > 0 ? `📉 *مصروفات نقدية:* -${Number(shift.totalExpenses).toFixed(2)} ${currency}\n` : '';
  const purchasesText = Number(shift.totalPurchases) > 0 ? `📦 *مشتريات نقدية:* -${Number(shift.totalPurchases).toFixed(2)} ${currency}\n` : '';
  const cashOutText = Number(shift.cashOut) > 0 ? `🏦 *سحب نقدي / ترحيل:* -${Number(shift.cashOut).toFixed(2)} ${currency}\n` : '';
  const cashInText = Number(shift.cashIn) > 0 ? `📈 *إيداعات نقدية / تحصيل:* +${Number(shift.cashIn).toFixed(2)} ${currency}\n` : '';

  return `📊 *تقرير إغلاق الوردية (Z-Report) - ${storeName}*
إلى سعادة: *${managerName}*

🕒 *الوردية:* ${shift.id || 'وردية كاشير'}
👤 *المسؤول / الكاشير:* ${shift.cashierName || 'كاشير بيت الورد'}
📅 *تاريخ الفتح:* ${formatDate(shift.openedAt)}
⏰ *تاريخ الإغلاق:* ${formatDate(shift.closedAt || new Date().toISOString())}

────────────────────
💵 *العهدة الافتتاحية:* ${(Number(shift.startCash) || 0).toFixed(2)} ${currency}
${paymentsListText}
${cashRefundsText}${cashInText}${cashOutText}${expensesText}${purchasesText}────────────────────
🏆 *إجمالي مبيعات الوردية:* *${totalSales.toFixed(2)} ${currency}*
📥 *النقدية المتوقعة بالدرج:* ${expectedCash.toFixed(2)} ${currency}
💵 *النقدية الفعلية المحصاة:* ${actualCash.toFixed(2)} ${currency}
${difference !== 0 ? `⚠️ *الفارق بالخزينة:* ${difference > 0 ? `+${difference.toFixed(2)} (زيادة)` : `${difference.toFixed(2)} (عجز)`}\n` : '✅ *الخزينة مطابقة تماماً بدون أي عجز.*\n'}────────────────────
تم التوليد تلقائياً بواسطة نظام بيت الورد السحابي 🌸`;
};

// ضغط وتصغير الصور قبل الحفظ لتجنب تجاوز مساحة التخزين
export const compressImageFile = (file, maxDim = 256) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // تصدير كـ JPEG أو PNG خفيف بجودة ممتازة
        const compressedDataUrl = canvas.toDataURL('image/png', 0.85);
        resolve(compressedDataUrl);
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};


// رابط إرسال البريد الإلكتروني المنسق
export const getEmailUrl = (to = '', subject = '', body = '') => {
  const encSubject = encodeURIComponent(subject);
  const encBody = encodeURIComponent(body);
  return `mailto:${to}?subject=${encSubject}&body=${encBody}`;
};

// فحص واستخراج مواصفات الجهاز والمتصفح والنظام بدقة لأمان تسجيل الدخول
export const getDeviceInfo = () => {
  if (typeof window === 'undefined') {
    return {
      deviceType: 'خادم / نظام آلي',
      os: 'خادم',
      browser: 'API',
      screenResolution: '0x0',
      isTouchDevice: false,
      userAgent: 'Node.js'
    };
  }

  const ua = navigator.userAgent || '';
  let deviceType = 'كمبيوتر مكتبي / لابتوب 💻';
  let os = 'Windows';
  let browser = 'Google Chrome';

  // 1. فحص نوع الجهاز ونظام التشغيل
  if (/iPad|Tablet|PlayBook/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua))) {
    deviceType = 'جهاز لوحي (تابلت) 📱';
    os = 'iPadOS / Tablet';
  } else if (/iPhone|iPod/i.test(ua)) {
    deviceType = 'هاتف آيفون 📱';
    os = 'iOS Apple';
  } else if (/Android/i.test(ua)) {
    if (/Mobile/i.test(ua)) {
      deviceType = 'هاتف أندرويد 📱';
    } else {
      deviceType = 'جهاز تابلت أندرويد 📱';
    }
    os = 'Android OS';
  } else if (/Windows NT/i.test(ua)) {
    deviceType = 'كمبيوتر مكتبي / لابتوب 💻';
    if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
    else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1';
    else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7';
    else os = 'Windows PC';
  } else if (/Mac OS X/i.test(ua)) {
    deviceType = 'كمبيوتر ماك (Mac) 💻';
    os = 'Apple macOS';
  } else if (/Linux/i.test(ua)) {
    deviceType = 'نظام لينكس 🐧';
    os = 'Linux OS';
  }

  // 2. فحص نوع المتصفح
  if (/Edg\//i.test(ua)) {
    browser = 'Microsoft Edge';
  } else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
    browser = 'Google Chrome';
  } else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Apple Safari';
  } else if (/Firefox\//i.test(ua)) {
    browser = 'Mozilla Firefox';
  } else if (/Opera|OPR\//i.test(ua)) {
    browser = 'Opera Browser';
  }

  const screenResolution = `${window.screen?.width || window.innerWidth}×${window.screen?.height || window.innerHeight}`;
  const isTouchDevice = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

  return {
    deviceType,
    os,
    browser,
    screenResolution,
    isTouchDevice,
    userAgent: ua
  };
};

/**
 * أفضل وأدق آلية لربط اسم الكاشير بحساباته وسجلاته ديناميكياً:
 * ترجع الاسم الفعلي الحالي للمستخدم من مصفوفة users بناءً على معرّف المستخدم الثابت (userId).
 * حتى لو تم تغيير اسم الكاشير أو المدير في أي وقت، تنعكس التسمية فورياً في كافة الفواتير والورديات والتقارير.
 * كما تعالج السجلات القديمة التي تحمل اسم 'admin' أو 'ادمن' لترجع اسم المدير الفعلي المسجل.
 */
export const resolveUserName = (identifierOrRecord, users = []) => {
  if (!identifierOrRecord) return 'كاشير';

  let uid = null;
  let rawName = null;

  if (typeof identifierOrRecord === 'object' && identifierOrRecord !== null) {
    uid = identifierOrRecord.userId || identifierOrRecord.cashierId || identifierOrRecord.managerId || identifierOrRecord.openedByUserId || identifierOrRecord.closedByUserId;
    rawName = identifierOrRecord.cashier || identifierOrRecord.cashierName || identifierOrRecord.userName || identifierOrRecord.user || identifierOrRecord.managerName;
  } else if (typeof identifierOrRecord === 'string') {
    uid = identifierOrRecord;
    rawName = identifierOrRecord;
  }

  const safeUsers = Array.isArray(users) ? users : [];

  // 1. فحص المطابقة المباشرة بالمعرف الثابت (User ID)
  if (uid) {
    const userById = safeUsers.find(u => u && u.id === uid);
    if (userById?.name) return userById.name;
  }

  // 2. معالجة وتطهير السجلات الموروثة 'admin' أو 'ادمن' أو 'مدير النظام'
  const isLegacyAdmin = 
    uid === 'admin' || 
    uid === 'user-2' ||
    Boolean(rawName && (
      String(rawName).trim().toLowerCase() === 'admin' ||
      String(rawName).trim() === 'ادمن' ||
      String(rawName).trim() === 'أدمن' ||
      String(rawName).trim() === 'الادمن' ||
      String(rawName).trim() === 'الأدمن' ||
      String(rawName).trim() === 'مدير' ||
      String(rawName).trim() === 'مدير النظام'
    ));

  if (isLegacyAdmin) {
    const adminUser = safeUsers.find(u => u && (u.role === 'admin' || u.id === 'user-2' || u.id === 'admin'));
    if (adminUser?.name) return adminUser.name;
    return 'المدير';
  }

  // 3. مطابقة الاسم النصي القديم إن وجد في المستخدمين (مثلاً لو كان الكاشير مسجل باسم سابق)
  if (rawName) {
    const cleanRaw = String(rawName).trim();
    const userByName = safeUsers.find(u => u && u.name && u.name.trim() === cleanRaw);
    if (userByName?.name) return userByName.name;
    return cleanRaw;
  }

  return 'كاشير';
};

/**
 * جلب قائمة وسائل الدفع المعتمدة مع الضمان الكامل لعدم فقدان أي وسيلة أساسية
 */
export const getEffectivePaymentMethods = (configuredMethods = null) => {
  if (Array.isArray(configuredMethods) && configuredMethods.length > 0) {
    return configuredMethods;
  }
  return INITIAL_PAYMENT_METHODS;
};

/**
 * مطابقة وحل كائن وسيلة الدفع ديناميكياً من الإعدادات
 * يضمن أنه إذا قام التاجر بتغيير اسم أي وسيلة دفع في الإعدادات (مثلاً تغيير شبكة إلى مدى)، يتغير فوراً في كل النظام
 */
export const resolvePaymentMethod = (identifierOrRecord, configuredMethods = null) => {
  const methods = getEffectivePaymentMethods(configuredMethods);
  let id = '';
  let rawName = '';
  let type = '';

  if (identifierOrRecord && typeof identifierOrRecord === 'object') {
    id = identifierOrRecord.id || identifierOrRecord.paymentMethod || identifierOrRecord.methodId;
    rawName = identifierOrRecord.name || identifierOrRecord.paymentMethodName || identifierOrRecord.methodName;
    type = identifierOrRecord.type || identifierOrRecord.paymentMethodType || identifierOrRecord.methodType;
  } else if (typeof identifierOrRecord === 'string') {
    id = identifierOrRecord;
    rawName = identifierOrRecord;
  }

  const cleanId = String(id || '').trim().toLowerCase();
  const cleanRaw = String(rawName || '').trim().toLowerCase();

  // 1. فحص المطابقة المباشرة بالـ id
  if (cleanId) {
    const foundById = methods.find(m => m && String(m.id).trim().toLowerCase() === cleanId);
    if (foundById) return foundById;
  }

  // 2. فحص المطابقة المباشرة بالاسم النصي الحالي
  if (cleanRaw) {
    const foundByName = methods.find(m => m && String(m.name).trim().toLowerCase() === cleanRaw);
    if (foundByName) return foundByName;
  }

  // 3. مطابقة الأسماء والمترادفات التاريخية الشائعة
  if (cleanId === 'cash' || cleanId.includes('كاش') || cleanId.includes('نقد') || cleanRaw.includes('كاش') || cleanRaw.includes('نقد')) {
    const m = methods.find(x => x && (x.id === 'cash' || x.type === 'cash' || (x.name && (x.name.includes('كاش') || x.name.includes('نقد')))));
    if (m) return m;
  }
  if (cleanId === 'card' || cleanId === 'mada' || cleanId.includes('شبك') || cleanId.includes('مدى') || cleanRaw.includes('شبك') || cleanRaw.includes('مدى')) {
    const m = methods.find(x => x && (x.id === 'card' || x.id === 'mada' || (x.name && (x.name.includes('شبك') || x.name.includes('مدى')))));
    if (m) return m;
  }
  if (cleanId === 'transfer' || cleanId === 'bank' || cleanId.includes('تحويل') || cleanId.includes('بنك') || cleanRaw.includes('تحويل') || cleanRaw.includes('بنك')) {
    const m = methods.find(x => x && (x.id === 'transfer' || x.id === 'bank' || (x.name && (x.name.includes('تحويل') || x.name.includes('بنك')))));
    if (m) return m;
  }
  if (cleanId === 'visa' || cleanId.includes('فيزا') || cleanRaw.includes('فيزا')) {
    const m = methods.find(x => x && (x.id === 'visa' || (x.name && x.name.includes('فيزا'))));
    if (m) return m;
  }
  if (cleanId === 'tamara' || cleanId.includes('تمارا') || cleanRaw.includes('تمارا')) {
    const m = methods.find(x => x && (x.id === 'tamara' || (x.name && x.name.includes('تمارا'))));
    if (m) return m;
  }
  if (cleanId === 'ninja' || cleanId.includes('نينجا') || cleanRaw.includes('نينجا')) {
    const m = methods.find(x => x && (x.id === 'ninja' || (x.name && x.name.includes('نينجا'))));
    if (m) return m;
  }
  if (cleanId === 'tabby' || cleanId.includes('تابي') || cleanRaw.includes('تابي')) {
    const m = methods.find(x => x && (x.id === 'tabby' || (x.name && x.name.includes('تابي'))));
    if (m) return m;
  }
  if (cleanId === 'credit' || cleanId.includes('آجل') || cleanId.includes('اجل') || cleanRaw.includes('آجل') || cleanRaw.includes('اجل')) {
    const m = methods.find(x => x && (x.id === 'credit' || x.type === 'credit' || (x.name && (x.name.includes('آجل') || x.name.includes('اجل')))));
    if (m) return m;
  }
  if (cleanId === 'split' || cleanId.includes('مقسم') || cleanId.includes('مجزأ') || cleanRaw.includes('مقسم') || cleanRaw.includes('مجزأ')) {
    const m = methods.find(x => x && (x.id === 'split' || x.type === 'split'));
    if (m) return m;
    return { id: 'split', name: 'دفع مقسم (متعدد)', type: 'split' };
  }

  return {
    id: cleanId || 'cash',
    name: rawName || 'نقداً',
    type: type || 'cash',
    image: DEFAULT_PAYMENT_ICONS[cleanId] || ''
  };
};

/**
 * استخراج الاسم الموحد والمحدث لوسيلة الدفع
 */
export const resolvePaymentMethodName = (identifierOrRecord, configuredMethods = null) => {
  const m = resolvePaymentMethod(identifierOrRecord, configuredMethods);
  return m?.name || 'نقداً';
};

/**
 * استخراج الأيقونة أو الشعار الرسمي لوسيلة الدفع
 */

/**
 * حساب تفصيل مبالغ وسائل الدفع لأي فاتورة بدقة (نقدي، شبكة، آجل، تحويل، تمارا، نينجا، إلخ)
 */
export const calculateInvoicePaymentBreakdown = (inv) => {
  let cash = 0;
  let card = 0;
  let credit = 0;
  let transfer = 0;
  let tamara = 0;
  let ninja = 0;
  let visa = 0;
  const byMethod = {};

  if (!inv) return { cash: 0, card: 0, credit: 0, transfer: 0, tamara: 0, ninja: 0, visa: 0, byMethod: {}, total: 0 };

  const tot = Number(inv.total) || 0;

  if (inv.splitPayments && Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) {
    inv.splitPayments.forEach(sp => {
      const amt = Number(sp.amount) || 0;
      if (amt <= 0) return;
      const mId = sp.methodId || '';
      const mType = sp.methodType || '';

      byMethod[mId] = (byMethod[mId] || 0) + amt;

      if (mType === 'cash' || mId === 'cash') cash += amt;
      else if (mType === 'credit' || mId === 'credit') credit += amt;
      else if (mType === 'online' || mId === 'transfer' || mId === 'bank') transfer += amt;
      else if (mId === 'tamara') tamara += amt;
      else if (mId === 'ninja') ninja += amt;
      else if (mId === 'visa') visa += amt;
      else card += amt;
    });
  } else if (inv.paymentMethodType === 'split' || inv.paymentMethod === 'split') {
    const sCash = Number(inv.splitCash) || 0;
    const sCard = Number(inv.splitCard) || 0;
    const sCredit = Number(inv.splitCredit) || 0;
    const sTransfer = Number(inv.splitTransfer) || 0;

    if (sCash > 0) { cash += sCash; byMethod['cash'] = (byMethod['cash'] || 0) + sCash; }
    if (sCard > 0) { card += sCard; byMethod['card'] = (byMethod['card'] || 0) + sCard; }
    if (sCredit > 0) { credit += sCredit; byMethod['credit'] = (byMethod['credit'] || 0) + sCredit; }
    if (sTransfer > 0) { transfer += sTransfer; byMethod['transfer'] = (byMethod['transfer'] || 0) + sTransfer; }
  } else {
    const mId = inv.paymentMethod || 'cash';
    const mType = inv.paymentMethodType || 'cash';

    byMethod[mId] = (byMethod[mId] || 0) + tot;

    if (mType === 'cash' || mId === 'cash') cash += tot;
    else if (mType === 'credit' || mId === 'credit') credit += tot;
    else if (mType === 'online' || mId === 'transfer' || mId === 'bank') transfer += tot;
    else if (mId === 'tamara') tamara += tot;
    else if (mId === 'ninja') ninja += tot;
    else if (mId === 'visa') visa += tot;
    else card += tot;
  }

  return {
    cash,
    card,
    credit,
    transfer,
    tamara,
    ninja,
    visa,
    byMethod,
    total: tot
  };
};


// =========================================================================
// تفصيل المبيعات حسب وسيلة الدفع (يُستخدم في شاشة التقارير بكل تبويباتها)
// كان هذا الحساب موجوداً داخل تبويب "وسائل الدفع" فقط، بينما تبويبات
// المؤشرات وأداء الكاشيرات تستخدم النتيجة — فكانت الشاشة تتعطل بخطأ
// paymentBreakdown is not defined. صار الحساب هنا ويُمرَّر لكل التبويبات.
// =========================================================================
export const buildPaymentBreakdown = (invoicesList, storeInfo) => {
  const methodsMap = {};
  const configuredMethods = storeInfo?.paymentMethods || [];

  configuredMethods.forEach(m => {
    if (m && m.id && m.id !== 'split' && m.type !== 'split') {
      methodsMap[m.id] = {
        id: m.id,
        name: m.name || m.subtitle || m.id,
        type: m.type || 'card',
        amount: 0,
        count: 0
      };
    }
  });

  (invoicesList || []).forEach(inv => {
    if (!inv || inv.status === 'refunded') return;
    const isSplit = (Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) ||
      inv.paymentMethod === 'split' || inv.paymentMethodType === 'split';

    if (isSplit && Array.isArray(inv.splitPayments)) {
      inv.splitPayments.forEach(sp => {
        const mId = sp.methodId || sp.id || (sp.methodType === 'cash' ? 'cash' : 'card');
        const mType = sp.methodType || (mId === 'cash' ? 'cash' : 'card');
        const mName = sp.methodName || sp.name || resolvePaymentMethodName(mId, storeInfo);
        const amt = Number(sp.amount) || 0;
        if (amt <= 0) return;
        if (!methodsMap[mId]) {
          methodsMap[mId] = { id: mId, name: mName, type: mType, amount: 0, count: 0 };
        }
        methodsMap[mId].amount += amt;
        methodsMap[mId].count += 1;
      });
    } else {
      const mId = inv.paymentMethod || inv.paymentMethodType || 'cash';
      const mType = inv.paymentMethodType || (mId === 'cash' ? 'cash' : 'card');
      const mName = inv.paymentMethodName || resolvePaymentMethodName(mId, storeInfo);
      const amt = Number(inv.total) || 0;
      if (!methodsMap[mId]) {
        methodsMap[mId] = { id: mId, name: mName, type: mType, amount: 0, count: 0 };
      }
      methodsMap[mId].amount += amt;
      methodsMap[mId].count += 1;
    }
  });

  const totalKnown = Object.values(methodsMap).reduce((s, x) => s + x.amount, 0);
  return Object.values(methodsMap)
    .map(m => ({ ...m, percentage: totalKnown > 0 ? Math.round((m.amount / totalKnown) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
};

// =========================================================================
// حساب عمولة تسوية الشبكة/المنصات
// كل وسيلة دفع لها نسبتها الخاصة (مدى تختلف عن فيزا) وقد يكون عليها عمولة
// ثابتة لكل عملية (ريال أو ريالان)، مع خيار إضافة ضريبة على العمولة نفسها.
// =========================================================================
export const calculateSettlementCommission = ({
  gross = 0,
  count = 0,
  rate = 0,
  fixedPerTx = 0,
  vatEnabled = false,
  vatRate = 15
} = {}) => {
  const g = Number(gross) || 0;
  const c = Math.max(0, Number(count) || 0);
  const percentPart = g * ((Number(rate) || 0) / 100);
  const fixedPart = c * (Number(fixedPerTx) || 0);
  const beforeVat = percentPart + fixedPart;
  const vat = vatEnabled ? beforeVat * ((Number(vatRate) || 15) / 100) : 0;
  const total = Number((beforeVat + vat).toFixed(2));
  return {
    percentPart: Number(percentPart.toFixed(2)),
    fixedPart: Number(fixedPart.toFixed(2)),
    vat: Number(vat.toFixed(2)),
    total,
    net: Number((g - total).toFixed(2))
  };
};

// إرجاع إعدادات عمولة وسيلة دفع معيّنة من إعدادات المتجر
export const getMethodCommissionSettings = (methodId, storeInfo) => {
  const m = (storeInfo?.paymentMethods || []).find(x => x && x.id === methodId);
  return {
    rate: Number(m?.commissionRate) || 0,
    fixedPerTx: Number(m?.commissionFixed) || 0,
    name: m?.name || methodId
  };
};
