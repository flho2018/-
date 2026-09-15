import { useMemo } from 'react';
import { resolveUserName, calculateInvoicePaymentBreakdown } from './helpers';
import { INITIAL_PAYMENT_METHODS } from './initialData';

/**
 * دالة مشتركة لتصنيف مبيعات الفواتير حسب طرق الدفع
 * تُستخدم في: ShiftHeaderModal, Dashboard, CashDrawerScreen, ReportsScreen
 * لمنع تكرار المنطق وضمان تطابق الأرقام في كل الشاشات
 */
export const classifyInvoicePayments = (invoicesList, configuredMethods) => {
  const methods = (configuredMethods && configuredMethods.length > 0)
    ? configuredMethods
    : INITIAL_PAYMENT_METHODS;

  const breakdown = {};
  methods.forEach(m => {
    if (m.id !== 'split' && m.type !== 'split') {
      breakdown[m.id] = {
        id: m.id,
        name: m.name || m.subtitle || m.id,
        type: m.type || 'card',
        amount: 0,
        count: 0,
        splitCount: 0
      };
    }
  });

  let cashSales = 0;
  let cardSales = 0;
  let creditSales = 0;
  let splitInvoicesCount = 0;

  const record = (methodId, methodType, methodName, amount, isSplit = false) => {
    const amt = Number(amount) || 0;
    if (amt <= 0) return;
    const id = methodId || (methodType === 'cash' ? 'cash' : methodType === 'credit' ? 'credit' : 'card');
    const defaultNames = {
      cash: 'كاش', card: 'شبكة (مدى)', mada: 'مدى', visa: 'فيزا',
      mastercard: 'ماستركارد', applepay: 'أبل باي', stcpay: 'STC Pay',
      transfer: 'تحويل بنكي', tamara: 'تمارا', tabby: 'تابي', credit: 'آجل ذمم عملاء'
    };
    if (!breakdown[id]) {
      breakdown[id] = { id, name: methodName || defaultNames[id] || id, type: methodType || 'card', amount: 0, count: 0, splitCount: 0 };
    }
    breakdown[id].amount += amt;
    breakdown[id].count += 1;
    if (isSplit) breakdown[id].splitCount = (breakdown[id].splitCount || 0) + 1;

    if (id === 'cash' || methodType === 'cash') cashSales += amt;
    else if (id === 'credit' || methodType === 'credit') creditSales += amt;
    else cardSales += amt;
  };

  (invoicesList || []).forEach(inv => {
    const isRefunded = inv.status === 'refunded';
    const tot = Number(inv.total) || 0;
    const isSplitInv = (inv.splitPayments && Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) ||
      inv.paymentMethodType === 'split' || inv.paymentMethod === 'split';
    if (isSplitInv && !isRefunded) splitInvoicesCount++;

    if (inv.splitPayments && Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) {
      inv.splitPayments.forEach(sp => {
        const isCash = sp.methodType === 'cash' || sp.methodId === 'cash';
        if (isCash || !isRefunded) {
          record(sp.methodId, sp.methodType, sp.methodName, sp.amount, true);
        }
      });
    } else if (inv.paymentMethodType === 'split' || inv.paymentMethod === 'split') {
      const sCash = Number(inv.splitCash) || 0;
      const sCard = Number(inv.splitCard) || 0;
      const sCredit = Number(inv.splitCredit) || 0;
      const sTransfer = Number(inv.splitTransfer) || 0;
      if (sCash > 0) record('cash', 'cash', 'كاش', sCash, true);
      if (!isRefunded) {
        if (sCard > 0) record('card', 'card', 'شبكة', sCard, true);
        if (sCredit > 0) record('credit', 'credit', 'آجل', sCredit, true);
        if (sTransfer > 0) record('transfer', 'online', 'تحويل', sTransfer, true);
      }
    } else {
      const isCash = inv.paymentMethodType === 'cash' || inv.paymentMethod === 'cash';
      if (isCash || !isRefunded) {
        record(inv.paymentMethod, inv.paymentMethodType, inv.paymentMethodName, tot, false);
      }
    }
  });

  return { breakdown, cashSales, cardSales, creditSales, splitInvoicesCount };
};

/**
 * فلترة الفواتير حسب الوردية والمستخدم
 * النمط المشترك بين ShiftHeaderModal و Dashboard
 */
export const filterInvoicesByShift = (invoices, shift, targetUid, targetName) => {
  if (!shift || !shift.isOpen) return [];
  const openTime = shift.openedAt ? new Date(shift.openedAt).getTime() : 0;
  return (invoices || []).filter(inv => {
    if (!inv.date) return false;
    if (inv.shiftId && shift.id && inv.shiftId === shift.id) return true;
    const invTime = new Date(inv.date).getTime();
    let isUserMatch = false;
    if (inv.cashierId && inv.cashierId === targetUid) isUserMatch = true;
    else if (inv.userId && inv.userId === targetUid) isUserMatch = true;
    else if (inv.cashier) {
      const invC = String(inv.cashier).trim().toLowerCase();
      const curN = String(targetName).trim().toLowerCase();
      if (invC === curN) isUserMatch = true;
    }
    return invTime >= openTime && isUserMatch;
  });
};

/**
 * فلترة حركات الصندوق حسب الوردية والمستخدم
 */
export const filterDrawerTxByShift = (drawerTransactions, shift, targetUid, targetName) => {
  if (!shift || !shift.isOpen) return [];
  const openTime = shift.openedAt ? new Date(shift.openedAt).getTime() : 0;
  return (drawerTransactions || []).filter(tx => {
    if (!tx.date) return false;
    if (tx.shiftId && shift.id && tx.shiftId === shift.id) return true;
    const txTime = new Date(tx.date).getTime();
    const isUserMatch = (tx.userId && tx.userId === targetUid) || (tx.user === targetName);
    return txTime >= openTime && isUserMatch;
  });
};

/**
 * حساب مرتجعات الكاش للوردية
 */
export const calculateShiftCashRefunds = (invoices, shift, targetUid, targetName) => {
  if (!shift || !shift.isOpen) return 0;
  const openTime = shift.openedAt ? new Date(shift.openedAt).getTime() : 0;
  return (invoices || []).filter(i => {
    if (i.status !== 'refunded') return false;
    if (i.refundShiftId && shift.id && i.refundShiftId === shift.id) return true;
    if (!i.refundedAt) return false;
    const refTime = new Date(i.refundedAt).getTime();
    const isUserMatch = (i.refundedBy === targetName) || (i.refundedBy === targetUid) || (i.refundedByUserId === targetUid);
    return refTime >= openTime && isUserMatch;
  }).reduce((sum, inv) => {
    const b = calculateInvoicePaymentBreakdown(inv);
    return sum + (b.cash || 0);
  }, 0);
};

/**
 * دالة مساعدة للتحقق إذا كان التاريخ هو اليوم
 */
export const isToday = (d) => {
  if (!d) return false;
  const invDate = new Date(d);
  const now = new Date();
  return invDate.getFullYear() === now.getFullYear() &&
         invDate.getMonth() === now.getMonth() &&
         invDate.getDate() === now.getDate();
};

/**
 * Hook مشترك: العثور على الورديات المفتوحة النشطة
 */
export const useActiveShifts = (userShifts, users) => {
  return useMemo(() => {
    const activeUsers = (users || []).filter(u => u && u.isActive !== false);
    const validIds = new Set(activeUsers.map(u => u.id));
    const validNames = new Set(activeUsers.map(u => String(u.name || '').trim().toLowerCase()));

    const shiftsMap = new Map();
    Object.values(userShifts || {}).forEach(s => {
      if (!s || s.isOpen !== true) return;
      const uId = s.userId;
      const cName = String(s.cashierName || '').trim().toLowerCase();
      const resolvedName = resolveUserName(s, users);
      const matchedUser = activeUsers.find(u =>
        u && (u.id === uId || u.id === s.cashierId || resolveUserName(u, users) === resolvedName)
      );
      if (!matchedUser && !((uId && validIds.has(uId)) || (cName && validNames.has(cName)))) return;

      const dedupeKey = matchedUser?.id || uId || cName;
      if (!shiftsMap.has(dedupeKey)) {
        shiftsMap.set(dedupeKey, {
          ...s,
          userId: matchedUser?.id || uId,
          cashierName: matchedUser?.name || s.cashierName
        });
      }
    });
    return Array.from(shiftsMap.values());
  }, [userShifts, users]);
};
