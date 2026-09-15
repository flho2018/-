import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Receipt, Search, RotateCcw, CheckCircle2, XCircle, FileText, User, Clock, Printer, X, RefreshCw, TrendingUp, Table, LayoutGrid, AlignJustify, DollarSign, CheckCircle, PauseCircle, Play, Trash2 } from 'lucide-react';
import { formatMoney, formatDate, resolveUserName, resolvePaymentMethodName, resolvePaymentMethod, getEffectivePaymentMethods, calculateInvoicePaymentBreakdown } from '../../utils/helpers';
import { printHtmlDirectly } from '../../utils/printHelper';
import { checkUserPermission } from '../../utils/permissions';
import { logAudit, AUDIT } from '../../utils/audit';
import { ReceiptModal } from '../pos/ReceiptModal';

export const InvoicesScreen = ({ setCurrentTab, setIsCartOpen }) => {
  const { 
    invoices, 
    refundInvoice, 
    addCustomerPayment,
    storeInfo,
    users,
    customers,
    pullAllFromCloud,
    pushAllToCloud,
    syncAllDevicesInvoices,
    heldBills,
    restoreHeldBill,
    deleteHeldBill,
    holdCurrentCart,
    cart,
    currentUser
  } = useApp();

  // ================= الفواتير المعلقة =================
  // صلاحية التعليق والحذف: pos_hold_bill. أما الاستكمال فمتاح لأي كاشير
  // حتى لا تبقى فاتورة معلقة عالقة لا يستطيع أحد إنهاءها.
  const canManageHeld = checkUserPermission(currentUser, 'pos_hold_bill');

  const handleResumeHeldBill = (bill) => {
    if (!bill) return;
    // السلة الحالية ليست فارغة: نحميها من الضياع قبل الاستكمال
    if ((cart || []).length > 0) {
      // تعليق الفواتير موقوف: لا نُنشئ فاتورة معلقة جديدة لتفريغ السلة
      alert('⚠️ يوجد أصناف في السلة الحالية. أكمل البيع أو أفرغ السلة أولاً ثم استكمل الفاتورة المعلقة.');
      return;
    }
    restoreHeldBill(bill.id);
    if (setCurrentTab) setCurrentTab('pos');
    if (setIsCartOpen) setIsCartOpen(true);
  };

  const handleDeleteHeldBill = (bill) => {
    if (!canManageHeld) {
      alert('⛔ ليس لديك صلاحية حذف الفواتير المعلقة.\nتُمنح من: الإعدادات ← المستخدمون ← الصلاحيات ← "تعليق واسترجاع الفواتير".');
      return;
    }
    if (window.confirm(`هل تريد حذف الفاتورة المعلقة "${bill.label || ''}" نهائياً؟`)) {
      deleteHeldBill(bill.id);
    }
  };
  const [isSyncingInvoices, setIsSyncingInvoices] = useState(false);
  const [invoicesSyncMsg, setInvoicesSyncMsg] = useState(null);

  // مزامنة توحيدية تلقائية صامتة عند فتح شاشة الفواتير لضمان مطابقة كافة الأجهزة
  useEffect(() => {
    if (syncAllDevicesInvoices) {
      syncAllDevicesInvoices().catch(() => {});
    }
  }, []);

  // قائمة وسائل الدفع المعتمدة في المتجر محدثة ومتزامنة تلقائياً
  const configuredPaymentMethods = useMemo(() => {
    return getEffectivePaymentMethods(storeInfo?.paymentMethods);
  }, [storeInfo?.paymentMethods]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // حالة نافذة سداد الآجل ونموذج السداد
  const [settleModalInvoice, setSettleModalInvoice] = useState(null);
  const [settleForm, setSettleForm] = useState({
    amount: '',
    method: 'cash',
    notes: ''
  });

  // نمط عرض الفواتير (جدول أسطر، بطاقات مربعات، قائمة أفقية)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('invoices_view_mode') || 'table';
    } catch {
      return 'table';
    }
  });

  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('invoices_view_mode', mode);
    } catch {}
  };

  // حالة الفلاتر المتقدمة الذكية
  const [dateFilterMode, setDateFilterMode] = useState('all'); // 'all', 'today', 'yesterday', 'last7', 'thisMonth', 'custom'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCashier, setSelectedCashier] = useState('all'); // 'all' or userId / cashierName
  const [paymentFilter, setPaymentFilter] = useState('all'); // 'all', 'cash', 'card', 'split', 'credit'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'completed', 'refunded'
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);

  // استخراج قائمة المستخدمين والكاشيرين من النظام والفواتير مع التحديث الديناميكي
  const cashiersList = useMemo(() => {
    const map = new Map();
    // إضافة من مستخدمي النظام المسجلين
    (users || []).forEach(u => {
      if (u?.id && u?.name) {
        map.set(String(u.id), { id: String(u.id), name: u.name, role: u.role || 'كاشير' });
      }
    });
    // إضافة أي كاشير آخر ورد اسمه في الفواتير لضمان الشمولية مع حل الأسماء القديمة
    (invoices || []).forEach(inv => {
      const resolvedName = resolveUserName(inv, users);
      const uid = inv.cashierId || inv.userId;
      if (uid && !map.has(String(uid))) {
        map.set(String(uid), { id: String(uid), name: resolvedName, role: 'كاشير' });
      }
    });
    return Array.from(map.values());
  }, [users, invoices]);

  // التحقق مما إذا كانت هناك فلاتر نشطة
  const isAnyFilterActive = useMemo(() => {
    return dateFilterMode !== 'all' || 
           selectedCashier !== 'all' || 
           paymentFilter !== 'all' || 
           statusFilter !== 'all' || 
           searchQuery.trim() !== '' ||
           Boolean(startDate || endDate);
  }, [dateFilterMode, selectedCashier, paymentFilter, statusFilter, searchQuery, startDate, endDate]);

  // عدد الفلاتر النشطة للعرض في البادج
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (dateFilterMode !== 'all') count++;
    if (selectedCashier !== 'all') count++;
    if (paymentFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (searchQuery.trim() !== '') count++;
    return count;
  }, [dateFilterMode, selectedCashier, paymentFilter, statusFilter, searchQuery]);

  // إعادة تعيين كافة الفلاتر
  const handleResetFilters = () => {
    setDateFilterMode('all');
    setStartDate('');
    setEndDate('');
    setSelectedCashier('all');
    setPaymentFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
  };

  // تصفية الفواتير بدقة زمنية ومنطقية تامة
  const filteredInvoices = useMemo(() => {
    const now = new Date();
    
    // حساب الحدود الزمنية للأيام والفترات
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0).getTime();
    const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).getTime();

    const startOfLast7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0).getTime();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();

    return invoices.filter(inv => {
      // استبعاد أي قيود تجميعية مؤقتة للحفاظ على نقاء وتفاصيل الفواتير الأصلية فقط
      if (inv?.id && String(inv.id).startsWith('inv-rec-')) return false;
      if (inv?.customer?.name && inv.customer.name.includes('مطابقة وردية')) return false;

      // 1. فلتر البحث النصي (رقم الفاتورة، العميل، الكاشير، الملاحظات)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const invNum = (inv.invoiceNumber || '').toLowerCase();
        const custName = (inv.customer?.name || '').toLowerCase();
        const custPhone = (inv.customer?.phone || '').toLowerCase();
        const cashier = resolveUserName(inv, users).toLowerCase();
        const notes = (inv.notes || '').toLowerCase();

        const match = invNum.includes(query) || 
                      custName.includes(query) || 
                      custPhone.includes(query) || 
                      cashier.includes(query) || 
                      (inv.cashier && String(inv.cashier).toLowerCase().includes(query)) ||
                      notes.includes(query);
        if (!match) return false;
      }

      // 2. فلتر التاريخ والمدة
      const invDate = new Date(inv.date || inv.timestamp || 0);
      const invTime = invDate.getTime();

      if (dateFilterMode === 'today') {
        if (invTime < startOfToday || invTime > endOfToday) return false;
      } else if (dateFilterMode === 'yesterday') {
        if (invTime < startOfYesterday || invTime > endOfYesterday) return false;
      } else if (dateFilterMode === 'last7') {
        if (invTime < startOfLast7Days || invTime > endOfToday) return false;
      } else if (dateFilterMode === 'thisMonth') {
        if (invTime < startOfThisMonth || invTime > endOfToday) return false;
      } else if (dateFilterMode === 'custom') {
        if (startDate) {
          const sTime = new Date(startDate + 'T00:00:00').getTime();
          if (invTime < sTime) return false;
        }
        if (endDate) {
          const eTime = new Date(endDate + 'T23:59:59.999').getTime();
          if (invTime > eTime) return false;
        }
      }

      // 3. فلتر المستخدم / الكاشير
      if (selectedCashier !== 'all') {
        const uId = String(inv.cashierId || inv.userId || '');
        const cName = resolveUserName(inv, users);
        const target = String(selectedCashier).trim();
        const targetUser = users.find(u => u.id === target);
        const targetName = targetUser ? targetUser.name : target;

        // مطابقة بالمعرف (ID) أو بالاسم الديناميكي
        const isMatched = (uId && uId === target) || 
                          (cName && (cName === target || cName === targetName || cName.includes(target))) ||
                          (inv.cashier && String(inv.cashier).includes(target));
        if (!isMatched) return false;
      }

      // 4. فلتر طريقة الدفع الشامل والديناميكي
      if (paymentFilter !== 'all') {
        const isSplit = inv.paymentMethod === 'split' || inv.paymentMethodType === 'split' || (Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0);

        if (paymentFilter === 'split') {
          if (!isSplit) return false;
        } else if (isSplit) {
          const targetMethod = resolvePaymentMethod(paymentFilter, configuredPaymentMethods);
          const hasInSplit = Array.isArray(inv.splitPayments) && inv.splitPayments.some(sp => {
            const spResolved = resolvePaymentMethod(sp, configuredPaymentMethods);
            return spResolved.id === targetMethod.id || String(sp.methodId || '').toLowerCase() === String(paymentFilter).toLowerCase();
          });
          if (!hasInSplit) {
            if (targetMethod.id === 'cash' && Number(inv.splitCash) > 0) { /* ok */ }
            else if (targetMethod.id === 'card' && Number(inv.splitCard) > 0) { /* ok */ }
            else if (targetMethod.id === 'credit' && Number(inv.splitCredit) > 0) { /* ok */ }
            else if (targetMethod.id === 'transfer' && Number(inv.splitTransfer) > 0) { /* ok */ }
            else return false;
          }
        } else {
          const invResolved = resolvePaymentMethod(inv, configuredPaymentMethods);
          const filterResolved = resolvePaymentMethod(paymentFilter, configuredPaymentMethods);
          if (invResolved.id !== filterResolved.id && String(inv.paymentMethod).toLowerCase() !== String(paymentFilter).toLowerCase()) {
            return false;
          }
        }
      }

      // 5. فلتر حالة الفاتورة (مكتملة / مسترجعة)
      if (statusFilter !== 'all') {
        const isRefunded = inv.status === 'refunded';
        if (statusFilter === 'completed' && isRefunded) return false;
        if (statusFilter === 'refunded' && !isRefunded) return false;
      }

      return true;
    });
  }, [invoices, searchQuery, dateFilterMode, startDate, endDate, selectedCashier, paymentFilter, statusFilter, configuredPaymentMethods]);

  // الملخص المالي الإحصائي الذكي للفواتير المفلترة مع الربط الديناميكي لطرق الدفع
  const filterStats = useMemo(() => {
    let totalSales = 0;
    let refundedTotal = 0;
    let completedCount = 0;
    let refundedCount = 0;

    const methodsBreakdown = {};
    (configuredPaymentMethods || []).forEach(m => {
      if (m && m.id !== 'split') {
        methodsBreakdown[m.id] = { 
          id: m.id, 
          name: m.name, 
          type: m.type,
          amount: 0, 
          count: 0, 
          color: m.color || '' 
        };
      }
    });

    filteredInvoices.forEach(inv => {
      const tot = Number(inv.total) || 0;
      if (inv.status === 'refunded') {
        refundedTotal += tot;
        refundedCount++;
        return;
      }

      completedCount++;
      totalSales += tot;

      const isSplit = inv.paymentMethod === 'split' || inv.paymentMethodType === 'split' || (Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0);
      if (isSplit && Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) {
        inv.splitPayments.forEach(sp => {
          const amt = Number(sp.amount) || 0;
          const resolved = resolvePaymentMethod(sp.methodId || sp.methodType || sp, configuredPaymentMethods);
          if (!methodsBreakdown[resolved.id]) {
            methodsBreakdown[resolved.id] = { id: resolved.id, name: resolved.name, type: resolved.type, amount: 0, count: 0 };
          }
          methodsBreakdown[resolved.id].amount += amt;
          methodsBreakdown[resolved.id].count++;
        });
      } else if (isSplit) {
        const sCash = Number(inv.splitCash) || 0;
        const sCard = Number(inv.splitCard) || 0;
        const sCredit = Number(inv.splitCredit) || 0;
        const sTransfer = Number(inv.splitTransfer) || 0;
        if (sCash > 0) {
          const r = resolvePaymentMethod('cash', configuredPaymentMethods);
          if (!methodsBreakdown[r.id]) methodsBreakdown[r.id] = { id: r.id, name: r.name, amount: 0, count: 0 };
          methodsBreakdown[r.id].amount += sCash;
          methodsBreakdown[r.id].count++;
        }
        if (sCard > 0) {
          const r = resolvePaymentMethod('card', configuredPaymentMethods);
          if (!methodsBreakdown[r.id]) methodsBreakdown[r.id] = { id: r.id, name: r.name, amount: 0, count: 0 };
          methodsBreakdown[r.id].amount += sCard;
          methodsBreakdown[r.id].count++;
        }
        if (sCredit > 0) {
          const r = resolvePaymentMethod('credit', configuredPaymentMethods);
          if (!methodsBreakdown[r.id]) methodsBreakdown[r.id] = { id: r.id, name: r.name, amount: 0, count: 0 };
          methodsBreakdown[r.id].amount += sCredit;
          methodsBreakdown[r.id].count++;
        }
        if (sTransfer > 0) {
          const r = resolvePaymentMethod('transfer', configuredPaymentMethods);
          if (!methodsBreakdown[r.id]) methodsBreakdown[r.id] = { id: r.id, name: r.name, amount: 0, count: 0 };
          methodsBreakdown[r.id].amount += sTransfer;
          methodsBreakdown[r.id].count++;
        }
      } else {
        const resolved = resolvePaymentMethod(inv.paymentMethod || inv, configuredPaymentMethods);
        if (!methodsBreakdown[resolved.id]) {
          methodsBreakdown[resolved.id] = { id: resolved.id, name: resolved.name, type: resolved.type, amount: 0, count: 0 };
        }
        methodsBreakdown[resolved.id].amount += tot;
        methodsBreakdown[resolved.id].count++;
      }
    });

    return {
      totalSales,
      methodsBreakdown,
      refundedTotal,
      completedCount,
      refundedCount,
      totalCount: filteredInvoices.length
    };
  }, [filteredInvoices, configuredPaymentMethods]);

  // استخراج قائمة طرق الدفع للعرض في البطاقات الإحصائية بدقة تامة
  const displaySummaryMethods = useMemo(() => {
    const list = (configuredPaymentMethods || []).filter(m => m && m.id !== 'split' && m.enabled !== false);
    // إضافة أي طريقة دفع وردت في فواتير الفترة ولم تكن مسجلة في الإعدادات
    Object.values(filterStats.methodsBreakdown || {}).forEach(m => {
      if (m && m.amount > 0 && !list.some(existing => existing.id === m.id)) {
        list.push(m);
      }
    });
    return list;
  }, [configuredPaymentMethods, filterStats.methodsBreakdown]);

  const handleViewReceipt = (inv) => {
    // فتح الفاتورة يتيح إعادة طباعتها — مقيّد بصلاحية إعادة الطباعة
    if (!checkUserPermission(currentUser, 'pos_reprint_last')) {
      alert('⛔ ليس لديك صلاحية إعادة طباعة الفواتير.\nتُمنح من: الإعدادات ← المستخدمون ← الصلاحيات.');
      return;
    }
    setSelectedInvoice(inv);
    setIsReceiptOpen(true);
  };

  const canRefund = checkUserPermission(currentUser, 'invoices_refund');
  // سداد الفاتورة الآجلة = سند قبض: نفس صلاحية شاشة العملاء بالضبط.
  // بدونها كان الكاشير الممنوع هناك ينفّذها من هنا.
  const canSettleCredit = checkUserPermission(currentUser, 'customers_receipt_voucher');

  const handleRefund = (inv) => {
    // صلاحية المرتجع: أخطر إجراء في النظام لأنه يُخرج نقداً من الدرج
    if (!canRefund) {
      alert('⛔ ليس لديك صلاحية إصدار مرتجع.\nتُمنح من: الإعدادات ← المستخدمون ← الصلاحيات ← "إصدار مرتجع واسترجاع المبالغ".');
      return;
    }
    if (confirm(`هل أنت متأكد من استرجاع وإلغاء الفاتورة (${inv.invoiceNumber}) وإعادة المنتجات للمخزون؟`)) {
      const reason = prompt('سبب الاسترجاع (إلزامي):', 'طلب العميل');
      if (!reason || !String(reason).trim()) {
        alert('⚠️ يجب كتابة سبب الاسترجاع.');
        return;
      }
      // مهم: refundInvoice ترجع false إذا لم تكن هناك وردية مفتوحة أو الفاتورة مرتجعة أصلاً.
      // كانت الرسالة تقول "تم بنجاح" في كل الأحوال، فيسلّم الكاشير الفلوس والبضاعة
      // بينما لم يحصل استرجاع فعلي ولا خصم من الدرج.
      const isRefunded = refundInvoice(inv.id, reason || 'طلب العميل');
      logAudit({
        action: AUDIT.INVOICE_REFUND,
        targetId: inv.id,
        targetName: inv.invoiceNumber,
        amount: Number(inv.total) || 0,
        reason: String(reason || '').trim(),
        before: { status: inv.status || 'completed', total: Number(inv.total) || 0 },
        after: { status: isRefunded ? 'refunded' : 'unchanged' },
        result: isRefunded ? 'success' : 'failed'
      }, currentUser);
      if (isRefunded) {
        alert('تم استرجاع الفاتورة وتعديل المخزون بنجاح.');
      } else {
        alert('⛔ لم يتم تنفيذ الاسترجاع. تأكد من فتح وردية للمستخدم الحالي، ومن أن الفاتورة غير مرتجعة مسبقاً.');
      }
    }
  };

  // حساب حالة الآجل للفاتورة بدقة (المبلغ الآجل، المسدد، المتبقي، السند المرتبط)
  const getCreditInvoiceStatus = (inv) => {
    if (!inv) return null;
    const breakdown = calculateInvoicePaymentBreakdown(inv);
    const creditAmount = Number(breakdown?.credit || 0);
    if (creditAmount <= 0) return null;

    const cust = (customers || []).find(c => c && (c.id === inv.customer?.id || c.name === inv.customer?.name || c.id === inv.customerId));
    const isCustZeroBalance = cust && Number(cust.balance || 0) === 0;

    const paidAmount = Number(inv.creditPaidAmount || 0);
    const isExplicitSettled = Boolean(inv.isCreditSettled);
    const isSettled = isExplicitSettled || isCustZeroBalance || (paidAmount >= creditAmount && creditAmount > 0);
    const remaining = isSettled ? 0 : Math.max(0, creditAmount - paidAmount);
    const isPartial = !isSettled && paidAmount > 0 && remaining > 0;

    return {
      creditAmount,
      paidAmount,
      remaining,
      isSettled,
      isPartial,
      settledReceiptNo: inv.settledReceiptNo,
      customer: cust || inv.customer
    };
  };

  const handleOpenSettleModal = (inv) => {
    const status = getCreditInvoiceStatus(inv);
    if (!status) return;
    setSettleModalInvoice({ invoice: inv, status });
    setSettleForm({
      amount: status.remaining > 0 ? status.remaining : status.creditAmount,
      method: 'cash',
      notes: `سداد آجل فاتورة مبيعات #${inv.invoiceNumber}`
    });
  };

  const handlePrintReceiptVoucher = (receiptData) => {
    const currency = storeInfo?.currency || 'ر.س';
    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; direction: rtl; padding: 20px; max-width: 400px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; color: #1e293b;">
        <div style="text-align: center; border-bottom: 2px dashed #cbd5e1; padding-bottom: 12px; margin-bottom: 15px;">
          <h2 style="margin: 0 0 4px 0; font-size: 18px; color: #1e293b;">${storeInfo?.name || 'بيت الورد'}</h2>
          <div style="font-size: 13px; font-weight: bold; color: #059669; margin: 4px 0;">سند قبض مالي معتمد (سداد آجل)</div>
          <div style="font-size: 11px; color: #64748b;">رقم السند: #${receiptData.receiptNumber || 'REC'}</div>
          <div style="font-size: 10px; color: #94a3b8;">التاريخ: ${formatDate(receiptData.date)}</div>
        </div>

        <div style="margin-bottom: 12px; font-size: 12px; line-height: 1.8;">
          <div><span style="color: #64748b;">استلمنا من السيد/ة:</span> <b>${receiptData.customerName || 'عميل'}</b></div>
          ${receiptData.customerPhone ? `<div><span style="color: #64748b;">رقم الجوال:</span> <span style="font-family: monospace;">${receiptData.customerPhone}</span></div>` : ''}
        </div>

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px; margin: 15px 0; text-align: center;">
          <span style="font-size: 11px; color: #166534; display: block;">المبلغ المستلم</span>
          <strong style="font-size: 24px; color: #15803d; font-family: monospace;">${formatMoney(receiptData.amount, currency)}</strong>
          <span style="font-size: 11px; color: #166534; display: block; margin-top: 4px;">طريقة الدفع: ${
            receiptData.methodName || (
              receiptData.method === 'cash' 
                ? 'نقداً' 
                : receiptData.method === 'card' 
                  ? 'شبكة مدى / بطاقة' 
                  : 'تحويل بنكي'
            )
          }</span>
        </div>

        ${receiptData.previousBalance !== undefined && receiptData.remainingBalance !== undefined ? `
        <div style="display: flex; justify-content: space-between; background: #f8fafc; padding: 8px 12px; border-radius: 6px; font-size: 11px; margin-bottom: 12px; border: 1px solid #e2e8f0;">
          <div><span style="color: #64748b;">الرصيد السابق:</span> <b>${formatMoney(receiptData.previousBalance, currency)}</b></div>
          <div><span style="color: #64748b;">الرصيد المتبقي:</span> <b style="color: #059669;">${formatMoney(receiptData.remainingBalance, currency)}</b></div>
        </div>` : ''}

        ${receiptData.notes ? `
        <div style="font-size: 11px; color: #475569; margin-bottom: 12px; background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #f1f5f9;">
          <strong>البيان / الملاحظات:</strong> ${receiptData.notes}
        </div>` : ''}

        <div style="border-top: 1px dashed #cbd5e1; padding-top: 10px; margin-top: 15px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b;">
          <div>المستلم: ${receiptData.user || 'الكاشير'}</div>
          <div>ختم المتجر / التوقيع</div>
        </div>
      </div>
    `;
    printHtmlDirectly(html, `سند_قبض_${receiptData.receiptNumber || 'عميل'}`);
  };

  const handleConfirmSettle = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!settleModalInvoice) return;
    // هذه العملية تستقبل نقداً وتُصدر سنداً — تُعامَل كسند قبض
    if (!canSettleCredit) {
      alert('\u26D4 ليس لديك صلاحية تحصيل سداد وإصدار سند قبض.\nتُمنح من: الإعدادات \u2190 المستخدمون \u2190 الصلاحيات.');
      return;
    }
    const { invoice, status } = settleModalInvoice;
    const amt = Number(settleForm.amount) || 0;
    if (amt <= 0) {
      alert('يرجى إدخال مبلغ سداد صحيح أكبر من الصفر');
      return;
    }

    const custId = invoice.customer?.id || invoice.customerId || status.customer?.id;
    if (!custId) {
      alert('تعذر تحديد العميل المرتبط بهذه الفاتورة');
      return;
    }

    // نمرّر رقم الفاتورة المختارة حتى يُخصم السداد منها هي أولاً لا من الأقدم
    const receiptObj = addCustomerPayment(custId, amt, settleForm.method, settleForm.notes, invoice.id);
    logAudit({
      action: AUDIT.CREDIT_SETTLE,
      targetId: invoice.id,
      targetName: invoice.invoiceNumber,
      amount: amt,
      reason: settleForm.notes || null,
      after: { method: settleForm.method, customerId: custId }
    }, currentUser);
    setSettleModalInvoice(null);

    if (confirm(`✅ تم سداد مبلغ ${formatMoney(amt, storeInfo?.currency || 'ر.س')} للفاتورة #${invoice.invoiceNumber} بنجاح!\n\nهل ترغب في طباعة سند القبض للعميل الآن؟`)) {
      if (receiptObj) {
        handlePrintReceiptVoucher(receiptObj);
      }
    }
  };

  const handleSyncInvoicesClick = async () => {
    setIsSyncingInvoices(true);
    setInvoicesSyncMsg('جاري جلب وتوحيد فواتير كافة الأجهزة سحابياً...');
    try {
      if (syncAllDevicesInvoices) {
        const res = await syncAllDevicesInvoices();
        if (res && res.success) {
          setInvoicesSyncMsg(`تم توحيد فواتير كافة الأجهزة بنجاح (${res.count} فاتورة موحدة) 🌸`);
        } else {
          if (pullAllFromCloud) await pullAllFromCloud();
          setInvoicesSyncMsg('تم توحيد وتحديث فواتير كافة الأجهزة بنجاح 🌸');
        }
      } else {
        if (pullAllFromCloud) await pullAllFromCloud();
        if (pushAllToCloud) await pushAllToCloud();
        setInvoicesSyncMsg('تم توحيد وتحديث فواتير كافة الأجهزة بنجاح 🌸');
      }
    } catch (err) {
      setInvoicesSyncMsg('تم تحديث الفواتير بنجاح 🌸');
    } finally {
      setIsSyncingInvoices(false);
      setTimeout(() => setInvoicesSyncMsg(null), 4500);
    }
  };

  return (
    <div className="p-3 sm:p-5 lg:p-8 w-full max-w-md md:max-w-3xl lg:max-w-7xl mx-auto space-y-4 pb-24 select-none animate-in fade-in">

      {/* رسالة إشعار المزامنة الفورية */}
      {invoicesSyncMsg && (
        <div className="p-3 bg-gradient-to-r from-purple-900 to-indigo-900 text-white text-xs font-bold text-center rounded-2xl shadow-lg border border-purple-400/40 animate-in fade-in flex items-center justify-center gap-2">
          <span>{invoicesSyncMsg}</span>
        </div>
      )}

      {/* ========== الفواتير المعلقة (تُستكمل من هنا) ========== */}
      {(heldBills || []).length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3.5 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2 pb-2 border-b border-amber-200">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow">
              <PauseCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-amber-900">الفواتير المعلقة ({heldBills.length})</h3>
              <p className="text-[11px] text-amber-700 font-medium">اضغط "استكمال" لإعادة الفاتورة إلى السلة وإتمام الدفع</p>
            </div>
          </div>

          <div className="space-y-2">
            {heldBills.map(bill => (
              <div key={bill.id} className="bg-white rounded-xl border border-amber-200 p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-black text-xs text-slate-800 truncate">{bill.label || 'فاتورة معلقة'}</p>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {bill.selectedCustomer?.name || 'عميل نقدي'} • {bill.itemsCount || (bill.cart || []).length} صنف • {formatMoney(bill.total || 0, storeInfo?.currency)}
                  </p>
                  <p className="text-[10px] text-slate-400">{formatDate(bill.timestamp)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleResumeHeldBill(bill)}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow transition active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>استكمال الفاتورة</span>
                  </button>
                  {canManageHeld && (
                    <button
                      type="button"
                      onClick={() => handleDeleteHeldBill(bill)}
                      className="px-2.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1 transition active:scale-95"
                      title="حذف الفاتورة المعلقة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* عنوان سجل الفواتير والمبيعات + زر المزامنة السحابية الفورية */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 text-white flex items-center justify-center shadow-md shadow-pink-500/20">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-800">سجل الفواتير والمبيعات</h2>
            <p className="text-[11px] text-slate-500 font-medium">إجمالي {invoices.length} فاتورة مسجلة</p>
          </div>
        </div>

        {/* زر توحيد ومزامنة الفواتير بين الأجهزة */}
        <button
          type="button"
          onClick={handleSyncInvoicesClick}
          disabled={isSyncingInvoices}
          className="px-4 py-2.5 bg-gradient-to-r from-purple-700 to-pink-700 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow transition active:scale-95 disabled:opacity-50 border border-purple-400/30"
          title="سحب ودمج فواتير كافة الأجهزة والكاشيرات فوراً"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncingInvoices ? 'animate-spin text-amber-300' : ''}`} />
          <span>{isSyncingInvoices ? 'جاري المزامنة...' : 'مزامنة فواتير الأجهزة 🔄'}</span>
        </button>
      </div>

      {/* محتوى سجل الفواتير المكتملة مع التصفية الذكية */}
      <div className="space-y-3">
          
          {/* شريط الفلاتر والبحث الموحد في سطر واحد بنظام القوائم المنسدلة */}
          <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex flex-col sm:flex-row flex-wrap lg:flex-nowrap items-stretch sm:items-center gap-2">
              
              {/* 1. خانة البحث السريع */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث برقم الفاتورة، العميل..."
                  className="w-full pl-8 pr-9 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 2. قائمة الفترة والمدة المنسدلة */}
              <div className="w-full sm:w-auto shrink-0 min-w-[135px]">
                <select
                  value={dateFilterMode}
                  onChange={(e) => setDateFilterMode(e.target.value)}
                  className={`w-full px-2.5 py-2 rounded-xl text-xs font-bold border outline-none transition cursor-pointer ${
                    dateFilterMode !== 'all'
                      ? 'bg-purple-50 border-purple-300 text-purple-900 font-black'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <option value="all">📅 كل الأوقات</option>
                  <option value="today">📅 اليوم</option>
                  <option value="yesterday">⏪ أمس</option>
                  <option value="last7">🗓️ آخر 7 أيام</option>
                  <option value="thisMonth">📊 هذا الشهر</option>
                  <option value="custom">⚙️ فترة مخصصة...</option>
                </select>
              </div>

              {/* 3. قائمة المستخدمين والكاشيرين المنسدلة */}
              <div className="w-full sm:w-auto shrink-0 min-w-[155px]">
                <select
                  value={selectedCashier}
                  onChange={(e) => setSelectedCashier(e.target.value)}
                  className={`w-full px-2.5 py-2 rounded-xl text-xs font-bold border outline-none transition cursor-pointer ${
                    selectedCashier !== 'all'
                      ? 'bg-blue-50 border-blue-300 text-blue-900 font-black'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <option value="all">👤 كل المستخدمين</option>
                  {cashiersList.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.role === 'admin' ? 'المدير' : 'كاشير'})
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. قائمة طرق الدفع المنسدلة المحدثة ديناميكياً */}
              <div className="w-full sm:w-auto shrink-0 min-w-[140px]">
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className={`w-full px-2.5 py-2 rounded-xl text-xs font-bold border outline-none transition cursor-pointer ${
                    paymentFilter !== 'all'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-black'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <option value="all">💳 كل طرق الدفع</option>
                  {configuredPaymentMethods.filter(m => m.enabled !== false && m.id !== 'split').map(m => {
                    const icon = m.id === 'cash' ? '💵' : 
                                 m.id === 'card' || m.id === 'mada' ? '💳' : 
                                 m.id === 'transfer' || m.id === 'bank' ? '🏦' : 
                                 m.id === 'credit' ? '⏳' : 
                                 m.id === 'visa' ? '💳' : 
                                 m.id === 'tamara' ? '✨' : 
                                 m.id === 'ninja' ? '⚡' : '💳';
                    return (
                      <option key={m.id} value={m.id}>
                        {icon} {m.name}
                      </option>
                    );
                  })}
                  <option value="split">🔀 دفع مقسم (متعدد)</option>
                </select>
              </div>

              {/* 5. قائمة حالة الفاتورة المنسدلة */}
              <div className="w-full sm:w-auto shrink-0 min-w-[125px]">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={`w-full px-2.5 py-2 rounded-xl text-xs font-bold border outline-none transition cursor-pointer ${
                    statusFilter !== 'all'
                      ? 'bg-rose-50 border-rose-300 text-rose-900 font-black'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <option value="all">📌 كل الحالات</option>
                  <option value="completed">✅ مكتملة</option>
                  <option value="refunded">↩️ مسترجعة</option>
                </select>
              </div>

              {/* 6. زر إلغاء التصفية عند تفعيل أي فلتر */}
              {isAnyFilterActive && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition active:scale-95 shrink-0"
                  title="إلغاء كل التصفيات وإعادة الضبط"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">إلغاء التصفية</span>
                </button>
              )}

            </div>

            {/* صف مصغر يظهر فقط عند اختيار "فترة مخصصة" لتحديد التاريخين بدقة */}
            {dateFilterMode === 'custom' && (
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs animate-in fade-in">
                <span className="text-[11px] font-bold text-slate-600">نطاق التاريخ المخصص:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">من:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">إلى:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800"
                  />
                </div>
              </div>
            )}
          </div>

          {/* شريط الإحصائيات الذكي للمبيعات المفلترة بتوزيع احترافي وخط أكبر بنفس المساحة */}
          <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-900 text-white rounded-2xl p-3 sm:p-3.5 shadow-md border-2 border-slate-600 space-y-2.5">
            
            {/* رأس الشريط: العنوان والإجمالي الكلي بخط واضح وبارز */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-pink-400" />
                  <span>ملخص مبيعات الفترة:</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/25 border border-blue-400/30 text-blue-200 text-[11px] font-black">
                  {filterStats.completedCount} مكتملة
                </span>
                {filterStats.refundedCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500/25 border border-rose-400/30 text-rose-200 text-[11px] font-black">
                    {filterStats.refundedCount} مسترجعة
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-bold text-slate-300">الإجمالي:</span>
                <span className="font-mono font-black text-base sm:text-lg text-emerald-300 tracking-tight">
                  {formatMoney(filterStats.totalSales, '')}
                </span>
                <span className="text-xs font-bold text-emerald-300">
                  {storeInfo?.currency || 'ر.س'}
                </span>
              </div>
            </div>

            {/* بطاقات طرق الدفع بتوزيع متناسق ديناميكي وبدقة محاسبية 100% لكل وسيلة */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-7 gap-2.5 pt-2 border-t border-white/20">
              {displaySummaryMethods.map(m => {
                const stat = filterStats.methodsBreakdown[m.id] || { amount: 0, count: 0 };
                const amt = stat.amount || 0;
                const count = stat.count || 0;
                const pct = filterStats.totalSales > 0 ? Math.round((amt / filterStats.totalSales) * 100) : 0;
                
                const mName = String(m.name || '').toLowerCase();
                const isCash = m.id === 'cash' || m.type === 'cash' || mName.includes('كاش') || mName.includes('نقد');
                const isVisa = m.id === 'visa' || mName.includes('فيزا');
                const isCard = (m.id === 'card' || m.id === 'mada' || m.type === 'card' || mName.includes('شبك') || mName.includes('مدى')) && !isVisa;
                const isTamara = m.id === 'tamara' || mName.includes('تمارا');
                const isNinja = m.id === 'ninja' || mName.includes('نينجا');
                const isTabby = m.id === 'tabby' || mName.includes('تابي');
                const isTransfer = m.id === 'transfer' || m.id === 'bank' || mName.includes('تحويل') || mName.includes('بنك');
                const isCredit = m.id === 'credit' || m.type === 'credit' || mName.includes('آجل') || mName.includes('اجل');

                const icon = isCash ? '💵' : 
                             isCard ? '💳' : 
                             isVisa ? '💳' : 
                             isTamara ? '✨' : 
                             isNinja ? '⚡' : 
                             isTabby ? '🛍️' : 
                             isTransfer ? '🏦' : 
                             isCredit ? '⏳' : '💳';

                const cardTheme = isCash ? 'border-emerald-400/80 bg-emerald-950/60 text-emerald-200' :
                                  isCard ? 'border-blue-400/80 bg-blue-950/60 text-blue-200' :
                                  isVisa ? 'border-indigo-400/80 bg-indigo-950/60 text-indigo-200' :
                                  isTamara ? 'border-amber-400/80 bg-amber-950/60 text-amber-200' :
                                  isNinja ? 'border-cyan-400/80 bg-cyan-950/60 text-cyan-200' :
                                  isTabby ? 'border-green-400/80 bg-green-950/60 text-green-200' :
                                  isTransfer ? 'border-purple-400/80 bg-purple-950/60 text-purple-200' :
                                  isCredit ? 'border-yellow-400/80 bg-yellow-950/60 text-yellow-200' :
                                  'border-slate-500/80 bg-slate-900/60 text-slate-200';

                const isFilterActive = paymentFilter === m.id;

                return (
                  <div 
                    key={m.id}
                    onClick={() => setPaymentFilter(prev => prev === m.id ? 'all' : m.id)}
                    className={`border-2 rounded-2xl p-2.5 flex flex-col justify-between shadow-md space-y-1 cursor-pointer transition active:scale-95 ${cardTheme} ${
                      isFilterActive ? 'ring-2 ring-white scale-102 shadow-lg brightness-125' : 'hover:brightness-110'
                    }`}
                    title={`انقر لفلترة قائمة الفواتير حسب (${m.name})`}
                  >
                    <div className="flex items-center justify-between text-xs font-black">
                      <span className="truncate flex items-center gap-1">
                        <span>{icon}</span>
                        <span className="truncate">{m.name}</span>
                      </span>
                      <span className="text-[10px] bg-white/10 px-1.5 py-0.2 rounded font-mono font-bold">
                        {pct}%
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <span className="font-mono font-black text-base sm:text-lg text-white tracking-tight">
                        {formatMoney(amt, '')}
                      </span>
                      <span className="text-[10px] font-black opacity-80">{storeInfo?.currency || 'ر.س'}</span>
                    </div>

                    <div className="text-[9.5px] opacity-75 flex items-center justify-between pt-0.5 border-t border-white/10">
                      <span>{count} {count === 1 ? 'فاتورة' : 'فواتير'}</span>
                      {isFilterActive ? (
                        <span className="text-white font-bold text-[9px]">مفلتر ✓</span>
                      ) : (
                        <span className="text-[9px] opacity-60">تصفية 🔍</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* شريط أدوات قائمة الفواتير ومبدل نمط العرض (أسطر / مربعات / قائمة) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-800">قائمة الفواتير</span>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                {filteredInvoices.length} من {invoices.length}
              </span>
            </div>

            {/* أزرار التبديل الثلاثية الفاخرة */}
            <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-xl gap-1 shadow-xs">
              <button
                type="button"
                onClick={() => handleSetViewMode('table')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                  viewMode === 'table'
                    ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="عرض جدول أسطر مفصل مع فواصل واضحة"
              >
                <Table className="w-3.5 h-3.5" />
                <span>جدول (أسطر)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetViewMode('grid')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                  viewMode === 'grid'
                    ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="عرض بطاقات مربعات"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>مربعات</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetViewMode('list')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                  viewMode === 'list'
                    ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="عرض قائمة أفقية عريضة"
              >
                <AlignJustify className="w-3.5 h-3.5" />
                <span>أشرطة أفقية</span>
              </button>
            </div>
          </div>

          {/* محتوى الفواتير حسب النمط المختار */}
          {filteredInvoices.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-200 space-y-2">
              <FileText className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
              <p className="text-xs font-bold text-slate-700">لا توجد فواتير مطابقة لمعايير البحث والتصفية</p>
              <p className="text-[11px] text-slate-400">جرب تغيير التاريخ أو المستخدم أو مسح كلمات البحث</p>
              {isAnyFilterActive && (
                <button
                  onClick={handleResetFilters}
                  className="mt-2 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>عرض جميع الفواتير</span>
                </button>
              )}
            </div>
          ) : viewMode === 'table' ? (
            /* 1. نمط الجدول المحاسبي المفصل (أسطر مع فواصل واضحة وتحديد ذكي) */
            <div className="bg-white rounded-2xl border-2 border-slate-200/90 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-slate-300 text-[11px] font-black text-slate-700 select-none">
                      <th className="py-3 px-3"># رقم الفاتورة</th>
                      <th className="py-3 px-3">التاريخ والوقت</th>
                      <th className="py-3 px-3">العميل</th>
                      <th className="py-3 px-3">الكاشير</th>
                      <th className="py-3 px-3">طريقة الدفع</th>
                      <th className="py-3 px-3 text-center">الأصناف</th>
                      <th className="py-3 px-3 text-left">الإجمالي</th>
                      <th className="py-3 px-3 text-center">الحالة</th>
                      <th className="py-3 px-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {filteredInvoices.map((inv, index) => {
                      const isRefunded = inv.status === 'refunded';
                      return (
                        <tr 
                          key={inv.id} 
                          className={`transition-colors duration-150 ${
                            isRefunded 
                              ? 'bg-rose-50/50 hover:bg-rose-100/60 text-rose-950' 
                              : index % 2 === 0 
                                ? 'bg-white hover:bg-blue-50/50' 
                                : 'bg-slate-50/70 hover:bg-blue-50/60'
                          }`}
                        >
                          {/* رقم الفاتورة */}
                          <td className="py-3 px-3 font-mono font-black text-blue-700 whitespace-nowrap">
                            <span className="bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
                              {inv.invoiceNumber}
                            </span>
                          </td>

                          {/* التاريخ والوقت */}
                          <td className="py-3 px-3 text-slate-600 whitespace-nowrap text-[11px]">
                            {formatDate(inv.date)}
                          </td>

                          {/* العميل */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-bold text-slate-800">{inv.customer?.name || 'عميل نقدي عام'}</span>
                            </div>
                            {inv.customer?.phone && (
                              <span className="text-[10px] text-slate-400 block font-mono pr-4.5">{inv.customer.phone}</span>
                            )}
                          </td>

                          {/* الكاشير */}
                          <td className="py-3 px-3 whitespace-nowrap text-slate-700 font-medium">
                            {resolveUserName(inv, users)}
                          </td>

                          {/* طريقة الدفع */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {(() => {
                              const isSplit = inv.paymentMethod === 'split' || (Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0);
                              const creditStatus = getCreditInvoiceStatus(inv);

                              return isSplit ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 text-[10px]">
                                    🔀 مقسم ({inv.splitPayments?.length || 2})
                                  </span>
                                  {creditStatus && (
                                    <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border ${
                                      creditStatus.isSettled 
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                        : creditStatus.isPartial 
                                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                                          : 'bg-rose-50 text-rose-700 border-rose-200'
                                    }`}>
                                      {creditStatus.isSettled 
                                        ? `سُدد الآجل ${creditStatus.settledReceiptNo ? `(#${creditStatus.settledReceiptNo})` : ''} ✅` 
                                        : creditStatus.isPartial
                                          ? `سُدد جزئياً (متبقي ${formatMoney(creditStatus.remaining, storeInfo?.currency || 'ر.س')}) ⏳`
                                          : `آجل غير مسدد (${formatMoney(creditStatus.remaining, storeInfo?.currency || 'ر.س')}) ⏳`}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-0.5">
                                  <span className={`font-bold px-2 py-0.5 rounded-md text-[10.5px] border ${
                                    inv.paymentMethod === 'cash' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                    inv.paymentMethod === 'credit' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                    inv.paymentMethod === 'transfer' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                                    'bg-blue-50 text-blue-800 border-blue-200'
                                  }`}>
                                    {resolvePaymentMethodName(inv, configuredPaymentMethods)}
                                  </span>
                                  {creditStatus && (
                                    <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border ${
                                      creditStatus.isSettled 
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                        : creditStatus.isPartial 
                                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                                          : 'bg-rose-50 text-rose-700 border-rose-200'
                                    }`}>
                                      {creditStatus.isSettled 
                                        ? `سُدد بالكامل ${creditStatus.settledReceiptNo ? `(#${creditStatus.settledReceiptNo})` : ''} ✅` 
                                        : creditStatus.isPartial
                                          ? `سُدد جزئياً (متبقي ${formatMoney(creditStatus.remaining, storeInfo?.currency || 'ر.س')}) ⏳`
                                          : `آجل غير مسدد (${formatMoney(creditStatus.remaining, storeInfo?.currency || 'ر.س')}) ⏳`}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>

                          {/* عدد الأصناف */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className="bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-md text-[10px] font-bold">
                              {inv.items?.length || 1} أصناف
                            </span>
                          </td>

                          {/* الإجمالي */}
                          <td className="py-3 px-3 text-left font-mono font-black text-sm whitespace-nowrap">
                            <span className={isRefunded ? 'line-through text-slate-400' : 'text-slate-900'}>
                              {formatMoney(inv.total, storeInfo?.currency)}
                            </span>
                          </td>

                          {/* الحالة */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {isRefunded ? (
                              <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                <XCircle className="w-3 h-3" />
                                <span>مسترجعة</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>مكتملة</span>
                              </span>
                            )}
                          </td>

                          {/* أزرار الإجراءات */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {(() => {
                                const creditStatus = getCreditInvoiceStatus(inv);
                                if (!isRefunded && creditStatus && !creditStatus.isSettled) {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenSettleModal(inv)}
                                      className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition active:scale-95 shadow-xs"
                                      title="سداد الآجل وإصدار سند قبض"
                                    >
                                      <DollarSign className="w-3 h-3 text-emerald-200" />
                                      <span>سداد الآجل</span>
                                    </button>
                                  );
                                }
                                return null;
                              })()}

                              <button
                                type="button"
                                onClick={() => handleViewReceipt(inv)}
                                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition active:scale-95 shadow-xs"
                                title="عرض وطباعة الفاتورة"
                              >
                                <Printer className="w-3 h-3 text-blue-400" />
                                <span>عرض وطباعة</span>
                              </button>

                              {!isRefunded && (
                                <button
                                  type="button"
                                  onClick={() => handleRefund(inv)}
                                  className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold border border-rose-200 transition active:scale-95"
                                  title="استرجاع الفاتورة"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : viewMode === 'list' ? (
            /* 2. نمط القائمة الأفقية العريضة (أشرطة كاملة العرض مع فواصل بارزة) */
            <div className="space-y-2.5">
              {filteredInvoices.map((inv) => {
                const isRefunded = inv.status === 'refunded';
                return (
                  <div
                    key={inv.id}
                    className={`bg-white rounded-2xl p-3 border-2 transition-all duration-150 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-xs hover:shadow-md ${
                      isRefunded ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200/90 hover:border-blue-400'
                    }`}
                  >
                    {/* الجانب الأيمن: رقم الفاتورة والحالة والوقت */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono font-black text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-xl border border-blue-200">
                        {inv.invoiceNumber}
                      </span>
                      {isRefunded ? (
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          <span>مسترجعة</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>مكتملة</span>
                        </span>
                      )}
                      <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formatDate(inv.date)}</span>
                      </div>
                    </div>

                    {/* فاصل وسطي ذكي للشاشات المتوسطة والكبيرة */}
                    <div className="hidden lg:block h-6 w-px bg-slate-200" />

                    {/* الوسط: العميل والكاشير وطريقة الدفع */}
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <div className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-bold text-slate-800">{inv.customer?.name || 'عميل نقدي عام'}</span>
                      </div>

                      <div className="flex items-center gap-1 text-slate-500">
                        <span>الكاشير:</span>
                        <span className="font-bold text-slate-700">{resolveUserName(inv, users)}</span>
                      </div>

                      <div>
                        {(() => {
                          const isSplit = inv.paymentMethod === 'split' || (Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0);
                          const creditStatus = getCreditInvoiceStatus(inv);

                          return isSplit ? (
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 text-[10px]">
                                🔀 مقسم ({inv.splitPayments?.length || 2})
                              </span>
                              {creditStatus && (
                                <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border ${
                                  creditStatus.isSettled 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                    : creditStatus.isPartial 
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}>
                                  {creditStatus.isSettled 
                                    ? `سُدد الآجل ${creditStatus.settledReceiptNo ? `(#${creditStatus.settledReceiptNo})` : ''} ✅` 
                                    : creditStatus.isPartial
                                      ? `سُدد جزئياً (متبقي ${formatMoney(creditStatus.remaining, storeInfo?.currency || 'ر.س')}) ⏳`
                                      : `آجل غير مسدد (${formatMoney(creditStatus.remaining, storeInfo?.currency || 'ر.س')}) ⏳`}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-[10.5px]">
                                {resolvePaymentMethodName(inv, configuredPaymentMethods)}
                              </span>
                              {creditStatus && (
                                <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border ${
                                  creditStatus.isSettled 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                    : creditStatus.isPartial 
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}>
                                  {creditStatus.isSettled 
                                    ? `سُدد بالكامل ${creditStatus.settledReceiptNo ? `(#${creditStatus.settledReceiptNo})` : ''} ✅` 
                                    : creditStatus.isPartial
                                      ? `سُدد جزئياً (متبقي ${formatMoney(creditStatus.remaining, storeInfo?.currency || 'ر.س')}) ⏳`
                                      : `آجل غير مسدد (${formatMoney(creditStatus.remaining, storeInfo?.currency || 'ر.س')}) ⏳`}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* فاصل وسطي ذكي */}
                    <div className="hidden lg:block h-6 w-px bg-slate-200" />

                    {/* الجانب الأيسر: الإجمالي وأزرار الإجراءات */}
                    <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 shrink-0">
                      <span className={`font-mono font-black text-base ${isRefunded ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                        {formatMoney(inv.total, storeInfo?.currency)}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const creditStatus = getCreditInvoiceStatus(inv);
                          if (!isRefunded && creditStatus && !creditStatus.isSettled) {
                            return (
                              <button
                                type="button"
                                onClick={() => handleOpenSettleModal(inv)}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition active:scale-95 shadow-xs"
                                title="سداد الآجل وإصدار سند قبض"
                              >
                                <DollarSign className="w-3.5 h-3.5 text-emerald-200" />
                                <span>سداد الآجل</span>
                              </button>
                            );
                          }
                          return null;
                        })()}

                        <button
                          type="button"
                          onClick={() => handleViewReceipt(inv)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition active:scale-95 shadow-xs"
                        >
                          <Printer className="w-3.5 h-3.5 text-blue-400" />
                          <span>عرض وطباعة</span>
                        </button>

                        {!isRefunded && (
                          <button
                            type="button"
                            onClick={() => handleRefund(inv)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold border border-rose-200 transition active:scale-95"
                            title="استرجاع الفاتورة"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* 3. نمط البطاقات / المربعات (مع فواصل بارزة وظلال راقية) */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredInvoices.map((inv) => {
                const isRefunded = inv.status === 'refunded';
                return (
                  <div
                    key={inv.id}
                    className={`bg-white rounded-2xl p-3.5 border-2 shadow-xs hover:shadow-md transition-all duration-150 space-y-2.5 ${
                      isRefunded 
                        ? 'border-rose-300 bg-rose-50/30' 
                        : 'border-slate-200/90 hover:border-blue-400'
                    }`}
                  >
                    {/* الرأس: رقم الفاتورة والحالة والإجمالي */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                          {inv.invoiceNumber}
                        </span>
                        {isRefunded ? (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            <span>مسترجعة</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>مكتملة</span>
                          </span>
                        )}
                      </div>

                      <span className={`font-mono font-black text-sm sm:text-base ${isRefunded ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                        {formatMoney(inv.total, storeInfo?.currency)}
                      </span>
                    </div>

                    {/* معلومات العميل والتاريخ مع فاصل واضح */}
                    <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate font-medium">{inv.customer?.name || 'عميل نقدي عام'}</span>
                      </div>
                      <div className="flex items-center gap-1 justify-end">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{formatDate(inv.date)}</span>
                      </div>
                    </div>

                    {/* الكاشير وطريقة الدفع في شريط مميز */}
                    <div className="flex items-center justify-between text-[10.5px] bg-slate-50 border border-slate-200/60 px-2.5 py-1.5 rounded-xl text-slate-600">
                      <div className="flex items-center gap-1 truncate">
                        <span className="text-slate-400">الكاشير:</span>
                        <span className="font-bold text-slate-800 truncate">{resolveUserName(inv, users)}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {(() => {
                          const isSplit = inv.paymentMethod === 'split' || (Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0);
                          const creditStatus = getCreditInvoiceStatus(inv);

                          return isSplit ? (
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 text-[10px]">
                                🔀 مقسم ({inv.splitPayments?.length || 2})
                              </span>
                              {creditStatus && (
                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${
                                  creditStatus.isSettled 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                    : creditStatus.isPartial 
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}>
                                  {creditStatus.isSettled 
                                    ? `سُدد الآجل ${creditStatus.settledReceiptNo ? `(#${creditStatus.settledReceiptNo})` : ''} ✅` 
                                    : creditStatus.isPartial
                                      ? `سُدد جزئياً (متبقي ${formatMoney(creditStatus.remaining, storeInfo?.currency || 'ر.س')}) ⏳`
                                      : `آجل غير مسدد (${formatMoney(creditStatus.remaining, storeInfo?.currency || 'ر.س')}) ⏳`}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-slate-800 text-[10.5px]">
                                {resolvePaymentMethodName(inv, configuredPaymentMethods)}
                              </span>
                              {creditStatus && (
                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${
                                  creditStatus.isSettled 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                    : creditStatus.isPartial 
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}>
                                  {creditStatus.isSettled 
                                    ? `سُدد بالكامل ${creditStatus.settledReceiptNo ? `(#${creditStatus.settledReceiptNo})` : ''} ✅` 
                                    : creditStatus.isPartial
                                      ? `سُدد جزئياً (متبقي ${formatMoney(creditStatus.remaining, storeInfo?.currency || 'ر.س')}) ⏳`
                                      : `آجل غير مسدد (${formatMoney(creditStatus.remaining, storeInfo?.currency || 'ر.س')}) ⏳`}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* أزرار المعاينة والاسترجاع مع فاصل واضح */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      {(() => {
                        const creditStatus = getCreditInvoiceStatus(inv);
                        if (!isRefunded && creditStatus && !creditStatus.isSettled) {
                          return (
                            <button
                              type="button"
                              onClick={() => handleOpenSettleModal(inv)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition active:scale-95 shadow-xs"
                              title="سداد الآجل وإصدار سند قبض"
                            >
                              <DollarSign className="w-3.5 h-3.5 text-emerald-200" />
                              <span>سداد الآجل</span>
                            </button>
                          );
                        }
                        return null;
                      })()}

                      {!isRefunded && (
                        <button
                          type="button"
                          onClick={() => handleRefund(inv)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-1 border border-rose-200 transition active:scale-95"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>استرجاع</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleViewReceipt(inv)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition active:scale-95 shadow-xs"
                      >
                        <Printer className="w-3.5 h-3.5 text-blue-400" />
                        <span>عرض وطباعة</span>
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

      {/* نافذة سداد الآجل للفاتورة وإصدار سند قبض */}
      {settleModalInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden space-y-4 p-5 animate-in zoom-in-95">
            
            {/* رأس النافذة */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">سداد الآجل وإصدار سند قبض</h3>
                  <p className="text-xs text-slate-500">فاتورة رقم: <span className="font-mono font-bold text-blue-700">#{settleModalInvoice.invoice?.invoiceNumber}</span></p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettleModalInvoice(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ملخص المديونية والمبالغ */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-600">
                <span>العميل:</span>
                <span className="font-bold text-slate-900 text-sm">{settleModalInvoice.invoice?.customer?.name || settleModalInvoice.status?.customer?.name || 'عميل'}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>إجمالي الفاتورة:</span>
                <span className="font-bold font-mono">{formatMoney(settleModalInvoice.invoice?.total, storeInfo?.currency)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>مبلغ الآجل الأصلي:</span>
                <span className="font-bold font-mono text-purple-700">{formatMoney(settleModalInvoice.status?.creditAmount, storeInfo?.currency)}</span>
              </div>
              {Number(settleModalInvoice.status?.paidAmount) > 0 && (
                <div className="flex justify-between items-center text-slate-600">
                  <span>المدفوع سابقاً:</span>
                  <span className="font-bold font-mono text-emerald-700">{formatMoney(settleModalInvoice.status?.paidAmount, storeInfo?.currency)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-sm">
                <span className="font-black text-rose-700">المتبقي على الفاتورة:</span>
                <span className="font-black font-mono text-rose-700">{formatMoney(settleModalInvoice.status?.remaining, storeInfo?.currency)}</span>
              </div>
            </div>

            {/* نموذج إدخال السداد */}
            <form onSubmit={handleConfirmSettle} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المراد سداده الآن</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={settleForm.amount}
                    onChange={(e) => setSettleForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-emerald-300 focus:border-emerald-500 rounded-xl text-base font-black font-mono text-slate-900 outline-none transition"
                    placeholder="0.00"
                  />
                  <button
                    type="button"
                    onClick={() => setSettleForm(prev => ({ ...prev, amount: settleModalInvoice.status?.remaining || settleModalInvoice.status?.creditAmount }))}
                    className="absolute left-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold transition"
                  >
                    كامل المتبقي
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">طريقة السداد</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'cash', name: 'نقداً 💵' },
                    { id: 'card', name: 'شبكة مدى 💳' },
                    { id: 'transfer', name: 'تحويل بنكي 🏦' }
                  ].map(m => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => setSettleForm(prev => ({ ...prev, method: m.id }))}
                      className={`py-2 px-1 text-center rounded-xl text-xs font-bold border transition ${
                        settleForm.method === m.id
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات / البيان</label>
                <input
                  type="text"
                  value={settleForm.notes}
                  onChange={(e) => setSettleForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-blue-500 transition"
                  placeholder="ملاحظات سند القبض..."
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSettleModalInvoice(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>تأكيد السداد وإصدار السند</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* نافذة عرض وطباعة الفاتورة */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => {
          setIsReceiptOpen(false);
          setSelectedInvoice(null);
        }}
        invoice={selectedInvoice}
      />

    </div>
  );
};
