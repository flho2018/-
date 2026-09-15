import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Smartphone, TrendingUp, DollarSign, Wallet, ShoppingBag, 
  Clock, AlertTriangle, ShieldCheck, RefreshCw, Share2, 
  CheckCircle2, ArrowUpRight, ArrowDownRight, Package, Users,
  Sparkles, Calendar, Layers, Activity, ChevronRight
} from 'lucide-react';
import { formatMoney } from '../../utils/helpers';
import { checkUserPermission } from '../../utils/permissions';

export const OwnerMobileDashboard = ({ setCurrentTab }) => {
  const {
    invoices,
    products,
    categories,
    userShifts,
    activeShift,
    shiftsHistory,
    drawerTransactions,
    expenses,
    spoilageLogs,
    storeInfo,
    currentUser,
    syncStatus,
    lastSyncTime,
    pullAllFromCloud
  } = useApp();

  const [period, setPeriod] = useState('today'); // 'today' | 'yesterday' | 'month'
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date());

  const canViewProfits = checkUserPermission(currentUser, 'reports_view_profits');
  const currency = storeInfo?.currency || 'ر.س';
  const appName = storeInfo?.appName || storeInfo?.name || 'بيت الورد';

  // تحديث تلقائي للساعة
  const [currentTimeStr, setCurrentTimeStr] = useState(() => new Date().toLocaleTimeString('ar-SA'));
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeStr(new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }));
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // تحديث يدوي فوري من السحابة
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (pullAllFromCloud) await pullAllFromCloud();
      setLastRefreshedAt(new Date());
    } catch (e) {
      console.warn('Refresh error:', e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  // تصفية الفواتير بحسب الفترة
  const { periodInvoices, periodExpenses, periodSpoilage } = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    
    // حساب تاريخ أمس
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const invList = Array.isArray(invoices) ? invoices : [];
    const expList = Array.isArray(expenses) ? expenses : [];
    const spList = Array.isArray(spoilageLogs) ? spoilageLogs : [];

    const isMatch = (dateVal) => {
      if (!dateVal) return false;
      const dStr = String(dateVal).slice(0, 10);
      const d = new Date(dateVal);

      if (period === 'today') return dStr === todayStr;
      if (period === 'yesterday') return dStr === yesterdayStr;
      if (period === 'month') return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      return true;
    };

    return {
      periodInvoices: invList.filter(i => isMatch(i.date || i.createdAt)),
      periodExpenses: expList.filter(e => isMatch(e.date || e.createdAt)),
      periodSpoilage: spList.filter(s => isMatch(s.date || s.at))
    };
  }, [invoices, expenses, spoilageLogs, period]);

  // الحسابات المالية اللحظية للفترة
  const metrics = useMemo(() => {
    let grossSales = 0;
    let refundsAmount = 0;
    let netSales = 0;
    let invoiceCount = 0;
    let refundedCount = 0;
    let cashSales = 0;
    let cardSales = 0;
    let transferSales = 0;
    let creditSales = 0;
    let totalCost = 0;

    periodInvoices.forEach(inv => {
      const isRefunded = inv.status === 'refunded' || inv.isRefund === true;
      const total = Number(inv.total) || 0;
      const cost = Number(inv.totalCost ?? (inv.items || []).reduce((acc, it) => acc + ((Number(it.costPrice || it.product?.costPrice || 0)) * (Number(it.qty || 1))), 0)) || 0;

      if (isRefunded) {
        refundedCount++;
        refundsAmount += total;
      } else {
        invoiceCount++;
        grossSales += total;
        totalCost += cost;

        const pMethod = String(inv.paymentMethod || '').toLowerCase();
        if (pMethod.includes('cash') || pMethod.includes('نقد')) {
          cashSales += total;
        } else if (pMethod.includes('card') || pMethod.includes('mada') || pMethod.includes('شبكة') || pMethod.includes('مدى') || pMethod.includes('بطاقة')) {
          cardSales += total;
        } else if (pMethod.includes('transfer') || pMethod.includes('تحويل')) {
          transferSales += total;
        } else if (pMethod.includes('credit') || pMethod.includes('آجل') || pMethod.includes('ذمم')) {
          creditSales += total;
        } else if (pMethod.includes('split') || pMethod.includes('تقسيم') || inv.splitPayments) {
          const sp = inv.splitPayments || {};
          cashSales += Number(sp.cash || 0);
          cardSales += Number(sp.card || sp.network || 0);
          transferSales += Number(sp.transfer || 0);
          creditSales += Number(sp.credit || 0);
        } else {
          cardSales += total;
        }
      }
    });

    netSales = Math.max(0, grossSales - refundsAmount);
    const avgTicket = invoiceCount > 0 ? (netSales / invoiceCount) : 0;

    // المصروفات والهالك
    const totalExp = periodExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const totalSpoilLoss = periodSpoilage.reduce((acc, s) => acc + (Number(s.totalCostLoss) || 0), 0);

    // صافي الربح = المبيعات الصافية - التكلفة - المصروفات - الهالك
    const grossProfit = Math.max(0, netSales - totalCost);
    const netProfit = grossProfit - totalExp - totalSpoilLoss;
    const profitMargin = netSales > 0 ? ((netProfit / netSales) * 100) : 0;

    return {
      grossSales: Math.round(grossSales * 100) / 100,
      refundsAmount: Math.round(refundsAmount * 100) / 100,
      netSales: Math.round(netSales * 100) / 100,
      invoiceCount,
      refundedCount,
      avgTicket: Math.round(avgTicket * 100) / 100,
      cashSales: Math.round(cashSales * 100) / 100,
      cardSales: Math.round(cardSales * 100) / 100,
      transferSales: Math.round(transferSales * 100) / 100,
      creditSales: Math.round(creditSales * 100) / 100,
      totalExpenses: Math.round(totalExp * 100) / 100,
      totalSpoilageLoss: Math.round(totalSpoilLoss * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 10) / 10
    };
  }, [periodInvoices, periodExpenses, periodSpoilage]);

  // رصيد النقدية الحالي في الدرج والورديات الحية
  const drawerInfo = useMemo(() => {
    const activeList = [];
    if (activeShift && activeShift.isOpen && !activeShift.closedAt) {
      activeList.push(activeShift);
    }
    if (userShifts && typeof userShifts === 'object') {
      Object.values(userShifts).forEach(sh => {
        if (sh && sh.isOpen && !sh.closedAt && !activeList.some(x => x.id === sh.id)) {
          activeList.push(sh);
        }
      });
    }

    let totalDrawerCashNow = 0;
    activeList.forEach(sh => {
      const start = Number(sh.startCash) || 0;
      const cashS = Number(sh.cashSales) || 0;
      const inAmt = Number(sh.cashDeposits || sh.totalIn) || 0;
      const outAmt = Number(sh.cashWithdrawals || sh.totalOut) || 0;
      const refAmt = Number(sh.cashRefunds) || 0;
      totalDrawerCashNow += (start + cashS + inAmt - outAmt - refAmt);
    });

    return {
      activeShifts: activeList,
      hasActiveShift: activeList.length > 0,
      totalDrawerCashNow: Math.round(totalDrawerCashNow * 100) / 100
    };
  }, [activeShift, userShifts]);

  // تنبيهات الأصناف التي أوشكت على النفاد
  const lowStockProducts = useMemo(() => {
    return (products || [])
      .filter(p => !p?.isArchived && !p?.isService && (Number(p.stock) || 0) <= (Number(p.minStock) || 3))
      .slice(0, 5);
  }, [products]);

  // آخر 8 عمليات حية اليوم
  const recentTransactions = useMemo(() => {
    return (invoices || [])
      .slice()
      .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))
      .slice(0, 8);
  }, [invoices]);

  // مشاركة ملخص تنفيذي عبر واتساب
  const handleShareWhatsAppSummary = () => {
    const periodLabel = period === 'today' ? 'اليوم' : period === 'yesterday' ? 'أمس' : 'هذا الشهر';
    const lines = [
      `🌸 *تقرير المالك التنفيذي — ${appName}* 📱`,
      `📅 *الفترة:* ${periodLabel} (${new Date().toLocaleDateString('ar-SA')})`,
      `⏰ *الوقت:* ${currentTimeStr}`,
      `---------------------------------`,
      `💰 *صافي المبيعات:* ${formatMoney(metrics.netSales, currency)}`,
      `🧾 *عدد الفواتير:* ${metrics.invoiceCount} فاتورة`,
      `🎯 *متوسط الفاتورة:* ${formatMoney(metrics.avgTicket, currency)}`,
      `---------------------------------`,
      `💵 *المبيعات نقداً (كاش):* ${formatMoney(metrics.cashSales, currency)}`,
      `💳 *المبيعات شبكة ومدى:* ${formatMoney(metrics.cardSales, currency)}`,
      metrics.transferSales > 0 ? `📲 *تحويل بنكي:* ${formatMoney(metrics.transferSales, currency)}` : null,
      metrics.creditSales > 0 ? `📝 *آجل وذمم:* ${formatMoney(metrics.creditSales, currency)}` : null,
      metrics.refundsAmount > 0 ? `↩️ *مرتجعات:* ${formatMoney(metrics.refundsAmount, currency)} (${metrics.refundedCount} فواتير)` : null,
      `---------------------------------`,
      canViewProfits ? `💎 *صافي الربح التقديري:* ${formatMoney(metrics.netProfit, currency)} (هامش ${metrics.profitMargin}%)` : null,
      drawerInfo.hasActiveShift ? `📥 *النقدية الحالية بالدرج الآن:* ${formatMoney(drawerInfo.totalDrawerCashNow, currency)}` : null,
      metrics.totalSpoilageLoss > 0 ? `🥀 *هالك وتالف الورد:* ${formatMoney(metrics.totalSpoilageLoss, currency)}` : null,
      `---------------------------------`,
      `🏪 *الورديات النشطة الآن:* ${drawerInfo.activeShifts.length > 0 ? drawerInfo.activeShifts.map(s => s.cashierName || 'كاشير').join('، ') : 'لا توجد ورديات مفتوحة حالياً'}`,
      `✨ تم الإرسال آلياً من نظام كاشير بيت الورد`
    ].filter(Boolean).join('\n');

    const encoded = encodeURIComponent(lines);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  return (
    <div className="p-3 sm:p-5 max-w-2xl mx-auto space-y-4 pb-28 select-none animate-in fade-in">
      
      {/* رأس لوحة المالك المتنقلة */}
      <div className="bg-gradient-to-br from-[#2D0826] via-[#1F051C] to-[#120211] border-2 border-pink-500/40 rounded-3xl p-4 sm:p-5 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute -top-10 -left-10 w-32 h-32 bg-pink-600/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-purple-600/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-600 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-pink-600/40 border border-pink-300/40">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-base sm:text-lg text-white">لوحة المالك المباشرة 📱</h1>
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-400/40 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  مباشر
                </span>
              </div>
              <p className="text-xs text-pink-200/80 mt-0.5 font-medium flex items-center gap-2">
                <span>{appName}</span>
                <span>•</span>
                <span>{currentTimeStr}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleManualRefresh}
              className={`p-2 rounded-xl bg-pink-950/70 hover:bg-pink-900 text-pink-200 border border-pink-500/30 transition active:scale-95 ${isRefreshing ? 'animate-spin' : ''}`}
              title="تحديث البيانات لحظياً"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleShareWhatsAppSummary}
              className="p-2 rounded-xl bg-emerald-800/80 hover:bg-emerald-700 text-emerald-100 border border-emerald-400/40 transition active:scale-95 flex items-center gap-1 text-xs font-bold shadow-md"
              title="إرسال ملخص واتساب سريع"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">واتساب</span>
            </button>
          </div>
        </div>

        {/* أزرار اختيار الفترة السريعة */}
        <div className="mt-4 pt-3 border-t border-pink-900/40 flex items-center gap-1.5 bg-black/20 p-1 rounded-2xl">
          {[
            { id: 'today', label: 'اليوم ☀️' },
            { id: 'yesterday', label: 'أمس 🌙' },
            { id: 'month', label: 'هذا الشهر 📅' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPeriod(tab.id)}
              className={`flex-1 py-1.5 text-xs font-black rounded-xl transition text-center ${
                period === tab.id
                  ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md'
                  : 'text-pink-300/70 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* بطاقات المؤشرات اللحظية الأساسية (KPI Cards) */}
      <div className="grid grid-cols-2 gap-3">
        {/* بطاقة المبيعات الصافية */}
        <div className="bg-gradient-to-br from-[#20051B] to-[#140211] border border-pink-500/30 rounded-3xl p-4 shadow-lg text-white">
          <div className="flex items-center justify-between text-pink-300 text-xs mb-1">
            <span className="font-bold">صافي المبيعات 💰</span>
            <div className="w-6 h-6 rounded-lg bg-pink-500/20 flex items-center justify-center text-pink-300">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white mt-1">
            {formatMoney(metrics.netSales, currency)}
          </div>
          <div className="text-[11px] text-pink-300/80 mt-1 flex items-center justify-between">
            <span>{metrics.invoiceCount} فاتورة</span>
            <span>معدل: {formatMoney(metrics.avgTicket, '')}</span>
          </div>
        </div>

        {/* بطاقة صافي الأرباح للمالك */}
        <div className="bg-gradient-to-br from-[#121A0F] to-[#0A1208] border border-emerald-500/30 rounded-3xl p-4 shadow-lg text-white">
          <div className="flex items-center justify-between text-emerald-300 text-xs mb-1">
            <span className="font-bold">صافي الربح 💎</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-300">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-200 mt-1">
            {canViewProfits ? formatMoney(metrics.netProfit, currency) : 'محجوب 🔒'}
          </div>
          <div className="text-[11px] text-emerald-300/80 mt-1 flex items-center justify-between">
            <span>هامش: {canViewProfits ? `${metrics.profitMargin}%` : '—'}</span>
            <span className="text-[10px] text-emerald-400/70">بعد التكلفة والنثريات</span>
          </div>
        </div>

        {/* بطاقة النقدية في الدرج الآن */}
        <div className="bg-gradient-to-br from-[#1F1304] to-[#120B02] border border-amber-500/30 rounded-3xl p-4 shadow-lg text-white">
          <div className="flex items-center justify-between text-amber-300 text-xs mb-1">
            <span className="font-bold">كاش الدرج الآن 💵</span>
            <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-300">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-200 mt-1">
            {drawerInfo.hasActiveShift ? formatMoney(drawerInfo.totalDrawerCashNow, currency) : 'الدرج مغلق'}
          </div>
          <div className="text-[11px] text-amber-300/80 mt-1 flex items-center justify-between">
            <span>نقد اليوم: {formatMoney(metrics.cashSales, '')}</span>
            <span className={drawerInfo.hasActiveShift ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
              {drawerInfo.hasActiveShift ? 'وردية مفتوحة 🟢' : 'مغلق ⚪'}
            </span>
          </div>
        </div>

        {/* بطاقة مبيعات الشبكة ومدى */}
        <div className="bg-gradient-to-br from-[#081726] to-[#040C14] border border-blue-500/30 rounded-3xl p-4 shadow-lg text-white">
          <div className="flex items-center justify-between text-blue-300 text-xs mb-1">
            <span className="font-bold">شبكة ومدى 💳</span>
            <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-300">
              <Activity className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-200 mt-1">
            {formatMoney(metrics.cardSales, currency)}
          </div>
          <div className="text-[11px] text-blue-300/80 mt-1 flex items-center justify-between">
            <span>تحويل: {formatMoney(metrics.transferSales, '')}</span>
            <span>آجل: {formatMoney(metrics.creditSales, '')}</span>
          </div>
        </div>
      </div>

      {/* قسم مراقبة الورديات الحية للكاشيرات */}
      <div className="bg-gradient-to-b from-[#1C0517] to-[#12020F] border border-pink-900/50 rounded-3xl p-4 text-white shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-pink-400" />
            <h2 className="font-black text-xs text-white">الورديات والكاشيرات النشطة الآن</h2>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-950 text-pink-300 font-bold border border-pink-800/50">
            {drawerInfo.activeShifts.length} وردية قيد التشغيل
          </span>
        </div>

        {drawerInfo.activeShifts.length > 0 ? (
          <div className="space-y-2">
            {drawerInfo.activeShifts.map((sh, idx) => {
              const openTime = sh.openedAt ? new Date(sh.openedAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—';
              const shNetSales = Number(sh.netSales ?? sh.totalSales ?? 0);
              const shCash = Number(sh.cashInDrawer ?? sh.expectedCash ?? 0);
              return (
                <div key={sh.id || idx} className="p-3 bg-black/30 border border-pink-900/40 rounded-2xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-pink-500/20 text-pink-300 flex items-center justify-center font-bold">
                      {sh.cashierName ? sh.cashierName.slice(0, 1) : 'ك'}
                    </div>
                    <div>
                      <div className="font-black text-white">{sh.cashierName || 'كاشير المحل'}</div>
                      <div className="text-[10px] text-pink-300/70">بدأت: {openTime} • رصيد البداية: {formatMoney(sh.startCash, currency)}</div>
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="font-black text-pink-200">{formatMoney(shNetSales, currency)}</div>
                    <div className="text-[10px] text-emerald-300 font-bold">كاش الدرج: {formatMoney(shCash, '')}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-5 text-xs text-pink-400/60 bg-black/20 rounded-2xl border border-pink-900/20">
            لا توجد وردية مفتوحة حالياً (كافة الصناديق مغلقة) 🔒
          </div>
        )}
      </div>

      {/* قسم هالك الورد وتنبيهات النواقص السريعة */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* هالك الورد الطبيعي */}
        <div className="bg-gradient-to-b from-[#240619] to-[#14020D] border border-rose-800/40 rounded-3xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🥀</span>
              <h3 className="font-bold text-xs text-rose-200">هالك الورد في هذه الفترة</h3>
            </div>
            <span className="text-[10px] text-rose-300/80 font-bold">
              {periodSpoilage.length} قيد
            </span>
          </div>
          <div className="text-lg font-black text-rose-100">
            {canViewProfits ? formatMoney(metrics.totalSpoilageLoss, currency) : 'محجوب 🔒'}
          </div>
          <div className="text-[11px] text-rose-300/70 mt-1">
            إجمالي كميات تالفة: {periodSpoilage.reduce((a, b) => a + (Number(b.qty) || 0), 0)} عود / حبة
          </div>
        </div>

        {/* تنبيهات أصناف أوشكت على النفاد */}
        <div className="bg-gradient-to-b from-[#241306] to-[#140A02] border border-amber-800/40 rounded-3xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <h3 className="font-bold text-xs text-amber-200">أصناف شارفت على النفاد</h3>
            </div>
            <span className="text-[10px] text-amber-300/80 font-bold">
              {lowStockProducts.length} صنف
            </span>
          </div>
          {lowStockProducts.length > 0 ? (
            <div className="space-y-1 mt-1">
              {lowStockProducts.slice(0, 2).map(p => (
                <div key={p.id} className="flex items-center justify-between text-[11px] text-amber-100">
                  <span className="truncate max-w-[140px]">{p.name}</span>
                  <span className="font-black text-red-400">باقي {p.stock}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-emerald-300 mt-2">
              المخزون بمستويات ممتازة ✅
            </div>
          )}
        </div>
      </div>

      {/* تدفق العمليات الحية الأخيرة (Live Transactions Feed) */}
      <div className="bg-gradient-to-b from-[#1C0517] to-[#12020F] border border-pink-900/50 rounded-3xl p-4 text-white shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-pink-400" />
            <h2 className="font-black text-xs text-white">آخر الفواتير الصادرة اليوم</h2>
          </div>
          <button
            type="button"
            onClick={() => setCurrentTab && setCurrentTab('invoices')}
            className="text-[10px] text-pink-300 hover:text-white flex items-center gap-0.5"
          >
            <span>كل الفواتير</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div className="space-y-2">
          {recentTransactions.map(inv => {
            const isRefunded = inv.status === 'refunded' || inv.isRefund === true;
            const timeStr = inv.date ? new Date(inv.date).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—';
            return (
              <div key={inv.id || inv.invoiceNumber} className="p-2.5 bg-black/30 border border-pink-900/30 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isRefunded ? 'bg-red-400' : 'bg-emerald-400'}`} />
                  <div>
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <span>#{inv.invoiceNumber || inv.id}</span>
                      {isRefunded && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-500/20 text-red-300 font-bold">
                          مرتجع
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-pink-300/70">
                      {timeStr} • {inv.customerName || 'عميل نقدي'} • {inv.cashierName || 'كاشير'}
                    </div>
                  </div>
                </div>
                <div className="text-left">
                  <div className={`font-black ${isRefunded ? 'text-red-400 line-through' : 'text-emerald-300'}`}>
                    {formatMoney(inv.total, currency)}
                  </div>
                  <div className="text-[10px] text-pink-300/60">
                    {inv.paymentMethod || 'مدفوع'}
                  </div>
                </div>
              </div>
            );
          })}
          {recentTransactions.length === 0 && (
            <div className="text-center py-6 text-xs text-pink-400/60">
              لا توجد فواتير مسجلة اليوم حتى الآن 🌸
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
