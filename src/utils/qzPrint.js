// =========================================================================
//  طبقة توجيه الطباعة عبر QZ Tray
// =========================================================================
//  المشكلة التي تحلّها: المتصفّح لا يسمح لصفحة باختيار طابعة بالاسم — هذا
//  قيد أمني في كل المتصفحات. فكانت النتيجة أن حقلَي printerName و
//  barcodePrinterName في الإعدادات يُحفظان ولا يُقرآن في أي مكان، فيظن
//  المتجر أنه ربط طابعتين وهو لم يربط شيئاً. و --kiosk-printing يطبع
//  صامتاً لكن على طابعة ويندوز الافتراضية وحدها، فتذهب الملصقات إلى
//  طابعة الفواتير.
//
//  QZ Tray برنامج صغير يعمل على جهاز الكاشير ويفتح مقبساً محلياً، فتستطيع
//  الصفحة أن تحدّد الطابعة بالاسم، أو ترسل مباشرةً إلى طابعة شبكة بـ
//  IP ومنفذ بلا تعريف مثبّت أصلاً.
//
//  قاعدة ثابتة هنا: البرنامج يجب ألّا يتعطّل على جهاز بلا QZ. كل دالة
//  تُرجع نتيجة تقول "لم يُستعمل QZ" فيرجع المتصل إلى الطباعة العادية.
// =========================================================================

// اسم الحزمة يُحمَّل عند أول حاجة فقط: لا سبب لتضخيم الحزمة الأساسية
// على أجهزة لا تطبع أصلاً (جوال المدير مثلاً).
let qzModule = null;
let loadingPromise = null;

const loadQz = async () => {
  if (qzModule) return qzModule;
  if (loadingPromise) return loadingPromise;
  loadingPromise = import('qz-tray')
    .then(m => { qzModule = m.default || m; return qzModule; })
    .catch(e => { loadingPromise = null; throw e; });
  return loadingPromise;
};

// حالة الاتصال — تُقرأ من الواجهة لعرض مؤشّر "متصل / غير متصل"
let lastStatus = { connected: false, checkedAt: 0, error: null };

export const getQzStatus = () => ({ ...lastStatus });

// =========================================================================
//  الاتصال
// =========================================================================
//  QZ ينصت على wss://localhost:8181 (وws على 8182). محاولة الاتصال
//  سريعة الفشل عمداً: لو لم يكن مثبّتاً فلا نُعلّق الكاشير ثوانيَ عند كل
//  فاتورة. المهلة القصيرة كافية لأن الخادم محلي.
// =========================================================================
export const connectQz = async ({ timeoutMs = 2500, retries = 0 } = {}) => {
  try {
    const qz = await loadQz();
    if (qz.websocket.isActive()) {
      lastStatus = { connected: true, checkedAt: Date.now(), error: null };
      return { success: true, already: true };
    }
    await qz.websocket.connect({ retries, delay: 0, keepAlive: 60, usingSecure: true })
      .catch(async (err) => {
        // بعض التثبيتات لا تملك شهادة localhost صالحة، فنجرّب غير المؤمَّن
        if (qz.websocket.isActive()) return;
        return qz.websocket.connect({ retries: 0, delay: 0, usingSecure: false });
      });
    lastStatus = { connected: true, checkedAt: Date.now(), error: null };
    return { success: true };
  } catch (err) {
    lastStatus = {
      connected: false,
      checkedAt: Date.now(),
      error: err?.message || String(err)
    };
    return { success: false, error: err };
  }
};

export const isQzConnected = async () => {
  try {
    const qz = await loadQz();
    return qz.websocket.isActive();
  } catch (e) {
    return false;
  }
};

export const disconnectQz = async () => {
  try {
    const qz = await loadQz();
    if (qz.websocket.isActive()) await qz.websocket.disconnect();
    lastStatus = { connected: false, checkedAt: Date.now(), error: null };
    return { success: true };
  } catch (e) {
    return { success: false, error: e };
  }
};

// =========================================================================
//  اكتشاف الطابعات — بديل خانة نصّية يكتب فيها الموظف اسماً قد يخطئ فيه
// =========================================================================
export const listPrinters = async () => {
  const conn = await connectQz();
  if (!conn.success) return { success: false, printers: [], error: conn.error };
  try {
    const qz = await loadQz();
    const printers = await qz.printers.find();
    let dflt = '';
    try { dflt = await qz.printers.getDefault(); } catch (e) {}
    return {
      success: true,
      printers: Array.isArray(printers) ? printers : [printers].filter(Boolean),
      defaultPrinter: dflt || ''
    };
  } catch (err) {
    return { success: false, printers: [], error: err };
  }
};

export const getDefaultPrinter = async () => {
  const conn = await connectQz();
  if (!conn.success) return '';
  try {
    const qz = await loadQz();
    return (await qz.printers.getDefault()) || '';
  } catch (e) {
    return '';
  }
};

// =========================================================================
//  الوجهة: كيف تُقرأ إعدادات الطابعة لكل غرض
// =========================================================================
//  الأغراض: 'invoice' الفواتير، 'report' التقارير والسندات، 'barcode'
//  ملصقات الباركود. الافتراضي المطلوب: الفواتير والتقارير على الطابعة
//  الافتراضية للنظام، والباركود على المحفوظة في الإعدادات.
//
//  أوضاع كل طابعة:
//    default  → طابعة ويندوز الافتراضية (يسألها QZ لحظة الطباعة)
//    name     → طابعة مثبَّتة مختارة بالاسم (محلية أو شبكة معرَّفة)
//    network  → إرسال مباشر إلى IP ومنفذ (9100 غالباً) بلا تعريف مثبّت
// =========================================================================
export const PRINT_PURPOSES = ['invoice', 'report', 'barcode'];

const DEFAULT_TARGETS = {
  invoice: { mode: 'default', name: '', host: '', port: 9100 },
  report: { mode: 'follow_invoice', name: '', host: '', port: 9100 },
  barcode: { mode: 'name', name: '', host: '', port: 9100 }
};

export const getPrinterTarget = (purpose, storeInfo) => {
  const cfg = storeInfo?.printers || {};
  let t = { ...DEFAULT_TARGETS[purpose], ...(cfg[purpose] || {}) };
  // التقارير تتبع الفواتير ما لم تُفرد بإعداد خاص
  if (purpose === 'report' && t.mode === 'follow_invoice') {
    t = { ...DEFAULT_TARGETS.invoice, ...(cfg.invoice || {}) };
  }
  return t;
};

// وصف مقروء للوجهة — يظهر في الإعدادات وفي رسائل الأخطاء
export const describeTarget = (t) => {
  if (!t) return 'غير محدّدة';
  if (t.mode === 'default') return 'الطابعة الافتراضية للنظام';
  if (t.mode === 'network') return `شبكة ${t.host || '—'}:${t.port || 9100}`;
  return t.name ? `الطابعة: ${t.name}` : 'لم تُختر طابعة بعد';
};

const buildConfig = async (target) => {
  const qz = await loadQz();
  if (target.mode === 'network') {
    if (!target.host) throw new Error('عنوان طابعة الشبكة غير مضبوط');
    return qz.configs.create({ host: target.host, port: Number(target.port) || 9100 });
  }
  let printerName = target.name;
  if (target.mode === 'default' || !printerName) {
    printerName = await qz.printers.getDefault();
    if (!printerName) throw new Error('لا توجد طابعة افتراضية في النظام');
  }
  return qz.configs.create(printerName);
};

// =========================================================================
//  الطباعة
// =========================================================================
//  printHtmlViaQz ترسل نفس HTML الذي تبنيه دوال الفواتير حالياً، فلا
//  يُعاد تصميم شيء لمجرّد تغيير مسار الطباعة.
//  handled=false تعني "لم أطبع، اطبع بالطريقة القديمة" — وهي الحالة
//  الطبيعية على أي جهاز بلا QZ، وليست خطأً.
// =========================================================================
export const printHtmlViaQz = async (html, { purpose = 'invoice', storeInfo, widthInches } = {}) => {
  if (!storeInfo?.printers?.useQz) return { handled: false, reason: 'disabled' };

  const conn = await connectQz();
  if (!conn.success) return { handled: false, reason: 'unavailable', error: conn.error };

  try {
    const qz = await loadQz();
    const target = getPrinterTarget(purpose, storeInfo);
    const config = await buildConfig(target);

    const data = [{
      type: 'pixel',
      format: 'html',
      flavor: 'plain',
      data: html,
      options: widthInches ? { pageWidth: widthInches } : undefined
    }];

    await qz.print(config, data);
    return { handled: true, target: describeTarget(target) };
  } catch (err) {
    console.warn('[QZ] فشلت الطباعة عبر QZ، سيُرجع للطباعة العادية:', err?.message || err);
    return { handled: false, reason: 'error', error: err };
  }
};

// الطباعة الخام: أوامر ESC/POS للفواتير الحرارية و TSPL/ZPL للملصقات.
// أدقّ وأسرع من HTML، وتضبط مقاس الملصق بالملّيمتر بلا اعتماد على تحجيم
// المتصفّح — وهي سبب اختيار QZ أصلاً لطباعة الباركود.
export const printRawViaQz = async (commands, { purpose = 'barcode', storeInfo } = {}) => {
  if (!storeInfo?.printers?.useQz) return { handled: false, reason: 'disabled' };

  const conn = await connectQz();
  if (!conn.success) return { handled: false, reason: 'unavailable', error: conn.error };

  try {
    const qz = await loadQz();
    const target = getPrinterTarget(purpose, storeInfo);
    const config = await buildConfig(target);

    const payload = (Array.isArray(commands) ? commands : [commands]).map(c => ({
      type: 'raw',
      format: 'command',
      flavor: 'plain',
      data: String(c)
    }));

    await qz.print(config, payload);
    return { handled: true, target: describeTarget(target) };
  } catch (err) {
    console.warn('[QZ] فشلت الطباعة الخام:', err?.message || err);
    return { handled: false, reason: 'error', error: err };
  }
};

// =========================================================================
//  اختبار الطابعة من شاشة الإعدادات
// =========================================================================
//  لا قيمة لإعداد طابعة لا يستطيع الموظف التأكّد من وصوله. هذه تطبع
//  صفحة تعريف قصيرة على الوجهة المطلوبة وتُرجع وصفها.
// =========================================================================
export const testPrint = async (purpose, storeInfo) => {
  const target = getPrinterTarget(purpose, storeInfo);
  const label = purpose === 'barcode' ? 'ملصق باركود' : purpose === 'report' ? 'تقرير' : 'فاتورة';
  const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8">
    <style>body{font-family:Cairo,Tahoma,sans-serif;text-align:center;padding:8px;}
    h3{margin:4px 0;font-size:15px}p{margin:2px 0;font-size:12px}</style></head>
    <body><h3>✅ اختبار طباعة ${label}</h3>
    <p>${(storeInfo?.name || 'بيت الورد').replace(/[<>&]/g, '')}</p>
    <p>${describeTarget(target)}</p>
    <p>${new Date().toLocaleString('ar-SA')}</p></body></html>`;

  const res = await printHtmlViaQz(html, { purpose, storeInfo });
  if (res.handled) return { success: true, message: `أُرسلت صفحة الاختبار إلى ${res.target}` };
  if (res.reason === 'disabled') return { success: false, message: 'توجيه QZ غير مفعّل في الإعدادات' };
  if (res.reason === 'unavailable') return { success: false, message: 'QZ Tray غير مثبَّت أو غير مشغَّل على هذا الجهاز' };
  return { success: false, message: 'تعذّرت الطباعة: ' + (res.error?.message || 'سبب غير معروف') };
};
