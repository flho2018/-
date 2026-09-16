// =========================================================================
//  كشف انحراف ساعة الجهاز عن ساعة الخادم
// =========================================================================
//  لماذا هذا الملف موجود:
//  محرّك المزامنة يحسم كل تعارض بـ `updatedAt` المكتوب من **ساعة الجهاز**
//  (`Date.now()`)، لا من `serverTimestamp`. فجهاز ساعته متقدّمة نصف ساعة
//  «يفوز» بكل تعارض ولو كانت نسخته أقدم فعلاً، وجهاز متأخّر يخسر تعديلاته
//  الصحيحة. والنتيجة رقمان مختلفان على جهازين، وسبب لا يظهر في أي سجل.
//
//  الحل الجذري هو `serverTimestamp` في كل كتابة — وهو تغيير واسع في دلالات
//  الوقت عبر المحرّك كله، لا يصحّ تنفيذه بلا بيئة اختبار بجهازين. فالخطوة
//  الآمنة المتاحة الآن: **قياس الانحراف وإظهاره**. عطلٌ مرئي أهون بكثير من
//  عطل صامت يُخطئ الأرقام ولا يُعرف سببه.
//
//  القياس بلا كتابة: ترويسة `Date` في استجابة HTTP من خادم Google تحمل وقت
//  الخادم. نطلب المستند الأخفّ الممكن (`HEAD`) ونقارن. ونطرح نصف زمن الرحلة
//  فلا يُحسَب بطء الشبكة انحرافاً في الساعة.
// =========================================================================

/** حدّ التسامح: تحته لا يُقلق أحد. فوقه ترتيب الأحداث بين الأجهزة يصير مشكوكاً فيه */
export const SKEW_WARN_MS = 2 * 60 * 1000;   // دقيقتان

/**
 * يقيس فرق ساعة الجهاز عن ساعة الخادم بالملّي ثانية.
 * موجب = ساعة الجهاز **متقدّمة**، سالب = متأخّرة.
 * يرجع null إذا تعذّر القياس (بلا إنترنت مثلاً) — وغياب القياس ليس انحرافاً.
 */
export const measureClockSkew = async (url = 'https://firestore.googleapis.com/') => {
  try {
    const sentAt = Date.now();
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store', mode: 'cors' });
    const receivedAt = Date.now();

    const serverDate = res.headers.get('date');
    if (!serverDate) return null;

    const serverMs = new Date(serverDate).getTime();
    if (!Number.isFinite(serverMs)) return null;

    // منتصف الرحلة هو أقرب تقدير للحظة التي قرأ فيها الخادم ساعته
    const roundTrip = receivedAt - sentAt;
    const deviceAtServerMoment = sentAt + roundTrip / 2;

    return Math.round(deviceAtServerMoment - serverMs);
  } catch (e) {
    return null;
  }
};

/** صياغة الانحراف بالعربية بصيغة يفهمها صاحب المتجر لا المبرمج */
export const describeSkew = (skewMs) => {
  if (skewMs === null || skewMs === undefined) return '';
  const ahead = skewMs > 0;
  const abs = Math.abs(skewMs);
  const mins = Math.floor(abs / 60000);
  const secs = Math.round((abs % 60000) / 1000);
  const amount = mins > 0 ? `${mins} دقيقة${secs ? ` و${secs} ثانية` : ''}` : `${secs} ثانية`;
  return `ساعة هذا الجهاز ${ahead ? 'متقدّمة' : 'متأخّرة'} ${amount} عن الوقت الصحيح`;
};

/** هل الانحراف كبير بما يكفي ليُفسد ترتيب الأحداث بين الأجهزة؟ */
export const isSkewDangerous = (skewMs) =>
  skewMs !== null && skewMs !== undefined && Math.abs(skewMs) > SKEW_WARN_MS;
