import React, { useState, useMemo, useEffect } from 'react';
import { Layers, Landmark, Printer, CheckCircle, Filter, User, X, Plus, Minus, Lock, Mail, MessageSquare, RotateCcw } from 'lucide-react';
import { formatMoney, formatDate, resolveUserName, resolvePaymentMethod, getEffectivePaymentMethods, calculateInvoicePaymentBreakdown } from '../../../utils/helpers';
import { printZReportHtml, printTreasuryDropVoucherHtml } from '../../../utils/printHelper';
// DEFAULT_PAYMENT_ICONS و printTreasuryDropVoucherHtml كانا مستخدمين هنا بدون استيراد
// بعد تقسيم شاشة الخزينة إلى ملفات — وهذا سبب تعطّل الشاشة عند فتحها.
import { DEFAULT_PAYMENT_ICONS } from '../../../utils/paymentIcons';
import { useApp } from '../../../context/AppContext';


import { TreasuryDropModal } from '../TreasuryDropModal';

export const CurrentShiftDrawerTab = ({ treasurySummary, isAdmin, setActiveTab }) => {
  const {
    storeInfo,
    activeShift,
    invoices,
    expenses,
    purchases,
    drawerTransactions,
    shiftsHistory,
    openNewShift,
    myPendingFloatTotal,
    closeShift,
    addDrawerMovement,
    updateStoreInfo,
    currentUser,
    users,
    userShifts,
    hasPermission
  } = useApp();

  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState('in'); // 'in' or 'out'
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [isTreasuryDropOpen, setIsTreasuryDropOpen] = useState(false);

  // نوافذ دورة الخزينة والإيداع البنكي
  const [isCloseShiftOpen, setIsCloseShiftOpen] = useState(false);
  const [actualCashCount, setActualCashCount] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [lastClosedReport, setLastClosedReport] = useState(null);
  // البحث عن آخر وردية مغلقة لنفس المستخدم الحالي لاستخراج الرصيد المرحل تلقائياً
  const lastUserClosedShift = useMemo(() => {
    const currentUid = currentUser?.id || 'admin';
    const currentName = currentUser?.name;
    return (shiftsHistory || []).find(s => 
      s.status === 'closed' && (
        (s.userId && s.userId === currentUid) || 
        (s.cashierId && s.cashierId === currentUid) ||
        (s.cashierName && s.cashierName === currentName)
      )
    );
  }, [shiftsHistory, currentUser]);

  const [isOpenShiftModal, setIsOpenShiftModal] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState(() => {
    if (lastUserClosedShift && typeof lastUserClosedShift.actualCash === 'number') {
      return String(lastUserClosedShift.actualCash);
    }
    return String(storeInfo.defaultStartCash ?? storeInfo.fixedOpeningCash ?? '500');
  });

  React.useEffect(() => {
    if (lastUserClosedShift && typeof lastUserClosedShift.actualCash === 'number') {
      setOpeningCashInput(String(lastUserClosedShift.actualCash));
    } else {
      setOpeningCashInput(String(storeInfo.defaultStartCash ?? storeInfo.fixedOpeningCash ?? '500'));
    }
  }, [storeInfo.defaultStartCash, storeInfo.fixedOpeningCash, lastUserClosedShift]);

  // حالات سطر التصفية تحت عرض الحسابات
  const [filterPeriod, setFilterPeriod] = useState('current_shift'); // 'current_shift' | 'today' | 'yesterday' | 'last7days' | 'last30days' | 'custom'
  const [filterCustomDate, setFilterCustomDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterCashierId, setFilterCashierId] = useState('all'); // 'all' or userId
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('all'); // 'all' | 'cash' | 'card' | 'split' | 'credit' | 'transfer'
  const [shiftBeingClosed, setShiftBeingClosed] = useState(null);

  // وسائل الدفع المعتمدة في النظام محدثة ديناميكياً مع دعم أي وسيلة تضاف مستقبلاً
  const [selectedShiftViewId, setSelectedShiftViewId] = useState('store');

  // تحديد الوردية الفعالة المعروضة بدقة وسلاسة
  const configuredPaymentMethods = useMemo(() => {
    return getEffectivePaymentMethods(storeInfo?.paymentMethods);
  }, [storeInfo?.paymentMethods]);

  const isFilterActive = filterPeriod !== 'current_shift' || filterCashierId !== 'all' || filterPaymentMethod !== 'all';
  const handleResetFilters = () => {
    setFilterPeriod('current_shift');
    setFilterCustomDate(new Date().toISOString().split('T')[0]);
    setFilterCashierId('all');
    setFilterPaymentMethod('all');
  };


  // قائمة بكافة الكاشيرات المسجلين لاختيارهم في سطر التصفية
  const availableCashiersList = useMemo(() => {
    const map = new Map();
    (users || []).forEach(u => {
      if (u && u.id && u.name) {
        map.set(u.id, { id: u.id, name: u.name, role: u.role });
      }
    });
    return Array.from(map.values());
  }, [users]);

  // قائمة بكافة الورديات المفتوحة حالياً في المتجر (من جميع الأجهزة والكاشيرات النشطة مع الربط الديناميكي بالاسم ومنع التكرار نهائياً)
  const allOpenShifts = useMemo(() => {
    const activeUsers = (users || []).filter(u => u && u.isActive !== false);
    const shiftsMap = new Map();

    Object.values(userShifts || {}).forEach(s => {
      if (!s || s.isOpen !== true) return;
      const resolvedName = resolveUserName(s, users);
      const matchedUser = activeUsers.find(u => 
        u && (u.id === s.userId || u.id === s.cashierId || resolveUserName(u, users) === resolvedName)
      );
      if (!matchedUser) return;

      const dedupeKey = matchedUser.id;
      if (!shiftsMap.has(dedupeKey)) {
        shiftsMap.set(dedupeKey, {
          ...s,
          userId: matchedUser.id,
          cashierName: matchedUser.name
        });
      }
    });
    return Array.from(shiftsMap.values());
  }, [userShifts, users]);

  // حساب المبيعات اللحظية الحقيقية لليوم لكافة أجهزة المتجر لمطابقة شارة زر إجمالي المتجر
  const storeTodaySales = useMemo(() => {
    const todayStr = new Date().toDateString();
    return (invoices || []).filter(inv => {
      if (!inv.date) return false;
      return new Date(inv.date).toDateString() === todayStr;
    }).reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
  }, [invoices]);

  // حساب المبيعات اللحظية الدقيقة لوردية كاشير معينة لمطابقة الشارة مع البطاقة 100%
  const getShiftLiveSales = (targetShift) => {
    if (!targetShift) return 0;
    const sTime = targetShift.openedAt ? new Date(targetShift.openedAt).getTime() : 0;
    const sUid = targetShift.userId;
    const sName = String(targetShift.cashierName || '').trim().toLowerCase();

    return (invoices || []).filter(inv => {
      if (!inv.date) return false;
      if (inv.shiftId && targetShift.id && inv.shiftId === targetShift.id) return true;
      const invTime = new Date(inv.date).getTime();
      const isMatch = (inv.cashierId && sUid && inv.cashierId === sUid) ||
                      (inv.userId && sUid && inv.userId === sUid) ||
                      (inv.cashier && sName && String(inv.cashier).trim().toLowerCase() === sName);
      return invTime >= sTime && isMatch;
    }).reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
  };

  // نمط عرض الوردية: 'store' (المتجر ككل افتراضياً لإظهار كافة مبيعات اليوم) | 'my' (ورديتي) | أو معرف كاشير معين
  const effectiveShift = useMemo(() => {
    if (selectedShiftViewId === 'my') {
      const myOpen = Object.values(userShifts || {}).find(s => s && s.userId === currentUser?.id && s.isOpen);
      if (myOpen) return myOpen;
      return activeShift;
    }
    if (selectedShiftViewId === 'store') return null; // نمط المتجر الشامل
    if (selectedShiftViewId !== 'auto') {
      const found = Object.values(userShifts || {}).find(s => s && (s.id === selectedShiftViewId || s.userId === selectedShiftViewId));
      if (found) return found;
    }
    // ===================================================================
    //  لا نلتقط وردية كاشير آخر تلقائياً
    // ===================================================================
    //  كان السطر التالي: if (allOpenShifts.length > 0) return allOpenShifts[0];
    //  أي أن المستخدم بلا وردية "يتبنّى" وردية أول كاشير مفتوح — فيراها
    //  كأنها ورديته، وقد يضغط "إغلاق الوردية" فيُغلق وردية زميله ويصدر
    //  تقرير Z باسمه. اختيار وردية غيري يجب أن يكون صريحاً من القائمة.
    if (activeShift?.isOpen && (!currentUser?.id || !activeShift.userId || activeShift.userId === currentUser.id)) {
      return activeShift;
    }
    const myShift = (userShifts && currentUser?.id) ? userShifts[currentUser.id] : null;
    if (myShift && myShift.isOpen === true && !myShift.closedAt) return myShift;
    return activeShift;
  }, [selectedShiftViewId, activeShift, allOpenShifts, userShifts, currentUser?.id]);

  const myOpenShift = useMemo(() => {
    const currentUid = currentUser?.id;
    if (!currentUid) return null;
    const historyList = shiftsHistory || [];
    const isClosedInHist = (shId) => shId && historyList.some(h => h && h.id === shId && (h.status === 'closed' || h.closedAt || h.isOpen === false));

    const myUserShift = userShifts && userShifts[currentUid];
    if (myUserShift && myUserShift.isOpen === true && myUserShift.status !== 'closed' && !myUserShift.closedAt && !isClosedInHist(myUserShift.id)) {
      return myUserShift;
    }
    if (activeShift && activeShift.isOpen === true && activeShift.userId === currentUid && activeShift.status !== 'closed' && !activeShift.closedAt && !isClosedInHist(activeShift.id)) {
      return activeShift;
    }
    return null;
  }, [userShifts, activeShift, currentUser?.id, shiftsHistory]);

  const isStoreMode = selectedShiftViewId === 'store';
  const isShiftDisplayedOpen = isStoreMode 
    ? (allOpenShifts.length > 0 || (invoices || []).some(i => new Date(i.date).toDateString() === new Date().toDateString())) 
    : Boolean(effectiveShift?.isOpen);

  // حساب مبيعات وحركات الكاشير أو المتجر مع دعم سطر التصفية الجديد وتحديث الحسابات فورياً
  const currentShiftMetrics = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    const openTime = effectiveShift?.openedAt ? new Date(effectiveShift.openedAt).getTime() : new Date().setHours(0, 0, 0, 0);
    const targetUid = effectiveShift?.userId;
    const targetName = effectiveShift?.cashierName;

    // دالة فحص النطاق الزمني والتاريخ بحسب سطر التصفية
    const matchPeriod = (dateStr, refOpenTime = openTime) => {
      if (!dateStr) return false;
      const itemDate = new Date(dateStr);
      const itemTs = itemDate.getTime();
      const itemDateStr = itemDate.toDateString();

      if (filterPeriod === 'current_shift') {
        if (isStoreMode) return itemDateStr === todayStr;
        return itemTs >= refOpenTime;
      }
      if (filterPeriod === 'today') return itemDateStr === todayStr;
      if (filterPeriod === 'yesterday') {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        return itemDateStr === y.toDateString();
      }
      if (filterPeriod === 'last7days') {
        return itemTs >= (now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }
      if (filterPeriod === 'last30days') {
        return itemTs >= (now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      if (filterPeriod === 'custom' && filterCustomDate) {
        return itemDate.toISOString().slice(0, 10) === filterCustomDate;
      }
      return true;
    };

    // دالة فحص مطابقة الكاشير بحسب سطر التصفية ونمط العرض
    const matchCashier = (recordUid, recordCashierName) => {
      if (filterCashierId !== 'all') {
        return (recordUid && recordUid === filterCashierId) ||
               (recordCashierName && resolveUserName(recordCashierName, users) === resolveUserName(filterCashierId, users));
      }
      if (isStoreMode) return true;
      let isUserMatch = false;
      if (recordUid && targetUid && recordUid === targetUid) isUserMatch = true;
      else if (recordCashierName && targetName) {
        const invC = String(recordCashierName).trim().toLowerCase();
        const curN = String(targetName).trim().toLowerCase();
        if (invC === curN || resolveUserName(recordCashierName, users) === resolveUserName(targetName, users)) isUserMatch = true;
      }
      return isUserMatch;
    };

    // دالة فحص مطابقة وسيلة الدفع بحسب سطر التصفية
    const matchPaymentFilter = (inv) => {
      if (filterPaymentMethod === 'all') return true;
      if (filterPaymentMethod === 'split') {
        return inv.paymentMethodType === 'split' || 
               inv.paymentMethod === 'split' || 
               (Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0);
      }

      const targetMethod = resolvePaymentMethod(filterPaymentMethod, configuredPaymentMethods);
      const targetId = targetMethod?.id || filterPaymentMethod;

      // 1. فحص إذا كانت الفاتورة مقسمة وتحتوي على وسيلة الدفع المحددة
      if (Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) {
        return inv.splitPayments.some(sp => {
          const spResolved = resolvePaymentMethod(sp, configuredPaymentMethods);
          return spResolved?.id === targetId || sp.methodId === targetId;
        });
      }

      // فحص حقول الدفع المقسم القديمة
      if (targetId === 'cash' && Number(inv.splitCash) > 0) return true;
      if (targetId === 'card' && Number(inv.splitCard) > 0) return true;
      if (targetId === 'credit' && Number(inv.splitCredit) > 0) return true;
      if (targetId === 'transfer' && Number(inv.splitTransfer) > 0) return true;

      // 2. فحص الفاتورة العادية
      const invResolved = resolvePaymentMethod(inv, configuredPaymentMethods);
      return invResolved?.id === targetId || inv.paymentMethod === targetId || inv.paymentMethodType === targetMethod?.type;
    };

    // فلترة الفواتير
    const userInvoices = (invoices || []).filter(inv => {
      if (!inv.date) return false;
      if (!matchPeriod(inv.date, openTime)) return false;
      const uid = inv.cashierId || inv.userId;
      const name = inv.cashier || inv.cashierName;
      if (!matchCashier(uid, name)) return false;
      if (!matchPaymentFilter(inv)) return false;
      return true;
    });

    const paymentMethodsBreakdown = {};
    configuredPaymentMethods.forEach(m => {
      if (m.id !== 'split' && m.type !== 'split') {
        paymentMethodsBreakdown[m.id] = {
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

    const recordLivePayment = (methodId, methodType, methodName, amount, isSplit = false) => {
      const amt = Number(amount) || 0;
      if (amt <= 0) return;
      const resolved = resolvePaymentMethod({ id: methodId, name: methodName, type: methodType }, configuredPaymentMethods);
      const id = resolved.id;
      const name = resolved.name;
      const type = resolved.type || methodType || 'card';

      if (!paymentMethodsBreakdown[id]) {
        paymentMethodsBreakdown[id] = {
          id,
          name,
          type,
          amount: 0,
          count: 0,
          splitCount: 0
        };
      }
      paymentMethodsBreakdown[id].amount += amt;
      paymentMethodsBreakdown[id].count += 1;
      if (isSplit) {
        paymentMethodsBreakdown[id].splitCount = (paymentMethodsBreakdown[id].splitCount || 0) + 1;
      }

      if (id === 'cash' || type === 'cash') cashSales += amt;
      else if (id === 'credit' || type === 'credit') creditSales += amt;
      else cardSales += amt;
    };

    let splitInvoicesCount = 0;
    userInvoices.forEach(inv => {
      const isRefunded = inv.status === 'refunded';
      const tot = Number(inv.total) || 0;
      const isSplitInv = (inv.splitPayments && Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) ||
        inv.paymentMethodType === 'split' || 
        inv.paymentMethod === 'split';
      if (isSplitInv && !isRefunded) splitInvoicesCount++;

      if (inv.splitPayments && Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) {
        inv.splitPayments.forEach(sp => {
          const isCash = sp.methodType === 'cash' || sp.methodId === 'cash';
          // النقد يسجل إجمالياً ثم يُطرح المرتجع من حركة الدرج
          // أما الشبكة والآجل وباقي الطرق فتسجل فقط للفواتير المكتملة لخصم المرتجع فورياً
          if (isCash || !isRefunded) {
            recordLivePayment(sp.methodId, sp.methodType, sp.methodName, sp.amount, true);
          }
        });
      } else if (inv.paymentMethodType === 'split' || inv.paymentMethod === 'split') {
        const sCash = Number(inv.splitCash) || 0;
        const sCard = Number(inv.splitCard) || 0;
        const sCredit = Number(inv.splitCredit) || 0;
        const sTransfer = Number(inv.splitTransfer) || 0;
        if (sCash > 0) recordLivePayment('cash', 'cash', 'كاش', sCash, true);
        if (!isRefunded) {
          if (sCard > 0) recordLivePayment('card', 'card', 'شبكة', sCard, true);
          if (sCredit > 0) recordLivePayment('credit', 'credit', 'آجل', sCredit, true);
          if (sTransfer > 0) recordLivePayment('transfer', 'online', 'تحويل', sTransfer, true);
        }
      } else {
        const isCash = inv.paymentMethodType === 'cash' || inv.paymentMethod === 'cash';
        if (isCash || !isRefunded) {
          recordLivePayment(inv.paymentMethod, inv.paymentMethodType, inv.paymentMethodName, tot, false);
        }
      }
    });

    // حركات الخزينة
    const userDrawerTx = (drawerTransactions || []).filter(tx => {
      if (!tx.date) return false;
      if (!matchPeriod(tx.date, openTime)) return false;
      if (!matchCashier(tx.userId, tx.user)) return false;
      return true;
    });

    // حركات المصروف مرجعية للعرض فقط (تُخصم عبر totalCashExpenses)
    const cashIn = userDrawerTx.filter(t => t.type === 'in' && t.subType !== 'expense' && !t.countedInStartCash && t.status !== 'pending').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    // استبعاد حركات مرتجع المبيعات النقدية من cashOut لأنها تخصم صراحة عبر userCashRefunds
    const cashOut = userDrawerTx.filter(t => (t.type === 'out' || t.type === 'treasury_drop') && t.subType !== 'expense' && t.category !== 'مرتجع مبيعات نقدية').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const treasuryDrops = userDrawerTx.filter(t => t.type === 'treasury_drop').reduce((s, t) => s + (Number(t.amount) || 0), 0);

    // المصروفات والمشتريات خلال الوردية (المصروفة نقداً من درج الكاشير حصراً)
    const userExpenses = (expenses || []).filter(e => {
      if (!e.date || e.isIncome) return false;
      const isDrawerCash = (e.paymentSource === 'drawer' || (!e.paymentSource && e.paymentMethod === 'cash')) && e.paymentMethod === 'cash';
      if (!isDrawerCash) return false;
      if (!matchPeriod(e.date, openTime)) return false;
      if (!matchCashier(e.userId, e.user)) return false;
      return true;
    });

    const userPurchases = (purchases || []).filter(p => {
      if (!p.date) return false;
      const isDrawerCash = (!p.paymentMethod || p.paymentMethod === 'cash') && (p.paymentSource === 'drawer' || !p.paymentSource);
      if (!isDrawerCash) return false;
      if (!matchPeriod(p.date, openTime)) return false;
      if (!matchCashier(p.userId, p.user)) return false;
      return true;
    });

    const totalCashExpenses = userExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalCashPurchases = userPurchases.reduce((s, p) => s + (Number(p.paidAmount ?? p.totalAmount ?? p.total ?? p.amount) || 0), 0);

    // المبالغ النقدية المرتجعة للعملاء من الدرج
    const userCashRefunds = (invoices || []).filter(i => {
      if (i.status !== 'refunded') return false;
      const refDate = i.refundedAt || i.date;
      if (!matchPeriod(refDate, openTime)) return false;
      if (!matchCashier(i.refundedByUserId || i.cashierId, i.refundedBy || i.cashier)) return false;
      return true;
    }).reduce((sum, inv) => {
      const b = calculateInvoicePaymentBreakdown(inv);
      return sum + (b.cash || 0);
    }, 0);

    const startCash = isStoreMode
      ? (allOpenShifts.length > 0
          ? allOpenShifts.reduce((s, sh) => s + (Number(sh.startCash) || 0), 0)
          : Number(storeInfo?.defaultStartCash || 0))
      : (Number(effectiveShift?.startCash) || 0);

    const netCashSales = Math.max(0, cashSales - userCashRefunds);
    const nonCashSales = Object.entries(paymentMethodsBreakdown)
      .filter(([id, m]) => id !== 'cash' && m.type !== 'cash')
      .reduce((s, [, m]) => s + (m.amount || 0), 0);
    const totalSales = netCashSales + nonCashSales;
    const expectedCash = startCash + cashSales - userCashRefunds + cashIn - cashOut - totalCashExpenses - totalCashPurchases;

    // فحص تحصيلات وسداد الآجل (سندات القبض النقدية التي دخلت الدرج)
    const customerPaymentsCash = userDrawerTx
      .filter(t => t.type === 'in' && (t.category === 'سند قبض عميل نقدي' || (t.reason && (t.reason.includes('سند قبض') || t.reason.includes('سداد آجل')))))
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    const remainingCredit = Math.max(0, creditSales - customerPaymentsCash);
    const isCreditFullySettled = creditSales > 0 && customerPaymentsCash >= creditSales;

    return {
      paymentMethodsBreakdown,
      cashSales,
      cardSales,
      creditSales,
      customerPaymentsCash,
      remainingCredit,
      isCreditFullySettled,
      totalSales,
      cashRefunds: userCashRefunds,
      cashIn,
      cashOut,
      startCash,
      totalExpenses: totalCashExpenses,
      totalPurchases: totalCashPurchases,
      treasuryDrops,
      expectedCash,
      invoicesCount: userInvoices.filter(i => i.status !== 'refunded').length,
      splitInvoicesCount,
      paymentOperationsCount: Object.values(paymentMethodsBreakdown).reduce((s, m) => s + (m.count || 0), 0)
    };
  }, [effectiveShift, isStoreMode, allOpenShifts, currentUser, users, invoices, drawerTransactions, expenses, purchases, storeInfo, filterPeriod, filterCustomDate, filterCashierId, filterPaymentMethod, configuredPaymentMethods]);

  // حساب نقدية الدرج الحالية المتوقعة
  const expectedCash = currentShiftMetrics.expectedCash;
  const totalSales = currentShiftMetrics.totalSales;

  // تفصيل كافة وسائل الدفع بالوردية مع الشمولية والمرونة لوسائل الدفع المستقبلية
  const allShiftPaymentMethods = useMemo(() => {
    const breakdown = currentShiftMetrics?.paymentMethodsBreakdown || {};
    const list = [];
    const seenIds = new Set();

    // 1. إضافة كافة وسائل الدفع المعرفة والمفعلة بالنظام لضمان ظهورها ومرونتها
    (configuredPaymentMethods || []).forEach(m => {
      if (m.enabled !== false && m.id !== 'split') {
        const bd = breakdown[m.id] || {};
        list.push({
          id: m.id,
          name: m.name,
          type: m.type,
          image: DEFAULT_PAYMENT_ICONS[m.id] || m.image || '',
          amount: Number(bd.amount) || 0,
          count: Number(bd.count) || 0,
          splitCount: Number(bd.splitCount) || 0,
          enabled: true
        });
        seenIds.add(m.id);
      }
    });

    // 2. إضافة أي وسيلة دفع أخرى غير مفعلة ولكن لها مبيعات في الوردية
    Object.values(breakdown).forEach(bd => {
      if (!seenIds.has(bd.id) && Number(bd.amount) > 0) {
        const resolved = resolvePaymentMethod(bd, configuredPaymentMethods);
        list.push({
          id: bd.id,
          name: resolved.name || bd.name,
          type: resolved.type || bd.type,
          image: DEFAULT_PAYMENT_ICONS[bd.id] || resolved.image || '',
          amount: Number(bd.amount) || 0,
          count: Number(bd.count) || 0,
          splitCount: Number(bd.splitCount) || 0,
          enabled: false
        });
        seenIds.add(bd.id);
      }
    });

    return list;
  }, [currentShiftMetrics, configuredPaymentMethods]);

  // تفصيل وسائل الدفع التي تم التحصيل الفعلي بها
  const activeShiftPaymentMethods = useMemo(() => {
    return allShiftPaymentMethods.filter(m => Number(m.amount) > 0);
  }, [allShiftPaymentMethods]);

  const handleOpenMovementModal = (type) => {
    if (!hasPermission('drawer_cash_movement')) {
      alert('⛔ ليس لديك صلاحية للسحب أو الإيداع اليدوي في الخزينة!');
      return;
    }
    setMovementType(type);
    setMovementAmount('');
    setMovementReason('');
    setIsMovementModalOpen(true);
  };

  const handleSaveMovement = (e) => {
    e.preventDefault();
    const amt = Number(movementAmount) || 0;
    if (amt <= 0) return;

    addDrawerMovement({
      type: movementType,
      amount: amt,
      reason: movementReason || (movementType === 'in' ? 'إيداع نقدي بالخزينة' : 'سحب نقدي من الخزينة')
    });

    setIsMovementModalOpen(false);
    setMovementAmount('');
    setMovementReason('');
  };

  const handleOpenCloseShiftModal = (targetShift = null) => {
    if (!hasPermission('drawer_open_close')) {
      alert('⛔ ليس لديك صلاحية لإغلاق الوردية وإصدار تقرير Z!');
      return;
    }
    // الوردية المستهدفة: إمّا مُمرَّرة صراحةً (اختارها المدير من القائمة)
    // أو ورديتي أنا. لا التقاط تلقائي لوردية غيري.
    const shift = targetShift || effectiveShift || activeShift;
    if (!shift || shift.isOpen !== true) {
      alert('⚠️ لا توجد وردية مفتوحة لإغلاقها.\nاختر الوردية المطلوبة من قائمة الحسابات أعلى الشاشة.');
      return;
    }
    const isMine = !currentUser?.id || !shift.userId || shift.userId === currentUser.id;
    if (!isMine) {
      const isManager = currentUser?.role === 'admin' || hasPermission('drawer_manage');
      if (!isManager) {
        alert('⛔ لا يمكنك إغلاق وردية كاشير آخر.');
        return;
      }
      const ok = window.confirm(
        `تنبيه: هذه وردية (${shift.cashierName || 'كاشير آخر'}) وليست ورديتك.\n\n` +
        `سيُصدَر تقرير Z باسمه وتُقفل عهدته. متأكد من المتابعة؟`
      );
      if (!ok) return;
    }
    setShiftBeingClosed(shift);
    setActualCashCount(String(expectedCash));
    setCloseNotes('');
    setIsCloseShiftOpen(true);
  };

  const handleConfirmCloseShift = (e) => {
    e.preventDefault();
    const actual = Number(actualCashCount) || 0;
    const shiftToClose = shiftBeingClosed || effectiveShift || activeShift;
    if (!shiftToClose || shiftToClose.isOpen !== true) {
      alert('⚠️ لم تُحدَّد وردية مفتوحة للإغلاق.');
      return;
    }
    const closed = closeShift(actual, closeNotes, shiftToClose);
    setLastClosedReport(closed);
    setIsCloseShiftOpen(false);
    setShiftBeingClosed(null);
  };


  // العهدة المُسلّمة هي الرصيد الافتتاحي المثبَّت — نعرضها في الحقل مباشرة
  useEffect(() => {
    if (myPendingFloatTotal > 0) setOpeningCashInput(String(myPendingFloatTotal));
  }, [myPendingFloatTotal]);

  const handleOpenNewShiftClick = () => {
    if (!hasPermission('drawer_open_close')) {
      alert('⛔ ليس لديك صلاحية لفتح وردية جديدة!');
      return;
    }
    if (myOpenShift) {
      openNewShift(0);
      return;
    }
    const defaultRollover = (lastUserClosedShift && typeof lastUserClosedShift.actualCash === 'number')
      ? String(lastUserClosedShift.actualCash)
      : String(storeInfo?.defaultStartCash ?? storeInfo?.fixedOpeningCash ?? 0);
    setOpeningCashInput(defaultRollover);
    setIsOpenShiftModal(true);
  };

  const handleConfirmOpenShift = (e) => {
    e.preventDefault();
    openNewShift(Number(openingCashInput) || 0);
    setIsOpenShiftModal(false);
    setLastClosedReport(null);
  };

  const handlePrintZReport = (report) => {
    const target = report || lastClosedReport || activeShift;
    if (target) {
      try {
        printZReportHtml(target, storeInfo, users);
      } catch (err) {
        console.error('Print Z-Report Error:', err);
        window.print();
      }
    } else {
      window.print();
    }
  };


  return (
    <>
        <div className="space-y-4">

          {/* لوحة تحكم المدير لتثبيت وضبط رصيد الخزينة الافتتاحي */}
          {currentUser?.role === 'admin' && (
            <div className="p-4 bg-gradient-to-r from-amber-50 via-orange-50 to-pink-50 rounded-3xl border border-amber-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-cairo">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-900 flex items-center justify-center text-lg font-black border border-amber-300">
                  💎
                </div>
                <div>
                  <h4 className="font-black text-amber-950 text-xs sm:text-sm flex items-center gap-1.5">
                    <span>رصيد الخزينة الافتتاحي المثبت (تحديد وقفل المدير)</span>
                    <span className="bg-amber-200 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-md">خاص بالمدير 👑</span>
                  </h4>
                  <p className="text-[11px] text-amber-800/80">تحديد العهدة الافتتاحية الثابتة التي تبدأ بها كل وردية كاشير جديدة</p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-1 bg-white px-3 py-1.5 rounded-xl border border-amber-300 shadow-xs">
                  <span className="text-slate-500 font-bold text-[11px]">المبلغ:</span>
                  <input
                    type="number"
                    step="any"
                    value={storeInfo.defaultStartCash ?? storeInfo.fixedOpeningCash ?? 500}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      updateStoreInfo({ ...storeInfo, defaultStartCash: val, fixedOpeningCash: val });
                    }}
                    className="w-20 font-black text-slate-900 font-mono text-center outline-none bg-transparent"
                  />
                  <span className="font-bold text-[10px] text-amber-700">{storeInfo.currency || 'ر.س'}</span>
                </div>

                <label className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-xl border border-amber-300 cursor-pointer shadow-xs">
                  <input
                    type="checkbox"
                    checked={storeInfo.lockOpeningCash !== false}
                    onChange={(e) => updateStoreInfo({ ...storeInfo, lockOpeningCash: e.target.checked })}
                    className="w-4 h-4 text-amber-600 rounded"
                  />
                  <span className="font-black text-amber-950 text-[11px]">🔒 تثبيت وقفل على الكاشير</span>
                </label>
              </div>
            </div>
          )}
          
          {/* شريط اختيار عرض الوردية (بين كافة الأجهزة أو كاشير معين) */}
          {(isAdmin || allOpenShifts.length > 0 || (invoices && invoices.length > 0)) && (
            <div className="p-2 bg-slate-100/95 rounded-2xl flex items-center gap-1.5 flex-wrap border border-slate-200 shadow-xs">
              <span className="text-[11px] font-black text-slate-700 px-1.5 flex items-center gap-1">
                <span>👁️</span>
                <span>عرض الحسابات:</span>
              </span>
              
              {/* زر إجمالي المتجر */}
              <button
                type="button"
                onClick={() => setSelectedShiftViewId('store')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                  selectedShiftViewId === 'store' ? 'bg-purple-800 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>🏢 إجمالي المتجر (كافة الأجهزة)</span>
                <span className="text-[10px] opacity-90 font-mono font-bold">({formatMoney(storeTodaySales, storeInfo.currency)})</span>
              </button>

              {/* أزرار الورديات المفتوحة مع حساب المبيعات اللحظية بدقة وتفادي التكرار نهائياً */}
              {allOpenShifts.map(sh => {
                const isMyShift = sh.userId === currentUser?.id;
                const liveSales = getShiftLiveSales(sh);
                const isSelected = effectiveShift?.id === sh.id && selectedShiftViewId !== 'store';
                return (
                  <button
                    key={sh.id || sh.userId}
                    type="button"
                    onClick={() => setSelectedShiftViewId(sh.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                      isSelected ? 'bg-pink-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>{isMyShift ? `👑 ورديتي الخاصة (${sh.cashierName})` : `🌸 وردية (${sh.cashierName})`}</span>
                    <span className="text-[10px] opacity-90 font-mono font-bold">({formatMoney(liveSales, storeInfo.currency)})</span>
                  </button>
                );
              })}

              {/* إذا لم تكن للمستخدم الحالي وردية مفتوحة، نعرض له زر ورديتي (مغلقة) */}
              {!allOpenShifts.some(sh => sh.userId === currentUser?.id) && (
                <button
                  type="button"
                  onClick={() => setSelectedShiftViewId('my')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                    selectedShiftViewId === 'my' ? 'bg-indigo-800 text-white shadow-sm' : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <span>⚪ ورديتي ({currentUser?.name}) - مغلقة 🔒</span>
                </button>
              )}
            </div>
          )}

          {/* سطر التصفية الجديد تحت عرض الحسابات (Filter Row) */}
          <div className="p-2.5 bg-gradient-to-r from-slate-50 via-white to-pink-50/40 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <div className="flex items-center gap-1.5 text-slate-800 font-black text-xs px-1">
                <Filter className="w-3.5 h-3.5 text-pink-600" />
                <span>تصفية الحسابات:</span>
              </div>

              {/* 1. تصفية الفترة الزمنية */}
              <div className="flex items-center gap-1.5">
                <select
                  value={filterPeriod}
                  onChange={(e) => setFilterPeriod(e.target.value)}
                  className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl px-2.5 py-1.5 outline-none transition cursor-pointer shadow-2xs"
                >
                  <option value="current_shift">⚡ الوردية الحالية / اليوم</option>
                  <option value="today">📅 مبيعات اليوم بالكامل</option>
                  <option value="yesterday">🗓️ مبيعات الأمس</option>
                  <option value="last7days">📊 آخر 7 أيام</option>
                  <option value="last30days">📈 آخر 30 يوماً</option>
                  <option value="custom">🔍 تاريخ مخصص...</option>
                </select>

                {filterPeriod === 'custom' && (
                  <input
                    type="date"
                    value={filterCustomDate}
                    onChange={(e) => setFilterCustomDate(e.target.value)}
                    className="bg-white border border-pink-300 text-slate-800 text-xs font-bold rounded-xl px-2 py-1 outline-none shadow-2xs"
                  />
                )}
              </div>

              {/* 2. تصفية الكاشير المسؤول */}
              <select
                value={filterCashierId}
                onChange={(e) => setFilterCashierId(e.target.value)}
                className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl px-2.5 py-1.5 outline-none transition cursor-pointer shadow-2xs"
              >
                <option value="all">👥 كافة الكاشيرات (الكل)</option>
                {availableCashiersList.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role === 'admin' ? 'المدير' : 'كاشير'})
                  </option>
                ))}
              </select>

              {/* 3. تصفية طريقة الدفع */}
              <select
                value={filterPaymentMethod}
                onChange={(e) => setFilterPaymentMethod(e.target.value)}
                className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl px-2.5 py-1.5 outline-none transition cursor-pointer shadow-2xs"
              >
                <option value="all">💳 كافة طرق الدفع (الكل)</option>
                {configuredPaymentMethods.filter(m => m.enabled !== false && m.id !== 'split').map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                <option value="split">🔀 دفع مجزأ (Split)</option>
              </select>

              {/* زر إلغاء التصفية السريع عند وجود فلتر نشط */}
              {isFilterActive && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-black rounded-xl border border-rose-200 flex items-center gap-1 transition shadow-2xs"
                  title="إعادة ضبط الفلاتر للافتراضي"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>إلغاء التصفية</span>
                </button>
              )}
            </div>

            {/* مؤشر ملخص الفلترة والمبالغ */}
            <div className="flex items-center gap-2 text-xs font-black text-slate-700 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs self-end md:self-auto">
              <span>{currentShiftMetrics.invoicesCount} فاتورة</span>
              <span className="text-slate-300">•</span>
              <span className="text-pink-700 font-mono">{formatMoney(currentShiftMetrics.totalSales, storeInfo.currency)}</span>
            </div>
          </div>

          {/* بطاقة حالة الوردية الحالية - تصميم حديث ومريح يجمع كافة طرق الدفع بدقة ومرونة */}
          <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 sm:p-6 text-slate-800 shadow-xl border border-slate-200/90 space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500/15 via-purple-500/10 to-indigo-500/15 text-pink-600 flex items-center justify-center border border-pink-200/80 text-xl shadow-xs">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                    <span>
                      {isStoreMode 
                        ? 'إجمالي مبيعات وعمليات المتجر اليوم (كافة الأجهزة)' 
                        : effectiveShift?.isOpen 
                        ? `وردية (${resolveUserName(effectiveShift, users)}) مفتوحة 🔓` 
                        : 'الوردية مغلقة 🔒'}
                    </span>
                    <span className={`w-2.5 h-2.5 rounded-full ${isShiftDisplayedOpen ? 'bg-emerald-500 ring-4 ring-emerald-100 animate-pulse' : 'bg-rose-500'}`}></span>
                  </h3>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-bold text-slate-700">
                        {isStoreMode 
                          ? `كافة الكاشيرات النشطة (${allOpenShifts.map(s => resolveUserName(s, users)).join('، ') || 'المتجر'})` 
                          : `الكاشير المسؤول: ${resolveUserName(effectiveShift || currentUser, users)}`}
                      </span>
                    </span>
                    {isShiftDisplayedOpen && (
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200/90 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-2xs">
                        <span>☁️</span>
                        <span>وردية سحابية مشتركة متزامنة فورياً</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                {myOpenShift ? (
                  <button
                    type="button"
                    onClick={() => handleOpenCloseShiftModal(myOpenShift)}
                    className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 text-white rounded-2xl text-xs font-black shadow-md shadow-rose-600/20 transition active:scale-95 flex items-center gap-1.5"
                  >
                    <X className="w-4 h-4" />
                    <span>🔒 إغلاق ورديتي ({resolveUserName(myOpenShift, users)}) وتقرير Z</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleOpenNewShiftClick}
                    className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white rounded-2xl text-xs font-black shadow-md shadow-emerald-600/20 transition active:scale-95 flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>🔓 فتح وردية جديدة لي ({currentUser?.name || 'كاشير'})</span>
                  </button>
                )}

                {/* إذا كان المدير يعرض صراحةً وردية كاشير آخر مفتوحة من القائمة */}
                {effectiveShift && effectiveShift.isOpen && effectiveShift.userId !== currentUser?.id && (
                  <button
                    type="button"
                    onClick={() => handleOpenCloseShiftModal(effectiveShift)}
                    className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-xs font-black shadow-md transition active:scale-95 flex items-center gap-1.5"
                  >
                    <X className="w-4 h-4 text-rose-400" />
                    <span>إغلاق وردية ({resolveUserName(effectiveShift, users)}) (إدارة)</span>
                  </button>
                )}
              </div>
            </div>

            {/* الأرقام المالية والسيولة النقدية للوردية بأعلى مستويات الوضوح والراحة البصرية */}
            <div className={`grid gap-2.5 pt-3 border-t border-slate-100 text-center ${
              Number(currentShiftMetrics.customerPaymentsCash) > 0 ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'
            }`}>
              <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-1">
                <span className="text-xs text-slate-500 block font-black">الرصيد الافتتاحي:</span>
                <span className="text-base sm:text-lg font-black text-slate-800 font-mono tracking-tight">{formatMoney(currentShiftMetrics.startCash, storeInfo.currency)}</span>
              </div>

              <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-200 shadow-2xs flex flex-col justify-between space-y-1">
                <span className="text-xs text-emerald-800 block font-black">مبيعات الكاش:</span>
                <span className="text-base sm:text-lg font-black text-emerald-700 font-mono tracking-tight">{formatMoney(currentShiftMetrics.cashSales, storeInfo.currency)}</span>
              </div>

              {Number(currentShiftMetrics.customerPaymentsCash) > 0 && (
                <div className="p-3.5 bg-teal-50/70 rounded-2xl border border-teal-200 shadow-2xs flex flex-col justify-between space-y-1">
                  <span className="text-xs text-teal-800 block font-black">سداد آجل نقداً:</span>
                  <span className="text-base sm:text-lg font-black text-teal-700 font-mono tracking-tight">+{formatMoney(currentShiftMetrics.customerPaymentsCash, storeInfo.currency)}</span>
                </div>
              )}

              <div className="p-3.5 bg-blue-50/70 rounded-2xl border border-blue-200 shadow-2xs flex flex-col justify-between space-y-1">
                <span className="text-xs text-blue-800 block font-black">مبيعات الشبكة:</span>
                <span className="text-base sm:text-lg font-black text-blue-700 font-mono tracking-tight">{formatMoney(currentShiftMetrics.cardSales, storeInfo.currency)}</span>
              </div>

              {/* بطاقة النقدية المتوقعة بالدرج بارزة ومريحة وموثوقة */}
              <div className="p-3.5 bg-gradient-to-br from-amber-50 via-amber-100/60 to-amber-50 rounded-2xl border-2 border-amber-300 shadow-md shadow-amber-500/10 ring-2 ring-amber-200/50 flex flex-col justify-between space-y-1">
                <span className="text-xs text-amber-900 block font-black flex items-center justify-center gap-1">
                  <span>💰</span>
                  <span>النقدية المتوقعة بالدرج:</span>
                </span>
                <span className="text-base sm:text-xl font-black text-amber-950 font-mono tracking-tight">{formatMoney(expectedCash, storeInfo.currency)}</span>
              </div>
            </div>

            {/* تفصيل شامل ومريح يجمع كافة طرق الدفع بالوردية مع المرونة الكاملة لأي وسيلة جديدة */}
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between text-xs flex-wrap gap-2 pb-2 border-b border-slate-200/60">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-slate-800 flex items-center gap-1.5 text-xs sm:text-sm">
                    <span>💳</span>
                    <span>تفصيل مبيعات طرق الدفع بالوردية:</span>
                  </span>
                  {Number(currentShiftMetrics.splitInvoicesCount) > 0 && (
                    <span className="text-[10px] text-purple-700 bg-purple-100/80 border border-purple-200 px-2 py-0.5 rounded-md font-bold">
                      ({currentShiftMetrics.splitInvoicesCount} مجزأة • {currentShiftMetrics.paymentOperationsCount || currentShiftMetrics.invoicesCount} حركة دفع)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                    إجمالي المبيعات: <strong className="font-mono text-pink-700 text-xs">{formatMoney(currentShiftMetrics.totalSales, storeInfo.currency)}</strong>
                  </span>
                  {Number(currentShiftMetrics.creditSales) > 0 && (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border shadow-2xs ${
                      currentShiftMetrics.isCreditFullySettled
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      {currentShiftMetrics.isCreditFullySettled 
                        ? 'الآجل مسدد بالكامل ✅' 
                        : `آجل متبقي: ${formatMoney(currentShiftMetrics.remainingCredit, storeInfo.currency)}`}
                    </span>
                  )}
                </div>
              </div>

              {/* شبكة طرق الدفع الديناميكية المرنة والمريحة للعين */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {allShiftPaymentMethods.map(m => {
                  const hasSales = Number(m.amount) > 0;
                  const isCredit = m.id === 'credit' || m.type === 'credit';
                  const isSettled = isCredit && currentShiftMetrics.isCreditFullySettled;
                  
                  const cardTheme = isSettled
                    ? 'bg-emerald-50/90 border-emerald-300 shadow-xs'
                    : hasSales
                    ? (m.id === 'cash' || m.type === 'cash'
                        ? 'bg-emerald-50/70 border-emerald-200 shadow-xs'
                        : m.id === 'transfer' || m.type === 'online'
                        ? 'bg-purple-50/70 border-purple-200 shadow-xs'
                        : isCredit
                        ? 'bg-amber-50/70 border-amber-200 shadow-xs'
                        : 'bg-blue-50/70 border-blue-200 shadow-xs')
                    : 'bg-white/90 border-slate-200/80 shadow-2xs hover:border-slate-300';

                  return (
                    <div
                      key={m.id}
                      className={`p-3 rounded-2xl border-2 transition-all flex flex-col justify-between gap-2.5 ${cardTheme}`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {m.image ? (
                            <img src={m.image} alt={m.name} className="w-5 h-4 object-contain rounded-xs shrink-0" />
                          ) : (
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${hasSales ? 'bg-pink-500' : 'bg-slate-300'}`}></span>
                          )}
                          <div className="truncate">
                            <span className="text-xs font-extrabold text-slate-800 block truncate" title={m.name}>
                              {m.name}
                            </span>
                          </div>
                        </div>
                        {isSettled && (
                          <span className="text-[8.5px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.2 rounded font-black shrink-0">
                            سُدد ✅
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline justify-between pt-2 border-t border-slate-200/60">
                        <span className="text-[10px] text-slate-500 font-medium">
                          {hasSales 
                            ? `${m.count} ${m.count === 1 ? 'حركة' : 'حركات'}${m.splitCount > 0 ? ` (${m.splitCount} مجزأة)` : ''}`
                            : '0 حركات'}
                        </span>
                        <span className={`font-mono font-black text-xs sm:text-sm ${
                          hasSales
                            ? (isSettled ? 'text-emerald-700' : isCredit ? 'text-amber-800' : m.id === 'cash' ? 'text-emerald-700' : 'text-blue-700')
                            : 'text-slate-400'
                        }`}>
                          {hasSales ? `+${formatMoney(m.amount, storeInfo.currency)}` : formatMoney(0, storeInfo.currency)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* أزرار السحب والإيداع وترحيل الخزينة */}
            {activeShift?.isOpen && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTreasuryDropOpen(true)}
                  className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-amber-500 via-purple-600 to-indigo-700 hover:opacity-95 text-white rounded-xl text-xs font-black shadow-md shadow-purple-950/20 transition flex items-center justify-center gap-1.5 active:scale-95 border border-amber-300/40"
                >
                  <Landmark className="w-4 h-4 text-amber-300" />
                  <span>سحب وترحيل للخزينة (Safe Drop) 🏦</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => handleOpenMovementModal('in')}
                  className="flex-1 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-black border border-emerald-200 transition flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-600" />
                  <span>إيداع نقدي في الدرج</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => handleOpenMovementModal('out')}
                  className="flex-1 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-xl text-xs font-black border border-rose-200 transition flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <Minus className="w-3.5 h-3.5 text-rose-600" />
                  <span>سحب نقدي من الدرج</span>
                </button>
              </div>
            )}
          </div>

          {/* تفاصيل التقرير Z بعد الإغلاق إن وجد */}
          {lastClosedReport && (
            <div className="bg-white rounded-3xl p-5 border-2 border-purple-300 shadow-xl space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📋</span>
                  <div>
                    <h4 className="font-black text-sm text-slate-900">تقرير إغلاق الوردية النهائي (Z-Report)</h4>
                    <span className="text-[10px] text-slate-500">{formatDate(lastClosedReport.closedAt)}</span>
                  </div>
                </div>

                <span className="bg-emerald-100 text-emerald-800 font-black text-xs px-3 py-1 rounded-full">
                  تم الإغلاق بنجاح ✅
                </span>
              </div>

              {/* شبكة الأرقام التفصيلية للتقرير */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">إجمالي المبيعات الكامل:</span>
                  <span className="font-black text-slate-900">{formatMoney(lastClosedReport.totalSales, storeInfo.currency)}</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">النقدية المحصاة فعلياً:</span>
                  <span className="font-black text-emerald-700">{formatMoney(lastClosedReport.actualCash, storeInfo.currency)}</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">الفارق (عجز / فائض):</span>
                  <span className={`font-black ${
                    lastClosedReport.difference === 0 
                      ? 'text-emerald-600' 
                      : lastClosedReport.difference > 0 
                      ? 'text-blue-600' 
                      : 'text-rose-600'
                  }`}>
                    {lastClosedReport.difference > 0 ? '+' : ''}{formatMoney(lastClosedReport.difference, storeInfo.currency)}
                  </span>
                </div>
              </div>

              {/* تفصيل طرق الدفع لتقرير Z */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-800 text-xs flex items-center gap-1.5">
                    <span>💳</span>
                    <span>تفصيل طرق الدفع المحصلة في الوردية:</span>
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">
                    عدد الفواتير: <strong className="text-slate-800">{lastClosedReport.invoicesCount || lastClosedReport.totalOrders || 0}</strong>{Number(lastClosedReport.splitInvoicesCount) > 0 ? ` (${lastClosedReport.splitInvoicesCount} مجزأة)` : ''}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
                  {lastClosedReport.paymentMethodsBreakdown && typeof lastClosedReport.paymentMethodsBreakdown === 'object' && Object.values(lastClosedReport.paymentMethodsBreakdown).filter(m => Number(m.amount) > 0).length > 0 ? (
                    Object.values(lastClosedReport.paymentMethodsBreakdown).filter(m => Number(m.amount) > 0).map(m => (
                      <div key={m.id} className="p-2.5 bg-white rounded-xl border border-slate-200/80 shadow-xs space-y-0.5">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-bold">
                          {DEFAULT_PAYMENT_ICONS[m.id] ? (
                            <img src={DEFAULT_PAYMENT_ICONS[m.id]} alt="" className="w-4 h-3 object-contain rounded-xs shrink-0" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-pink-500 inline-block shrink-0"></span>
                          )}
                          <span className="truncate">{m.name}</span>
                        </div>
                        <div className="font-mono font-black text-slate-900 text-xs">
                          +{formatMoney(m.amount, storeInfo.currency)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {m.count || 1} {m.count === 1 ? 'حركة دفع' : 'حركات دفع'}{m.splitCount > 0 ? ` • منها ${m.splitCount} مجزأة` : ''}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full text-center py-2 text-slate-400 text-xs">
                      لا توجد مبيعات في هذه الوردية
                    </div>
                  )}
                </div>
              </div>

              {/* أزرار المشاركة والطباعة */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 text-xs">
                <button
                  type="button"
                  onClick={() => handlePrintZReport()}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold transition flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة Z-Report 🖨️</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendWhatsAppToManager(lastClosedReport)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition flex items-center gap-1.5 shadow"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>إرسال واتساب للإدارة 📲</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendEmailToManager(lastClosedReport)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition flex items-center gap-1.5 shadow"
                >
                  <Mail className="w-4 h-4" />
                  <span>إرسال إيميل 📧</span>
                </button>
              </div>
            </div>
          )}

          {/* سجل حركات السحب والإيداع في الدرج */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-black text-xs sm:text-sm text-slate-800">حركات السحب والإيداع بالخزينة</h4>
              <span className="text-[11px] text-slate-400">{drawerTransactions?.length || 0} عملية</span>
            </div>

            {(!drawerTransactions || drawerTransactions.length === 0) ? (
              <p className="text-center text-xs text-slate-400 py-6">لا توجد حركات سحب أو إيداع مسجلة</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {drawerTransactions.map(tx => {
                  const isDrop = tx.type === 'treasury_drop';
                  const isIn = tx.type === 'in';
                  return (
                    <div key={tx.id} className="py-2.5 flex items-center justify-between text-xs hover:bg-slate-50/80 px-2 rounded-xl transition">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                          isDrop
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : isIn
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}>
                          {isDrop ? <Landmark className="w-4 h-4 text-purple-700" /> : isIn ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-slate-800">{tx.reason || (isDrop ? 'سحب وترحيل للخزينة' : isIn ? 'إيداع نقدي' : 'سحب نقدي')}</span>
                            {isDrop && (
                              <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-black px-1.5 py-0.2 rounded-md">
                                🏦 سحب للخزينة
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                            <span>{formatDate(tx.date)}</span>
                            <span>•</span>
                            <span>المسؤول: {tx.user}</span>
                            {tx.recipient && (
                              <>
                                <span>•</span>
                                <span className="text-purple-700 font-bold">المستلم: {tx.recipient}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`font-black font-mono text-sm ${
                          isIn ? 'text-emerald-600' : isDrop ? 'text-purple-900' : 'text-rose-600'
                        }`}>
                          {isIn ? '+' : '-'}{formatMoney(tx.amount, storeInfo?.currency || 'ر.س')}
                        </span>

                        {isDrop && (
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                printTreasuryDropVoucherHtml(tx, storeInfo, activeShift, users);
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                            className="p-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition"
                            title="طباعة سند السحب والترحيل الحراري"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      {isOpenShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-emerald-200 animate-in zoom-in-95">
            <div className="p-4 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔓</span>
                <h3 className="font-black text-sm">فتح وردية كاشير جديدة 🌸</h3>
              </div>
              <button type="button" onClick={() => setIsOpenShiftModal(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmOpenShift} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-slate-700">
                <span className="font-bold block">المستخدم الحالي: <strong>{currentUser?.name || 'كاشير'}</strong></span>
                <span className="text-[10px] text-slate-500">سيتم ربط المبيعات وحركات الدرج بحسابك بشكل مستقل</span>
              </div>

              {lastUserClosedShift && typeof lastUserClosedShift.actualCash === 'number' && (
                <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-950 font-black flex items-center gap-1.5">
                      <span>🔄</span>
                      <span>ترحيل تلقائي من ورديتك السابقة:</span>
                    </span>
                    <span className="font-mono font-black text-emerald-800 text-sm">
                      {formatMoney(lastUserClosedShift.actualCash, storeInfo?.currency)}
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-700/90">
                    تم تعبئة الرصيد الافتتاحي تلقائياً بالنقدية الفعلية المتبقية معك في الدرج لضمان استمرارية العهدة التراكمية.
                  </p>
                </div>
              )}

              {storeInfo.lockOpeningCash && currentUser?.role !== 'admin' && (
                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 font-bold text-xs flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>الرصيد الافتتاحي مثبت ومقفل بواسطة مدير النظام 🔒</span>
                </div>
              )}

              {myPendingFloatTotal > 0 && (
                <div className="p-3 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-950 text-[11px] font-bold leading-relaxed">
                  🤝 سلّمك المدير عهدة بقيمة{' '}
                  <b className="font-mono text-sm">{formatMoney(myPendingFloatTotal, storeInfo?.currency || 'ر.س')}</b>.
                  <span className="block mt-0.5">
                    هي رصيدك الافتتاحي المثبَّت لهذه الوردية، وتُحسب عليك عند الإقفال. تأكد من عدّ المبلغ في الدرج قبل البدء.
                  </span>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">الرصيد الافتتاحي بالصندوق (العهدة النقدية) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  readOnly={myPendingFloatTotal > 0 || (storeInfo.lockOpeningCash && currentUser?.role !== 'admin')}
                  placeholder={String(storeInfo.defaultStartCash || 500)}
                  value={openingCashInput}
                  onChange={e => setOpeningCashInput(e.target.value)}
                  className={`w-full px-3 py-2.5 border rounded-xl font-black text-slate-900 text-base text-center outline-none transition ${
                    storeInfo.lockOpeningCash && currentUser?.role !== 'admin'
                      ? 'bg-slate-100 border-slate-300 cursor-not-allowed text-slate-600'
                      : 'bg-slate-50 border-slate-200 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpenShiftModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-black shadow flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>بدء الوردية الآن</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* نافذة منبثقة: إغلاق الوردية وإصدار تقرير Z */}
      {/* ========================================================================= */}
      {isCloseShiftOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-rose-200 animate-in zoom-in-95">
            <div className="p-4 bg-gradient-to-r from-rose-900 to-pink-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔒</span>
                <h3 className="font-black text-sm">إغلاق وردية الكاشير وإصدار تقرير Z-Report 📊</h3>
              </div>
              <button type="button" onClick={() => setIsCloseShiftOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCloseShift} className="p-5 space-y-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">الكاشير المسؤول:</span>
                  <span className="font-bold text-slate-800">{resolveUserName(shiftBeingClosed || effectiveShift || currentUser, users)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">عدد فواتير الوردية:</span>
                  <div className="text-left">
                    <span className="font-mono font-bold text-slate-800">{currentShiftMetrics.invoicesCount || 0} فاتورة</span>
                    {Number(currentShiftMetrics.splitInvoicesCount) > 0 && (
                      <span className="text-[10px] text-purple-700 bg-purple-100/80 border border-purple-200 px-1.5 py-0.5 rounded-md font-bold block mt-0.5">
                        (منها {currentShiftMetrics.splitInvoicesCount} مجزأة • {currentShiftMetrics.paymentOperationsCount || currentShiftMetrics.invoicesCount} حركة دفع)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">الرصيد الافتتاحي (العهدة):</span>
                  <span className="font-mono font-bold text-slate-800">{formatMoney(currentShiftMetrics.startCash, storeInfo.currency)}</span>
                </div>

                {/* تفصيل طرق الدفع المحصلة في الوردية */}
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-800 text-[11px] flex items-center gap-1.5">
                      <span>💳</span>
                      <span>تفصيل طرق الدفع المحصلة:</span>
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">
                      إجمالي المبيعات: <strong className="font-mono text-pink-700 text-xs">{formatMoney(currentShiftMetrics.totalSales, storeInfo.currency)}</strong>
                    </span>
                  </div>

                  {activeShiftPaymentMethods.length > 0 ? (
                    <div className="space-y-1 bg-white p-2 rounded-xl border border-slate-200 max-h-44 overflow-y-auto">
                      {activeShiftPaymentMethods.map(m => (
                        <div key={m.id} className="flex justify-between items-center py-1 px-1.5 rounded-lg hover:bg-slate-50 transition text-[11px]">
                          <div className="flex items-center gap-1.5">
                            {DEFAULT_PAYMENT_ICONS[m.id] ? (
                              <img src={DEFAULT_PAYMENT_ICONS[m.id]} alt="" className="w-5 h-3.5 object-contain rounded-sm" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-pink-500 inline-block"></span>
                            )}
                            <span className="font-bold text-slate-800">{m.name}</span>
                            <span className="text-[10px] text-slate-500 font-normal">
                              ({m.count || 1} {m.count === 1 ? 'حركة دفع' : 'حركات دفع'}{m.splitCount > 0 ? ` • منها ${m.splitCount} مجزأة` : ''})
                            </span>
                          </div>
                          <span className="font-mono font-black text-slate-900">
                            +{formatMoney(m.amount, storeInfo.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2 bg-white rounded-xl border border-slate-200 text-center text-slate-400 text-[11px]">
                      لا توجد مبيعات في هذه الوردية حتى الآن
                    </div>
                  )}
                </div>

                {/* حركات وتدفقات الصندوق النقدي */}
                <div className="pt-2 border-t border-slate-200 space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-600">مبيعات الكاش بالدرج:</span>
                    <span className="font-mono font-bold text-emerald-700">+{formatMoney(currentShiftMetrics.cashSales, storeInfo.currency)}</span>
                  </div>
                  {Number(currentShiftMetrics.cashRefunds) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">مرتجعات كاش من الدرج:</span>
                      <span className="font-mono font-bold text-rose-600">-{formatMoney(currentShiftMetrics.cashRefunds, storeInfo.currency)}</span>
                    </div>
                  )}
                  {Number(currentShiftMetrics.totalExpenses) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">مصروفات نقدية من الدرج:</span>
                      <span className="font-mono font-bold text-rose-600">-{formatMoney(currentShiftMetrics.totalExpenses, storeInfo.currency)}</span>
                    </div>
                  )}
                  {Number(currentShiftMetrics.totalPurchases) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">مشتريات نقدية من الدرج:</span>
                      <span className="font-mono font-bold text-rose-600">-{formatMoney(currentShiftMetrics.totalPurchases, storeInfo.currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-600">صافي حركات الخزينة (سحب/إيداع):</span>
                    <span className="font-mono font-bold text-purple-700">{formatMoney(currentShiftMetrics.cashIn - currentShiftMetrics.cashOut, storeInfo.currency)}</span>
                  </div>
                </div>

                <div className="flex justify-between pt-2 border-t border-slate-200 font-black text-xs">
                  <span className="text-slate-900">النقدية المتوقعة بالدرج:</span>
                  <span className="text-rose-700 font-mono text-sm">{formatMoney(expectedCash, storeInfo.currency)}</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">المبلغ الفعلي المحصى في الصندوق (الكاش الفعلي) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={actualCashCount}
                  onChange={e => setActualCashCount(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-black text-slate-900 text-base text-center outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات إغلاق الوردية (اختياري)</label>
                <input
                  type="text"
                  placeholder="مثال: تم تسليم الكاش للمشرف"
                  value={closeNotes}
                  onChange={e => setCloseNotes(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-bold outline-none focus:border-rose-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCloseShiftOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-rose-600 to-pink-600 text-white rounded-xl font-black shadow flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>تأكيد الإغلاق وتوثيق الـ Z</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* نافذة منبثقة: السحب والإيداع النقدي بالخزينة */}
      {/* ========================================================================= */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-purple-200 animate-in zoom-in-95">
            <div className={`p-4 text-white flex items-center justify-between ${
              movementType === 'in' ? 'bg-emerald-800' : 'bg-rose-800'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{movementType === 'in' ? '➕' : '➖'}</span>
                <h3 className="font-black text-sm">
                  {movementType === 'in' ? 'إيداع نقدي بالخزينة' : 'سحب نقدي من الخزينة'}
                </h3>
              </div>
              <button type="button" onClick={() => setIsMovementModalOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMovement} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">المبلغ *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={movementAmount}
                  onChange={e => setMovementAmount(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-black text-slate-900 text-base text-center outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">سبب الحركة / البيان *</label>
                <input
                  type="text"
                  required
                  placeholder={movementType === 'in' ? 'مثال: تغذية عهدة نقدية إضافية' : 'مثال: شراء نثريات سريعة'}
                  value={movementReason}
                  onChange={e => setMovementReason(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-bold outline-none focus:border-purple-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMovementModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 text-white rounded-xl font-black shadow flex items-center gap-1.5 ${
                    movementType === 'in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>تأكيد الحركة</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* نافذة ترحيل النقدية للخزينة — كانت مستوردة بدون عرض بعد تقسيم الشاشة */}
      <TreasuryDropModal
        isOpen={isTreasuryDropOpen}
        onClose={() => setIsTreasuryDropOpen(false)}
        currentDrawerCash={expectedCash}
      />

    </>
  );
};
