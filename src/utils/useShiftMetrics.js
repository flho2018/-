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

// =========================================================================
//  آخر وردية مغلقة لهذا المستخدم — مصدر الرصيد الافتتاحي المرحَّل
// =========================================================================
//  كانت مكتوبة **ثلاث مرات حرفياً** (PosRegister، ShiftHeaderModal،
//  CurrentShiftDrawerTab) بصيغة `(shiftsHistory||[]).find(...)` — أي **أول
//  عنصر مطابق في المصفوفة**، لا آخر وردية زمنياً. وهذا ليس فرقاً نظرياً:
//
//  محلياً `closeShift` يُدرج في المقدمة (`[closed, ...prev]`) فالأحدث أولاً
//  بالصدفة. لكن المصفوفة تُعاد بناؤها من Firestore بفرز `_idx`
//  (syncEngine.js:463)، و`_idx` هو موضع السجل في مصفوفة **الجهاز الكاتب**
//  لحظة الكتابة (:700)، و`stripMeta` تحذفه قبل مقارنة «هل تغيّر السجل؟»
//  (:108) فلا يُعاد ترقيمه عند الإزاحة. فتتساوى مفاتيح الفرز ويؤول الترتيب
//  إلى ترتيب معرّفات المستندات — أي **الأقدم أولاً**.
//
//  قُيس ذلك على بيانات المتجر الحقيقية: ثلاث ورديات لنفس الكاشيرة مرتَّبة
//  ‎18:33 ← 18:37 ← 18:38، فأرجعت `.find()` وردية ‎18:33 (نقدها ٥٠) بدل
//  وردية ‎18:38 (نقدها ١٠٠) — **٥٠ ريالاً تختفي من الرصيد المرحَّل**.
//
//  والمطابقة بالاسم كانت تعمل ولو اختلف المعرّف، فترحّل رصيد وردية زميلة
//  تحمل نفس الاسم المعروض. صارت آخر ملاذ: لا تُستعمل إلا لسجل قديم بلا أي
//  معرّف إطلاقاً.
// =========================================================================
export const findLastClosedShift = (shiftsHistory, currentUser) => {
  const uid = currentUser?.id || 'admin';
  const name = currentUser?.name;
  return (shiftsHistory || [])
    .filter(s => s && s.status === 'closed' && (
      (s.userId && s.userId === uid) ||
      (s.cashierId && s.cashierId === uid) ||
      (!s.userId && !s.cashierId && s.cashierName && s.cashierName === name)
    ))
    .sort((a, b) =>
      new Date(b.closedAt || b.updatedAt || 0) - new Date(a.closedAt || a.updatedAt || 0)
    )[0] || null;
};

// =========================================================================
//  هل هذه الوردية مفتوحة للبيع الآن؟
// =========================================================================
//  مستند `user_shifts` لكل مستخدم يُكتب بـ merge (§5.3). ففتح وردية جديدة
//  بلا حقل `closedAt` يُبقي ختم الإغلاق السابق في السحابة، وتعود اللقطة
//  فتلصق `closedAt` على الوردية الجديدة. الشرط `!closedAt` كان يعتبرها
//  مغلقة رغم `isOpen: true` و`openedAt` الأحدث — فيُرفض البيع وتُفتح
//  وردية فوق وردية. الختم الأقدم من وقت الفتح بقايا دمج، لا إغلاق.
export const isShiftRecordOpen = (sh, historyList = []) => {
  if (!sh || sh.isOpen !== true || sh.status === 'closed') return false;
  const openedTs = sh.openedAt ? new Date(sh.openedAt).getTime() : 0;
  const closedTs = sh.closedAt ? new Date(sh.closedAt).getTime() : 0;
  if (Number.isFinite(closedTs) && closedTs > 0 && !(Number.isFinite(openedTs) && openedTs > closedTs)) {
    return false;
  }
  if (sh.id && (historyList || []).some(h => h && h.id === sh.id && (h.status === 'closed' || h.closedAt || h.isOpen === false))) {
    return false;
  }
  return true;
};

// =========================================================================
//  العهدة المعلّقة فعلاً على وردية مغلقة — المصدر الوحيد
// =========================================================================
//  وردية تُغلق تبقى `handoverStatus: 'pending'` بكامل نقدها بانتظار أن
//  يستلمه المدير. لكن الكاشير غالباً لا يسلّم شيئاً — يفتح وردية جديدة
//  **بنفس النقد** رصيداً افتتاحياً. فيصير على المال الواحد مُطالبتان:
//  واحدة معلّقة على الوردية القديمة، وأخرى داخل `startCash` للجديدة.
//
//  وقع فعلاً في المتجر (2026-09-17): أربع ورديات متتابعة لكاشيرة واحدة،
//  النقد الحقيقي في الدرج ٢٧٥، وشاشة الخزينة تعرض **٤٧٥** — زيادة ٢٠٠
//  هي بالضبط مجموع ما رُحّل (٥٠ + ٥٠ + ١٠٠).
//
//  ولماذا هنا لا في شاشة واحدة: ثلاث جهات تسأل عن هذا الرقم — ملخّص
//  الخزينة، وسجل الورديات (الذي يعرض «بانتظار استلام الإدارة» ويتيح زر
//  الاستلام)، ودالة تأكيد الاستلام نفسها. إصلاح واحدة وترك الأخريين
//  يجعل شاشةً تقول صفراً وأخرى تقول ٢٠٠ — وهو أسوأ من رقم خاطئ موحَّد.
//
//  `openNewShift` يختم المُرحَّل `rolled_over` لحظة وقوعه. أما الورديات
//  المغلقة **قبل** ذلك فبلا ختم، فيُستنتج الترحيل من الحقيقة نفسها:
//  وردية تالية لنفس الكاشير فُتحت برصيد افتتاحي بعد إغلاق السابقة ⇒ ذلك
//  المبلغ هو نقد السابقة انتقل معه لا مالاً جديداً. وما زاد عن الرصيد
//  الافتتاحي يبقى معلّقاً بحقّه — فالترحيل الجزئي لا يُسقط الباقي.
// =========================================================================
export const effectivePendingHandover = (shift, allShifts = []) => {
  if (!shift) return 0;
  if (shift.handoverStatus === 'received' || shift.handoverStatus === 'settled') return 0;
  const round = (n) => { const r = Math.round((Number(n) || 0) * 100) / 100; return r === 0 ? 0 : r; };
  const claimed = Number(shift.handoverAmount ?? shift.actualCash ?? shift.expectedCash ?? 0) || 0;
  if (claimed <= 0) return 0;
  // مختومة صراحةً من openNewShift: رقمها المتبقي هو الحقيقة
  if (Number(shift.rolledAmount) > 0) return round(Math.max(0, claimed));
  const uid = shift.userId || shift.cashierId;
  if (!uid) return round(claimed);
  const closedAt = new Date(shift.closedAt || shift.updatedAt || 0).getTime();
  const next = (allShifts || [])
    .filter(o => o && o.id !== shift.id && (o.userId || o.cashierId) === uid
      && new Date(o.openedAt || 0).getTime() >= closedAt)
    .sort((a, b) => new Date(a.openedAt || 0) - new Date(b.openedAt || 0))[0];
  const carried = Math.min(claimed, Number(next?.startCash) || 0);
  return round(Math.max(0, claimed - carried));
};

/** هل ما زال على هذه الوردية نقد لم يُسلَّم فعلاً؟ */
export const isHandoverPending = (shift, allShifts = []) =>
  effectivePendingHandover(shift, allShifts) > 0.005;

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

// =========================================================================
//  الصيغة الوحيدة للنقدية المتوقّعة في الدرج
// =========================================================================
//  كانت هذه المعادلة مكتوبة **حرفياً مرتين** (ShiftHeaderModal و
//  CurrentShiftDrawerTab)، وإلى جانبها أربع صيغ موازية تقرأ عدّادات
//  الوردية بدل إعادة الحساب (Dashboard، ManagerTreasuryTab، رسالة
//  الواتساب، خزينة المدير). الخمس تتطابق اليوم **بالصدفة**، لأن كل
//  عملية تُحدَّث يدوياً في كل موضع. أول عملية يُنسى فيها موضع واحد
//  تجعل لوحة التحكّم تقول رقماً وتقرير Z يقول آخر، ولا أحد يعرف أيّهما
//  الصحيح — وهذا أسوأ من رقم خاطئ معروف.
//
//  لماذا تُستثنى بنود من cashOut المحسوب من الحركات:
//   • `subType: 'expense'`  → المصروف يُخصم من قائمة المصروفات
//   • `subType: 'purchase'` → المشتريات تُخصم من قائمة المشتريات
//   • `category: 'مرتجع مبيعات نقدية'` → يُخصم عبر userCashRefunds
//  ولولا الاستثناء لخُصم كل منها مرتين.
// =========================================================================
export const computeExpectedCash = ({
  startCash = 0,
  cashSales = 0,
  cashRefunds = 0,
  cashIn = 0,
  cashOut = 0,
  cashExpenses = 0,
  cashPurchases = 0
} = {}) => {
  const n = (v) => Number(v) || 0;
  return n(startCash) + n(cashSales) - n(cashRefunds) + n(cashIn)
       - n(cashOut) - n(cashExpenses) - n(cashPurchases);
};

/** جمع حركات الدرج الخارجة مع استثناء ما يُحتسب من قوائم أخرى */
export const sumDrawerCashOut = (userDrawerTx = []) =>
  (userDrawerTx || [])
    .filter(t => (t.type === 'out' || t.type === 'treasury_drop')
              && t.subType !== 'expense'
              && t.subType !== 'purchase'
              && t.category !== 'مرتجع مبيعات نقدية')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

/** جمع حركات الدرج الداخلة (العهدة الافتتاحية لا تُجمع ثانيةً كإيداع) */
export const sumDrawerCashIn = (userDrawerTx = []) =>
  (userDrawerTx || [])
    .filter(t => t.type === 'in'
              && t.subType !== 'expense'
              && !t.countedInStartCash
              && t.status !== 'pending')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
