import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { RotateCcw, AlertTriangle, ShieldAlert, Download, Upload, Receipt, Users, Truck, Package, Calendar, CheckCircle, X, Flame, Key, Shield, CreditCard, Landmark, History, ShieldCheck, PauseCircle, Wallet } from 'lucide-react';
import { formatMoney, formatDate } from '../../utils/helpers';
import { verifyPin } from '../../utils/security';
import { getRoleByEmail } from '../../utils/authUsers';

export const ResetAccountsTab = () => {
  const {
    firebaseUser,
    users,
    invoices,
    heldBills,
    customers,
    suppliers,
    purchases,
    expenses,
    drawerTransactions,
    paymentReceipts,
    activeShift,
    userShifts,
    products,
    currentUser,
    shiftsHistory,
    treasuryLedger,
    loginLogs,
    exportBackup,
    importBackup,
    pushAllToCloud,
    resetSalesInvoices,
    resetHeldInvoices,
    resetCustomerBalances,
    resetSupplierBalances,
    resetPaymentReceiptsVouchers,
    resetCashierShiftsAndDrawers,
    resetCashDrawerAndShifts,
    resetTreasuryAuditLedger,
    resetExpensesData,
    zeroInventoryStock,
    resetLoginAuditLogs,
    resetShiftsHistory,
    resetFiscalYear,
    factoryResetAll,
    getTreasurySummary
  } = useApp();

  // حالة نافذة التأكيد الأمني
  const [confirmModal, setConfirmModal] = useState(null); // { type, title, desc, action, stats }
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successToast, setSuccessToast] = useState(null);
  const [autoBackupBeforeReset, setAutoBackupBeforeReset] = useState(true);

  // مرجع وحالة استعادة ملف نسخة احتياطية
  const restoreFileInputRef = useRef(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreFileContent, setRestoreFileContent] = useState(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restoreStats, setRestoreStats] = useState(null);
  const [restoreMode, setRestoreMode] = useState('replace');
  const [restorePinInput, setRestorePinInput] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  // معالجة اختيار ملف النسخة للاستعادة
  const handleRestoreFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        const parsed = JSON.parse(content);
        
        if (!parsed || typeof parsed !== 'object') {
          alert('❌ الملف المختار ليس ملف JSON صالح للنسخ الاحتياطي!');
          return;
        }

        setRestoreStats({
          version: parsed.version || 'غير محدد',
          date: parsed.generatedAt || parsed.exportedAt || null,
          productsCount: Array.isArray(parsed.products) ? parsed.products.length : 0,
          categoriesCount: Array.isArray(parsed.categories) ? parsed.categories.length : 0,
          invoicesCount: Array.isArray(parsed.invoices) ? parsed.invoices.length : 0,
          customersCount: Array.isArray(parsed.customers) ? parsed.customers.length : 0,
          suppliersCount: Array.isArray(parsed.suppliers) ? parsed.suppliers.length : 0,
          expensesCount: Array.isArray(parsed.expenses) ? parsed.expenses.length : 0,
          storeName: parsed.storeInfo?.name || 'متجر'
        });

        setRestoreFileContent(content);
        setRestorePinInput('');
        setRestoreError('');
        setRestoreMode('replace');
        setIsRestoreModalOpen(true);
      } catch (err) {
        alert('❌ تعذر قراءة الملف! تأكد من اختيار ملف JSON صحيح تم تصديره من النظام.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // تأكيد وتنفيذ استعادة ملف النسخة الاحتياطية
  const handleConfirmRestoreFile = async () => {
    if (!restoreFileContent) return;

    const cleanPin = String(restorePinInput || '').trim();
    const adminUsers = (users || []).filter(u => u && (u.role === 'admin' || u.id === 'user-2' || u.id === 'admin'));
    const signedInRole = getRoleByEmail(firebaseUser?.email)?.role;
    let isPinValid = false;

    if (currentUser && (currentUser.role === 'admin' || currentUser.id === 'user-2' || signedInRole === 'admin') && verifyPin(cleanPin, currentUser)) {
      isPinValid = true;
    }
    if (!isPinValid && adminUsers.length > 0) {
      isPinValid = adminUsers.some(admin => verifyPin(cleanPin, admin));
    }

    if (!isPinValid) {
      setRestoreError('رمز الدخول السريع (PIN) غير صحيح! أدخل الرمز الصحيح للمتابعة.');
      return;
    }

    setIsRestoring(true);
    setRestoreError('');

    try {
      if (autoBackupBeforeReset) {
        exportBackup();
      }

      const res = importBackup(restoreFileContent, { mode: restoreMode });
      
      if (res.success) {
        // ملاحظة: importBackup يرفع كل قسم للسحابة فور استعادته.
        // كان يُستدعى pushAllToCloud هنا فيرفع حالة الشاشة القديمة (قبل إعادة
        // الرسم) فوق البيانات المستعادة، فتُلغى الاستعادة خلال ثوانٍ.

        setIsRestoreModalOpen(false);
        setRestoreFileContent(null);
        setSuccessToast(`🎉 ${res.message || 'تمت استعادة ملف النسخة الاحتياطية بنجاح ومزامنة البيانات مع السحابة!'}`);
        setTimeout(() => setSuccessToast(null), 5000);
      } else {
        setRestoreError(res.message || 'حدث خطأ أثناء استعادة النسخة');
      }
    } catch (err) {
      console.error(err);
      setRestoreError('حدث خطأ غير متوقع أثناء الاستعادة: ' + err.message);
    } finally {
      setIsRestoring(false);
    }
  };

  // إحصائيات حية دقيقة لجميع الأنظمة
  const totalCustomerDebt = (customers || []).reduce((sum, c) => sum + (Number(c.balance) || 0), 0);
  const totalSupplierDebt = (suppliers || []).reduce((sum, s) => sum + (Number(s.balance) || 0), 0);
  const totalExpensesAmount = (expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalSalesAmount = (invoices || []).reduce((sum, i) => sum + (Number(i.total) || 0), 0);
  const totalHeldAmount = (heldBills || []).reduce((sum, h) => sum + (Number(h.total) || 0), 0);
  const totalStockItems = (products || []).reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  const totalReceiptsAmount = (paymentReceipts || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const totalPurchasesAmount = (purchases || []).reduce((sum, p) => sum + (Number(p.total) || 0), 0);

  // إحصائيات الخزينة المحدثة والدقيقة
  const treasurySummary = typeof getTreasurySummary === 'function' ? getTreasurySummary() : null;
  const currentCashierCash = treasurySummary?.cashierTotalCash ?? 0;
  const currentActiveCashiers = treasurySummary?.totalActiveCashiersCount ?? 0;

  // فتح نافذة التأكيد لعملية معينة
  const handleRequestReset = (config) => {
    setPinInput('');
    setErrorMsg('');
    setConfirmModal(config);
  };

  // تنفيذ التصفير بعد التحقق الصارم من الـ PIN
  const handleExecuteReset = (e) => {
    e.preventDefault();
    if (!confirmModal) return;

    const cleanPin = String(pinInput || '').trim();
    const adminUsers = (users || []).filter(u => u && (u.role === 'admin' || u.id === 'user-2' || u.id === 'admin'));
    const signedInRole = getRoleByEmail(firebaseUser?.email)?.role;
    let isPinValid = false;

    // 1. إذا كان المستخدم الحالي مديراً وأدخل رمزه الصحيح
    if (currentUser && (currentUser.role === 'admin' || currentUser.id === 'user-2' || signedInRole === 'admin') && verifyPin(cleanPin, currentUser)) {
      isPinValid = true;
    }

    // 2. التحقق من أي حساب مدير في قائمة المستخدمين
    if (!isPinValid && adminUsers.length > 0) {
      isPinValid = adminUsers.some(admin => verifyPin(cleanPin, admin));
    }

    // 3. إذا كان مسجلاً بالبريد بحساب المدير في Firebase وأدخل رمز مستخدمه الحالي
    if (!isPinValid && signedInRole === 'admin' && currentUser && verifyPin(cleanPin, currentUser)) {
      isPinValid = true;
    }

    if (!isPinValid) {
      setErrorMsg('رمز الدخول السريع (PIN) غير صحيح! يرجى إدخال الرمز السري الصحيح لحساب المدير لتأكيد التصفير.');
      return;
    }

    if (autoBackupBeforeReset) {
      exportBackup();
    }

    const result = confirmModal.action();
    setConfirmModal(null);
    setSuccessToast(result?.message || 'تمت عملية التصفير وتحديث السحابة بنجاح! 🌸');
    setTimeout(() => setSuccessToast(null), 4500);
  };

  return (
    <div className="space-y-7 animate-in fade-in duration-200 font-cairo pb-12">
      
      {/* إشعار النجاح اللحظي */}
      {successToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-950 text-xs font-bold flex items-center justify-between shadow-sm animate-in slide-in-from-top-2 sticky top-4 z-40">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
          <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2.5 py-1 rounded-lg font-black shrink-0">محدث سحابياً ومحلياً ✅</span>
        </div>
      )}

      {/* بطاقة رأس قسم التصفير والتحذير الأمني */}
      <div className="bg-gradient-to-r from-rose-950 via-red-950 to-slate-950 text-white p-5 sm:p-6 rounded-3xl shadow-xl border border-rose-600/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-600/20 backdrop-blur-md flex items-center justify-center text-3xl border border-rose-500/30 shadow-inner text-rose-400 shrink-0">
            🔄
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-xl font-black text-rose-100">مركز تصفير الحسابات والبيانات المالي الشامل 🌸</h3>
              <span className="bg-rose-500/30 text-rose-300 border border-rose-400/30 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" />
                <span>منطقة عمليات حساسة ومؤمنة</span>
              </span>
            </div>
            <p className="text-xs text-rose-200/80 mt-1 leading-relaxed max-w-2xl">
              تصفير دقيق ومستقل لـ 14 بنداً محاسبياً وتشغيلياً على حدة (المبيعات، المعلقة، ديون العملاء، الموردين، الخزينة، الأدراج، المصروفات، المخزون) مع نسخ احتياطي فوري وتأكيد بـ PIN.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => restoreFileInputRef.current?.click()}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white rounded-2xl text-xs font-black shadow-lg shadow-indigo-600/30 transition active:scale-95 flex items-center justify-center gap-2 border border-blue-400/30 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>📥 استعادة ملف نسخة</span>
          </button>

          <button
            type="button"
            onClick={() => {
              exportBackup();
              alert('تم تنزيل النسخة الاحتياطية بنجاح على جهازك لحماية بياناتك 💾');
            }}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white rounded-2xl text-xs font-black shadow-lg shadow-emerald-600/30 transition active:scale-95 flex items-center justify-center gap-2 border border-emerald-400/30 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>💾 تنزيل نسخة الآن</span>
          </button>
        </div>
      </div>

      {/* إعداد الأمان للنسخ الاحتياطي التلقائي */}
      <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs sm:text-sm font-black text-slate-800">الحماية الذكية: تنزيل نسخة احتياطية تلقائياً قبل أي عملية تصفير</span>
            <p className="text-[11px] text-slate-500 mt-0.5">يقوم النظام بحفظ ملف أمان على جهازك تلقائياً قبل تنفيذ أي تصفير لتفادي أي خطأ بشري</p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={autoBackupBeforeReset}
            onChange={e => setAutoBackupBeforeReset(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
        </label>
      </div>

      {/* ========================================================================= */}
      {/* القسم الأول: 🧾 فواتير المبيعات والمعلقة (Sales & Invoices) */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-6 bg-pink-500 rounded-full inline-block"></span>
            <h3 className="text-sm sm:text-base font-black text-slate-800">القسم الأول: 🧾 فواتير المبيعات والمعلقة (Sales & Invoices)</h3>
          </div>
          <span className="text-xs text-slate-500 font-bold">تصفير مستقل ودقيق</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. تصفير سجل فواتير المبيعات */}
          <div className="p-4 rounded-3xl border border-slate-200/90 bg-white shadow-sm flex flex-col justify-between gap-3 hover:border-pink-300 transition">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-600 to-rose-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-800">1. تصفير سجل فواتير المبيعات 🧾</h4>
                  <span className="text-[10px] text-slate-500">مسح الفواتير الصادرة المكتملة وتصفير مبيعاتها</span>
                </div>
              </div>

              <div className="bg-pink-50/70 p-2.5 rounded-2xl border border-pink-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">الفواتير المسجلة:</span>
                  <span className="font-black text-pink-700">{(invoices || []).length} فاتورة</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">إجمالي المبيعات:</span>
                  <span className="font-black text-pink-700">{formatMoney(totalSalesAmount)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ⚠️ يمسح فواتير المبيعات فقط في السحابة والمحلي، مع الحفاظ الكامل على الفواتير المعلقة، والمنتجات، والعملاء، والأسعار.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleRequestReset({
                type: 'invoices',
                title: 'تصفير سجل فواتير المبيعات',
                desc: `سيتم حذف (${(invoices || []).length}) فاتورة مبيعات بإجمالي (${formatMoney(totalSalesAmount)}) سحابياً ومحلياً مع بقاء الفواتير المعلقة.`,
                action: () => resetSalesInvoices({ clearHeld: false })
              })}
              className="w-full py-2.5 bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 rounded-2xl text-xs font-black transition flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-pink-600" />
              <span>تصفير سجل فواتير المبيعات فقط 🧾</span>
            </button>
          </div>

          {/* 2. تصفير الفواتير المعلقة وحدها */}
          <div className="p-4 rounded-3xl border border-slate-200/90 bg-white shadow-sm flex flex-col justify-between gap-3 hover:border-amber-300 transition">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <PauseCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-800">2. تصفير الفواتير المعلقة وحدها ⏸️</h4>
                  <span className="text-[10px] text-slate-500">مسح سلات الشراء المعلقة والمؤجلة في الكاشير</span>
                </div>
              </div>

              <div className="bg-amber-50/70 p-2.5 rounded-2xl border border-amber-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">الفواتير المعلقة:</span>
                  <span className="font-black text-amber-700">{(heldBills || []).length} فاتورة</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">إجمالي قيمتها:</span>
                  <span className="font-black text-amber-700">{formatMoney(totalHeldAmount)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ⚠️ يمسح السلات المعلقة مؤقتاً والمحفوظة بالكاشير دون التأثير على فواتير المبيعات الرسمية الصادرة.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleRequestReset({
                type: 'held_bills',
                title: 'تصفير الفواتير المعلقة في الكاشير',
                desc: `سيتم مسح (${(heldBills || []).length}) فاتورة معلقة بقيمة (${formatMoney(totalHeldAmount)}) وتفريغ قائمة الفواتير المعلقة.`,
                action: () => resetHeldInvoices()
              })}
              className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-2xl text-xs font-black transition flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
              <span>تصفير الفواتير المعلقة فقط ⏸️</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* القسم الثاني: 👥 العملاء والموردين والسندات (Accounts & Vouchers) */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-6 bg-emerald-500 rounded-full inline-block"></span>
            <h3 className="text-sm sm:text-base font-black text-slate-800">القسم الثاني: 👥 العملاء والموردين والسندات (Accounts & Vouchers)</h3>
          </div>
          <span className="text-xs text-slate-500 font-bold">تصفير الحسابات والذمم</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 3. تصفير ديون وذمم العملاء */}
          <div className="p-4 rounded-3xl border border-slate-200/90 bg-white shadow-sm flex flex-col justify-between gap-3 hover:border-emerald-300 transition">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-800">3. تصفير ديون وذمم العملاء 👥</h4>
                  <span className="text-[10px] text-slate-500">إعادة أرصدة ومديونيات العملاء إلى 0.00 ريال</span>
                </div>
              </div>

              <div className="bg-emerald-50/70 p-2.5 rounded-2xl border border-emerald-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">العملاء:</span>
                  <span className="font-black text-emerald-700">{(customers || []).length} عميل</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">إجمالي الديون:</span>
                  <span className="font-black text-emerald-700">{formatMoney(totalCustomerDebt)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ⚠️ تصبح أرصدة جميع العملاء 0.00 ريال مع بقاء أسماء العملاء، أرقام الجوالات، وتصنيفاتهم مسجلة كما هي.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleRequestReset({
                type: 'customers',
                title: 'تصفير ديون وذمم العملاء',
                desc: `سيتم تصفير مديونيات جميع العملاء المسجلين بإجمالي (${formatMoney(totalCustomerDebt)}) لتصبح 0.00 ريال مع بقاء بيانات العملاء.`,
                action: () => resetCustomerBalances({ clearReceipts: false })
              })}
              className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-2xl text-xs font-black transition flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
              <span>تصفير ديون العملاء 👥</span>
            </button>
          </div>

          {/* 4. تصفير حسابات الموردين وفواتير الشراء */}
          <div className="p-4 rounded-3xl border border-slate-200/90 bg-white shadow-sm flex flex-col justify-between gap-3 hover:border-purple-300 transition">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-800">4. حسابات الموردين والمشتريات 🚚</h4>
                  <span className="text-[10px] text-slate-500">تصفير ديون الموردين ومسح فواتير الشراء</span>
                </div>
              </div>

              <div className="bg-purple-50/70 p-2.5 rounded-2xl border border-purple-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">الموردين:</span>
                  <span className="font-black text-purple-700">{(suppliers || []).length} مورد</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">المستحقات الدائنة:</span>
                  <span className="font-black text-purple-700">{formatMoney(totalSupplierDebt)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ⚠️ يصفر مستحقات الموردين ويمسح ({(purchases || []).length}) فاتورة شراء مسجلة مع الاحتفاظ ببيانات جهات الاتصال.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleRequestReset({
                type: 'suppliers',
                title: 'تصفير حسابات الموردين والمشتريات',
                desc: `سيتم تصفير مستحقات الموردين البالغة (${formatMoney(totalSupplierDebt)}) ومسح (${(purchases || []).length}) فاتورة شراء مسجلة بقيمة (${formatMoney(totalPurchasesAmount)}).`,
                action: () => resetSupplierBalances({ clearPurchases: true })
              })}
              className="w-full py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-2xl text-xs font-black transition flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
              <span>تصفير الموردين والمشتريات 🚚</span>
            </button>
          </div>

          {/* 5. تصفير سندات القبض والصرف المالي */}
          <div className="p-4 rounded-3xl border border-slate-200/90 bg-white shadow-sm flex flex-col justify-between gap-3 hover:border-blue-300 transition">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-800">5. سندات القبض والصرف 📑</h4>
                  <span className="text-[10px] text-slate-500">مسح سجل إيصالات سداد العملاء والدفعات</span>
                </div>
              </div>

              <div className="bg-blue-50/70 p-2.5 rounded-2xl border border-blue-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">سندات القبض:</span>
                  <span className="font-black text-blue-700">{(paymentReceipts || []).length} سند</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">إجمالي قيمتها:</span>
                  <span className="font-black text-blue-700">{formatMoney(totalReceiptsAmount)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ⚠️ يمسح أرشيف سندات القبض والإيصالات الصادرة لسداد ديون العملاء وتفريغ السجل في السحابة والمحلي.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleRequestReset({
                type: 'receipts',
                title: 'تصفير سندات القبض والصرف',
                desc: `سيتم مسح (${(paymentReceipts || []).length}) سند قبض وإيصال مالي بإجمالي (${formatMoney(totalReceiptsAmount)}).`,
                action: () => resetPaymentReceiptsVouchers()
              })}
              className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-2xl text-xs font-black transition flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
              <span>تصفير سجل سندات القبض 📑</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* القسم الثالث: 💵 الخزينة والورديات والصندوق (Cash Drawers & Treasury) */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-6 bg-amber-500 rounded-full inline-block"></span>
            <h3 className="text-sm sm:text-base font-black text-slate-800">القسم الثالث: 💵 الخزينة والورديات والصندوق (Cash Drawers & Treasury)</h3>
          </div>
          <span className="text-xs text-amber-700 font-black bg-amber-100 px-2 py-0.5 rounded-full">حل مشكلة عهد الكاشير والأدراج</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 6. تصفير عهد وورديات جميع الكاشيرات والصندوق */}
          <div className="p-4 rounded-3xl border-2 border-amber-300 bg-amber-50/30 shadow-md flex flex-col justify-between gap-3 hover:border-amber-400 transition relative overflow-hidden">
            <div className="absolute top-0 left-0 bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded-br-xl">
              حاسم للعهدة
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-500 text-white flex items-center justify-center shadow-md shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-900">6. تصفير عهد وورديات الكاشيرات 💵</h4>
                  <span className="text-[10px] text-amber-800 font-bold">تصفير عهد جميع الكاشيرات وإغلاق الورديات</span>
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-2xl border border-amber-200 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">عهدة الكاشير الحالية:</span>
                  <span className="font-black text-amber-700">{formatMoney(currentCashierCash)}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">الكاشيرات النشطين:</span>
                  <span className="font-black text-amber-700">{currentActiveCashiers} كاشير</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                💡 **الحل الجذري للعهدة العالقة (500 ر.س)**: يغلق ويصفر جميع ورديات الكاشيرات في السحابة والمحلي فوراً، ويمسح حركات السحب والإيداع، ويجعل عهدة الكاشير 0.00 ريال.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleRequestReset({
                type: 'drawer_all',
                title: 'تصفير عهد وورديات جميع الكاشيرات والصندوق',
                desc: `سيتم إغلاق وتصفير كافة ورديات الكاشيرات المسجلة بالسحابة والمحلي، ومسح حركات الدرج (${(drawerTransactions || []).length} حركة)، وتصفير عهدة الكاشير اليومية لتصبح 0.00 ريال.`,
                action: () => resetCashierShiftsAndDrawers(0)
              })}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-white rounded-2xl text-xs font-black transition flex items-center justify-center gap-1.5 active:scale-98 shadow-md shadow-amber-500/20 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-white" />
              <span>تصفير عهدة الكاشيرات والصندوق (0.00 ر.س) 💵</span>
            </button>
          </div>

          {/* 7. تصفير دفتر تدقيق الخزينة والإيداعات البنكية */}
          <div className="p-4 rounded-3xl border border-slate-200/90 bg-white shadow-sm flex flex-col justify-between gap-3 hover:border-emerald-300 transition">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-md shrink-0">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-800">7. دفتر تدقيق الخزينة والبنك 🏦</h4>
                  <span className="text-[10px] text-slate-500">مسح حركات ترحيل كاش الإدارة والإيداعات</span>
                </div>
              </div>

              <div className="bg-emerald-50/70 p-2.5 rounded-2xl border border-emerald-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">قيود الخزينة:</span>
                  <span className="font-black text-emerald-700">{(treasuryLedger || []).length} قيد</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">كاش الإدارة المسجل:</span>
                  <span className="font-black text-emerald-700">{formatMoney(treasurySummary?.managerVaultCash ?? 0)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ⚠️ يمسح سجل حركات استلام كاش الوردية، وإيداعات البنك، وتسويات تطبيقات التوصيل والشبكة في الخزينة المركزية.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleRequestReset({
                type: 'treasury_ledger',
                title: 'تصفير دفتر تدقيق الخزينة والإيداعات البنكية',
                desc: `سيتم مسح (${(treasuryLedger || []).length}) قيد في دفتر تدقيق الخزينة المركزية وحركات الإيداعات البنكية.`,
                action: () => resetTreasuryAuditLedger()
              })}
              className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-2xl text-xs font-black transition flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
              <span>تصفير دفتر تدقيق الخزينة 🏦</span>
            </button>
          </div>

          {/* 8. تصفير سجل الورديات التاريخي وأرشيف Z-Reports */}
          <div className="p-4 rounded-3xl border border-slate-200/90 bg-white shadow-sm flex flex-col justify-between gap-3 hover:border-violet-300 transition">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-800">8. أرشيف الورديات التاريخي 📋</h4>
                  <span className="text-[10px] text-slate-500">مسح تقارير الورديات السابقة وأرشيف Z-Reports</span>
                </div>
              </div>

              <div className="bg-violet-50/70 p-2.5 rounded-2xl border border-violet-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">الورديات المؤرشفة:</span>
                  <span className="font-black text-violet-700">{(shiftsHistory || []).length} وردية</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">حالة الأرشيف:</span>
                  <span className="font-black text-violet-700">{(shiftsHistory || []).length > 0 ? 'ممتلئ' : 'مصفّر'}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ⚠️ يمسح أرشيف كافة تقارير الورديات السابقة Z-Reports المعتمدة دون المساس بفواتير المبيعات أو المنتجات.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleRequestReset({
                type: 'shifts_history',
                title: 'تصفير سجل الورديات التاريخي Z-Reports',
                desc: `سيتم مسح أرشيف تقارير الورديات السابقة بالكامل (${(shiftsHistory || []).length} وردية) في السحابة والمحلي.`,
                action: () => resetShiftsHistory()
              })}
              className="w-full py-2.5 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-2xl text-xs font-black transition flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-violet-600" />
              <span>تصفير سجل تقارير الورديات 📋</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* القسم الرابع: 📦 المخزون والمصروفات والأمان (Inventory, Expenses & Security) */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-6 bg-cyan-500 rounded-full inline-block"></span>
            <h3 className="text-sm sm:text-base font-black text-slate-800">القسم الرابع: 📦 المخزون والمصروفات والأمان (Inventory, Expenses & Security)</h3>
          </div>
          <span className="text-xs text-slate-500 font-bold">تصفير العمليات التشغيلية</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 9. تصفير المصروفات والنثريات */}
          <div className="p-4 rounded-3xl border border-slate-200/90 bg-white shadow-sm flex flex-col justify-between gap-3 hover:border-rose-300 transition">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-red-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-800">9. المصروفات والنثريات 💸</h4>
                  <span className="text-[10px] text-slate-500">مسح سجل المصاريف التشغيلية والرواتب</span>
                </div>
              </div>

              <div className="bg-rose-50/70 p-2.5 rounded-2xl border border-rose-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">سندات المصروفات:</span>
                  <span className="font-black text-rose-700">{(expenses || []).length} سند</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">إجمالي المصروفات:</span>
                  <span className="font-black text-rose-700">{formatMoney(totalExpensesAmount)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ⚠️ يمسح جميع سندات المصروفات التشغيلية والرواتب ونثريات المحل الموثقة للبدء في توثيق فترة جديدة.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleRequestReset({
                type: 'expenses',
                title: 'تصفير المصروفات والنثريات',
                desc: `سيتم مسح (${(expenses || []).length}) سند مصروفات بقيمة إجمالية (${formatMoney(totalExpensesAmount)}) سحابياً ومحلياً.`,
                action: () => resetExpensesData()
              })}
              className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-2xl text-xs font-black transition flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
              <span>تصفير سجل المصروفات 💸</span>
            </button>
          </div>

          {/* 10. تصفير كميات المخزون للجرد */}
          <div className="p-4 rounded-3xl border border-slate-200/90 bg-white shadow-sm flex flex-col justify-between gap-3 hover:border-cyan-300 transition">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-800">10. تصفير المخزون للجرد 📦</h4>
                  <span className="text-[10px] text-slate-500">تحويل كميات جميع المنتجات إلى (0 حبة)</span>
                </div>
              </div>

              <div className="bg-cyan-50/70 p-2.5 rounded-2xl border border-cyan-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">الأصناف:</span>
                  <span className="font-black text-cyan-800">{(products || []).length} صنف</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">القطع الحالية:</span>
                  <span className="font-black text-cyan-800">{totalStockItems} قطعة</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ⚠️ تبقى الأصناف وأسعارها والباركود والتصنيفات كما هي، ولكن تصبح الكمية (0) للبدء في جرد مستودع جديد.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleRequestReset({
                type: 'inventory',
                title: 'تصفير كميات المخزون للجرد الفعلي',
                desc: `سيتم تحويل كميات جميع الأصناف (${(products || []).length} صنف) إلى 0 قطعة للبدء في جرد مستودع جديد.`,
                action: () => zeroInventoryStock()
              })}
              className="w-full py-2.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 rounded-2xl text-xs font-black transition flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-700" />
              <span>تصفير كميات المخزون للجرد 📦</span>
            </button>
          </div>

          {/* 11. تصفير سجلات تسجيل الدخول والأمان */}
          <div className="p-4 rounded-3xl border border-slate-200/90 bg-white shadow-sm flex flex-col justify-between gap-3 hover:border-slate-300 transition">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-slate-700 to-slate-900 text-white flex items-center justify-center shadow-md shrink-0">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-800">11. سجلات الدخول والأمان 🛡️</h4>
                  <span className="text-[10px] text-slate-500">مسح سجل الأجهزة وعمليات الدخول</span>
                </div>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">عمليات الدخول:</span>
                  <span className="font-black text-slate-800">{(loginLogs || []).length} عملية</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold text-[10px] block">حالة السجل:</span>
                  <span className="font-black text-slate-800">{(loginLogs || []).length > 0 ? 'نشط وموثق' : 'فارغ'}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ⚠️ يمسح سجل تتبع أجهزة الكاشير وتاريخ دخول المستخدمين والبطاقات الذكية NFC لحماية الخصوصية.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleRequestReset({
                type: 'login_logs',
                title: 'تصفير سجلات تسجيل الدخول ومراقبة الأجهزة',
                // =========================================================
                //  إفصاح إلزامي: هذا المسح **محلي فقط**
                // =========================================================
                //  `firestore.rules` تمنع حذف `pos_login_logs` و
                //  `pos_audit_logs` بقاعدة `allow delete: if false` — لا
                //  يتجاوزها حتى المدير، وهذا مقصود (سجل تدقيق حقيقي لا
                //  يُمحى). لكن الواجهة كانت تقول «تفريغ السجل بالكامل»
                //  ثم تعود السجلات عند أول مزامنة، فيظنّ المالك أن المسح
                //  فشل عشوائياً. وعدٌ لا يُنفَّذ أسوأ من منعٍ معلن.
                desc: `سيتم تفريغ سجل عمليات الدخول من هذا الجهاز (${(loginLogs || []).length} عملية دخول مسجلة).

`
                  + `⚠️ تنبيه: النسخة السحابية من سجلات الدخول والتدقيق **لا تُحذف** — قواعد `
                  + `Firestore تمنع حذفها نهائياً حتى على المدير، حمايةً لسجلّ التدقيق. `
                  + `فالسجلات ستعود إلى هذا الجهاز عند أول مزامنة كاملة. `
                  + `لحذفها فعلياً استعمل وحدة تحكّم Firebase مباشرةً.`,
                action: () => resetLoginAuditLogs()
              })}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-2xl text-xs font-black transition flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-700" />
              <span>تصفير سجل تسجيل الدخول 🛡️</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* القسم الخامس: 👑 العمليات الكبرى والتهيئة الشاملة (Grand Operations) */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-950 text-white p-5 sm:p-6 rounded-3xl shadow-xl border border-purple-800/40 space-y-4">
        <div>
          <h4 className="text-sm sm:text-base font-black text-purple-200 flex items-center gap-2">
            <span>👑</span>
            <span>القسم الخامس: العمليات الكبرى والتهيئة الشاملة للنظام</span>
          </h4>
          <p className="text-xs text-purple-300/70 mt-0.5">خيارات مخصصة لبدء سنة مالية جديدة أو استعادة ملف نسخة احتياطية سابقة أو إعادة ضبط المصنع بالكامل</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          
          {/* 12. استعادة ملف نسخة احتياطية */}
          <div className="p-4 bg-indigo-950/40 rounded-2xl border border-indigo-400/40 flex flex-col justify-between gap-3 relative overflow-hidden">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-cyan-400 shrink-0" />
                <h5 className="text-xs sm:text-sm font-black text-white">12. استعادة ملف نسخة احتياطية 📥</h5>
              </div>
              <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                استرجاع واستعادة ملف نسخة احتياطية سابقة (JSON) لإعادة كافة بيانات وفواتير ومنتجات المتجر كما كانت مع خيار الاستبدال أو الدمج بأمان تام.
              </p>
            </div>
            <div>
              <input
                type="file"
                ref={restoreFileInputRef}
                accept=".json"
                onChange={handleRestoreFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => restoreFileInputRef.current?.click()}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black shadow-md transition active:scale-95 flex items-center justify-center gap-2 border border-blue-400/30 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>📥 استعادة ملف نسخة احتياطية</span>
              </button>
            </div>
          </div>

          {/* 13. تصفير السنة المالية / موسم جديد */}
          <div className="p-4 bg-white/5 rounded-2xl border border-purple-500/30 flex flex-col justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
                <h5 className="text-xs sm:text-sm font-black text-white">13. بدء دورة مالية / موسم جديد 🌸</h5>
              </div>
              <p className="text-[11px] text-purple-200/80 leading-relaxed">
                يصفر جميع الحركات المالية والتشغيلية (الفواتير، الديون، المشتريات، المصروفات، الخزينة، الورديات) مع **الاحتفاظ الكامل بهوية المحل، والمنتجات، والعملاء، والمستخدمين، وإعدادات الطابعة والواتساب**.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleRequestReset({
                type: 'fiscal_year',
                title: 'تصفير الدورة المالية وبدء موسم تجاري جديد',
                desc: 'سيتم تصفير كافة الفواتير والديون والمصروفات والورديات وحركات الصندوق والخزينة مع الحفاظ الكامل على بيانات المنتجات والعملاء وهوية المحل وإعدادات النظام.',
                action: () => resetFiscalYear()
              })}
              className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 text-white rounded-xl text-xs font-black shadow-md transition active:scale-95 cursor-pointer"
            >
              📅 تصفير الدورة وبدء موسم جديد
            </button>
          </div>

          {/* 14. استعادة ضبط المصنع الكاملة */}
          <div className="p-4 bg-rose-950/30 rounded-2xl border border-rose-500/30 flex flex-col justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <h5 className="text-xs sm:text-sm font-black text-rose-200">14. استعادة ضبط المصنع الكامل ⚠️</h5>
              </div>
              <p className="text-[11px] text-rose-200/70 leading-relaxed">
                يمسح بيانات المتجر من السحابة ومن كل الأجهزة المرتبطة — وليس هذا الجهاز فقط — ويعيد بيانات التجربة الافتراضية. لا يمكن التراجع.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleRequestReset({
                type: 'factory_reset',
                title: 'استعادة ضبط المصنع الكامل للنظام',
                desc: 'تحذير: هذه العملية تمسح بيانات المتجر من السحابة، فتختفي من كل الأجهزة المرتبطة وليس من هذا الجهاز فقط — المنتجات والفواتير والعملاء والموردين والمصروفات والورديات وسجل الخزينة. وتعيد بيانات التجربة الافتراضية. لا يمكن التراجع عنها إطلاقاً، تأكد من وجود نسخة احتياطية أولاً.',
                action: () => factoryResetAll()
              })}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black shadow-md transition active:scale-95 border border-rose-400/40 cursor-pointer"
            >
              ⚠️ استعادة ضبط المصنع الكامل
            </button>
          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* النافذة المنبثقة: التأكيد الأمني والتحقق من رمز الـ PIN */}
      {/* ========================================================================= */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-rose-300 animate-in zoom-in-95 duration-150">
            
            {/* رأس نافذة التأكيد */}
            <div className="p-4 bg-gradient-to-r from-rose-900 via-red-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-lg shrink-0">
                  ⚠️
                </div>
                <div>
                  <h3 className="font-black text-sm">{confirmModal.title}</h3>
                  <span className="text-[11px] text-rose-200">تأكيد الحماية والأمان المطلوب</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* تفاصيل التأكيد والـ PIN */}
            <form onSubmit={handleExecuteReset} className="p-5 space-y-4">
              
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs font-medium leading-relaxed">
                <p className="font-bold text-rose-950 mb-1">هل أنت متأكد من تنفيذ هذه العملية؟</p>
                <p>{confirmModal.desc}</p>
                {autoBackupBeforeReset && (
                  <p className="text-[10px] text-emerald-700 font-bold mt-2 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>سيتم حفظ نسخة احتياطية من بياناتك الحالية تلقائياً قبل البدء.</span>
                  </p>
                )}
              </div>

              {/* إدخال رمز الـ PIN للمدير */}
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-800">
                  أدخل رمز الدخول السريع (PIN) للمدير لتأكيد العملية:
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    maxLength={6}
                    autoFocus
                    value={pinInput}
                    onChange={e => {
                      setPinInput(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder="••••"
                    className="w-full text-center text-xl tracking-widest font-black py-2.5 px-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-rose-500 focus:bg-white focus:outline-none transition"
                  />
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                </div>
                {errorMsg && (
                  <p className="text-xs font-bold text-rose-600 bg-rose-50 p-2 rounded-xl border border-rose-200 animate-shake">
                    {errorMsg}
                  </p>
                )}
              </div>

              {/* أزرار الإجراء */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black text-xs rounded-2xl shadow-lg shadow-rose-600/30 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>تأكيد تنفيذ التصفير الآن</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition cursor-pointer"
                >
                  إلغاء
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* النافذة المنبثقة: استعادة ملف النسخة الاحتياطية */}
      {/* ========================================================================= */}
      {isRestoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-indigo-200 animate-in zoom-in-95 duration-150">
            
            <div className="p-4 bg-gradient-to-r from-indigo-900 via-blue-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-lg shrink-0">
                  📥
                </div>
                <div>
                  <h3 className="font-black text-sm">استعادة ملف نسخة احتياطية</h3>
                  <span className="text-[11px] text-blue-200">{restoreFileName}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRestoreModalOpen(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {restoreStats && (
                <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-100 space-y-2 text-xs">
                  <div className="flex justify-between items-center border-b border-indigo-100 pb-1.5">
                    <span className="font-bold text-slate-600">اسم المتجر بالنسخة:</span>
                    <span className="font-black text-indigo-900">{restoreStats.storeName}</span>
                  </div>
                  {restoreStats.date && (
                    <div className="flex justify-between items-center border-b border-indigo-100 pb-1.5">
                      <span className="font-bold text-slate-600">تاريخ إنشاء النسخة:</span>
                      <span className="font-black text-indigo-900">{formatDate(restoreStats.date)}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="bg-white p-2 rounded-xl border border-indigo-100">
                      <span className="text-[10px] text-slate-500 block">المنتجات</span>
                      <span className="font-black text-indigo-800 text-sm">{restoreStats.productsCount}</span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-indigo-100">
                      <span className="text-[10px] text-slate-500 block">الفواتير</span>
                      <span className="font-black text-indigo-800 text-sm">{restoreStats.invoicesCount}</span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-indigo-100">
                      <span className="text-[10px] text-slate-500 block">العملاء</span>
                      <span className="font-black text-indigo-800 text-sm">{restoreStats.customersCount}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* نمط الاستعادة */}
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-800">طريقة تطبيق الاستعادة:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRestoreMode('replace')}
                    className={`p-3 rounded-2xl border text-xs font-bold transition text-right cursor-pointer ${
                      restoreMode === 'replace'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-600/20'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="block font-black mb-0.5">استبدال شامل (موصى به) 🔄</span>
                    <span className="text-[10px] text-slate-500 block leading-tight">استبدال البيانات الحالية بالكامل ببيانات ملف النسخة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRestoreMode('merge')}
                    className={`p-3 rounded-2xl border text-xs font-bold transition text-right cursor-pointer ${
                      restoreMode === 'merge'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-600/20'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="block font-black mb-0.5">دمج ذكي ➕</span>
                    <span className="text-[10px] text-slate-500 block leading-tight">إضافة الأصناف والبيانات الجديدة دون حذف الحالية</span>
                  </button>
                </div>
              </div>

              {/* رمز الـ PIN */}
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-800">
                  رمز الدخول السريع (PIN) لتأكيد الاستعادة:
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={restorePinInput}
                  onChange={e => {
                    setRestorePinInput(e.target.value);
                    setRestoreError('');
                  }}
                  placeholder="••••"
                  className="w-full text-center text-xl tracking-widest font-black py-2 px-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-indigo-500 focus:bg-white focus:outline-none transition"
                />
                {restoreError && (
                  <p className="text-xs font-bold text-rose-600 bg-rose-50 p-2 rounded-xl border border-rose-200">
                    {restoreError}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={isRestoring}
                  onClick={handleConfirmRestoreFile}
                  className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs rounded-2xl shadow-lg shadow-indigo-600/30 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isRestoring ? (
                    <span>جاري الاستعادة والمزامنة... ⏳</span>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>تأكيد واستعادة النسخة الآن</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isRestoring}
                  onClick={() => setIsRestoreModalOpen(false)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition cursor-pointer disabled:opacity-50"
                >
                  إلغاء
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};
