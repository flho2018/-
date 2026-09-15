import React, { useMemo, useState } from 'react';
import { CreditCard, Printer, MessageSquare, Copy, Percent, ShieldCheck } from 'lucide-react';
import { formatMoney, resolvePaymentMethod, buildPaymentBreakdown } from '../../../utils/helpers';
import { printHtmlDirectly } from '../../../utils/printHelper';
import { shareDocument, getPreferredShareFormat, getManagerPhone } from '../../../utils/shareHelper';
import { useApp } from '../../../context/AppContext';

export const PaymentsAndVatTab = ({
  activeReportTab,
  period,
  filteredInvoices,
  filteredExpenses,
  filteredPurchases,
  totalSales,
  totalTax,
  paymentBreakdown: paymentBreakdownProp
}) => {
  const {
    storeInfo,
    drawerTransactions,
    paymentReceipts,
    customers,
    treasuryLedger,
    purchases
  } = useApp();

  const isTaxActive = storeInfo?.taxEnabled !== false;
  const currentTaxRate = isTaxActive ? (Number(storeInfo?.taxRate) || 15) : 0;
  const purchaseTax = (filteredPurchases || []).reduce((sum, p) => sum + (Number(p.taxAmount || p.vatAmount || 0)), 0);
  const netVatPayable = totalTax - purchaseTax;

  // نفس الحساب صار في دالة مشتركة داخل helpers.js وتمرّره شاشة التقارير كـ prop،
  // حتى تستخدمه كل التبويبات بنفس الأرقام (وكان مكرراً هنا فقط).
  const paymentBreakdown = paymentBreakdownProp || buildPaymentBreakdown(filteredInvoices, storeInfo);

  // التاريخ الحالي يُستخدم في تصفية الفترة (اليوم/الشهر) وكان غير معرّف بعد تقسيم الملفات
  const now = new Date();

  const zatcaVatDetails = useMemo(() => {
    const taxableSales = Math.max(0, totalSales - totalTax);
    const outputVat = totalTax;
    const taxablePurchases = Math.max(0, filteredPurchases.reduce((s, p) => s + (Number(p.total) || 0), 0) - purchaseTax);
    const inputVat = purchaseTax;
    const netVatDue = Number((outputVat - inputVat).toFixed(2));
    const isPayable = netVatDue >= 0;

    return {
      taxableSales,
      outputVat,
      totalSalesWithVat: totalSales,
      taxablePurchases,
      inputVat,
      totalPurchasesWithVat: taxablePurchases + inputVat,
      netVatDue: Math.abs(netVatDue),
      isPayable,
      rawNetVatDue: netVatDue
    };
  }, [totalSales, totalTax, filteredPurchases, purchaseTax]);

  const [copyZatcaToast, setCopyZatcaToast] = useState(false);
  const handleCopyZatcaSummary = () => {
    const periodLabel = period === 'today' ? 'اليوم' : period === 'week' ? 'آخر 7 أيام' : period === 'month' ? 'هذا الشهر' : 'كافة الفترات';
    const text = 
`🏛️ ملخص إقرار ضريبة القيمة المضافة (ZATCA) - ${storeInfo?.name || 'بيت الورد'}
الفترة: ${periodLabel} | التاريخ: ${new Date().toLocaleDateString('ar-SA')}
الرقم الضريبي: ${storeInfo?.taxNumber || 'غير محدد'}
==================================================
1. المبيعات الخاضعة للنسبة الأساسية (15%):
   • المبلغ الخاضع للضريبة: ${zatcaVatDetails.taxableSales.toFixed(2)} ${storeInfo?.currency || 'ر.س'}
   • ضريبة المخرجات المحصلة: ${zatcaVatDetails.outputVat.toFixed(2)} ${storeInfo?.currency || 'ر.س'}
   • إجمالي المبيعات شامل الضريبة: ${zatcaVatDetails.totalSalesWithVat.toFixed(2)} ${storeInfo?.currency || 'ر.س'}

2. المشتريات الخاضعة لضريبة القيمة المضافة (15%):
   • المبلغ الخاضع للضريبة: ${zatcaVatDetails.taxablePurchases.toFixed(2)} ${storeInfo?.currency || 'ر.س'}
   • ضريبة المدخلات القابلة للخصم: ${zatcaVatDetails.inputVat.toFixed(2)} ${storeInfo?.currency || 'ر.س'}

3. نتيجة الإقرار النهائي:
   • ${zatcaVatDetails.isPayable ? 'الضريبة المستحقة للسداد للهيئة' : 'رصيد ضريبي مسترد للأعمال'}: ${zatcaVatDetails.netVatDue.toFixed(2)} ${storeInfo?.currency || 'ر.س'}
==================================================
مستخرج آلياً وبدقة من نظام بيت الورد للمطابقة مع بوابة ZATCA`;

    navigator.clipboard.writeText(text).then(() => {
      setCopyZatcaToast(true);
      setTimeout(() => setCopyZatcaToast(false), 3000);
    });
  };

  const handlePrintZatcaVat = () => {
    const periodLabel = period === 'today' ? 'اليوم' : period === 'week' ? 'آخر 7 أيام' : period === 'month' ? 'هذا الشهر' : 'كافة الفترات';
    const html = `
      <div dir="rtl" style="font-family: Cairo, Tahoma, sans-serif; padding: 25px; color: #1e293b; max-width: 800px; margin: 0 auto;">
        <div style="text-align: center; border-bottom: 2px solid #831843; padding-bottom: 15px; margin-bottom: 20px;">
          <h1 style="margin: 0; color: #831843; font-size: 24px;">${storeInfo?.name || 'بيت الورد'}</h1>
          <h2 style="margin: 6px 0 0; font-size: 16px; color: #475569;">إقرار ضريبة القيمة المضافة (ZATCA VAT Return)</h2>
          <p style="margin: 6px 0 0; font-size: 12px; color: #64748b;">
            الرقم الضريبي: ${storeInfo?.taxNumber || 'غير مسجل'} | الفترة: ${periodLabel} | التاريخ: ${new Date().toLocaleDateString('ar-SA')}
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 13px;">
          <thead>
            <tr style="background-color: #fdf2f8; color: #831843; border-bottom: 2px solid #fbcfe8;">
              <th style="padding: 10px; text-align: right;">البند الضريبي</th>
              <th style="padding: 10px; text-align: center;">المبلغ الخاضع للضريبة</th>
              <th style="padding: 10px; text-align: center;">النسبة</th>
              <th style="padding: 10px; text-align: left;">مبلغ الضريبة</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 12px 10px; font-weight: bold;">1. المبيعات الخاضعة للنسبة الأساسية (15%)</td>
              <td style="padding: 12px 10px; text-align: center; font-family: monospace;">${zatcaVatDetails.taxableSales.toFixed(2)} ${storeInfo?.currency || 'ر.س'}</td>
              <td style="padding: 12px 10px; text-align: center;">15%</td>
              <td style="padding: 12px 10px; text-align: left; font-family: monospace; font-weight: bold; color: #9d174d;">${zatcaVatDetails.outputVat.toFixed(2)} ${storeInfo?.currency || 'ر.س'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 12px 10px; font-weight: bold;">2. المشتريات الخاضعة للنسبة الأساسية (15%)</td>
              <td style="padding: 12px 10px; text-align: center; font-family: monospace;">${zatcaVatDetails.taxablePurchases.toFixed(2)} ${storeInfo?.currency || 'ر.س'}</td>
              <td style="padding: 12px 10px; text-align: center;">15%</td>
              <td style="padding: 12px 10px; text-align: left; font-family: monospace; font-weight: bold; color: #1e40af;">${zatcaVatDetails.inputVat.toFixed(2)} ${storeInfo?.currency || 'ر.س'}</td>
            </tr>
            <tr style="background-color: ${zatcaVatDetails.isPayable ? '#fff1f2' : '#f0fdf4'}; font-weight: bold; border-top: 2px solid ${zatcaVatDetails.isPayable ? '#fda4af' : '#86efac'};">
              <td style="padding: 14px 10px; font-size: 14px; color: ${zatcaVatDetails.isPayable ? '#9f1239' : '#166534'};">
                3. صافي الضريبة ${zatcaVatDetails.isPayable ? '(مستحقة السداد للهيئة)' : '(رصيد ضريبي مسترد)'}
              </td>
              <td colspan="2" style="padding: 14px 10px; text-align: center; color: #64748b;">(ضريبة المخرجات - ضريبة المدخلات)</td>
              <td style="padding: 14px 10px; text-align: left; font-family: monospace; font-size: 16px; color: ${zatcaVatDetails.isPayable ? '#9f1239' : '#166534'};">
                ${zatcaVatDetails.netVatDue.toFixed(2)} ${storeInfo?.currency || 'ر.س'}
              </td>
            </tr>
          </tbody>
        </table>

        <div style="border: 1px dashed #cbd5e1; padding: 12px; border-radius: 8px; font-size: 11px; color: #64748b; line-height: 1.6;">
          <strong>إقرار محاسبي:</strong> تم استخراج هذا التقرير آلياً وفقاً لمتطلبات الفوترة وضريبة القيمة المضافة لهيئة الزكاة والضريبة والجمارك (ZATCA)، ومطابق للقيود المسجلة في نظام بيت الورد.
        </div>
      </div>
    `;
    printHtmlDirectly(html, 'إقرار_ضريبة_ZATCA');
  };

  // =========================================================================
  // 🏛️ التسوية المحاسبية والمالية الشاملة لجميع الحسابات ووسائل الدفع
  // =========================================================================
  const financialReconciliation = useMemo(() => {
    let cashSales = 0;
    let cardSales = 0; // شبكة مدى
    let visaSales = 0; // بطاقة ائتمان
    let transferSales = 0; // تحويل بنكي
    let tamaraSales = 0;
    let ninjaSales = 0;
    let creditSales = 0; // آجل ذمم عملاء

    filteredInvoices.forEach(inv => {
      if (inv.splitPayments && Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) {
        inv.splitPayments.forEach(sp => {
          const amt = Number(sp.amount) || 0;
          const res = resolvePaymentMethod(sp.methodId || sp.methodType || sp, storeInfo?.paymentMethods);
          const rName = String(res.name || '').toLowerCase();
          if (res.id === 'cash' || res.type === 'cash' || rName.includes('كاش') || rName.includes('نقد')) cashSales += amt;
          else if (res.id === 'tamara' || rName.includes('تمارا')) tamaraSales += amt;
          else if (res.id === 'ninja' || rName.includes('نينجا')) ninjaSales += amt;
          else if (res.id === 'visa' || rName.includes('فيزا')) visaSales += amt;
          else if (res.id === 'transfer' || res.id === 'bank' || rName.includes('تحويل') || rName.includes('بنك')) transferSales += amt;
          else if (res.id === 'credit' || res.type === 'credit' || rName.includes('آجل') || rName.includes('اجل')) creditSales += amt;
          else if (res.id === 'card' || res.type === 'card' || rName.includes('شبك') || rName.includes('مدى')) cardSales += amt;
          else cardSales += amt;
        });
      } else if (inv.paymentMethod === 'split') {
        if (Number(inv.splitCash) > 0) cashSales += Number(inv.splitCash);
        if (Number(inv.splitCard) > 0) cardSales += Number(inv.splitCard);
        if (Number(inv.splitCredit) > 0) creditSales += Number(inv.splitCredit);
        if (Number(inv.splitTransfer) > 0) transferSales += Number(inv.splitTransfer);
      } else {
        const tot = Number(inv.total) || 0;
        const res = resolvePaymentMethod(inv.paymentMethod || inv, storeInfo?.paymentMethods);
        const rName = String(res.name || '').toLowerCase();
        if (res.id === 'cash' || res.type === 'cash' || rName.includes('كاش') || rName.includes('نقد')) cashSales += tot;
        else if (res.id === 'tamara' || rName.includes('تمارا')) tamaraSales += tot;
        else if (res.id === 'ninja' || rName.includes('نينجا')) ninjaSales += tot;
        else if (res.id === 'visa' || rName.includes('فيزا')) visaSales += tot;
        else if (res.id === 'transfer' || res.id === 'bank' || rName.includes('تحويل') || rName.includes('بنك')) transferSales += tot;
        else if (res.id === 'credit' || res.type === 'credit' || rName.includes('آجل') || rName.includes('اجل')) creditSales += tot;
        else if (res.id === 'card' || res.type === 'card' || rName.includes('شبك') || rName.includes('مدى')) cardSales += tot;
        else cardSales += tot;
      }
    });

    // سدادات وتحصيلات الآجل
    const filteredReceipts = (paymentReceipts || []).filter(rcpt => {
      if (!rcpt.date) return false;
      const rDate = new Date(rcpt.date);
      if (period === 'today') return rDate.toDateString() === now.toDateString();
      if (period === 'week') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return rDate >= sevenDaysAgo;
      }
      if (period === 'month') return rDate.getMonth() === now.getMonth() && rDate.getFullYear() === now.getFullYear();
      return true;
    });

    const cashDebtReceipts = filteredReceipts.filter(r => r.method === 'cash').reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const cardDebtReceipts = filteredReceipts.filter(r => r.method === 'card' || r.method === 'visa' || r.method === 'mada').reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const transferDebtReceipts = filteredReceipts.filter(r => r.method === 'transfer' || r.method === 'bank').reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const bankDebtReceipts = cardDebtReceipts + transferDebtReceipts;
    const totalDebtReceipts = cashDebtReceipts + cardDebtReceipts + transferDebtReceipts;

    // حركات الصندوق
    const filteredDrawerTx = (drawerTransactions || []).filter(tx => {
      if (!tx.date) return false;
      const tDate = new Date(tx.date);
      if (period === 'today') return tDate.toDateString() === now.toDateString();
      if (period === 'week') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return tDate >= sevenDaysAgo;
      }
      if (period === 'month') return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();
      return true;
    });

    const manualCashIn = filteredDrawerTx.filter(tx => tx.type === 'in' && !tx.voucherNo?.startsWith('REC-') && tx.category !== 'سند قبض عميل نقدي').reduce((s, tx) => s + (Number(tx.amount) || 0), 0);
    // حركات المصروف مرجعية للعرض فقط — المصروف يُخصم من قائمة المصروفات،
    // فلو جُمع هنا أيضاً لخُصم مرتين.
    const manualCashOut = filteredDrawerTx.filter(tx => tx.type === 'out' && tx.subType !== 'expense').reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

    // المصروفات
    const drawerExpenses = filteredExpenses.filter(e => e.paymentSource === 'drawer' || (!e.paymentSource && e.paymentMethod === 'cash')).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const bankExpenses = filteredExpenses.filter(e => e.paymentSource === 'bank' || e.paymentMethod === 'bank' || e.paymentMethod === 'transfer' || e.paymentMethod === 'card').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const vaultExpenses = filteredExpenses.filter(e => e.paymentSource === 'manager_vault').reduce((s, e) => s + (Number(e.amount) || 0), 0);

    // صافي الخزينة
    const netCashInflow = cashSales + cashDebtReceipts + manualCashIn;
    const netCashOutflow = drawerExpenses + manualCashOut;
    const netCashBalance = netCashInflow - netCashOutflow;

    // صافي البنك
    const totalBankCardSales = cardSales + visaSales + transferSales;
    const netBankInflow = totalBankCardSales + bankDebtReceipts;
    const netBankOutflow = bankExpenses;
    const netBankBalance = netBankInflow - netBankOutflow;

    // صافي ذمم العملاء
    const totalCustomerDebtsOutstanding = (customers || []).reduce((s, c) => s + (Number(c.balance) || 0), 0);

    // منصات التقسيط والتطبيقات
    const financingAndAppsTotal = tamaraSales + ninjaSales;

    return {
      cashSales,
      cardSales,
      visaSales,
      transferSales,
      tamaraSales,
      ninjaSales,
      creditSales,
      cashDebtReceipts,
      cardDebtReceipts,
      transferDebtReceipts,
      bankDebtReceipts,
      totalDebtReceipts,
      manualCashIn,
      manualCashOut,
      drawerExpenses,
      bankExpenses,
      vaultExpenses,
      netCashInflow,
      netCashOutflow,
      netCashBalance,
      totalBankCardSales,
      netBankInflow,
      netBankOutflow,
      netBankBalance,
      totalCustomerDebtsOutstanding,
      financingAndAppsTotal
    };
  }, [filteredInvoices, paymentReceipts, drawerTransactions, filteredExpenses, customers, period, now]);

  const buildFinancialReconciliationHtml = () => {
    const periodLabel = period === 'today' ? 'اليوم' : period === 'week' ? 'آخر 7 أيام' : period === 'month' ? 'هذا الشهر' : 'كافة الفترات';
    const currency = storeInfo?.currency || 'ر.س';

    const html = `
      <div style="font-family: 'Cairo', sans-serif; direction: rtl; text-align: right; padding: 25px; color: #1e293b; max-width: 900px; margin: 0 auto;">
        <div style="text-align: center; border-bottom: 2px solid #db2777; padding-bottom: 15px; margin-bottom: 20px;">
          <h1 style="margin: 0; color: #831843; font-size: 22px;">🏛️ تقرير التسوية المالية الموحد للحسابات ووسائل الدفع</h1>
          <p style="margin: 5px 0 0 0; color: #475569; font-size: 13px;">${storeInfo?.name || 'بيت الورد للزهور والهدايا'} | الفترة: ${periodLabel} | التاريخ: ${new Date().toLocaleDateString('ar-SA')}</p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px;">
          <!-- 1. الخزينة والصندوق -->
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 15px;">
            <h3 style="margin: 0 0 10px 0; color: #166534; font-size: 15px; border-bottom: 1px solid #bbf7d0; padding-bottom: 5px;">
              💵 حساب الخزينة ودرج النقدية (Cash Treasury)
            </h3>
            <table style="width: 100%; font-size: 12px; line-height: 1.8;">
              <tr><td>مبيعات نقدية (كاش):</td><td style="text-align: left; font-family: monospace; font-weight: bold; color: #15803d;">+${formatMoney(financialReconciliation.cashSales, currency)}</td></tr>
              <tr><td>تحصيلات آجل نقداً (سندات قبض):</td><td style="text-align: left; font-family: monospace; font-weight: bold; color: #15803d;">+${formatMoney(financialReconciliation.cashDebtReceipts, currency)}</td></tr>
              ${financialReconciliation.manualCashIn > 0 ? `<tr><td>إيداعات نقدية للصندوق:</td><td style="text-align: left; font-family: monospace; color: #15803d;">+${formatMoney(financialReconciliation.manualCashIn, currency)}</td></tr>` : ''}
              <tr><td>مصروفات درج الوردية نقداً:</td><td style="text-align: left; font-family: monospace; font-weight: bold; color: #dc2626;">-${formatMoney(financialReconciliation.drawerExpenses, currency)}</td></tr>
              ${financialReconciliation.manualCashOut > 0 ? `<tr><td>مسحوبات الصندوق:</td><td style="text-align: left; font-family: monospace; color: #dc2626;">-${formatMoney(financialReconciliation.manualCashOut, currency)}</td></tr>` : ''}
              <tr style="border-top: 1px dashed #166534; font-weight: bold; font-size: 13px;">
                <td>صافي النقدية بالخزينة:</td>
                <td style="text-align: left; font-family: monospace; color: #166534;">${formatMoney(financialReconciliation.netCashBalance, currency)}</td>
              </tr>
            </table>
          </div>

          <!-- 2. البنك والشبكات -->
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 15px;">
            <h3 style="margin: 0 0 10px 0; color: #1e40af; font-size: 15px; border-bottom: 1px solid #bfdbfe; padding-bottom: 5px;">
              💳 حساب البنك والشبكات (Bank & Cards)
            </h3>
            <table style="width: 100%; font-size: 12px; line-height: 1.8;">
              <tr><td>مبيعات شبكة مدى:</td><td style="text-align: left; font-family: monospace; font-weight: bold; color: #1d4ed8;">+${formatMoney(financialReconciliation.cardSales, currency)}</td></tr>
              <tr><td>مبيعات فيزا وبطاقات ائتمان:</td><td style="text-align: left; font-family: monospace; font-weight: bold; color: #1d4ed8;">+${formatMoney(financialReconciliation.visaSales, currency)}</td></tr>
              <tr><td>تحويلات بنكية مباشرة:</td><td style="text-align: left; font-family: monospace; font-weight: bold; color: #1d4ed8;">+${formatMoney(financialReconciliation.transferSales, currency)}</td></tr>
              ${financialReconciliation.cardDebtReceipts > 0 ? `<tr><td>سدادات آجل (شبكة مدى):</td><td style="text-align: left; font-family: monospace; font-weight: bold; color: #1d4ed8;">+${formatMoney(financialReconciliation.cardDebtReceipts, currency)}</td></tr>` : ''}
              ${financialReconciliation.transferDebtReceipts > 0 ? `<tr><td>سدادات آجل (تحويل بنكي):</td><td style="text-align: left; font-family: monospace; font-weight: bold; color: #0284c7;">+${formatMoney(financialReconciliation.transferDebtReceipts, currency)}</td></tr>` : ''}
              ${(!financialReconciliation.cardDebtReceipts && !financialReconciliation.transferDebtReceipts && financialReconciliation.bankDebtReceipts > 0) ? `<tr><td>سدادات آجل محولة للبنك:</td><td style="text-align: left; font-family: monospace; font-weight: bold; color: #1d4ed8;">+${formatMoney(financialReconciliation.bankDebtReceipts, currency)}</td></tr>` : ''}
              <tr><td>مصروفات مسددة من البنك:</td><td style="text-align: left; font-family: monospace; font-weight: bold; color: #dc2626;">-${formatMoney(financialReconciliation.bankExpenses, currency)}</td></tr>
              <tr style="border-top: 1px dashed #1e40af; font-weight: bold; font-size: 13px;">
                <td>صافي الرصيد المورد للبنك:</td>
                <td style="text-align: left; font-family: monospace; color: #1e40af;">${formatMoney(financialReconciliation.netBankBalance, currency)}</td>
              </tr>
            </table>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px;">
          <!-- 3. ذمم وديون العملاء -->
          <div style="background: #fdf2f8; border: 1px solid #fbcfe8; border-radius: 12px; padding: 15px;">
            <h3 style="margin: 0 0 10px 0; color: #9d174d; font-size: 15px; border-bottom: 1px solid #fbcfe8; padding-bottom: 5px;">
              👥 حساب ذمم وديون العملاء (Receivables)
            </h3>
            <table style="width: 100%; font-size: 12px; line-height: 1.8;">
              <tr><td>مبيعات آجلة صادرة بالفترة:</td><td style="text-align: left; font-family: monospace; font-weight: bold; color: #9d174d;">${formatMoney(financialReconciliation.creditSales, currency)}</td></tr>
              <tr><td>إجمالي التحصيلات وسندات القبض:</td><td style="text-align: left; font-family: monospace; font-weight: bold; color: #15803d;">${formatMoney(financialReconciliation.totalDebtReceipts, currency)}</td></tr>
              <tr style="border-top: 1px dashed #9d174d; font-weight: bold; font-size: 13px;">
                <td>إجمالي الديون القائمة لدى العملاء:</td>
                <td style="text-align: left; font-family: monospace; color: #831843;">${formatMoney(financialReconciliation.totalCustomerDebtsOutstanding, currency)}</td>
              </tr>
            </table>
          </div>

          <!-- 4. منصات التقسيط وتطبيقات التوصيل -->
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 15px;">
            <h3 style="margin: 0 0 10px 0; color: #92400e; font-size: 15px; border-bottom: 1px solid #fde68a; padding-bottom: 5px;">
              ⚡ منصات التقسيط والتطبيقات (Apps & BNPL)
            </h3>
            <table style="width: 100%; font-size: 12px; line-height: 1.8;">
              <tr><td>مبيعات تمارا (تقسيط):</td><td style="text-align: left; font-family: monospace; font-weight: bold; color: #b45309;">${formatMoney(financialReconciliation.tamaraSales, currency)}</td></tr>
              <tr><td>مبيعات تطبيق نينجا:</td><td style="text-align: left; font-family: monospace; font-weight: bold; color: #b45309;">${formatMoney(financialReconciliation.ninjaSales, currency)}</td></tr>
              <tr style="border-top: 1px dashed #92400e; font-weight: bold; font-size: 13px;">
                <td>إجمالي مبيعات التطبيقات:</td>
                <td style="text-align: left; font-family: monospace; color: #92400e;">${formatMoney(financialReconciliation.financingAndAppsTotal, currency)}</td>
              </tr>
            </table>
          </div>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 11px; color: #64748b; text-align: center;">
          تم استخراج تقرير التسوية المالية آلياً وفقاً للمعايير المحاسبية المعتمدة لنظام بيت الورد للمبيعات.
        </div>
      </div>
    `;
    return html;
  };

  const handlePrintFinancialReconciliation = () => printHtmlDirectly(buildFinancialReconciliationHtml(), 'تقرير_التسوية_المالية_الموحد');

  const handleShareFinancialWhatsApp = async () => {
    const waPhone = getManagerPhone(storeInfo);
    const periodLabel = period === 'today' ? 'اليوم' : period === 'week' ? 'آخر 7 أيام' : period === 'month' ? 'هذا الشهر' : 'كافة الفترات';
    const currency = storeInfo?.currency || 'ر.س';

    const msg = `🏛️ *تقرير التسوية المالية الموحد - ${storeInfo?.name || 'بيت الورد'}*\n` +
      `📅 الفترة: ${periodLabel} | التاريخ: ${new Date().toLocaleDateString('ar-SA')}\n` +
      `--------------------------------\n` +
      `💵 *حساب الخزينة ودرج النقدية:*\n` +
      `  • مبيعات كاش: ${formatMoney(financialReconciliation.cashSales, currency)}\n` +
      `  • سدادات آجل نقداً: +${formatMoney(financialReconciliation.cashDebtReceipts, currency)}\n` +
      `  • مصروفات الدرج: -${formatMoney(financialReconciliation.drawerExpenses, currency)}\n` +
      `  • *صافي نقدية الخزينة:* *${formatMoney(financialReconciliation.netCashBalance, currency)}*\n` +
      `--------------------------------\n` +
      `💳 *حساب البنك والشبكات:*\n` +
      `  • مبيعات الشبكة (مدى): ${formatMoney(financialReconciliation.cardSales, currency)}\n` +
      `  • مبيعات فيزا/تحويلات: ${formatMoney(financialReconciliation.visaSales + financialReconciliation.transferSales, currency)}\n` +
      `  • سدادات آجل بنكية: +${formatMoney(financialReconciliation.bankDebtReceipts, currency)}\n` +
      `  • مصروفات البنك: -${formatMoney(financialReconciliation.bankExpenses, currency)}\n` +
      `  • *صافي المورد للبنك:* *${formatMoney(financialReconciliation.netBankBalance, currency)}*\n` +
      `--------------------------------\n` +
      `👥 *حساب ذمم وديون العملاء:*\n` +
      `  • إجمالي الديون القائمة: *${formatMoney(financialReconciliation.totalCustomerDebtsOutstanding, currency)}*\n` +
      `  • سدادات محصلة: ${formatMoney(financialReconciliation.totalDebtReceipts, currency)}\n` +
      `--------------------------------\n` +
      `نظام بيت الورد للمبيعات 🌸`;

    // الصيغة المحفوظة في الإعدادات: صورة / PDF / نص
    const format = getPreferredShareFormat(storeInfo);
    if (format === 'text') {
      const clean = String(waPhone).replace(/[^0-9]/g, '');
      const intl = clean.startsWith('05') ? '966' + clean.slice(1) : clean.startsWith('5') ? '966' + clean : clean;
      const enc = encodeURIComponent(msg);
      window.open(`https://wa.me/${intl}?text=${enc}`, '_blank');
      return;
    }

    const caption =
      `🏛️ تقرير التسوية المالية — ${storeInfo?.name || 'بيت الورد'}\n` +
      `📅 الفترة: ${periodLabel}\n` +
      `(التقرير مرفق ${format === 'pdf' ? 'كملف PDF 📄' : 'كصورة 🖼️'})`;

    await shareDocument({
      format,
      phone: waPhone,
      text: caption,
      html: buildFinancialReconciliationHtml(),
      filename: `تقرير_التسوية_المالية_${periodLabel}`,
      width: 900
    });
  };

  // 👥 تحليل أداء الموظفين والكاشيرات المتكامل والشامل مع ساعات العمل والسرعة والإنتاجية
  return (
    <>
      {activeReportTab === 'payments' && (
        <div className="space-y-4 animate-in fade-in text-xs">
          {/* ترويسة التسوية المالية وأزرار الطباعة والواتساب */}
          <div className="bg-gradient-to-r from-[#2A0845] via-[#200535] to-[#380624] text-white p-5 rounded-3xl shadow-xl border border-pink-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-2xl border border-white/20 shadow-inner">
                🏛️
              </div>
              <div>
                <h3 className="font-black text-sm sm:text-base text-white flex items-center gap-2">
                  <span>التسوية المحاسبية والمالية الشاملة لجميع الحسابات ووسائل الدفع</span>
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-400/30">
                    دقة محاسبية 100% ⚖️
                  </span>
                </h3>
                <p className="text-[11px] text-pink-200/80 mt-0.5">
                  مطابقة تدفقات الخزينة (الكاش)، التحصيلات البنكية والشبكات، ديون العملاء (الآجل)، وتطبيقات التقسيط
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintFinancialReconciliation}
                className="px-4 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 border border-white/20 transition active:scale-95 shadow-xs"
              >
                <Printer className="w-4 h-4 text-pink-300" />
                <span>طباعة كشف التسوية 🖨️</span>
              </button>
              <button
                type="button"
                onClick={handleShareFinancialWhatsApp}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-md"
              >
                <MessageSquare className="w-4 h-4" />
                <span>مشاركة واتساب 💬</span>
              </button>
            </div>
          </div>

          {/* الحسابات المالية الأربعة المتكاملة */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. حساب الخزينة ودرج النقدية */}
            <div className="bg-white rounded-3xl p-5 border border-emerald-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💵</span>
                  <div>
                    <h4 className="font-black text-slate-900 text-xs sm:text-sm">حساب الخزينة ودرج النقدية (Cash Treasury)</h4>
                    <span className="text-[10px] text-emerald-700">النقدية الفعلية ومسؤولية الصندوق</span>
                  </div>
                </div>
                <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200 font-mono">
                  {formatMoney(financialReconciliation.netCashBalance, storeInfo?.currency)}
                </span>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-600">مبيعات نقدية (كاش الفواتير):</span>
                  <strong className="text-emerald-700 font-mono">+{formatMoney(financialReconciliation.cashSales, storeInfo?.currency)}</strong>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-600">سدادات آجل نقداً (سندات قبض للدرج):</span>
                  <strong className="text-emerald-700 font-mono">+{formatMoney(financialReconciliation.cashDebtReceipts, storeInfo?.currency)}</strong>
                </div>
                {financialReconciliation.manualCashIn > 0 && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-600">إيداعات نقدية للصندوق:</span>
                    <strong className="text-emerald-700 font-mono">+{formatMoney(financialReconciliation.manualCashIn, storeInfo?.currency)}</strong>
                  </div>
                )}
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-600">مصروفات درج الوردية نقداً:</span>
                  <strong className="text-rose-600 font-mono">-{formatMoney(financialReconciliation.drawerExpenses, storeInfo?.currency)}</strong>
                </div>
                {financialReconciliation.manualCashOut > 0 && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-600">مسحوبات الصندوق الإدارية:</span>
                    <strong className="text-rose-600 font-mono">-{formatMoney(financialReconciliation.manualCashOut, storeInfo?.currency)}</strong>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200">
                  <strong className="text-emerald-900 text-xs">صافي النقدية المتوقعة بالخزينة:</strong>
                  <strong className="text-emerald-800 font-mono text-sm font-black">{formatMoney(financialReconciliation.netCashBalance, storeInfo?.currency)}</strong>
                </div>
              </div>
            </div>

            {/* 2. حساب البنك والشبكات */}
            <div className="bg-white rounded-3xl p-5 border border-blue-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-blue-100">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💳</span>
                  <div>
                    <h4 className="font-black text-slate-900 text-xs sm:text-sm">حساب البنك والشبكات (Bank & Cards)</h4>
                    <span className="text-[10px] text-blue-700">مدى، فيزا، والحوالات البنكية المباشرة</span>
                  </div>
                </div>
                <span className="text-xs font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-xl border border-blue-200 font-mono">
                  {formatMoney(financialReconciliation.netBankBalance, storeInfo?.currency)}
                </span>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-600">مبيعات شبكة (مدى Mada):</span>
                  <strong className="text-blue-700 font-mono">+{formatMoney(financialReconciliation.cardSales, storeInfo?.currency)}</strong>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-600">مبيعات فيزا وبطاقات ائتمان:</span>
                  <strong className="text-blue-700 font-mono">+{formatMoney(financialReconciliation.visaSales, storeInfo?.currency)}</strong>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-600">تحويلات بنكية مباشرة:</span>
                  <strong className="text-blue-700 font-mono">+{formatMoney(financialReconciliation.transferSales, storeInfo?.currency)}</strong>
                </div>
                {financialReconciliation.cardDebtReceipts > 0 && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-600">سدادات آجل (شبكة مدى):</span>
                    <strong className="text-blue-700 font-mono">+{formatMoney(financialReconciliation.cardDebtReceipts, storeInfo?.currency)}</strong>
                  </div>
                )}
                {financialReconciliation.transferDebtReceipts > 0 && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-600">سدادات آجل (تحويل بنكي مباشر):</span>
                    <strong className="text-cyan-700 font-mono">+{formatMoney(financialReconciliation.transferDebtReceipts, storeInfo?.currency)}</strong>
                  </div>
                )}
                {(!financialReconciliation.cardDebtReceipts && !financialReconciliation.transferDebtReceipts && financialReconciliation.bankDebtReceipts > 0) && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-600">سدادات آجل محولة للبنك:</span>
                    <strong className="text-blue-700 font-mono">+{formatMoney(financialReconciliation.bankDebtReceipts, storeInfo?.currency)}</strong>
                  </div>
                )}
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-600">مصروفات مسددة من البنك:</span>
                  <strong className="text-rose-600 font-mono">-{formatMoney(financialReconciliation.bankExpenses, storeInfo?.currency)}</strong>
                </div>
                <div className="flex justify-between items-center pt-2 bg-blue-50/70 p-2.5 rounded-xl border border-blue-200">
                  <strong className="text-blue-900 text-xs">صافي الرصيد المورد للبنك:</strong>
                  <strong className="text-blue-800 font-mono text-sm font-black">{formatMoney(financialReconciliation.netBankBalance, storeInfo?.currency)}</strong>
                </div>
              </div>
            </div>

            {/* 3. حساب ذمم وديون العملاء */}
            <div className="bg-white rounded-3xl p-5 border border-pink-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-pink-100">
                <div className="flex items-center gap-2">
                  <span className="text-xl">👥</span>
                  <div>
                    <h4 className="font-black text-slate-900 text-xs sm:text-sm">حساب ذمم وديون العملاء (Receivables)</h4>
                    <span className="text-[10px] text-pink-700">الفواتير الآجلة ومتابعة السدادات</span>
                  </div>
                </div>
                <span className="text-xs font-black text-pink-700 bg-pink-50 px-2.5 py-1 rounded-xl border border-pink-200 font-mono">
                  {formatMoney(financialReconciliation.totalCustomerDebtsOutstanding, storeInfo?.currency)}
                </span>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-600">مبيعات آجلة صادرة بالفترة:</span>
                  <strong className="text-pink-700 font-mono">{formatMoney(financialReconciliation.creditSales, storeInfo?.currency)}</strong>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-600">سدادات محصلة نقداً (الخزينة):</span>
                  <strong className="text-emerald-700 font-mono">+{formatMoney(financialReconciliation.cashDebtReceipts, storeInfo?.currency)}</strong>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-600">سدادات محصلة بالبنك / شبكة:</span>
                  <strong className="text-blue-700 font-mono">+{formatMoney(financialReconciliation.bankDebtReceipts, storeInfo?.currency)}</strong>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-600">إجمالي السدادات المحصلة:</span>
                  <strong className="text-emerald-800 font-mono font-black">{formatMoney(financialReconciliation.totalDebtReceipts, storeInfo?.currency)}</strong>
                </div>
                <div className="flex justify-between items-center pt-2 bg-pink-50/70 p-2.5 rounded-xl border border-pink-200">
                  <strong className="text-pink-900 text-xs">إجمالي الديون القائمة لدى العملاء:</strong>
                  <strong className="text-pink-800 font-mono text-sm font-black">{formatMoney(financialReconciliation.totalCustomerDebtsOutstanding, storeInfo?.currency)}</strong>
                </div>
              </div>
            </div>

            {/* 4. منصات التقسيط وتطبيقات التوصيل */}
            <div className="bg-white rounded-3xl p-5 border border-amber-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-amber-100">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚡</span>
                  <div>
                    <h4 className="font-black text-slate-900 text-xs sm:text-sm">منصات التقسيط والتطبيقات (BNPL & Apps)</h4>
                    <span className="text-[10px] text-amber-700">تمارا، نينجا، والمنصات الوسيطة</span>
                  </div>
                </div>
                <span className="text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 font-mono">
                  {formatMoney(financialReconciliation.financingAndAppsTotal, storeInfo?.currency)}
                </span>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-600">مبيعات تمارا (تقسيط Tamara):</span>
                  <strong className="text-amber-700 font-mono">+{formatMoney(financialReconciliation.tamaraSales, storeInfo?.currency)}</strong>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-600">مبيعات تطبيق نينجا (Ninja):</span>
                  <strong className="text-amber-700 font-mono">+{formatMoney(financialReconciliation.ninjaSales, storeInfo?.currency)}</strong>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-600">تطبيقات ومنصات أخرى:</span>
                  <strong className="text-slate-500 font-mono">0.00 {storeInfo?.currency || 'ر.س'}</strong>
                </div>
                <div className="flex justify-between items-center pt-2 bg-amber-50/70 p-2.5 rounded-xl border border-amber-200">
                  <strong className="text-amber-900 text-xs">إجمالي مبيعات منصات التقسيط:</strong>
                  <strong className="text-amber-800 font-mono text-sm font-black">{formatMoney(financialReconciliation.financingAndAppsTotal, storeInfo?.currency)}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* تفصيل كل وسيلة دفع على حدة */}
          <div className="bg-white rounded-3xl p-5 border border-pink-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-pink-50">
              <h4 className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-pink-600" />
                <span>حصر عمليات كل وسيلة دفع تفصيلياً</span>
              </h4>
              <span className="text-xs text-pink-700 font-bold bg-pink-50 px-3 py-1 rounded-xl border border-pink-200">
                {paymentBreakdown.length} وسائل مستخدمة
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {paymentBreakdown.map(method => (
                <div key={method.id} className="p-4 rounded-2xl border-2 border-pink-200/90 bg-gradient-to-br from-pink-50/40 via-white to-pink-50/20 space-y-2.5 shadow-sm hover:shadow-md hover:border-pink-300 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-pink-100/80 flex items-center justify-center text-xl shadow-xs border border-pink-200/50">
                        {method.icon}
                      </div>
                      <div>
                        <strong className="font-black text-slate-900 block text-xs">{method.name}</strong>
                        <span className="text-[10px] text-slate-500 font-mono">النوع: {method.type}</span>
                      </div>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-pink-100 font-black text-pink-800 border border-pink-300 shadow-2xs">
                      {method.percentage}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-pink-200/60">
                    <div>
                      <span className="text-[10px] text-slate-500 block font-black">إجمالي المبالغ</span>
                      <strong className="text-sm sm:text-base font-black text-pink-900 font-mono">{formatMoney(method.amount, storeInfo?.currency)}</strong>
                    </div>
                    <div className="text-left">
                      <span className="text-[10px] text-slate-500 block font-black">عدد العمليات</span>
                      <strong className="text-xs font-black text-slate-800">{method.count} عملية</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. الإقرار الضريبي لهيئة الزكاة والضريبة والجمارك (ZATCA) */}
      {activeReportTab === 'vat' && isTaxActive && (
        <div className="bg-white rounded-3xl p-5 border border-pink-100 shadow-sm space-y-4 animate-in fade-in text-xs">
          <div className="pb-3 border-b border-pink-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <Percent className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-2">
                    <span>خلاصة إقرار ضريبة القيمة المضافة (ZATCA VAT Return Helper)</span>
                    <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold">
                      مطابق لبوابة الزكاة 🏛️
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    البيانات المحاسبية الرسمية لضريبة المخرجات والمدخلات وصافي الضريبة الواجب سدادها
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyZatcaSummary}
                className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl font-black text-xs flex items-center gap-1.5 transition active:scale-95 shadow-2xs"
                title="نسخ ملخص الأرقام لتعبئتها في بوابة هيئة الزكاة"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copyZatcaToast ? 'تم النسخ بنجاح! ✅' : 'نسخ لبوابة الزكاة 📋'}</span>
              </button>

              <button
                type="button"
                onClick={handlePrintZatcaVat}
                className="px-3 py-2 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 text-white rounded-xl font-black text-xs flex items-center gap-1.5 transition active:scale-95 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة الإقرار 🖨️</span>
              </button>
            </div>
          </div>

          {/* 3 بطاقات ملخصة علوية */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-gradient-to-br from-purple-50/90 via-white to-purple-50/40 rounded-2xl border-2 border-purple-300 shadow-sm hover:shadow-md hover:border-purple-400 transition-all space-y-2">
              <div className="flex items-center justify-between text-[11px] text-purple-900 font-black">
                <span>ضريبة مخرجات المبيعات (Output VAT)</span>
                <span className="font-mono bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">15%</span>
              </div>
              <p className="text-xl font-black text-purple-950 font-mono">{formatMoney(zatcaVatDetails.outputVat, storeInfo?.currency)}</p>
              <div className="inline-flex items-center gap-1 text-[10px] text-purple-700 font-bold bg-purple-100/70 px-2 py-0.5 rounded-md">
                <span>المبيعات الخاضعة: {formatMoney(zatcaVatDetails.taxableSales, storeInfo?.currency)}</span>
              </div>
            </div>

            <div className="p-4 bg-gradient-to-br from-blue-50/90 via-white to-sky-50/40 rounded-2xl border-2 border-blue-300 shadow-sm hover:shadow-md hover:border-blue-400 transition-all space-y-2">
              <div className="flex items-center justify-between text-[11px] text-blue-900 font-black">
                <span>ضريبة مدخلات المشتريات (Input VAT)</span>
                <span className="font-mono bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">15%</span>
              </div>
              <p className="text-xl font-black text-blue-950 font-mono">{formatMoney(zatcaVatDetails.inputVat, storeInfo?.currency)}</p>
              <div className="inline-flex items-center gap-1 text-[10px] text-blue-700 font-bold bg-blue-100/70 px-2 py-0.5 rounded-md">
                <span>المشتريات الخاضعة: {formatMoney(zatcaVatDetails.taxablePurchases, storeInfo?.currency)}</span>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border-2 shadow-sm hover:shadow-md transition-all space-y-2 ${
              zatcaVatDetails.isPayable 
                ? 'bg-gradient-to-br from-rose-50/90 via-white to-red-50/40 border-rose-300 hover:border-rose-400 text-rose-950' 
                : 'bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/40 border-emerald-300 hover:border-emerald-400 text-emerald-950'
            }`}>
              <div className="flex items-center justify-between text-[11px] font-black">
                <span>{zatcaVatDetails.isPayable ? 'صافي الضريبة الواجب سدادها' : 'رصيد ضريبي مسترد للأعمال'}</span>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <p className={`text-xl font-black font-mono ${zatcaVatDetails.isPayable ? 'text-rose-700' : 'text-emerald-700'}`}>
                {formatMoney(zatcaVatDetails.netVatDue, storeInfo?.currency)}
              </p>
              <div className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${zatcaVatDetails.isPayable ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                <span>{zatcaVatDetails.isPayable ? 'مستحقة السداد لهيئة الزكاة (ZATCA)' : 'رصيد لصالح المتجر لدى الهيئة'}</span>
              </div>
            </div>
          </div>

          {/* جدول الإقرار الضريبي الرسمي المفصل */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-100 px-3.5 py-2 text-slate-700 font-black text-xs flex items-center justify-between">
              <span>بنود الإقرار الضريبي الرسمي (وفق نموذج الهيئة العامة للزكاة والضريبة والجمارك):</span>
              <span className="text-[10px] text-slate-500 font-mono">الرقم الضريبي: {storeInfo?.taxNumber || 'غير مسجل'}</span>
            </div>

            <div className="divide-y divide-slate-100 font-mono">
              {/* بند 1: المبيعات */}
              <div className="p-3 bg-white hover:bg-purple-50/30 transition flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 font-sans block text-xs">1. المبيعات الخاضعة للنسبة الأساسية (15%)</span>
                  <span className="text-[10px] text-slate-400 font-sans">المبلغ الخاضع للضريبة (قبل الضريبة)</span>
                </div>
                <div className="text-left">
                  <span className="font-black text-slate-900 text-xs block">{formatMoney(zatcaVatDetails.taxableSales, storeInfo?.currency)}</span>
                  <span className="text-[10px] text-purple-700 font-bold">الضريبة: {formatMoney(zatcaVatDetails.outputVat, storeInfo?.currency)}</span>
                </div>
              </div>

              {/* بند 2: إجمالي المبيعات مع الضريبة */}
              <div className="p-3 bg-slate-50/70 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 font-sans block text-xs">2. إجمالي المبيعات شاملاً الضريبة</span>
                  <span className="text-[10px] text-slate-400 font-sans">إجمالي المبالغ المحصلة من الفواتير المعتمدة</span>
                </div>
                <div className="text-left">
                  <span className="font-black text-slate-900 text-xs">{formatMoney(zatcaVatDetails.totalSalesWithVat, storeInfo?.currency)}</span>
                </div>
              </div>

              {/* بند 3: المشتريات */}
              <div className="p-3 bg-white hover:bg-blue-50/30 transition flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 font-sans block text-xs">3. المشتريات الخاضعة للنسبة الأساسية (15%)</span>
                  <span className="text-[10px] text-slate-400 font-sans">فواتير الشراء المدخلة من الموردين المؤهلين</span>
                </div>
                <div className="text-left">
                  <span className="font-black text-slate-900 text-xs block">{formatMoney(zatcaVatDetails.taxablePurchases, storeInfo?.currency)}</span>
                  <span className="text-[10px] text-blue-700 font-bold">ضريبة قابلة للخصم: {formatMoney(zatcaVatDetails.inputVat, storeInfo?.currency)}</span>
                </div>
              </div>

              {/* بند 4: صافي النتيجة */}
              <div className={`p-3.5 flex items-center justify-between font-sans ${
                zatcaVatDetails.isPayable ? 'bg-rose-50/60' : 'bg-emerald-50/60'
              }`}>
                <div>
                  <span className="font-black text-xs block text-slate-900">
                    4. صافي ضريبة القيمة المضافة {zatcaVatDetails.isPayable ? '(واجبة السداد)' : '(رصيد مسترد)'}
                  </span>
                  <span className="text-[10px] text-slate-500">(ضريبة مخرجات المبيعات - ضريبة مدخلات المشتريات)</span>
                </div>
                <div className="text-left font-mono">
                  <span className={`font-black text-sm block ${
                    zatcaVatDetails.isPayable ? 'text-rose-700' : 'text-emerald-700'
                  }`}>
                    {formatMoney(zatcaVatDetails.netVatDue, storeInfo?.currency)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. تقرير تقييم المخزون الحالي */}
    </>
  );
};
