import { checkUserPermission } from '../../utils/permissions';
import { AddServiceModal } from './AddServiceModal';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, Barcode, Trash2, User, CreditCard, ShoppingCart, X, Sparkles, Edit2, Package, AlertTriangle, ZoomIn, ZoomOut, CheckCircle2, Lock, ArrowLeft, Link2, PauseCircle } from 'lucide-react';
import { formatMoney, buildInvoiceWhatsAppMessage, getWhatsAppUrls } from '../../utils/helpers';
import { playBarcodeBeep, playWarningTone } from '../../utils/soundHelper';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { CheckoutModal } from './CheckoutModal';
import { ReceiptModal } from './ReceiptModal';
import { QuickCalculatorModal } from '../common/QuickCalculatorModal';
import { printInvoiceDirectly } from '../../utils/printHelper';
import { INITIAL_PAYMENT_METHODS } from '../../utils/initialData';
import { findLastClosedShift } from '../../utils/useShiftMetrics';
import { PaymentMethodIcon } from './PaymentMethodIcon';

export const PosRegister = ({ isCartOpen, setIsCartOpen }) => {
  const {
    products,
    categories,
    cart,
    addToCart,
    updateCartQty,
    updateCartItemPrice,
    updateCartItemTotal,
    updateCartItemDiscount,
    removeFromCart,
    clearCart,
    getCartTotals,
    selectedCustomer,
    setSelectedCustomer,
    customers,
    cartDiscount,
    setCartDiscount,
    storeInfo,
    activeShift,
    openNewShift,
    myPendingFloatTotal,
    shiftsHistory,
    currentUser,
    userShifts,
    users,
    checkout,
    updateProduct,
    holdCurrentCart,
    confirmDialog,
    promptDialog
  } = useApp();

  // ============ تعليق الفاتورة الحالية (Hold Bill) ============
  // مقيّدة بالصلاحية: pos_hold_bill (الإعدادات ← المستخدمون ← الصلاحيات)
  // تعليق الفواتير موقوف في النظام (canHoldBills من الإعدادات المركزية)
  const canHoldBill    = false;
  const canDeleteItem  = checkUserPermission(currentUser, 'pos_delete_item');
  const canClearCart   = checkUserPermission(currentUser, 'pos_clear_cart');
  const canCustomItem  = checkUserPermission(currentUser, 'pos_custom_item');
  const denyPos = (what) => alert(`⛔ ليس لديك صلاحية ${what}.\nتُمنح من: الإعدادات ← المستخدمون ← الصلاحيات.`);

  // حذف صنف من السلة — مقيّد بالصلاحية
  const handleRemoveFromCart = (pId) => {
    if (!canDeleteItem) return denyPos('حذف أصناف من السلة');
    removeFromCart(pId);
  };

  // إفراغ السلة — مقيّد بالصلاحية + تأكيد (كان يمسح فاتورة كاملة بنقرة واحدة)
  const handleClearCart = async () => {
    if (!canClearCart) return denyPos('إلغاء ومسح الفاتورة بالكامل');
    if (cart.length > 0) {
      const ok = await confirmDialog({
        title: 'إلغاء الفاتورة الحالية',
        message: `سيتم مسح ${cart.length} صنف من السلة وإلغاء الفاتورة الحالية.\n\nمتأكد؟`,
        confirmText: 'مسح السلة',
        tone: 'danger'
      });
      if (!ok) return;
    }
    clearCart();
  };

  const handleHoldCurrentBill = async () => {
    if (cart.length === 0) return;
    if (!canHoldBill) {
      alert('⛔ ليس لديك صلاحية تعليق الفواتير.\nتُمنح من: الإعدادات ← المستخدمون ← الصلاحيات ← "تعليق واسترجاع الفواتير".');
      return;
    }
    const label = await promptDialog({
      title: 'تعليق الفاتورة',
      message: 'اسم أو ملاحظة للفاتورة المعلقة (اختياري):',
      defaultValue: `فاتورة ${selectedCustomer?.name || 'عميل نقدي'} — ${new Date().toLocaleTimeString('ar-SA')}`,
      confirmText: 'تعليق'
    });
    if (label === null) return; // ألغى المستخدم
    const ok = holdCurrentCart(label.trim());
    if (ok && setIsCartOpen) setIsCartOpen(false);
  };

  const [selectedCatId, setSelectedCatId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [quickPrintNotice, setQuickPrintNotice] = useState(null);
  const quickPrintTimerRef = useRef(null);
  const [isOpenShiftModal, setIsOpenShiftModal] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [pendingProductToCart, setPendingProductToCart] = useState(null);

  // حالة نافذة الربط السريع لباركود المصنع
  const [isLinkBarcodeModalOpen, setIsLinkBarcodeModalOpen] = useState(false);
  const [codeToLink, setCodeToLink] = useState('');
  const [linkSearchQuery, setLinkSearchQuery] = useState('');

  // إعدادات ووسائل الدفع المعتمدة المدمجة بالسلة لشاشات الكمبيوتر
  const totals = getCartTotals();
  const paymentMethodsList = storeInfo?.paymentMethods || INITIAL_PAYMENT_METHODS;
  const enabledPaymentMethods = paymentMethodsList.filter(m => m.enabled);
  const paymentSettings = storeInfo?.paymentSettings || {};
  const defaultMethodObj = enabledPaymentMethods.find(m => m.id === paymentSettings.defaultMethod) || enabledPaymentMethods[0] || INITIAL_PAYMENT_METHODS[0];

  const [selectedDesktopMethod, setSelectedDesktopMethod] = useState(defaultMethodObj);
  const [desktopReceivedAmount, setDesktopReceivedAmount] = useState('');
  const [desktopPaymentError, setDesktopPaymentError] = useState('');

  useEffect(() => {
    if (totals.total > 0) {
      setDesktopReceivedAmount(String(totals.total.toFixed(2)));
    } else {
      setDesktopReceivedAmount('');
    }
    setDesktopPaymentError('');
  }, [totals.total]);

  useEffect(() => {
    if (enabledPaymentMethods.length > 0 && (!selectedDesktopMethod || !enabledPaymentMethods.some(m => m.id === selectedDesktopMethod.id))) {
      const def = enabledPaymentMethods.find(m => m.id === paymentSettings.defaultMethod) || enabledPaymentMethods[0];
      setSelectedDesktopMethod(def);
    }
  }, [storeInfo?.paymentMethods, storeInfo?.paymentSettings]);

  // آخر وردية مغلقة **زمنياً** لنفس المستخدم — مصدر الرصيد المرحَّل.
  // كانت `.find()` تُرجع أول عنصر في المصفوفة لا آخر وردية، وترتيب المصفوفة
  // بعد المزامنة غير موثوق. انظر findLastClosedShift في useShiftMetrics.js.
  const lastUserClosedShift = React.useMemo(
    () => findLastClosedShift(shiftsHistory, currentUser),
    [shiftsHistory, currentUser]
  );

  const allOpenShifts = React.useMemo(() => {
    const validUserIds = new Set((users || []).filter(u => u && u.isActive !== false).map(u => u.id));
    const validUserNames = new Set((users || []).filter(u => u && u.isActive !== false).map(u => String(u.name || '').trim().toLowerCase()));
    return Object.values(userShifts || {}).filter(s => {
      if (!s || s.isOpen !== true) return false;
      const uId = s.userId;
      const cName = String(s.cashierName || '').trim().toLowerCase();
      return (uId && validUserIds.has(uId)) || (cName && validUserNames.has(cName));
    });
  }, [userShifts, users]);

  // الوردية المفتوحة الفعالة لنقطة البيع الخاصة بالمستخدم الحالي حصراً
  const effectiveOpenShift = React.useMemo(() => {
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
  }, [activeShift, userShifts, currentUser?.id, shiftsHistory]);

  const isShiftOpen = Boolean(effectiveOpenShift && effectiveOpenShift.isOpen === true);

  const desktopNumReceived = Number(desktopReceivedAmount) || totals.total;
  const desktopChange = Math.max(0, desktopNumReceived - totals.total);

  const handleDesktopPayClick = async () => {
    if (cart.length === 0) return;
    if (!isShiftOpen) {
      setIsOpenShiftModal(true);
      return;
    }

    const method = selectedDesktopMethod || defaultMethodObj;
    const mType = method?.type || 'card';

    // إذا تم اختيار التقسيم، فتح نافذة التقسيم المخصصة
    if (mType === 'split') {
      setIsCheckoutOpen(true);
      return;
    }

    // إذا تم اختيار الآجل، التحقق من اختيار عميل مسجل
    if (mType === 'credit') {
      if (!selectedCustomer || selectedCustomer.isDefault) {
        setDesktopPaymentError('يجب اختيار عميل مسجل من أعلى السلة لإتمام البيع الآجل');
        return;
      }
    }

    // إذا تم اختيار كاش، التحقق من أن المبلغ كافي
    if (mType === 'cash') {
      if (desktopNumReceived < totals.total) {
        setDesktopPaymentError(`المبلغ المستلم (${desktopNumReceived.toFixed(2)}) أقل من الإجمالي (${totals.total.toFixed(2)})`);
        return;
      }
    }

    // إتمام الفاتورة فوراً بنقرة واحدة سريعة على الكمبيوتر
    const createdInvoice = await checkout({
      paymentMethod: method?.id || 'cash',
      paymentMethodName: method?.name || 'نقداً',
      paymentMethodType: mType,
      receivedAmount: mType === 'cash' ? desktopNumReceived : totals.total,
      changeAmount: mType === 'cash' ? desktopChange : 0,
      splitPayments: null,
      notes: '',
      customer: selectedCustomer
    });

    if (createdInvoice) {
      setDesktopPaymentError('');
      handleInvoiceCompletion(createdInvoice);
    }
  };

  const handleInvoiceCompletion = async (invoice) => {
    if (!invoice) return;
    setCompletedInvoice(invoice);

    const printSettings = storeInfo?.invoicePrintSettings || {};
    const autoPrintMode = printSettings.autoPrintMode || (printSettings.autoPrintOnCheckout !== false ? 'auto' : 'manual');
    const shouldSkipModal = printSettings.skipReceiptModalOnCheckout !== false && autoPrintMode !== 'manual' && autoPrintMode !== 'disabled';

    if (shouldSkipModal) {
      // 1. طباعة فورية صامتة في الخلفية دون أي نافذة منبثقة تعطل الكاشير
      try {
        await printInvoiceDirectly({
          invoice,
          storeInfo,
          users
        });
      } catch (err) {
        console.error('Direct background print error:', err);
      }

      // 2. إشعار عابر وأنيق في أعلى الشاشة يوضح نجاح العملية
      if (quickPrintTimerRef.current) clearTimeout(quickPrintTimerRef.current);
      setQuickPrintNotice({
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        invoice: invoice
      });
      quickPrintTimerRef.current = setTimeout(() => {
        setQuickPrintNotice(null);
      }, 5000);
    } else {
      setIsReceiptOpen(true);
    }
  };

  const getDesktopPayButtonText = () => {
    if (!isShiftOpen) return 'فتح وردية للبدء بالبيع 🔒';
    const m = selectedDesktopMethod || defaultMethodObj;
    if (m?.type === 'split') return 'تقسيم الدفع 🔀';
    if (m?.type === 'credit') return 'قيد على الحساب 👤';
    if (m?.type === 'cash') return `دفع كاش (${formatMoney(totals.total, storeInfo?.currency || 'ر.س')}) 💵`;
    return `دفع ${m?.name || 'شبكة'} (${formatMoney(totals.total, storeInfo?.currency || 'ر.س')}) 💳`;
  };

  const [openingCashInput, setOpeningCashInput] = useState(() => {
    if (lastUserClosedShift && typeof lastUserClosedShift.actualCash === 'number') {
      return String(lastUserClosedShift.actualCash);
    }
    return String(storeInfo?.defaultStartCash ?? storeInfo?.fixedOpeningCash ?? '0');
  });

  React.useEffect(() => {
    if (!isShiftOpen) {
      if (lastUserClosedShift && typeof lastUserClosedShift.actualCash === 'number') {
        setOpeningCashInput(String(lastUserClosedShift.actualCash));
      } else {
        setOpeningCashInput(String(storeInfo?.defaultStartCash ?? storeInfo?.fixedOpeningCash ?? '0'));
      }
    }
  }, [storeInfo?.defaultStartCash, storeInfo?.fixedOpeningCash, isShiftOpen, lastUserClosedShift]);

  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [editingPriceItem, setEditingPriceItem] = useState(null);
  const [priceEditMode, setPriceEditMode] = useState('total'); // 'total' or 'unit'
  const [priceInputTotal, setPriceInputTotal] = useState('');
  const [priceInputUnit, setPriceInputUnit] = useState('');

  const handlePriceClick = (item, initialMode = 'total') => {
    const hasPermission = checkUserPermission(currentUser, 'pos_price_override');
    if (!hasPermission) {
      alert('🚫 عذراً، ليس لديك صلاحية تعديل أسعار الأصناف في السلة!\nيرجى التواصل مع مدير النظام لتفعيل صلاحية تعديل السعر.');
      return;
    }

    const qty = Math.max(1, Number(item?.qty) || 1);
    const uPrice = Number(item?.unitPrice ?? item?.price ?? item?.product?.sellingPrice ?? 0);
    const currentLineTotal = Number(((uPrice * qty) - (item?.discount || 0)).toFixed(2));
    const currentUnit = Number(uPrice.toFixed(2));

    setEditingPriceItem({
      productId: item?.product?.id || item?.id,
      productName: item?.product?.name || item?.name || 'صنف',
      qty: qty,
      currentUnitPrice: currentUnit,
      currentLineTotal: currentLineTotal
    });
    setPriceEditMode(initialMode);
    setPriceInputTotal(String(currentLineTotal));
    setPriceInputUnit(String(currentUnit));
    setIsPriceModalOpen(true);
  };

  // تغيير الإجمالي وتحديث سعر الوحدة آلياً بالقسمة على عدد الحبات
  const handleTotalInputChange = (val) => {
    setPriceInputTotal(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && editingPriceItem) {
      const qty = Math.max(1, editingPriceItem.qty || 1);
      setPriceInputUnit((num / qty).toFixed(2));
    }
  };

  // تغيير سعر الوحدة وتحديث الإجمالي آلياً بالضرب في عدد الحبات
  const handleUnitInputChange = (val) => {
    setPriceInputUnit(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && editingPriceItem) {
      const qty = Math.max(1, editingPriceItem.qty || 1);
      setPriceInputTotal((num * qty).toFixed(2));
    }
  };

  const handleSaveNewPrice = (e) => {
    e.preventDefault();
    if (!editingPriceItem) return;

    if (priceEditMode === 'total') {
      const totalNum = Number(priceInputTotal);
      if (isNaN(totalNum) || totalNum < 0) {
        alert('يرجى إدخال إجمالي صحيح');
        return;
      }
      updateCartItemTotal(editingPriceItem.productId, totalNum);
    } else {
      const unitNum = Number(priceInputUnit);
      if (isNaN(unitNum) || unitNum < 0) {
        alert('يرجى إدخال سعر حبة صحيح');
        return;
      }
      updateCartItemPrice(editingPriceItem.productId, unitNum);
    }

    setIsPriceModalOpen(false);
    setEditingPriceItem(null);
  };

  const cartItemCount = cart.reduce((s, i) => s + i.qty, 0);

  const filteredProducts = products.filter(p => {
    if (p?.isArchived) return false; // المؤرشف لا يُباع
    const matchCat = selectedCatId === 'all' || p.categoryId === selectedCatId;
    const matchQuery = !searchQuery || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.barcode?.includes(searchQuery) ||
      p.factoryBarcode?.includes(searchQuery);
    return matchCat && matchQuery;
  });

  const handleProductClick = (product) => {
    if (!product) return;
    if (!isShiftOpen) {
      setPendingProductToCart(product);
      const defaultRollover = (lastUserClosedShift && typeof lastUserClosedShift.actualCash === 'number')
        ? String(lastUserClosedShift.actualCash)
        : String(storeInfo?.defaultStartCash ?? storeInfo?.fixedOpeningCash ?? '0');
      setOpeningCashInput(defaultRollover);
      setIsOpenShiftModal(true);
      return;
    }
    addToCart(product);
  };

  // مرجع تجميع حروف الباركود للماسح الضوئي (Hardware USB / Bluetooth Barcode Scanners)
  const scannerBufferRef = useRef('');
  const lastKeystrokeTimeRef = useRef(0);
  const searchInputRef = useRef(null);
  const [barcodeToast, setBarcodeToast] = useState(null);

  // التركيز التلقائي على خانة البحث فقط عند عدم وجود أي نافذة منبثقة
  useEffect(() => {
    const focusSearch = () => {
      const hasAnyModal = document.querySelector('.fixed.inset-0, [role="dialog"]') !== null;
      const activeEl = document.activeElement;
      const isFocusedOnInput = 
        activeEl && 
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT') && 
        activeEl !== searchInputRef.current;

      if (!hasAnyModal && !isFocusedOnInput && searchInputRef.current) {
        searchInputRef.current.focus();
      }
    };

    focusSearch();
  }, [isPriceModalOpen, isServiceModalOpen, isOpenShiftModal, isCheckoutOpen]);

  // معالج مسح الباركود الذكي العام: تسجيل الرقم في خانة البحث وإظهار المنتج فوراً (الباركود الرئيسي أو باركود المصنع)
  const handleProcessScannedBarcode = useCallback((scannedCode) => {
    const cleanCode = String(scannedCode || '').trim();
    if (!cleanCode) return false;

    // تسجيل رقم الباركود فوراً في خانة البحث لتظهر للمستخدم ويتم تصفية وإظهار المنتج
    setSearchQuery(cleanCode);

    // مطابقة الباركود مع قائمة الأصناف بالباركود الرئيسي أو باركود المصنع أو كود الصنف
    let matchedProduct = null;
    let isFactory = false;

    for (const p of products) {
      if (!p || p.isArchived) continue; // المؤرشف لا يُمسح باركوده للبيع
      const pBarcode = String(p.barcode || '').trim();
      const pFactory = String(p.factoryBarcode || '').trim();
      const pSku = String(p.sku || '').trim();

      if (pBarcode && (pBarcode === cleanCode || pBarcode.replace(/\s+/g, '') === cleanCode.replace(/\s+/g, ''))) {
        matchedProduct = p;
        break;
      }
      if (pFactory && (pFactory === cleanCode || pFactory.replace(/\s+/g, '') === cleanCode.replace(/\s+/g, ''))) {
        matchedProduct = p;
        isFactory = true;
        break;
      }
      if (pSku && pSku.toLowerCase() === cleanCode.toLowerCase()) {
        matchedProduct = p;
        break;
      }
    }

    if (matchedProduct) {
      if (!isShiftOpen) {
        setIsOpenShiftModal(true);
        playWarningTone();
        setBarcodeToast({
          type: 'warning',
          title: 'الوردية مغلقة',
          message: `تم قراءة باركود (${matchedProduct.name}) ولكن يرجى فتح الوردية أولاً لإتمام البيع.`
        });
        return true;
      }

      addToCart(matchedProduct);
      playBarcodeBeep();
      setBarcodeToast({
        type: 'success',
        product: matchedProduct,
        title: isFactory ? 'تم التعرف عبر باركود المصنع 🏭🏷️' : 'تم مسح الباركود وإظهار الصنف 🏷️',
        message: `${matchedProduct.name} • ${formatMoney(matchedProduct.sellingPrice, storeInfo?.currency || 'ر.س')}`
      });

      // تحديد النص داخل خانة البحث لتسهيل المسح التالي مباشرة مع بقاء الرقم والمنتج معروضين
      setTimeout(() => {
        if (searchInputRef.current && !document.querySelector('.fixed.inset-0, [role="dialog"]')) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      }, 60);

      return true;
    } else {
      playWarningTone();
      setBarcodeToast({
        type: 'error',
        canLink: true,
        code: cleanCode,
        title: 'باركود غير مسجل',
        message: `تم تسجيل الرقم (${cleanCode}) - يمكنك ربطه بمنتج كباركود مصنع الآن.`
      });
      return false;
    }
  }, [products, isShiftOpen, addToCart, storeInfo]);

  // تنفيذ ربط باركود المصنع بصنف محدد ثم إضافته فوراً للسلة
  const handleConfirmLinkBarcode = async (product) => {
    if (!product || !codeToLink) return;
    try {
      // كان الاستدعاء بمعامل واحد: updateProduct({...product}) بينما التوقيع
      // هو updateProduct(id, data) — فكان الشرط p.id === id لا يتحقق أبداً
      // ولا يُحفظ الباركود إطلاقاً بلا أي رسالة خطأ.
      await updateProduct(product.id, {
        ...product,
        factoryBarcode: codeToLink
      });
      setIsLinkBarcodeModalOpen(false);
      if (isShiftOpen) {
        addToCart(product);
      }
      playBarcodeBeep();
      setBarcodeToast({
        type: 'success',
        title: 'تم ربط باركود المصنع بنجاح! 🔗🏭',
        message: `تم ربط الباركود (${codeToLink}) بالصنف (${product.name}) وإضافته للسلة.`
      });
      setCodeToLink('');
    } catch (err) {
      console.error('Error linking factory barcode:', err);
    }
  };

  // إخفاء إشعار الباركود تلقائياً (إعطاء 8 ثوان إذا كان هناك زر ربط)
  useEffect(() => {
    if (!barcodeToast) return;
    const duration = barcodeToast.canLink ? 8000 : 3200;
    const timer = setTimeout(() => {
      setBarcodeToast(null);
    }, duration);
    return () => clearTimeout(timer);
  }, [barcodeToast]);

  // مستمع ضغطات المفاتيح الشامل للماسح الضوئي (Global Barcode Scanner Listener)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const activeEl = document.activeElement;
      
      const isUserFocusedOnAnotherInput = 
        activeEl && 
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable) &&
        activeEl !== searchInputRef.current;

      const hasAnyModalOpen = document.querySelector('.fixed.inset-0, [role="dialog"]') !== null;

      // إذا كان المستخدم يكتب في أي نافذة أو حقل إدخال آخر (مثل إغلاق الوردية، تعديل الأسعار، الخزينة)، نتجاهل الحدث تماماً
      if (isUserFocusedOnAnotherInput || (hasAnyModalOpen && activeEl !== searchInputRef.current)) {
        return;
      }

      const now = Date.now();
      const timeDiff = now - lastKeystrokeTimeRef.current;
      lastKeystrokeTimeRef.current = now;

      // إذا كان الفارق الزمني كبيراً (> 260ms)، نعتبره بداية مسح باركود جديد
      if (timeDiff > 260) {
        scannerBufferRef.current = '';
      }

      // عند إرسال مفتاح Enter (نهاية قراءة الباركود من القارئ)
      if (e.key === 'Enter') {
        const codeToProcess = scannerBufferRef.current.trim() || searchQuery.trim();
        
        if (codeToProcess.length >= 1) {
          e.preventDefault();
          e.stopPropagation();
          handleProcessScannedBarcode(codeToProcess);
          scannerBufferRef.current = '';
          return;
        }

        scannerBufferRef.current = '';
        return;
      }

      // تجميع الأحرف والأرقام الممسوحة
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        scannerBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [handleProcessScannedBarcode, isPriceModalOpen, isServiceModalOpen, isOpenShiftModal, isCheckoutOpen, searchQuery]);

  const handleBarcodeSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    handleProcessScannedBarcode(searchQuery.trim());
  };



  // العهدة المُسلّمة هي الرصيد الافتتاحي المثبَّت — نعرضها في الحقل مباشرة
  useEffect(() => {
    if (myPendingFloatTotal > 0) setOpeningCashInput(String(myPendingFloatTotal));
  }, [myPendingFloatTotal]);

  const handleOpenShift = async (e) => {
    e.preventDefault();
    // لا نرفض ونغلق النافذة: openNewShift نفسه يكتشف الوردية القائمة
    // ويستأنفها ويُعلم المستخدم. الرفض هنا كان يترك الكاشير عالقاً:
    // لا وردية فعّالة على الشاشة، ولا يُسمح له بفتح واحدة.
    // `await` ضروري: فتح الوردية صار غير متزامن (قد يسأل عن وردية سابقة
    // مفتوحة)، وإضافة الصنف المعلّق أدناه ترفضها الدالة إن لم تكن الوردية
    // قد فُتحت فعلاً — فيختفي الصنف بلا رسالة ويظنّ الكاشير أنه أُضيف.
    await openNewShift(Number(openingCashInput) || 0);
    setIsOpenShiftModal(false);
    if (pendingProductToCart) {
      const prod = pendingProductToCart;
      setPendingProductToCart(null);
      setTimeout(() => {
        addToCart(prod);
      }, 50);
    }
  };

  // تحديد عدد الأعمدة في السطر الواحد (الافتراضي 8 منتجات في السطر، النطاق: من 4 إلى 12 منتج)
  const [columnsCount, setColumnsCount] = useState(() => {
    const saved = localStorage.getItem('naif_pos_cols');
    const val = saved ? Number(saved) : (storeInfo?.posColumns || 8);
    if (!val || isNaN(val) || val < 4) return 8;
    if (val > 12) return 12;
    return val;
  });

  const handleSetColumns = (cols) => {
    const clamped = Math.min(12, Math.max(4, Number(cols)));
    setColumnsCount(clamped);
    localStorage.setItem('naif_pos_cols', String(clamped));
  };

  // شبكة الأعمدة المنسقة تلقائياً مع حجم الشاشة وعدد الأعمدة المختار (من 4 حتى 12 منتج بالسطر)
  const gridClasses = {
    12: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-1',
    11: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-11 gap-1',
    10: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-10 gap-1 sm:gap-1.5',
    9:  'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-9 gap-1 sm:gap-1.5',
    8:  'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2',
    7:  'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-1.5 sm:gap-2',
    6:  'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2',
    5:  'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-2.5',
    4:  'grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-2 sm:gap-3',
  }[columnsCount] || 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2';

  return (
    <div className="p-2 sm:p-3 lg:p-4 max-w-full mx-auto select-none font-cairo relative h-full">
      
      {/* إشعار مسح الباركود التفاعلي الفوري */}
      {barcodeToast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-2xl border backdrop-blur-md flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-4 duration-300 max-w-md ${
          barcodeToast.type === 'success'
            ? 'bg-slate-900/95 text-white border-emerald-500/50 shadow-emerald-950/40'
            : barcodeToast.type === 'warning'
            ? 'bg-amber-950/95 text-amber-100 border-amber-500/50 shadow-amber-950/40'
            : 'bg-rose-950/95 text-rose-100 border-rose-500/50 shadow-rose-950/40'
        }`}>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            barcodeToast.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
          }`}>
            {barcodeToast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-xs block truncate">{barcodeToast.title}</span>
              <span className="text-[10px] font-mono opacity-70">🏷️ مسح باركود</span>
            </div>
            <p className="text-[11px] font-bold opacity-90 truncate mt-0.5">{barcodeToast.message}</p>
          </div>
          {barcodeToast.canLink && (
            <button
              type="button"
              onClick={() => {
                setCodeToLink(barcodeToast.code);
                setLinkSearchQuery('');
                setIsLinkBarcodeModalOpen(true);
                setBarcodeToast(null);
              }}
              className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-xl shadow-lg transition active:scale-95 shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>ربطه بمنتج</span>
            </button>
          )}
          <button 
            type="button" 
            onClick={() => setBarcodeToast(null)}
            className="text-white/60 hover:text-white p-1 rounded-lg text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* شريط تنبيه الوردية في حال كانت مغلقة للمستخدم الحالي */}
      {!isShiftOpen && (
        <div 
          onClick={() => setIsOpenShiftModal(true)}
          className="p-3 bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-purple-500/20 border-2 border-amber-400/50 rounded-2xl flex items-center justify-between text-xs shadow-md mb-3 cursor-pointer hover:border-pink-500 transition group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/25 text-amber-700 flex items-center justify-center font-bold shrink-0 shadow-inner">
              <AlertTriangle className="w-4 h-4 animate-bounce text-amber-600" />
            </div>
            <div>
              <span className="font-extrabold text-slate-900 block text-xs sm:text-sm">
                ⛔ الوردية مغلقة حالياً للكاشير: ({currentUser?.name || 'كاشير بيت الورد'})
              </span>
              <span className="text-[10px] sm:text-xs text-rose-700 font-bold">
                اضغط هنا لفتح ورديتك وتوثيق العهدة النقدية الافتتاحية للبدء بالبيع 🌸
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpenShiftModal(true);
            }}
            className="px-3.5 py-1.5 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 text-white rounded-xl text-xs font-black shadow-md shadow-pink-600/30 transition active:scale-95 shrink-0"
          >
            فتح الوردية 🌸
          </button>
        </div>
      )}

      {/* الحاوية المتجاوبة الذكية: شاشة منقسمة للكمبيوتر (lg+) وعرض مريح للجوال */}
      <div className="flex flex-col lg:flex-row gap-4 h-full items-start">
        
        {/* قسم المنتجات (الجهة اليمنى في RTL) */}
        <div className="flex-1 w-full space-y-3 pb-32 lg:pb-6 min-w-0">
          
          {/* شريط البحث + أزرار الأعمدة (4 | 3 | 2) + التصنيفات */}
          <div className="sticky top-0 z-20 bg-white/98 backdrop-blur-md pb-2.5 pt-1 border-b border-pink-100/90 shadow-xs space-y-2 -mx-2 sm:-mx-3 px-2 sm:px-3 -mt-2">
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* حقل البحث بالاسم أو الباركود */}
              <form onSubmit={handleBarcodeSearchSubmit} className="relative flex-1">
                <Search className="w-4 h-4 absolute right-3 top-2.5 text-pink-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث باسم الصنف أو امسح الباركود مباشرة..."
                  className="w-full pl-3 pr-9 py-2 bg-pink-50/50 border border-pink-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white transition placeholder:text-slate-400 font-mono"
                />
                {searchQuery && (
                  <button 
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute left-2.5 top-2.5 text-pink-400 hover:text-pink-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </form>

              {/* أداة عدسة الزوم فقط: تبدأ من 4 منتجات حتى 12 منتج (الافتراضي 8) بدون شريط الأرقام */}
              <div className="flex items-center bg-white/95 backdrop-blur-md p-1 rounded-2xl border border-pink-200/90 shadow-xs shrink-0 gap-1 font-mono">
                {/* عدسة تقليل عدد المنتجات في السطر (-) */}
                <button
                  type="button"
                  onClick={() => handleSetColumns(columnsCount - 1)}
                  disabled={columnsCount <= 4}
                  className={`p-1.5 sm:p-2 rounded-xl transition flex items-center justify-center active:scale-90 ${
                    columnsCount <= 4 
                      ? 'text-slate-300 cursor-not-allowed bg-slate-50' 
                      : 'text-pink-600 hover:text-white hover:bg-gradient-to-r hover:from-pink-600 hover:to-rose-600 bg-pink-50/80 shadow-xs'
                  }`}
                  title="عدسة تقليل الأعمدة (-) (الحد الأدنى 4 منتجات)"
                >
                  <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>

                {/* رقم عدد المنتجات الفعلي الحالي فقط */}
                <span className="w-5 text-center text-xs font-black text-pink-700 select-none">
                  {columnsCount}
                </span>

                {/* عدسة زيادة عدد المنتجات في السطر (+) */}
                <button
                  type="button"
                  onClick={() => handleSetColumns(columnsCount + 1)}
                  disabled={columnsCount >= 12}
                  className={`p-1.5 sm:p-2 rounded-xl transition flex items-center justify-center active:scale-90 ${
                    columnsCount >= 12 
                      ? 'text-slate-300 cursor-not-allowed bg-slate-50' 
                      : 'text-pink-600 hover:text-white hover:bg-gradient-to-r hover:from-pink-600 hover:to-rose-600 bg-pink-50/80 shadow-xs'
                  }`}
                  title="عدسة زيادة الأعمدة (+) (الحد الأقصى 12 منتج)"
                >
                  <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>

                            {/* زر إضافة وبيع خدمة سريعة */}
              <button
                type="button"
                onClick={() => {
                  if (!isShiftOpen) {
                    setIsOpenShiftModal(true);
                    return;
                  }
                  if (!canCustomItem) return denyPos('إضافة صنف حر / مخصص');
                  setIsServiceModalOpen(true);
                }}
                className="px-2.5 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 text-white rounded-xl shadow-xs transition active:scale-95 shrink-0 flex items-center gap-1 text-xs font-bold"
                title="إضافة وبيع خدمة (تنسيق، توصيل، تغليف...)"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">إضافة خدمة</span>
              </button>

              {/* زر الماسح */}
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="p-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 text-white rounded-xl shadow-xs transition active:scale-95 shrink-0"
                title="مسح باركود بالكاميرا"
              >
                <Barcode className="w-4 h-4" />
              </button>
            </div>

            {/* شريط التصنيفات الأفقي السلس */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs">
              <button
                type="button"
                onClick={() => setSelectedCatId('all')}
                className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap transition shrink-0 text-xs ${
                  selectedCatId === 'all'
                    ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-xs font-black'
                    : 'bg-pink-50/70 text-slate-700 hover:bg-pink-100 border border-pink-200/60'
                }`}
              >
                الكل 🌸
              </button>

              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCatId(cat.id)}
                  className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap transition shrink-0 text-xs ${
                    selectedCatId === cat.id
                      ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-xs font-black'
                      : 'bg-pink-50/70 text-slate-700 hover:bg-pink-100 border border-pink-200/60'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* شبكة المنتجات العصرية الأنيقة - مربعة بالكامل والصورة تملأ الإطار والاسم والسعر بالداخل */}
          <div className={`grid ${gridClasses}`}>
            {filteredProducts.map(product => {
              const inCartItem = (cart || []).find(i => (i.product?.id || i.id) === product.id);
              return (
                <div
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  className={`aspect-square w-full rounded-2xl sm:rounded-3xl overflow-hidden relative cursor-pointer group select-none transition-all duration-200 active:scale-95 shadow-xs hover:shadow-lg ${
                    inCartItem
                      ? 'border-2 border-pink-600 ring-2 ring-pink-400/80 shadow-[0_0_16px_rgba(236,72,153,0.45)]'
                      : 'border-2 border-pink-400 sm:border-pink-500 hover:border-pink-600 shadow-sm hover:shadow-md hover:shadow-pink-500/20'
                  }`}
                >
                  {/* شارة الكمية بالسلة (رقم نقي بدون نص) */}
                  {inCartItem && (
                    <span className={`absolute top-1.5 left-1.5 z-20 ${
                      columnsCount >= 7 ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-xs'
                    } rounded-full bg-gradient-to-tr from-pink-600 to-rose-600 text-white font-black flex items-center justify-center shadow-lg ring-2 ring-white animate-in zoom-in-75`}>
                      {inCartItem.qty}
                    </span>
                  )}

                  {/* شارة صنف خدمي أو رصيد المخزون المتوفر */}
                  {product.isService ? (
                    <span className={`absolute top-1.5 right-1.5 z-20 ${
                      columnsCount >= 7 ? 'px-1 py-0.5 text-[8px]' : 'px-1.5 py-0.5 text-[9px] sm:text-[10px]'
                    } rounded-full font-black shadow-md backdrop-blur-md bg-purple-700/90 text-white border border-white/80 flex items-center gap-0.5`}>
                      <span>✨ خدمة</span>
                    </span>
                  ) : (
                    storeInfo?.showStockInPos !== false && (
                      product.stock <= 0 ? (
                        <span className={`absolute top-1.5 right-1.5 z-20 ${
                          columnsCount >= 7 ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 sm:w-6 sm:h-6 text-[10px] sm:text-xs'
                        } rounded-full font-black shadow-md backdrop-blur-md bg-rose-600 text-white flex items-center justify-center border border-white/80`} title="نفد المخزون">
                          ✕
                        </span>
                      ) : product.stock <= (product.minStock || 3) ? (
                        <span className={`absolute top-1.5 right-1.5 z-20 ${
                          columnsCount >= 7 ? 'px-1 py-0.2 text-[8px]' : 'px-1.5 py-0.5 text-[9px] sm:text-[10px]'
                        } rounded-full font-black shadow-md backdrop-blur-md bg-amber-500/95 text-white border border-white/80 flex items-center gap-0.5`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                          <span>{product.stock}</span>
                        </span>
                      ) : null
                    )
                  )}

                  {/* صورة المنتج بكامل الإطار المربع */}
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-rose-100/90 via-pink-50 to-purple-100/80 flex items-center justify-center relative">
                      <div className={`${
                        columnsCount >= 7 ? 'w-8 h-8 text-base' : columnsCount >= 5 ? 'w-10 h-10 text-xl' : 'w-12 h-12 sm:w-14 sm:h-14 text-2xl'
                      } rounded-2xl bg-white/80 backdrop-blur-xs border border-pink-200/60 flex items-center justify-center shadow-xs transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-300`}>
                        🌸
                      </div>
                    </div>
                  )}

                  {/* الاسم والسعر بداخل الصورة - خلفية رمادي شفاف مع إطار خفيف متوهج خفيف */}
                  <div className="absolute inset-x-1 sm:inset-x-1.5 bottom-1 sm:bottom-1.5 z-10">
                    <div 
                      className={`rounded-xl sm:rounded-2xl transition-all duration-300 backdrop-blur-md ${
                        columnsCount >= 7 ? 'p-1' : 'p-1.5 sm:p-2'
                      } border border-pink-300/80 shadow-[0_0_8px_rgba(244,114,182,0.35)] group-hover:border-pink-400 group-hover:shadow-[0_0_12px_rgba(236,72,153,0.5)] ${
                        inCartItem
                          ? 'ring-1 ring-pink-400/60 shadow-[0_0_12px_rgba(236,72,153,0.5)]'
                          : ''
                      }`}
                      style={{
                        background: 'radial-gradient(ellipse at center, rgba(241, 245, 249, 0.70) 0%, rgba(203, 213, 225, 0.52) 70%, rgba(148, 163, 184, 0.38) 100%)'
                      }}
                    >
                      {/* اسم المنتج بخط أسود عريض متوهج */}
                      <h4 className={`font-black text-black line-clamp-1 leading-tight text-right [text-shadow:_0_0_8px_#ffffff,_0_0_16px_#ffffff,_0_0_22px_rgba(255,255,255,0.9),_0_1px_2px_#ffffff] drop-shadow-[0_0_6px_rgba(255,255,255,1)] ${
                        columnsCount >= 10 ? 'text-[9px]' : columnsCount >= 7 ? 'text-[10px] sm:text-[11px]' : columnsCount >= 5 ? 'text-xs' : 'text-xs sm:text-sm'
                      }`}>
                        {product.name}
                      </h4>

                      {/* الباركود إن وجد ومفعل بالخيارات */}
                      {storeInfo?.showBarcodeInPos && product.barcode && columnsCount <= 5 && (
                        <span className="text-[9px] font-mono font-bold text-slate-800 block truncate leading-none mt-0.5 [text-shadow:_0_0_6px_#ffffff]">
                          {product.barcode}
                        </span>
                      )}

                      {/* السعر أحمر عريض متوهج أبيض + زر الإضافة (+) */}
                      <div className="flex items-center justify-between gap-1 pt-0.5 mt-0.5">
                        <span className={`font-black text-red-600 font-mono [text-shadow:_0_0_4px_#ffffff,_0_0_8px_#ffffff,_0_0_14px_#ffffff,_0_0_22px_rgba(255,255,255,0.95),_0_1px_2px_#ffffff] drop-shadow-[0_0_6px_rgba(255,255,255,1)] leading-none ${
                          columnsCount >= 10 ? 'text-[9px]' : columnsCount >= 7 ? 'text-[10px] sm:text-[11px]' : columnsCount >= 5 ? 'text-xs sm:text-sm' : 'text-xs sm:text-sm'
                        }`}>
                          {formatMoney(product.sellingPrice, storeInfo?.currency || 'ر.س')}
                        </span>
                        <span className={`rounded-lg bg-gradient-to-tr from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white flex items-center justify-center font-black shadow-[0_0_8px_rgba(255,255,255,0.9)] ring-1 ring-white/80 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                          columnsCount >= 10 ? 'w-3.5 h-3.5 text-[8px]' : columnsCount >= 7 ? 'w-4 h-4 text-[9px]' : 'w-4 h-4 sm:w-5 sm:h-5 text-[10px] sm:text-xs'
                        }`}>
                          +
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredProducts.length === 0 && (
            <div className="bg-white rounded-3xl p-10 text-center text-slate-400 border border-pink-100 space-y-2">
              <Package className="w-10 h-10 mx-auto text-pink-300 stroke-[1.5]" />
              <p className="text-xs font-bold">لا توجد منتجات مطابقة لنتيجة البحث</p>
            </div>
          )}
        </div>

        {/* لوحة السلة الثابتة الذكية لمتصفح الكمبيوتر (Desktop Fixed Cart Panel) - تظهر فقط في الشاشات العريضة lg+ */}
        <div className="hidden lg:flex w-[380px] xl:w-[420px] 2xl:w-[450px] shrink-0 bg-white rounded-3xl border border-pink-100 shadow-xl p-3.5 flex-col gap-2.5 sticky top-3 max-h-[calc(100vh-80px)] overflow-y-auto scrollbar-thin">
          
          {/* رأس السلة */}
          <div className="flex items-center justify-between pb-2 border-b border-pink-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center font-black">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <span>الفاتورة</span>
                  {/* =========================================================
                       الحاسبة: مساحة لمس لا أيقونة زينة
                       =========================================================
                       كانت 24×24 بكسل داخل سطر العنوان — أقل من نصف الحد
                       الأدنى لهدف اللمس (44 بكسل)، فيخطئها الإصبع ويضغط
                       العنوان بجوارها. 44×44 مع هامش يفصلها عن النص. */}
                  <button
                    type="button"
                    onClick={() => setIsCalculatorOpen(true)}
                    title="آلة حاسبة سريعة"
                    aria-label="آلة حاسبة سريعة"
                    className="w-11 h-11 shrink-0 rounded-xl bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-200 text-xl leading-none flex items-center justify-center transition active:scale-95 shadow-xs"
                  >
                    🧮
                  </button>
                </h3>
                <span className="text-[11px] text-pink-600 font-bold">{cartItemCount} أصناف بالسلة</span>
              </div>
            </div>
            {cart.length > 0 && (
              <div className="flex items-center gap-1">
                {canHoldBill && (
                  <button
                    type="button"
                    onClick={handleHoldCurrentBill}
                    title="تعليق الفاتورة مؤقتاً والعودة لها لاحقاً"
                    className="px-2.5 py-1 text-amber-600 hover:bg-amber-50 rounded-xl text-xs font-bold transition flex items-center gap-1"
                  >
                    <PauseCircle className="w-3.5 h-3.5" />
                    <span>تعليق</span>
                  </button>
                )}
                <button 
                  type="button" 
                  onClick={handleClearCart} 
                  className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>إفراغ</span>
                </button>
              </div>
            )}
          </div>

          {/* اختيار العميل */}
          <div className="flex items-center justify-between p-2.5 bg-pink-50/50 rounded-2xl border border-pink-100 text-xs">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-pink-600" />
              <span className="font-bold text-slate-800">{selectedCustomer?.name || 'عميل نقدي عام'}</span>
            </div>
            <select
              value={selectedCustomer?.id || ''}
              onChange={(e) => {
                const cust = customers.find(c => c.id === e.target.value);
                if (cust) setSelectedCustomer(cust);
              }}
              className="bg-white px-2 py-1 rounded-lg border border-pink-200 font-bold text-pink-700 text-xs focus:outline-none cursor-pointer"
            >
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* قائمة أصناف الفاتورة */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[100px] max-h-[220px] scrollbar-thin">
            {cart.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-slate-400 gap-2 border-2 border-dashed border-pink-100 rounded-2xl">
                <ShoppingCart className="w-8 h-8 text-pink-200" />
                <span className="text-xs font-bold">السلة فارغة، اختر الأصناف للإضافة</span>
              </div>
            ) : (
              (cart || []).map(item => {
                const pId = item.product?.id || item.id || `temp-${Math.random()}`;
                const pName = item.product?.name || item.name || 'صنف';
                const uPrice = Number(item.unitPrice ?? item.price ?? item.product?.sellingPrice ?? 0);
                const q = Number(item.qty ?? item.quantity ?? 1);
                const disc = Number(item.discount || 0);
                const lineTotal = (uPrice * q) - disc;

                return (
                  <div key={pId} className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5 text-xs hover:border-pink-200 transition">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 truncate max-w-[200px]">{pName}</span>
                      <button
                        type="button"
                        onClick={() => handlePriceClick(item, 'total')}
                        className="font-black text-pink-700 hover:text-pink-900 bg-pink-50 hover:bg-pink-100/80 px-2 py-0.5 rounded-lg border border-pink-200/80 transition flex items-center gap-1 cursor-pointer active:scale-95 text-xs shadow-2xs"
                        title="انقر لتعديل الإجمالي والقسمة التلقائية على عدد الحبات"
                      >
                        <span>{formatMoney(lineTotal, storeInfo?.currency || 'ر.س')}</span>
                        <Edit2 className="w-3 h-3 text-pink-500" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded-xl border border-pink-200">
                        <button
                          type="button"
                          onClick={() => updateCartQty(pId, q - 1)}
                          className="w-5 h-5 bg-pink-50 text-pink-700 rounded-lg flex items-center justify-center font-bold hover:bg-pink-100"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-black">{q}</span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(pId, q + 1)}
                          className="w-5 h-5 bg-pink-50 text-pink-700 rounded-lg flex items-center justify-center font-bold hover:bg-pink-100"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handlePriceClick(item, 'unit')}
                        className="text-[10px] text-slate-600 hover:text-pink-700 bg-slate-100 hover:bg-pink-50 px-1.5 py-0.5 rounded-md border border-dashed border-pink-300 transition flex items-center gap-1 cursor-pointer font-bold"
                        title="انقر لتعديل سعر الحبة الواحدة"
                      >
                        <span>{formatMoney(uPrice, storeInfo?.currency || 'ر.س')} × {q}</span>
                        <Edit2 className="w-2.5 h-2.5 text-pink-500" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveFromCart(pId)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ملخص الحسابات وأزرار الدفع */}
          <div className="space-y-1.5 pt-2 border-t border-pink-100 text-xs">
            {totals.totalDiscount > 0 && (
              <div className="flex justify-between text-rose-600 font-bold">
                <span>إجمالي الخصم:</span>
                <span>-{formatMoney(totals.totalDiscount, storeInfo?.currency || 'ر.س')}</span>
              </div>
            )}

            {/* تفصيل الحسابات حسب نظام الضريبة المختار */}
            {totals.isTaxActive ? (
              totals.isTaxInclusive ? (
                <>
                  <div className="flex justify-between text-slate-600">
                    <span>المبلغ الخاضع للضريبة:</span>
                    <span className="font-bold">{formatMoney(totals.taxableAmount, storeInfo?.currency || 'ر.س')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>ضريبة القيمة المضافة ({totals.taxRate}% مشمولة):</span>
                    <span className="font-bold text-pink-700">{formatMoney(totals.taxAmount, storeInfo?.currency || 'ر.س')}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-slate-600">
                    <span>المجموع الفرعي (غير شامل):</span>
                    <span className="font-bold">{formatMoney(totals.discountedTotal, storeInfo?.currency || 'ر.س')}</span>
                  </div>
                  <div className="flex justify-between text-purple-700 font-bold">
                    <span>ضريبة القيمة المضافة (+{totals.taxRate}% مضافة):</span>
                    <span>+{formatMoney(totals.taxAmount, storeInfo?.currency || 'ر.س')}</span>
                  </div>
                </>
              )
            ) : (
              <div className="flex justify-between text-slate-600">
                <span>المجموع:</span>
                <span className="font-bold">{formatMoney(totals.discountedTotal, storeInfo?.currency || 'ر.س')}</span>
              </div>
            )}

            <div className="flex justify-between font-black text-sm text-slate-900 pt-1.5 border-t border-pink-100">
              <span>الإجمالي النهائي:</span>
              <span className="text-lg text-pink-700">{formatMoney(totals.total, storeInfo?.currency || 'ر.س')}</span>
            </div>

            {/* قسم اختيار وسيلة الدفع المدمج بالسلة لمتصفح الكمبيوتر (Desktop Integrated Payment Selector) */}
            <div className="pt-2 border-t border-pink-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-pink-600" />
                  <span>اختر وسيلة الدفع:</span>
                </span>
                <span className="text-[11px] font-black text-pink-700 bg-pink-100/80 px-2 py-0.5 rounded-full border border-pink-200 flex items-center gap-1 shadow-2xs">
                  <span>{selectedDesktopMethod?.name || 'نقداً'}</span>
                  <span>💳</span>
                </span>
              </div>

              {/* بطاقات وسائل الدفع الأنيقة - مظهر مطابق ومدمج بالسلة */}
              <div className="grid grid-cols-4 gap-1.5">
                {enabledPaymentMethods.map((m) => {
                  const isSelected = selectedDesktopMethod?.id === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedDesktopMethod(m);
                        setDesktopPaymentError('');
                      }}
                      title={m.name}
                      className={`p-1.5 rounded-2xl border flex flex-col items-center justify-center text-center transition active:scale-95 relative cursor-pointer group ${
                        isSelected
                          ? 'bg-gradient-to-b from-pink-50 to-purple-50 border-pink-600 ring-2 ring-pink-500 shadow-md shadow-pink-500/20'
                          : 'bg-white/90 border-pink-100 hover:border-pink-300 hover:bg-pink-50/40 shadow-xs'
                      }`}
                    >
                      {/* أيقونة / شعار وسيلة الدفع */}
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${m.color || 'from-pink-600 to-purple-600'} text-white flex items-center justify-center shadow-xs overflow-hidden border border-white/80 transition relative`}>
                        <PaymentMethodIcon method={m} className="w-6 h-6" />

                        {/* شارة التحديد */}
                        {isSelected && (
                          <span className="absolute top-0.5 right-0.5 w-3 h-3 bg-pink-600 text-white text-[7px] font-black rounded-full flex items-center justify-center shadow">
                            ✓
                          </span>
                        )}
                      </div>

                      {/* اسم وسيلة الدفع */}
                      <span className={`text-[10px] mt-1 font-bold truncate max-w-full block ${isSelected ? 'text-pink-900 font-black' : 'text-slate-600'}`}>
                        {m.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* محتوى الدفع النقدي في السلة (كاش) */}
              {selectedDesktopMethod?.type === 'cash' && (
                <div className="space-y-1.5 p-2 bg-pink-50/50 rounded-2xl border border-pink-200">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                    <span>المبلغ المستلم نقداً:</span>
                    {desktopChange > 0 && (
                      <span className="text-emerald-700 font-black">
                        الباقي: {formatMoney(desktopChange, storeInfo?.currency || 'ر.س')}
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={desktopReceivedAmount}
                      onChange={e => {
                        setDesktopReceivedAmount(e.target.value);
                        setDesktopPaymentError('');
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-pink-300 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-500 text-center shadow-inner"
                      placeholder={totals.total.toFixed(2)}
                    />
                    <span className="absolute left-2.5 top-1.5 text-[10px] text-pink-500 font-bold">
                      {storeInfo?.currency || 'ر.س'}
                    </span>
                  </div>

                  {/* أزرار الفئات النقدية السريعة */}
                  <div className="grid grid-cols-5 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDesktopReceivedAmount(String(totals.total.toFixed(2)));
                        setDesktopPaymentError('');
                      }}
                      className="py-1 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-[9px] font-black transition active:scale-95"
                    >
                      المضبوط
                    </button>
                    {(storeInfo?.paymentSettings?.quickCashAmounts || [10, 50, 100, 500]).map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          setDesktopReceivedAmount(String(val));
                          setDesktopPaymentError('');
                        }}
                        className="py-1 bg-white hover:bg-pink-100 border border-pink-200 rounded-lg text-[9px] font-bold text-slate-800 transition active:scale-95"
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* تنبيه الدفع الآجل */}
              {selectedDesktopMethod?.type === 'credit' && (
                <div className={`p-2 rounded-xl border text-[11px] font-bold ${
                  selectedCustomer && !selectedCustomer.isDefault
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  {selectedCustomer && !selectedCustomer.isDefault ? (
                    <span>قيد الفاتورة على حساب العميل: <strong>{selectedCustomer.name}</strong></span>
                  ) : (
                    <span>⚠️ يرجى اختيار عميل مسجل من أعلى السلة لإتمام البيع الآجل</span>
                  )}
                </div>
              )}

              {/* تنبيه تقسيم الفاتورة */}
              {selectedDesktopMethod?.type === 'split' && (
                 <div className="p-2 bg-purple-50 border border-purple-200 rounded-xl text-[11px] font-bold text-purple-900 flex items-center justify-between">
                   <span>🔀 الدفع المتعدد (كاش + شبكة)</span>
                   <button
                     type="button"
                     onClick={() => {
                       if (!isShiftOpen) {
                         setIsOpenShiftModal(true);
                         return;
                       }
                       setIsCheckoutOpen(true);
                     }}
                     className="text-[10px] text-purple-700 underline font-bold"
                   >
                     تعديل الأجزاء
                   </button>
                 </div>
               )}

              {/* عرض الأخطاء إن وجدت */}
              {desktopPaymentError && (
                <div className="p-1.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[10px] font-bold text-center">
                  {desktopPaymentError}
                </div>
              )}
            </div>

            {/* زر الدفع المباشر بالسلة للكمبيوتر بعرض كامل */}
            <div className="pt-1.5">
              {!isShiftOpen ? (
                <button
                  type="button"
                  onClick={() => setIsOpenShiftModal(true)}
                  className="w-full py-3 bg-gradient-to-r from-amber-600 via-rose-600 to-purple-600 hover:from-amber-500 hover:to-rose-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 transition active:scale-95 animate-pulse cursor-pointer"
                  title="اضغط لفتح ورديتك وتسجيل العهدة"
                >
                  <AlertTriangle className="w-5 h-5 text-amber-200" />
                  <span className="truncate">فتح وردية للبدء بالبيع 🔒</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={handleDesktopPayClick}
                  className="w-full py-3 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 disabled:opacity-50 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-pink-600/30 transition active:scale-95"
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="truncate">{getDesktopPayButtonText()}</span>
                </button>
              )}
            </div>

            {/* خيارات متقدمة / تفاصيل كاملة */}
            <div className="flex justify-center pt-0.5">
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => {
                   if (!isShiftOpen) {
                     setIsOpenShiftModal(true);
                     return;
                   }
                   setIsCheckoutOpen(true);
                 }}
                className="text-[10px] text-pink-600 hover:text-pink-800 disabled:opacity-40 font-bold transition flex items-center gap-1"
              >
                <span>خيارات إضافية / تفاصيل الدفع</span>
                <ArrowLeft className="w-3 h-3 rotate-180" />
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* الشريط العائم لسلة المبيعات بالأسفل - يظهر على الجوال فقط (<lg) */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 px-3 max-w-md sm:max-w-2xl mx-auto animate-in slide-in-from-bottom duration-200">
          <div 
            onClick={() => setIsCartOpen(true)}
            className="bg-gradient-to-r from-[#2C0620] via-[#20052F] to-[#3B0730] text-white p-3 rounded-2xl shadow-xl shadow-pink-950/40 flex items-center justify-between border border-pink-500/40 cursor-pointer active:scale-98 transition"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-600 to-rose-600 flex items-center justify-center font-black text-xs shadow-md">
                {cartItemCount}
              </div>
              <div>
                <span className="font-extrabold text-xs block text-white">سلة المبيعات ({cartItemCount} صنف)</span>
                <span className="text-[10px] text-pink-200/90 font-medium">اضغط لعرض الفاتورة 🛒</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-black text-xs sm:text-sm text-pink-300">{formatMoney(totals.total, storeInfo?.currency || 'ر.س')}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isShiftOpen) {
                    setIsOpenShiftModal(true);
                    return;
                  }
                  setIsCheckoutOpen(true);
                }}
                className="px-3.5 py-1.5 bg-gradient-to-r from-pink-500 via-rose-500 to-purple-600 hover:from-pink-400 text-white rounded-xl text-xs font-black shadow-md shadow-pink-600/30 transition active:scale-95"
              >
                دفع 💳
              </button>
            </div>
          </div>
        </div>
      )}

      {/* درج / نافذة سلة المبيعات المنبثقة للجوال (<lg) */}
      {isCartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-4 space-y-3 border border-pink-100 max-h-[85vh] flex flex-col">
            
            <div className="flex items-center justify-between pb-2 border-b border-pink-100">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-pink-600" />
                <h3 className="font-black text-sm text-slate-900">سلة المبيعات ({cartItemCount})</h3>
              </div>
              <div className="flex items-center gap-2">
                {cart.length > 0 && canHoldBill && (
                  <button type="button" onClick={handleHoldCurrentBill} className="text-amber-600 hover:text-amber-700 text-xs font-bold flex items-center gap-1">
                    <PauseCircle className="w-3.5 h-3.5" />
                    تعليق
                  </button>
                )}
                {cart.length > 0 && (
                  <button type="button" onClick={handleClearCart} className="text-rose-600 hover:text-rose-700 text-xs font-bold">
                    إفراغ
                  </button>
                )}
                <button onClick={() => setIsCartOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* اختيار العميل */}
            <div className="flex items-center justify-between p-2.5 bg-pink-50/40 rounded-2xl border border-pink-100 text-xs">
              <span className="font-bold text-slate-800">{selectedCustomer?.name || 'عميل نقدي عام'}</span>
              <select
                value={selectedCustomer?.id || ''}
                onChange={(e) => {
                  const cust = customers.find(c => c.id === e.target.value);
                  if (cust) setSelectedCustomer(cust);
                }}
                className="bg-transparent font-bold text-pink-700 text-xs focus:outline-none"
              >
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* قائمة أصناف السلة */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[140px]">
              {(cart || []).map(item => {
                const pId = item.product?.id || item.id || `temp-${Math.random()}`;
                const pName = item.product?.name || item.name || 'صنف';
                const uPrice = Number(item.unitPrice ?? item.price ?? item.product?.sellingPrice ?? 0);
                const q = Number(item.qty ?? item.quantity ?? 1);
                const disc = Number(item.discount || 0);
                const lineTotal = (uPrice * q) - disc;

                return (
                  <div key={pId} className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 truncate max-w-[180px]">{pName}</span>
                      <button
                        type="button"
                        onClick={() => handlePriceClick(item, 'total')}
                        className="font-black text-pink-700 hover:text-pink-900 bg-pink-50 hover:bg-pink-100 px-2 py-0.5 rounded-lg border border-pink-200 transition flex items-center gap-1 cursor-pointer active:scale-95 text-xs"
                        title="انقر لتعديل الإجمالي والقسمة التلقائية على عدد الحبات"
                      >
                        <span>{formatMoney(lineTotal, storeInfo?.currency || 'ر.س')}</span>
                        <Edit2 className="w-3 h-3 text-pink-500" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-pink-200">
                        <button
                          type="button"
                          onClick={() => updateCartQty(pId, q - 1)}
                          className="w-5 h-5 bg-pink-50 text-pink-700 rounded-lg flex items-center justify-center font-bold"
                        >
                          -
                        </button>
                        <span className="w-5 text-center font-bold">{q}</span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(pId, q + 1)}
                          className="w-5 h-5 bg-pink-50 text-pink-700 rounded-lg flex items-center justify-center font-bold"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handlePriceClick(item, 'unit')}
                        className="text-[10px] text-slate-600 hover:text-pink-700 bg-slate-100 hover:bg-pink-50 px-1.5 py-0.5 rounded-md border border-dashed border-pink-300 transition flex items-center gap-1 cursor-pointer font-bold"
                        title="انقر لتعديل سعر الحبة الواحدة"
                      >
                        <span>{formatMoney(uPrice, storeInfo?.currency || 'ر.س')} × {q}</span>
                        <Edit2 className="w-2.5 h-2.5 text-pink-500" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveFromCart(pId)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ملخص وأزرار الدفع */}
            <div className="space-y-2 pt-2 border-t border-pink-100 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي:</span>
                <span className="font-bold">{formatMoney(totals.subtotal, storeInfo?.currency || 'ر.س')}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>ضريبة القيمة المضافة (15%):</span>
                <span className="font-bold">{formatMoney(totals.taxAmount, storeInfo?.currency || 'ر.س')}</span>
              </div>
              <div className="flex justify-between font-black text-sm text-slate-900 pt-1 border-t border-pink-100">
                <span>الإجمالي النهائي:</span>
                <span className="text-base text-pink-700">{formatMoney(totals.total, storeInfo?.currency || 'ر.س')}</span>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsCartOpen(false);
                    if (!isShiftOpen) {
                      setIsOpenShiftModal(true);
                      return;
                    }
                    setIsCheckoutOpen(true);
                  }}
                  className="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-md transition active:scale-95"
                >
                  <CreditCard className="w-5 h-5" />
                  <span>دفع الفاتورة 💳</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* نافذة تعديل السعر الذكية (إجمالي الصنف أو سعر الحبة مع القسمة الآلية) */}
      {isPriceModalOpen && editingPriceItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in font-cairo">
          <div className="bg-white rounded-3xl max-w-sm w-full p-4 sm:p-5 shadow-2xl border border-pink-100 space-y-3.5">
            
            <div className="flex items-center justify-between pb-2 border-b border-pink-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center font-bold">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">تعديل سعر الصنف</h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-bold">
                    <span className="truncate max-w-[160px]">{editingPriceItem.productName}</span>
                    <span className="bg-pink-100 text-pink-800 px-1.5 py-0.2 rounded border border-pink-200">
                      {editingPriceItem.qty} حبات
                    </span>
                  </div>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsPriceModalOpen(false)} 
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* مفتاح التبديل الذكي: تعديل الإجمالي (مع القسمة التلقائية) أو تعديل سعر الحبة */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200/80 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPriceEditMode('total')}
                className={`py-2 rounded-xl transition flex items-center justify-center gap-1 active:scale-95 ${
                  priceEditMode === 'total'
                    ? 'bg-gradient-to-r from-rose-600 via-pink-600 to-purple-700 text-white shadow-sm font-black'
                    : 'text-slate-600 hover:text-slate-900 bg-white/60'
                }`}
              >
                <span>💰 إجمالي ({editingPriceItem.qty}) حبات</span>
              </button>

              <button
                type="button"
                onClick={() => setPriceEditMode('unit')}
                className={`py-2 rounded-xl transition flex items-center justify-center gap-1 active:scale-95 ${
                  priceEditMode === 'unit'
                    ? 'bg-gradient-to-r from-rose-600 via-pink-600 to-purple-700 text-white shadow-sm font-black'
                    : 'text-slate-600 hover:text-slate-900 bg-white/60'
                }`}
              >
                <span>🏷️ سعر الحبة الواحدة</span>
              </button>
            </div>

            <form onSubmit={handleSaveNewPrice} className="space-y-3">
              {priceEditMode === 'total' ? (
                /* النمط الأول: إدخال الإجمالي والقسمة التلقائية على عدد الحبات */
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <label>أدخل الإجمالي الجديد ({storeInfo?.currency || 'ر.س'}):</label>
                    <span className="text-[10.5px] text-pink-600">ينقسم تلقائياً على {editingPriceItem.qty} حبات</span>
                  </div>

                  <input
                    type="number"
                    step="any"
                    min="0"
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    value={priceInputTotal}
                    onChange={(e) => handleTotalInputChange(e.target.value)}
                    className="w-full p-3 bg-pink-50/50 border-2 border-pink-300 rounded-2xl text-2xl font-black text-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white text-center font-mono"
                    placeholder="0.00"
                    required
                  />

                  {/* الحساب التلقائي اللحظي لسعر الحبة بالقسمة على عدد الحبات */}
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">سعر الحبة الناتج تلقائياً:</span>
                    <div className="flex items-center gap-1 font-mono font-black text-slate-900">
                      <span className="text-sm text-blue-700">{priceInputUnit || '0.00'}</span>
                      <span className="text-[10px] text-slate-500">{storeInfo?.currency || 'ر.س'} / حبة</span>
                    </div>
                  </div>

                  {/* أزرار سريعة للإجمالي */}
                  <div className="flex items-center justify-center gap-1 pt-0.5">
                    {[10, 15, 20, 25, 30, 50, 100].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleTotalInputChange(String(val))}
                        className="px-2 py-1 bg-slate-100 hover:bg-pink-100 text-slate-700 hover:text-pink-700 rounded-lg text-xs font-bold font-mono transition active:scale-95"
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* النمط الثاني: إدخال سعر الحبة والضرب التلقائي في عدد الحبات */
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <label>سعر الحبة الواحدة ({storeInfo?.currency || 'ر.س'}):</label>
                    <span className="text-[10.5px] text-pink-600">مضروب في {editingPriceItem.qty} حبات</span>
                  </div>

                  <input
                    type="number"
                    step="any"
                    min="0"
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    value={priceInputUnit}
                    onChange={(e) => handleUnitInputChange(e.target.value)}
                    className="w-full p-3 bg-pink-50/50 border-2 border-pink-300 rounded-2xl text-2xl font-black text-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white text-center font-mono"
                    placeholder="0.00"
                    required
                  />

                  {/* الحساب التلقائي اللحظي للإجمالي */}
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">الإجمالي الناتج تلقائياً:</span>
                    <div className="flex items-center gap-1 font-mono font-black text-slate-900">
                      <span className="text-sm text-blue-700">{priceInputTotal || '0.00'}</span>
                      <span className="text-[10px] text-slate-500">{storeInfo?.currency || 'ر.س'}</span>
                    </div>
                  </div>

                  {/* أزرار سريعة لسعر الحبة */}
                  <div className="flex items-center justify-center gap-1.5 pt-0.5">
                    {[3, 5, 7, 10, 15, 20].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleUnitInputChange(String(val))}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-pink-100 text-slate-700 hover:text-pink-700 rounded-lg text-xs font-bold font-mono transition active:scale-95"
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-pink-100">
                <button
                  type="button"
                  onClick={() => setIsPriceModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-gradient-to-r from-rose-600 via-pink-600 to-purple-700 hover:from-rose-500 hover:to-purple-600 text-white rounded-xl font-black text-xs shadow-md shadow-pink-600/30 transition active:scale-95"
                >
                  {priceEditMode === 'total' ? 'اعتماد الإجمالي والقسمة ✅' : 'اعتماد السعر الجديد ✅'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* آلة حاسبة سريعة — حساب مجرّد لا يمسّ السلة */}
      <QuickCalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
      />

      {/* نافذة إضافة خدمة */}
      {isServiceModalOpen && (
        <AddServiceModal
          isOpen={isServiceModalOpen}
          onClose={() => setIsServiceModalOpen(false)}
          currency={storeInfo?.currency || 'ر.س'}
          onAddService={(serviceProd) => {
            if (!isShiftOpen) {
              setIsOpenShiftModal(true);
              return;
            }
            addToCart(serviceProd);
          }}
        />
      )}

      {/* نافذة ماسح الباركود بالكاميرا */}
      {isScannerOpen && (
        <BarcodeScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScanned={(matchedProduct) => {
            if (!isShiftOpen) {
              setIsOpenShiftModal(true);
              return;
            }
            if (matchedProduct && typeof matchedProduct === 'object') {
              addToCart(matchedProduct);
            }
            setIsScannerOpen(false);
          }}
          onScanSuccess={(scannedCode) => {
            const match = products.find(p => !p?.isArchived && (p.barcode === scannedCode || p.id === scannedCode));
            if (match) {
              if (!isShiftOpen) {
                setIsOpenShiftModal(true);
                return;
              }
              addToCart(match);
              setIsScannerOpen(false);
            }
          }}
        />
      )}

      {/* نافذة إتمام الدفع (CheckoutModal) */}
      {isCheckoutOpen && (
        <CheckoutModal
          isOpen={isCheckoutOpen}
          initialMethodId={selectedDesktopMethod?.id}
          onClose={() => setIsCheckoutOpen(false)}
          onSuccess={(invoice) => {
            setIsCheckoutOpen(false);
            handleInvoiceCompletion(invoice);
          }}
        />
      )}

      {/* إشعار عابر وذكي بنجاح الدفع والطباعة الفورية الصامتة */}
      {quickPrintNotice && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top duration-300 pointer-events-auto">
          <div className="bg-gradient-to-r from-emerald-600 via-teal-700 to-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-emerald-400/40 flex items-center gap-3 backdrop-blur-md">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-bold text-base shadow-inner shrink-0">
              ⚡
            </div>
            <div>
              <div className="font-bold text-xs sm:text-sm flex items-center gap-2">
                <span>تم إتمام الفاتورة #{quickPrintNotice.invoiceNumber} وطباعتها بنجاح 🌸</span>
              </div>
              <div className="text-2xs text-emerald-200">
                المبلغ: {formatMoney(quickPrintNotice.total, storeInfo?.currency || 'ر.س')} • جاهز للعميل التالي
              </div>
            </div>
            <div className="flex items-center gap-1.5 ms-2">
              <button
                type="button"
                onClick={async () => {
                  const inv = quickPrintNotice.invoice;
                  if (!inv) return;
                  const text = buildInvoiceWhatsAppMessage(inv, storeInfo);
                  let phone = (inv.customer?.phone && inv.customer?.phone !== '-' && inv.customer?.phone !== '0500000000') ? inv.customer.phone : '';
                  if (!phone) {
                    const promptPhone = await promptDialog({
                      title: 'إرسال عبر الواتساب',
                      message: 'أدخل رقم جوال العميل، أو اتركه فارغاً لاختيار المحادثة من الواتساب.',
                      placeholder: '05xxxxxxxx',
                      inputMode: 'numeric',
                      confirmText: 'فتح الواتساب'
                    });
                    if (promptPhone === null) return;   // إلغاء صريح: لا يُفتح الواتساب
                    if (promptPhone && promptPhone.trim()) phone = promptPhone.trim();
                  }
                  const urls = getWhatsAppUrls(phone, text);
                  const isDesktop = !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                  if (isDesktop) {
                    const link = document.createElement('a');
                    link.href = urls.desktopAppUrl;
                    link.click();
                  } else {
                    window.open(urls.universalUrl, '_blank');
                  }
                }}
                className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm"
                title="إرسال الفاتورة عبر الواتساب فوراً"
              >
                <span>واتساب 💬</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsReceiptOpen(true);
                  setQuickPrintNotice(null);
                }}
                className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
                title="معاينة أو طباعة إضافية"
              >
                <span>معاينة 📄</span>
              </button>
              <button
                type="button"
                onClick={() => setQuickPrintNotice(null)}
                className="w-6 h-6 rounded-lg bg-black/20 hover:bg-black/40 text-white/80 hover:text-white flex items-center justify-center transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة معاينة وطباعة الفاتورة (ReceiptModal) */}
      {isReceiptOpen && completedInvoice && (
        <ReceiptModal
          isOpen={isReceiptOpen}
          onClose={() => {
            setIsReceiptOpen(false);
            setCompletedInvoice(null);
          }}
          invoice={completedInvoice}
        />
      )}

      {/* ========================================================================= */}
      {/* نافذة منبثقة بتصميم وهوية بيت الورد: تنبيه يلزم فتح الوردية أولاً */}
      {/* ========================================================================= */}
      {isOpenShiftModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in select-none font-cairo">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-pink-200 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[92vh]">
            
            {/* رأس النافذة الأنيق بتدرج بيت الورد */}
            <div className="bg-gradient-to-r from-purple-950 via-[#380624] to-pink-900 text-white p-4 sm:p-5 flex items-center justify-between relative">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-2xl shadow-inner">
                  🌸
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base text-white flex items-center gap-1.5">
                    <span>تنبيه: يلزم فتح وردية للبدء في البيع</span>
                  </h3>
                  <p className="text-[11px] text-pink-200/90 font-medium">
                    مرحباً بك: <strong>{currentUser?.name || 'الكاشير'}</strong> 🌸
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsOpenShiftModal(false);
                  setPendingProductToCart(null);
                }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-pink-200 hover:text-white transition active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* محتوى النافذة ونموذج الفتح المباشر */}
            <form onSubmit={handleOpenShift} className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto">
              
              {/* بطاقة التنبيه الأنيقة بهوية النظام */}
              <div className="p-3 bg-gradient-to-r from-rose-50 to-pink-50 border border-pink-200 rounded-2xl flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-rose-500 text-white flex items-center justify-center text-sm shrink-0 shadow-xs mt-0.5">
                  ⛔
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-black text-xs text-rose-950">
                    لا يمكن إضافة أصناف أو البيع قبل فتح الوردية
                  </h4>
                  <p className="text-[11px] text-rose-800 leading-relaxed">
                    لحفظ حقوقك المحاسبية وعزل مبيعاتك، يرجى فتح الوردية وتحديد رصيد العهدة النقدية في الدرج للبدء فوراً.
                  </p>
                </div>
              </div>

              {/* بطاقة الترحيل التلقائي الذكي من الوردية السابقة */}
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
                  <p className="text-[10px] text-emerald-700/90 leading-tight">
                    تم تعبئة الرصيد الافتتاحي تلقائياً بالنقدية الفعلية المتبقية معك في الدرج لضمان استمرارية العهدة التراكمية.
                  </p>
                </div>
              )}

              {/* تنبيه إذا كان الرصيد الافتتاحي مقفلاً من المدير */}
              {storeInfo?.lockOpeningCash && currentUser?.role !== 'admin' && (
                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 font-bold text-xs flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>الرصيد الافتتاحي مثبت ومقفل بواسطة مدير النظام 🔒</span>
                </div>
              )}

              {/* إدخال الرصيد الافتتاحي */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  الرصيد الافتتاحي في الدرج (العهدة النقدية) *
                </label>
              {myPendingFloatTotal > 0 && (
                <div className="p-3 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-950 text-[11px] font-bold leading-relaxed">
                  🤝 سلّمك المدير عهدة بقيمة{' '}
                  <b className="font-mono text-sm">{formatMoney(myPendingFloatTotal, storeInfo?.currency || 'ر.س')}</b>.
                  <span className="block mt-0.5">
                    هي رصيدك الافتتاحي المثبَّت لهذه الوردية، وتُحسب عليك عند الإقفال. تأكد من عدّ المبلغ في الدرج قبل البدء.
                  </span>
                </div>
              )}

                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    required
                    disabled={myPendingFloatTotal > 0 || (storeInfo?.lockOpeningCash && currentUser?.role !== 'admin')}
                    value={openingCashInput}
                    onChange={(e) => setOpeningCashInput(e.target.value)}
                    className="w-full pl-14 pr-4 py-3 bg-white border-2 border-pink-200 focus:border-pink-600 rounded-2xl font-black text-center text-lg text-slate-900 outline-none transition shadow-xs disabled:bg-slate-100"
                    placeholder="500"
                    autoFocus
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-pink-700">
                    {storeInfo?.currency || 'ر.س'}
                  </span>
                </div>
              </div>

              {/* الصنف المعلق الذي نقر عليه المستخدم للبيع */}
              {pendingProductToCart && (
                <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-200 text-xs flex items-center justify-between text-purple-900 font-bold">
                  <span className="flex items-center gap-1.5">
                    <span>🛍️</span>
                    <span>الصنف المطلوب: <strong>{pendingProductToCart.name}</strong></span>
                  </span>
                  <span className="text-[10px] text-purple-700 bg-purple-200/80 px-2 py-0.5 rounded-full font-bold">
                    سيُضاف للسلة تلقائياً عند الفتح
                  </span>
                </div>
              )}

              {/* أزرار الإجراء */}
              <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpenShiftModal(false);
                    setPendingProductToCart(null);
                  }}
                  className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition active:scale-95"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-700 hover:from-pink-500 text-white rounded-2xl text-xs font-black shadow-lg shadow-pink-600/30 transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <span>🔓 فتح الوردية وبدء البيع فوراً</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* نافذة الربط السريع لباركود المصنع بصنف مسجل */}
      {isLinkBarcodeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in duration-200 font-cairo">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* رأس النافذة */}
            <div className="p-4 bg-gradient-to-r from-amber-500 via-orange-500 to-pink-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
                  <Link2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base">ربط باركود المصنع بصنف مسجل</h3>
                  <p className="text-[11px] text-amber-100">اختر الصنف المطلوب لربط هذا الباركود به كـ (باركود المصنع)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLinkBarcodeModalOpen(false)}
                className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {/* الباركود المراد ربطه */}
            <div className="p-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-amber-800 block">رقم باركود المصنع المقروء:</span>
                <span className="font-mono text-base font-black text-slate-900 tracking-wider dir-ltr">{codeToLink}</span>
              </div>
              <div className="px-3 py-1 bg-amber-200/80 text-amber-900 font-extrabold text-xs rounded-xl flex items-center gap-1.5">
                <span>🏭</span>
                <span>باركود خارجي</span>
              </div>
            </div>

            {/* مربع البحث في الأصناف */}
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={linkSearchQuery}
                  onChange={(e) => setLinkSearchQuery(e.target.value)}
                  placeholder="ابحث باسم الصنف أو الباركود لربطه..."
                  className="w-full pr-10 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:border-amber-500 outline-none transition"
                  autoFocus
                />
              </div>
            </div>

            {/* قائمة المنتجات لاختيار الصنف */}
            <div className="p-3 overflow-y-auto flex-1 divide-y divide-slate-100 space-y-1">
              {products
                .filter(p => !linkSearchQuery || p.name.toLowerCase().includes(linkSearchQuery.toLowerCase()) || p.barcode?.includes(linkSearchQuery))
                .slice(0, 30)
                .map(product => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleConfirmLinkBarcode(product)}
                    className="w-full p-2.5 rounded-2xl hover:bg-amber-50/80 border border-transparent hover:border-amber-300 flex items-center justify-between text-right transition group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 text-sm overflow-hidden group-hover:bg-amber-100 shrink-0">
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          '🌸'
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-black text-xs text-slate-800 group-hover:text-amber-950 truncate">{product.name}</h4>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                          <span>الباركود الحالي: <span className="font-mono font-bold">{product.barcode || 'بدون'}</span></span>
                          {product.factoryBarcode && (
                            <span className="text-purple-600 font-bold">• مصنع: {product.factoryBarcode}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-black text-emerald-600">
                        {formatMoney(product.sellingPrice, storeInfo?.currency || 'ر.س')}
                      </span>
                      <span className="px-2.5 py-1 bg-amber-500 text-white rounded-xl text-[11px] font-black group-hover:bg-amber-600 transition shadow-xs">
                        ربط الصنف 🔗
                      </span>
                    </div>
                  </button>
                ))}
            </div>

            {/* ذيل النافذة */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsLinkBarcodeModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                إلغاء
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
