import React from 'react';
import { useApp } from '../../context/AppContext';
import { X, Store, LayoutDashboard, ShoppingCart, Receipt, Package, Users, Truck, DollarSign, PieChart, Settings, ChevronLeft, Lock, LogOut, Smartphone } from 'lucide-react';
import { canAccessModule } from '../../utils/permissions';

export const Sidebar = ({ isOpen, onClose, currentTab, setCurrentTab }) => {
  const { 
    storeInfo, 
    lockScreen,
    logout,
    logoutFirebase,
    currentUser,
    firebaseUser
  } = useApp();

  if (!isOpen) return null;

  const allModulesDef = {
    dashboard: { id: 'dashboard', label: 'الرئيسية / لوحة التحكم', icon: LayoutDashboard, desc: 'إحصائيات المبيعات والوردية' },
    ownerMobileDashboard: { id: 'ownerMobileDashboard', label: 'لوحة المالك المباشرة 📱', icon: Smartphone, desc: 'متابعة المبيعات والأرباح والدرج للجوال' },
    pos: { id: 'pos', label: 'نقطة البيع (الكاشير)', icon: ShoppingCart, desc: 'تسجيل الفواتير السريعة' },
    invoices: { id: 'invoices', label: 'سجل الفواتير والمعلقة', icon: Receipt, desc: 'إدارة الفواتير والاسترجاع' },
    products: { id: 'products', label: 'المنتجات والمخزون', icon: Package, desc: 'الأصناف والتصنيفات والجرد' },
    customers: { id: 'customers', label: 'العملاء والديون والآجل', icon: Users, desc: 'كشف الحساب وسندات القبض' },
    suppliers: { id: 'suppliers', label: 'الموردين والمشتريات', icon: Truck, desc: 'فواتير المشتريات وسندات الصرف' },
    expenses: { id: 'expenses', label: 'المصروفات والإيرادات', icon: DollarSign, desc: 'النثريات والمصاريف التشغيلية' },
    cashDrawer: { id: 'cashDrawer', label: 'حركة الخزينة والوردية', icon: LayoutDashboard, desc: 'فتح وإغلاق الوردية Z-Report' },
    reports: { id: 'reports', label: 'التقارير والإحصائيات', icon: PieChart, desc: 'الأرباح والإقرار الضريبي ZATCA' },
    // 'userReports' حُذف: كان يفتح <ReportsScreen defaultTab="staff" /> — أي نفس
    // تبويب «أداء الكاشيرات» الموجود داخل التقارير. مدخلان لشاشة واحدة في
    // قائمة يقرؤها الكاشير على شاشة ضيّقة.
    settings: { id: 'settings', label: 'إعدادات النظام والتهيئة', icon: Settings, desc: 'تخصيص النظام والطابعة والواتساب' },
  };

  const savedOrder = storeInfo.menuItemsOrder || ['dashboard', 'ownerMobileDashboard', 'pos', 'invoices', 'products', 'customers', 'suppliers', 'expenses', 'cashDrawer', 'reports', 'settings'];
  let currentOrder = savedOrder.includes('ownerMobileDashboard')
    ? savedOrder
    : ['dashboard', 'ownerMobileDashboard', ...savedOrder.filter(k => k !== 'dashboard' && k !== 'ownerMobileDashboard')];
  // 'userReports' يُرشَّح من الترتيب المحفوظ أيضاً: المتاجر التي حفظت القائمة
  // قبل حذفه ما زالت تحمله في storeInfo.menuItemsOrder، وبلا تعريف له في
  // allModules كان سيصيّر بنداً فارغاً.
  currentOrder = currentOrder.filter(k => k !== 'userReports');
  const visibleModules = storeInfo.visibleModules || {};

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* خلفية معتمة */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
      />

      {/* لوحة القائمة الجانبية */}
      <div className="relative w-80 max-w-[85vw] bg-gradient-to-b from-[#2A0845] via-[#200535] to-[#160224] text-white h-full shadow-2xl flex flex-col z-10 border-l border-pink-900/50 animate-in slide-in-from-right duration-200">
        
        {/* رأس القائمة */}
        <div className="p-4 border-b border-pink-900/50 flex items-center justify-between bg-[#200535]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-600 via-rose-600 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-pink-600/30 border border-pink-400/30">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-sm text-white">
                {storeInfo.appName || storeInfo.name || 'بيت الورد'}
              </h2>
              <span className="text-[10px] text-pink-300/80 font-medium">القائمة الرئيسية للتنقل</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl bg-pink-950/80 hover:bg-pink-900 text-pink-300 hover:text-white transition border border-pink-500/20 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* عناصر القائمة السريعة */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 text-xs">
          <div className="px-2 py-1 text-[10px] font-bold text-pink-300/70 uppercase tracking-wider">
            أقسام النظام
          </div>

          {currentOrder.map((modKey) => {
            const item = allModulesDef[modKey];
            if (!item) return null;
            // إخفاء الصفحة تماماً إذا لم يكن لدى المستخدم تصريح للوصول إليها
            if (!canAccessModule(currentUser, modKey)) return null;
            const Icon = item.icon;
            const isVisible = visibleModules[modKey] !== false;
            if (!isVisible) return null;
            const isCurrent = currentTab === modKey;

            return (
              <button
                key={modKey}
                type="button"
                onClick={() => {
                  setCurrentTab(modKey);
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-3 rounded-2xl border transition text-right group active:scale-[0.98] ${
                  isCurrent 
                    ? 'bg-gradient-to-r from-pink-700 via-rose-600 to-purple-700 text-white border-pink-400/50 shadow-md shadow-pink-900/30 font-extrabold' 
                    : 'bg-[#380624]/40 border-pink-900/30 text-pink-100 hover:bg-pink-950/70 hover:border-pink-500/40'
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${
                    isCurrent ? 'bg-white/20 text-white' : 'bg-pink-950/80 text-pink-300 group-hover:text-pink-100 group-hover:bg-pink-900'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <span className="font-bold block text-xs truncate">{item.label}</span>
                    <span className={`text-[10px] block truncate ${isCurrent ? 'text-pink-100/90' : 'text-pink-300/60'}`}>
                      {item.desc}
                    </span>
                  </div>
                </div>

                <ChevronLeft className={`w-4 h-4 transition ${isCurrent ? 'text-white' : 'text-pink-500/40 group-hover:text-pink-300 group-hover:-translate-x-0.5'}`} />
              </button>
            );
          })}

          {/* بطاقة الوصول السريع للإعدادات الشاملة (تظهر فقط للمصرح لهم بدخول الإعدادات) */}
          {canAccessModule(currentUser, 'settings') && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setCurrentTab('settings');
                  onClose();
                }}
                className="w-full p-3 rounded-2xl bg-gradient-to-r from-purple-900/50 to-pink-900/50 border border-pink-500/30 hover:border-pink-400 text-pink-200 hover:text-white flex items-center justify-between transition text-xs font-bold shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-pink-400 animate-spin-slow" />
                  <span>إعدادات النظام والتخصيص</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/30 text-pink-200">الكل ⚙️</span>
              </button>
            </div>
          )}
        </div>

        {/* ===================================================================
             قفل الشاشة وتسجيل الخروج من الحساب
             ===================================================================
             فرق مهم بين الزرّين:
             • قفل الشاشة: يبقى الجهاز داخلاً بنفس حساب Firebase، ويُطلب
               الرمز السريع فقط. للتبديل السريع بين الكاشيرات أثناء العمل.
             • تسجيل الخروج من الحساب: خروج كامل من Firebase، ويحتاج
               البريد وكلمة المرور. يُستخدم لتغيير حساب الجهاز نفسه —
               مثل تحويل جهاز الكاشير لحساب الكاشير.
             كانت دالة الخروج موجودة في الكود بلا أي زر يستدعيها.
             =================================================================== */}
        <div className="p-3 border-t border-pink-900/50 bg-[#1a0429] space-y-2">
          <button
            type="button"
            onClick={() => { onClose && onClose(); lockScreen && lockScreen(); }}
            className="w-full py-2 px-3 rounded-xl bg-pink-500/15 hover:bg-pink-500/25 text-pink-100 border border-pink-400/30 text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95"
          >
            <Lock className="w-3.5 h-3.5 text-pink-300" />
            <span>قفل الشاشة (تبديل الكاشير)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const ok = window.confirm(
                'تسجيل خروج كامل من حساب الجهاز؟\n\n' +
                'سيُطلب البريد وكلمة المرور عند الدخول من جديد.\n' +
                'لتبديل الكاشير فقط استخدم "قفل الشاشة" بدلاً من هذا.'
              );
              if (!ok) return;
              onClose && onClose();
              logout && logout();
              logoutFirebase && logoutFirebase();
            }}
            className="w-full py-2 px-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/35 text-rose-100 border border-rose-500/40 text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-300" />
            <span>تسجيل الخروج من الحساب</span>
          </button>

          {firebaseUser?.email && (
            <p className="text-[10px] text-pink-300/60 text-center font-mono truncate" dir="ltr">
              {firebaseUser.email}
            </p>
          )}
        </div>

        {/* تذييل القائمة الجانبية: معلومات المستخدم والنظام */}
        <div className="p-3 border-t border-pink-900/50 bg-[#200535] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-pink-500/20 text-pink-300 font-bold flex items-center justify-center border border-pink-400/30 shrink-0">
              {currentUser?.role === 'admin' ? '👑' : '🌸'}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-pink-100 text-xs truncate">{currentUser?.name || 'المستخدم'}</p>
              <p className="text-[10px] text-pink-300/70 truncate">{currentUser?.roleName || 'مدير النظام'}</p>
            </div>
          </div>

          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
            النظام نشط 🟢
          </span>
        </div>

      </div>
    </div>
  );
};
