import React from 'react';
import { TrendingUp, DollarSign, Receipt, Layers, Sparkles, Package, ShoppingBag, BarChart3, Award, Clock, CreditCard, Flame, Lightbulb } from 'lucide-react';
import { formatMoney, formatDate, resolvePaymentMethodName, resolveUserName } from '../../../utils/helpers';
import { useApp } from '../../../context/AppContext';

export const FinancialOverviewTab = ({
  activeReportTab,
  period,
  setPeriod,
  setActiveReportTab,
  totalSales,
  totalTax,
  totalDiscounts,
  totalExp,
  grossProfit,
  netProfit,
  grossProfitMargin,
  netProfitMargin,
  invoiceCount,
  averageOrderValue,
  costOfGoodsSold,
  totalUnitsSold,
  topProductsList,
  topCategoriesList,
  salesTimelineData,
  maxTimelineSales,
  smartAnalytics,
  totalInventoryCost,
  totalInventoryRetail,
  potentialInventoryProfit,
  filteredInvoices,
  paymentBreakdown = [],
  storeInfo
}) => {
  // هذه القيم كانت مستخدمة في هذا الملف بدون تعريف بعد تقسيم شاشة التقارير
  // إلى ملفات، وهي سبب تعطّل الشاشة. مصدرها الصحيح: بيانات التطبيق وإعدادات المتجر.
  const { products, users } = useApp();
  const isTaxActive = storeInfo?.taxEnabled !== false;
  const currentTaxRate = isTaxActive ? (Number(storeInfo?.taxRate) || 15) : 0;

  return (
    <>
      {activeReportTab === 'overview' && (
        <div className="space-y-4 animate-in fade-in">
          
          {/* بطاقة المستشار والتحليل التنفيذي الذكي للمالك (AI Smart Business Insights) */}
          <div className="bg-gradient-to-br from-purple-50/70 via-white to-pink-50/60 rounded-3xl p-4 sm:p-5 text-slate-800 shadow-xl border-2 border-pink-200/90 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-pink-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center shadow-md shadow-pink-500/20 text-white border border-pink-200">
                  <Sparkles className="w-5 h-5 text-white animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-sm sm:text-base text-slate-900">المستشار التنفيذي الذكي (Smart AI Insights)</h3>
                    <span className="px-2.5 py-0.5 bg-gradient-to-r from-pink-500 to-rose-500 text-[10px] font-black rounded-full text-white shadow-xs uppercase tracking-wider">
                      تحليل حي ⚡
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">قراءة استراتيجية لحركة المبيعات وسلوك العملاء والفرص الربحية للمتجر</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <div className="bg-amber-50/90 px-3.5 py-1.5 rounded-xl border-2 border-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.25)] flex items-center gap-1.5 font-bold">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-amber-900">أعلى يوم:</span>
                  <span className="text-amber-700 font-mono font-black">{smartAnalytics.topDayName} ({smartAnalytics.topDayPercent}%)</span>
                </div>
              </div>
            </div>

            {/* شبكة المؤشرات الذكية الاستراتيجية الأربعة بخلفية فاتحة وإطار نيون مضيء خافت */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* 1. ساعات الذروة */}
              <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl border-2 border-pink-400 shadow-[0_0_12px_rgba(244,114,182,0.4)] hover:shadow-[0_0_16px_rgba(244,114,182,0.6)] space-y-1 transition-all">
                <div className="flex items-center justify-between text-[10.5px] text-pink-700 font-bold">
                  <span>ساعات الذروة الذهبية</span>
                  <Clock className="w-3.5 h-3.5 text-pink-500" />
                </div>
                <p className="text-xs sm:text-sm font-black text-slate-900 font-mono">{smartAnalytics.peakHoursText}</p>
                <div className="flex items-center gap-1 text-[10px] text-pink-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-ping"></span>
                  <span>تستحوذ على {smartAnalytics.peakWindowPercent}% من المبيعات</span>
                </div>
              </div>

              {/* 2. الصنف الأكثر ربحية */}
              <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl border-2 border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.4)] hover:shadow-[0_0_16px_rgba(52,211,153,0.6)] space-y-1 transition-all">
                <div className="flex items-center justify-between text-[10.5px] text-emerald-800 font-bold">
                  <span>نجم الأرباح الصافية</span>
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <p className="text-xs sm:text-sm font-black text-slate-900 truncate" title={smartAnalytics.topProfitProd?.name || 'لا يوجد'}>
                  {smartAnalytics.topProfitProd?.name || 'بانتظار المبيعات'}
                </p>
                <div className="text-[10.5px] text-emerald-600 font-black font-mono">
                  {smartAnalytics.topProfitProd ? `+${formatMoney(smartAnalytics.topProfitProd.profit, storeInfo?.currency)} ربح` : '—'}
                </div>
              </div>

              {/* 3. متوسط سلة المشتريات */}
              <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl border-2 border-purple-400 shadow-[0_0_12px_rgba(192,132,252,0.4)] hover:shadow-[0_0_16px_rgba(192,132,252,0.6)] space-y-1 transition-all">
                <div className="flex items-center justify-between text-[10.5px] text-purple-800 font-bold">
                  <span>متوسط قيمة الفاتورة</span>
                  <ShoppingBag className="w-3.5 h-3.5 text-purple-500" />
                </div>
                <p className="text-xs sm:text-sm font-black text-slate-900 font-mono">
                  {formatMoney(averageOrderValue, storeInfo?.currency)}
                </p>
                <div className="text-[10px] text-purple-600 font-medium">
                  معدل {invoiceCount > 0 ? (totalUnitsSold / invoiceCount).toFixed(1) : '0'} صنف لكل زبون
                </div>
              </div>

              {/* 4. التحول للدفع الرقمي */}
              <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl border-2 border-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.4)] hover:shadow-[0_0_16px_rgba(96,165,250,0.6)] space-y-1 transition-all">
                <div className="flex items-center justify-between text-[10.5px] text-blue-800 font-bold">
                  <span>مؤشر الدفع الرقمي</span>
                  <CreditCard className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <p className="text-xs sm:text-sm font-black text-slate-900 font-mono">
                  {smartAnalytics.digitalPercent}% <span className="text-[10.5px] font-bold text-blue-600">شبكة</span>
                </p>
                <div className="text-[10px] text-slate-500 font-medium">
                  {smartAnalytics.cashPercent}% نقدي في الدرج
                </div>
              </div>
            </div>

            {/* قسم التوصيات الذكية التنفيذية بإطار نيون خافت وخلفية مريحة */}
            {smartAnalytics.recommendations.length > 0 && (
              <div className="bg-amber-50/60 rounded-2xl p-3.5 border-2 border-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.3)] space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-black text-amber-800">
                  <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>توصيات الذكاء التجاري للمتجر:</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-800 font-bold">
                  {smartAnalytics.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex items-start gap-2 bg-white/95 p-2.5 rounded-xl border border-pink-300/80 shadow-[0_0_8px_rgba(244,114,182,0.2)]">
                      <span className="text-pink-500 font-black shrink-0">◀</span>
                      <span className="leading-relaxed">{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* بطاقات المؤشرات المالية الرئيسية (Financial KPI Cards) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-gradient-to-br from-pink-50/80 via-white to-pink-50/30 p-3.5 rounded-2xl border-2 border-pink-300 shadow-sm hover:shadow-md hover:border-pink-400 transition-all space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-pink-900 font-black block">إجمالي المبيعات</span>
                <div className="w-7 h-7 rounded-xl bg-pink-100/90 text-pink-600 flex items-center justify-center shadow-xs">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <p className="text-lg font-black text-pink-700 font-mono">{formatMoney(totalSales, storeInfo?.currency)}</p>
              <div className="inline-flex items-center gap-1 text-[10px] font-bold text-pink-700 bg-pink-100/80 px-2 py-0.5 rounded-full border border-pink-200">
                <span>{invoiceCount} فاتورة</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50/80 via-white to-purple-50/30 p-3.5 rounded-2xl border-2 border-purple-300 shadow-sm hover:shadow-md hover:border-purple-400 transition-all space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-purple-900 font-black block">تكلفة المبيعات (COGS)</span>
                <div className="w-7 h-7 rounded-xl bg-purple-100/90 text-purple-600 flex items-center justify-center shadow-xs">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <p className="text-lg font-black text-purple-700 font-mono">{formatMoney(costOfGoodsSold, storeInfo?.currency)}</p>
              <div className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded-full border border-purple-200">
                <span>{totalUnitsSold} قطعة مباعة</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/30 p-3.5 rounded-2xl border-2 border-emerald-300 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-emerald-900 font-black block">إجمالي الربح التجاري</span>
                <div className="w-7 h-7 rounded-xl bg-emerald-100/90 text-emerald-600 flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <p className="text-lg font-black text-emerald-600 font-mono">{formatMoney(grossProfit, storeInfo?.currency)}</p>
              <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200">
                <span>هامش: {grossProfitMargin}%</span>
              </div>
            </div>

            <div className={`bg-gradient-to-br ${netProfit >= 0 ? 'from-emerald-50/90 via-white to-teal-50/40 border-emerald-400 hover:border-emerald-500' : 'from-rose-50/90 via-white to-red-50/40 border-rose-400 hover:border-rose-500'} p-3.5 rounded-2xl border-2 shadow-sm hover:shadow-md transition-all space-y-1.5`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-800 block">صافي الأرباح (Net Profit)</span>
                <div className={`w-7 h-7 rounded-xl ${netProfit >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'} flex items-center justify-center shadow-xs`}>
                  <Award className="w-4 h-4" />
                </div>
              </div>
              <p className={`text-lg font-black font-mono ${netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                {formatMoney(netProfit, storeInfo?.currency)}
              </p>
              <div className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100/90 px-2 py-0.5 rounded-full border border-slate-200">
                <span>مصروفات: {formatMoney(totalExp, storeInfo?.currency)}</span>
              </div>
            </div>
          </div>

          {/* مؤشرات إضافية: متوسط السلة ونسب الربحية */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 bg-gradient-to-br from-purple-50/90 via-white to-purple-50/40 rounded-2xl border-2 border-purple-300 shadow-xs hover:shadow-sm transition-all">
              <span className="text-[10px] text-purple-800 block font-black">متوسط قيمة الفاتورة (AOV)</span>
              <strong className="text-sm sm:text-base font-black text-purple-950 font-mono mt-0.5 block">{formatMoney(averageOrderValue, storeInfo?.currency)}</strong>
            </div>
            <div className="p-3 bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/40 rounded-2xl border-2 border-emerald-300 shadow-xs hover:shadow-sm transition-all">
              <span className="text-[10px] text-emerald-800 block font-black">نسبة صافي الربح للنشاط</span>
              <strong className="text-sm sm:text-base font-black text-emerald-950 font-mono mt-0.5 block">{netProfitMargin}%</strong>
            </div>
            <div className="p-3 bg-gradient-to-br from-amber-50/90 via-white to-amber-50/40 rounded-2xl border-2 border-amber-300 shadow-xs hover:shadow-sm transition-all">
              <span className="text-[10px] text-amber-800 block font-black">إجمالي الخصومات الممنوحة</span>
              <strong className="text-sm sm:text-base font-black text-amber-950 font-mono mt-0.5 block">{formatMoney(totalDiscounts, storeInfo?.currency)}</strong>
            </div>
            <div className="p-3 bg-gradient-to-br from-rose-50/90 via-white to-rose-50/40 rounded-2xl border-2 border-rose-300 shadow-xs hover:shadow-sm transition-all">
              <span className="text-[10px] text-rose-800 block font-black">المصروفات التشغيلية</span>
              <strong className="text-sm sm:text-base font-black text-rose-950 font-mono mt-0.5 block">{formatMoney(totalExp, storeInfo?.currency)}</strong>
            </div>
          </div>

          {/* الرسم البياني التفاعلي للمبيعات (Interactive Sales Trend Bar Chart) */}
          <div className="bg-white rounded-3xl p-5 border border-pink-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-xs sm:text-sm text-slate-800 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-pink-600" />
                <span>الرسم البياني لتطور المبيعات اليومية</span>
              </h3>
              <span className="text-[10px] text-slate-400 font-bold">إجمالي: {formatMoney(totalSales, storeInfo?.currency)}</span>
            </div>

            {salesTimelineData.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                لا توجد فواتير مسجلة خلال الفترة المحددة لعرض الرسم البياني
              </div>
            ) : (
              <div className="space-y-2 pt-2">
                <div className="flex items-end gap-2 h-44 border-b border-slate-100 pb-2 px-1 overflow-x-auto">
                  {salesTimelineData.map((bar, idx) => {
                    const heightPercent = Math.max(12, Math.round((bar.sales / maxTimelineSales) * 100));
                    return (
                      <div key={idx} className="flex-1 min-w-[50px] flex flex-col items-center justify-end h-full group relative">
                        <div className="opacity-0 group-hover:opacity-100 transition absolute -top-8 bg-slate-900 text-white text-[10px] py-1 px-2 rounded-lg pointer-events-none whitespace-nowrap z-20 shadow-lg font-mono">
                          {formatMoney(bar.sales, storeInfo?.currency)} ({bar.count} فاتورة)
                        </div>

                        <span className="text-[9px] font-mono font-bold text-pink-700 mb-1">
                          {bar.sales >= 1000 ? `${(bar.sales/1000).toFixed(1)}k` : Math.round(bar.sales)}
                        </span>

                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full max-w-[36px] bg-gradient-to-t from-pink-600 via-rose-500 to-purple-500 rounded-t-xl transition-all duration-300 group-hover:from-pink-500 group-hover:to-purple-400 shadow-xs"
                        />

                        <span className="text-[9px] font-bold text-slate-500 mt-2 truncate max-w-full text-center">
                          {bar.label.split(' ')[0]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* مخطط توزيع المبيعات حسب الأقسام والتصنيفات (Categories Breakdown Bars) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            
            <div className="bg-white rounded-3xl p-4 border border-pink-100 shadow-sm space-y-3">
              <h3 className="font-black text-xs text-slate-800 flex items-center gap-1.5 pb-2 border-b border-pink-50">
                <Layers className="w-4 h-4 text-purple-600" />
                <span>توزيع المبيعات حسب الأقسام والتصنيفات</span>
              </h3>

              {topCategoriesList.length === 0 ? (
                <p className="text-center py-6 text-slate-400 text-xs">لا توجد مبيعات مسجلة بالأقسام</p>
              ) : (
                <div className="space-y-2.5">
                  {topCategoriesList.slice(0, 5).map((cat, idx) => {
                    const pct = totalSales > 0 ? Math.round((cat.revenue / totalSales) * 100) : 0;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-800">{cat.name} ({cat.qty} قطعة)</span>
                          <span className="font-mono text-purple-900">{formatMoney(cat.revenue, storeInfo?.currency)} ({pct}%)</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${pct}%` }}
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* تفصيل وسائل الدفع في نظرة عامة */}
            <div className="bg-white rounded-3xl p-4 border border-pink-100 shadow-sm space-y-3">
              <h3 className="font-black text-xs text-slate-800 flex items-center gap-1.5 pb-2 border-b border-pink-50">
                <CreditCard className="w-4 h-4 text-pink-600" />
                <span>حجم العمليات حسب وسيلة الدفع</span>
              </h3>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {paymentBreakdown.map(m => (
                  <div key={m.id} className="p-3 bg-pink-50/40 rounded-2xl border border-pink-100 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-slate-900">{m.name}</span>
                      <span className="text-[10px] bg-white px-2 py-0.5 rounded-full font-bold border border-pink-200">{m.percentage}%</span>
                    </div>
                    <strong className="text-sm font-black text-pink-700 block font-mono">{formatMoney(m.amount, storeInfo?.currency)}</strong>
                    <span className="text-[10px] text-slate-500 block">{m.count} عملية</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ======================================================== */}
      {/* 2. تقرير الأرباح والمبيعات المفصلة (Sales & Profit Statement) */}
      {activeReportTab === 'sales' && (
        <div className="space-y-4 animate-in fade-in text-xs">
          
          {/* كشف حساب الأرباح والمبيعات المحاسبي (Income Statement Summary) */}
          <div className="bg-white rounded-3xl p-5 border border-pink-100 shadow-sm space-y-4">
            <div className="pb-3 border-b border-pink-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>كشف حساب الإيرادات وتكلفة المبيعات وصافي الأرباح</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">تحليل محاسبي دقيق لحساب الأرباح الإجمالية والصافية للفترة المحددة</p>
              </div>
              <span className="text-xs bg-emerald-50 text-emerald-800 font-bold px-3 py-1 rounded-xl border border-emerald-200">
                هامش صافي: {netProfitMargin}%
              </span>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between items-center font-bold">
                <span className="text-slate-700">1. إجمالي المبيعات الإجمالية (Gross Sales):</span>
                <span className="text-slate-900 font-mono font-black text-sm">{formatMoney(totalSales + totalDiscounts, storeInfo?.currency)}</span>
              </div>

              {totalDiscounts > 0 && (
                <div className="py-2.5 flex justify-between items-center font-bold text-rose-600">
                  <span>2. (-) إجمالي الخصومات والتخفيضات الممنوحة للعملاء:</span>
                  <span className="font-mono font-black">-{formatMoney(totalDiscounts, storeInfo?.currency)}</span>
                </div>
              )}

              <div className="py-2.5 flex justify-between items-center font-black bg-pink-50/50 px-2 rounded-xl">
                <span className="text-pink-900">3. صافي المبيعات المحصلة (Net Revenue):</span>
                <span className="text-pink-950 font-mono text-sm">{formatMoney(totalSales, storeInfo?.currency)}</span>
              </div>

              {isTaxActive && (
                <div className="py-2.5 flex justify-between items-center font-bold text-amber-700">
                  <span>4. (-) ضريبة القيمة المضافة المحصلة ({currentTaxRate}%):</span>
                  <span className="font-mono">-{formatMoney(totalTax, storeInfo?.currency)}</span>
                </div>
              )}

              <div className="py-2.5 flex justify-between items-center font-bold text-purple-700">
                <span>5. (-) تكلفة البضاعة المباعة الفعلية (Cost of Goods Sold - COGS):</span>
                <span className="font-mono font-black">-{formatMoney(costOfGoodsSold, storeInfo?.currency)}</span>
              </div>

              <div className="py-3 flex justify-between items-center font-black bg-emerald-50/60 px-3 rounded-xl border border-emerald-100">
                <div>
                  <span className="text-emerald-900 block text-xs">6. (=) إجمالي الربح التجاري (Gross Profit):</span>
                  <span className="text-[10px] text-emerald-700 font-normal">المبيعات بعد استبعاد الضريبة وتكلفة الشراء</span>
                </div>
                <span className="text-emerald-800 font-mono text-base font-black">+{formatMoney(grossProfit, storeInfo?.currency)}</span>
              </div>

              <div className="py-2.5 flex justify-between items-center font-bold text-rose-700">
                <span>7. (-) إجمالي المصروفات التشغيلية والنثريات:</span>
                <span className="font-mono font-black">-{formatMoney(totalExp, storeInfo?.currency)}</span>
              </div>

              <div className="py-3.5 flex justify-between items-center font-black bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-4 rounded-2xl shadow-sm">
                <div>
                  <span className="block text-sm">8. (=) صافي الربح الحقيقي النهائي (Net Profit):</span>
                  <span className="text-[10px] text-emerald-100 font-normal">الربح الصافي الفعلي بعد خصم كافة المصاريف والتكاليف</span>
                </div>
                <span className="font-mono text-lg font-black">{formatMoney(netProfit, storeInfo?.currency)}</span>
              </div>
            </div>
          </div>

          {/* سجل فواتير المبيعات مع أرباح كل فاتورة */}
          <div className="bg-white rounded-3xl p-4 border border-pink-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-pink-50">
              <h3 className="font-black text-slate-800 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-pink-600" />
                <span>سجل فواتير الفترة وتحليل أرباح كل فاتورة</span>
              </h3>
              <span className="text-[10px] text-pink-800 font-bold">{filteredInvoices.length} فاتورة</span>
            </div>

            {filteredInvoices.length === 0 ? (
              <p className="text-center py-6 text-slate-400">لا توجد فواتير خلال الفترة المحددة</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {filteredInvoices.map((inv) => {
                  let invCost = 0;
                  (inv.items || []).forEach(it => {
                    const prod = (products || []).find(p => p.id === (it.id || it.product?.id));
                    const c = Number(it.costAtSale ?? it.costPrice ?? prod?.costPrice ?? 0);
                    invCost += c * (Number(it.qty ?? it.quantity ?? 1) || 1);
                  });
                  const invProfit = (Number(inv.total) || 0) - (Number(inv.taxAmount) || 0) - invCost;

                  return (
                    <div key={inv.id} className="py-2.5 flex items-center justify-between hover:bg-pink-50/30 px-2 rounded-xl transition">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 font-mono text-xs">{inv.invoiceNumber || inv.id}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold">
                            {resolvePaymentMethodName(inv, storeInfo?.paymentMethods)}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                          {formatDate(inv.date)} • {resolveUserName(inv, users)} • {inv.items?.length || 0} صنف
                        </span>
                      </div>

                      <div className="text-left">
                        <span className="font-black text-slate-900 font-mono text-xs block">
                          {formatMoney(inv.total, storeInfo?.currency)}
                        </span>
                        <span className={`text-[10px] font-bold font-mono ${invProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          ربح: {invProfit >= 0 ? '+' : ''}{formatMoney(invProfit, storeInfo?.currency)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ======================================================== */}
      {/* 3. الأصناف الأكثر مبيعاً والأعلى ربحية (Top Selling Products) */}
      {activeReportTab === 'inventory' && (
        <div className="bg-white rounded-3xl p-5 border border-pink-100 shadow-sm space-y-4 animate-in fade-in text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-pink-50">
            <div>
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-pink-600" />
                <span>جرد وتقييم القيمة المالية للمخزون</span>
              </h3>
              <p className="text-[11px] text-slate-500">حساب قيمة الأصناف المتاحة بسعر التكلفة وسعر البيع والأرباح الكامنة</p>
            </div>
            <span className="text-xs text-pink-700 font-bold bg-pink-50 px-3 py-1 rounded-xl border border-pink-200">
              {products.length} صنف مسجل
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-gradient-to-br from-purple-50/80 via-white to-purple-50/30 rounded-2xl border-2 border-purple-300 shadow-sm hover:shadow-md hover:border-purple-400 transition-all space-y-1.5">
              <span className="text-[11px] text-purple-900 font-black block">القيمة الإجمالية بالتكلفة:</span>
              <p className="text-lg font-black text-purple-950 font-mono">{formatMoney(totalInventoryCost, storeInfo?.currency)}</p>
              <span className="text-[10px] text-purple-700 font-bold bg-purple-100 px-2 py-0.5 rounded-full inline-block">حسب سعر الشراء</span>
            </div>

            <div className="p-4 bg-gradient-to-br from-pink-50/80 via-white to-pink-50/30 rounded-2xl border-2 border-pink-300 shadow-sm hover:shadow-md hover:border-pink-400 transition-all space-y-1.5">
              <span className="text-[11px] text-pink-900 font-black block">القيمة المتوقعة بسعر البيع:</span>
              <p className="text-lg font-black text-pink-950 font-mono">{formatMoney(totalInventoryRetail, storeInfo?.currency)}</p>
              <span className="text-[10px] text-pink-700 font-bold bg-pink-100 px-2 py-0.5 rounded-full inline-block">عائد البيع الإجمالي</span>
            </div>

            <div className="p-4 bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/30 rounded-2xl border-2 border-emerald-300 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all space-y-1.5">
              <span className="text-[11px] text-emerald-900 font-black block">الأرباح الكامنة المتوقعة:</span>
              <p className="text-lg font-black text-emerald-700 font-mono">+{formatMoney(potentialInventoryProfit, storeInfo?.currency)}</p>
              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full inline-block">فارق البيع عن التكلفة</span>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {products.map(p => (
              <div key={p.id} className="py-2.5 flex items-center justify-between hover:bg-slate-50/60 px-2 rounded-xl">
                <div>
                  <h4 className="font-bold text-slate-800">{p.name}</h4>
                  <span className="text-[10px] text-slate-400 font-mono">الكمية: {p.stock} {p.unit || 'حبة'} • القسم: {p.category || 'عام'}</span>
                </div>
                <div className="text-left">
                  <span className="font-bold text-slate-900 font-mono block">{formatMoney(p.sellingPrice * p.stock, storeInfo?.currency)}</span>
                  <span className="text-[10px] text-slate-400 font-mono">تكلفة: {formatMoney(p.costPrice * p.stock, storeInfo?.currency)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. تقرير الإغلاق المالي Z-Report الرسمي */}
    </>
  );
};
