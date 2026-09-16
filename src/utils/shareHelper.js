// =========================================================================
// أداة الإرسال والتصدير الموحّدة — بيت الورد
// تحوّل أي محتوى (فاتورة / تقرير / وردية) إلى صورة أو PDF أو نص،
// وترسله عبر واتساب أو تحفظه، حسب الإعدادات المحفوظة في المتجر.
//
// ملاحظة مهمة: المتصفح لا يسمح بإرسال ملف تلقائياً إلى واتساب. الطريقة
// العملية: نجهّز الملف ونفتح نافذة المشاركة (Web Share) إن كانت متاحة —
// وهي تعرض واتساب مباشرة — وإلا نحفظ الملف ونفتح محادثة واتساب بالنص،
// فيرفق المستخدم الملف بضغطة واحدة.
// =========================================================================

import html2canvas from 'html2canvas';
import { getWhatsAppUrls } from './helpers';

// تحويل عنصر في الصفحة إلى صورة PNG عالية الدقة
export const captureElementImage = async (element, options = {}) => {
  if (!element) return null;
  const canvas = await html2canvas(element, {
    scale: options.scale || 2,
    backgroundColor: options.backgroundColor || '#ffffff',
    useCORS: true,
    logging: false
  });
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    width: canvas.width,
    height: canvas.height
  };
};

// التقاط مستند HTML كامل (يبدأ بـ <!DOCTYPE html>) داخل إطار مستقل
// حتى لا تتسرّب تنسيقاته (body / .row ...) إلى صفحة البرنامج أثناء الالتقاط.
const captureFullDocumentImage = async (htmlContent, options = {}) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '0';
  iframe.style.width = (options.width || 820) + 'px';
  iframe.style.height = '200px';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return null;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    // مهلة بسيطة لتحميل الخط وحساب التخطيط
    await new Promise(r => setTimeout(r, 650));
    try { if (doc.fonts && doc.fonts.ready) await doc.fonts.ready; } catch (e) {}

    const body = doc.body;
    const height = Math.max(body.scrollHeight, 200);
    const width = Math.max(body.scrollWidth, 300);
    iframe.style.height = height + 'px';
    await new Promise(r => setTimeout(r, 120));

    const canvas = await html2canvas(body, {
      scale: options.scale || (width < 500 ? 3 : 2),
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      width,
      height,
      windowWidth: width,
      windowHeight: height
    });
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
      width: canvas.width,
      height: canvas.height
    };
  } finally {
    try { iframe.remove(); } catch (e) {}
  }
};

// تحويل HTML نصي إلى صورة (يُرسم في إطار مخفي ثم يُلتقط)
export const captureHtmlImage = async (htmlContent, options = {}) => {
  // مستند كامل؟ نلتقطه داخل iframe معزول
  if (/<html[\s>]/i.test(String(htmlContent)) || /<!DOCTYPE/i.test(String(htmlContent))) {
    return await captureFullDocumentImage(htmlContent, options);
  }
  const holder = document.createElement('div');
  holder.style.position = 'fixed';
  holder.style.top = '-10000px';
  holder.style.left = '0';
  holder.style.width = (options.width || 800) + 'px';
  holder.style.background = '#ffffff';
  holder.style.direction = 'rtl';
  holder.innerHTML = htmlContent;
  document.body.appendChild(holder);
  try {
    const img = await captureElementImage(holder, options);
    return img;
  } finally {
    try { holder.remove(); } catch (e) {}
  }
};

// -------------------------------------------------------------------------
// بناء ملف PDF بسيط يحتوي الصورة (بدون أي مكتبة خارجية)
// -------------------------------------------------------------------------
const dataUrlToBytes = (dataUrl) => {
  const base64 = String(dataUrl).split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const imageToPdfBlob = (jpegDataUrl, imgWidth, imgHeight) => {
  const imgBytes = dataUrlToBytes(jpegDataUrl);

  // مقاس الصفحة: نحافظ على نسبة الصورة داخل عرض A4 (595 نقطة)
  const pageWidth = 595;
  const scale = pageWidth / imgWidth;
  const pageHeight = Math.round(imgHeight * scale);

  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;

  const push = (data) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    parts.push(bytes);
    length += bytes.length;
  };
  const startObj = () => { offsets.push(length); };

  push('%PDF-1.4\n');

  startObj();
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObj();
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  startObj();
  push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);

  startObj();
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgWidth} /Height ${imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`);
  push(imgBytes);
  push('\nendstream\nendobj\n');

  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  startObj();
  push(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  const xrefPos = length;
  let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(off => {
    xref += String(off).padStart(10, '0') + ' 00000 n \n';
  });
  push(xref);
  push(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

  return new Blob(parts, { type: 'application/pdf' });
};

const dataUrlToBlob = (dataUrl) => {
  const bytes = dataUrlToBytes(dataUrl);
  const mime = String(dataUrl).substring(5, String(dataUrl).indexOf(';'));
  return new Blob([bytes], { type: mime || 'image/jpeg' });
};

// حفظ ملف على الجهاز
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { a.remove(); URL.revokeObjectURL(url); } catch (e) {}
  }, 1000);
};

// -------------------------------------------------------------------------
// الإرسال الموحّد: صورة / PDF / نص
//   format: 'image' | 'pdf' | 'text'
//   phone : رقم المستقبل (المدير أو العميل)
//   text  : نص الرسالة المرافقة
//   html أو element: مصدر المحتوى للصورة أو الـ PDF
// -------------------------------------------------------------------------
// -------------------------------------------------------------------------
//  فتح واتساب: التطبيق المثبَّت أولاً ثم الويب احتياطاً
// -------------------------------------------------------------------------
//  كان الكود يفتح wa.me دائماً فينتهي في المتصفح/واتساب ويب. الآن نحاول
//  بروتوكول whatsapp:// الذي يُشغّل التطبيق المثبَّت على الكمبيوتر أو الجوال،
//  وإن لم يكن مسجّلاً لن يحدث انتقال فنفتح الرابط العالمي بعد مهلة قصيرة.
// -------------------------------------------------------------------------
export const openWhatsApp = (urls) => {
  if (!urls) return;
  let handled = false;

  const markHandled = () => { handled = true; };
  document.addEventListener('visibilitychange', markHandled, { once: true });
  window.addEventListener('blur', markHandled, { once: true });

  try {
    const a = document.createElement('a');
    a.href = urls.desktopAppUrl;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { a.remove(); } catch (e) {} }, 500);
  } catch (e) {
    handled = false;
  }

  // =======================================================================
  //  لم يلتقط أي تطبيق البروتوكول (الصفحة ما زالت ظاهرة) → الاحتياط
  // =======================================================================
  //  كان هنا `openWhatsApp(urls)` — أي أن الدالة تستدعي **نفسها**. فعلى
  //  جهاز بلا تطبيق واتساب مثبَّت تدخل حلقة لا نهائية: كل ١٫٥ ثانية تعيد
  //  محاولة البروتوكول نفسه الذي فشل، ولا تفتح الويب أبداً، وتُراكم
  //  مستمعي أحداث بلا توقّف. فلا الفاتورة تُرسل ولا الصفحة تهدأ.
  //  الصحيح: الانتقال إلى الرابط العالمي مرة واحدة فقط.
  // =======================================================================
  setTimeout(() => {
    document.removeEventListener('visibilitychange', markHandled);
    window.removeEventListener('blur', markHandled);
    if (!handled && document.visibilityState === 'visible') {
      window.open(urls.universalUrl, '_blank', 'noopener');
    }
  }, 1500);
};

export const shareDocument = async ({
  format = 'text',
  phone = '',
  text = '',
  html = '',
  element = null,
  filename = 'document',
  width = 800
} = {}) => {
  const urls = getWhatsAppUrls(phone, text);

  // إرسال نصي فقط
  if (format === 'text' || (!html && !element)) {
    openWhatsApp(urls);
    return { success: true, mode: 'text' };
  }

  let img = null;
  try {
    img = element ? await captureElementImage(element) : await captureHtmlImage(html, { width });
  } catch (err) {
    console.error('[shareDocument] تعذر تحويل المحتوى لصورة:', err?.message);
    openWhatsApp(urls);
    return { success: false, mode: 'text', error: err };
  }
  if (!img) {
    openWhatsApp(urls);
    return { success: false, mode: 'text' };
  }

  const isPdf = format === 'pdf';
  const blob = isPdf ? imageToPdfBlob(img.dataUrl, img.width, img.height) : dataUrlToBlob(img.dataUrl);
  const name = `${filename}.${isPdf ? 'pdf' : 'jpg'}`;
  const file = new File([blob], name, { type: blob.type });

  // ١) نافذة المشاركة الأصلية (تعرض واتساب مباشرة) — الأفضل على الجوال
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: text || undefined });
      return { success: true, mode: isPdf ? 'pdf-share' : 'image-share' };
    }
  } catch (err) {
    // المستخدم ألغى المشاركة أو المتصفح لا يدعمها — نكمل للطريقة البديلة
    if (err?.name === 'AbortError') return { success: true, mode: 'cancelled' };
  }

  // ٢) نسخ الصورة للحافظة (يتيح اللصق مباشرة في واتساب ويب بـ Ctrl+V)
  let copied = false;
  if (!isPdf) {
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({ [blob.type]: blob })]);
        copied = true;
      }
    } catch (e) {}
  }

  // ٣) حفظ الملف ثم فتح محادثة واتساب بالنص ليُرفق الملف بضغطة
  downloadBlob(blob, name);
  openWhatsApp(urls);

  return { success: true, mode: isPdf ? 'pdf-download' : 'image-download', copied };
};

// الصيغة الافتراضية للإرسال حسب إعدادات المتجر
export const getPreferredShareFormat = (storeInfo) => {
  const ws = storeInfo?.whatsappSettings || {};
  if (ws.defaultShareFormat) return ws.defaultShareFormat;
  if (ws.enableImageExport) return 'image';
  if (ws.enablePdfExport) return 'pdf';
  return 'text';
};

// رقم المدير المسجّل في الإعدادات
export const getManagerPhone = (storeInfo) =>
  storeInfo?.whatsappSettings?.managerPhone || storeInfo?.managerPhone || storeInfo?.phone || '';

