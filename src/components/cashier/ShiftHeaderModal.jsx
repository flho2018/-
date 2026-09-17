import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle, X, Printer, MessageSquare, Lock, Unlock, Image as ImageIcon, Landmark } from 'lucide-react';
import { formatMoney, formatDate, buildShiftWhatsAppMessage, getWhatsAppUrls, resolveUserName } from '../../utils/helpers';
import { printZReportHtml, buildZReportHtml } from '../../utils/printHelper';
import { shareDocument, getPreferredShareFormat, getManagerPhone } from '../../utils/shareHelper';
import { UserSwitchModal } from '../auth/UserSwitchModal';
import { TreasuryDropModal } from './TreasuryDropModal';
import { DEFAULT_PAYMENT_ICONS } from '../../utils/paymentIcons';

import { classifyInvoicePayments, filterInvoicesByShift, filterDrawerTxByShift, calculateShiftCashRefunds, useActiveShifts, computeExpectedCash, sumDrawerCashIn, sumDrawerCashOut, findLastClosedShift } from '../../utils/useShiftMetrics';

export const ShiftHeaderModal = ({ isOpen, onClose }) => {
  const {
    activeShift,
    openNewShift,
    myPendingFloatTotal,
    closeShift,
    shiftsHistory,
    currentUser,
    storeInfo,
    invoices,
    expenses,
    purchases,
    drawerTransactions,
    hasPermission,
    userShifts,
    users
  } = useApp();

  const [isUserSwitchOpen, setIsUserSwitchOpen] = useState(false);
  const [isTreasuryDropOpen, setIsTreasuryDropOpen] = useState(false);

  // البحث عن أي وردية كاشير مفتوحة حالياً في المتجر (من كافة الأجهزة مع منع التكرار نهائياً)
  const allOpenShifts = useActiveShifts(userShifts, users);

  // الوردية الفعالة المعروضة: تخص المستخدم الحالي المسجل دخوله حصراً لمنع التداخل أو خطف وردية كاشير آخر
  const currentUid = currentUser?.id || 'admin';
  const myShift = (userShifts && userShifts[currentUid]) || (activeShift?.userId === currentUid ? activeShift : null);
  const isMyShiftOpen = Boolean(
    myShift && 
    myShift.isOpen === true && 
    myShift.status !== 'closed' &&
    !myShift.closedAt && 
    !(shiftsHistory || []).some(h => h && h.id === myShift.id && (h.status === 'closed' || h.closedAt || h.isOpen === false))
  );

  const effectiveShift = isMyShiftOpen ? myShift : null;
  const isShiftOpen = isMyShiftOpen;

  const currentShiftMetrics = useMemo(() => {
    if (!effectiveShift || !effectiveShift.isOpen) {
      return {
        cashSales: 0, cardSales: 0, creditSales: 0, totalSales: 0,
        cashIn: 0, cashOut: 0, startCash: 0, totalExpenses: 0,
        totalPurchases: 0, expectedCash: 0, invoicesCount: 0
      };
    }

    const openTime = effectiveShift.openedAt ? new Date(effectiveShift.openedAt).getTime() : 0;
    const targetUid = effectiveShift.userId || currentUser?.id || 'admin';
    const targetName = resolveUserName(effectiveShift, users) || currentUser?.name || 'كاشير بيت الورد';

    // ← استخدام الدوال المشتركة بدل التكرار
    const userInvoices = filterInvoicesByShift(invoices, effectiveShift, targetUid, targetName);
    const { breakdown: paymentMethodsBreakdown, cashSales, cardSales, creditSales, splitInvoicesCount } = 
      classifyInvoicePayments(userInvoices, storeInfo?.paymentMethods);
    const userDrawerTx = filterDrawerTxByShift(drawerTransactions, effectiveShift, targetUid, targetName);
    const userCashRefunds = calculateShiftCashRefunds(invoices, effectiveShift, targetUid, targetName);

    // نفس القاعدة في closeShift وشاشة الدرج: حركة المصروف مرجعية للعرض فقط،
    // والعهدة المستلمة كرصيد افتتاحي لا تُجمع ثانيةً كإيداع.
    const cashIn = sumDrawerCashIn(userDrawerTx);
    const cashOut = sumDrawerCashOut(userDrawerTx);
    const treasuryDrops = userDrawerTx.filter(t => t.type === 'treasury_drop').reduce((s, t) => s + (Number(t.amount) || 0), 0);

    // المصروفات والمشتريات خلال الوردية (المصروفة نقداً من درج الكاشير حصراً)
    const userExpenses = (expenses || []).filter(e => {
      if (!e.date || e.isIncome) return false;
      const isDrawerCash = (e.paymentSource === 'drawer' || (!e.paymentSource && e.paymentMethod === 'cash')) && e.paymentMethod === 'cash';
      if (!isDrawerCash) return false;
      if (e.shiftId && effectiveShift.id && e.shiftId === effectiveShift.id) return true;
      const eTime = new Date(e.date).getTime();
      const isUserMatch = (e.userId && e.userId === targetUid) || (e.user === targetName);
      return eTime >= openTime && isUserMatch;
    });

    const userPurchases = (purchases || []).filter(p => {
      if (!p.date) return false;
      const isDrawerCash = (!p.paymentMethod || p.paymentMethod === 'cash') && (p.paymentSource === 'drawer' || !p.paymentSource);
      if (!isDrawerCash) return false;
      if (p.shiftId && effectiveShift.id && p.shiftId === effectiveShift.id) return true;
      const pTime = new Date(p.date).getTime();
      const isUserMatch = (p.userId && p.userId === targetUid) || (p.user === targetName);
      return pTime >= openTime && (isUserMatch || !p.userId);
    });

    const totalCashExpenses = userExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalCashPurchases = userPurchases.reduce((s, p) => s + (Number(p.paidAmount ?? p.totalAmount ?? p.total ?? p.amount) || 0), 0);

    const startCash = Number(effectiveShift?.startCash || activeShift?.startCash) || 0;
    const netCashSales = Math.max(0, cashSales - userCashRefunds);
    const nonCashSales = Object.entries(paymentMethodsBreakdown)
      .filter(([id, m]) => id !== 'cash' && m.type !== 'cash')
      .reduce((s, [, m]) => s + (m.amount || 0), 0);
    const totalSales = netCashSales + nonCashSales;
    // صيغة واحدة مشتركة — انظر computeExpectedCash في useShiftMetrics.js
    const expectedCash = computeExpectedCash({
      startCash, cashSales, cashRefunds: userCashRefunds, cashIn, cashOut,
      cashExpenses: totalCashExpenses, cashPurchases: totalCashPurchases
    });

    return {
      paymentMethodsBreakdown, cashSales, cardSales, creditSales, totalSales,
      cashRefunds: userCashRefunds, cashIn, cashOut, startCash,
      totalExpenses: totalCashExpenses, totalPurchases: totalCashPurchases,
      treasuryDrops, expectedCash,
      invoicesCount: userInvoices.filter(i => i.status !== 'refunded').length,
      splitInvoicesCount,
      paymentOperationsCount: Object.values(paymentMethodsBreakdown).reduce((s, m) => s + (m.count || 0), 0)
    };
  }, [activeShift, currentUser, invoices, drawerTransactions, expenses, purchases, storeInfo]);

  // حالة إغلاق الوردية
  const [actualCashCount, setActualCashCount] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closedZReport, setClosedZReport] = useState(null);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const zReportCardRef = useRef(null);

  // البحث عن آخر وردية مغلقة لنفس المستخدم الحالي لاستخراج الرصيد المرحل تلقائياً
  // آخر وردية مغلقة **زمنياً** — لا أول ما يصادفه في المصفوفة.
  // انظر findLastClosedShift في useShiftMetrics.js لسبب أن الترتيب لا يُعتمد عليه.
  const lastUserClosedShift = useMemo(
    () => findLastClosedShift(shiftsHistory, currentUser),
    [shiftsHistory, currentUser]
  );

  // حالة فتح الوردية مع الترحيل التلقائي الذكي للرصيد المتبقي
  const [openingCashInput, setOpeningCashInput] = useState(() => {
    if (lastUserClosedShift && typeof lastUserClosedShift.actualCash === 'number') {
      return String(lastUserClosedShift.actualCash);
    }
    return String(storeInfo?.defaultStartCash ?? storeInfo?.fixedOpeningCash ?? '0');
  });

  React.useEffect(() => {
    if (!isShiftOpen) {
      if (lastUserClosedShift && typeof lastUserClosedShift.actualCash === 'number') {
        setOpeningCashInput(String(lastUserClosedShift.actualCash));
      } else {
        setOpeningCashInput(String(storeInfo?.defaultStartCash ?? storeInfo?.fixedOpeningCash ?? '0'));
      }
    }
  }, [storeInfo?.defaultStartCash, storeInfo?.fixedOpeningCash, isShiftOpen, lastUserClosedShift]);

  // تصفير وتنظيف حالة التقرير القديم تلقائياً بمجرد إغلاق النافذة أو تبديل الكاشير
  React.useEffect(() => {
    if (!isOpen) {
      setClosedZReport(null);
      setActualCashCount('');
      setCloseNotes('');
      setToastMessage(null);
    }
  }, [isOpen]);

  React.useEffect(() => {
    setClosedZReport(null);
    setActualCashCount('');
    setCloseNotes('');
    setToastMessage(null);
  }, [currentUser?.id]);

  // تفصيل وسائل الدفع النشطة التي تم البيع بها في الوردية الحالية
  const activeShiftPaymentMethods = useMemo(() => {
    if (!currentShiftMetrics?.paymentMethodsBreakdown) return [];
    return Object.values(currentShiftMetrics.paymentMethodsBreakdown).filter(m => Number(m.amount) > 0);
  }, [currentShiftMetrics]);

  const handleCloseModal = () => {
    setClosedZReport(null);
    setActualCashCount('');
    setCloseNotes('');
    setToastMessage(null);
    onClose();
  };

  // العهدة المُسلّمة هي الرصيد الافتتاحي المثبَّت — نعرضها في الحقل مباشرة.
  // يجب أن يبقى هذا الـ hook فوق أي return مشروط. كان موضوعاً تحت
  // `if (!isOpen) return null` فلا يُستدعى إلا عند فتح النافذة، فيختلف عدد
  // الـ hooks بين رسمتين ويسقط المكوّن بخطأ
  // "Rendered more hooks than during the previous render" لحظة فتح الوردية.
  useEffect(() => {
    if (myPendingFloatTotal > 0) setOpeningCashInput(String(myPendingFloatTotal));
  }, [myPendingFloatTotal]);

  if (!isOpen) return null;

  // حساب النقدية المتوقعة
  const expectedCash = currentShiftMetrics.expectedCash;
  const numActual = Number(actualCashCount) || 0;
  const difference = numActual - expectedCash;

  const handleConfirmClose = (e) => {
    e.preventDefault();
    if (!hasPermission('drawer_open_close')) {
      alert('⛔ ليس لديك صلاحية لإغلاق الوردية!');
      return;
    }
    const actual = Number(actualCashCount) || 0;
    const report = closeShift(actual, closeNotes, effectiveShift);
    setClosedZReport(report);

    // إرسال تلقائي لتقرير الوردية إلى واتساب المدير بالصيغة المحفوظة في الإعدادات
    // (يمكن إيقافه من: الإعدادات ← واتساب ← إرسال تقرير الوردية تلقائياً عند الإغلاق)
    if (report && storeInfo?.whatsappSettings?.autoSendShiftReport !== false) {
      setTimeout(() => { sendZReportToManager(report, null); }, 150);
    }
  };

  const handleConfirmOpen = async (e) => {
    e.preventDefault();
    if (!hasPermission('drawer_open_close')) {
      alert('⛔ ليس لديك صلاحية لفتح وردية!');
      return;
    }
    // openNewShift يكتشف الوردية القائمة ويستأنفها بنفسه؛ الرفض المسبق
    // كان يترك المستخدم بلا وردية فعّالة وبلا قدرة على فتح واحدة.
    const initialCash = Number(openingCashInput) || 0;
    // انتظار الفتح قبل إغلاق النافذة: وإلا أُغلقت الشاشة فوق سؤال الوردية السابقة
    await openNewShift(initialCash);
    setClosedZReport(null);
    setActualCashCount('');
    setCloseNotes('');
    setToastMessage(null);
    onClose();
  };

  // دالة ذكية لفتح الواتساب عبر تطبيق سطح المكتب المباشر أو الويب
  const openWhatsAppSmart = (phone, text) => {
    const urls = getWhatsAppUrls(phone, text);
    const isDesktop = !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isDesktop) {
      const link = document.createElement('a');
      link.href = urls.desktopAppUrl;
      link.click();

      setTimeout(() => {
        window.open(urls.universalUrl, '_blank');
      }, 1200);
    } else {
      window.open(urls.universalUrl, '_blank');
    }
  };

  // طباعة حرارية معزولة ونظيفة للـ Z-Report
  const handlePrintZReport = () => {
    if (!closedZReport) return;

    try {
      printZReportHtml(closedZReport, storeInfo, users);
    } catch (err) {
      console.error('Print Z-Report Error:', err);
      // `window.print()` حُذف من هنا: كان «احتياطاً» يطبع **الصفحة كلها** لا
      // المستند — فيُهدر ورقاً حرارياً ويُخرج شيئاً لا يشبه الإيصال. وهو كود
      // ميت أصلاً: دوال الطباعة غير متزامنة ولا ترفض، فهذا الـ catch لا يعمل.
      // الإعلان عن الفشل صار من `printHtmlDirectly` نفسها (نقطة الطباعة الوحيدة).
    }
  };

  // ================= إرسال تقرير الوردية للمدير =================
  // الصيغة (صورة / PDF / نص) تُقرأ من الإعدادات:
  //   الإعدادات ← واتساب ← "الصيغة الافتراضية عند الإرسال"
  // والرقم من: الإعدادات ← واتساب ← رقم المدير
  const sendZReportToManager = async (report = closedZReport, formatOverride = null) => {
    if (!report) return;
    const targetPhone = getManagerPhone(storeInfo);
    if (!targetPhone) {
      setToastMessage('⚠️ لا يوجد رقم مدير محفوظ. أضِفه من: الإعدادات ← واتساب ← رقم المدير.');
      setTimeout(() => setToastMessage(null), 6000);
      return;
    }

    const format = formatOverride || getPreferredShareFormat(storeInfo);
    const fullText = buildShiftWhatsAppMessage(report, storeInfo);
    // مع الصورة/الـPDF نرسل تعليقاً قصيراً فقط، لأن إرسال التقرير كاملاً كنص
    // مع الصورة هو سبب ظهور الرسالة "نصية" في واتساب.
    const caption =
      `🌸 تقرير إغلاق وردية${report.id ? ' #' + report.id : ''} — ${storeInfo?.name || 'بيت الورد'}\n` +
      `📅 ${formatDate(new Date())}\n` +
      `(التقرير مرفق ${format === 'pdf' ? 'كملف PDF 📄' : 'كصورة 🖼️'})`;

    try {
      setIsExportingImage(true);
      if (format !== 'text') setToastMessage('جاري تجهيز تقرير الوردية للإرسال...');

      const res = await shareDocument({
        format,
        phone: targetPhone,
        text: format === 'text' ? fullText : caption,
        html: format === 'text' ? '' : buildZReportHtml(report, storeInfo, users),
        filename: `تقرير_وردية_${report.id || Date.now()}`,
        width: 820
      });

      if (format === 'text') {
        setToastMessage('✅ تم فتح واتساب مع نص التقرير.');
      } else if (res?.mode === 'image-share' || res?.mode === 'pdf-share') {
        setToastMessage('✅ تم إرسال التقرير للمدير 🌸');
      } else if (res?.copied) {
        setToastMessage('✅ تم نسخ صورة التقرير وتنزيلها وفتح واتساب — الصق بـ Ctrl + V ثم أرسل 🌸');
      } else {
        setToastMessage('✅ تم حفظ ملف التقرير وفتح واتساب — أرفق الملف المحفوظ ثم أرسل 🌸');
      }
    } catch (err) {
      console.error('Send Z-Report Error:', err);
      setToastMessage('⚠️ تعذّر تجهيز الملف، تم فتح واتساب بالنص.');
      openWhatsAppSmart(targetPhone, fullText);
    } finally {
      setIsExportingImage(false);
      setTimeout(() => setToastMessage(null), 7000);
    }
  };

  // زر الإرسال: يتبع الصيغة المحفوظة في الإعدادات
  const handleSendZReport = () => sendZReportToManager(closedZReport, null);
  // زر احتياطي: نص فقط
  const handleSendWhatsAppText = () => sendZReportToManager(closedZReport, 'text');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-pink-200 animate-in zoom-in-95 max-h-[92vh] flex flex-col text-slate-800 text-xs select-none">
        
        {/* رأس النافذة */}
        <div className={`p-4 text-white flex items-center justify-between ${
          closedZReport 
            ? 'bg-gradient-to-r from-purple-800 to-indigo-800' 
            : isShiftOpen 
            ? 'bg-gradient-to-r from-[#380624] via-[#2A0845] to-[#4A0E4E]' 
            : 'bg-gradient-to-r from-emerald-800 to-teal-800'
        }`}>
          <div className="flex items-center gap-2">
            {closedZReport ? (
              <span className="text-xl">📊</span>
            ) : isShiftOpen ? (
              <Lock className="w-5 h-5 text-rose-300" />
            ) : (
              <Unlock className="w-5 h-5 text-emerald-300" />
            )}
            <div>
              <h3 className="font-black text-sm">
                {closedZReport 
                  ? 'تقرير إغلاق الوردية Z-Report' 
                  : isShiftOpen 
                  ? 'إغلاق الوردية الحالية وتسليم العهدة 🔒' 
                  : 'فتح وردية كاشير جديدة 🔓'}
              </h3>
              <p className="text-[10px] text-pink-200/80">
                {closedZReport 
                  ? 'تم إغلاق الوردية بنجاح وتوثيق الحسابات' 
                  : isShiftOpen 
                  ? 'حصر مبيعات ونقدية الدرج وتوثيق الفروقات' 
                  : 'تسجيل الرصيد الافتتاحي وبدء تسجيل الفواتير'}
              </p>
            </div>
          </div>

          <button 
            type="button" 
            onClick={handleCloseModal} 
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* شريط الإشعار والتوجيه الذكي */}
        {toastMessage && (
          <div className="p-3 bg-gradient-to-r from-purple-900 to-pink-900 text-white text-xs font-bold text-center border-b border-pink-400/30 animate-in fade-in flex items-center justify-between gap-2">
            <span>{toastMessage}</span>
            <button onClick={() => setToastMessage(null)} className="text-white/70 hover:text-white text-xs">✕</button>
          </div>
        )}

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          
          {/* شريط معلومات الكاشير النشط مع زر تبديل المستخدم */}
          <div className="p-3 bg-gradient-to-r from-pink-950/90 via-purple-950/90 to-slate-900 text-white rounded-2xl border border-pink-500/30 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-pink-600 flex items-center justify-center font-black text-sm text-white shrink-0">
                {currentUser?.name?.charAt(0) || '👤'}
              </div>
              <div>
                <span className="text-[10px] text-pink-300 block font-bold">الحساب والكاشير المسجل حالياً:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <strong className="text-xs text-white font-black">{currentUser?.name || 'كاشير بيت الورد'}</strong>
                  {isShiftOpen && (
                    <span className="text-[9px] text-pink-200 bg-pink-900/70 border border-pink-400/40 px-1.5 py-0.2 rounded-full font-bold flex items-center gap-1 shadow-xs">
                      <span>☁️</span>
                      <span>وردية سحابية موحدة</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsUserSwitchOpen(true)}
              className="px-2.5 py-1.5 bg-pink-600 hover:bg-pink-500 active:scale-95 text-white rounded-xl text-[10px] font-black shadow-xs transition flex items-center gap-1 border border-pink-300/30"
            >
              <span>🔄 تبديل المستخدم</span>
            </button>
          </div>
          
          {/* الحالة 1: تم إغلاق الوردية وعرض تقرير الـ Z-Report */}
          {closedZReport ? (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-emerald-900 font-bold">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>تم توثيق وإغلاق الوردية بنجاح وحفظ التقرير سحابياً 🌸</span>
              </div>

              {/* بطاقة ملخص الـ Z-Report القابلة للتحويل إلى صورة وطباعة */}
              <div 
                ref={zReportCardRef} 
                className="p-4 bg-white border border-slate-300 rounded-2xl shadow-sm space-y-2.5 text-xs text-right font-sans"
              >
                <div className="text-center pb-2 border-b border-dashed border-slate-300 space-y-0.5">
                  <h4 className="font-black text-sm text-slate-900">{storeInfo?.name || 'بيت الورد'} 🌸</h4>
                  <span className="text-[10px] text-slate-600 block">*** تقرير إغلاق الوردية (Z-REPORT) ***</span>
                  <span className="text-[9px] font-mono text-slate-500 block">رقم الوردية: {closedZReport.id}</span>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">الكاشير المسؤول:</span>
                    <span className="font-black text-slate-900">{resolveUserName(closedZReport, users)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">وقت الفتح:</span>
                    <span className="font-mono text-slate-700">{formatDate(closedZReport.openedAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">وقت الإغلاق:</span>
                    <span className="font-mono text-slate-700">{formatDate(closedZReport.closedAt)}</span>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600">الرصيد الافتتاحي (العهدة):</span>
                    <span className="font-bold font-mono">{formatMoney(closedZReport.startCash, storeInfo?.currency)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">عدد الفواتير المصدرة:</span>
                    <div className="text-left">
                      <span className="font-bold font-mono">{closedZReport.invoicesCount || 0} فاتورة</span>
                      {Number(closedZReport.splitInvoicesCount) > 0 && (
                        <span className="text-[10px] text-purple-700 bg-purple-100/80 border border-purple-200 px-1.5 py-0.5 rounded-md font-bold block mt-0.5">
                          (منها {closedZReport.splitInvoicesCount} مجزأة • {closedZReport.paymentOperationsCount || closedZReport.invoicesCount} حركة دفع)
                        </span>
                      )}
                    </div>
                  </div>
                  {/* تفصيل شامل ودقيق لكافة وسائل الدفع المعرفة في النظام */}
                  {closedZReport.paymentMethodsBreakdown && typeof closedZReport.paymentMethodsBreakdown === 'object' ? (
                    Object.values(closedZReport.paymentMethodsBreakdown)
                      .filter(m => Number(m.amount) > 0)
                      .map(m => (
                        <div key={m.id} className="flex justify-between items-center py-0.5">
                          <span className="text-slate-700 font-medium flex items-center gap-1">
                            <span className="text-pink-600 font-bold">•</span>
                            <span>{m.name}:</span>
                            <span className="text-[10px] text-slate-500 font-normal">
                              ({m.count || 1} {m.count === 1 ? 'حركة دفع' : 'حركات دفع'}{m.splitCount > 0 ? ` • منها ${m.splitCount} مجزأة` : ''})
                            </span>
                          </span>
                          <span className="font-bold font-mono text-slate-900">
                            +{formatMoney(m.amount, storeInfo?.currency)}
                          </span>
                        </div>
                      ))
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-600">مبيعات النقد (الكاش):</span>
                        <span className="font-bold font-mono text-emerald-700">+{formatMoney(closedZReport.cashSales, storeInfo?.currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">مبيعات الشبكة (مدى):</span>
                        <span className="font-bold font-mono text-blue-700">+{formatMoney(closedZReport.cardSales, storeInfo?.currency)}</span>
                      </div>
                      {Number(closedZReport.bankSales || closedZReport.transferSales) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">مبيعات التحويل البنكي:</span>
                          <span className="font-bold font-mono text-indigo-700">+{formatMoney(closedZReport.bankSales || closedZReport.transferSales, storeInfo?.currency)}</span>
                        </div>
                      )}
                      {Number(closedZReport.visaSales) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">مبيعات فيزا:</span>
                          <span className="font-bold font-mono text-purple-700">+{formatMoney(closedZReport.visaSales, storeInfo?.currency)}</span>
                        </div>
                      )}
                      {Number(closedZReport.tamaraSales) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">مبيعات تمارا:</span>
                          <span className="font-bold font-mono text-amber-700">+{formatMoney(closedZReport.tamaraSales, storeInfo?.currency)}</span>
                        </div>
                      )}
                      {Number(closedZReport.ninjaSales) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">مبيعات تطبيق نينجا:</span>
                          <span className="font-bold font-mono text-rose-700">+{formatMoney(closedZReport.ninjaSales, storeInfo?.currency)}</span>
                        </div>
                      )}
                      {Number(closedZReport.creditSales) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600 flex items-center gap-1">
                            <span>مبيعات الآجل:</span>
                            {Number(closedZReport.customerPaymentsCash || closedZReport.cashIn) >= Number(closedZReport.creditSales) && (
                              <span className="text-[8.5px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-bold">سُدد بالكامل ✅</span>
                            )}
                          </span>
                          <span className="font-bold font-mono text-amber-700">+{formatMoney(closedZReport.creditSales, storeInfo?.currency)}</span>
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex justify-between pt-1 border-t border-slate-200 font-black text-sm">
                    <span className="text-slate-900">إجمالي مبيعات الوردية:</span>
                    <span className="text-pink-700 font-mono">{formatMoney(closedZReport.totalSales, storeInfo?.currency)}</span>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1 mt-2">
                  <div className="flex justify-between text-slate-500 font-bold border-b border-slate-200 pb-1 mb-1">
                    <span>حركة تدفق نقدية الدرج:</span>
                    <span>المبلغ</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">الرصيد الافتتاحي (العهدة):</span>
                    <span className="font-bold font-mono">{formatMoney(closedZReport.startCash, storeInfo?.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">مبيعات النقد (الكاش):</span>
                    <span className="font-bold font-mono text-emerald-700">+{formatMoney(closedZReport.cashSales, storeInfo?.currency)}</span>
                  </div>
                  {Number(closedZReport.cashRefunds) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">مرتجعات نقدية للعملاء:</span>
                      <span className="font-bold font-mono text-rose-600">-{formatMoney(closedZReport.cashRefunds, storeInfo?.currency)}</span>
                    </div>
                  )}
                  {Number(closedZReport.cashIn) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        {Number(closedZReport.customerPaymentsCash) > 0 ? 'سداد وتحصيل آجل نقداً:' : 'إيداعات نقدية / تحصيل:'}
                      </span>
                      <span className="font-bold font-mono text-emerald-600">+{formatMoney(closedZReport.cashIn, storeInfo?.currency)}</span>
                    </div>
                  )}
                  {Number(closedZReport.cashOut) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">سحب نقدي / ترحيل:</span>
                      <span className="font-bold font-mono text-amber-600">-{formatMoney(closedZReport.cashOut, storeInfo?.currency)}</span>
                    </div>
                  )}
                  {Number(closedZReport.totalExpenses) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">مصروفات نقدية:</span>
                      <span className="font-bold font-mono text-rose-600">-{formatMoney(closedZReport.totalExpenses, storeInfo?.currency)}</span>
                    </div>
                  )}
                  {Number(closedZReport.totalPurchases) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">مشتريات وتوريد نقدي:</span>
                      <span className="font-bold font-mono text-rose-600">-{formatMoney(closedZReport.totalPurchases, storeInfo?.currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span className="text-slate-700 font-bold">النقدية المتوقعة بالدرج:</span>
                    <span className="font-black font-mono text-slate-900">{formatMoney(closedZReport.expectedCash, storeInfo?.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-700 font-bold">النقدية الفعلية المحصاة:</span>
                    <span className="font-black font-mono text-slate-900">{formatMoney(closedZReport.actualCash, storeInfo?.currency)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                    <span>الفارق في الخزينة:</span>
                    <span className={`font-black font-mono ${
                      closedZReport.difference === 0 
                        ? 'text-emerald-600' 
                        : closedZReport.difference > 0 
                        ? 'text-blue-600' 
                        : 'text-rose-600'
                    }`}>
                      {closedZReport.difference === 0 
                        ? 'مطابق تماماً (0.00) ✅' 
                        : closedZReport.difference > 0 
                        ? `+${formatMoney(closedZReport.difference, storeInfo?.currency)} (فائض زيادة)` 
                        : `${formatMoney(closedZReport.difference, storeInfo?.currency)} (عجز نقدي)`}
                    </span>
                  </div>
                </div>

                {closedZReport.notes && (
                  <p className="text-[10px] text-slate-600 pt-1">
                    <strong>ملاحظات الإغلاق:</strong> {closedZReport.notes}
                  </p>
                )}
              </div>

              {/* أزرار الإجراءات والمشاركة بالصورة والواتساب والطباعة */}
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleSendZReport}
                    disabled={isExportingImage}
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black flex items-center justify-center gap-1.5 shadow-md transition active:scale-95 disabled:opacity-50"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>{isExportingImage ? 'جاري التجهيز...' : 'إرسال للمدير 📤'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendWhatsAppText}
                    className="py-2.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow transition active:scale-95"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>واتساب (نص) 💬</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setClosedZReport(null);
                    setActualCashCount('');
                    setCloseNotes('');
                    setToastMessage(null);
                  }}
                  className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg transition active:scale-98 text-sm"
                >
                  <Unlock className="w-4 h-4" />
                  <span>🔓 فتح وردية كاشير جديدة الآن</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handlePrintZReport}
                    className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow transition active:scale-95"
                  >
                    <Printer className="w-4 h-4" />
                    <span>🖨️ طباعة التقرير</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="py-2.5 px-3 bg-pink-100 hover:bg-pink-200 text-pink-900 rounded-xl font-bold transition active:scale-95"
                  >
                    إغلاق النافذة
                  </button>
                </div>
              </div>
            </div>
          ) : isShiftOpen ? (
            /* الحالة 2: نموذج إغلاق الوردية الحالية */
            <form onSubmit={handleConfirmClose} className="space-y-3.5">
              
              {/* بطاقة الحسابات الفورية المتوقعة للوردية */}
              <div className="p-3 bg-pink-50/50 border border-pink-100 rounded-2xl space-y-2">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">الكاشير المسؤول:</span>
                  <span className="font-bold text-slate-800">{resolveUserName(effectiveShift || activeShift, users) || currentUser?.name}</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">عدد فواتير الوردية:</span>
                  <div className="text-left">
                    <span className="font-mono font-bold text-slate-800">{currentShiftMetrics.invoicesCount || 0} فاتورة</span>
                    {Number(currentShiftMetrics.splitInvoicesCount) > 0 && (
                      <span className="text-[10px] text-purple-700 bg-purple-100/80 border border-purple-200 px-1.5 py-0.5 rounded-md font-bold block mt-0.5">
                        (منها {currentShiftMetrics.splitInvoicesCount} مجزأة • {currentShiftMetrics.paymentOperationsCount || currentShiftMetrics.invoicesCount} حركة دفع)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">الرصيد الافتتاحي (العهدة):</span>
                  <span className="font-mono font-bold text-slate-800">{formatMoney(currentShiftMetrics.startCash, storeInfo?.currency)}</span>
                </div>

                {/* تفصيل طرق الدفع المحصلة في الوردية */}
                <div className="pt-2 border-t border-pink-200/80 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-800 text-[11px] flex items-center gap-1.5">
                      <span>💳</span>
                      <span>تفصيل طرق الدفع المحصلة:</span>
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">
                      إجمالي المبيعات: <strong className="font-mono text-pink-700 text-xs">{formatMoney(currentShiftMetrics.totalSales, storeInfo?.currency)}</strong>
                    </span>
                  </div>

                  {activeShiftPaymentMethods.length > 0 ? (
                    <div className="space-y-1 bg-white p-2 rounded-xl border border-pink-100 max-h-40 overflow-y-auto">
                      {activeShiftPaymentMethods.map(m => (
                        <div key={m.id} className="flex justify-between items-center py-1 px-1.5 rounded-lg hover:bg-pink-50/40 transition text-[11px]">
                          <div className="flex items-center gap-1.5">
                            {DEFAULT_PAYMENT_ICONS[m.id] ? (
                              <img src={DEFAULT_PAYMENT_ICONS[m.id]} alt="" className="w-5 h-3.5 object-contain rounded-sm" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-pink-500 inline-block"></span>
                            )}
                            <span className="font-bold text-slate-800">{m.name}</span>
                            <span className="text-[10px] text-slate-500 font-normal">
                              ({m.count || 1} {m.count === 1 ? 'حركة دفع' : 'حركات دفع'}{m.splitCount > 0 ? ` • منها ${m.splitCount} مجزأة` : ''})
                            </span>
                          </div>
                          <span className="font-mono font-black text-slate-900">
                            +{formatMoney(m.amount, storeInfo?.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2 bg-white rounded-xl border border-pink-100 text-center text-slate-400 text-[11px]">
                      لا توجد مبيعات في هذه الوردية حتى الآن
                    </div>
                  )}
                </div>

                {/* حركات وتدفقات الصندوق النقدي */}
                <div className="pt-2 border-t border-pink-200/80 space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-600">مبيعات الكاش بالدرج:</span>
                    <span className="font-mono font-bold text-emerald-700">+{formatMoney(currentShiftMetrics.cashSales, storeInfo?.currency)}</span>
                  </div>
                  {Number(currentShiftMetrics.cashRefunds) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">مرتجعات كاش من الدرج:</span>
                      <span className="font-mono font-bold text-rose-600">-{formatMoney(currentShiftMetrics.cashRefunds, storeInfo?.currency)}</span>
                    </div>
                  )}
                  {Number(currentShiftMetrics.totalExpenses) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">مصروفات نقدية من الدرج:</span>
                      <span className="font-mono font-bold text-rose-600">-{formatMoney(currentShiftMetrics.totalExpenses, storeInfo?.currency)}</span>
                    </div>
                  )}
                  {Number(currentShiftMetrics.totalPurchases) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">مشتريات نقدية من الدرج:</span>
                      <span className="font-mono font-bold text-rose-600">-{formatMoney(currentShiftMetrics.totalPurchases, storeInfo?.currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-600">حركات الخزينة (سحب/إيداع):</span>
                    <span className="font-mono font-bold text-purple-700">{formatMoney(currentShiftMetrics.cashIn - currentShiftMetrics.cashOut, storeInfo?.currency)}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-pink-200/80 font-black text-xs">
                  <span className="text-slate-900">النقدية المتوقعة في الدرج:</span>
                  <span className="text-rose-700 font-mono text-sm">{formatMoney(expectedCash, storeInfo?.currency)}</span>
                </div>
              </div>

              {/* زر السحب والترحيل السريع للخزينة */}
              <div className="flex items-center justify-between p-2.5 bg-gradient-to-r from-amber-50 to-purple-50 rounded-2xl border border-amber-200">
                <div className="flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-purple-700" />
                  <div>
                    <span className="text-xs font-black text-slate-800 block">سحب وترحيل للخزينة (Safe Drop)</span>
                    <span className="text-[10px] text-slate-500">ترحيل فائض مبيعات الكاش وتخفيف الدرج</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsTreasuryDropOpen(true)}
                  className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-purple-700 hover:from-amber-400 text-white rounded-xl text-xs font-black shadow-sm transition active:scale-95 flex items-center gap-1"
                >
                  <span>🏦 سحب الآن</span>
                </button>
              </div>

              {/* إدخال المبلغ الفعلي المحصى في الصندوق */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  المبلغ الفعلي المحصى في الصندوق (الكاش الفعلي) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    onKeyDown={(e) => ['-', '+', 'e', 'E'].includes(e.key) && e.preventDefault()}
                    required
                    placeholder={String(expectedCash)}
                    value={actualCashCount}
                    onChange={e => setActualCashCount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-black text-slate-900 text-base text-center outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition"
                  />
                  <span className="absolute left-3 top-2.5 font-bold text-xs text-slate-400">
                    {storeInfo?.currency || 'ر.س'}
                  </span>
                </div>
              </div>

              {/* بيان الفارق اللحظي (عجز / زيادة / مطابق) */}
              {actualCashCount !== '' && (
                <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold ${
                  difference === 0 
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
                    : difference > 0 
                    ? 'bg-blue-50 border-blue-300 text-blue-900' 
                    : 'bg-rose-50 border-rose-300 text-rose-900'
                }`}>
                  <span>حالة النقدية:</span>
                  <span>
                    {difference === 0 
                      ? 'مطابق تماماً لا يوجد فارق ✅' 
                      : difference > 0 
                      ? `فائض زيادة: +${formatMoney(difference, storeInfo?.currency)} 🔵` 
                      : `يوجد عجز: ${formatMoney(difference, storeInfo?.currency)} 🔴`}
                  </span>
                </div>
              )}

              {/* ملاحظات الإغلاق */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات إغلاق الوردية (اختياري)</label>
                <input
                  type="text"
                  placeholder="مثال: تم تسليم الكاش للمدير بدون ملاحظات"
                  value={closeNotes}
                  onChange={e => setCloseNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-rose-500 focus:bg-white"
                />
              </div>

              {/* أزرار الإجراء */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-rose-600 via-pink-600 to-purple-600 hover:from-rose-500 text-white rounded-xl font-black shadow-lg shadow-pink-600/30 flex items-center gap-1.5 transition active:scale-95"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>تأكيد الإغلاق وإصدار Z-Report 🔒</span>
                </button>
              </div>
            </form>
          ) : (
            /* الحالة 3: نموذج فتح وردية جديدة */
            <form onSubmit={handleConfirmOpen} className="space-y-4">
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-slate-700 space-y-1">
                <span className="font-bold block">الكاشير الحالي: <strong>{currentUser?.name || 'كاشير بيت الورد'}</strong></span>
                <span className="text-[10px] text-slate-500 block">سيتم عزل وتسجيل كافة المبيعات والعمليات باسمك في هذه الوردية</span>
              </div>

              {lastUserClosedShift && typeof lastUserClosedShift.actualCash === 'number' && (
                <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-950 font-black flex items-center gap-1.5">
                      <span>🔄</span>
                      <span>ترحيل تلقائي من ورديتك السابقة:</span>
                    </span>
                    <span className="font-mono font-black text-emerald-800 text-sm">
                      {formatMoney(lastUserClosedShift.actualCash, storeInfo?.currency)}
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-700/90">
                    تم ملء الرصيد الافتتاحي تلقائياً بالنقدية الفعلية المتبقية معك في الدرج لضمان استمرارية العهدة التراكمية.
                  </p>
                </div>
              )}

              {storeInfo?.lockOpeningCash && currentUser?.role !== 'admin' && (
                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 font-bold text-xs flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>الرصيد الافتتاحي مثبت ومقفل بواسطة مدير النظام 🔒</span>
                </div>
              )}

              {myPendingFloatTotal > 0 && (
                <div className="p-3 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-950 text-[11px] font-bold leading-relaxed">
                  🤝 سلّمك المدير عهدة بقيمة{' '}
                  <b className="font-mono text-sm">{formatMoney(myPendingFloatTotal, storeInfo?.currency || 'ر.س')}</b>.
                  <span className="block mt-0.5">
                    هي رصيدك الافتتاحي المثبَّت لهذه الوردية، وتُحسب عليك عند الإقفال. تأكد من عدّ المبلغ في الدرج قبل البدء.
                  </span>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-800 mb-1">الرصيد الافتتاحي في الدرج (العهدة النقدية) *</label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    required
                    disabled={myPendingFloatTotal > 0 || (storeInfo?.lockOpeningCash && currentUser?.role !== 'admin')}
                    value={openingCashInput}
                    onChange={e => setOpeningCashInput(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-black text-slate-900 text-base text-center outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition disabled:bg-slate-200"
                  />
                  <span className="absolute left-3 top-2.5 font-bold text-xs text-slate-400">
                    {storeInfo?.currency || 'ر.س'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setOpeningCashInput('0')}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold transition"
                  >
                    بدء بدون عهدة (0)
                  </button>
                  {lastUserClosedShift && typeof lastUserClosedShift.actualCash === 'number' && (
                    <button
                      type="button"
                      onClick={() => setOpeningCashInput(String(lastUserClosedShift.actualCash))}
                      className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold transition font-mono"
                    >
                      ترحيل السابق ({lastUserClosedShift.actualCash} ر.س)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpeningCashInput(String(storeInfo?.defaultStartCash ?? storeInfo?.fixedOpeningCash ?? '0'))}
                    className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-800 text-[10px] font-bold transition font-mono"
                  >
                    المثبت بالنظام ({storeInfo?.defaultStartCash ?? storeInfo?.fixedOpeningCash ?? '0'} ر.س)
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white rounded-xl font-black shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 transition active:scale-95"
                >
                  <Unlock className="w-4 h-4" />
                  <span>بدء الوردية والبيع 🚀</span>
                </button>
              </div>
            </form>
          )}

        </div>

      </div>
      {isUserSwitchOpen && (
        <UserSwitchModal 
          isOpen={isUserSwitchOpen} 
          onClose={() => setIsUserSwitchOpen(false)}
          onSuccess={() => setIsUserSwitchOpen(false)}
        />
      )}

      {/* نافذة سحب وترحيل النقدية للخزينة */}
      <TreasuryDropModal 
        isOpen={isTreasuryDropOpen} 
        onClose={() => setIsTreasuryDropOpen(false)} 
        currentDrawerCash={expectedCash} 
      />
    </div>
  );
};
