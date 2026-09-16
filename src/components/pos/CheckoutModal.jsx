import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Banknote, CreditCard, UserCheck, Split, CheckCircle, AlertCircle, User, Plus, Smartphone, Sparkles, Zap, ShoppingBag, Gift, QrCode, Wallet, Globe, Scale } from 'lucide-react';
import { formatMoney } from '../../utils/helpers';
import { checkUserPermission } from '../../utils/permissions';
import { INITIAL_PAYMENT_METHODS } from '../../utils/initialData';

export const CheckoutModal = ({ isOpen, onClose, onPaymentComplete, onSuccess, initialMethodId }) => {
  const { 
    storeInfo, 
    cart, 
    getCartTotals, 
    selectedCustomer, 
    setSelectedCustomer, 
    customers, 
    checkout,
    activeShift,
    userShifts,
    shiftsHistory,
    currentUser
  } = useApp();

  // صلاحية البيع الآجل (على الحساب)
  const canCreditSale = checkUserPermission(currentUser, 'pos_credit_sale');

  const isShiftOpen = React.useMemo(() => {
    const currentUid = currentUser?.id;
    if (!currentUid) return false;
    const historyList = shiftsHistory || [];
    const isClosedInHist = (shId) => shId && historyList.some(h => h && h.id === shId && (h.status === 'closed' || h.closedAt || h.isOpen === false));

    const myUserShift = userShifts && userShifts[currentUid];
    if (myUserShift && myUserShift.isOpen === true && myUserShift.status !== 'closed' && !myUserShift.closedAt && !isClosedInHist(myUserShift.id)) {
      return true;
    }
    if (activeShift && activeShift.isOpen === true && activeShift.userId === currentUid && activeShift.status !== 'closed' && !activeShift.closedAt && !isClosedInHist(activeShift.id)) {
      return true;
    }
    return false;
  }, [activeShift, userShifts, currentUser?.id, shiftsHistory]);

  const totals = getCartTotals();
  const paymentMethodsList = storeInfo?.paymentMethods || INITIAL_PAYMENT_METHODS;
  const enabledMethods = paymentMethodsList.filter(m => m.enabled);
  const paymentSettings = storeInfo?.paymentSettings || {};

  const defaultMethodObj = (initialMethodId && enabledMethods.find(m => m.id === initialMethodId)) ||
                           enabledMethods.find(m => m.id === paymentSettings.defaultMethod) || 
                           enabledMethods[0] || INITIAL_PAYMENT_METHODS[0];

  const [selectedMethod, setSelectedMethod] = useState(defaultMethodObj);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [splitRows, setSplitRows] = useState([
    { id: 1, methodId: 'cash', amount: '', cashReceived: '', note: '', refNumber: '' },
    { id: 2, methodId: 'card', amount: '', cashReceived: '', note: '', refNumber: '' }
  ]);
  const [error, setError] = useState('');
  // =======================================================================
  //  قفل ضدّ الضغط المزدوج على «تأكيد الدفع»
  // =======================================================================
  //  لم يكن على الزر لا `disabled` ولا حارس داخل الدالة. وعلى شاشة لمس،
  //  اللمسة المزدوجة (أو ضغطة ثانية أثناء بطء المزامنة) تُصدر **فاتورتين**
  //  وتخصم المخزون مرتين وتُدخل النقد مرتين. والمرتجع في هذا البرنامج
  //  محميّ بقفل (`refundingIdsRef`) بينما البيع — وهو الأكثر تكراراً — لا.
  //  القفل في `useRef` لا في `useState`: الحالة لا تُحدَّث فوراً داخل نفس
  //  دورة الأحداث، فضغطتان متلاحقتان قد تقرآن القيمة القديمة كلتاهما.
  // =======================================================================
  const isCompletingRef = useRef(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const completeCallback = onPaymentComplete || onSuccess;

  useEffect(() => {
    if (isOpen) {
      const def = (initialMethodId && enabledMethods.find(m => m.id === initialMethodId)) ||
                  enabledMethods.find(m => m.id === paymentSettings.defaultMethod) || 
                  enabledMethods[0] || INITIAL_PAYMENT_METHODS[0];
      setSelectedMethod(def);
      setReceivedAmount(String(totals.total.toFixed(2)));
      setPaymentNote('');

      const half1 = Number((totals.total / 2).toFixed(2));
      const half2 = Number((totals.total - half1).toFixed(2));
      const cardMethod = enabledMethods.find(m => m.type !== 'cash' && m.type !== 'credit' && m.type !== 'split') || enabledMethods.find(m => m.type !== 'split' && m.type !== 'cash') || enabledMethods[0];

      setSplitRows([
        { id: 1, methodId: 'cash', amount: String(half1), cashReceived: String(half1), note: '', refNumber: '' },
        { id: 2, methodId: cardMethod?.id || 'card', amount: String(half2), cashReceived: '', note: '', refNumber: '' }
      ]);
      setError('');
    }
  }, [isOpen, totals.total, paymentSettings.defaultMethod]);

  if (!isOpen) return null;

  const numReceived = Number(receivedAmount) || 0;
  const change = Math.max(0, numReceived - totals.total);

  // حساب مجموع دفعات التقسيم والمتبقي
  const totalSplitSum = splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const remainingSplitBalance = Number((totals.total - totalSplitSum).toFixed(2));

  // مجموع الباقي للعميل من جميع الدفعات النقدية ضمن التقسيم
  const totalSplitChange = splitRows.reduce((sum, r) => {
    const methodObj = paymentMethodsList.find(m => m.id === r.methodId);
    const isCash = r.methodId === 'cash' || methodObj?.type === 'cash';
    if (isCash) {
      const reqAmt = Number(r.amount) || 0;
      const recAmt = (r.cashReceived === '' || r.cashReceived === null || r.cashReceived === undefined) ? reqAmt : (Number(r.cashReceived) || 0);
      return sum + Math.max(0, recAmt - reqAmt);
    }
    return sum;
  }, 0);

  // تقسيم متساوٍ على عدد أشخاص
  const handleSplitEqually = (count) => {
    if (count < 2) return;
    const baseAmount = Math.floor((totals.total / count) * 100) / 100;
    const remainder = Number((totals.total - (baseAmount * count)).toFixed(2));
    const nonCashMethods = enabledMethods.filter(m => m.type !== 'split');
    const newRows = [];

    for (let i = 0; i < count; i++) {
      const rowAmt = (i === 0 ? Number((baseAmount + remainder).toFixed(2)) : baseAmount).toFixed(2);
      const chosenMethod = nonCashMethods[i % nonCashMethods.length] || enabledMethods[0];
      const isCash = chosenMethod?.type === 'cash' || chosenMethod?.id === 'cash';

      newRows.push({
        id: Date.now() + i,
        methodId: chosenMethod?.id || 'cash',
        amount: String(rowAmt),
        cashReceived: isCash ? String(rowAmt) : '',
        note: `حصة الشخص (${i + 1})`,
        refNumber: ''
      });
    }
    setSplitRows(newRows);
    setError('');
  };

  // تقسيم 50% كاش و 50% شبكة
  const handleSplitFiftyFifty = () => {
    const half1 = Number((totals.total / 2).toFixed(2));
    const half2 = Number((totals.total - half1).toFixed(2));
    const cardMethod = enabledMethods.find(m => m.type !== 'cash' && m.type !== 'credit' && m.type !== 'split') || enabledMethods.find(m => m.type !== 'split' && m.type !== 'cash') || enabledMethods[0];

    setSplitRows([
      { id: Date.now(), methodId: 'cash', amount: String(half1), cashReceived: String(half1), note: 'دفعة نقدية (50%)', refNumber: '' },
      { id: Date.now() + 1, methodId: cardMethod?.id || 'card', amount: String(half2), cashReceived: '', note: `دفع (${cardMethod?.name || 'شبكة'}) 50%`, refNumber: '' }
    ]);
    setError('');
  };

  // موازنة المتبقي تلقائياً على آخر دفعة
  const handleAutoBalanceLastRow = () => {
    if (splitRows.length === 0) return;
    const otherSum = splitRows.slice(0, -1).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const rem = Math.max(0, Number((totals.total - otherSum).toFixed(2)));
    
    setSplitRows(prev => prev.map((r, idx) => {
      if (idx === prev.length - 1) {
        const isCash = r.methodId === 'cash';
        return { 
          ...r, 
          amount: String(rem),
          cashReceived: isCash ? String(rem) : r.cashReceived 
        };
      }
      return r;
    }));
    setError('');
  };

  const handleQuickCash = (amount) => {
    setReceivedAmount(String(amount));
    setError('');
  };

  const handleAddSplitRow = () => {
    const usedMethodIds = splitRows.map(r => r.methodId);
    const nextMethod = enabledMethods.find(m => m.type !== 'split' && !usedMethodIds.includes(m.id)) 
      || enabledMethods.find(m => m.type !== 'split') 
      || enabledMethods[0];

    const rem = Math.max(0, remainingSplitBalance);
    const isCash = nextMethod?.type === 'cash' || nextMethod?.id === 'cash';

    setSplitRows(prev => [
      ...prev,
      {
        id: Date.now(),
        methodId: nextMethod?.id || 'cash',
        amount: rem > 0 ? String(rem) : '',
        cashReceived: isCash && rem > 0 ? String(rem) : '',
        note: '',
        refNumber: ''
      }
    ]);
  };

  const handleRemoveSplitRow = (rowId) => {
    if (splitRows.length <= 1) return;
    setSplitRows(prev => prev.filter(r => r.id !== rowId));
  };

  const handleUpdateSplitRow = (rowId, field, value) => {
    setSplitRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const updated = { ...r, [field]: value };
      if (field === 'methodId') {
        const m = paymentMethodsList.find(im => im.id === value);
        if (m?.type === 'cash' || value === 'cash') {
          updated.cashReceived = updated.amount || '';
        }
      }
      if (field === 'amount') {
        const m = paymentMethodsList.find(im => im.id === r.methodId);
        const isCashRow = (m?.type === 'cash' || r.methodId === 'cash');
        // المبلغ المستلم يتبع مبلغ البند تلقائياً: يرتفع معه، وينزل معه أيضاً طالما
        // أن الكاشير لم يدخل مبلغاً مستلماً مختلفاً بنفسه. بدون النزول كانت الشاشة
        // تحسب "باقي للعميل" وهمياً ويخرج المبلغ من الدرج بلا مقابل.
        const wasAutoFilled = !r.cashReceived || Number(r.cashReceived) === Number(r.amount);
        if (isCashRow && (wasAutoFilled || Number(r.cashReceived) < Number(value))) {
          updated.cashReceived = value;
        }
      }
      return updated;
    }));
    setError('');
  };

  const handleRowQuickCash = (rowId, val) => {
    setSplitRows(prev => prev.map(r => r.id === rowId ? { ...r, cashReceived: String(val) } : r));
  };

  const handleFillRemaining = (rowId) => {
    const otherSum = splitRows.filter(r => r.id !== rowId).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const rem = Math.max(0, Number((totals.total - otherSum).toFixed(2)));
    setSplitRows(prev => prev.map(r => {
      if (r.id === rowId) {
        const isCash = r.methodId === 'cash';
        return {
          ...r,
          amount: String(rem),
          cashReceived: isCash ? String(rem) : r.cashReceived
        };
      }
      return r;
    }));
    setError('');
  };

  const renderLucideIcon = (iconName, type, methodId = '') => {
    // أيقونات رسمية عالية النقاء لجميع وسائل الدفع المعتمدة
    if (methodId === 'cash' || type === 'cash' || iconName === 'Banknote') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7 sm:w-8 sm:h-8 drop-shadow-sm">
          <rect x="4" y="10" width="40" height="28" rx="6" fill="#10B981"/>
          <circle cx="24" cy="24" r="7" fill="#047857" stroke="#34D399" strokeWidth="2"/>
          <text x="24" y="27" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="900" fontFamily="sans-serif">SAR</text>
          <circle cx="10" cy="24" r="2.5" fill="#34D399"/>
          <circle cx="38" cy="24" r="2.5" fill="#34D399"/>
        </svg>
      );
    }
    if (methodId === 'card') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7 sm:w-8 sm:h-8 drop-shadow-sm">
          <rect x="4" y="8" width="40" height="32" rx="6" fill="#FFFFFF"/>
          <path d="M8 24C8 17.37 13.37 12 20 12H28C34.63 12 40 17.37 40 24C40 30.63 34.63 36 28 36H20C13.37 36 8 30.63 8 24Z" fill="#007A3D"/>
          <path d="M22 18H26C29.31 18 32 20.69 32 24C32 27.31 29.31 30 26 30H22V18Z" fill="#00A3E0"/>
          <text x="14" y="27" fill="#FFFFFF" fontSize="9" fontWeight="900" fontFamily="Cairo">مدى</text>
        </svg>
      );
    }
    if (methodId === 'visa') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7 sm:w-8 sm:h-8 drop-shadow-sm">
          <rect x="4" y="8" width="40" height="32" rx="6" fill="#1A1F71"/>
          <text x="24" y="27" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontStyle="italic" fontWeight="900" fontFamily="sans-serif">VISA</text>
          <rect x="6" y="32" width="36" height="2" fill="#F7B600"/>
        </svg>
      );
    }
    if (methodId === 'transfer' || iconName === 'Globe') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7 sm:w-8 sm:h-8 drop-shadow-sm">
          <rect x="4" y="8" width="40" height="32" rx="6" fill="#2563EB"/>
          <path d="M24 13L11 20V22H37V20L24 13Z" fill="#93C5FD"/>
          <rect x="14" y="24" width="4" height="7" fill="#FFFFFF"/>
          <rect x="22" y="24" width="4" height="7" fill="#FFFFFF"/>
          <rect x="30" y="24" width="4" height="7" fill="#FFFFFF"/>
          <rect x="10" y="32" width="28" height="3" fill="#93C5FD"/>
        </svg>
      );
    }
    if (methodId === 'tamara' || iconName === 'Sparkles') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7 sm:w-8 sm:h-8 drop-shadow-sm">
          <rect x="4" y="8" width="40" height="32" rx="6" fill="#FF8D6B"/>
          <circle cx="18" cy="22" r="6" fill="#FFFFFF"/>
          <circle cx="30" cy="22" r="6" fill="#2B1F4D"/>
          <text x="24" y="35" textAnchor="middle" fill="#FFFFFF" fontSize="7" fontWeight="bold" fontFamily="sans-serif">tamara</text>
        </svg>
      );
    }
    if (methodId === 'ninja' || iconName === 'Zap') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7 sm:w-8 sm:h-8 drop-shadow-sm">
          <rect x="4" y="8" width="40" height="32" rx="6" fill="#E11D48"/>
          <path d="M26 14L16 26H24L22 34L32 22H24L26 14Z" fill="#FACC15"/>
        </svg>
      );
    }
    if (methodId === 'credit' || type === 'credit' || iconName === 'UserCheck') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7 sm:w-8 sm:h-8 drop-shadow-sm">
          <rect x="4" y="8" width="40" height="32" rx="6" fill="#D97706"/>
          <circle cx="24" cy="19" r="5" fill="#FEF3C7"/>
          <path d="M15 32C15 27.5 19 25.5 24 25.5C29 25.5 33 27.5 33 32" stroke="#FEF3C7" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      );
    }
    if (methodId === 'split' || iconName === 'Split') {
      return (
        <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7 sm:w-8 sm:h-8 drop-shadow-sm">
          <rect x="4" y="8" width="40" height="32" rx="6" fill="#7C3AED"/>
          <path d="M14 18H22C26 18 29 21 29 25V30" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          <path d="M14 30H22C26 30 29 27 29 25" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          <circle cx="14" cy="18" r="3" fill="#F472B6"/>
          <circle cx="14" cy="30" r="3" fill="#34D399"/>
          <circle cx="29" cy="30" r="3" fill="#60A5FA"/>
          <text x="38" y="26" textAnchor="middle" fill="#FFFFFF" fontSize="6.5" fontWeight="900" fontFamily="sans-serif">SPLIT</text>
        </svg>
      );
    }

    switch (iconName) {
      case 'Banknote': return <Banknote className="w-6 h-6 text-white" />;
      case 'CreditCard': return <CreditCard className="w-6 h-6 text-white" />;
      case 'Smartphone': return <Smartphone className="w-6 h-6 text-white" />;
      case 'Zap': return <Zap className="w-6 h-6 text-white" />;
      case 'Sparkles': return <Sparkles className="w-6 h-6 text-white" />;
      case 'ShoppingBag': return <ShoppingBag className="w-6 h-6 text-white" />;
      case 'UserCheck': return <UserCheck className="w-6 h-6 text-white" />;
      case 'Split': return <Split className="w-6 h-6 text-white" />;
      case 'Wallet': return <Wallet className="w-6 h-6 text-white" />;
      case 'Gift': return <Gift className="w-6 h-6 text-white" />;
      case 'QrCode': return <QrCode className="w-6 h-6 text-white" />;
      case 'Globe': return <Globe className="w-6 h-6 text-white" />;
      default:
        if (type === 'cash') return <Banknote className="w-6 h-6 text-white" />;
        if (type === 'credit') return <UserCheck className="w-6 h-6 text-white" />;
        if (type === 'split') return <Split className="w-6 h-6 text-white" />;
        return <CreditCard className="w-6 h-6 text-white" />;
    }
  };

  const handleComplete = () => {
    if (isCompletingRef.current) return;   // ضغطة ثانية أثناء تنفيذ الأولى
    if (!isShiftOpen) {
      setError('⛔ يمنع إتمام البيع والدفع نهائياً بدون فتح وردية للمستخدم الحالي وتوثيق العهدة!');
      alert('⛔ يمنع إتمام البيع والدفع نهائياً بدون فتح وردية للمستخدم الحالي وتوثيق العهدة!');
      return;
    }
    const methodType = selectedMethod?.type || 'card';

    // التحقق من صحة الدفع
    if (methodType === 'cash') {
      if (numReceived < totals.total) {
        setError(`المبلغ المستلم (${numReceived.toFixed(2)}) أقل من إجمالي الفاتورة (${totals.total.toFixed(2)})`);
        return;
      }
    } else if (methodType === 'credit') {
      if (!canCreditSale) {
        setError('⛔ ليس لديك صلاحية البيع الآجل (على الحساب). تُمنح من: الإعدادات ← المستخدمون ← الصلاحيات.');
        return;
      }
      if (!selectedCustomer || selectedCustomer.isDefault) {
        setError('يجب اختيار عميل مسجل لإتمام عملية البيع الآجل (على الحساب)');
        return;
      }
    } else if (methodType === 'split') {
      // سماحية أقل من هللة واحدة: كانت ٠.٠٢ فتُحفظ الفاتورة بمجموع دفعات
      // لا يساوي إجماليها، فيختلف تقرير وسائل الدفع عن إجمالي المبيعات دائماً.
      if (Math.abs(totalSplitSum - totals.total) > 0.005) {
        setError(`مجموع الدفعات المقسمة (${totalSplitSum.toFixed(2)}) لا يساوي إجمالي الفاتورة (${totals.total.toFixed(2)}) - الفارق: ${remainingSplitBalance.toFixed(2)} ${storeInfo.currency}`);
        return;
      }
      // التحقق من أي بند آجل في التقسيم
      const hasCreditInSplit = splitRows.some(r => {
        const m = paymentMethodsList.find(im => im.id === r.methodId);
        return m?.type === 'credit' || r.methodId === 'credit';
      });
      if (hasCreditInSplit && !canCreditSale) {
        setError('⛔ ليس لديك صلاحية البيع الآجل (على الحساب)، فلا يمكن إدراج بند آجل ضمن التقسيم.');
        return;
      }
      if (hasCreditInSplit && (!selectedCustomer || selectedCustomer.isDefault)) {
        setError('يوجد بند دفع آجل ضمن التقسيم، يرجى اختيار عميل مسجل لتقييد الدين عليه');
        return;
      }
      const invalidRow = splitRows.find(r => (Number(r.amount) || 0) <= 0);
      if (invalidRow) {
        setError('يرجى تحديد مبلغ صحيح أكبر من الصفر لكل بند في التقسيم');
        return;
      }
      // التحقق أن المبلغ النقدي المستلم لا يقل عن المطلوب في بنود الكاش،
      // مثل ما هو معمول به في الدفع النقدي المفرد. بدونه كانت الفاتورة تُسجّل
      // نقدية أكبر مما دخل الدرج فعلاً فيظهر عجز في تقرير الوردية بلا سبب.
      const shortCashRow = splitRows.find(r => {
        const m = paymentMethodsList.find(im => im.id === r.methodId);
        const isCashRow = (m?.type === 'cash' || r.methodId === 'cash');
        if (!isCashRow) return false;
        const received = (r.cashReceived === '' || r.cashReceived === undefined || r.cashReceived === null)
          ? Number(r.amount) || 0
          : Number(r.cashReceived) || 0;
        return received < (Number(r.amount) || 0);
      });
      if (shortCashRow) {
        setError('المبلغ النقدي المستلم في أحد بنود التقسيم أقل من مبلغ البند — صحّح المبلغ المستلم قبل إتمام البيع');
        return;
      }
    }

    // إعداد تفاصيل الدفعات المقسمة بدقة
    const structuredSplitPayments = methodType === 'split' ? splitRows.map(r => {
      const methodObj = paymentMethodsList.find(im => im.id === r.methodId) || { name: r.methodId, type: r.methodId };
      const isCash = r.methodId === 'cash' || methodObj.type === 'cash';
      const reqAmt = Number(r.amount) || 0;
      const recAmt = isCash ? ((r.cashReceived === '' || r.cashReceived === null || r.cashReceived === undefined) ? reqAmt : (Number(r.cashReceived) || 0)) : reqAmt;
      const rowChange = isCash ? Math.max(0, recAmt - reqAmt) : 0;

      return {
        methodId: r.methodId,
        methodName: methodObj.name || r.methodId,
        methodType: methodObj.type || 'card',
        amount: reqAmt,
        cashReceived: recAmt,
        changeAmount: rowChange,
        note: r.note || '',
        refNumber: r.refNumber || '',
        date: new Date().toISOString()
      };
    }) : null;

    // كل عمليات التحقق نجحت — نُغلق الآن، فالضغطة التالية لا تُصدر فاتورة ثانية
    isCompletingRef.current = true;
    setIsCompleting(true);

    const createdInvoice = checkout({
      paymentMethod: selectedMethod?.id || 'cash',
      paymentMethodName: selectedMethod?.name || 'نقداً',
      paymentMethodType: methodType,
      receivedAmount: methodType === 'cash' ? numReceived : totals.total,
      changeAmount: methodType === 'cash' ? change : totalSplitChange,
      splitPayments: structuredSplitPayments,
      notes: paymentNote || '',
      customer: selectedCustomer
    });

    if (createdInvoice) {
      if (completeCallback) completeCallback(createdInvoice);
      onClose();
    } else {
      // لم تُنشأ فاتورة (حارس صلاحية أو وردية) — نفتح القفل ليعيد الكاشير المحاولة
      isCompletingRef.current = false;
      setIsCompleting(false);
    }
  };

  const methodType = selectedMethod?.type || 'card';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-sm sm:max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 my-auto flex flex-col font-cairo">
        
        {/* رأس نافذة الدفع */}
        <div className="p-4 bg-gradient-to-r from-[#2C0620] via-[#20052F] to-[#3B0730] text-white flex items-center justify-between border-b border-pink-500/30">
          <div>
            <span className="text-[11px] text-pink-300 font-bold block">إتمام عملية الدفع والمحاسبة 🌸</span>
            <h3 className="text-base sm:text-lg font-black text-white">
              المطلوب سداده: {formatMoney(totals.total, storeInfo.currency)}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl bg-pink-950/80 hover:bg-pink-900 text-pink-200 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* جسم النافذة */}
        <div className="p-4 space-y-3.5">
          
          {/* اختيار وسيلة الدفع - بطاقات مربعة عصرية متناسقة */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">اختر وسيلة الدفع:</span>
              <span className="text-[11px] font-black text-pink-700 bg-pink-100/70 px-2.5 py-0.5 rounded-full border border-pink-200">
                {selectedMethod?.name || 'نقداً'} 💳
              </span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-8 gap-2">
              {enabledMethods.map((m) => {
                const isSelected = selectedMethod?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    title={m.name}
                    onClick={() => {
                      setSelectedMethod(m);
                      setError('');
                    }}
                    className={`p-2 rounded-2xl border flex flex-col items-center justify-center text-center transition active:scale-95 relative group ${
                      isSelected
                        ? 'bg-gradient-to-b from-pink-50 to-purple-50 border-pink-600 ring-2 ring-pink-500 shadow-md shadow-pink-500/20'
                        : 'bg-white/90 border-pink-100 hover:border-pink-300 hover:bg-pink-50/40 shadow-xs'
                    }`}
                  >
                    {/* أيقونة وسيلة الدفع المتناسقة */}
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${m.color || 'from-pink-600 to-purple-600'} text-white flex items-center justify-center shadow-xs overflow-hidden border border-white/80 transition relative`}>
                      {m.image ? (
                        <div className="w-full h-full bg-white flex items-center justify-center p-1">
                          <img src={m.image} alt={m.name} className="w-full h-full object-contain" />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          {renderLucideIcon(m.iconName, m.type, m.id)}
                        </div>
                      )}

                      {/* شارة التحديد */}
                      {isSelected && (
                        <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-pink-600 text-white text-[8px] font-black rounded-full flex items-center justify-center shadow">
                          ✓
                        </span>
                      )}
                    </div>

                    {/* اسم وسيلة الدفع بالأسفل بتناسق فائق */}
                    <span className={`text-[10px] mt-1 font-bold truncate max-w-full block ${isSelected ? 'text-pink-900 font-black' : 'text-slate-600'}`}>
                      {m.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* محتوى الدفع النقدي */}
          {methodType === 'cash' && (
            <div className="space-y-3 bg-pink-50/40 p-3.5 rounded-2xl border border-pink-200">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">المبلغ المستلم من العميل نقداً:</label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    onKeyDown={(e) => ['-', '+', 'e', 'E'].includes(e.key) && e.preventDefault()}
                    value={receivedAmount}
                    onChange={(e) => {
                      setReceivedAmount(e.target.value);
                      setError('');
                    }}
                    className="w-full px-3 py-2.5 bg-white border border-pink-300 rounded-xl text-lg font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-500 text-center shadow-inner"
                  />
                  <span className="absolute left-3 top-3 text-xs text-pink-500 font-black">
                    {storeInfo.currency}
                  </span>
                </div>
              </div>

              {/* أزرار الفئات النقدية السريعة */}
              <div className="grid grid-cols-5 gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => handleQuickCash(totals.total)}
                  className="py-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-[10px] font-black shadow-sm transition active:scale-95"
                >
                  المضبوط
                </button>
                {(paymentSettings.quickCashAmounts || [10, 50, 100, 500]).map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleQuickCash(val)}
                    className="py-1.5 bg-white hover:bg-pink-100 border border-pink-200 rounded-xl text-[10px] font-bold text-slate-800 shadow-xs transition active:scale-95"
                  >
                    {val}
                  </button>
                ))}
              </div>

              {/* بطاقة الباقي للعميل */}
              <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 shadow-xs">
                <span className="text-xs font-bold">المتبقي للعميل (الباقي):</span>
                <span className="text-base font-black text-emerald-700">
                  {formatMoney(change, storeInfo.currency)}
                </span>
              </div>
            </div>
          )}

          {/* محتوى الدفع بالشبكة والبطاقات والأونلاين */}
          {(methodType === 'card' || methodType === 'online') && (
            <div className="p-4 bg-pink-50/40 rounded-2xl border border-pink-100 text-center space-y-2">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${selectedMethod?.color || 'from-pink-600 to-purple-600'} text-white flex items-center justify-center mx-auto shadow-md overflow-hidden border border-white/50`}>
                {selectedMethod?.image ? (
                  <img src={selectedMethod.image} alt={selectedMethod.name} className="w-full h-full object-cover" />
                ) : (
                  renderLucideIcon(selectedMethod?.iconName, selectedMethod?.type)
                )}
              </div>
              <p className="text-xs font-bold text-slate-800">
                الدفع الإلكتروني عبر: <span className="font-extrabold text-pink-700">{selectedMethod?.name}</span>
              </p>
              <p className="text-xs text-slate-600 font-bold">
                المبلغ المسحوب من البطاقة: <strong className="text-slate-900 font-black">{formatMoney(totals.total, storeInfo.currency)}</strong>
              </p>
            </div>
          )}

          {/* محتوى الدفع الآجل */}
          {methodType === 'credit' && (
            <div className="space-y-3 bg-amber-50/80 p-3.5 rounded-2xl border border-amber-200 text-xs">
              <div className="flex items-center gap-2 text-amber-900 font-bold">
                <User className="w-4 h-4 text-amber-600" />
                <span>العميل المحاسب عليه (حساب الآجل):</span>
              </div>

              <select
                value={selectedCustomer?.id || ''}
                onChange={(e) => {
                  const c = customers.find(item => item.id === e.target.value);
                  if (c) setSelectedCustomer(c);
                  setError('');
                }}
                className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl font-bold text-slate-800 focus:outline-none"
              >
                {customers.map(c => (
                  <option key={c.id} value={c.id} disabled={c.isDefault}>
                    {c.name} {c.isDefault ? '(نقدي عام - غير مؤهل للآجل)' : `(الرصيد: ${c.balance || 0} ${storeInfo.currency})`}
                  </option>
                ))}
              </select>

              {selectedCustomer && !selectedCustomer.isDefault ? (
                <div className="text-[11px] text-amber-900 space-y-1 bg-white/70 p-2.5 rounded-xl border border-amber-200">
                  <p>الرصيد الحالي المستحق: <span className="font-bold">{formatMoney(selectedCustomer.balance || 0, storeInfo.currency)}</span></p>
                  <p>الرصيد بعد إضافة الفاتورة: <span className="font-black text-rose-700">{formatMoney((selectedCustomer.balance || 0) + totals.total, storeInfo.currency)}</span></p>
                </div>
              ) : (
                <p className="text-[11px] text-rose-600 font-bold">
                  * يرجى اختيار عميل مسجل من القائمة لتقييد المبلغ على ذمته.
                </p>
              )}
            </div>
          )}

          {/* 4. نظام تقسيم الفاتورة الذكي الشامل (Smart Multi-Split) */}
          {methodType === 'split' && (
            <div className="space-y-3 bg-gradient-to-b from-purple-50/70 to-pink-50/40 p-3 sm:p-4 rounded-3xl border border-purple-200 text-xs shadow-xs">
              
              {/* ترويسة التقسيم */}
              <div className="flex items-center justify-between border-b border-purple-200/80 pb-2.5">
                <div>
                  <h4 className="font-black text-purple-950 text-xs sm:text-sm flex items-center gap-1.5">
                    <Split className="w-4 h-4 text-purple-700" />
                    <span>نظام تقسيم الفاتورة الذكي 🔀</span>
                  </h4>
                  <p className="text-[10px] text-purple-700 mt-0.5">
                    توزيع دقيق على الأشخاص أو وسائل دفع متعددة مع حساب الباقي النقدي والتوثيق
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddSplitRow}
                  className="px-2.5 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 text-white rounded-xl font-black text-[11px] shadow-sm flex items-center gap-1 transition active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة وسيلة</span>
                </button>
              </div>

              {/* أزرار القوالب والتقسيم الذكي السريع */}
              <div className="space-y-1.5 bg-white/80 p-2.5 rounded-2xl border border-purple-100 shadow-xs">
                <div className="flex items-center justify-between text-[10px] font-bold text-purple-900 mb-1">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-purple-600" />
                    <span>تقسيم سريع بضغطة واحدة:</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleAutoBalanceLastRow}
                    className="text-[10px] text-pink-700 hover:text-pink-900 font-black flex items-center gap-0.5 transition"
                    title="موازنة باقي المبلغ تلقائياً على آخر دفعة"
                  >
                    <Scale className="w-3 h-3" />
                    <span>موازنة المتبقي ⚖️</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={handleSplitFiftyFifty}
                    className="px-2 py-1 bg-purple-100/70 hover:bg-purple-200 text-purple-900 rounded-lg text-[10px] font-black transition active:scale-95"
                  >
                    💵 50% كاش + 50% شبكة
                  </button>

                  <div className="flex items-center gap-1 bg-pink-100/60 p-0.5 rounded-lg">
                    <span className="text-[9px] font-black text-pink-900 px-1">تقسيم أشخاص:</span>
                    {[2, 3, 4, 5].map(cnt => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => handleSplitEqually(cnt)}
                        className="px-2 py-0.5 bg-white hover:bg-pink-600 hover:text-white text-pink-900 rounded-md text-[10px] font-black shadow-2xs transition active:scale-95"
                      >
                        {cnt} أشخاص
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* شريط التوزيع المالي البصري التفاعلي */}
              <div className="space-y-1">
                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
                  {splitRows.map((r, idx) => {
                    const amt = Number(r.amount) || 0;
                    const pct = totals.total > 0 ? (amt / totals.total) * 100 : 0;
                    const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-pink-500', 'bg-teal-500'];
                    return (
                      <div
                        key={r.id}
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                        className={`${colors[idx % colors.length]} transition-all duration-300`}
                        title={`الدفعة ${idx + 1}: ${amt} (${pct.toFixed(0)}%)`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* صفوف التقسيم التفصيلية */}
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-0.5">
                {splitRows.map((row, idx) => {
                  const methodObj = paymentMethodsList.find(im => im.id === row.methodId) || { name: row.methodId, type: 'card' };
                  const isCash = row.methodId === 'cash' || methodObj.type === 'cash';
                  const isCredit = row.methodId === 'credit' || methodObj.type === 'credit';
                  const reqAmt = Number(row.amount) || 0;
                  const recAmt = Number(row.cashReceived) || reqAmt;
                  const rowChange = isCash ? Math.max(0, recAmt - reqAmt) : 0;

                  return (
                    <div 
                      key={row.id} 
                      className={`p-3 bg-white rounded-2xl border shadow-xs space-y-2 transition ${
                        isCash 
                          ? 'border-emerald-200/80 bg-emerald-50/10' 
                          : isCredit 
                          ? 'border-amber-200/80 bg-amber-50/10' 
                          : 'border-purple-200/80'
                      }`}
                    >
                      {/* السطر الرئيسي: اختيار الوسيلة والمبلغ والمتبقي */}
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-900 font-black text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        
                        {/* اختيار وسيلة الدفع */}
                        <select
                          value={row.methodId}
                          onChange={(e) => handleUpdateSplitRow(row.id, 'methodId', e.target.value)}
                          className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                        >
                          {enabledMethods.filter(m => m.type !== 'split').map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.type === 'cash' ? 'كاش 💵' : m.type === 'credit' ? 'آجل 👤' : 'إلكتروني 💳'})
                            </option>
                          ))}
                        </select>

                        {/* إدخال المبلغ */}
                        <div className="relative w-28 shrink-0">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            onKeyDown={(e) => ['-', '+', 'e', 'E'].includes(e.key) && e.preventDefault()}
                            placeholder="0.00"
                            value={row.amount}
                            onChange={(e) => handleUpdateSplitRow(row.id, 'amount', e.target.value)}
                            className="w-full pl-7 pr-2 py-1.5 bg-white border border-purple-300 rounded-xl text-xs font-black text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-inner"
                          />
                          <span className="absolute left-1.5 top-2 text-[9px] font-black text-purple-500">
                            {storeInfo.currency}
                          </span>
                        </div>

                        {/* زر تعبئة المتبقي لهذا البند */}
                        <button
                          type="button"
                          onClick={() => handleFillRemaining(row.id)}
                          className="px-2 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 rounded-xl text-[10px] font-black shrink-0 transition active:scale-95"
                          title="تعبئة باقي قيمة الفاتورة تلقائياً في هذا البند"
                        >
                          المتبقي
                        </button>

                        {/* زر حذف البند */}
                        {splitRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSplitRow(row.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="حذف هذا البند"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* معالجة الكاش المستلم وحساب الباقي إذا كانت الدفعة نقدية */}
                      {isCash && (
                        <div className="bg-emerald-50/70 p-2 rounded-xl border border-emerald-200 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-emerald-900">المستلم نقداً لهذا الجزء:</span>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                onKeyDown={(e) => ['-', '+', 'e', 'E'].includes(e.key) && e.preventDefault()}
                                placeholder={String(reqAmt || '0.00')}
                                value={row.cashReceived}
                                onChange={(e) => handleUpdateSplitRow(row.id, 'cashReceived', e.target.value)}
                                className="w-20 px-2 py-1 bg-white border border-emerald-300 rounded-lg text-xs font-black text-emerald-900 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                              <span className="text-[9px] font-bold text-emerald-700">{storeInfo.currency}</span>
                            </div>
                          </div>

                          {/* أزرار سريعة لفئات الكاش */}
                          <div className="flex items-center justify-between gap-1 pt-1 border-t border-emerald-200/50">
                            <div className="flex gap-1">
                              {[reqAmt, 50, 100, 200, 500].filter(v => v > 0).slice(0, 4).map((val, vi) => (
                                <button
                                  key={vi}
                                  type="button"
                                  onClick={() => handleRowQuickCash(row.id, val)}
                                  className="px-1.5 py-0.5 bg-white hover:bg-emerald-100 border border-emerald-200 text-emerald-900 rounded text-[9px] font-bold"
                                >
                                  {val === reqAmt ? 'المضبوط' : val}
                                </button>
                              ))}
                            </div>
                            
                            {/* عرض الباقي */}
                            {rowChange > 0 && (
                              <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                                الباقي: {formatMoney(rowChange, storeInfo.currency)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* معالجة الدفع الآجل وربط العميل إذا كانت الدفعة آجلة */}
                      {isCredit && (
                        <div className="bg-amber-50/70 p-2 rounded-xl border border-amber-200 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-amber-900">العميل المحاسب عليه (آجل):</span>
                            <span className="text-[10px] font-black text-amber-800">{selectedCustomer?.name || 'غير محدد'}</span>
                          </div>
                          {!selectedCustomer || selectedCustomer.isDefault ? (
                            <p className="text-[9px] text-rose-600 font-bold">
                              * يلزم اختيار عميل مسجل من الشاشة لتقييد مبلغ ({formatMoney(reqAmt, storeInfo.currency)}) في حسابه.
                            </p>
                          ) : (
                            <p className="text-[9px] text-amber-800">
                              يضاف لحساب العميل: <span className="font-bold">{formatMoney(reqAmt, storeInfo.currency)}</span> (الرصيد الجديد: {formatMoney((selectedCustomer.balance || 0) + reqAmt, storeInfo.currency)})
                            </p>
                          )}
                        </div>
                      )}

                      {/* حقول التوثيق: رقم المرجع/الإيصال والملاحظة */}
                      <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-100">
                        <input
                          type="text"
                          placeholder="رقم المرجع / التفويض / الإيصال"
                          value={row.refNumber}
                          onChange={(e) => handleUpdateSplitRow(row.id, 'refNumber', e.target.value)}
                          className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-mono font-bold text-slate-800 focus:outline-none focus:bg-white"
                        />
                        <input
                          type="text"
                          placeholder="ملاحظة الدفعة (مثال: حول بنكي، قطة فلان)"
                          value={row.note}
                          onChange={(e) => handleUpdateSplitRow(row.id, 'note', e.target.value)}
                          className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-medium text-slate-800 focus:outline-none focus:bg-white"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* بطاقة ملخص حالة التوازن المالي الذكية */}
              <div className={`p-3 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-bold ${
                Math.abs(remainingSplitBalance) < 0.005
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : remainingSplitBalance > 0
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span>مجموع الدفعات:</span>
                    <span className="font-black font-mono text-sm">{totalSplitSum.toFixed(2)}</span>
                    <span>من إجمالي:</span>
                    <span className="font-black font-mono text-sm">{totals.total.toFixed(2)} {storeInfo.currency}</span>
                  </div>
                  {totalSplitChange > 0 && (
                    <p className="text-[11px] text-emerald-700 font-black">
                      💵 إجمالي الباقي المستحق للعميل نقداً: {formatMoney(totalSplitChange, storeInfo.currency)}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {Math.abs(remainingSplitBalance) < 0.005 ? (
                    <span className="flex items-center gap-1 text-emerald-700 font-black text-[11px] bg-emerald-100 px-2.5 py-1 rounded-xl">
                      <CheckCircle className="w-4 h-4" />
                      <span>مطابق 100% جاهز للدفع ✅</span>
                    </span>
                  ) : remainingSplitBalance > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-amber-800 font-bold">
                        متبقي: <strong className="font-mono text-amber-950">{remainingSplitBalance.toFixed(2)}</strong> {storeInfo.currency}
                      </span>
                      <button
                        type="button"
                        onClick={handleAutoBalanceLastRow}
                        className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-black shadow-xs transition active:scale-95"
                      >
                        تعبئة المتبقي ⚖️
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-rose-700 font-bold bg-rose-100 px-2.5 py-1 rounded-xl">
                      فائض عن الفاتورة: {Math.abs(remainingSplitBalance).toFixed(2)} {storeInfo.currency}
                    </span>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* حقل ملاحظات الفاتورة العامة */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">ملاحظات عامة على الفاتورة (تظهر في الإيصال):</label>
            <input
              type="text"
              placeholder="مثال: تغليف هدية خاص، توصيل للموقع، إلخ..."
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:bg-white focus:border-pink-400 transition"
            />
          </div>

          {/* رسالة الخطأ */}
          {error && (
            <div className="text-[11px] text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200 flex items-center gap-1.5 font-bold">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* زر التأكيد وإصدار الفاتورة */}
          <button
            type="button"
            onClick={handleComplete}
            disabled={isCompleting}
            className="w-full py-3.5 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-2xl text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-pink-600/30 transition active:scale-95 border border-pink-400/30 disabled:opacity-60 disabled:active:scale-100 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-5 h-5" />
            <span>{isCompleting ? 'جارٍ إصدار الفاتورة…' : 'تأكيد الدفع وإصدار الفاتورة 🌸'}</span>
          </button>

        </div>

      </div>
    </div>
  );
};
