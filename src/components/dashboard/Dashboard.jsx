import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { ShoppingCart, Receipt, Package, Users, Truck, DollarSign, Layers, PieChart, Settings, AlertTriangle, ArrowUpRight, Store, Clock, Award, Smartphone } from 'lucide-react';
import { formatMoney } from '../../utils/helpers';
import { checkUserPermission } from '../../utils/permissions';
import { isToday, classifyInvoicePayments, useActiveShifts } from '../../utils/useShiftMetrics';

export const Dashboard = ({ setCurrentTab }) => {
  const { 
    storeInfo, 
    invoices, 
    products, 
    customers, 
    activeShift, 
    expenses,
    heldBills,
    userShifts,
    users,
    currentUser
  } = useApp();

  // بطاقة الأرباح تظهر فقط لمن يملك صلاحية رؤية الأرباح
  const canViewProfits = checkUserPermission(currentUser, 'reports_view_profits');

  // حساب إحصائيات اليوم بدقة متوافقة مع التوقيت المحلي (← isToday مستوردة من useShiftMetrics)

  const todayInvoices = useMemo(() => {
    return (invoices || []).filter(i => isToday(i.date) && i.status !== 'refunded');
  }, [invoices]);

  const todaySales = todayInvoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
  const todayTax = todayInvoices.reduce((sum, i) => sum + (Number(i.taxAmount) || 0), 0);
  const todayOrdersCount = todayInvoices.length;

  // ← استخدام الدالة المشتركة بدل تكرار تصنيف طرق الدفع يدوياً
  const { cashSales: todayCashSales, cardSales: todayCardSales, creditSales: todayCreditSales } = 
    classifyInvoicePayments(todayInvoices, storeInfo?.paymentMethods);

  let todayCOGS = 0;
  const todayProductSales = {};
  todayInvoices.forEach(i => {
    (i.items || []).forEach(it => {
      const prod = (products || []).find(p => p.id === (it.id || it.product?.id));
      const cost = Number(it.costAtSale ?? it.costPrice ?? prod?.costPrice ?? 0);
      // الفواتير الأقدم تحمل quantity دون qty — قراءة qty وحده كانت
      // تُرجع 1 فيُحسَب ربح اليوم أكبر من حقيقته على الشاشة الرئيسية.
      const qty = Number(it.qty ?? it.quantity ?? 1) || 1;
      todayCOGS += cost * qty;

      const pName = it.name || it.product?.name || 'صنف';
      if (!todayProductSales[pName]) {
        todayProductSales[pName] = { name: pName, qty: 0, total: 0 };
      }
      todayProductSales[pName].qty += qty;
      todayProductSales[pName].total += (Number(it.price || it.unitPrice || 0) * qty);
    });
  });

  const todayExpenses = (expenses || []).filter(e => isToday(e.date) && !e.isIncome).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const todayGrossProfit = todaySales - todayTax - todayCOGS;
  const todayNetProfit = todayGrossProfit - todayExpenses;

  // الأصناف الأكثر مبيعاً اليوم
  const todayTopProducts = Object.values(todayProductSales).sort((a, b) => b.qty - a.qty).slice(0, 3);

  // حساب نقدية الخزينة المتوقعة (← useActiveShifts مستوردة من useShiftMetrics)
  const allOpenShifts = useActiveShifts(userShifts, users);
  // وردية المستخدم الحالي فقط — لا نتبنّى وردية كاشير آخر كأنها ورديتنا
  const effectiveShift = (activeShift?.isOpen &&
    (!currentUser?.id || !activeShift.userId || activeShift.userId === currentUser.id))
    ? activeShift
    : activeShift;

  const startCashEffective = effectiveShift?.startCash 
    ? Number(effectiveShift.startCash) 
    : (allOpenShifts.reduce((s, sh) => s + (Number(sh.startCash) || 0), 0) || 0);

  // حساب مبيعات النقد الخاصة بالوردية الحالية النشطة حصراً لمنع خلط الورديات السابقة
  const shiftCashSales = useMemo(() => {
    if (!effectiveShift?.isOpen || !effectiveShift?.openedAt) return 0;
    const shiftOpenTime = new Date(effectiveShift.openedAt).getTime();
    return (todayInvoices || []).reduce((sum, inv) => {
      const invTime = new Date(inv.date || 0).getTime();
      if (invTime < shiftOpenTime) return sum;
      if (inv.shiftId && inv.shiftId !== effectiveShift.id) return sum;

      const pMethod = String(inv.paymentMethod || inv.paymentMethodType || '').toLowerCase();
      if (pMethod === 'cash' || pMethod === 'نقدي' || pMethod === 'نقد') {
        return sum + (Number(inv.grandTotal ?? inv.finalTotal ?? inv.total) || 0);
      } else if (pMethod === 'split' || (inv.splitPayments && inv.splitPayments.length > 0)) {
        if (inv.splitPayments && Array.isArray(inv.splitPayments)) {
          const cashPart = inv.splitPayments.filter(sp => sp.methodType === 'cash' || sp.methodId === 'cash').reduce((s, sp) => s + (Number(sp.amount) || 0), 0);
          return sum + cashPart;
        }
        return sum + (Number(inv.splitCash ?? inv.splitDetails?.cash) || 0);
      }
      return sum;
    }, 0);
  }, [todayInvoices, effectiveShift]);

  const cashInDrawer = effectiveShift?.isOpen
    ? startCashEffective + shiftCashSales + (Number(effectiveShift?.cashIn) || 0) - (Number(effectiveShift?.cashOut) || 0)
    : startCashEffective + todayCashSales;

  // المنتجات المنخفضة في المخزون
  const lowStockProducts = (products || []).filter(p => !p?.isArchived && Number(p.stock) <= Number(p.minStock || 0));

  // البطاقات الرئيسية للأقسام وفق الهيكل التخطيطي
  const allModulesMap = {
    pos: {
      id: 'pos',
      title: 'نقطة البيع (الكاشير)',
      desc: 'إصدار فاتورة بيع جديدة وسريعة',
      icon: ShoppingCart,
      color: 'bg-gradient-to-tr from-purple-600 to-pink-500',
      badge: 'الرئيسي'
    },
    invoices: {
      id: 'invoices',
      title: 'سجل الفواتير والمبيعات',
      desc: `${invoices?.length || 0} فاتورة مسجلة`,
      icon: Receipt,
      color: 'bg-purple-700',
      badge: null,
      badgeColor: 'bg-amber-500'
    },
    products: {
      id: 'products',
      title: 'المنتجات والمخزون',
      desc: `${products?.length || 0} صنف مسجل`,
      icon: Package,
      color: 'bg-pink-600',
      badge: lowStockProducts.length > 0 ? `${lowStockProducts.length} ناقص` : null,
      badgeColor: 'bg-rose-500'
    },
    reports: {
      id: 'reports',
      title: 'التقارير والأرباح',
      desc: 'المؤشرات، الرسوم، والأكثر مبيعاً',
      icon: PieChart,
      color: 'bg-violet-700',
      badge: 'محدث 📊'
    },
    cashDrawer: {
      id: 'cashDrawer',
      title: 'حركة الخزينة والوردية',
      desc: effectiveShift?.isOpen ? 'الوردية جارية 🔓' : 'الوردية مغلقة 🔒',
      icon: Layers,
      color: 'bg-teal-700'
    },
    customers: {
      id: 'customers',
      title: 'العملاء والآجل',
      desc: `${customers?.length || 0} عميل مسجل`,
      icon: Users,
      color: 'bg-fuchsia-700'
    },
    suppliers: {
      id: 'suppliers',
      title: 'الموردين والمشتريات',
      desc: 'تسجيل بضاعة ومشتريات',
      icon: Truck,
      color: 'bg-purple-800'
    },
    expenses: {
      id: 'expenses',
      title: 'المصروفات والإيرادات',
      desc: 'تسجيل النثريات والمصاريف',
      icon: DollarSign,
      color: 'bg-rose-600'
    },
    settings: {
      id: 'settings',
      title: 'إعدادات النظام العامة',
      desc: 'المحل، الضريبة، والباركود',
      icon: Settings,
      color: 'bg-slate-800'
    }
  };

  const configuredOrder = storeInfo?.menuItemsOrder || ['pos', 'invoices', 'products', 'reports', 'cashDrawer', 'customers', 'suppliers', 'expenses', 'settings'];
  const visibleMap = storeInfo?.visibleModules || {};

  const mainModules = configuredOrder
    .map(key => allModulesMap[key])
    .filter(m => m && (m.id === 'pos' || m.id === 'settings' || visibleMap[m.id] !== false));

  return (
    <div className="p-3.5 sm:p-5 lg:p-8 space-y-5 max-w-md md:max-w-3xl lg:max-w-7xl mx-auto pb-24 font-cairo select-none animate-in fade-in">
      
      {/* بطاقة الترحيب والوردية والمؤشرات الفورية */}
      <div className="bg-gradient-to-l from-purple-950 via-fuchsia-950 to-purple-900 rounded-3xl p-5 text-white shadow-xl border border-purple-800/40 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-32 h-32 bg-pink-500/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-center justify-between relative z-10 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 via-fuchsia-600 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-sm sm:text-base text-white">
                {storeInfo?.hideStoreNameAfterLogin ? 'لوحة تحكم نقاط البيع' : (storeInfo?.name || 'بيت الورد')}
              </h2>
              <p className="text-[11px] text-pink-200 flex items-center gap-1">
                <Clock className="w-3 h-3 text-pink-300" />
                <span>الوردية: {activeShift?.cashierName || 'كاشير مبيعات'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canViewProfits && (
              <button
                type="button"
                onClick={() => setCurrentTab('ownerMobileDashboard')}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white text-xs font-black shadow-lg shadow-rose-500/20 flex items-center gap-1.5 transition active:scale-95 border border-amber-300/40"
                title="لوحة تحكم ومتابعة المالك المباشرة للجوال"
              >
                <Smartphone className="w-4 h-4" />
                <span>لوحة المالك 📱</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setCurrentTab('pos')}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white text-xs font-bold shadow-lg shadow-pink-500/20 flex items-center gap-1.5 transition active:scale-95 border border-pink-300/30"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>ابدأ البيع</span>
            </button>
          </div>
        </div>

        {/* بطاقات الإحصائيات الفورية لليوم */}
        {!storeInfo?.hideMainCards && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2.5 border-t border-purple-800/50">
            {/* 1. إجمالي المبيعات اليوم */}
            {!storeInfo?.hideTotalSalesAfterLogin && (
              <div className="bg-gradient-to-br from-pink-950/70 to-purple-950/80 backdrop-blur-md rounded-2xl p-3 border-2 border-pink-400/50 shadow-lg shadow-pink-950/30 flex flex-col justify-between space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-pink-200 font-extrabold block">مبيعات اليوم</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-pink-500/25 text-pink-200 text-[10px] font-bold font-mono">
                    {todayOrdersCount} طلب
                  </span>
                </div>
                <p className="text-base sm:text-lg font-black text-white font-mono tracking-tight">
                  {formatMoney(todaySales, storeInfo?.currency)}
                </p>
                <span className="text-[9px] text-pink-300/80 font-bold">إجمالي فواتير اليوم</span>
              </div>
            )}

            {/* 2. الأرباح اليومية — مقيّدة بصلاحية reports_view_profits */}
            {canViewProfits && (
            <div className="bg-gradient-to-br from-emerald-950/70 to-teal-950/80 backdrop-blur-md rounded-2xl p-3 border-2 border-emerald-400/50 shadow-lg shadow-emerald-950/30 flex flex-col justify-between space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-emerald-200 font-extrabold block">أرباح اليوم الصافية</span>
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/25 text-emerald-200 text-[10px] font-bold font-mono">
                  صافي الربح
                </span>
              </div>
              <p className={`text-base sm:text-lg font-black font-mono tracking-tight ${todayNetProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {formatMoney(todayNetProfit, storeInfo?.currency)}
              </p>
              <span className="text-[9px] text-emerald-300/80 font-bold">بعد خصم التكلفة</span>
            </div>
            )}

            {/* 3. نقدية الصندوق */}
            <div className="bg-gradient-to-br from-amber-950/70 to-orange-950/80 backdrop-blur-md rounded-2xl p-3 border-2 border-amber-400/60 shadow-lg shadow-amber-950/30 flex flex-col justify-between space-y-1 col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-amber-200 font-extrabold block">النقدية بالدرج</span>
                <span className="px-1.5 py-0.5 rounded-md bg-amber-500/25 text-amber-200 text-[10px] font-bold font-mono">
                  الكاش الفعلي
                </span>
              </div>
              <p className="text-base sm:text-lg font-black text-amber-300 font-mono tracking-tight">
                {formatMoney(cashInDrawer, storeInfo?.currency)}
              </p>
              <span className="text-[9px] text-amber-300/80 font-bold">الرصيد المحسوب بالصندوق</span>
            </div>
          </div>
        )}
      </div>

      {/* شريط الأصناف الأكثر مبيعاً اليوم إن وجدت */}
      {todayTopProducts.length > 0 && (
        <div 
          onClick={() => setCurrentTab('reports')}
          className="bg-white border-2 border-pink-200/90 rounded-2xl p-3.5 shadow-sm space-y-2.5 cursor-pointer hover:border-pink-400 transition"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-500" />
              <span>الأكثر مبيعاً اليوم</span>
            </h4>
            <span className="text-[11px] text-pink-700 font-extrabold flex items-center gap-0.5">
              <span>عرض التقرير الكامل</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {todayTopProducts.map((tp, idx) => (
              <div key={idx} className="flex-1 min-w-[110px] p-2.5 bg-gradient-to-br from-pink-50/70 to-purple-50/50 rounded-2xl border-2 border-pink-200/70 text-center shadow-xs">
                <span className="text-[11px] font-bold text-slate-900 block truncate">{tp.name}</span>
                <span className="text-xs font-black text-pink-700 font-mono mt-0.5 block">{tp.qty} قطعة</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* تنبيه المنتجات الناقصة إن وجدت */}
      {lowStockProducts.length > 0 && (
        <div 
          onClick={() => setCurrentTab('products')}
          className="bg-gradient-to-br from-rose-50/90 to-pink-50/70 border-2 border-rose-300 rounded-2xl p-3.5 flex items-center justify-between cursor-pointer hover:bg-rose-100/70 transition shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-md shadow-rose-500/20">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-black text-rose-950">تنبيه نواقص المخزون</p>
              <p className="text-[11px] font-bold text-rose-700">يوجد {lowStockProducts.length} منتجات قاربت على النفاد</p>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-rose-600" />
        </div>
      )}

      {/* شبكة الأقسام والشاشات الرئيسية */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-1">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
            أقسام النظام الرئيسية
          </h3>
          <span className="text-[11px] text-pink-700 font-bold">اختر للوصول السريع</span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
          {mainModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                onClick={() => setCurrentTab(mod.id)}
                className="bg-white hover:bg-pink-50/30 border-2 border-slate-200/90 hover:border-pink-300 rounded-2xl p-3 text-right shadow-sm hover:shadow-md transition active:scale-95 flex flex-col justify-between h-32 relative overflow-hidden group"
              >
                <div className="flex items-start justify-between w-full">
                  <div className={`w-9 h-9 rounded-xl ${mod.color} text-white flex items-center justify-center shadow-md`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  {mod.badge && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${mod.badgeColor || 'bg-blue-600'}`}>
                      {mod.badge}
                    </span>
                  )}
                </div>

                <div>
                  <h4 className="font-black text-xs leading-tight text-slate-900 group-hover:text-pink-600 transition">
                    {mod.title}
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-snug">
                    {mod.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
};
