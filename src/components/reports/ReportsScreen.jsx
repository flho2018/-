import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { formatMoney, buildPaymentBreakdown, ARABIC_DAYS } from '../../utils/helpers';
import { checkUserPermission } from '../../utils/permissions';
import { FinancialOverviewTab } from './tabs/FinancialOverviewTab';
import { TopProductsTab } from './tabs/TopProductsTab';
import { PaymentsAndVatTab } from './tabs/PaymentsAndVatTab';
import { StaffAndShiftsTab } from './tabs/StaffAndShiftsTab';
import { AuditLogTab } from './tabs/AuditLogTab';

export const ReportsScreen = ({ defaultTab }) => {
  const { 
    invoices, 
    expenses, 
    products, 
    categories, 
    storeInfo, 
    purchases,
    currentUser
  } = useApp();

  // ================= صلاحيات التقارير =================
  const canViewSales    = checkUserPermission(currentUser, 'reports_view_sales');
  const canViewProfits  = checkUserPermission(currentUser, 'reports_view_profits');
  const canViewVat      = checkUserPermission(currentUser, 'reports_vat_zatca');
  const canViewShifts   = checkUserPermission(currentUser, 'drawer_view_shifts_history');

  const [period, setPeriod] = useState('month'); // 'today', 'week', 'month', 'all'
  const [activeReportTab, setActiveReportTab] = useState(defaultTab || 'overview');
  const [topProductsSortBy, setTopProductsSortBy] = useState('qty');

  React.useEffect(() => {
    if (defaultTab) {
      setActiveReportTab(defaultTab);
    }
  }, [defaultTab]);

  const now = new Date();

  // تصفية الفواتير والمصروفات والمشتريات حسب الفترة الزمنية
  const filteredInvoices = useMemo(() => {
    return (invoices || []).filter(inv => {
      if (inv.status === 'refunded' || !inv.date) return false;
      const invDate = new Date(inv.date);
      if (period === 'today') {
        return invDate.toDateString() === now.toDateString();
      } else if (period === 'week') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return invDate >= sevenDaysAgo;
      } else if (period === 'month') {
        return invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [invoices, period]);

  // تفصيل المبيعات حسب وسيلة الدفع — يُحسب هنا مرة واحدة ويُمرَّر لكل التبويبات.
  // (قبل هذا الإصلاح كانت تبويبات المؤشرات وأداء الكاشيرات تستخدمه بدون تعريف
  // فتتعطل الشاشة كلها برسالة paymentBreakdown is not defined)
  const paymentBreakdown = useMemo(
    () => buildPaymentBreakdown(filteredInvoices, storeInfo),
    [filteredInvoices, storeInfo]
  );

  const filteredExpenses = useMemo(() => {
    return (expenses || []).filter(exp => {
      if (exp.isIncome || !exp.date) return false;
      const expDate = new Date(exp.date);
      if (period === 'today') return expDate.toDateString() === now.toDateString();
      if (period === 'week') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return expDate >= sevenDaysAgo;
      }
      if (period === 'month') return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
      return true;
    });
  }, [expenses, period]);

  const filteredPurchases = useMemo(() => {
    return (purchases || []).filter(pur => {
      if (!pur.date) return false;
      const purDate = new Date(pur.date);
      if (period === 'today') return purDate.toDateString() === now.toDateString();
      if (period === 'week') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return purDate >= sevenDaysAgo;
      }
      if (period === 'month') return purDate.getMonth() === now.getMonth() && purDate.getFullYear() === now.getFullYear();
      return true;
    });
  }, [purchases, period]);

  // الحسابات المالية الدقيقة
  const totalSales = filteredInvoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
  const totalTax = filteredInvoices.reduce((sum, i) => sum + (Number(i.taxAmount) || 0), 0);
  const totalDiscounts = filteredInvoices.reduce((sum, i) => sum + (Number(i.discount) || 0), 0);
  const totalExp = filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const invoiceCount = filteredInvoices.length;
  const averageOrderValue = invoiceCount > 0 ? totalSales / invoiceCount : 0;

  // خريطة المنتجات وتكلفة البضاعة المباعة (COGS)
  const { costOfGoodsSold, productSalesMap, categorySalesMap, totalUnitsSold } = useMemo(() => {
    let cogs = 0;
    let units = 0;
    const pMap = {};
    const cMap = {};

    filteredInvoices.forEach(inv => {
      const invItems = inv.items || [];
      // الضريبة تُستخرَج من الإيراد فقط إذا كانت مفعّلة وشاملة على هذه الفاتورة.
      // إن كانت معطّلة (بيع معفى) أو مضافة فوق السعر فالسعر أصلاً بلا ضريبة.
      const invTaxRate = Number(inv.taxRate) || 0;
      const taxDivisor = (inv.taxEnabled && inv.taxInclusive && invTaxRate > 0)
        ? (1 + invTaxRate / 100)
        : 1;
      // الخصم العام على الفاتورة = إجمالي الخصم − مجموع خصومات الأصناف.
      // يُوزَّع تناسبياً على الأصناف حتى لا يتضخّم إيراد/ربح كل صنف.
      const invItemDiscounts = invItems.reduce((s, it) => s + (Number(it.discount) || 0), 0);
      const invGlobalDiscount = Math.max(0, (Number(inv.discount) || 0) - invItemDiscounts);
      const invDistBase = invItems.reduce((s, it) => {
        const up = Number(it.price ?? it.unitPrice ?? 0);
        const q = Number(it.qty ?? it.quantity ?? 1) || 1;
        return s + Math.max(0, (up * q) - (Number(it.discount) || 0));
      }, 0);

      invItems.forEach(item => {
        const prodId = item.id || item.product?.id || item.productId || item.name;
        const prodName = item.name || item.product?.name || 'منتج';
        const prod = (products || []).find(p => p.id === prodId) || item.product;
        const unitPrice = Number(item.price ?? item.unitPrice ?? prod?.sellingPrice ?? 0);
        // costAtSale = التكلفة المثبّتة لحظة البيع (تُقدَّم على التكلفة الحالية)
        const cost = Number(item.costAtSale ?? item.costPrice ?? prod?.costPrice ?? 0);
        // يجب قراءة الحقلين: الفواتير تُخزَّن بـ qty و quantity معاً، لكن
        // الفواتير الأقدم تحمل quantity وحده. قراءة qty فقط كانت تُرجع 1
        // فتُحسَب تكلفة قطعة واحدة لبيعة من خمس قطع — فيظهر الربح أكبر
        // من حقيقته وعدد القطع المباعة أقل، بلا أي رسالة خطأ.
        const qty = Number(item.qty ?? item.quantity ?? 1) || 1;
        const itemDiscount = Number(item.discount) || 0;
        const afterItemDiscount = Math.max(0, (unitPrice * qty) - itemDiscount);
        // حصة هذا الصنف من الخصم العام (تناسبياً مع صافيه بعد خصمه الفردي)
        const globalShare = invDistBase > 0
          ? invGlobalDiscount * (afterItemDiscount / invDistBase)
          : 0;
        // الإيراد الصافي بعد كل الخصومات وبلا ضريبة — ليتطابق مع الربح الإجمالي
        const itemNetRevenue = Math.max(0, afterItemDiscount - globalShare) / taxDivisor;
        const itemTotalCost = cost * qty;
        const itemProfit = itemNetRevenue - itemTotalCost;
        const catName = item.category || prod?.category || 'عام';

        cogs += itemTotalCost;
        units += qty;

        if (!pMap[prodId]) {
          pMap[prodId] = { id: prodId, name: prodName, category: catName, qty: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0 };
        }
        pMap[prodId].qty += qty;
        pMap[prodId].totalRevenue += itemNetRevenue;
        pMap[prodId].totalCost += itemTotalCost;
        pMap[prodId].totalProfit += itemProfit;

        if (!cMap[catName]) {
          cMap[catName] = { name: catName, qty: 0, totalRevenue: 0, totalProfit: 0 };
        }
        cMap[catName].qty += qty;
        cMap[catName].totalRevenue += itemNetRevenue;
        cMap[catName].totalProfit += itemProfit;
      });
    });

    return { costOfGoodsSold: cogs, productSalesMap: pMap, categorySalesMap: cMap, totalUnitsSold: units };
  }, [filteredInvoices, products]);

  const grossProfit = totalSales - totalTax - costOfGoodsSold;
  const netProfit = grossProfit - totalExp;
  const grossProfitMargin = totalSales > 0 ? Math.round((grossProfit / totalSales) * 100) : 0;
  const netProfitMargin = totalSales > 0 ? Math.round((netProfit / totalSales) * 100) : 0;

  const topProductsList = useMemo(() => {
    return Object.values(productSalesMap).sort((a, b) => {
      if (topProductsSortBy === 'revenue') return b.totalRevenue - a.totalRevenue;
      if (topProductsSortBy === 'profit') return b.totalProfit - a.totalProfit;
      return b.qty - a.qty;
    });
  }, [productSalesMap, topProductsSortBy]);

  const topCategoriesList = useMemo(() => {
    return Object.values(categorySalesMap).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [categorySalesMap]);

  const salesTimelineData = useMemo(() => {
    const daysMap = {};
    filteredInvoices.forEach(inv => {
      const d = new Date(inv.date);
      const dateKey = period === 'today' 
        ? `${String(d.getHours()).padStart(2, '0')}:00`
        : d.toISOString().split('T')[0];
      if (!daysMap[dateKey]) {
        daysMap[dateKey] = { label: dateKey, total: 0, count: 0, profit: 0 };
      }
      daysMap[dateKey].total += Number(inv.total) || 0;
      daysMap[dateKey].count += 1;
    });
    return Object.values(daysMap).slice(-14);
  }, [filteredInvoices, period]);

  const maxTimelineSales = useMemo(() => {
    return Math.max(...salesTimelineData.map(d => d.total), 100);
  }, [salesTimelineData]);

  const isTaxActive = storeInfo?.taxEnabled !== false;

  const totalInventoryCost = (products || []).reduce((sum, p) => sum + ((Number(p.costPrice) || 0) * (Number(p.stock) || 0)), 0);
  const totalInventoryRetail = (products || []).reduce((sum, p) => sum + ((Number(p.sellingPrice) || 0) * (Number(p.stock) || 0)), 0);
  const potentialInventoryProfit = totalInventoryRetail - totalInventoryCost;

  // المؤشرات الذكية
  const smartAnalytics = useMemo(() => {
    const hourlySales = Array(24).fill(0).map((_, i) => ({ hour: i, sales: 0, count: 0 }));
    const dayOfWeekSales = Array(7).fill(0).map((_, i) => ({ dayIndex: i, name: ARABIC_DAYS[i], sales: 0, count: 0 }));

    filteredInvoices.forEach(inv => {
      const d = new Date(inv.date);
      const h = d.getHours();
      const day = d.getDay();
      const tot = Number(inv.total) || 0;

      if (h >= 0 && h < 24) {
        hourlySales[h].sales += tot;
        hourlySales[h].count += 1;
      }
      if (day >= 0 && day < 7) {
        dayOfWeekSales[day].sales += tot;
        dayOfWeekSales[day].count += 1;
      }
    });

    // إيجاد نافذة الذروة (4 ساعات متتالية الأكثر حركة)
    let bestWindowStart = 16;
    let maxWindowSales = 0;
    for (let i = 0; i <= 20; i++) {
      const windowSum = (hourlySales[i]?.sales || 0) + 
                        (hourlySales[i+1]?.sales || 0) + 
                        (hourlySales[i+2]?.sales || 0) + 
                        (hourlySales[i+3]?.sales || 0);
      if (windowSum > maxWindowSales) {
        maxWindowSales = windowSum;
        bestWindowStart = i;
      }
    }
    const peakWindowEnd = (bestWindowStart + 4) % 24;
    const formatHour = (h) => {
      const ampm = h >= 12 ? 'م' : 'ص';
      const h12 = h % 12 || 12;
      return `${h12}:00 ${ampm}`;
    };
    const peakHoursText = `${formatHour(bestWindowStart)} - ${formatHour(peakWindowEnd)}`;
    const peakWindowPercent = totalSales > 0 ? Math.round((maxWindowSales / totalSales) * 100) : 0;

    // إيجاد أفضل يوم في الأسبوع
    const sortedDays = [...dayOfWeekSales].sort((a, b) => b.sales - a.sales);
    const topDay = sortedDays[0] || { name: 'الخميس', sales: 0 };
    const topDayPercent = totalSales > 0 ? Math.round((topDay.sales / totalSales) * 100) : 0;

    // أفضل صنف من حيث صافي الأرباح
    const productsList = Object.values(productSalesMap);
    const topProfitProd = productsList.sort((a, b) => b.profit - a.profit)[0] || null;

    // نسبة الدفع الرقمي مقابل النقدي
    const cardSum = (paymentBreakdown.find(p => p.id === 'card' || p.type === 'card')?.amount || 0) +
                    (paymentBreakdown.find(p => p.id === 'bank' || p.type === 'bank')?.amount || 0);
    const cashSum = paymentBreakdown.find(p => p.id === 'cash' || p.type === 'cash')?.amount || 0;
    const digitalPercent = totalSales > 0 ? Math.round((cardSum / totalSales) * 100) : 0;
    const cashPercent = totalSales > 0 ? Math.round((cashSum / totalSales) * 100) : 0;

    // توليد التوصيات الذكية التنفيذية للمالك
    const recommendations = [];
    if (peakWindowPercent >= 30) {
      recommendations.push(`🔥 تتركز ${peakWindowPercent}% من مبيعاتك في فترة الذروة المسائية (${peakHoursText})؛ احرص على جاهزية التنسيقات السريعة وتواجد فريق العمل بكامل طاقته.`);
    }
    if (topProfitProd && topProfitProd.profit > 0) {
      recommendations.push(`💎 الصنف الأقوى ربحية هو "${topProfitProd.name}" (حقق أرباحاً صافية قدرها ${formatMoney(topProfitProd.profit, storeInfo?.currency)})؛ ضاعف عرضه في الواجهة الرئيسية.`);
    }
    if (averageOrderValue < 50 && invoiceCount >= 2) {
      recommendations.push(`🛍️ متوسط سلة المشتريات (${formatMoney(averageOrderValue, storeInfo?.currency)}) يحتاج زيادة؛ وجّه الكاشير لعرض الإضافات السريعة (شوكولاتة، كروت، تغليف فاخر) عند المحاسبة.`);
    } else if (invoiceCount >= 2) {
      recommendations.push(`✨ متوسط قيمة الفاتورة ممتاز (${formatMoney(averageOrderValue, storeInfo?.currency)})، مما يعكس ثقة الزبائن في تشكيلات المتجر.`);
    }
    if (cashPercent >= 45) {
      recommendations.push(`💵 تشكل المقبوضات النقدية (${cashPercent}%) نسبة كبيرة؛ يُنصح بجدولة الترحيل الدوري للخزينة الرئيسية لحماية أمان الصندوق.`);
    }

    return {
      peakHoursText,
      peakWindowPercent,
      topDayName: topDay.name,
      topDayPercent,
      topDaySales: topDay.sales,
      topProfitProd,
      digitalPercent,
      cashPercent,
      recommendations
    };
  }, [filteredInvoices, totalSales, productSalesMap, paymentBreakdown, averageOrderValue, invoiceCount, storeInfo?.currency]);

  // 🏛️ خلاصة الإقرار الضريبي الرسمي لهيئة الزكاة والضريبة والجمارك (ZATCA VAT Return Helper)

  // التبويبات تُبنى حسب صلاحيات المستخدم — تبويبات الأرباح والتكلفة
  // والإقرار الضريبي وسجل الورديات لا تظهر لمن لا يملك صلاحيتها.
  const reportTabs = [
    { id: 'overview', label: '📊 المؤشرات والرسوم البيانية' },
    ...(canViewProfits ? [{ id: 'sales', label: '💎 الأرباح والمبيعات المفصلة' }] : []),
    { id: 'topProducts', label: '🏆 الأكثر مبيعاً والمنتجات' },
    { id: 'payments', label: '💳 وسائل الدفع والتسويات والخزينة' },
    { id: 'staff', label: '👥 تقرير أداء الكاشيرات وساعات العمل' },
    ...(isTaxActive && canViewVat ? [{ id: 'vat', label: '🏛️ إقرار ضريبة (ZATCA)' }] : []),
    ...(canViewProfits ? [{ id: 'inventory', label: '📦 تقييم المخزون والأصناف' }] : []),
    { id: 'zreport', label: '📜 تقرير الإغلاق Z-Report' },
    ...(canViewShifts ? [{ id: 'shiftsLog', label: '📋 سجل الورديات التاريخي' }] : []),
    // سجل التدقيق: للمدير فقط
    ...(currentUser?.role === 'admin' ? [{ id: 'audit', label: '🛡️ سجل التدقيق' }] : []),
  ];

  // إن كان التبويب الحالي ممنوعاً (وصل إليه برابط أو بعد سحب صلاحية) نُرجعه لأول تبويب مسموح
  const allowedTabIds = reportTabs.map(t => t.id);
  const safeActiveTab = allowedTabIds.includes(activeReportTab) ? activeReportTab : (allowedTabIds[0] || 'overview');
  if (safeActiveTab !== activeReportTab) {
    // تصحيح فوري بدون تأثير جانبي في الرسم
    setTimeout(() => setActiveReportTab(safeActiveTab), 0);
  }

  // منع فتح شاشة التقارير كلياً لمن لا يملك صلاحية استعراض التقارير
  if (!canViewSales) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-6">
          <div className="text-4xl mb-2">🔒</div>
          <h3 className="font-black text-rose-900 text-sm mb-1">لا تملك صلاحية استعراض التقارير</h3>
          <p className="text-[11px] text-rose-700 leading-relaxed">
            تُمنح من: الإعدادات ← المستخدمون ← الصلاحيات ← «استعراض تقارير المبيعات».
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-5 space-y-4 max-w-7xl mx-auto pb-24 text-slate-800">
      {/* الشريط العلوي وفلتر الفترة الزمنية */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-pink-900 p-4 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-purple-500/30">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2">
            <span>التقارير المالية والتحليل الذكي</span>
            <span className="text-[10px] bg-pink-500/40 text-pink-200 px-2 py-0.5 rounded-full border border-pink-400/40 font-bold">
              محدث ومطابق 100%
            </span>
          </h2>
          <p className="text-xs text-pink-200/80 mt-1 font-medium">
            بيانات المبيعات، حسابات الأرباح الصافية، والتحليلات الضريبية الدقيقة لمتجر بيت الورد.
          </p>
        </div>

        {/* أزرار اختيار الفترة الزمنية */}
        <div className="flex bg-white/10 backdrop-blur-md p-1 rounded-2xl border border-white/20 self-start md:self-auto text-xs font-bold">
          {[
            { id: 'today', label: 'اليوم' },
            { id: 'week', label: '7 أيام' },
            { id: 'month', label: 'هذا الشهر' },
            { id: 'all', label: 'كل الفترات' }
          ].map(btn => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setPeriod(btn.id)}
              className={`px-3 py-1.5 rounded-xl transition ${
                period === btn.id 
                  ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md font-black border border-white/40' 
                  : 'text-pink-100 hover:text-white hover:bg-white/10'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* تبويبات التقارير المتخصصة */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        {reportTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveReportTab(tab.id)}
            className={`px-3.5 py-2.5 rounded-2xl font-bold whitespace-nowrap transition active:scale-95 flex items-center gap-1.5 ${
              activeReportTab === tab.id
                ? 'bg-gradient-to-r from-pink-700 via-rose-600 to-purple-700 text-white shadow-md shadow-pink-600/30 font-black'
                : 'bg-white text-slate-700 hover:bg-pink-50 border border-pink-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. التقرير المالي العام والمبيعات والمخزون */}
      {(activeReportTab === 'overview' || activeReportTab === 'sales' || activeReportTab === 'inventory') && (
        <FinancialOverviewTab
          activeReportTab={activeReportTab}
          period={period}
          setPeriod={setPeriod}
          setActiveReportTab={setActiveReportTab}
          totalSales={totalSales}
          totalTax={totalTax}
          totalDiscounts={totalDiscounts}
          totalExp={totalExp}
          grossProfit={grossProfit}
          netProfit={netProfit}
          grossProfitMargin={grossProfitMargin}
          netProfitMargin={netProfitMargin}
          invoiceCount={invoiceCount}
          averageOrderValue={averageOrderValue}
          costOfGoodsSold={costOfGoodsSold}
          totalUnitsSold={totalUnitsSold}
          topProductsList={topProductsList}
          topCategoriesList={topCategoriesList}
          salesTimelineData={salesTimelineData}
          maxTimelineSales={maxTimelineSales}
          smartAnalytics={smartAnalytics}
          totalInventoryCost={totalInventoryCost}
          totalInventoryRetail={totalInventoryRetail}
          potentialInventoryProfit={potentialInventoryProfit}
          filteredInvoices={filteredInvoices}
          paymentBreakdown={paymentBreakdown}
          storeInfo={storeInfo}
        />
      )}

      {/* 2. الأكثر مبيعاً */}
      {activeReportTab === 'audit' && currentUser?.role === 'admin' && (
        <AuditLogTab />
      )}

      {activeReportTab === 'topProducts' && (
        <TopProductsTab
          topProductsSortBy={topProductsSortBy}
          setTopProductsSortBy={setTopProductsSortBy}
          topProductsList={topProductsList}
          totalSales={totalSales}
          storeInfo={storeInfo}
        />
      )}

      {/* 3. وسائل الدفع والإقرار الضريبي ZATCA */}
      {(activeReportTab === 'payments' || activeReportTab === 'vat') && (
        <PaymentsAndVatTab
          activeReportTab={activeReportTab}
          period={period}
          filteredInvoices={filteredInvoices}
          filteredExpenses={filteredExpenses}
          filteredPurchases={filteredPurchases}
          totalSales={totalSales}
          totalTax={totalTax}
          paymentBreakdown={paymentBreakdown}
        />
      )}

      {/* 4. أداء الكاشيرات و Z-Report وسجل الورديات */}
      {(activeReportTab === 'staff' || activeReportTab === 'zreport' || activeReportTab === 'shiftsLog') && (
        <StaffAndShiftsTab
          activeReportTab={activeReportTab}
          period={period}
          filteredInvoices={filteredInvoices}
          filteredExpenses={filteredExpenses}
          filteredPurchases={filteredPurchases}
          totalSales={totalSales}
          totalTax={totalTax}
          grossProfit={grossProfit}
          netProfit={netProfit}
          paymentBreakdown={paymentBreakdown}
          costOfGoodsSold={costOfGoodsSold}
          totalDiscounts={totalDiscounts}
          totalExp={totalExp}
        />
      )}
    </div>
  );
};
