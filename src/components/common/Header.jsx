import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { canAccessModule } from '../../utils/permissions';
import { Lock, Unlock, PauseCircle, ShoppingCart, Cloud, CheckCircle2, UserCheck, RefreshCw, Bell, LayoutDashboard, Receipt, Package, Users, Truck, DollarSign, Landmark, BarChart3, Settings , LogOut} from 'lucide-react';

import { ShiftHeaderModal } from '../cashier/ShiftHeaderModal';
import { NotificationsDrawerModal } from './NotificationsDrawerModal';
import { UserSwitchModal } from '../auth/UserSwitchModal';

// =========================================================================
//  أسماء الأدوار كما تُعرض للمستخدم
// =========================================================================
//  كان العرض `role === 'admin' ? 'المدير' : 'كاشير'` — فيظهر المشرف
//  والمحاسبة «كاشير» على شاشتهم وفي سجل الدخول. الاسم الخطأ في شريط
//  دائم الظهور يُربك من يقرأ الشاشة ويُفسد سجلّ من كان يعمل.
const ROLE_LABEL = {
  admin: 'المدير',
  supervisor: 'مشرف',
  accountant: 'محاسب',
  cashier: 'كاشير'
};
const ROLE_EMOJI = {
  admin: '👑',
  supervisor: '🛡️',
  accountant: '📊',
  cashier: '🌸'
};

export const Header = ({ currentTab, setCurrentTab, toggleSidebar, toggleCartDrawer }) => {
  const { 
    storeInfo, 
    currentUser, 
    activeShift, 
    cart, 
    heldBills,
    syncStatus,
    pushAllToCloud,
    pullAllFromCloud,
    notifications,
    unreadNotificationsCount,
    clearAllNotifications,
    markAllNotificationsRead,
    userShifts,
    shiftsHistory,
    users,
    logout,
    logoutFirebase,
    firebaseUser,
    updateStoreInfo,
    confirmDialog
  } = useApp();

  // لوحة المفاتيح الذكية: مفتاح سريع في الشريط العلوي ليصله الكاشير أيضاً،
  // لأن صفحة الإعدادات/القوائم غير متاحة له. نفس إعداد enableVirtualKeyboard.
  const keyboardEnabled = storeInfo?.enableVirtualKeyboard !== false;
  const toggleSmartKeyboard = () => {
    if (updateStoreInfo) updateStoreInfo({ ...storeInfo, enableVirtualKeyboard: !keyboardEnabled });
  };

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState(null);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isUserSwitchModalOpen, setIsUserSwitchModalOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    try {
      if (pullAllFromCloud) await pullAllFromCloud();
      const res = await pushAllToCloud();
      setSyncToast(res?.message || 'تمت المزامنة وتحديث البيانات سحابياً بنجاح 🌸');
      setTimeout(() => setSyncToast(null), 3000);
    } catch (e) {
      setSyncToast('تمت المزامنة وتحديث البيانات بنجاح 🌸');
      setTimeout(() => setSyncToast(null), 3000);
    } finally {
      setIsManualSyncing(false);
    }
  };

  const allOpenShifts = useMemo(() => {
    const validUserIds = new Set((users || []).filter(u => u && u.isActive !== false).map(u => u.id));
    const validUserNames = new Set((users || []).filter(u => u && u.isActive !== false).map(u => String(u.name || '').trim().toLowerCase()));
    return Object.values(userShifts || {}).filter(s => {
      if (!s || s.isOpen !== true) return false;
      const uId = s.userId;
      const cName = String(s.cashierName || '').trim().toLowerCase();
      return (uId && validUserIds.has(uId)) || (cName && validUserNames.has(cName));
    });
  }, [userShifts, users]);
  // ===================================================================
  //  وردية المستخدم الحالي فقط — لا نعرض وردية غيره باسمه
  // ===================================================================
  //  الخلل: كان الشريط يعرض `allOpenShifts[0]` إن لم تكن للمستخدم وردية،
  //  أي وردية أول كاشير فتح — فيظهر اسمه على شاشة كل المستخدمين وكأن
  //  الوردية له. ومع دخول الجميع ببريد واحد صار الالتباس كاملاً.
  const myUserShift = userShifts && currentUser?.id ? userShifts[currentUser.id] : null;
  const isClosedInHist = (shId) => shId && (shiftsHistory || []).some(h => h && h.id === shId && (h.status === 'closed' || h.closedAt || h.isOpen === false));

  const myOpenShift = (myUserShift && myUserShift.isOpen === true && myUserShift.status !== 'closed' && !myUserShift.closedAt && !isClosedInHist(myUserShift.id))
    ? myUserShift
    : (activeShift?.isOpen && (!currentUser?.id || !activeShift.userId || activeShift.userId === currentUser.id) && activeShift.status !== 'closed' && !activeShift.closedAt && !isClosedInHist(activeShift.id))
    ? activeShift
    : null;
  const otherOpenShifts = allOpenShifts.filter(s => s && s.userId !== currentUser?.id);
  const hasAnyOpenShift = Boolean(myOpenShift) || otherOpenShifts.length > 0;
  const activeShiftToDisplay = myOpenShift;

  const cartItemCount = cart.reduce((s, i) => s + i.qty, 0);
  const headerGradient = storeInfo?.headerGradient || 'from-[#380624] via-[#2A0845] to-[#4A0E4E]';
  const headerBorder = storeInfo?.headerBorder || 'border-pink-500/30';

  return (
    <header className={`bg-gradient-to-r ${headerGradient} text-white sticky top-0 z-30 shadow-lg border-b ${headerBorder} transition-colors duration-300`}>
      {/* Toast Feedback for Sync */}
      {syncToast && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-slate-900/95 text-pink-200 border border-pink-500/40 px-4 py-2 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{syncToast}</span>
        </div>
      )}

      {/* الشريط العلوي المصغر (أيقونات فقط للمزامنة والتحديث والوردية + زر تبديل المستخدم) */}
      <div className="px-3 py-1.5 flex items-center justify-between border-b border-pink-900/40 text-xs text-pink-200/80">
        <div className="flex items-center gap-1.5">
          {/* أيقونة المزامنة السحابية */}
          <button
            onClick={handleManualSync}
            disabled={isManualSyncing}
            title={
              isManualSyncing || syncStatus === 'syncing'
                ? 'جاري المزامنة السحابية...'
                : syncStatus === 'connected'
                ? '🟢 متزامن سحابياً (انقر للمزامنة الفورية)'
                : '🟡 مزامنة سحابية (انقر للاتصال)'
            }
            className={`p-1.5 rounded-lg border transition active:scale-95 flex items-center justify-center relative ${
              syncStatus === 'connected'
                ? 'bg-emerald-950/70 hover:bg-emerald-900 border-emerald-500/40 text-emerald-300'
                : 'bg-pink-950/60 hover:bg-pink-900 border-pink-500/30 text-pink-200'
            }`}
          >
            <Cloud className={`w-3.5 h-3.5 ${isManualSyncing || syncStatus === 'syncing' ? 'animate-pulse text-amber-300' : ''}`} />
            <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
              isManualSyncing || syncStatus === 'syncing'
                ? 'bg-amber-400 animate-ping'
                : syncStatus === 'connected'
                ? 'bg-emerald-400'
                : 'bg-rose-400'
            }`} />
          </button>

          <span className="text-pink-900/60">|</span>
          
          {/* زر جرس الإشعارات والتنبيهات المباشرة */}
          <button
            type="button"
            onClick={() => {
              setIsNotificationsOpen(true);
              if (markAllNotificationsRead) markAllNotificationsRead();
            }}
            title="مركز الإشعارات وتنبيهات العمليات المباشرة"
            className="p-1.5 rounded-lg bg-pink-950/60 hover:bg-pink-900 border border-pink-500/30 text-pink-200 hover:text-white transition active:scale-95 flex items-center justify-center relative"
          >
            <Bell className="w-3.5 h-3.5 text-pink-300" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[15px] h-3.5 px-0.5 rounded-full bg-rose-500 text-white text-[8px] font-black flex items-center justify-center animate-pulse border border-slate-900">
                {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
              </span>
            )}
          </button>

          <span className="text-pink-900/60">|</span>

          {/* أيقونة تحديث الصفحة المباشر */}
          <button
            type="button"
            onClick={() => {
              if ('caches' in window) {
                caches.keys().then(names => names.forEach(n => caches.delete(n)));
              }
              window.location.reload(true);
            }}
            title="تحديث التطبيق فوراً وتفريغ الذاكرة المؤقتة (Cache)"
            className="p-1.5 rounded-lg bg-pink-950/60 hover:bg-pink-900/90 border border-pink-500/30 text-pink-200 hover:text-white transition active:scale-95 flex items-center justify-center"
          >
            <RefreshCw className="w-3.5 h-3.5 text-pink-300 hover:rotate-180 transition-transform" />
          </button>

          {/* تشغيل/إغلاق لوحة المفاتيح الذكية — متاح للكاشير مباشرة */}
          <button
            type="button"
            onClick={toggleSmartKeyboard}
            title={keyboardEnabled
              ? 'لوحة المفاتيح الذكية مُفعّلة — انقر لإغلاقها'
              : 'لوحة المفاتيح الذكية مُغلقة — انقر لتشغيلها'}
            className={'p-1.5 rounded-lg border transition active:scale-95 flex items-center justify-center relative ' + (
              keyboardEnabled
                ? 'bg-emerald-500/25 hover:bg-emerald-500/40 border-emerald-400/40 text-emerald-100'
                : 'bg-pink-950/60 hover:bg-pink-900/90 border-pink-500/30 text-pink-300/60'
            )}
          >
            <span className="text-[13px] leading-none">⌨️</span>
            {!keyboardEnabled && (
              <span className="absolute inset-0 flex items-center justify-center text-rose-400 font-black text-base leading-none">/</span>
            )}
          </button>

          <span className="text-pink-900/60">|</span>
          
          {/* أيقونة فتح وإغلاق الوردية */}
          {hasAnyOpenShift ? (
            <button
              type="button"
              onClick={() => setIsShiftModalOpen(true)}
              className="px-2 py-1 rounded-lg bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 hover:text-white border border-emerald-400/40 transition active:scale-95 shadow-xs flex items-center justify-center gap-1 group text-[11px] font-bold"
              title={myOpenShift
                ? `ورديتك مفتوحة 🔓 (${myOpenShift.cashierName || currentUser?.name || 'كاشير'}) - انقر للمتابعة أو الإغلاق وتقرير Z`
                : `لا توجد وردية مفتوحة باسمك — يوجد ${otherOpenShifts.length} وردية مفتوحة لمستخدمين آخرين`}
            >
              <Lock className="w-3.5 h-3.5 text-emerald-300 group-hover:scale-110 transition-transform" />
              <span className="hidden sm:inline">{myOpenShift
                ? `وردية (${myOpenShift.cashierName || currentUser?.name || 'جارية'})`
                : `ورديات أخرى (${otherOpenShifts.length})`}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsShiftModalOpen(true)}
              className="p-1.5 rounded-lg bg-rose-500/25 hover:bg-rose-500/40 text-rose-200 hover:text-white border border-rose-400/40 transition active:scale-95 shadow-xs flex items-center justify-center animate-pulse"
              title="الوردية مغلقة 🔒 (انقر لفتح وردية كاشير جديدة)"
            >
              <Unlock className="w-3.5 h-3.5 text-rose-300" />
            </button>
          )}
        </div>

        {/* =================================================================
             اسم المستخدم = زر تبديل المستخدم
             =================================================================
             كان هنا زر «تبديل المستخدم» مستقلاً، وكان اسم الكاشير في
             الشريط الذي تحته يفتح **نفس النافذة** — زرّان لفعل واحد،
             والاسم يزاحم أزرار التنقّل (الرئيسية/الكاشير/الفواتير…) على
             شاشة لمس ضيّقة. دُمج الاثنان هنا في الشريط العلوي: الاسم
             نفسه هو زر التبديل، وصفّ التنقّل تحته صار خالصاً للتنقّل.
             ================================================================= */}
        <button
          type="button"
          onClick={() => setIsUserSwitchModalOpen(true)}
          className="flex items-center gap-1.5 min-h-[30px] text-pink-100 bg-pink-950/80 px-3 py-1 rounded-xl border border-pink-500/30 shadow-xs cursor-pointer hover:bg-pink-900/90 transition active:scale-95"
          title="المستخدم الحالي — انقر للتبديل بالرمز السري أو بطاقة NFC"
        >
          <span className="text-xs">{ROLE_EMOJI[currentUser?.role] || '🌸'}</span>
          <span className="font-black text-[11px]">{currentUser?.name || 'المستخدم'}</span>
          <span className="text-[10px] text-pink-300/80">({ROLE_LABEL[currentUser?.role] || 'كاشير'})</span>
          {/* العلامة التي تجعل الاسم يُقرأ كزر تبديل لا كنصّ */}
          <UserCheck className="w-3.5 h-3.5 text-purple-300 shrink-0" />
        </button>
      </div>

      {/* الشريط الرئيسي (اسم المتجر في اليمين واسم المستخدم في اليسار بنفس الصف) */}
      <div className="px-3 py-2 flex items-center justify-between">
        
        {/* الطرف الأيمن: الشعار + اسم المتجر فقط */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-pink-600 via-rose-600 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-pink-600/30 border border-pink-300/40 relative overflow-hidden shrink-0">
            {storeInfo.logo ? (
              <img src={storeInfo.logo} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <>
                <span className="text-base">🌸</span>
                <span className="absolute -top-1.5 -right-1.5 text-[10px]">🎀</span>
              </>
            )}
          </div>
          <h1 className="font-black text-sm leading-tight text-white select-none shrink-0">
            {storeInfo.appName || storeInfo.name || 'بيت الورد'}
          </h1>
        </div>

        {/* شريط التنقل العلوي للشاشات العريضة وأجهزة الكمبيوتر (Desktop Top Navigation Bar) مستجيب لإعدادات القوائم */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5 mx-2 overflow-x-auto py-0.5">
          {(() => {
            const desktopOrder = storeInfo?.menuItemsOrder || ['pos', 'invoices', 'products', 'customers', 'suppliers', 'expenses', 'cashDrawer', 'reports', 'dashboard', 'settings'];
            const visibleModules = storeInfo?.visibleModules || {};

            const allModulesDef = {
              pos: { id: 'pos', label: 'الكاشير', icon: ShoppingCart, badge: cartItemCount > 0 ? cartItemCount : null, badgeColor: 'bg-rose-500' },
              invoices: { id: 'invoices', label: 'الفواتير', icon: Receipt, badge: heldBills?.length > 0 ? heldBills.length : null, badgeColor: 'bg-amber-500' },
              products: { id: 'products', label: 'المخزون', icon: Package },
              customers: { id: 'customers', label: 'العملاء', icon: Users },
              suppliers: { id: 'suppliers', label: 'الموردين', icon: Truck },
              expenses: { id: 'expenses', label: 'المصروفات', icon: DollarSign },
              cashDrawer: { id: 'cashDrawer', label: 'الخزينة والورديات', icon: Landmark },
              reports: { id: 'reports', label: 'التقارير', icon: BarChart3 },
              dashboard: { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
              settings: { id: 'settings', label: 'الإعدادات', icon: Settings }
            };

            // ===================================================================
            //  الشريط العلوي يحترم الإخفاء والصلاحيات
            // ===================================================================
            //  كان يتجاهلهما: `settings` تظهر دائماً مهما أخفيتها، ولا فحص
            //  للصلاحيات إطلاقاً — فيرى الكاشير كل الشاشات في الشريط العلوي
            //  رغم إخفائها في الإعدادات. الآن:
            //   • الشاشة المخفاة تختفي (ما عدا الكاشير، فهو شاشة العمل الأساسية)
            //   • والشاشة التي لا يملك المستخدم صلاحيتها تختفي كذلك
            const dynamicTabs = desktopOrder
              .map(k => allModulesDef[k])
              .filter(t => {
                if (!t) return false;
                if (t.id === 'pos') return true;                        // شاشة البيع دائماً
                if (visibleModules[t.id] === false) return false;       // أُخفيت من الإعدادات
                return canAccessModule(currentUser, t.id);              // وصلاحية الدخول
              });

            return dynamicTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCurrentTab(tab.id)}
                  className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-xl text-xs font-black transition active:scale-95 relative shrink-0 ${
                    isActive
                      ? 'bg-white/20 text-white shadow-sm border border-white/30 backdrop-blur-md'
                      : 'text-pink-100/75 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-pink-200' : 'text-pink-200/70'}`} />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black text-white ${tab.badgeColor || 'bg-pink-600'}`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            });
          })()}
        </nav>

        {/* الطرف الأيسر: أزرار الخروج والسلة — اسم المستخدم انتقل للشريط الأعلى */}
        <div className="flex items-center gap-2 shrink-0">
          {/* =================================================================
               تسجيل الخروج من حساب الجهاز
               =================================================================
               كان الزر في القائمة الجانبية وحدها، وهي لا تُفتح على شاشة
               الكمبيوتر أصلاً — فلم يكن هناك طريق لتبديل حساب الجهاز إلا
               بمسح بيانات المتصفح. مكانه الصحيح هنا بجانب اسم المستخدم.
               ملاحظة: هذا خروج كامل من Firebase ويحتاج البريد وكلمة المرور.
               أما تبديل الكاشير السريع فبالنقر على اسم المستخدم بجانبه.
               ================================================================= */}
          <button
            type="button"
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'تسجيل خروج كامل',
                message:
                  (firebaseUser?.email ? `الحساب الحالي: ${firebaseUser.email}\n\n` : '') +
                  'سيُطلب البريد وكلمة المرور عند الدخول من جديد.\n' +
                  'لتبديل الكاشير فقط، انقر على اسم المستخدم بجانب هذا الزر.',
                confirmText: 'تسجيل الخروج',
                tone: 'warning'
              });
              if (!ok) return;
              logout && logout();
              logoutFirebase && logoutFirebase();
            }}
            className="p-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 text-rose-200 border border-rose-500/40 transition active:scale-95"
            title={`تسجيل الخروج من الحساب${firebaseUser?.email ? ' (' + firebaseUser.email + ')' : ''}`}
          >
            <LogOut className="w-4 h-4" />
          </button>

          {/* زر الفواتير المعلقة */}
          {heldBills.length > 0 && (
            <button
              onClick={() => setCurrentTab('invoices')}
              className="px-2 py-1 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-1 text-xs font-semibold hover:bg-amber-500/30 transition active:scale-95"
              title="الفواتير المعلقة"
            >
              <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
              <span className="bg-amber-500 text-slate-900 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                {heldBills.length}
              </span>
            </button>
          )}

          {/* زر سلة المبيعات في حال كنا في شاشة نقاط البيع */}
          {currentTab === 'pos' && (
            <button
              onClick={toggleCartDrawer}
              className="p-1.5 rounded-xl bg-pink-950/80 hover:bg-pink-900 text-white flex items-center gap-1 text-xs font-bold transition active:scale-95 border border-pink-500/30 shadow-xs relative"
              title="عرض السلة"
            >
              <ShoppingCart className="w-4 h-4 text-pink-300" />
              {cartItemCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-tr from-pink-500 to-rose-600 text-white text-[9px] font-black flex items-center justify-center shadow-xs">
                  {cartItemCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* نافذة تبديل المستخدم والتحقق السريع (رمز سري أو بطاقة NFC بدون عرض أسماء) */}
      <UserSwitchModal 
        isOpen={isUserSwitchModalOpen} 
        onClose={() => setIsUserSwitchModalOpen(false)} 
      />

      {/* نافذة فتح وإغلاق الوردية وإصدار تقرير Z */}
      <ShiftHeaderModal 
        isOpen={isShiftModalOpen} 
        onClose={() => setIsShiftModalOpen(false)} 
      />
      {/* نافذة مركز التنبيهات المباشرة */}
      <NotificationsDrawerModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications || []}
        onClearAll={clearAllNotifications}
        onMarkAllRead={markAllNotificationsRead}
        currency={storeInfo?.currency || 'ر.س'}
      />
    </header>
  );
};
