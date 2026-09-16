import { PinLockModal } from './components/auth/PinLockModal';
import { LoginScreen } from './components/auth/LoginScreen';
import React, { useState } from 'react';
import { useApp } from './context/AppContext';
import { checkUserPermission, canAccessModule } from './utils/permissions';
import { Header } from './components/common/Header';
import { LiveAlertBanner } from './components/common/LiveAlertBanner';
import { Sidebar } from './components/common/Sidebar';
import { BottomNav } from './components/common/BottomNav';
import { FloatingBubbles } from './components/common/FloatingBubbles';

import { PosRegister } from './components/pos/PosRegister';
import { VirtualKeyboardWrapper } from './components/common/VirtualKeyboardWrapper';

// =========================================================================
//  تحميل تدريجي ذكي للشاشات — مع نجاة من النشر أثناء العمل
// =========================================================================
//  المشكلة التي رُصدت حيّاً مرتين: أسماء ملفات الشاشات مبصومة بالمحتوى،
//  والنشر يستبدل ملفات الاستضافة فتختفي البصمات القديمة. فأي جهاز كاشير
//  تبويبه مفتوح قبل النشر يطلب ملفاً لم يعد موجوداً **عند أول انتقال
//  لشاشة لم يزرها بعد**، فتظهر شاشة خطأ وسط بيعة:
//    Failed to fetch dynamically imported module: …/CashDrawerScreen-XXXX.js
//
//  العلاج: عند فشل الاستيراد الكسول نعيد تحميل الصفحة **مرة واحدة** فتُجلب
//  index.html الجديدة ومعها البصمات الصحيحة. الحارس في sessionStorage يمنع
//  حلقة إعادة تحميل لو كان الفشل لسبب آخر (انقطاع شبكة مثلاً)، فيصل
//  المستخدم عندئذٍ لشاشة الخطأ الحالية بزرّيها كما كان.
// =========================================================================
const RELOAD_GUARD = 'naif_pos_chunk_reloaded_at';

const lazyWithReload = (loader, pick) => React.lazy(() =>
  loader()
    .then(m => ({ default: pick(m) }))
    .catch((err) => {
      const isChunkError = /dynamically imported module|Importing a module script failed|Failed to fetch/i
        .test(String(err?.message || ''));
      let last = 0;
      try { last = Number(sessionStorage.getItem(RELOAD_GUARD)) || 0; } catch (e) {}
      // نافذة دقيقة واحدة: نشرٌ واحد يستحق إعادة تحميل واحدة لا سلسلة
      if (isChunkError && Date.now() - last > 60000) {
        try { sessionStorage.setItem(RELOAD_GUARD, String(Date.now())); } catch (e) {}
        window.location.reload();
        // لا نرمي الخطأ: الصفحة في طريقها للتحديث، ووعدٌ لا يُحسم أهدأ من شاشة خطأ تومض
        return new Promise(() => {});
      }
      throw err;
    })
);

const Dashboard = lazyWithReload(() => import('./components/dashboard/Dashboard'), m => m.Dashboard);
const InvoicesScreen = lazyWithReload(() => import('./components/invoices/InvoicesScreen'), m => m.InvoicesScreen);
const ProductsScreen = lazyWithReload(() => import('./components/products/ProductsScreen'), m => m.ProductsScreen);
const CustomersScreen = lazyWithReload(() => import('./components/customers/CustomersScreen'), m => m.CustomersScreen);
const SuppliersScreen = lazyWithReload(() => import('./components/suppliers/SuppliersScreen'), m => m.SuppliersScreen);
const ExpensesScreen = lazyWithReload(() => import('./components/expenses/ExpensesScreen'), m => m.ExpensesScreen);
const CashDrawerScreen = lazyWithReload(() => import('./components/cashier/CashDrawerScreen'), m => m.CashDrawerScreen);
const ReportsScreen = lazyWithReload(() => import('./components/reports/ReportsScreen'), m => m.ReportsScreen);
const SettingsScreen = lazyWithReload(() => import('./components/settings/SettingsScreen'), m => m.SettingsScreen);
const OwnerMobileDashboard = lazyWithReload(() => import('./components/dashboard/OwnerMobileDashboard'), m => m.OwnerMobileDashboard);

// مؤشر تحميل أنيق للشاشات الثانوية عند فتحها لأول مرة
// شاشة تُعرض بدل المحتوى عند عدم وجود صلاحية
const NoPermissionScreen = ({ what }) => (
  <div className="p-6 max-w-md mx-auto text-center">
    <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-6">
      <div className="text-4xl mb-2">🔒</div>
      <h3 className="font-black text-rose-900 text-sm mb-1">لا تملك صلاحية {what}</h3>
      <p className="text-[11px] text-rose-700 leading-relaxed">
        تُمنح من: الإعدادات ← المستخدمون ← الصلاحيات.
      </p>
    </div>
  </div>
);

const ScreenLoader = () => (
  <div className="flex-1 h-full w-full flex flex-col items-center justify-center p-8 min-h-[400px]">
    <div className="w-10 h-10 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin mb-3" />
    <span className="text-xs font-bold text-slate-500">جاري تحميل الشاشة...</span>
  </div>
);

export default function App() {
  const { 
    cart, 
    storeInfo, 
    currentUser, 
    isLocked,
    firebaseUser,
    lockDueToInactivity,
    users,
    products,
    loginWithNfc,
    addToCart,
    activeShift,
    liveAlert,
    setLiveAlert
  } = useApp();

  const getHashState = () => {
    const hash = window.location.hash.replace('#', '');
    const parts = hash.split('-');
    return {
      tab: parts[0] || 'pos',
      sidebar: parts.includes('sidebar'),
      cart: parts.includes('cart')
    };
  };

  const initialState = getHashState();
  const [currentTab, setCurrentTab] = useState(initialState.tab);
  const [isSidebarOpen, setIsSidebarOpen] = useState(initialState.sidebar);
  const [isCartOpen, setIsCartOpen] = useState(initialState.cart);
  const [smartScanToast, setSmartScanToast] = useState(null);

  // مراجع ثابتة للحالة لمنع إعادة تهيئة المستمع أثناء المسح
  const usersRef = React.useRef(users);
  const productsRef = React.useRef(products);
  const activeShiftRef = React.useRef(activeShift);
  const currentUserRef = React.useRef(currentUser);
  React.useEffect(() => { usersRef.current = users; }, [users]);
  React.useEffect(() => { productsRef.current = products; }, [products]);
  React.useEffect(() => { activeShiftRef.current = activeShift; }, [activeShift]);
  React.useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // المحرك الذكي فائق الخفة لقفل النظام تلقائياً عند عدم الحركة (Inactivity Auto-Lock) مع بقاء حالة الوردية على ما هي عليه
  const lastActivityRef = React.useRef(Date.now());
  React.useEffect(() => {
    if (isLocked) return;

    const timeoutMinutes = Number(storeInfo?.inactivityTimeoutMinutes ?? 15);
    if (timeoutMinutes <= 0) return; // معطل

    const maxIdleMs = timeoutMinutes * 60 * 1000;
    lastActivityRef.current = Date.now();

    let lastRecorded = Date.now();
    const onUserActivity = () => {
      const now = Date.now();
      if (now - lastRecorded > 10000) { // تحديث كل 10 ثوانٍ لمنع أي إجهاد للمعالج أو المتصفح
        lastRecorded = now;
        lastActivityRef.current = now;
      }
    };

    const activeEvents = ['pointerdown', 'keydown', 'touchstart', 'click', 'wheel'];
    activeEvents.forEach(evt => window.addEventListener(evt, onUserActivity, { passive: true }));

    const checkInterval = setInterval(() => {
      const idleTime = Date.now() - lastActivityRef.current;
      if (idleTime >= maxIdleMs) {
        lockDueToInactivity();
      }
    }, 10000);

    return () => {
      activeEvents.forEach(evt => window.removeEventListener(evt, onUserActivity));
      clearInterval(checkInterval);
    };
  }, [isLocked, storeInfo?.inactivityTimeoutMinutes, lockDueToInactivity]);

  // المحرك الذكي للتمييز بين قارئ الباركود وقارئ بطاقات NFC
  React.useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInputFocused = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // عند استقبال مفتاح Enter (نهاية القراءة من القارئ)
      if (e.key === 'Enter') {
        const scannedCode = scanBuffer.trim();
        if (scannedCode.length >= 3) {
          // 1. التمييز الذكي الأول: فحص هل الشفرة بطاقة NFC لمستخدم مسجل
          const matchedUser = (usersRef.current || []).find(u => 
            u.nfcCardId && 
            String(u.nfcCardId).trim().toLowerCase() === scannedCode.toLowerCase()
          );

          if (matchedUser) {
            e.preventDefault();
            const res = loginWithNfc(scannedCode);
            setSmartScanToast({
              type: 'nfc',
              text: res.message
            });
            setTimeout(() => setSmartScanToast(null), 4000);
            scanBuffer = '';
            return;
          }

          // 2. التمييز الذكي الثاني: فحص هل الشفرة باركود لمنتج مسجل في النظام (الباركود الرئيسي أو باركود المصنع)
          let isFactoryMatch = false;
          const matchedProduct = (productsRef.current || []).find(p => {
            const pBar = p.barcode ? String(p.barcode).trim() : '';
            const pFac = p.factoryBarcode ? String(p.factoryBarcode).trim() : '';
            const altCodes = Array.isArray(p.altBarcodes) ? p.altBarcodes.map(b => String(b).trim()) : [];

            if (pBar && (pBar === scannedCode || p.id === scannedCode)) {
              isFactoryMatch = false;
              return true;
            }
            if (pFac && pFac === scannedCode) {
              isFactoryMatch = true;
              return true;
            }
            if (altCodes.includes(scannedCode)) {
              isFactoryMatch = true;
              return true;
            }
            return false;
          });

          if (matchedProduct) {
            e.preventDefault();
            if (!activeShiftRef.current?.isOpen) {
              setSmartScanToast({
                type: 'warning',
                text: `⚠️ يرجى فتح وردية كاشير أولاً لإضافة الصنف (${matchedProduct.name})`
              });
            } else {
              addToCart(matchedProduct);
              setSmartScanToast({
                type: 'product',
                text: isFactoryMatch 
                  ? `🏭 تمت قراءة باركود المصنع وإضافة (${matchedProduct.name}) للسلة`
                  : `🛒 تمت قراءة باركود وإضافة (${matchedProduct.name}) للسلة بنجاح`
              });
            }
            setTimeout(() => setSmartScanToast(null), 3500);
            scanBuffer = '';
            return;
          }
        }
        scanBuffer = '';
        return;
      }

      // تجميع الأحرف المقروءة بسرعة القارئ
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (timeDiff > 80 && !isInputFocused) {
          scanBuffer = e.key;
        } else {
          scanBuffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Update URL when UI state changes
  React.useEffect(() => {
    let newHash = `#${currentTab}`;
    if (isSidebarOpen) newHash += '-sidebar';
    if (isCartOpen) newHash += '-cart';
    
    if (window.location.hash !== newHash) {
      window.history.pushState(null, '', newHash);
    }
  }, [currentTab, isSidebarOpen, isCartOpen]);

  // Prevent app close/reload if there is an unsaved bill
  React.useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (cart.length > 0) {
        e.preventDefault();
        e.returnValue = 'لديك فاتورة قيد التنفيذ، هل أنت متأكد من الخروج؟';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [cart]);

  // Listen to Back/Forward buttons
  React.useEffect(() => {
    const handlePopState = () => {
      const state = getHashState();
      setCurrentTab(state.tab);
      setIsSidebarOpen(state.sidebar);
      setIsCartOpen(state.cart);
      
      if (!state.sidebar && !state.cart) {
        if (cart.length > 0) {
          window.history.pushState(null, '', `#${state.tab}`);
          alert('🚫 لا يمكن الخروج من التطبيق!\nيوجد فاتورة قيد التنفيذ لم تكتمل، الرجاء الدفع أو إلغاء الفاتورة أولاً.');
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    
    if (!window.location.hash) {
      window.history.replaceState(null, '', `#${currentTab}`);
      window.history.pushState(null, '', `#${currentTab}`);
    }
    
    return () => window.removeEventListener('popstate', handlePopState);
  }, [cart]);

  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);
  const toggleCartDrawer = () => setIsCartOpen(prev => !prev);

  const currentFont = storeInfo?.fontFamily || 'Cairo';
  const bgClass = storeInfo?.bgClass || 'from-pink-50/80 via-purple-50/60 to-rose-50/80';
  const showBubbles = storeInfo?.showFloatingBubbles !== false;


  // ===== بوابة تسجيل الدخول =====
  // جاري التحقق من حالة الدخول
  if (firebaseUser === undefined) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#1A0314] via-[#2A0845] to-[#120210] text-white font-cairo">
        <div className="w-12 h-12 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin mb-4" />
        <span className="text-xs font-bold text-pink-200/80">جاري التحقق...</span>
      </div>
    );
  }

  // غير مسجّل الدخول
  //  لوحة المفاتيح الذكية مطلوبة هنا تحديداً: على شاشة لمس بلا لوحة مفاتيح
  //  حقيقية كان تسجيل الدخول مستحيلاً — البريد وكلمة المرور حقلا نص ولا
  //  توجد وسيلة لكتابتهما. كانت اللوحة مرسومة بعد الدخول فقط.
  if (!firebaseUser) {
    return (
      <>
        <LoginScreen />
        <VirtualKeyboardWrapper />
      </>
    );
  }

  // ===== بوابة الرمز السري: من هو الموظف الجالس على الجهاز؟ =====
  // البريد يفتح النظام للمتجر، والرمز السري يحدد الموظف تحديداً.
  // بدون هذه البوابة كان النظام يختار أول مستخدم يطابق دور البريد
  // تلقائياً — فيبيع الجميع باسم كاشير واحد، ويرث من يدخل وردية
  // لم يفتحها. الشاشة كاملة وليست نافذة فوق البرنامج، فلا يُفتح
  // أي جزء من النظام قبل تحديد الموظف.
  if (isLocked || !currentUser) {
    return <PinLockModal onLoginSuccess={() => setCurrentTab('pos')} />;
  }

  return (
    <div 
      style={{ fontFamily: `${currentFont}, Cairo, sans-serif` }}
      className={`h-full w-full flex-1 overflow-hidden bg-gradient-to-br ${bgClass} flex flex-col antialiased relative selection:bg-pink-200`}
    >
      {/* فقاعات وبتلات الورد العائمة التفاعلية */}
      {showBubbles && <FloatingBubbles />}

      {/* إطار التطبيق المتجاوب الكلاسيكي الأنيق */}
      <div className={`w-full max-w-[1700px] mx-auto h-full ${
        storeInfo?.darkTheme 
          ? 'bg-slate-900 text-slate-100 border-x border-slate-800 shadow-purple-950/40' 
          : storeInfo?.themeId === 'cute_kawaii'
          ? 'bg-white border-x border-pink-200 shadow-pink-200/30'
          : 'bg-white border-x border-pink-100'
      } flex flex-col shadow-2xl relative z-10`}>
        
        {/* شريط الرأس */}
        <LiveAlertBanner
        alert={liveAlert}
        onClose={() => setLiveAlert(null)}
        currency={storeInfo?.currency || 'ر.س'}
      />
      <Header 
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          toggleSidebar={toggleSidebar}
          toggleCartDrawer={toggleCartDrawer}
        />

        {/* إشعار القراءة الذكية للباركود وبطاقات NFC */}
        {smartScanToast && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-3 max-w-md w-[92%]">
            <div className={`p-3.5 rounded-2xl text-xs font-black shadow-2xl border flex items-center justify-between gap-3 ${
              smartScanToast.type === 'nfc'
                ? 'bg-purple-950 text-purple-100 border-purple-400 shadow-purple-950/40'
                : smartScanToast.type === 'product'
                ? 'bg-emerald-950 text-emerald-100 border-emerald-400 shadow-emerald-950/40'
                : 'bg-amber-950 text-amber-100 border-amber-400 shadow-amber-950/40'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-base">
                  {smartScanToast.type === 'nfc' ? '💳' : smartScanToast.type === 'product' ? '📦' : '⚠️'}
                </span>
                <span>{smartScanToast.text}</span>
              </div>
              <button onClick={() => setSmartScanToast(null)} className="text-white/60 hover:text-white p-1">
                ✕
              </button>
            </div>
          </div>
        )}

        {/* جسم الشاشة الحالية مع Suspense للتحميل الكسول السريع */}
        <main className="flex-1 overflow-y-auto">
          <React.Suspense fallback={<ScreenLoader />}>
            {currentTab === 'dashboard' && (
              <Dashboard setCurrentTab={setCurrentTab} />
            )}

            {currentTab === 'ownerMobileDashboard' && (
              checkUserPermission(currentUser, 'reports_view_profits')
                ? <OwnerMobileDashboard setCurrentTab={setCurrentTab} />
                : <NoPermissionScreen what="لوحة تحكم ومتابعة المالك" />
            )}

            {currentTab === 'pos' && (
              <PosRegister 
                isCartOpen={isCartOpen} 
                setIsCartOpen={setIsCartOpen} 
              />
            )}

            {currentTab === 'invoices' && (
              checkUserPermission(currentUser, 'invoices_view')
                ? <InvoicesScreen setCurrentTab={setCurrentTab} setIsCartOpen={setIsCartOpen} />
                : <NoPermissionScreen what="استعراض سجل الفواتير" />
            )}

            {currentTab === 'products' && (
              checkUserPermission(currentUser, 'products_view')
                ? <ProductsScreen />
                : <NoPermissionScreen what="استعراض المنتجات والمخزون" />
            )}

            {currentTab === 'customers' && (
              checkUserPermission(currentUser, 'customers_manage')
                ? <CustomersScreen />
                : <NoPermissionScreen what="إدارة العملاء" />
            )}

            {currentTab === 'suppliers' && (
              checkUserPermission(currentUser, 'suppliers_manage')
                ? <SuppliersScreen />
                : <NoPermissionScreen what="إدارة الموردين" />
            )}

            {currentTab === 'expenses' && (
              (checkUserPermission(currentUser, 'expenses_manage')
                || checkUserPermission(currentUser, 'expenses_add'))
                ? <ExpensesScreen />
                : <NoPermissionScreen what="إدارة المصروفات" />
            )}

            {currentTab === 'cashDrawer' && (
              checkUserPermission(currentUser, 'drawer_open_close')
                ? <CashDrawerScreen />
                : <NoPermissionScreen what="الخزينة والورديات" />
            )}

            {currentTab === 'reports' && (
              checkUserPermission(currentUser, 'reports_view_sales')
                ? <ReportsScreen />
                : <NoPermissionScreen what="استعراض التقارير" />
            )}

            {currentTab === 'userReports' && (
              checkUserPermission(currentUser, 'reports_view_sales')
                ? <ReportsScreen defaultTab="staff" />
                : <NoPermissionScreen what="استعراض تقارير الموظفين" />
            )}

            {/* =================================================================
                شاشة الإعدادات تحتوي مركز تصفير الحسابات — أخطر شاشة في النظام.
                كانت تُعرض بشرط currentTab وحده، بلا أي فحص صلاحية عند نقطة
                العرض. الحماية الوحيدة كانت إخفاءها من القائمة الجانبية، و
                "إخفاء زر ليس منعاً" كما يقول توثيق المشروع نفسه.
                الآن تُفتح لمن يملك صلاحية إعدادات واحدة على الأقل — وهو نفس
                منطق canAccessModule في permissions.js.
               ================================================================= */}
            {currentTab === 'settings' && (
              canAccessModule(currentUser, 'settings')
                ? <SettingsScreen />
                : <NoPermissionScreen what="الدخول إلى إعدادات النظام" />
            )}
          </React.Suspense>
        </main>

        {/* شريط التنقل السفلي */}
        <BottomNav 
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          toggleSidebar={toggleSidebar}
          setIsCartOpen={setIsCartOpen}
        />

        {/* القائمة الجانبية المنسدلة */}
        <Sidebar 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
        />

      </div>
      <VirtualKeyboardWrapper />
    </div>
  );
}
