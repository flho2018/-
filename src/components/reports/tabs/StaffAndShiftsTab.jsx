import React, { useMemo, useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Clock, CheckCircle, ShieldCheck, Printer, MessageSquare, Award, DollarSign, Zap, Filter, ShoppingBag, TrendingDown, TrendingUp } from 'lucide-react';
import { formatMoney, formatDate, resolvePaymentMethod } from '../../../utils/helpers';
import { printHtmlDirectly } from '../../../utils/printHelper';
import { shareDocument, getPreferredShareFormat, getManagerPhone } from '../../../utils/shareHelper';
import { useApp } from '../../../context/AppContext';
import { ShiftsHistoryLog } from './ShiftsHistoryLog';
import { computeStaffPerformance, attachBonuses, sellerOf } from '../../../utils/staffPerformance';

export const StaffAndShiftsTab = ({
  activeReportTab,
  period,
  filteredInvoices,
  filteredExpenses,
  filteredPurchases,
  totalSales,
  totalTax,
  grossProfit,
  netProfit,
  paymentBreakdown = [],
  costOfGoodsSold = 0,
  totalDiscounts = 0,
  totalExp = 0
}) => {
  const {
    invoices,
    expenses,
    purchases,
    storeInfo,
    drawerTransactions,
    paymentReceipts,
    customers,
    userShifts,
    activeShift,
    shiftsHistory,
    deleteShiftRecord,
    updateShiftRecord,
    resetShiftsHistory,
    users,
    currentUser,
    hasPermission
  } = useApp();

  const [selectedStaffFilter, setSelectedStaffFilter] = useState('all');
  const isTaxActive = storeInfo?.taxEnabled !== false;
  const currentTaxRate = isTaxActive ? (Number(storeInfo?.taxRate) || 15) : 0;
  
  const staffAnalytics = useMemo(() => {
    // 1. حساب الأداء من المحرك الأساسي
    const raw = computeStaffPerformance({ users, invoices, shiftsHistory, userShifts, period });
    const perfData = attachBonuses(raw, users);

    // 2. تجميع الأصناف الأكثر مبيعاً وطرق الدفع لكل كاشير
    const productsByStaff = {};
    const paymentsByStaff = {};

    (invoices || []).forEach(inv => {
      if (!inv.date) return;
      const invDate = new Date(inv.date);
      const invMs = invDate.getTime();
      
      // تطبيق نفس الفلتر الزمني الخاص بالمحرك
      if (perfData.range.from && invMs < perfData.range.from) return;
      if (perfData.range.to && invMs > perfData.range.to) return;

      const seller = sellerOf(inv, users);
      const sId = seller.id;

      if (inv.status !== 'refunded') {
        // --- تجميع الأصناف ---
        if (!productsByStaff[sId]) productsByStaff[sId] = {};
        (inv.items || []).forEach(it => {
          const pId = it.id || it.product?.id || it.name;
          const pName = it.name || 'صنف';
          const qty = Number(it.qty || it.quantity) || 1;
          const price = Number(it.price || it.unitPrice || 0);
          
          if (!productsByStaff[sId][pId]) {
            productsByStaff[sId][pId] = { id: pId, name: pName, qty: 0, revenue: 0 };
          }
          productsByStaff[sId][pId].qty += qty;
          productsByStaff[sId][pId].revenue += (price * qty);
        });

        // --- تجميع طرق الدفع ---
        if (!paymentsByStaff[sId]) {
          paymentsByStaff[sId] = { cash: 0, card: 0, transfer: 0, tamara: 0, credit: 0, split: 0, other: 0 };
        }
        
        const invTotal = Number(inv.total) || 0;
        if (inv.splitPayments && Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) {
          paymentsByStaff[sId].split += invTotal;
          inv.splitPayments.forEach(sp => {
            const amt = Number(sp.amount) || 0;
            const res = resolvePaymentMethod(sp.methodId || sp.methodType || sp, storeInfo?.paymentMethods);
            const rName = String(res.name || '').toLowerCase();
            if (res.id === 'cash' || res.type === 'cash' || rName.includes('كاش') || rName.includes('نقد')) paymentsByStaff[sId].cash += amt;
            else if (res.id === 'tamara' || rName.includes('تمارا')) paymentsByStaff[sId].tamara += amt;
            else if (res.id === 'transfer' || res.id === 'bank' || rName.includes('تحويل') || rName.includes('بنك')) paymentsByStaff[sId].transfer += amt;
            else if (res.id === 'credit' || res.type === 'credit' || rName.includes('آجل') || rName.includes('اجل')) paymentsByStaff[sId].credit += amt;
            else if (res.id === 'card' || res.type === 'card' || rName.includes('شبك') || rName.includes('مدى') || rName.includes('فيزا')) paymentsByStaff[sId].card += amt;
            else paymentsByStaff[sId].other += amt;
          });
        } else if (inv.paymentMethod === 'split') {
          paymentsByStaff[sId].split += invTotal;
          if (inv.splitCash) paymentsByStaff[sId].cash += Number(inv.splitCash);
          if (inv.splitCard) paymentsByStaff[sId].card += Number(inv.splitCard);
          if (inv.splitCredit) paymentsByStaff[sId].credit += Number(inv.splitCredit);
        } else {
          const res = resolvePaymentMethod(inv.paymentMethod || inv, storeInfo?.paymentMethods);
          const rName = String(res.name || '').toLowerCase();
          if (res.id === 'cash' || res.type === 'cash' || rName.includes('كاش') || rName.includes('نقد')) paymentsByStaff[sId].cash += invTotal;
          else if (res.id === 'tamara' || rName.includes('تمارا')) paymentsByStaff[sId].tamara += invTotal;
          else if (res.id === 'transfer' || res.id === 'bank' || rName.includes('تحويل') || rName.includes('بنك')) paymentsByStaff[sId].transfer += invTotal;
          else if (res.id === 'credit' || res.type === 'credit' || rName.includes('آجل') || rName.includes('اجل')) paymentsByStaff[sId].credit += invTotal;
          else if (res.id === 'card' || res.type === 'card' || rName.includes('شبك') || rName.includes('مدى') || rName.includes('فيزا')) paymentsByStaff[sId].card += invTotal;
          else paymentsByStaff[sId].other += invTotal;
        }
      }
    });

    // 3. تهيئة البيانات للعرض في واجهة المستخدم
    const formattedStaff = perfData.staff.map(s => {
      const hPart = Math.floor(s.workMs / (1000 * 3600));
      const mPart = Math.floor((s.workMs % (1000 * 3600)) / (1000 * 60));
      const workDurationFormatted = hPart > 0 ? `${hPart} س و ${mPart} د` : (mPart > 0 ? `${mPart} دقيقة` : '—');
      
      const topProducts = Object.values(productsByStaff[s.id] || {})
        .sort((a,b) => b.qty - a.qty)
        .slice(0, 5);

      const paymentMethods = paymentsByStaff[s.id] || { cash: 0, card: 0, transfer: 0, tamara: 0, credit: 0, split: 0, other: 0 };

      return {
        ...s,
        workDurationFormatted,
        topProducts,
        paymentMethods
      };
    });

    return {
      staffList: formattedStaff,
      leaders: perfData.leaders,
      totals: perfData.totals,
      range: perfData.range
    };
  }, [users, invoices, shiftsHistory, userShifts, period, storeInfo]);

  const buildStaffReportHtml = () => {
    const periodLabel = period === 'today' ? 'اليوم' : period === 'week' ? 'آخر 7 أيام' : period === 'month' ? 'هذا الشهر' : 'كافة الفترات';
    const currency = storeInfo?.currency || 'ر.س';

    const html = `
      <div style="font-family: 'Cairo', sans-serif; direction: rtl; text-align: right; padding: 25px; color: #1e293b; max-width: 1000px; margin: 0 auto;">
        <div style="text-align: center; border-bottom: 2px solid #db2777; padding-bottom: 15px; margin-bottom: 20px;">
          <h1 style="margin: 0; color: #831843; font-size: 22px;">👥 تقرير الأداء المالي وساعات العمل للكاشيرات</h1>
          <p style="margin: 5px 0 0 0; color: #475569; font-size: 13px;">${storeInfo?.name || 'بيت الورد للزهور والهدايا'} | الفترة: ${periodLabel} | التاريخ: ${new Date().toLocaleDateString('ar-SA')}</p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;">
          <div style="background: #fdf2f8; border: 1px solid #fbcfe8; padding: 10px; border-radius: 8px; text-align: center;">
            <span style="font-size: 11px; color: #9d174d; display: block;">🏆 أعلى مبيعات</span>
            <strong style="font-size: 14px; color: #831843;">${staffAnalytics.leaders.topSeller ? staffAnalytics.leaders.topSeller.name : '—'}</strong>
            <span style="font-size: 11px; color: #475569; display: block;">${staffAnalytics.leaders.topSeller ? formatMoney(staffAnalytics.leaders.topSeller.netSales, currency) : ''}</span>
          </div>
          <div style="background: #fef3c7; border: 1px solid #fde68a; padding: 10px; border-radius: 8px; text-align: center;">
            <span style="font-size: 11px; color: #92400e; display: block;">🌟 الأعلى ربحاً</span>
            <strong style="font-size: 14px; color: #78350f;">${staffAnalytics.leaders.topProfit ? staffAnalytics.leaders.topProfit.name : '—'}</strong>
            <span style="font-size: 11px; color: #475569; display: block;">${staffAnalytics.leaders.topProfit ? formatMoney(staffAnalytics.leaders.topProfit.netProfit, currency) : ''}</span>
          </div>
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px; border-radius: 8px; text-align: center;">
            <span style="font-size: 11px; color: #1e40af; display: block;">🎯 أعلى متوسط فاتورة</span>
            <strong style="font-size: 14px; color: #1e3a8a;">${staffAnalytics.leaders.topAvgTicket ? staffAnalytics.leaders.topAvgTicket.name : '—'}</strong>
            <span style="font-size: 11px; color: #475569; display: block;">${staffAnalytics.leaders.topAvgTicket ? formatMoney(staffAnalytics.leaders.topAvgTicket.avgTicket, currency) : ''}</span>
          </div>
          <div style="background: #faf5ff; border: 1px solid #e9d5ff; padding: 10px; border-radius: 8px; text-align: center;">
            <span style="font-size: 11px; color: #6b21a8; display: block;">🛡️ دقة الصندوق</span>
            <strong style="font-size: 14px; color: #581c87;">${staffAnalytics.leaders.mostAccurate ? staffAnalytics.leaders.mostAccurate.name : '—'}</strong>
            <span style="font-size: 11px; color: #475569; display: block;">${staffAnalytics.leaders.mostAccurate ? (staffAnalytics.leaders.mostAccurate.avgVariancePerShift === 0 ? 'مطابقة تامة 100%' : 'انحراف ' + formatMoney(staffAnalytics.leaders.mostAccurate.avgVariancePerShift, currency)) : ''}</span>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px;">
          <thead>
            <tr style="background: #831843; color: #ffffff;">
              <th style="padding: 8px; text-align: center;">#</th>
              <th style="padding: 8px; text-align: right;">الموظف / الكاشير</th>
              <th style="padding: 8px; text-align: center;">وقت العمل الفعلي</th>
              <th style="padding: 8px; text-align: center;">عدد الفواتير</th>
              <th style="padding: 8px; text-align: center;">القطع المباعة</th>
              <th style="padding: 8px; text-align: left;">المبيعات الصافية</th>
              <th style="padding: 8px; text-align: center;">المساهمة %</th>
              <th style="padding: 8px; text-align: left;">الربح</th>
              <th style="padding: 8px; text-align: left;">معدل/ساعة</th>
              <th style="padding: 8px; text-align: center;">المرتجع</th>
              <th style="padding: 8px; text-align: left;">فروقات الصندوق</th>
              <th style="padding: 8px; text-align: left;">البونص</th>
            </tr>
          </thead>
          <tbody>
            ${staffAnalytics.staffList.map((s, idx) => `
              <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background: #f8fafc;' : ''}">
                <td style="padding: 8px; text-align: center; font-weight: bold;">${idx + 1}</td>
                <td style="padding: 8px; font-weight: bold;">${s.name} <span style="font-size: 10px; color: #64748b;">(${s.roleName})</span></td>
                <td style="padding: 8px; text-align: center; font-family: monospace; font-weight: bold; color: #0369a1;">${s.workDurationFormatted}</td>
                <td style="padding: 8px; text-align: center; font-family: monospace;">${s.invoicesCount}</td>
                <td style="padding: 8px; text-align: center; font-family: monospace;">${s.itemsSold}</td>
                <td style="padding: 8px; text-align: left; font-family: monospace; font-weight: bold; color: #831843;">${formatMoney(s.netSales, currency)}</td>
                <td style="padding: 8px; text-align: center; font-family: monospace; font-weight: bold;">${s.contributionPercent}%</td>
                <td style="padding: 8px; text-align: left; font-family: monospace; font-weight: bold; color: #047857;">${formatMoney(s.netProfit, currency)}</td>
                <td style="padding: 8px; text-align: left; font-family: monospace; color: #0284c7;">${s.hasHours ? formatMoney(s.salesPerHour, '') + ' / س' : '—'}</td>
                <td style="padding: 8px; text-align: center; font-family: monospace; color: #b91c1c;">${s.refundRate > 0 ? s.refundRate.toFixed(1) + '%' : '—'}</td>
                <td style="padding: 8px; text-align: left; font-family: monospace;">
                  ${s.shiftsWithVariance === 0 && s.shiftsCount > 0 ? '<span style="color:#166534">مطابق ✅</span>' 
                    : (s.cashShortage > 0 && s.cashOverage > 0 ? `<span style="color:#dc2626">عجز ${formatMoney(s.cashShortage, currency)}</span><br/><span style="color:#2563eb">زيادة ${formatMoney(s.cashOverage, currency)}</span>` 
                    : s.cashShortage > 0 ? `<span style="color:#dc2626">عجز ${formatMoney(s.cashShortage, currency)}</span>`
                    : s.cashOverage > 0 ? `<span style="color:#2563eb">زيادة ${formatMoney(s.cashOverage, currency)}</span>`
                    : '<span style="color:#64748b">—</span>')}
                </td>
                <td style="padding: 8px; text-align: left; font-family: monospace; color: #d97706; font-weight: bold;">
                  ${s.bonus?.enabled ? formatMoney(s.bonus.amount, currency) : '—'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="font-size: 10px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px;">
          تم استخراج هذا التقرير آلياً عبر نظام بيت الورد لنقاط البيع السحابية.
        </div>
      </div>
    `;
    return html;
  };

  const handlePrintStaffReport = () => printHtmlDirectly(buildStaffReportHtml(), 'تقرير_أداء_الموظفين');

  const handlePrintSingleStaffDossier = (staff) => {
    if (!staff) return;
    const periodLabel = period === 'today' ? 'اليوم' : period === 'week' ? 'آخر 7 أيام' : period === 'month' ? 'هذا الشهر' : 'كافة الفترات';
    const currency = storeInfo?.currency || 'ر.س';

    const topProdsHtml = (staff.topProducts || []).map((p, i) => `
      <tr style="border-bottom: 1px solid #f1f5f9; font-size: 11px;">
        <td style="padding: 6px; text-align: center;">${i + 1}</td>
        <td style="padding: 6px; font-weight: bold;">${p.name}</td>
        <td style="padding: 6px; text-align: center; font-family: monospace; color: #0369a1;">${p.qty} قطعة</td>
        <td style="padding: 6px; text-align: left; font-family: monospace; font-weight: bold; color: #831843;">${formatMoney(p.revenue, currency)}</td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family: 'Cairo', sans-serif; direction: rtl; text-align: right; padding: 25px; color: #1e293b; max-width: 800px; margin: 0 auto; border: 2px solid #db2777; border-radius: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #db2777; padding-bottom: 12px; margin-bottom: 15px;">
          <div>
            <h1 style="margin: 0; color: #831843; font-size: 20px;">ملف أداء الكاشير: ${staff.name}</h1>
            <p style="margin: 3px 0 0 0; color: #64748b; font-size: 12px;">${storeInfo?.name || 'بيت الورد'} | الصفة: ${staff.roleName} | الهاتف: ${staff.phone || '—'}</p>
          </div>
          <div style="text-align: left;">
            <span style="font-size: 11px; color: #64748b; display: block;">الفترة: ${periodLabel}</span>
            <span style="font-size: 10px; color: #94a3b8; display: block;">تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px; text-align: center;">
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px; border-radius: 8px;">
            <span style="font-size: 11px; color: #1e40af; display: block;">وقت العمل الفعلي</span>
            <strong style="font-size: 16px; color: #1e3a8a; font-family: monospace;">${staff.workDurationFormatted}</strong>
          </div>
          <div style="background: #fdf2f8; border: 1px solid #fbcfe8; padding: 10px; border-radius: 8px;">
            <span style="font-size: 11px; color: #9d174d; display: block;">إجمالي المبيعات</span>
            <strong style="font-size: 16px; color: #831843; font-family: monospace;">${formatMoney(staff.netSales, currency)}</strong>
            <span style="font-size: 10px; color: #9d174d; display: block;">${staff.contributionPercent}% من المتجر</span>
          </div>
          <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 10px; border-radius: 8px;">
            <span style="font-size: 11px; color: #92400e; display: block;">مجمل الربح</span>
            <strong style="font-size: 16px; color: #78350f; font-family: monospace;">${formatMoney(staff.netProfit, currency)}</strong>
            <span style="font-size: 10px; color: #92400e; display: block;">هامش: ${staff.profitMargin.toFixed(1)}%</span>
          </div>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; border-radius: 8px;">
            <span style="font-size: 11px; color: #166534; display: block;">الفواتير والقطع</span>
            <strong style="font-size: 16px; color: #14532d; font-family: monospace;">${staff.invoicesCount} ف | ${staff.itemsSold} ق</strong>
            <span style="font-size: 10px; color: #166534; display: block;">متوسط: ${formatMoney(staff.avgTicket, currency)}</span>
          </div>
          <div style="background: #faf5ff; border: 1px solid #e9d5ff; padding: 10px; border-radius: 8px;">
            <span style="font-size: 11px; color: #6b21a8; display: block;">سرعة البيع بالساعة</span>
            <strong style="font-size: 16px; color: #581c87; font-family: monospace;">${staff.hasHours ? formatMoney(staff.salesPerHour, '') : '—'} / س</strong>
            <span style="font-size: 10px; color: #6b21a8; display: block;">${staff.hasHours ? staff.invoicesPerHour : '—'} فاتورة/ساعة</span>
          </div>
          <div style="background: #fff7ed; border: 1px solid #fed7aa; padding: 10px; border-radius: 8px;">
            <span style="font-size: 11px; color: #9a3412; display: block;">البونص المستحق</span>
            <strong style="font-size: 16px; color: #9a3412; font-family: monospace;">${staff.bonus?.enabled ? formatMoney(staff.bonus.amount, currency) : 'غير مفعّل'}</strong>
            <span style="font-size: 10px; color: #9a3412; display: block;">${staff.bonus?.enabled ? (staff.bonus.capped ? 'بلغ السقف' : staff.bonus.belowThreshold ? 'لم يبلغ الحدّ' : 'مستحق') : '—'}</span>
          </div>
        </div>

        <h4 style="margin: 15px 0 8px 0; color: #334155; font-size: 13px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">
          🏆 أكثر 5 أصناف مباعة بواسطة ${staff.name}:
        </h4>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
          <thead>
            <tr style="background: #f1f5f9; color: #334155; font-size: 11px;">
              <th style="padding: 6px; text-align: center; width: 30px;">#</th>
              <th style="padding: 6px; text-align: right;">اسم الصنف</th>
              <th style="padding: 6px; text-align: center;">الكمية المباعة</th>
              <th style="padding: 6px; text-align: left;">إجمالي الإيراد</th>
            </tr>
          </thead>
          <tbody>
            ${topProdsHtml || '<tr><td colspan="4" style="text-align: center; padding: 10px; color: #94a3b8;">لا توجد أصناف مسجلة</td></tr>'}
          </tbody>
        </table>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 15px; font-size: 12px; display: flex; justify-content: space-between;">
          <div><strong>انضباط تسليم الصندوق:</strong> ${staff.shiftsCount} وردية (${staff.cleanShifts} سليمة)</div>
          <div><strong>نسبة المطابقة:</strong> ${staff.complianceRate != null ? Math.round(staff.complianceRate) + '%' : '—'}</div>
          <div>
            <strong>فروقات الصندوق:</strong> 
            <span style="font-weight: bold; color: ${staff.shiftsWithVariance === 0 && staff.shiftsCount > 0 ? '#166534' : '#dc2626'};">
              ${staff.shiftsWithVariance === 0 && staff.shiftsCount > 0 ? 'مطابقة تامة 100% ✅' 
                : (staff.cashShortage > 0 ? `عجز ${formatMoney(staff.cashShortage, currency)} ` : '') + (staff.cashOverage > 0 ? `زيادة ${formatMoney(staff.cashOverage, currency)}` : '')}
            </span>
          </div>
        </div>

        <div style="border-top: 1px dashed #cbd5e1; padding-top: 10px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b;">
          <div>توقيع الكاشير: .......................................</div>
          <div>اعتماد الإدارة: .......................................</div>
        </div>
      </div>
    `;
    printHtmlDirectly(html, `تقرير_كاشير_${staff.name}`);
  };

  const handleShareStaffWhatsApp = async () => {
    const waPhone = getManagerPhone(storeInfo);
    const periodLabel = period === 'today' ? 'اليوم' : period === 'week' ? 'آخر 7 أيام' : period === 'month' ? 'هذا الشهر' : 'كافة الفترات';
    const currency = storeInfo?.currency || 'ر.س';

    let msg = '';
    const singleStaff = selectedStaffFilter !== 'all' ? staffAnalytics.staffList.find(s => s.id === selectedStaffFilter) : null;

    if (singleStaff) {
      msg = `👤 *تقرير أداء الكاشير: ${singleStaff.name}*\n` +
        `🏪 المتجر: ${storeInfo?.name || 'بيت الورد'}\n` +
        `📅 الفترة: ${periodLabel} | التاريخ: ${new Date().toLocaleDateString('ar-SA')}\n` +
        `--------------------------------\n` +
        `⏱️ *وقت وساعات العمل الفعلي:* ${singleStaff.workDurationFormatted}\n` +
        `💰 *المبيعات الصافية:* ${formatMoney(singleStaff.netSales, currency)} (${singleStaff.contributionPercent}% من المتجر)\n` +
        `📈 *مجمل الربح:* ${formatMoney(singleStaff.netProfit, currency)} (هامش ${singleStaff.profitMargin.toFixed(1)}%)\n` +
        `🎖️ *البونص:* ${singleStaff.bonus?.enabled ? formatMoney(singleStaff.bonus.amount, currency) : 'غير مفعّل'}\n` +
        (singleStaff.refundsCount > 0 ? `↩️ *المرتجعات:* ${singleStaff.refundsCount} فاتورة (${formatMoney(singleStaff.refundsAmount, currency)})\n` : '') +
        `🧾 *عدد الفواتير المنفذة:* ${singleStaff.invoicesCount} فاتورة\n` +
        `📦 *القطع المباعة:* ${singleStaff.itemsSold} قطعة\n` +
        `🎯 *متوسط قيمة الفاتورة:* ${formatMoney(singleStaff.avgTicket, currency)}\n` +
        `⚡ *معدل المبيعات بالساعة:* ${singleStaff.hasHours ? formatMoney(singleStaff.salesPerHour, '') : '—'} / ساعة (${singleStaff.hasHours ? singleStaff.invoicesPerHour : '—'} فواتير/س)\n` +
        `🛡️ *انضباط تسليم الصندوق:* ${singleStaff.shiftsWithVariance === 0 && singleStaff.shiftsCount > 0 ? 'مطابقة تامة 100% ✅' : (singleStaff.cashShortage > 0 ? `عجز (${formatMoney(singleStaff.cashShortage, currency)}) ` : '') + (singleStaff.cashOverage > 0 ? `زيادة (+${formatMoney(singleStaff.cashOverage, currency)})` : '')}\n` +
        `--------------------------------\n` +
        `تم استخراج التقرير آلياً عبر نظام بيت الورد 🌸`;
    } else {
      msg = `👥 *تقرير أداء الكادر والكاشيرات - ${storeInfo?.name || 'بيت الورد'}*\n` +
        `📅 الفترة: ${periodLabel} | التاريخ: ${new Date().toLocaleDateString('ar-SA')}\n` +
        `--------------------------------\n`;

      if (staffAnalytics.leaders.topSeller) {
        msg += `🏆 *نجم المبيعات:* ${staffAnalytics.leaders.topSeller.name} (${formatMoney(staffAnalytics.leaders.topSeller.netSales, currency)})\n`;
      }
      if (staffAnalytics.leaders.topProfit) {
        msg += `🌟 *الأعلى ربحاً:* ${staffAnalytics.leaders.topProfit.name} (${formatMoney(staffAnalytics.leaders.topProfit.netProfit, currency)})\n`;
      }

      msg += `--------------------------------\n*تفاصيل أداء الكاشيرات:*\n`;

      staffAnalytics.staffList.forEach((s, i) => {
        msg += `${i + 1}. *${s.name}* (${s.roleName})\n` +
          `   • ساعات العمل: ${s.workDurationFormatted}\n` +
          `   • المبيعات: ${formatMoney(s.netSales, currency)} (${s.contributionPercent}% من المتجر)\n` +
          `   • الربح: ${formatMoney(s.netProfit, currency)}\n` +
          `   • الفواتير: ${s.invoicesCount} فاتورة | القطع: ${s.itemsSold}\n` +
          `   • البونص: ${s.bonus?.enabled ? formatMoney(s.bonus.amount, currency) : '—'}\n` +
          `   • الصندوق: ${s.shiftsWithVariance === 0 && s.shiftsCount > 0 ? 'مطابقة تامة ✅' : (s.cashShortage > 0 ? `عجز (${formatMoney(s.cashShortage, currency)}) ` : '') + (s.cashOverage > 0 ? `زيادة (+${formatMoney(s.cashOverage, currency)})` : '')}\n`;
      });

      msg += `\nنظام بيت الورد للمبيعات 🌸`;
    }

    const format = getPreferredShareFormat(storeInfo);
    if (format === 'text') {
      const clean = String(waPhone).replace(/[^0-9]/g, '');
      const intl = clean.startsWith('05') ? '966' + clean.slice(1) : clean.startsWith('5') ? '966' + clean : clean;
      const enc = encodeURIComponent(msg);
      window.open(`https://wa.me/${intl}?text=${enc}`, '_blank');
      return;
    }

    const caption =
      `👥 تقرير أداء الكادر — ${storeInfo?.name || 'بيت الورد'}\n` +
      `📅 الفترة: ${periodLabel}\n` +
      `(التقرير مرفق ${format === 'pdf' ? 'كملف PDF 📄' : 'كصورة 🖼️'})`;

    await shareDocument({
      format,
      phone: waPhone,
      text: caption,
      html: buildStaffReportHtml(),
      filename: `تقرير_الكادر_${periodLabel}`,
      width: 1000
    });
  };

  const zReportExportRef = useRef(null);
  const [isExportingZReport, setIsExportingZReport] = useState(false);
  const [zReportToast, setZReportToast] = useState(null);

  const handleShareZReportImageWhatsApp = async () => {
    if (!zReportExportRef.current) return;
    try {
      setIsExportingZReport(true);
      setZReportToast('جاري إنشاء صورة تقرير الإغلاق المالي Z-Report...');

      const canvas = await html2canvas(zReportExportRef.current, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setIsExportingZReport(false);
          setZReportToast(null);
          return;
        }

        const fileName = `تقرير_ZReport_${new Date().toISOString().slice(0, 10)}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        let copied = false;
        if (navigator.clipboard && window.ClipboardItem) {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            copied = true;
          } catch(e) {}
        }

        const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobileDevice && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: 'تقرير الإغلاق المالي Z-Report',
              text: `تقرير الإغلاق المالي من ${storeInfo?.name || 'بيت الورد'}`,
              files: [file]
            });
            setIsExportingZReport(false);
            setZReportToast(null);
            return;
          } catch(e) {}
        }

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();

        handleShareZReportWhatsApp();

        setIsExportingZReport(false);
        setZReportToast(
          copied 
            ? '✅ تم نسخ صورة تقرير Z-Report للحافظة وتنزيلها! في الواتساب اضغط (Ctrl + V) لإرسال الصورة فوراً 🌸' 
            : '✅ تم تنزيل صورة تقرير Z-Report وفتح الواتساب 🌸'
        );
        setTimeout(() => setZReportToast(null), 6000);
      }, 'image/png');
    } catch(err) {
      setIsExportingZReport(false);
      handleShareZReportWhatsApp();
    }
  };

  const handleShareZReportWhatsApp = async () => {
    const waPhone = getManagerPhone(storeInfo);
    const message = `🌸 *تقرير الإغلاق المالي (Z-Report) - ${storeInfo?.name || 'بيت الورد'}*\n` +
      `👤 المسؤول: ${currentUser?.name || 'كاشير رئيسي'}\n` +
      `📅 التاريخ: ${formatDate(new Date())}\n` +
      `--------------------------------\n` +
      `💰 إجمالي المبيعات: ${totalSales.toFixed(2)} ${storeInfo?.currency || 'ر.س'}\n` +
      `🧾 عدد الفواتير: ${filteredInvoices.length}\n` +
      `🏷️ الخصومات: ${totalDiscounts.toFixed(2)} ${storeInfo?.currency || 'ر.س'}\n` +
      (isTaxActive ? `🏛️ ضريبة القيمة المضافة: ${totalTax.toFixed(2)} ${storeInfo?.currency || 'ر.س'}\n` : '') +
      `📦 تكلفة المبيعات (COGS): ${costOfGoodsSold.toFixed(2)} ${storeInfo?.currency || 'ر.س'}\n` +
      `💸 المصروفات التشغيلية: ${totalExp.toFixed(2)} ${storeInfo?.currency || 'ر.س'}\n` +
      `✨ صافي الربح التقديري: ${netProfit.toFixed(2)} ${storeInfo?.currency || 'ر.س'}\n` +
      `--------------------------------\n` +
      `*تفاصيل وسائل الدفع:*\n` +
      paymentBreakdown.map(p => `• ${p.name}: ${p.amount.toFixed(2)} ${storeInfo?.currency || 'ر.س'} (${p.count} عملية)`).join('\n') +
      `\n--------------------------------\n` +
      `تم استخراج التقرير آلياً عبر نظام بيت الورد للمبيعات.`;

    const clean = String(waPhone).replace(/[^0-9]/g, '');
    const intl = clean.startsWith('05') ? '966' + clean.slice(1) : clean.startsWith('5') ? '966' + clean : clean;
    const isDesktop = !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const enc = encodeURIComponent(message);

    const format = getPreferredShareFormat(storeInfo);
    if (format !== 'text' && zReportExportRef.current) {
      const caption =
        `🌸 تقرير الإغلاق المالي (Z-Report) — ${storeInfo?.name || 'بيت الورد'}\n` +
        `📅 ${formatDate(new Date())}\n` +
        `(التقرير مرفق ${format === 'pdf' ? 'كملف PDF 📄' : 'كصورة 🖼️'})`;
      try {
        await shareDocument({
          format,
          phone: waPhone,
          text: caption,
          element: zReportExportRef.current,
          filename: `تقرير_الاغلاق_المالي_${Date.now()}`
        });
        return;
      } catch (err) {
        console.error('Share Z-Report error:', err);
      }
    }

    if (isDesktop) {
      const link = document.createElement('a');
      link.href = `whatsapp://send?phone=${intl}&text=${enc}`;
      link.click();
      window.open(`https://wa.me/${intl}?text=${enc}`, '_blank');
    } else {
      window.open(`https://wa.me/${intl}?text=${enc}`, '_blank');
    }
  };

  const handlePrintZReportFromView = () => {
    if (!zReportExportRef.current) {
      window.print();
      return;
    }

    try {
      const fullHtml = `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>تقرير Z-Report - ${storeInfo?.name || 'بيت الورد'}</title>
          <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            @page { size: auto; margin: 2mm; }
            body {
              font-family: 'Cairo', sans-serif;
              font-size: 11px;
              line-height: 1.35;
              color: #000000;
              background: #ffffff;
              width: 78mm;
              margin: 0 auto;
              padding: 4px;
              direction: rtl;
              text-align: right;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            table { width: 100%; border-collapse: collapse; margin: 4px 0; }
            th, td { padding: 3px 1px; font-size: 10px; }
            .border-b { border-bottom: 1px dashed #000; }
            .border-t { border-top: 1px dashed #000; }
          </style>
        </head>
        <body>
          ${zReportExportRef.current.innerHTML}
        </body>
        </html>
      `;

      printHtmlDirectly(fullHtml, 'تقرير_Z_Report');
    } catch (err) {
      console.error('Print Z-Report view error:', err);
      window.print();
    }
  };

  return (
    <>
      {activeReportTab === 'zreport' && (
        <div className="bg-white rounded-3xl p-5 border border-pink-100 shadow-sm space-y-4 animate-in fade-in text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-pink-100">
            <div>
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                <span>📜 تقرير الإغلاق المالي الشامل (Z-Report)</span>
              </h3>
              <p className="text-[11px] text-slate-500">كشف إقفال اليومية ومطابقة النقدية مع الشبكة وإمكانية التصدير والطباعة</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleShareZReportImageWhatsApp}
                disabled={isExportingZReport}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs flex items-center gap-1.5 transition active:scale-95 shadow"
              >
                <span>واتساب (صورة Z-Report) 🖼️</span>
              </button>

              <button
                type="button"
                onClick={handleShareZReportWhatsApp}
                className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow"
              >
                <span>واتساب (نص) 💬</span>
              </button>

              <button
                type="button"
                onClick={handlePrintZReportFromView}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة 🖨️</span>
              </button>
            </div>
          </div>

          {zReportToast && (
            <div className="p-3 bg-gradient-to-r from-purple-900 to-pink-900 text-white text-xs font-bold text-center rounded-2xl shadow animate-in fade-in flex items-center justify-between gap-2">
              <span>{zReportToast}</span>
              <button onClick={() => setZReportToast(null)} className="text-white/70 hover:text-white text-xs">✕</button>
            </div>
          )}

          <div ref={zReportExportRef} className="p-4 bg-white rounded-2xl border border-slate-300 shadow-sm font-sans text-xs space-y-3">
            <div className="text-center pb-2 border-b border-dashed border-slate-300 space-y-0.5">
              <strong className="text-sm font-black text-slate-900 block">{storeInfo?.name || 'بيت الورد'} 🌸</strong>
              {storeInfo?.crNumber && (
                <span className="text-[10px] text-slate-600 block">سجل تجاري: {storeInfo.crNumber} {isTaxActive && storeInfo.taxNumber ? (' | ر.ض: ' + storeInfo.taxNumber) : ''}</span>
              )}
              <span className="text-[10px] font-bold text-pink-700 block mt-1">*** تقرير الإغلاق المالي Z-REPORT ***</span>
              <span className="text-[9px] text-slate-500 block font-mono">التاريخ والوقت: {formatDate(new Date())}</span>
              <div className="pt-1 text-[11px] font-bold text-indigo-900 bg-indigo-50/80 rounded-lg p-1 mt-1 border border-indigo-200 inline-block px-3">
                👤 المسؤول: <strong>{currentUser?.name || 'كاشير رئيسي'}</strong> ({currentUser?.roleName || 'كاشير'})
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between font-black text-sm text-slate-900">
                <span>إجمالي المبيعات:</span>
                <span className="font-mono text-pink-700">{formatMoney(totalSales, storeInfo?.currency)}</span>
              </div>
              <div className="flex justify-between text-slate-600"><span>عدد الفواتير الصادرة:</span><span className="font-bold">{filteredInvoices.length} فاتورة</span></div>
              {totalDiscounts > 0 && (
                <div className="flex justify-between text-rose-600"><span>إجمالي الخصومات:</span><span className="font-mono">-{formatMoney(totalDiscounts, storeInfo?.currency)}</span></div>
              )}
              {isTaxActive && (
                <div className="flex justify-between text-amber-700"><span>ضريبة القيمة المضافة ({currentTaxRate}%):</span><span className="font-mono">{formatMoney(totalTax, storeInfo?.currency)}</span></div>
              )}
              <div className="flex justify-between text-purple-700"><span>تكلفة البضاعة المباعة (COGS):</span><span className="font-mono">{formatMoney(costOfGoodsSold, storeInfo?.currency)}</span></div>
              <div className="flex justify-between text-rose-700"><span>المصروفات التشغيلية:</span><span className="font-mono">-{formatMoney(totalExp, storeInfo?.currency)}</span></div>
              <div className="flex justify-between font-black text-emerald-700 pt-1 border-t border-dashed border-slate-300 text-sm">
                <span>صافي الأرباح المحققة:</span>
                <span className="font-mono">{formatMoney(netProfit, storeInfo?.currency)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-dashed border-slate-300 space-y-1">
              <span className="font-bold text-slate-800 block text-[11px] mb-1">تفصيل المبالغ المستلمة بالصندوق:</span>
              {paymentBreakdown.map(p => (
                <div key={p.id} className="flex justify-between text-[11px] p-1 bg-slate-50 rounded-lg">
                  <span>{p.name} ({p.count} عملية):</span>
                  <span className="font-bold font-mono text-slate-900">{formatMoney(p.amount, storeInfo?.currency)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeReportTab === 'shiftsLog' && (
        <ShiftsHistoryLog
          shiftsHistory={shiftsHistory}
          deleteShiftRecord={deleteShiftRecord}
          updateShiftRecord={updateShiftRecord}
          resetShiftsHistory={resetShiftsHistory}
          currentUser={currentUser}
          users={users}
          storeInfo={storeInfo}
          hasPermission={hasPermission}
          formatMoney={formatMoney}
          formatDate={formatDate}
        />
      )}

      {activeReportTab === 'staff' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="bg-gradient-to-r from-purple-900 via-pink-900 to-rose-900 text-white p-5 rounded-3xl shadow-xl border border-pink-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-2xl border border-white/20 shadow-inner">
                👥
              </div>
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <span>تحليل وتقييم أداء فريق العمل والكاشيرات</span>
                  <span className="text-[10px] bg-pink-500/30 text-pink-200 px-2 py-0.5 rounded-full border border-pink-400/30 font-mono">
                    {staffAnalytics.staffList.length} موظف
                  </span>
                </h3>
                <p className="text-xs text-pink-200/80 mt-0.5">
                  ساعات العمل الفعلية، معدل الإنجاز والسرعة (SAR/ساعة)، المبيعات، الفواتير، وانضباط تسليم الصندوق
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                onClick={selectedStaffFilter !== 'all' 
                  ? () => handlePrintSingleStaffDossier(staffAnalytics.staffList.find(s => s.id === selectedStaffFilter))
                  : handlePrintStaffReport}
                className="flex-1 md:flex-initial px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-white/20 transition active:scale-95 shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>{selectedStaffFilter !== 'all' ? 'طباعة ملف الكاشير 🖨️' : 'طباعة التقرير الشامل 🖨️'}</span>
              </button>
              <button
                onClick={handleShareStaffWhatsApp}
                className="flex-1 md:flex-initial px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md"
              >
                <MessageSquare className="w-4 h-4" />
                <span>{selectedStaffFilter !== 'all' ? 'واتساب الكاشير 💬' : 'مشاركة واتساب 💬'}</span>
              </button>
            </div>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-pink-100 shadow-sm flex items-center gap-2 overflow-x-auto">
            <span className="text-xs font-black text-slate-700 whitespace-nowrap pl-2 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-pink-600" />
              <span>الكاشير:</span>
            </span>
            <button
              onClick={() => setSelectedStaffFilter('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
                selectedStaffFilter === 'all'
                  ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <span>👥 جميع الكاشيرات (مقارنة شاملة)</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedStaffFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {staffAnalytics.staffList.length}
              </span>
            </button>
            {staffAnalytics.staffList.map(st => (
              <button
                key={st.id}
                onClick={() => setSelectedStaffFilter(st.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
                  selectedStaffFilter === st.id
                    ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {st.isOnline && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="متواجد بالوردية النشطة الآن" />
                )}
                <span>{st.name}</span>
                <span className={`text-[10px] font-mono px-1 rounded ${
                  selectedStaffFilter === st.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {formatMoney(st.netSales, '')}
                </span>
              </button>
            ))}
          </div>

          {selectedStaffFilter !== 'all' ? (() => {
            const singleStaff = staffAnalytics.staffList.find(s => s.id === selectedStaffFilter) || staffAnalytics.staffList[0];
            if (!singleStaff) return null;

            return (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl p-6 border border-pink-200 shadow-md">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-700 text-white font-black flex items-center justify-center text-2xl shadow-lg">
                          {singleStaff.name.charAt(0) || 'ك'}
                        </div>
                        {singleStaff.isOnline && (
                          <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white animate-pulse" title="متواجد حالياً" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-black text-slate-800">{singleStaff.name}</h3>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                            singleStaff.role === 'admin'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-pink-50 text-pink-700 border-pink-200'
                          }`}>
                            {singleStaff.roleName}
                          </span>
                          {singleStaff.isOnline && (
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                              <span>متواجد بالوردية الحالية</span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                          <span>الورديات المنفذة: <strong className="font-mono text-slate-700">{singleStaff.shiftsCount} وردية</strong></span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePrintSingleStaffDossier(singleStaff)}
                        className="px-3.5 py-2 bg-pink-50 hover:bg-pink-100 text-pink-700 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-pink-200 transition"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>طباعة الملف الفردي</span>
                      </button>
                      <button
                        onClick={() => setSelectedStaffFilter('all')}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                      >
                        <span>← العودة للمقارنة الشاملة</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                    <div className="bg-gradient-to-br from-blue-50 to-sky-50 p-4 rounded-2xl border-2 border-blue-300 shadow-sm hover:shadow-md hover:border-blue-400 transition-all space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-blue-800 font-black">
                        <span className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                            <Clock className="w-3.5 h-3.5" />
                          </div>
                          <span>وقت العمل الفعلي</span>
                        </span>
                        <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-mono font-bold border border-blue-200">
                          {singleStaff.shiftsCount} وردية
                        </span>
                      </div>
                      <div className="text-base sm:text-lg font-black text-blue-950 font-mono">
                        {singleStaff.workDurationFormatted}
                      </div>
                      <p className="text-[10px] text-blue-700/80 font-medium">
                        {singleStaff.isOnline ? 'محسوب شامل الوردية الجارية الآن' : 'إجمالي الساعات للورديات المغلقة'}
                      </p>
                    </div>

                    <div className="bg-gradient-to-br from-pink-50 to-rose-50 p-4 rounded-2xl border-2 border-pink-300 shadow-sm hover:shadow-md hover:border-pink-400 transition-all space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-pink-800 font-black">
                        <span className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-lg bg-pink-100 text-pink-600 flex items-center justify-center">
                            <DollarSign className="w-3.5 h-3.5" />
                          </div>
                          <span>المبيعات الصافية</span>
                        </span>
                        <span className="text-[10px] bg-pink-100 text-pink-800 px-2 py-0.5 rounded-full font-mono font-bold border border-pink-200">
                          {singleStaff.contributionPercent}% من المتجر
                        </span>
                      </div>
                      <div className="text-base sm:text-lg font-black text-pink-950 font-mono">
                        {formatMoney(singleStaff.netSales, storeInfo?.currency)}
                      </div>
                      <p className="text-[10px] text-pink-700/80 font-medium">
                        المبيعات الإجمالية: {formatMoney(singleStaff.grossSales, storeInfo?.currency)}
                      </p>
                    </div>

                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-4 rounded-2xl border-2 border-emerald-300 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-emerald-800 font-black">
                        <span className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                            <ShoppingBag className="w-3.5 h-3.5" />
                          </div>
                          <span>الفواتير والقطع</span>
                        </span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-mono font-bold border border-emerald-200">
                          {singleStaff.invoicesCount} فاتورة
                        </span>
                      </div>
                      <div className="text-base sm:text-lg font-black text-emerald-950 font-mono">
                        {singleStaff.itemsSold} قطعة مباعة
                      </div>
                      <p className="text-[10px] text-emerald-700/80 font-medium">
                        متوسط الفاتورة: {formatMoney(singleStaff.avgTicket, storeInfo?.currency)}
                      </p>
                    </div>

                    <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-4 rounded-2xl border-2 border-purple-300 shadow-sm hover:shadow-md hover:border-purple-400 transition-all space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-purple-800 font-black">
                        <span className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                            <Zap className="w-3.5 h-3.5" />
                          </div>
                          <span>سرعة البيع بالساعة</span>
                        </span>
                        <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-mono font-bold border border-purple-200">
                          معدل إنجاز
                        </span>
                      </div>
                      <div className="text-base sm:text-lg font-black text-purple-950 font-mono">
                        {singleStaff.hasHours ? formatMoney(singleStaff.salesPerHour, '') : '—'} <span className="text-xs">ر.س / س</span>
                      </div>
                      <p className="text-[10px] text-purple-700/80 font-medium">
                        {singleStaff.hasHours ? `${singleStaff.invoicesPerHour} فاتورة/س` : 'بدون ساعات'}
                      </p>
                    </div>

                    <div className="bg-gradient-to-br from-amber-50 to-yellow-50 p-4 rounded-2xl border-2 border-amber-300 shadow-sm hover:shadow-md hover:border-amber-400 transition-all space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-amber-800 font-black">
                        <span className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                            <TrendingUp className="w-3.5 h-3.5" />
                          </div>
                          <span>مجمل الربح</span>
                        </span>
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-mono font-bold border border-amber-200">
                          هامش: {singleStaff.profitMargin.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-base sm:text-lg font-black text-amber-950 font-mono">
                        {formatMoney(singleStaff.netProfit, storeInfo?.currency)}
                      </div>
                      <p className="text-[10px] text-amber-700/80 font-medium">
                        {singleStaff.refundsAmount > 0 ? `المرتجعات: ${formatMoney(singleStaff.refundsAmount, storeInfo?.currency)}` : 'لا توجد مرتجعات'}
                      </p>
                    </div>

                    <div className="bg-gradient-to-br from-orange-50 to-amber-50 p-4 rounded-2xl border-2 border-orange-300 shadow-sm hover:shadow-md hover:border-orange-400 transition-all space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-orange-800 font-black">
                        <span className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                            <Award className="w-3.5 h-3.5" />
                          </div>
                          <span>البونص المستحق</span>
                        </span>
                        {singleStaff.bonus?.enabled && singleStaff.bonus?.capped && (
                          <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold border border-rose-200">
                            بلغ السقف
                          </span>
                        )}
                      </div>
                      <div className="text-base sm:text-lg font-black text-orange-950 font-mono">
                        {singleStaff.bonus?.enabled ? formatMoney(singleStaff.bonus.amount, storeInfo?.currency) : 'غير مفعّل'}
                      </div>
                      {singleStaff.bonus?.enabled ? (
                        <p className="text-[10px] text-orange-700/80 font-medium">
                          {singleStaff.bonus.belowThreshold ? (
                            <span className="text-rose-600">لم يبلغ الحدّ الأدنى</span>
                          ) : (
                            `${singleStaff.bonus.baseLabel}: ${singleStaff.bonus.rateLabel}`
                          )}
                          {singleStaff.bonus.shortageDeducted > 0 && ` | خُصم عجز: ${formatMoney(singleStaff.bonus.shortageDeducted, storeInfo?.currency)}`}
                        </p>
                      ) : (
                        <p className="text-[10px] text-orange-700/80 font-medium">نظام البونص غير مفعل</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-3xl p-5 border border-pink-100 shadow-sm space-y-3">
                    <h4 className="font-black text-slate-800 text-sm flex items-center justify-between border-b border-slate-100 pb-3">
                      <span className="flex items-center gap-2">
                        <span>🏆 أكثر الأصناف مبيعاً بواسطة {singleStaff.name}</span>
                      </span>
                      <span className="text-xs text-slate-400 font-normal">
                        ({(singleStaff.topProducts || []).length} أصناف)
                      </span>
                    </h4>

                    {(singleStaff.topProducts || []).length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-xs">
                        لا توجد مبيعات أصناف مسجلة لهذا الكاشير في الفترة المختارة
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {singleStaff.topProducts.map((p, pIdx) => (
                          <div key={p.id || pIdx} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-lg bg-pink-100 text-pink-700 font-bold text-xs flex items-center justify-center">
                                {pIdx + 1}
                              </span>
                              <div>
                                <span className="font-bold text-slate-800 text-xs block">{p.name}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{p.qty} قطعة مباعة</span>
                              </div>
                            </div>
                            <div className="text-left font-mono font-black text-pink-700 text-xs">
                              {formatMoney(p.revenue, storeInfo?.currency)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="bg-white rounded-3xl p-5 border border-pink-100 shadow-sm space-y-3">
                      <h4 className="font-black text-slate-800 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
                        <span>💳 وسائل الدفع المحصلة بواسطة {singleStaff.name}</span>
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        <div className="bg-emerald-50/70 p-3 rounded-2xl border border-emerald-100">
                          <span className="text-[10px] font-bold text-emerald-800 block">💵 نقدي (كاش):</span>
                          <strong className="text-sm font-black font-mono text-emerald-700 mt-1 block">
                            {formatMoney(singleStaff.paymentMethods.cash, storeInfo?.currency)}
                          </strong>
                        </div>
                        <div className="bg-pink-50/70 p-3 rounded-2xl border border-pink-100">
                          <span className="text-[10px] font-bold text-pink-800 block">💳 شبكة (مدى):</span>
                          <strong className="text-sm font-black font-mono text-pink-700 mt-1 block">
                            {formatMoney(singleStaff.paymentMethods.card, storeInfo?.currency)}
                          </strong>
                        </div>
                        <div className="bg-blue-50/70 p-3 rounded-2xl border border-blue-100">
                          <span className="text-[10px] font-bold text-blue-800 block">🌐 تحويل بنكي:</span>
                          <strong className="text-sm font-black font-mono text-blue-700 mt-1 block">
                            {formatMoney(singleStaff.paymentMethods.transfer, storeInfo?.currency)}
                          </strong>
                        </div>
                        <div className="bg-amber-50/70 p-3 rounded-2xl border border-amber-100">
                          <span className="text-[10px] font-bold text-amber-800 block">⚡ تمارا (تقسيط):</span>
                          <strong className="text-sm font-black font-mono text-amber-700 mt-1 block">
                            {formatMoney(singleStaff.paymentMethods.tamara, storeInfo?.currency)}
                          </strong>
                        </div>
                        <div className="bg-purple-50/70 p-3 rounded-2xl border border-purple-100">
                          <span className="text-[10px] font-bold text-purple-800 block">👥 آجل (عملاء):</span>
                          <strong className="text-sm font-black font-mono text-purple-700 mt-1 block">
                            {formatMoney(singleStaff.paymentMethods.credit, storeInfo?.currency)}
                          </strong>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-600 block">🛍️ دفع مجزأ/أخرى:</span>
                          <strong className="text-sm font-black font-mono text-slate-700 mt-1 block">
                            {formatMoney(singleStaff.paymentMethods.split + singleStaff.paymentMethods.other, storeInfo?.currency)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-3xl p-5 border border-pink-100 shadow-sm space-y-3">
                      <h4 className="font-black text-slate-800 text-sm border-b border-slate-100 pb-3 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-purple-600" />
                          <span>انضباط تسليم الصندوق والعهد</span>
                        </span>
                        <span className="text-xs font-mono font-bold text-purple-700">
                          نسبة المطابقة: {singleStaff.complianceRate != null ? Math.round(singleStaff.complianceRate) + '%' : '—'}
                        </span>
                      </h4>
                      <div className="flex flex-col gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                        <div className="flex justify-between items-center w-full">
                          <span className="text-slate-500 text-[11px]">الورديات المسجلة:</span>
                          <span className="font-bold text-slate-700">{singleStaff.shiftsCount} وردية ({singleStaff.cleanShifts} سليمة)</span>
                        </div>
                        <div className="flex justify-between items-center w-full mt-1">
                          <span className="text-slate-500 text-[11px]">فروقات الصندوق التراكمية:</span>
                          <div className="text-left flex flex-col gap-1 items-end">
                            {singleStaff.shiftsCount === 0 ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <>
                                {singleStaff.cashShortage === 0 && singleStaff.cashOverage === 0 && (
                                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-xs">مطابقة تامة ✅</span>
                                )}
                                {singleStaff.cashShortage > 0 && (
                                  <span className="px-3 py-1 bg-rose-100 text-rose-800 rounded-full font-bold font-mono text-xs">عجز {formatMoney(singleStaff.cashShortage, storeInfo?.currency)}</span>
                                )}
                                {singleStaff.cashOverage > 0 && (
                                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-bold font-mono text-xs">زيادة +{formatMoney(singleStaff.cashOverage, storeInfo?.currency)}</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between items-center w-full mt-1 pt-2 border-t border-slate-200">
                          <span className="text-slate-500 text-[11px]">متوسط الانحراف للوردية:</span>
                          <span className="font-bold font-mono text-slate-700">{formatMoney(singleStaff.avgVariancePerShift, storeInfo?.currency)}</span>
                        </div>
                        {singleStaff.refundsChargedNotSold > 0 && (
                          <div className="mt-2 text-rose-600 bg-rose-50 p-2 rounded-lg text-[10px] font-bold border border-rose-100">
                            ⚠️ يتضمن مرتجعات بقيمة {formatMoney(singleStaff.refundsChargedNotSold, storeInfo?.currency)} لفواتير باعها غيره
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })() : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-pink-50 to-rose-50 p-4 rounded-2xl border-2 border-pink-300 shadow-sm hover:shadow-md hover:border-pink-400 transition-all space-y-2 relative overflow-hidden">
                  <div className="absolute top-2 left-2 opacity-15 text-4xl select-none">🏆</div>
                  <div className="flex items-center gap-1.5 text-xs font-black text-pink-800">
                    <Award className="w-4 h-4 text-pink-600" />
                    <span>نجم المبيعات الأول</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 truncate" title={staffAnalytics.leaders.topSeller?.name || '—'}>
                      {staffAnalytics.leaders.topSeller?.name || 'لا توجد مبيعات بعد'}
                    </h4>
                    <p className="text-base font-black text-pink-700 font-mono mt-0.5">
                      {staffAnalytics.leaders.topSeller ? formatMoney(staffAnalytics.leaders.topSeller.netSales, storeInfo?.currency) : '—'}
                    </p>
                  </div>
                  <div className="text-[10px] text-pink-900/80 font-bold flex items-center justify-between">
                    <span>المساهمة في المبيعات:</span>
                    <span className="font-mono font-black bg-pink-100 px-2 py-0.5 rounded-full border border-pink-200">{staffAnalytics.leaders.topSeller ? `${staffAnalytics.leaders.topSeller.contributionPercent}%` : '0%'}</span>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-amber-50 to-yellow-50 p-4 rounded-2xl border-2 border-amber-300 shadow-sm hover:shadow-md hover:border-amber-400 transition-all space-y-2 relative overflow-hidden">
                  <div className="absolute top-2 left-2 opacity-15 text-4xl select-none">🌟</div>
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-800">
                    <Zap className="w-4 h-4 text-amber-600" />
                    <span>الأعلى ربحاً</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 truncate" title={staffAnalytics.leaders.topProfit?.name || '—'}>
                      {staffAnalytics.leaders.topProfit?.name || 'لا توجد أرباح بعد'}
                    </h4>
                    <p className="text-base font-black text-amber-700 font-mono mt-0.5">
                      {staffAnalytics.leaders.topProfit ? formatMoney(staffAnalytics.leaders.topProfit.netProfit, storeInfo?.currency) : '—'}
                    </p>
                  </div>
                  <div className="text-[10px] text-amber-900/80 font-bold flex items-center justify-between">
                    <span>هامش الربحية:</span>
                    <span className="font-mono font-black bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">{staffAnalytics.leaders.topProfit ? `${staffAnalytics.leaders.topProfit.profitMargin.toFixed(1)}%` : '0%'}</span>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-2xl border-2 border-blue-300 shadow-sm hover:shadow-md hover:border-blue-400 transition-all space-y-2 relative overflow-hidden">
                  <div className="absolute top-2 left-2 opacity-15 text-4xl select-none">🎯</div>
                  <div className="flex items-center gap-1.5 text-xs font-black text-blue-800">
                    <ShoppingBag className="w-4 h-4 text-blue-600" />
                    <span>أعلى متوسط فاتورة</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 truncate" title={staffAnalytics.leaders.topAvgTicket?.name || '—'}>
                      {staffAnalytics.leaders.topAvgTicket?.name || 'بانتظار البيانات'}
                    </h4>
                    <p className="text-base font-black text-blue-700 font-mono mt-0.5">
                      {staffAnalytics.leaders.topAvgTicket ? formatMoney(staffAnalytics.leaders.topAvgTicket.avgTicket, storeInfo?.currency) : '—'}
                    </p>
                  </div>
                  <div className="text-[10px] text-blue-900/80 font-bold flex items-center justify-between">
                    <span>متوسط كل فاتورة</span>
                    <span className="text-[10px] text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200 font-bold">قيمة مضافة ✨</span>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-4 rounded-2xl border-2 border-purple-300 shadow-sm hover:shadow-md hover:border-purple-400 transition-all space-y-2 relative overflow-hidden">
                  <div className="absolute top-2 left-2 opacity-15 text-4xl select-none">🛡️</div>
                  <div className="flex items-center gap-1.5 text-xs font-black text-purple-800">
                    <ShieldCheck className="w-4 h-4 text-purple-600" />
                    <span>دقة تسليم الصندوق</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 truncate" title={staffAnalytics.leaders.mostAccurate?.name || '—'}>
                      {staffAnalytics.leaders.mostAccurate?.name || 'بانتظار إغلاق الورديات'}
                    </h4>
                    <p className="text-base font-black text-purple-700 font-mono mt-0.5">
                      {staffAnalytics.leaders.mostAccurate 
                        ? (staffAnalytics.leaders.mostAccurate.avgVariancePerShift === 0 ? 'مطابقة تامة 100% ✅' : formatMoney(staffAnalytics.leaders.mostAccurate.avgVariancePerShift, storeInfo?.currency))
                        : '—'}
                    </p>
                  </div>
                  <div className="text-[10px] text-purple-900/80 font-bold flex items-center justify-between">
                    <span>متوسط الانحراف للوردية</span>
                    <span className="font-mono font-black bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">{staffAnalytics.leaders.mostAccurate ? `${staffAnalytics.leaders.mostAccurate.shiftsCount} وردية` : '0'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-pink-100 shadow-md overflow-hidden">
                <div className="p-4 bg-gradient-to-r from-pink-50 via-purple-50 to-pink-50 border-b border-pink-100 flex items-center justify-between">
                  <h4 className="font-black text-slate-800 text-sm flex items-center gap-2">
                    <span>📋 جدول ترتيب ومقارنة أداء الكاشيرات الشامل</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      (مرتب تلقائياً حسب حجم المبيعات وساعات العمل الفعلية)
                    </span>
                  </h4>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-3 text-center w-10">#</th>
                        <th className="py-3 px-4">الموظف / الكاشير</th>
                        <th className="py-3 px-3 text-center">وقت العمل</th>
                        <th className="py-3 px-3 text-center">الفواتير</th>
                        <th className="py-3 px-3 text-center">القطع</th>
                        <th className="py-3 px-4">المبيعات الصافية</th>
                        <th className="py-3 px-3 text-center">المساهمة</th>
                        <th className="py-3 px-4 text-center">الربح</th>
                        <th className="py-3 px-3 text-center">معدل/ساعة</th>
                        <th className="py-3 px-3 text-center">المرتجع</th>
                        <th className="py-3 px-3 text-center">فروقات الصندوق</th>
                        <th className="py-3 px-3 text-center">البونص</th>
                        <th className="py-3 px-3 text-center">الإجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {staffAnalytics.staffList.length === 0 ? (
                        <tr>
                          <td colSpan="13" className="py-8 text-center text-slate-400">
                            لا يوجد موظفون مسجلون في النظام حالياً
                          </td>
                        </tr>
                      ) : (
                        staffAnalytics.staffList.map((st, idx) => {
                          const isTop = idx === 0 && st.netSales > 0;
                          return (
                            <tr key={st.id || idx} className={`hover:bg-pink-50/50 transition ${isTop ? 'bg-amber-50/30' : ''}`}>
                              <td className="py-3 px-3 text-center font-bold text-slate-400">
                                {isTop ? '🥇' : idx === 1 && st.netSales > 0 ? '🥈' : idx === 2 && st.netSales > 0 ? '🥉' : idx + 1}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  <div className="relative">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-white font-black flex items-center justify-center text-xs shrink-0 shadow-xs">
                                      {st.name.charAt(0) || 'م'}
                                    </div>
                                    {st.isOnline && (
                                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white" title="متواجد بالوردية" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                                      <span>{st.name}</span>
                                      {isTop && <span className="text-amber-500 text-xs" title="نجم المبيعات">🏆</span>}
                                    </p>
                                    <p className="text-[10px] text-slate-400">{st.roleName}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-center font-mono font-bold text-sky-700 bg-sky-50/40 rounded">
                                {st.workDurationFormatted}
                              </td>
                              <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">
                                {st.invoicesCount}
                              </td>
                              <td className="py-3 px-3 text-center font-mono text-slate-600">
                                {st.itemsSold}
                              </td>
                              <td className="py-3 px-4">
                                <div>
                                  <span className="font-mono font-black text-pink-700">
                                    {formatMoney(st.netSales, storeInfo?.currency)}
                                  </span>
                                  {staffAnalytics.totals.grossSales > 0 && (
                                    <div className="w-20 bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                                      <div 
                                        className="bg-gradient-to-r from-pink-500 to-purple-600 h-full rounded-full" 
                                        style={{ width: `${Math.min(100, st.contributionPercent)}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className="font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg text-[11px]">
                                  {st.contributionPercent}%
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center font-mono font-bold text-emerald-700">
                                {formatMoney(st.netProfit, storeInfo?.currency)}
                              </td>
                              <td className="py-3 px-3 text-center font-mono text-purple-700 font-bold">
                                {st.hasHours ? formatMoney(st.salesPerHour, '') + ' / س' : '—'}
                              </td>
                              <td className="py-3 px-3 text-center font-mono text-rose-700 font-bold">
                                {st.refundRate > 0 ? st.refundRate.toFixed(1) + '%' : '—'}
                              </td>
                              <td className="py-3 px-3 text-center">
                                {st.shiftsCount === 0 ? (
                                  <span className="text-slate-400 text-[10px]">لا توجد ورديات</span>
                                ) : st.shiftsWithVariance === 0 ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-200">
                                    <CheckCircle className="w-3 h-3" />
                                    <span>مطابق 100%</span>
                                  </span>
                                ) : (
                                  <div className="flex flex-col items-center gap-1">
                                    {st.cashShortage > 0 && (
                                      <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-rose-200 font-mono">
                                        <TrendingDown className="w-3 h-3" />
                                        <span>عجز {formatMoney(st.cashShortage, storeInfo?.currency)}</span>
                                      </span>
                                    )}
                                    {st.cashOverage > 0 && (
                                      <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-blue-200 font-mono">
                                        <TrendingUp className="w-3 h-3" />
                                        <span>زيادة +{formatMoney(st.cashOverage, storeInfo?.currency)}</span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-center">
                                {st.bonus?.enabled ? (
                                  <span className="font-mono font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-lg text-[11px] border border-orange-200">
                                    {formatMoney(st.bonus.amount, storeInfo?.currency)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[10px]">غير مفعّل</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <button
                                  onClick={() => setSelectedStaffFilter(st.id)}
                                  className="p-1.5 bg-slate-100 hover:bg-pink-100 text-slate-600 hover:text-pink-600 rounded-lg transition"
                                  title="عرض ملف الكاشير"
                                >
                                  <Filter className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                
                <div className="p-3 bg-slate-50 border-t border-slate-200 text-center flex items-center justify-center gap-2">
                  <span className="text-slate-500 font-medium">إجمالي الموظفين بالكشف:</span>
                  <span className="font-black text-pink-700 text-sm">
                    {staffAnalytics.staffList.length} كاشير مسجل
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {staffAnalytics.staffList.map((st, i) => (
                  <div key={st.id || i} className="bg-white rounded-3xl p-5 border border-pink-100 shadow-sm space-y-4 hover:shadow-md transition relative">
                    {st.bonus?.enabled && st.bonus.amount > 0 && (
                      <div className="absolute -top-3 -right-3 w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white text-white z-10" title={`بونص: ${formatMoney(st.bonus.amount, storeInfo?.currency)}`}>
                        <Award className="w-4 h-4" />
                      </div>
                    )}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 text-white font-black flex items-center justify-center text-sm shadow-md">
                            {st.name.charAt(0) || 'ك'}
                          </div>
                          {st.isOnline && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                          )}
                        </div>
                        <div>
                          <h5 className="font-black text-slate-800 text-sm flex items-center gap-2">
                            <span>{st.name}</span>
                            {i === 0 && st.netSales > 0 && (
                              <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                🏆 الأول
                              </span>
                            )}
                          </h5>
                          <p className="text-[11px] text-slate-500">{st.roleName} {st.phone ? `• ${st.phone}` : ''}</p>
                        </div>
                      </div>

                      <div className="text-left">
                        <span className="text-base font-black text-pink-700 font-mono block">
                          {formatMoney(st.netSales, storeInfo?.currency)}
                        </span>
                        <span className="text-[10px] text-emerald-600 font-bold block flex items-center justify-end gap-1">
                          ربح: {formatMoney(st.netProfit, storeInfo?.currency)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-sky-50/70 p-2 rounded-xl border border-sky-100">
                        <span className="text-[10px] text-sky-800 block font-semibold">ساعات العمل</span>
                        <span className="text-xs font-black text-sky-900 font-mono">{st.workDurationFormatted}</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <span className="text-[10px] text-slate-400 block font-semibold">الفواتير</span>
                        <span className="text-xs font-black text-slate-700 font-mono">{st.invoicesCount} ف</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <span className="text-[10px] text-slate-400 block font-semibold">القطع</span>
                        <span className="text-xs font-black text-slate-700 font-mono">{st.itemsSold} ق</span>
                      </div>
                      <div className="bg-purple-50/70 p-2 rounded-xl border border-purple-100">
                        <span className="text-[10px] text-purple-800 block font-semibold">معدل/ساعة</span>
                        <span className="text-xs font-black text-purple-900 font-mono">{st.hasHours ? formatMoney(st.salesPerHour, '') : '—'}</span>
                      </div>
                    </div>

                    <div className="bg-pink-50/50 p-3 rounded-2xl border border-pink-100/60 space-y-1.5">
                      <span className="text-[10px] font-bold text-pink-900 block">طرق الدفع المحصلة:</span>
                      <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                        <div className="bg-white p-1.5 rounded-lg border border-pink-100">
                          <span className="text-slate-400 text-[9px] block">💵 نقدي:</span>
                          <strong className="text-emerald-700">{formatMoney(st.paymentMethods.cash, storeInfo?.currency)}</strong>
                        </div>
                        <div className="bg-white p-1.5 rounded-lg border border-pink-100">
                          <span className="text-slate-400 text-[9px] block">💳 شبكة:</span>
                          <strong className="text-pink-700">{formatMoney(st.paymentMethods.card, storeInfo?.currency)}</strong>
                        </div>
                        <div className="bg-white p-1.5 rounded-lg border border-pink-100">
                          <span className="text-slate-400 text-[9px] block">🌐 أخرى:</span>
                          <strong className="text-blue-700">{formatMoney(st.paymentMethods.transfer + st.paymentMethods.tamara + st.paymentMethods.credit + st.paymentMethods.split + st.paymentMethods.other, storeInfo?.currency)}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 text-slate-600 border-t border-slate-100">
                      <span className="font-bold">
                        {st.shiftsCount === 0 ? (
                          <span className="text-slate-400 text-[10px]">لم يغلق وردية</span>
                        ) : st.shiftsWithVariance === 0 ? (
                          <span className="text-emerald-600 text-xs font-black">مطابق 100% ✅</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {st.cashShortage > 0 && <span className="text-rose-600 font-mono font-black">عجز ({formatMoney(st.cashShortage, storeInfo?.currency)})</span>}
                            {st.cashOverage > 0 && <span className="text-blue-600 font-mono font-black">زيادة (+{formatMoney(st.cashOverage, storeInfo?.currency)})</span>}
                          </div>
                        )}
                      </span>
                      <button
                        onClick={() => setSelectedStaffFilter(st.id)}
                        className="px-3 py-1 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-xl text-xs font-bold shadow-xs hover:opacity-95 transition"
                      >
                        عرض الملف الكامل 🔍
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

        </div>
      )}
    </>
  );
};
