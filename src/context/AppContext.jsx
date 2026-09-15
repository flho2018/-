import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  INITIAL_STORE_INFO,
  INITIAL_PAYMENT_METHODS,
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_CUSTOMERS,
  INITIAL_SUPPLIERS,
  INITIAL_USERS
} from '../utils/initialData';
import { generateInvoiceNumber, generateZatcaTLV, formatShiftDateTime, formatShiftDuration, formatMoney, getDeviceInfo, resolveUserName, resolvePaymentMethod, resolvePaymentMethodName } from '../utils/helpers';
import { syncEngine } from '../utils/syncEngine';
import { ROLE_PRESETS, checkUserPermission, FULL_ADMIN_PERMISSIONS } from '../utils/permissions';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../utils/firebase';
import { getRoleByEmail } from '../utils/authUsers';
import { playGentleNotificationSound } from '../utils/soundHelper';
import { hashPin, verifyPin, hashNfcCard, verifyNfcCard, isHashedPin } from '../utils/security';
import { logAudit as logAuditCloud } from '../utils/audit';
import { idbGet, idbSet, safeLocalStorageSet, migrateLocalStorageToIndexedDB } from '../utils/idbStorage';

const AppContext = createContext();

// =====================================================================
//  اختيار النسخة الأحدث من الوردية بين نسخة الجهاز ونسخة السحابة
// =====================================================================
//  كل وردية صارت تحمل ختماً زمنياً (updatedAt) يُكتب لحظة أي تعديل
//  مقصود عليها (فتح، بيع، استرجاع، إيداع/صرف، إغلاق). قبل ذلك كانت
//  الورديات بلا ختم إطلاقاً، فكان أي جهاز يحمل نسخة قديمة "مفتوحة"
//  يكتبها فوق الإغلاق الذي حصل على جهاز آخر — فتظهر للكاشير وردية
//  مفتوحة رغم أنه أغلقها فعلاً، ويُمنع من فتح وردية جديدة.
//  القاعدة الآن: الأحدث ختماً يفوز. وإن كان طرف واحد مختوماً فهو الأحدث
//  حتماً (الختم لم يوجد إلا بعد هذا الإصلاح). وإن لم يُختم أيٌّ منهما
//  فالسحابة هي المرجع كما كان.
const pickNewerShift = (localSh, remoteSh) => {
  if (!localSh) return remoteSh;
  if (!remoteSh) return localSh;
  const t = (o) => {
    const v = new Date(o?.updatedAt || 0).getTime();
    return Number.isFinite(v) ? v : 0;
  };
  const lT = t(localSh);
  const rT = t(remoteSh);
  if (lT > rT) return localSh;
  return remoteSh;
};

export const AppProvider = ({ children }) => {
  // التخزين المحلي واسترجاع البيانات المحفوظة مع حماية من استرجاع البيانات التجريبية المحذوفة
  const getSaved = (key, fallback) => {
    try {
      const isInit = localStorage.getItem('naif_pos_v3_initialized') === 'true';
      const saved = localStorage.getItem(`naif_pos_v3_${key}`);
      if (saved !== null) {
        return JSON.parse(saved);
      }
      // إذا كان النظام قد بدأ العمل، لا نعيد تحميل القوائم الافتراضية التجريبية إذا حذفها المستخدم
      if (isInit && Array.isArray(fallback)) {
        return [];
      }
      return fallback;
    } catch (e) {
      console.error(`Error loading ${key}`, e);
      return fallback;
    }
  };

  // دالة لضمان استبدال وسيلة عربون بـ تقسيم وتنظيف وسائل الدفع
  const sanitizeStoreInfo = (info) => {
    if (!info) return INITIAL_STORE_INFO;
    let methods = Array.isArray(info.paymentMethods) && info.paymentMethods.length > 0
      ? info.paymentMethods
      : INITIAL_PAYMENT_METHODS;

    let updatedMethods = methods.map(m => {
      if (m.id === 'deposit' || m.name === 'عربون' || m.id === 'split') {
        const splitDef = INITIAL_PAYMENT_METHODS.find(im => im.id === 'split');
        return {
          ...splitDef,
          enabled: m.enabled !== false
        };
      }
      return m;
    });

    const seen = new Set();
    updatedMethods = updatedMethods.filter(m => {
      if (m.id === 'deposit') return false;
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    if (!updatedMethods.some(m => m.id === 'split')) {
      const splitDef = INITIAL_PAYMENT_METHODS.find(im => im.id === 'split');
      if (splitDef) updatedMethods.push(splitDef);
    }

    // ===================================================================
    //  دمج الافتراضيات تحت القيم القادمة — لا فوقها
    // ===================================================================
    //  أي مفتاح غائب في مستند السحابة كان يبقى undefined، والكود يفحص
    //  كثيراً من الإعدادات بصيغة (x !== false) — فالمفتاح المفقود يُقرأ
    //  كأنه "مفعّل". هكذا كانت الضريبة تعود مفعّلة بعد كل مزامنة أو تبديل
    //  مستخدم مهما أطفأها المدير. الدمج هنا يعالج هذه الفئة كلها دفعة واحدة.
    return {
      ...INITIAL_STORE_INFO,
      ...info,
      paymentMethods: updatedMethods
    };
  };

  const [storeInfo, setStoreInfo] = useState(() => {
    const loaded = getSaved('store_info', INITIAL_STORE_INFO);
    return sanitizeStoreInfo(loaded || INITIAL_STORE_INFO);
  });
  const [categories, setCategories] = useState(() => getSaved('categories', INITIAL_CATEGORIES));
  const [products, setProducts] = useState(() => getSaved('products', INITIAL_PRODUCTS));
  const [customers, setCustomers] = useState(() => getSaved('customers', INITIAL_CUSTOMERS));
  const [suppliers, setSuppliers] = useState(() => getSaved('suppliers', INITIAL_SUPPLIERS));
  const [users, setUsers] = useState(() => {
    const loaded = getSaved('users', INITIAL_USERS);
    if (!Array.isArray(loaded) || loaded.length === 0) return INITIAL_USERS;
    return loaded;
  });
  
  // =========================================================================
  //  ترحيل الرموز الصريحة إلى تجزئة — لمرة واحدة
  // =========================================================================
  //  مستخدمون قدامى (وبيانات البذرة) يحملون الرمز نصاً صريحاً في الحقل `pin`
  //  بلا `pinHash`. والدخول يتحقق من التجزئة وحدها، فهؤلاء لا يستطيعون
  //  الدخول إطلاقاً، كما أن الرمز الصريح يُقرأ من أدوات المطور ومن السحابة.
  //  نُجزّئ الرمز الحالي (فيبقى كما يحفظه الموظف) ونحذف النص الصريح.
  // =========================================================================
  const pinMigrationDoneRef = useRef(false);
  useEffect(() => {
    if (pinMigrationDoneRef.current) return;
    if (!Array.isArray(users) || users.length === 0) return;
    // أي مستخدم يحمل الحقل `pin` صريحاً يحتاج تنظيفاً — سواء كان بلا تجزئة
    // (فنُجزّئ رمزه) أو لديه تجزئة والنص القديم باقٍ (فنحذف النص وحده).
    // النص المتبقّي هو سبب قبول الرمز القديم بعد تغييره في النسخة السابقة.
    const needsMigration = users.filter(u => u && u.pin);
    if (needsMigration.length === 0) return;

    pinMigrationDoneRef.current = true;
    const migrated = users.map(u => {
      if (!u || !u.pin) return u;
      const { pin, ...rest } = u;
      // التجزئة الموجودة هي المرجع؛ لا نكتب فوقها برمز نصّي قديم.
      return isHashedPin(rest.pinHash)
        ? rest
        : { ...rest, pinHash: hashPin(String(pin)) };
    });
    setUsers(migrated);
    try { localStorage.setItem('naif_pos_v3_users', JSON.stringify(migrated)); } catch (e) {}
    syncEngine.saveKey('users', migrated, true);
    console.warn('[security] رُحِّل ' + needsMigration.length + ' رمزاً صريحاً إلى تجزئة آمنة');
  }, [users]);

  const [currentUser, setCurrentUser] = useState(() => {
    const loaded = getSaved('current_user', null);
    if (loaded && loaded.id) {
      return loaded;
    }
    return INITIAL_USERS[0];
  });
  const [isLocked, setIsLocked] = useState(true);

  // حالة تسجيل الدخول في Firebase
  // undefined = جاري التحقق | null = غير مسجّل | كائن = مسجّل
  const [firebaseUser, setFirebaseUser] = useState(undefined);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setFirebaseUser(u || null));
    return () => unsub();
  }, []);
  const [isInactivityLock, setIsInactivityLock] = useState(false);

  // الوردية الحالية
  
  // دالة تنقية وتطهير سجل الورديات من أي ورديات شبحية أو أسماء قديمة وتحديثها بالاسم الفعلي للمستخدم
  const cleanUserShifts = (rawShifts, validUsers) => {
    if (!rawShifts || typeof rawShifts !== 'object') return {};
    const safeUsers = Array.isArray(validUsers) && validUsers.length > 0 ? validUsers : (getSaved('users', INITIAL_USERS) || INITIAL_USERS);
    const activeUsers = safeUsers.filter(u => u && u.isActive !== false);
    const adminUser = safeUsers.find(u => u && (u.role === 'admin' || u.id === 'user-2' || u.id === 'admin')) || safeUsers[0];

    const cleaned = {};
    Object.keys(rawShifts).forEach(k => {
      const sh = rawShifts[k];
      if (!sh) return;
      let uId = sh.userId || (k !== 'undefined' && k !== 'null' ? k : null);
      let cName = String(sh.cashierName || '').trim();

      // معالجة ورديات المدير القديمة 'admin' أو 'ادمن' أو السجلات السابقة
      if (uId === 'admin' || uId === 'user-2' || cName.toLowerCase() === 'admin' || cName === 'ادمن' || cName === 'الادمن' || cName === 'مدير النظام') {
        if (adminUser) {
          uId = adminUser.id;
          cName = adminUser.name;
        }
      }

      // البحث عن المستخدم المطابق بالمعرف أو بالاسم
      const matchingUser = safeUsers.find(u => u && (u.id === uId || String(u.name || '').trim().toLowerCase() === cName.toLowerCase()));

      if (matchingUser && matchingUser.isActive !== false) {
        // نحدث المعرف والاسم فوراً ليكون مطابقاً لأحدث اسم مسجل في قائمة المستخدمين
        cleaned[matchingUser.id] = {
          ...sh,
          userId: matchingUser.id,
          cashierName: matchingUser.name,
          cashierRole: matchingUser.roleName || (matchingUser.role === 'admin' ? '👑 مدير النظام' : '🌸 كاشير مبيعات')
        };
      }
    });
    return cleaned;
  };

  // دالة تطهير وتحديث بيانات المستخدمين في السجلات التاريخية
  const sanitizeLegacyRecord = (record, usersList = null) => {
    if (!record || typeof record !== 'object') return record;
    const safeUsers = usersList || (getSaved('users', INITIAL_USERS) || INITIAL_USERS);
    const adminUser = safeUsers.find(u => u && (u.role === 'admin' || u.id === 'user-2' || u.id === 'admin')) || safeUsers[0];
    const resolved = resolveUserName(record, safeUsers);

    const isLegacyAdmin = 
      record.userId === 'admin' || 
      record.userId === 'user-2' || 
      record.cashierId === 'admin' ||
      String(record.cashier || '').trim().toLowerCase() === 'admin' || 
      String(record.cashier || '').trim() === 'ادمن' ||
      String(record.cashier || '').trim() === 'الادمن' ||
      String(record.user || '').trim().toLowerCase() === 'admin' ||
      String(record.user || '').trim() === 'ادمن' ||
      String(record.cashierName || '').trim().toLowerCase() === 'admin' ||
      String(record.cashierName || '').trim() === 'ادمن';

    const clean = { ...record };
    if (isLegacyAdmin && adminUser) {
      if (clean.userId) clean.userId = adminUser.id;
      if (clean.cashierId) clean.cashierId = adminUser.id;
      if (clean.cashier) clean.cashier = adminUser.name;
      if (clean.cashierName) clean.cashierName = adminUser.name;
      if (clean.user) clean.user = adminUser.name;
      if (clean.managerId) clean.managerId = adminUser.id;
      if (clean.managerName) clean.managerName = adminUser.name;
    } else {
      if (clean.cashier) clean.cashier = resolved;
      if (clean.cashierName) clean.cashierName = resolved;
      if (clean.user) clean.user = resolved;
    }
    return clean;
  };

  // قاموس الورديات المخصصة لكل مستخدم وكاشير على حدة مع حماية الورديات المفتوحة وتنقية الورديات الشبحية
  // قاموس الورديات المخصصة لكل مستخدم وكاشير على حدة مع حماية الورديات المفتوحة وتنقية الورديات الشبحية
  const [userShifts, setUserShifts] = useState(() => {
    const raw = getSaved('user_shifts', {});
    const historyList = getSaved('shifts_history', []) || [];
    const validUsersList = getSaved('users', INITIAL_USERS) || [];
    const resetKey = 'naif_pos_v3_user_shifts_reset_at';
    const userShiftsResetAt = 0; // ✦ أُلغي: حاجز تصفير محلي يخصّ متصفحاً واحداً
    const cleaned = cleanUserShifts(raw, validUsersList);

    // التحقق من حالة الفتح لكل وردية وتاريخها مقارنة بحاجز التصفير وسجل التاريخ
    Object.keys(cleaned).forEach(k => {
      const sh = cleaned[k];
      if (!sh) return;
      const shOpenedTs = new Date(sh.openedAt || 0).getTime();
      // إذا كانت الوردية مفتوحة قبل تاريخ التصفير، تُحذف فوراً
      if (userShiftsResetAt && shOpenedTs && shOpenedTs < userShiftsResetAt) {
        delete cleaned[k];
        return;
      }
      if (sh.openedAt && !sh.closedAt) {
        const isClosedInHist = historyList.some(h => h && h.id === sh.id && (h.status === 'closed' || h.closedAt || h.isOpen === false));
        if (!isClosedInHist) {
          sh.isOpen = true;
          sh.status = 'open';
        } else {
          sh.isOpen = false;
          sh.status = 'closed';
        }
      } else if (sh.closedAt) {
        sh.isOpen = false;
        sh.status = 'closed';
      }
    });

    // حفظ النسخة المنظفة فوراً في التخزين المحلي لمنع استرجاع الأسماء القديمة
    localStorage.setItem('naif_pos_v3_user_shifts', JSON.stringify(cleaned));
    return cleaned;
  });

  const [activeShift, setActiveShift] = useState(() => {
    const historyList = getSaved('shifts_history', []) || [];
    const validUsersList = getSaved('users', INITIAL_USERS) || [];
    const resetKey = 'naif_pos_v3_user_shifts_reset_at';
    const userShiftsResetAt = 0; // ✦ أُلغي: حاجز تصفير محلي يخصّ متصفحاً واحداً
    const adminUser = validUsersList.find(u => u && (u.role === 'admin' || u.id === 'user-2' || u.id === 'admin')) || validUsersList[0] || INITIAL_USERS[0];
    const loadedUser = getSaved('current_user', null) || adminUser;
    const uid = loadedUser?.id || adminUser?.id || 'user-2';

    // 1. فحص الوردية المحفوظة مباشرة في naif_pos_v3_active_shift لهذا المستخدم حصراً ومطابقة تامة لمعرفه
    const directSaved = getSaved('active_shift', null);
    if (directSaved && directSaved.userId === uid && directSaved.isOpen === true && directSaved.status !== 'closed' && !directSaved.closedAt) {
      const dOpenedTs = new Date(directSaved.openedAt || 0).getTime();
      if (!userShiftsResetAt || !dOpenedTs || dOpenedTs >= userShiftsResetAt) {
        const isClosedInHist = directSaved.id && historyList.some(h => h && h.id === directSaved.id && (h.status === 'closed' || h.closedAt || h.isOpen === false));
        if (!isClosedInHist) {
          return { 
            ...directSaved, 
            userId: uid,
            cashierName: loadedUser.name || directSaved.cashierName,
            isOpen: true, 
            status: 'open' 
          };
        }
      }
    }

    // 2. فحص ورديات المستخدمين في user_shifts لهذا المستخدم حصراً
    const loadedShifts = cleanUserShifts(getSaved('user_shifts', {}), validUsersList);
    const myS = loadedShifts && loadedShifts[uid];
    if (myS && myS.userId === uid && myS.isOpen === true && myS.status !== 'closed' && !myS.closedAt) {
      const myOpenedTs = new Date(myS.openedAt || 0).getTime();
      if (!userShiftsResetAt || !myOpenedTs || myOpenedTs >= userShiftsResetAt) {
        const isClosedInHist = myS.id && historyList.some(h => h && h.id === myS.id && (h.status === 'closed' || h.closedAt || h.isOpen === false));
        if (!isClosedInHist) {
          return { 
            ...myS, 
            userId: uid,
            cashierName: loadedUser.name || myS.cashierName,
            isOpen: true, 
            status: 'open' 
          };
        }
      }
    }

    // 3. لا توجد وردية مفتوحة لهذا المستخدم -> حالته مغلقة ومستقلة تماماً ويمنع البيع
    return {
      id: `shift-${uid}`,
      isOpen: false,
      openedAt: null,
      closedAt: null,
      startCash: 0,
      cashSales: 0,
      cardSales: 0,
      creditSales: 0,
      cashIn: 0,
      cashOut: 0,
      userId: uid,
      cashierName: loadedUser?.name || 'كاشير بيت الورد',
      status: 'closed'
    };
  });

  // تنقية وتأمين هيكل عناصر السلة ضد أي بيانات قديمة أو تالفة
  const sanitizeCart = (rawCart) => {
    if (!Array.isArray(rawCart)) return [];
    return rawCart
      .filter(item => item && (item.product || item.id || item.name))
      .map(item => {
        const prod = item.product || {
          id: item.id || `prod-${Date.now()}`,
          name: item.name || 'صنف',
          sellingPrice: Number(item.unitPrice ?? item.price ?? 0),
          isService: Boolean(item.isService),
          barcode: item.barcode || ''
        };
        return {
          product: prod,
          qty: Math.max(1, Number(item.qty ?? item.quantity ?? 1)),
          unitPrice: Number(item.unitPrice ?? item.price ?? prod.sellingPrice ?? 0),
          discount: Number(item.discount || 0)
        };
      });
  };

  // سلة المبيعات الحالية
  const [cart, setCart] = useState(() => sanitizeCart(getSaved('cart', [])));
  const [selectedCustomer, setSelectedCustomer] = useState(() => customers[0] || INITIAL_CUSTOMERS[0]);
  const [cartDiscount, setCartDiscount] = useState({ type: 'fixed', value: 0 }); // fixed or percent
  const [cartNotes, setCartNotes] = useState('');

  // الفواتير المعلقة
  const [heldBills, setHeldBills] = useState(() => getSaved('held_bills', []));

  // سجل فواتير المبيعات
  const [invoices, setInvoices] = useState(() => {
    const loaded = getSaved('invoices', []);
    const validUsersList = getSaved('users', INITIAL_USERS) || [];
    const resetKey = 'naif_pos_v3_invoices_reset_at';
    const localResetAt = Number(localStorage.getItem(resetKey) || 0);
    // حاجز زمني قطعي: أي فاتورة قبل تاريخ التصفير 2026-09-04T00:00:00.000Z يتم حذفها نهائياً
    const effectiveResetAt = Math.max(localResetAt, 1788480000000);

    const cleaned = (Array.isArray(loaded) ? loaded : [])
      .filter(i => {
        if (!i || String(i.id).startsWith('inv-rec-')) return false;
        const iDate = new Date(i.date || i.createdAt || 0).getTime();
        if (iDate < effectiveResetAt) return false;
        return true;
      })
      .map(i => sanitizeLegacyRecord(i, validUsersList));

    // تطهير التخزين المحلي فوراً إذا كانت هناك أي فواتير قديمة متبقية لمنع إعادة رفعها
    try {
      if (Array.isArray(loaded) && loaded.length !== cleaned.length) {
        localStorage.setItem('naif_pos_v3_invoices', JSON.stringify(cleaned));
      }
      localStorage.setItem('naif_pos_v3_invoices_reset_at', String(effectiveResetAt));
    } catch (e) {}

    return cleaned;
  });

  // سجل المشتريات
  const [purchases, setPurchases] = useState(() => getSaved('purchases', []));

  // المصروفات والإيرادات
  const [expenses, setExpenses] = useState(() => {
    const loaded = getSaved('expenses', []);
    const validUsersList = getSaved('users', INITIAL_USERS) || [];
    return (Array.isArray(loaded) ? loaded : []).map(e => sanitizeLegacyRecord(e, validUsersList));
  });

  // حركة الخزينة (سحب وإيداع)
  const [drawerTransactions, setDrawerTransactions] = useState(() => {
    const loaded = getSaved('drawer_tx', []);
    const validUsersList = getSaved('users', INITIAL_USERS) || [];
    return (Array.isArray(loaded) ? loaded : []).map(t => sanitizeLegacyRecord(t, validUsersList));
  });

  // سندات القبض
  const [paymentReceipts, setPaymentReceipts] = useState(() => getSaved('receipts', []));

  // سجل تقارير الورديات السابقة
  const [shiftsHistory, setShiftsHistory] = useState(() => {
    const loaded = getSaved('shifts_history', []);
    const validUsersList = getSaved('users', INITIAL_USERS) || [];
    return (Array.isArray(loaded) ? loaded : []).map(s => sanitizeLegacyRecord(s, validUsersList));
  });

  // سجل حركات الخزينة الرئيسية والإيداعات البنكية (Treasury Audit Ledger)
  const [treasuryLedger, setTreasuryLedger] = useState(() => {
    const loaded = getSaved('treasury_ledger', []);
    const validUsersList = getSaved('users', INITIAL_USERS) || [];
    return (Array.isArray(loaded) ? loaded : []).map(l => sanitizeLegacyRecord(l, validUsersList));
  });

  // سجل حركات تسجيل الدخول ومواصفات الأجهزة
  const [loginLogs, setLoginLogs] = useState(() => getSaved('login_logs', []));

  // ===================== سجل التدقيق (Audit Log) =====================
  // يسجّل من فعل ماذا ومتى في العمليات الحسّاسة: المرتجعات، تعديل الأسعار
  // والتكلفة والمخزون، حذف الأصناف، إغلاق الورديات، التسويات، والتصفير.
  // سجل إضافة فقط (append-only): لا يُعدَّل ولا يُحذف من داخل البرنامج.
  const [auditLogs, setAuditLogs] = useState(() => getSaved('audit_logs', []));

  // ===================== سجل تالف وهالك الورد الطبيعي (Flower Spoilage) =====================
  // يسجّل كميات الورد الذابل أو المكسور مع خصمها التلقائي من المخزون واحتساب الخسائر
  const [spoilageLogs, setSpoilageLogs] = useState(() => getSaved('spoilage_logs', []));

  // مركز التنبيهات والإشعارات اللحظية بين المستخدمين
  const [notifications, setNotifications] = useState(() => getSaved('notifications', []));
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(() => {
    const list = getSaved('notifications', []);
    return Array.isArray(list) ? list.filter(n => !n.isRead).length : 0;
  });
  const [liveAlert, setLiveAlert] = useState(null);
  const liveAlertTimerRef = useRef(null);

  // تنظيف الذاكرة للمؤقت عند إغلاق التطبيق لتجنب تسرب الذاكرة
  useEffect(() => {
    return () => {
      if (liveAlertTimerRef.current) clearTimeout(liveAlertTimerRef.current);
    };
  }, []);

  // حالة المزامنة السحابية
  const [syncStatus, setSyncStatus] = useState(syncEngine.status);
  const [lastSyncTime, setLastSyncTime] = useState(syncEngine.lastSyncedAt);

  // مرجع لمنع حلقات التكرار أثناء استقبال التحديثات من الأجهزة الأخرى
  const isRemoteUpdateRef = useRef({});
  const hasInitializedRef = useRef(false);
  // وقت آخر عملية بيع — لمنع الضغط المزدوج على زر تأكيد الدفع
  const lastCheckoutAtRef = useRef(0);
  // الفواتير التي بدأ استرجاعها فعلاً في هذه الجلسة — حارس فوري ضد
  // الاسترجاع المزدوج. لا يعتمد على حالة React لأنها لا تُحدَّث بين
  // نقرتين سريعتين، فتمرّ النقرتان من فحص "هل هي مرتجعة؟" كلتاهما.
  const refundingIdsRef = useRef(new Set());

  // دمج القوائم الفريدة (Smart Merge) لتجنب فقدان أي فاتورة أو صنف من أي جهاز
  // دمج القوائم الفريدة (Smart Merge) لتجنب فقدان أي فاتورة أو صنف من أي جهاز
  const smartMergeList = (localList, remoteList, idProp = 'id', keyName = '') => {
    if (!Array.isArray(remoteList)) return Array.isArray(localList) ? localList : [];
    if (!Array.isArray(localList)) return Array.isArray(remoteList) ? remoteList : [];
    
    // ===================================================================
    //  «تاريخ التصفير» يُطبَّق على الفواتير فقط
    // ===================================================================
    //  كان يُطبَّق على كل الأقسام، وهذا سبب ثانٍ لاختلاف الأرقام بين
    //  متصفحين: تاريخ التصفير مخزَّن في localStorage — أي في متصفح واحد
    //  فقط. فمتصفح صفّر مرة يظل يُخفي عنه سجلات الأجهزة الأخرى إلى الأبد،
    //  بينما المتصفح الآخر يعرضها. النتيجة: نفس اللحظة، رقمان مختلفان.
    //  التصفير الآن يحذف من السحابة فعلياً (isReset)، فلا حاجة لإخفاء محلي.
    //  يبقى الاستثناء للفواتير لأن حدّها الأدنى ثابت في الكود ومشترك بين
    //  كل الأجهزة، لا يخصّ متصفحاً بعينه.
    const effectiveResetAt = (keyName === 'invoices')
      ? Math.max(Number(localStorage.getItem('naif_pos_v3_invoices_reset_at') || 0), 1788480000000)
      : 0;

    const map = new Map();
    // 1. إدراج العناصر السحابية أولاً
    remoteList.forEach(item => {
      if (!item) return;
      if (item.id && String(item.id).startsWith('inv-rec-')) return;
      if (item.customer?.name && String(item.customer.name).includes('مطابقة وردية')) return;
      const itemDate = new Date(item.date || item.createdAt || item.openedAt || item.timestamp || 0).getTime();
      if (effectiveResetAt && itemDate && itemDate < effectiveResetAt) return;
      const id = item[idProp] || item.id || item.invoiceNumber || item.code || JSON.stringify(item);
      if (id) map.set(id, item);
    });
    // 2. إدراج وتحديث العناصر المحلية (البيانات المحلية الأحدث أو المرتجعة لها الأولوية)
    localList.forEach(item => {
      if (!item) return;
      if (item.id && String(item.id).startsWith('inv-rec-')) return;
      if (item.customer?.name && String(item.customer.name).includes('مطابقة وردية')) return;
      const itemDate = new Date(item.date || item.createdAt || item.openedAt || item.timestamp || 0).getTime();
      if (effectiveResetAt && itemDate && itemDate < effectiveResetAt) return;
      const id = item[idProp] || item.id || item.invoiceNumber || item.code || JSON.stringify(item);
      if (id) {
        const existing = map.get(id);
        if (!existing) {
          map.set(id, item);
        } else {
          const localTs = new Date(item.updatedAt || item.date || item.createdAt || item.openedAt || 0).getTime();
          const remoteTs = new Date(existing.updatedAt || existing.date || existing.createdAt || existing.openedAt || 0).getTime();

          // "الحالة المتقدمة" لا تُلغى أبداً: الفاتورة المرتجعة أو المسددة نتيجةُ
          // إجراء فعلي حصل، فلا يجوز أن تعيدها نسخة قديمة إلى "مكتملة".
          const rank = (x) => (x?.status === 'refunded' ? 2 : (x?.isCreditSettled ? 1 : 0));
          const localRank = rank(item);
          const remoteRank = rank(existing);

          if (localRank > remoteRank) {
            map.set(id, item);            // المحلي أكثر تقدماً (مرتجع/مسدد)
          } else if (remoteRank > localRank) {
            // السحابي أكثر تقدماً — نُبقيه كما هو ولا نكتب فوقه
          } else if (localTs > remoteTs) {
            map.set(id, item);            // نفس الحالة: الأحدث يفوز
          }
          // عند تساوي الحالة والوقت: نُبقي السحابي (قرار ثابت يمنع التذبذب)
        }
      }
    });
    return Array.from(map.values());
  };

  
  // دالة بث الإشعارات والتنبيهات المباشرة لجميع المستخدمين الآخرين
  const broadcastStoreActivity = (activityData) => {
    try {
      const activity = {
        id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: activityData.type || 'general',
        title: activityData.title || 'عملية جديدة 🌸',
        message: activityData.message || '',
        amount: Number(activityData.amount) || 0,
        userName: currentUser?.name || 'كاشير بيت الورد',
        userRole: currentUser?.role || 'كاشير',
        userId: currentUser?.id,
        timestamp: new Date().toISOString(),
        isRead: false
      };

      // حفظ محلياً في سجل الإشعارات
      setNotifications(prev => {
        const updated = [activity, ...(prev || [])].slice(0, 50);
        localStorage.setItem('naif_pos_v3_notifications', JSON.stringify(updated));
        return updated;
      });

      // بث سحابي فوري للأجهزة الأخرى
      syncEngine.broadcastActivity(activity);
    } catch (e) {
      console.warn('[Activity Broadcast] Error:', e);
    }
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    setUnreadNotificationsCount(0);
    localStorage.setItem('naif_pos_v3_notifications', JSON.stringify([]));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => {
      const updated = (prev || []).map(n => ({ ...n, isRead: true }));
      localStorage.setItem('naif_pos_v3_notifications', JSON.stringify(updated));
      return updated;
    });
    setUnreadNotificationsCount(0);
  };

  // =========================================================================
  //  تنبيه نفاد المخزون (حد إعادة الطلب)
  // =========================================================================
  //  حقل minStock كان يُملأ ولا يُستثمر في أي تنبيه فعلي، فينفد الصنف على
  //  الرفّ قبل أن ينتبه أحد. هنا يُطلق تنبيه واحد لكل صنف لحظة نزوله إلى
  //  الحد أو تحته. لا يتكرر التنبيه ما دام الصنف منخفضاً — يُعاد السماح به
  //  فقط بعد أن يرتفع فوق الحد (توريد) ثم ينزل ثانية. وهو تنبيه محلي لا
  //  يُبثّ سحابياً كي لا يُغرق أجهزة بقية الكاشيرات بنفس الرسالة.
  // =========================================================================
  const lowStockNotifiedRef = useRef(new Set());

  useEffect(() => {
    if (!Array.isArray(products) || products.length === 0) return;

    const notified = lowStockNotifiedRef.current;
    const newlyLow = [];

    products.forEach(p => {
      if (!p || p.isService || p.isArchived) return;
      const min = Number(p.minStock) || 0;
      if (min <= 0) return;                       // صنف بلا حد تنبيه
      const stock = Number(p.stock) || 0;
      if (stock <= min) {
        if (!notified.has(p.id)) {
          notified.add(p.id);
          newlyLow.push(p);
        }
      } else {
        notified.delete(p.id);                    // عاد فوق الحد
      }
    });

    if (newlyLow.length === 0) return;

    const first = newlyLow[0];
    const others = newlyLow.length - 1;
    const entry = {
      id: `lowstock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'low_stock',
      title: '⚠️ تنبيه: مخزون بلغ حد إعادة الطلب',
      message: others > 0
        ? `${first.name || 'صنف'} (المتبقي ${Number(first.stock) || 0}) و${others} صنفاً آخر بحاجة إلى توريد`
        : `${first.name || 'صنف'} — المتبقي ${Number(first.stock) || 0} وحد التنبيه ${Number(first.minStock) || 0}`,
      amount: 0,
      userName: currentUser?.name || '',
      userRole: currentUser?.role || '',
      userId: currentUser?.id,
      timestamp: new Date().toISOString(),
      isRead: false
    };

    setNotifications(prev => {
      const updated = [entry, ...(prev || [])].slice(0, 50);
      try { localStorage.setItem('naif_pos_v3_notifications', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
    setUnreadNotificationsCount(c => (Number(c) || 0) + 1);
  }, [products]);

  
  // تحديث الوردية الحالية والحفاظ على عزل كل مستخدم وكاشير بشكل مستقل
  useEffect(() => {
    if (!currentUser?.id) return;
    const currentUserId = currentUser.id;
    const historyList = shiftsHistory || [];

    // 1. فحص وردية المستخدم الحالي في userShifts ومطابقة معرف المستخدم حصراً
    const existingShift = userShifts && userShifts[currentUserId];
    const isExistingShiftOpen = existingShift && 
      existingShift.userId === currentUserId &&
      existingShift.isOpen === true && 
      existingShift.status !== 'closed' &&
      !existingShift.closedAt && 
      !historyList.some(h => h && h.id === existingShift.id && (h.status === 'closed' || h.closedAt || h.isOpen === false));

    if (isExistingShiftOpen) {
      if (
        activeShift &&
        activeShift.id === existingShift.id &&
        activeShift.userId === currentUserId &&
        activeShift.isOpen === true &&
        activeShift.cashSales === existingShift.cashSales &&
        activeShift.cardSales === existingShift.cardSales &&
        activeShift.creditSales === existingShift.creditSales &&
        activeShift.startCash === existingShift.startCash
      ) {
        return;
      }
      const openObj = { ...existingShift, userId: currentUserId, isOpen: true, status: 'open' };
      activeShiftRef.current = openObj;
      setActiveShift(openObj);
      return;
    }

    // 2. إذا كانت الوردية الحالية في activeShift تخص هذا المستخدم حصراً ومفتوحة بالفعل
    const isActiveOpen = activeShift && 
      activeShift.userId === currentUserId &&
      activeShift.isOpen === true &&
      activeShift.status !== 'closed' &&
      !activeShift.closedAt && 
      !historyList.some(h => h && h.id === activeShift.id && (h.status === 'closed' || h.closedAt || h.isOpen === false));

    if (isActiveOpen) {
      return;
    }

    // 3. المستخدم الحالي ليس لديه أي وردية مفتوحة -> حالته مغلقة ومستقلة تماماً
    if (activeShift && activeShift.isOpen === false && activeShift.userId === currentUserId) {
      return;
    }

    const closedPlaceholder = {
      id: `shift-${currentUserId}`,
      isOpen: false,
      openedAt: null,
      closedAt: new Date().toISOString(),
      startCash: 0,
      cashSales: 0,
      cardSales: 0,
      creditSales: 0,
      cashIn: 0,
      cashOut: 0,
      userId: currentUserId,
      cashierName: currentUser.name || 'كاشير بيت الورد',
      status: 'closed'
    };

    activeShiftRef.current = closedPlaceholder;
    setActiveShift(closedPlaceholder);
  }, [currentUser?.id, userShifts, shiftsHistory]);

  // تشغيل والاستماع للمزامنة السحابية الحية وسحب البيانات فوراً عند بدء التشغيل
  useEffect(() => {
    // مهم جداً: قواعد Firestore الحالية تشترط تسجيل الدخول (isSignedIn()).
    // firebaseUser === undefined  → لسّا نتحقق من حالة الدخول (لم يكتمل الفحص بعد)
    // firebaseUser === null       → المستخدم غير مسجّل دخول
    // إن حاولنا نبدأ المزامنة أو نسحب البيانات قبل اكتمال تسجيل الدخول، يرفض
    // Firestore الطلب (permission-denied) بصمت، ولا تُعاد المحاولة تلقائياً
    // بعد تسجيل الدخول — وهذا سبب عدم ظهور المنتجات رغم وجودها في pos_products.
    if (!firebaseUser) return;

    syncEngine.startRealtimeSync();

    // السحب الفوري المباشر من قاعدة البيانات السحابية عند بدء التشغيل
    syncEngine.pullAllRemote().then(result => {
      if (result.success && result.data) {
        // وضع علامة "تحديث سحابي" لمنع إعادة الرفع المزدوج
        const remoteKeys = ['store_info','categories','products','customers','suppliers','users','active_shift','user_shifts','invoices','purchases','expenses','drawer_tx','receipts','shifts_history','held_bills','treasury_ledger'];
        // نضع العلامة فقط للأقسام التي وصلت فعلاً من السحابة. وضعها لكل الأقسام
        // كان يجعل أول تغيير محلي في أي قسم فارغ سحابياً يُبتلع بلا رفع، فيبدو
        // أن التعديل "ما وصل" للأجهزة الأخرى حتى تعمل تعديلاً ثانياً.
        remoteKeys.forEach(k => { isRemoteUpdateRef.current[k] = (result.data[k] !== undefined); });

        if (result.data.store_info) setStoreInfo(sanitizeStoreInfo(result.data.store_info));
        if (result.data.categories) setCategories(result.data.categories);
        if (result.data.products) setProducts(result.data.products);
        if (result.data.customers) setCustomers(result.data.customers);
        if (result.data.suppliers) setSuppliers(result.data.suppliers);
        if (result.data.users) setUsers(result.data.users);
        if (result.data.user_shifts !== undefined) {
          const currentUid = currentUser?.id || 'admin';
          const validUsers = result.data.users || users || [];
          // ✦ أُلغي فلتر "تاريخ تصفير الورديات" المخزَّن في localStorage.
        //   كان هذا آخر مصدر باقٍ لاختلاف الأرقام بين متصفحين: التاريخ
        //   محفوظ في متصفح واحد فقط، فيُخفي عنه ورديات مفتوحة يراها
        //   المتصفح الآخر — فتختلف "عهدة الكاشير" بين الجهازين رغم أن
        //   كل شيء آخر متطابق. السحابة هي المرجع الآن.
        const userShiftsResetAt = 0;

          setUserShifts(prevShifts => {
            const rawRemoteShifts = result.data.user_shifts || {};
            // إذا كانت السحابة مصفّرة بالكامل
            if (!rawRemoteShifts || Object.keys(rawRemoteShifts).length === 0) {
              localStorage.setItem('naif_pos_v3_user_shifts', '{}');
              const closedShiftObj = { id: `shift-${currentUid}`, isOpen: false, status: 'closed', userId: currentUid, cashierName: currentUser?.name || 'كاشير', startCash: 0 };
              setActiveShift(closedShiftObj);
              localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(closedShiftObj));
              return {};
            }

            const remoteShifts = cleanUserShifts(rawRemoteShifts, validUsers);
            const localSavedActive = getSaved('active_shift', null);
            const localShift = (prevShifts && prevShifts[currentUid]) 
              || (activeShift?.isOpen && activeShift?.userId === currentUid ? activeShift : null) 
              || (localSavedActive?.isOpen && localSavedActive?.userId === currentUid ? localSavedActive : null);

            const merged = { ...(prevShifts || {}) };
            Object.keys(remoteShifts).forEach(k => {
              const rSh = remoteShifts[k];
              const rOpenedTs = new Date(rSh?.openedAt || 0).getTime();
              if (!userShiftsResetAt || !rOpenedTs || rOpenedTs >= userShiftsResetAt) {
                // الأحدث ختماً يفوز: لا تُكتب نسخة سحابية قديمة فوق إغلاق أحدث
                merged[k] = pickNewerShift(prevShifts?.[k], rSh);
              }
            });

            if (localShift && localShift.isOpen === true && !localShift.closedAt && localShift.status !== 'closed') {
              const shiftUid = currentUid;
              const remoteShift = merged[shiftUid];
              const localOpenedTs = new Date(localShift.openedAt || 0).getTime();
              const remoteClosedTs = new Date(remoteShift?.closedAt || 0).getTime();
              if ((!userShiftsResetAt || localOpenedTs >= userShiftsResetAt) && (!remoteShift || (!remoteShift.closedAt && remoteShift.isOpen && localOpenedTs >= remoteClosedTs))) {
                merged[shiftUid] = localShift;
              }
            }
            const cleanMerged = cleanUserShifts(merged, validUsers);
            localStorage.setItem('naif_pos_v3_user_shifts', JSON.stringify(cleanMerged));
            const myEff = cleanMerged[currentUid];
            if (myEff && myEff.isOpen === true && !myEff.closedAt && myEff.status !== 'closed') {
              setActiveShift(myEff);
              localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(myEff));
            } else {
              const closedShiftObj = myEff || { id: `shift-${currentUid}`, isOpen: false, status: 'closed', userId: currentUid, cashierName: currentUser?.name || 'كاشير', startCash: 0 };
              setActiveShift(closedShiftObj);
              localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(closedShiftObj));
            }
            return cleanMerged;
          });
        }
        if (result.data.invoices !== undefined) {
          const remoteInvoices = Array.isArray(result.data.invoices) ? result.data.invoices : [];
          setInvoices(prev => {
            if (remoteInvoices.length === 0) {
              localStorage.setItem('naif_pos_v3_invoices', '[]');
              return [];
            }
            const resetAt = Number(localStorage.getItem('naif_pos_v3_invoices_reset_at') || 0);
            const effectiveResetAt = Math.max(resetAt, 1788480000000);
            const filteredRemote = remoteInvoices.filter(i => new Date(i.date || 0).getTime() >= effectiveResetAt);
            const filteredPrev = (prev || []).filter(i => new Date(i.date || 0).getTime() >= effectiveResetAt);
            const merged = filteredRemote.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));   // ✦ السحابة هي المرجع
            localStorage.setItem('naif_pos_v3_invoices', JSON.stringify(merged));
            return merged;
          });
        }
        if (result.data.purchases) {
          setPurchases(prev => {
            const merged = result.data.purchases;   // ✦ السحابة هي المرجع
            localStorage.setItem('naif_pos_v3_purchases', JSON.stringify(merged));
            return merged;
          });
        }
        if (result.data.expenses) {
          setExpenses(prev => {
            const merged = result.data.expenses;   // ✦ السحابة هي المرجع
            localStorage.setItem('naif_pos_v3_expenses', JSON.stringify(merged));
            return merged;
          });
        }
        if (result.data.drawer_tx) {
          setDrawerTransactions(prev => {
            const merged = result.data.drawer_tx;   // ✦ السحابة هي المرجع
            localStorage.setItem('naif_pos_v3_drawer_tx', JSON.stringify(merged));
            return merged;
          });
        }
        if (result.data.receipts) {
          setPaymentReceipts(prev => {
            const merged = result.data.receipts;   // ✦ السحابة هي المرجع
            localStorage.setItem('naif_pos_v3_receipts', JSON.stringify(merged));
            return merged;
          });
        }
        if (result.data.shifts_history) {
          setShiftsHistory(prev => {
            const merged = result.data.shifts_history;   // ✦ السحابة هي المرجع
            localStorage.setItem('naif_pos_v3_shifts_history', JSON.stringify(merged));
            return merged;
          });
        }
        if (result.data.held_bills) {
          setHeldBills(prev => {
            const merged = result.data.held_bills;   // ✦ السحابة هي المرجع
            localStorage.setItem('naif_pos_v3_held_bills', JSON.stringify(merged));
            return merged;
          });
        }
        if (result.data.treasury_ledger) {
          setTreasuryLedger(prev => {
            const merged = result.data.treasury_ledger;   // ✦ السحابة هي المرجع
            localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(merged));
            return merged;
          });
        }
        if (result.data.login_logs) {
          setLoginLogs(prev => {
            const merged = smartMergeList(prev, result.data.login_logs, 'id', 'login_logs').slice(0, 300);
            localStorage.setItem('naif_pos_v3_login_logs', JSON.stringify(merged));
            return merged;
          });
        }
        if (result.data.audit_logs) {
          setAuditLogs(prev => {
            const merged = smartMergeList(prev, result.data.audit_logs, 'id', 'audit_logs').slice(0, 1000);
            localStorage.setItem('naif_pos_v3_audit_logs', JSON.stringify(merged));
            return merged;
          });
        }
      }
      // تفعيل المزامنة الفعلية فقط بعد اكتمال السحب الأولي
      hasInitializedRef.current = true;
    });

    const unsubStatus = syncEngine.onStatusChange((status, lastTime) => {
      setSyncStatus(status);
      setLastSyncTime(lastTime);
    });

    
    const unsubActivity = syncEngine.onActivity((activity) => {
      try {
        // تشغيل التنبيه الصوتي الخفيف والناعم فوراً
        playGentleNotificationSound();

        // إضافة التنبيه لسجل الإشعارات
        setNotifications(prev => {
          const updated = [{ ...activity, isRead: false }, ...(prev || [])].slice(0, 50);
          localStorage.setItem('naif_pos_v3_notifications', JSON.stringify(updated));
          return updated;
        });
        setUnreadNotificationsCount(prev => prev + 1);

        // إظهار البانر العائم أعلى الشاشة
        setLiveAlert(activity);
        if (liveAlertTimerRef.current) clearTimeout(liveAlertTimerRef.current);
        liveAlertTimerRef.current = setTimeout(() => {
          setLiveAlert(null);
        }, 5500);
      } catch (err) {
        console.error('[SyncEngine Activity Handler] Error:', err);
      }
    });

    const unsubRemote = syncEngine.onRemoteChange((key, remoteData) => {
      isRemoteUpdateRef.current[key] = true;
      if (key === 'store_info' && remoteData) setStoreInfo(sanitizeStoreInfo(remoteData));
      else if (key === 'categories' && Array.isArray(remoteData)) setCategories(remoteData);
      else if (key === 'products' && Array.isArray(remoteData)) setProducts(remoteData);
      else if (key === 'customers' && Array.isArray(remoteData)) setCustomers(remoteData);
      else if (key === 'suppliers' && Array.isArray(remoteData)) setSuppliers(remoteData);
      else if (key === 'users' && Array.isArray(remoteData)) setUsers(remoteData);
      else if (key === 'user_shifts' && remoteData) {
        const currentUid = currentUser?.id || 'admin';
        const userShiftsResetAt = 0; // ✦ أُلغي: حاجز تصفير محلي يخصّ متصفحاً واحداً
        setUserShifts(prevShifts => {
          if (!remoteData || (typeof remoteData === 'object' && Object.keys(remoteData).length === 0)) {
            localStorage.setItem('naif_pos_v3_user_shifts', '{}');
            const closedShiftObj = { id: `shift-${currentUid}`, isOpen: false, status: 'closed', userId: currentUid, cashierName: currentUser?.name || 'كاشير', startCash: 0 };
            setActiveShift(closedShiftObj);
            localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(closedShiftObj));
            return {};
          }
          const remoteShifts = cleanUserShifts(remoteData || {}, users);
          const localShift = (prevShifts && prevShifts[currentUid]) || (activeShift?.isOpen && activeShift?.userId === currentUid ? activeShift : null);
          const merged = { ...(prevShifts || {}) };
          Object.keys(remoteShifts).forEach(k => {
            const rSh = remoteShifts[k];
            const rOpenedTs = new Date(rSh?.openedAt || 0).getTime();
            if (!userShiftsResetAt || !rOpenedTs || rOpenedTs >= userShiftsResetAt) {
              // الأحدث ختماً يفوز: لا تُكتب نسخة سحابية قديمة فوق إغلاق أحدث
              merged[k] = pickNewerShift(prevShifts?.[k], rSh);
            }
          });
          if (localShift && localShift.isOpen === true && !localShift.closedAt && localShift.status !== 'closed') {
            const remoteMyShift = merged[currentUid];
            const localOpenedTs = new Date(localShift.openedAt || 0).getTime();
            const remoteClosedTs = new Date(remoteMyShift?.closedAt || 0).getTime();
            if ((!userShiftsResetAt || localOpenedTs >= userShiftsResetAt) && (!remoteMyShift || (!remoteMyShift.closedAt && remoteMyShift.isOpen && localOpenedTs >= remoteClosedTs))) {
              merged[currentUid] = localShift;
            }
          }
          const cleanMerged = cleanUserShifts(merged, users);
          localStorage.setItem('naif_pos_v3_user_shifts', JSON.stringify(cleanMerged));
          const myEff = cleanMerged[currentUid];
          if (myEff && myEff.isOpen === true && !myEff.closedAt && myEff.status !== 'closed') {
            setActiveShift(myEff);
            localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(myEff));
          } else {
            const closedShiftObj = myEff || { id: `shift-${currentUid}`, isOpen: false, status: 'closed', userId: currentUid, cashierName: currentUser?.name || 'كاشير', startCash: 0 };
            setActiveShift(closedShiftObj);
            localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(closedShiftObj));
          }
          return cleanMerged;
        });
      }
      else if (key === 'invoices' && Array.isArray(remoteData)) {
        setInvoices(prev => {
          if (remoteData.length === 0) {
            localStorage.setItem('naif_pos_v3_invoices', '[]');
            return [];
          }
          // ✦ اللقطة هي المرجع الوحيد للفواتير أيضاً. الحدّ الأدنى الثابت
          //   للتصفير يبقى لأنه مشترك بين كل الأجهزة ومكتوب في الكود.
          const effectiveResetAt = Math.max(
            Number(localStorage.getItem('naif_pos_v3_invoices_reset_at') || 0),
            1788480000000
          );
          const merged = remoteData
            .filter(i => new Date(i.date || 0).getTime() >= effectiveResetAt)
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
          localStorage.setItem('naif_pos_v3_invoices', JSON.stringify(merged));
          return merged;
        });
      }
      else if (key === 'purchases' && Array.isArray(remoteData)) {
        setPurchases(prev => {
          if (remoteData.length === 0) {
            localStorage.setItem('naif_pos_v3_purchases', '[]');
            return [];
          }
          // ✦ اللقطة هي المرجع الوحيد: لا قواعد دمج يدوية بعد اليوم.
          //   محرك المزامنة يغطّي الكتابات المحلية غير المؤكَّدة بنفسه،
          //   فلا يختفي سجل كتبناه للتوّ ولا يعود سجل حذفناه.
          const merged = remoteData;
          localStorage.setItem('naif_pos_v3_purchases', JSON.stringify(merged));
          return merged;
        });
      }
      else if (key === 'expenses' && Array.isArray(remoteData)) {
        setExpenses(prev => {
          if (remoteData.length === 0) {
            localStorage.setItem('naif_pos_v3_expenses', '[]');
            return [];
          }
          // ✦ اللقطة هي المرجع الوحيد: لا قواعد دمج يدوية بعد اليوم.
          //   محرك المزامنة يغطّي الكتابات المحلية غير المؤكَّدة بنفسه،
          //   فلا يختفي سجل كتبناه للتوّ ولا يعود سجل حذفناه.
          const merged = remoteData;
          localStorage.setItem('naif_pos_v3_expenses', JSON.stringify(merged));
          return merged;
        });
      }
      else if (key === 'drawer_tx' && Array.isArray(remoteData)) {
        setDrawerTransactions(prev => {
          if (remoteData.length === 0) {
            localStorage.setItem('naif_pos_v3_drawer_tx', '[]');
            return [];
          }
          // ✦ اللقطة هي المرجع الوحيد: لا قواعد دمج يدوية بعد اليوم.
          //   محرك المزامنة يغطّي الكتابات المحلية غير المؤكَّدة بنفسه،
          //   فلا يختفي سجل كتبناه للتوّ ولا يعود سجل حذفناه.
          const merged = remoteData;
          localStorage.setItem('naif_pos_v3_drawer_tx', JSON.stringify(merged));
          return merged;
        });
      }
      else if (key === 'receipts' && Array.isArray(remoteData)) {
        setPaymentReceipts(prev => {
          if (remoteData.length === 0) {
            localStorage.setItem('naif_pos_v3_receipts', '[]');
            return [];
          }
          // ✦ اللقطة هي المرجع الوحيد: لا قواعد دمج يدوية بعد اليوم.
          //   محرك المزامنة يغطّي الكتابات المحلية غير المؤكَّدة بنفسه،
          //   فلا يختفي سجل كتبناه للتوّ ولا يعود سجل حذفناه.
          const merged = remoteData;
          localStorage.setItem('naif_pos_v3_receipts', JSON.stringify(merged));
          return merged;
        });
      }
      else if (key === 'shifts_history' && Array.isArray(remoteData)) {
        setShiftsHistory(prev => {
          if (remoteData.length === 0) {
            localStorage.setItem('naif_pos_v3_shifts_history', '[]');
            return [];
          }
          // ✦ اللقطة هي المرجع الوحيد: لا قواعد دمج يدوية بعد اليوم.
          //   محرك المزامنة يغطّي الكتابات المحلية غير المؤكَّدة بنفسه،
          //   فلا يختفي سجل كتبناه للتوّ ولا يعود سجل حذفناه.
          const merged = remoteData;
          localStorage.setItem('naif_pos_v3_shifts_history', JSON.stringify(merged));
          return merged;
        });
      }
      else if (key === 'treasury_ledger' && Array.isArray(remoteData)) {
        setTreasuryLedger(prev => {
          if (remoteData.length === 0) {
            localStorage.setItem('naif_pos_v3_treasury_ledger', '[]');
            return [];
          }
          // ✦ اللقطة هي المرجع الوحيد: لا قواعد دمج يدوية بعد اليوم.
          //   محرك المزامنة يغطّي الكتابات المحلية غير المؤكَّدة بنفسه،
          //   فلا يختفي سجل كتبناه للتوّ ولا يعود سجل حذفناه.
          const merged = remoteData;
          localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(merged));
          return merged;
        });
      }
      else if (key === 'held_bills' && Array.isArray(remoteData)) {
        setHeldBills(prev => {
          if (remoteData.length === 0) {
            localStorage.setItem('naif_pos_v3_held_bills', '[]');
            return [];
          }
          // ✦ اللقطة هي المرجع الوحيد: لا قواعد دمج يدوية بعد اليوم.
          //   محرك المزامنة يغطّي الكتابات المحلية غير المؤكَّدة بنفسه،
          //   فلا يختفي سجل كتبناه للتوّ ولا يعود سجل حذفناه.
          const merged = remoteData;
          localStorage.setItem('naif_pos_v3_held_bills', JSON.stringify(merged));
          return merged;
        });
      }
      else if (key === 'login_logs' && Array.isArray(remoteData)) {
        setLoginLogs(prev => {
          if (remoteData.length === 0) {
            localStorage.setItem('naif_pos_v3_login_logs', '[]');
            return [];
          }
          const merged = smartMergeList(prev, remoteData, 'id', 'login_logs').slice(0, 300);
          localStorage.setItem('naif_pos_v3_login_logs', JSON.stringify(merged));
          return merged;
        });
      }
      else if (key === 'spoilage_logs' && Array.isArray(remoteData)) {
        setSpoilageLogs(prev => {
          if (remoteData.length === 0) {
            localStorage.setItem('naif_pos_v3_spoilage_logs', '[]');
            return [];
          }
          const merged = remoteData;
          localStorage.setItem('naif_pos_v3_spoilage_logs', JSON.stringify(merged));
          return merged;
        });
      }
    });

    setTimeout(() => {
      hasInitializedRef.current = true;
    }, 2000);

    return () => {
      unsubStatus();
      unsubRemote();
      unsubActivity();
      if (liveAlertTimerRef.current) clearTimeout(liveAlertTimerRef.current);
      // نوقف مستمعي Firestore عند الخروج/تغيّر حالة الدخول حتى يُعاد بدء
      // المزامنة بشكل صحيح إذا سجّل المستخدم دخوله من جديد.
      syncEngine.stopRealtimeSync();
    };
  }, [firebaseUser]);

  // =========================================================================
  //  التهيئة المتقدمة والترحيل إلى IndexedDB
  // =========================================================================
  useEffect(() => {
    // ترحيل البيانات القديمة من localStorage لمرة واحدة تلقائياً
    migrateLocalStorageToIndexedDB();

    // فحص واسترجاع البيانات الضخمة من IndexedDB إذا كانت أحدث أو أكبر من localStorage
    const hydrateLargeCollections = async () => {
      try {
        const idbInvoices = await idbGet('naif_pos_v3_invoices');
        if (Array.isArray(idbInvoices) && idbInvoices.length > 0) {
          setInvoices(prev => (idbInvoices.length > prev.length ? idbInvoices : prev));
        }
        const idbShifts = await idbGet('naif_pos_v3_shifts_history');
        if (Array.isArray(idbShifts) && idbShifts.length > 0) {
          setShiftsHistory(prev => (idbShifts.length > prev.length ? idbShifts : prev));
        }
      } catch (err) {
        console.warn('[Storage] Hydration warning:', err?.message);
      }
    };
    hydrateLargeCollections();
  }, []);

  // =========================================================================
  //  التعافي التلقائي من التأخّر (Self-Healing Sync)
  // =========================================================================
  //  متصفح ظل مفتوحاً في تبويب خلفي، أو انقطع عنه الإنترنت لحظة، قد يفوته
  //  تحديث. سابقاً كان يبقى متأخّراً حتى يُعاد تحميله يدوياً — فتظهر أرقام
  //  مختلفة على جهازين في نفس الوقت. الآن: كل عودة للنشاط (فتح التبويب،
  //  رجوع الإنترنت) تسحب الحالة الكاملة من السحابة وتدمجها.
  //  محدود بمرة كل ٢٠ ثانية حتى لا يثقل الاتصال.
  const lastAutoPullRef = useRef(0);
  useEffect(() => {
    if (!firebaseUser) return;

    const refreshFromCloud = (reason) => {
      const now = Date.now();
      if (now - lastAutoPullRef.current < 20000) return;
      lastAutoPullRef.current = now;
      console.log('[Sync] تحديث تلقائي من السحابة —', reason);
      pullAllFromCloud().catch(err =>
        console.warn('[Sync] تعذّر التحديث التلقائي:', err?.message)
      );
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshFromCloud('عودة التبويب للواجهة');
    };
    const onOnline = () => refreshFromCloud('عودة الاتصال بالإنترنت');
    const onFocus = () => onVisible();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);

    // نبضة دورية كل ٣ دقائق: شبكة أمان لو فُقدت لقطة من Firestore بصمت
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') {
        lastAutoPullRef.current = 0; // نتجاوز المهلة للنبضة الدورية
        refreshFromCloud('نبضة دورية');
      }
    }, 180000);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      clearInterval(heartbeat);
    };
  }, [firebaseUser]);

  // دالة الحفظ والمزامنة السحابية مع التخزين عالي السعة في IndexedDB والحماية من أخطاء التخزين
  const saveAndSync = (key, data, immediate = false) => {
    const now = Date.now();
    // 1. الحفظ الفوري في IndexedDB بسعة غير محدودة لكافة المصفوفات والبيانات
    idbSet(`naif_pos_v3_${key}`, data);
    idbSet(`naif_pos_v3_ts_${key}`, now);

    // 2. محاولة الحفظ في LocalStorage كطبقة كاش متزامنة مع معالجة أخطاء الامتلاء
    safeLocalStorageSet(`naif_pos_v3_${key}`, data);
    safeLocalStorageSet(`naif_pos_v3_ts_${key}`, String(now));
    safeLocalStorageSet('naif_pos_v3_initialized', 'true');

    if (isRemoteUpdateRef.current[key] && !immediate) {
      isRemoteUpdateRef.current[key] = false;
      return;
    }
    if (hasInitializedRef.current || immediate) {
      syncEngine.saveKey(key, data, immediate, now);
    }
  };

  useEffect(() => { saveAndSync('store_info', storeInfo); }, [storeInfo]);
  useEffect(() => { saveAndSync('categories', categories); }, [categories]);
  useEffect(() => { saveAndSync('products', products); }, [products]);
  useEffect(() => { saveAndSync('customers', customers); }, [customers]);
  useEffect(() => { saveAndSync('suppliers', suppliers); }, [suppliers]);
  useEffect(() => { saveAndSync('users', users); }, [users]);
  useEffect(() => { 
    idbSet('naif_pos_v3_current_user', currentUser);
    safeLocalStorageSet('naif_pos_v3_current_user', currentUser); 
  }, [currentUser]);
  useEffect(() => { 
    idbSet('naif_pos_v3_active_shift', activeShift);
    safeLocalStorageSet('naif_pos_v3_active_shift', activeShift); 
  }, [activeShift]);
  useEffect(() => { saveAndSync('user_shifts', userShifts); }, [userShifts]);
  useEffect(() => { 
    idbSet('naif_pos_v3_cart', cart);
    safeLocalStorageSet('naif_pos_v3_cart', cart); 
  }, [cart]);
  useEffect(() => { saveAndSync('held_bills', heldBills); }, [heldBills]);
  useEffect(() => { saveAndSync('invoices', invoices); }, [invoices]);
  useEffect(() => { saveAndSync('purchases', purchases); }, [purchases]);
  useEffect(() => { saveAndSync('expenses', expenses); }, [expenses]);
  useEffect(() => { saveAndSync('drawer_tx', drawerTransactions); }, [drawerTransactions]);
  useEffect(() => { saveAndSync('receipts', paymentReceipts); }, [paymentReceipts]);
  useEffect(() => { saveAndSync('shifts_history', shiftsHistory); }, [shiftsHistory]);
  useEffect(() => { saveAndSync('treasury_ledger', treasuryLedger); }, [treasuryLedger]);
  useEffect(() => { saveAndSync('spoilage_logs', spoilageLogs); }, [spoilageLogs]);

  // دوال التحكم اليدوي والمزامنة التوحيدية الشاملة
  const pushAllToCloud = async () => {
    const currentState = {
      store_info: storeInfo,
      categories: categories,
      products: products,
      customers: customers,
      suppliers: suppliers,
      users: users,
      active_shift: activeShift,
      invoices: invoices,
      purchases: purchases,
      expenses: expenses,
      drawer_tx: drawerTransactions,
      receipts: paymentReceipts,
      shifts_history: shiftsHistory,
      held_bills: heldBills,
      user_shifts: userShifts,
      treasury_ledger: treasuryLedger,
      spoilage_logs: spoilageLogs
    };

    return await syncEngine.pushAllLocal(currentState);
  };

  const pullAllFromCloud = async () => {
    const result = await syncEngine.pullAllRemote();
    if (result.success && result.data) {
      if (result.data.store_info) setStoreInfo(sanitizeStoreInfo(result.data.store_info));
      if (result.data.categories) setCategories(result.data.categories);
      if (result.data.products) setProducts(result.data.products);
      if (result.data.customers) setCustomers(result.data.customers);
      if (result.data.suppliers) setSuppliers(result.data.suppliers);
      if (result.data.users) setUsers(result.data.users);
      if (result.data.user_shifts !== undefined) {
        const currentUid = currentUser?.id || 'admin';
        const userShiftsResetAt = 0; // ✦ أُلغي: حاجز تصفير محلي يخصّ متصفحاً واحداً
        setUserShifts(prevShifts => {
          const rawRemote = result.data.user_shifts || {};
          if (!rawRemote || Object.keys(rawRemote).length === 0) {
            localStorage.setItem('naif_pos_v3_user_shifts', '{}');
            const closedShift = { id: `shift-${currentUid}`, isOpen: false, status: 'closed', userId: currentUid, cashierName: currentUser?.name || 'كاشير', startCash: 0 };
            setActiveShift(closedShift);
            localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(closedShift));
            return {};
          }
          const remoteShifts = cleanUserShifts(rawRemote, users);
          const localShift = (prevShifts && prevShifts[currentUid]) || (activeShift?.isOpen && activeShift?.userId === currentUid ? activeShift : null);
          const merged = { ...(prevShifts || {}) };
          Object.keys(remoteShifts).forEach(k => {
            const rSh = remoteShifts[k];
            const rOpenedTs = new Date(rSh?.openedAt || 0).getTime();
            if (!userShiftsResetAt || !rOpenedTs || rOpenedTs >= userShiftsResetAt) {
              // الأحدث ختماً يفوز: لا تُكتب نسخة سحابية قديمة فوق إغلاق أحدث
              merged[k] = pickNewerShift(prevShifts?.[k], rSh);
            }
          });
          if (localShift && localShift.isOpen === true && !localShift.closedAt && localShift.status !== 'closed') {
            const remoteMyShift = merged[currentUid];
            const localOpenedTs = new Date(localShift.openedAt || 0).getTime();
            const remoteClosedTs = new Date(remoteMyShift?.closedAt || 0).getTime();
            if ((!userShiftsResetAt || localOpenedTs >= userShiftsResetAt) && (!remoteMyShift || (!remoteMyShift.closedAt && remoteMyShift.isOpen && localOpenedTs >= remoteClosedTs))) {
              merged[currentUid] = localShift;
            }
          }
          const cleanMerged = cleanUserShifts(merged, users);
          localStorage.setItem('naif_pos_v3_user_shifts', JSON.stringify(cleanMerged));
          const myEff = cleanMerged[currentUid];
          if (myEff && myEff.isOpen === true && !myEff.closedAt && myEff.status !== 'closed') {
            setActiveShift(myEff);
            localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(myEff));
          } else {
            const closedShift = { id: `shift-${currentUid}`, isOpen: false, status: 'closed', userId: currentUid, cashierName: currentUser?.name || 'كاشير', startCash: 0 };
            setActiveShift(closedShift);
            localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(closedShift));
          }
          return cleanMerged;
        });
      }
      if (result.data.invoices !== undefined) {
        const remoteInvoices = Array.isArray(result.data.invoices) ? result.data.invoices : [];
        setInvoices(prev => {
          if (remoteInvoices.length === 0) {
            localStorage.setItem('naif_pos_v3_invoices', '[]');
            return [];
          }
          // ✦ السحابة هي المرجع الوحيد — لا دمج يدوي
          const effectiveResetAt = Math.max(
            Number(localStorage.getItem('naif_pos_v3_invoices_reset_at') || 0),
            1788480000000
          );
          const merged = remoteInvoices
            .filter(i => new Date(i.date || 0).getTime() >= effectiveResetAt)
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
          localStorage.setItem('naif_pos_v3_invoices', JSON.stringify(merged));
          return merged;
        });
      }
      // ✦ كل هذه الأقسام تأخذ نسخة السحابة كما هي
      if (result.data.purchases) setPurchases(result.data.purchases);
      if (result.data.expenses) setExpenses(result.data.expenses);
      if (result.data.drawer_tx) setDrawerTransactions(result.data.drawer_tx);
      if (result.data.receipts) setPaymentReceipts(result.data.receipts);
      if (result.data.shifts_history) setShiftsHistory(result.data.shifts_history);
      if (result.data.held_bills) setHeldBills(result.data.held_bills);
      if (result.data.treasury_ledger) setTreasuryLedger(result.data.treasury_ledger);
      if (result.data.spoilage_logs) setSpoilageLogs(result.data.spoilage_logs);
    }
    return result;
  };

  // توحيد فواتير ومبيعات كافة الأجهزة فورياً مع السحابة بدون استثناء
  const syncAllDevicesInvoices = async () => {
    try {
      const pullResult = await syncEngine.pullAllRemote();
      const cloudInvoices = (pullResult && pullResult.data && Array.isArray(pullResult.data.invoices))
        ? pullResult.data.invoices
        : [];
      
      const localInvoices = Array.isArray(invoices) ? invoices : [];
      let storageInvoices = [];
      try {
        storageInvoices = JSON.parse(localStorage.getItem('naif_pos_v3_invoices') || '[]');
      } catch (e) {}

      // دمج شامل لكافة الفواتير من السحابة والذاكرة والتخزين المحلي بعد استبعاد الفواتير السابقة للتصفير
      const resetKey = 'naif_pos_v3_invoices_reset_at';
      const localResetAt = Number(localStorage.getItem(resetKey) || 0);
      const effectiveResetAt = Math.max(localResetAt, 1788480000000);

      const map = new Map();
      const addInv = (inv) => {
        if (!inv) return;
        if (inv.id && String(inv.id).startsWith('inv-rec-')) return;
        const iDate = new Date(inv.date || inv.createdAt || 0).getTime();
        if (iDate < effectiveResetAt) return;
        const key = String(inv.invoiceNumber || inv.id || '').trim();
        if (!key) return;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, inv);
        } else {
          if (inv.status === 'refunded' || (!existing.status && inv.status)) {
            map.set(key, inv);
          } else {
            const t1 = new Date(inv.date || inv.createdAt || 0).getTime();
            const t2 = new Date(existing.date || existing.createdAt || 0).getTime();
            if (t1 >= t2) map.set(key, inv);
          }
        }
      };

      cloudInvoices.forEach(addInv);
      storageInvoices.forEach(addInv);
      localInvoices.forEach(addInv);

      const merged = Array.from(map.values()).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      setInvoices(merged);
      try {
        localStorage.setItem('naif_pos_v3_invoices', JSON.stringify(merged));
        localStorage.setItem('naif_pos_v3_invoices_reset_at', String(effectiveResetAt));
        localStorage.setItem('naif_pos_v3_ts_invoices', String(Date.now()));
      } catch (e) {}

      // كتابة فورية للسحابة لتحديث كافة الأجهزة الأخرى
      await syncEngine.saveKey('invoices', merged, true);

      // تحديث الورديات أيضاً
      if (pullResult && pullResult.data && pullResult.data.user_shifts) {
        setUserShifts(prev => ({ ...pullResult.data.user_shifts, ...prev }));
      }

      return { success: true, count: merged.length };
    } catch (err) {
      console.error('[SyncAllInvoices] Error:', err);
      return { success: false, error: err.message };
    }
  };


  const activeShiftRef = useRef(activeShift);
  useEffect(() => { activeShiftRef.current = activeShift; }, [activeShift]);

  // عمليات سلة المشتريات
  const addToCart = (product, qty = 1) => {
    if (!product || !product.id) return false;
    // حماية صارمة: منع إضافة منتجات للسلة نهائياً بدون وردية مفتوحة للمستخدم الحالي
    const isShiftValidAndOpen = (sh) => {
      if (!sh || sh.isOpen !== true || sh.status === 'closed' || sh.closedAt) return false;
      return true;
    };
    const currentUid = currentUser?.id;
    const isCurrentShiftValid = (sh) => {
      if (!isShiftValidAndOpen(sh)) return false;
      return Boolean(currentUid && sh.userId === currentUid);
    };

    const currentShift = isCurrentShiftValid(activeShift)
      ? activeShift
      : isCurrentShiftValid(activeShiftRef.current)
        ? activeShiftRef.current
        : (userShifts && currentUid && isCurrentShiftValid(userShifts[currentUid]))
          ? userShifts[currentUid]
          : null;

    if (!currentShift || currentShift.isOpen !== true) {
      return false;
    }

    // تنبيه تجاوز المخزون: لا يمنع البيع (قد تكون كمية غير مجرودة)
    // لكنه لا يترك الكاشير يبيع رصيداً سالباً دون أن يدري.
    if (!product.isService) {
      const available = Number(product.stock) || 0;
      const inCart = (Array.isArray(cart) ? cart : [])
        .filter(ci => (ci.product?.id || ci.id) === product.id)
        .reduce((sum, ci) => sum + (Number(ci.qty) || 0), 0);
      const wanted = inCart + (Number(qty) || 1);
      if (wanted > available) {
        const ok = window.confirm(
          `⚠️ الكمية المطلوبة من (${product.name}) أكبر من المتوفر بالمخزون.\n\n` +
          `المتوفر: ${available} • في السلة: ${inCart} • المطلوب: ${wanted}\n\n` +
          `المتابعة ستجعل رصيد الصنف بالسالب. هل تريد المتابعة؟`
        );
        if (!ok) return false;
      }
    }

    setCart(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const prodId = product.id;
      const existingIndex = safePrev.findIndex(item => (item.product?.id || item.id) === prodId);
      if (existingIndex > -1) {
        const updated = [...safePrev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          qty: (Number(updated[existingIndex].qty) || 1) + qty
        };
        return updated;
      } else {
        return [...safePrev, {
          product,
          qty: Math.max(1, qty),
          unitPrice: Number(product.sellingPrice ?? product.price ?? 0),
          discount: 0
        }];
      }
    });
    return true;
  };

  const updateCartQty = (productId, newQty) => {
    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev => (prev || []).map(item => 
      (item.product?.id || item.id) === productId ? { ...item, qty: newQty } : item
    ));
  };

  const updateCartItemPrice = (productId, newPrice) => {
    setCart(prev => (prev || []).map(item => {
      if ((item.product?.id || item.id) === productId) {
        // حماية من السعر الصفري (البق مسبقاً كان يسمح ببيع المنتج بصفر)
        const safePrice = Math.max(0.01, Number(newPrice) || 0.01);
        return { ...item, unitPrice: safePrice, discount: 0 };
      }
      return item;
    }));
  };

  // تعديل إجمالي الصنف مع قسمته تلقائياً على عدد الحبات وضبط الهللات
  const updateCartItemTotal = (productId, targetTotal) => {
    setCart(prev => (prev || []).map(item => {
      if ((item.product?.id || item.id) !== productId) return item;
      const total = Math.max(0, Number(targetTotal) || 0);
      const qty = Math.max(1, Number(item.qty) || 1);

      // تقسيم الإجمالي على الكمية
      const exactUnitPrice = total / qty;
      const roundedUnitPrice = Math.round(exactUnitPrice * 100) / 100;
      
      // فحص هل التقريب يسبب زيادة أو نقص عن الإجمالي المطلوب
      const calculatedGross = Math.round(roundedUnitPrice * qty * 100) / 100;
      let finalUnitPrice = roundedUnitPrice;
      let finalDiscount = 0;

      if (calculatedGross > total) {
        // فارق هللات زيادة -> نضع الفرق كخصم للصنف ليكون الصافي مطابق تماماً للهدف
        finalDiscount = Math.round((calculatedGross - total) * 100) / 100;
      } else if (calculatedGross < total) {
        // فارق هللات نقص -> نرفع سعر الوحدة هللة واحدة ونضع الفرق كخصم
        finalUnitPrice = Math.round((roundedUnitPrice + 0.01) * 100) / 100;
        const newGross = Math.round(finalUnitPrice * qty * 100) / 100;
        finalDiscount = Math.round((newGross - total) * 100) / 100;
      }

      return {
        ...item,
        unitPrice: finalUnitPrice,
        discount: finalDiscount
      };
    }));
  };

  const updateCartItemDiscount = (productId, discountVal) => {
    setCart(prev => (prev || []).map(item => 
      (item.product?.id || item.id) === productId ? { ...item, discount: Number(discountVal) || 0 } : item
    ));
  };

  const removeFromCart = (productId) => {
    setCart(prev => (prev || []).filter(item => (item.product?.id || item.id) !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomer(customers[0] || INITIAL_CUSTOMERS[0]);
    setCartDiscount({ type: 'fixed', value: 0 });
    setCartNotes('');
  };

  // حسابات إجماليات السلة والضريبة الذكية والمطابقة المحاسبية الدقيقة
  const getCartTotals = () => {
    // 1. المجموع الإجمالي للأصناف قبل أي خصم (Gross Subtotal)
    const grossSubtotal = (cart || []).reduce((sum, item) => {
      const uPrice = Number(item.unitPrice ?? item.price ?? item.product?.sellingPrice ?? 0);
      const q = Number(item.qty ?? item.quantity ?? 1);
      return sum + (uPrice * q);
    }, 0);

    // 2. إجمالي خصومات الأصناف الفردية
    const itemDiscounts = (cart || []).reduce((sum, item) => sum + (Number(item.discount) || 0), 0);

    // 3. الصافي بعد خصومات الأصناف وقبل الخصم العام
    const afterItemDiscounts = Math.max(0, grossSubtotal - itemDiscounts);

    // 4. الخصم العام على مستوى الفاتورة (مبلغ أو نسبة)
    let globalDiscount = 0;
    if (cartDiscount?.type === 'percent') {
      globalDiscount = (afterItemDiscounts * (cartDiscount?.value || 0)) / 100;
    } else {
      globalDiscount = Number(cartDiscount?.value) || 0;
    }
    globalDiscount = Math.min(afterItemDiscounts, globalDiscount);

    // 5. إجمالي كافة الخصومات (خصومات الأصناف + الخصم العام)
    const totalDiscount = Number((itemDiscounts + globalDiscount).toFixed(2));

    // 6. الصافي النهائي الخاضع بعد كافة الخصومات
    const discountedTotal = Math.max(0, grossSubtotal - totalDiscount);

    // التحقق من حالة الضريبة
    const isTaxActive = storeInfo?.taxEnabled !== false;
    const taxRate = isTaxActive ? (Number(storeInfo?.taxRate) >= 0 ? Number(storeInfo?.taxRate) : 15) : 0;
    const isTaxInclusive = storeInfo?.taxInclusive !== false;

    let taxAmount = 0;
    let total = 0;
    let taxableAmount = 0;

    if (!isTaxActive || taxRate === 0) {
      // 1. الضريبة غير مفعلة / معفاة (0%)
      taxAmount = 0;
      taxableAmount = discountedTotal;
      total = discountedTotal;
    } else if (isTaxInclusive) {
      // 2. الأسعار شاملة الضريبة (استخراج الضريبة رياضياً من الإجمالي)
      total = discountedTotal;
      taxableAmount = Number((total / (1 + (taxRate / 100))).toFixed(2));
      taxAmount = Number((total - taxableAmount).toFixed(2));
    } else {
      // 3. الأسعار غير شاملة الضريبة (تضاف الضريبة فوق الإجمالي)
      taxableAmount = discountedTotal;
      taxAmount = Number(((taxableAmount * taxRate) / 100).toFixed(2));
      total = Number((taxableAmount + taxAmount).toFixed(2));
    }

    return {
      subtotal: Number(grossSubtotal.toFixed(2)),
      grossSubtotal: Number(grossSubtotal.toFixed(2)),
      itemDiscounts: Number(itemDiscounts.toFixed(2)),
      globalDiscount: Number(globalDiscount.toFixed(2)),
      totalDiscount,
      discount: totalDiscount,
      discountedTotal: Number(discountedTotal.toFixed(2)),
      taxRate: isTaxActive ? taxRate : 0,
      taxAmount: Number(taxAmount.toFixed(2)),
      taxableAmount: Number(taxableAmount.toFixed(2)),
      isTaxInclusive,
      isTaxActive: isTaxActive && taxRate > 0,
      total: Number(total.toFixed(2))
    };
  };

  // تعليق الفاتورة الحالية (Hold Bill)
  // =====================================================================
  //  تعليق الفواتير موقوف بأمر إدارة المتجر
  // =====================================================================
  //  السبب: الفاتورة المعلقة كانت تبقى بلا صاحب ولا وردية، فيعجز الجميع
  //  عن إكمالها أو حذفها. المتاح الآن: إكمال البيع أو تفريغ السلة فقط.
  //  استرجاع/حذف الفواتير المعلقة القديمة ما زال متاحاً حتى لا يعلق شيء.
  const HOLD_BILLS_ENABLED = false;

  const holdCurrentCart = (label = '') => {
    if (!HOLD_BILLS_ENABLED) {
      alert('⛔ تعليق الفواتير موقوف في النظام.\nأكمل عملية البيع أو أفرغ السلة.');
      return false;
    }
    if (cart.length === 0) return false;
    const newHold = {
      id: `hold-${Date.now()}`,
      label: label || `فاتورة معلقة (${selectedCustomer?.name || 'عميل نقدي'})`,
      cart: [...cart],
      selectedCustomer,
      cartDiscount,
      cartNotes,
      timestamp: new Date().toISOString(),
      itemsCount: cart.reduce((s, i) => s + i.qty, 0),
      total: getCartTotals().total
    };
    setHeldBills(prev => [newHold, ...prev]);
    clearCart();
    return true;
  };

  // استرجاع فاتورة معلقة
  const restoreHeldBill = (heldId) => {
    const bill = heldBills.find(b => b.id === heldId);
    if (!bill) return;
    setCart(bill.cart);
    setSelectedCustomer(bill.selectedCustomer);
    setCartDiscount(bill.cartDiscount || { type: 'fixed', value: 0 });
    setCartNotes(bill.cartNotes || '');
    syncEngine.deleteRecord('held_bills', heldId);   // حذف صريح من السحابة
    setHeldBills(prev => prev.filter(b => b.id !== heldId));
  };

  // دوال إدارة وسائل الدفع المخصصة
  const addPaymentMethod = (newMethod) => {
    setStoreInfo(prev => {
      const currentList = prev.paymentMethods || INITIAL_PAYMENT_METHODS;
      return {
        ...prev,
        paymentMethods: [...currentList, newMethod]
      };
    });
  };

  const updatePaymentMethod = (updatedMethod) => {
    setStoreInfo(prev => {
      const currentList = prev.paymentMethods || INITIAL_PAYMENT_METHODS;
      return {
        ...prev,
        paymentMethods: currentList.map(m => m.id === updatedMethod.id ? updatedMethod : m)
      };
    });
  };

  const deletePaymentMethod = (methodId) => {
    setStoreInfo(prev => {
      const currentList = prev.paymentMethods || INITIAL_PAYMENT_METHODS;
      return {
        ...prev,
        paymentMethods: currentList.filter(m => m.id !== methodId)
      };
    });
  };

  const deleteHeldBill = (heldId) => {
    syncEngine.deleteRecord('held_bills', heldId);   // حذف صريح من السحابة
    setHeldBills(prev => prev.filter(b => b.id !== heldId));
  };

  // إتمام عملية الدفع وإنشاء الفاتورة مع الربط الحسابي الكامل ودعم تقسيم الفاتورة المتعدد
  const checkout = ({
    paymentMethod = 'cash', // id
    paymentMethodName = 'نقداً',
    paymentMethodType = 'cash', // cash, card, online, credit, split, custom
    receivedAmount = 0,
    splitCash = 0,
    splitCard = 0,
    changeAmount = 0,
    splitPayments = null,
    notes = '',
    customer = null
  }) => {
    if (cart.length === 0) return null;

    // حماية صارمة: منع البيع نهائياً إذا لم تكن هناك وردية مفتوحة للمستخدم الحالي
    const isShiftValidAndOpen = (sh) => {
      if (!sh || sh.isOpen !== true || sh.status === 'closed' || sh.closedAt) return false;
      return true;
    };
    const currentUid = currentUser?.id;
    const isCurrentShiftValid = (sh) => {
      if (!isShiftValidAndOpen(sh)) return false;
      return Boolean(currentUid && sh.userId === currentUid);
    };

    const effShift = isCurrentShiftValid(activeShift)
      ? activeShift
      : isCurrentShiftValid(activeShiftRef.current)
        ? activeShiftRef.current
        : (userShifts && currentUid && isCurrentShiftValid(userShifts[currentUid]))
          ? userShifts[currentUid]
          : null;

    if (!effShift || effShift.isOpen !== true) {
      alert('⛔ تنبيه صارم: يمنع البيع نهائياً قبل فتح وردية للمستخدم الحالي (' + (currentUser?.name || '') + ') وتوثيق العهدة النقدية الافتتاحية!');
      return null;
    }

    // حماية من الضغط المزدوج على "تأكيد الدفع":
    // الضغطتان تقعان قبل أن تُحدَّث حالة React، فتنتج فاتورتان بنفس الرقم
    // ويُخصم المخزون مرتين لعملية بيع واحدة. أي استدعاء ثانٍ خلال ثانيتين يُتجاهل.
    const checkoutNow = Date.now();
    if (checkoutNow - lastCheckoutAtRef.current < 2000) {
      console.warn('[checkout] تم تجاهل محاولة بيع مكررة خلال أقل من ثانيتين (ضغط مزدوج).');
      return null;
    }
    lastCheckoutAtRef.current = checkoutNow;

    const effectiveCustomer = customer || selectedCustomer;
    const totals = getCartTotals();
    const invoiceNum = generateInvoiceNumber((invoices || []).length + 1, currentUser, invoices);
    const dateStr = new Date().toISOString();

    // توليد نص TLV للـ QR
    const qrData = generateZatcaTLV(
      storeInfo?.name || 'بيت الورد للزهور والهدايا',
      storeInfo?.taxNumber || '300000000000003',
      dateStr,
      totals.total,
      totals.taxAmount
    );

    const isSplitType = paymentMethodType === 'split' || paymentMethod === 'split' || (Array.isArray(splitPayments) && splitPayments.length > 0);
    const isCashType = !isSplitType && (paymentMethodType === 'cash' || paymentMethod === 'cash');
    const isCreditType = !isSplitType && (paymentMethodType === 'credit' || paymentMethod === 'credit');

    // معالجة الدفعات المقسمة وحساب مكوناتها بدقة
    let effectiveSplitPayments = splitPayments;
    let splitCashSum = Number(splitCash) || 0;
    let splitCardSum = Number(splitCard) || 0;
    let splitCreditSum = 0;
    let totalCashReceivedInSplit = 0;
    let totalChangeInSplit = 0;

    if (isSplitType && Array.isArray(splitPayments) && splitPayments.length > 0) {
      splitCashSum = 0;
      splitCardSum = 0;
      splitCreditSum = 0;
      totalCashReceivedInSplit = 0;
      totalChangeInSplit = 0;

      splitPayments.forEach(sp => {
        const amt = Number(sp.amount) || 0;
        const isCashMethod = sp.methodType === 'cash' || sp.methodId === 'cash';
        const isCreditMethod = sp.methodType === 'credit' || sp.methodId === 'credit';

        if (isCashMethod) {
          splitCashSum += amt;
          const rec = (sp.cashReceived === '' || sp.cashReceived === null || sp.cashReceived === undefined) ? amt : (Number(sp.cashReceived) || 0);
          totalCashReceivedInSplit += rec;
          totalChangeInSplit += Math.max(0, rec - amt);
        } else if (isCreditMethod) {
          splitCreditSum += amt;
        } else {
          splitCardSum += amt;
        }
      });
    }

    const calculatedChange = isSplitType 
      ? (totalChangeInSplit || Number(changeAmount) || 0)
      : (isCashType ? Math.max(0, (Number(receivedAmount) || totals.total) - totals.total) : 0);

    const calculatedReceived = isSplitType
      ? (totalCashReceivedInSplit > 0 ? (totals.total - splitCashSum + totalCashReceivedInSplit) : totals.total)
      : (isCashType ? (Number(receivedAmount) || totals.total) : totals.total);

    const effectiveUid = currentUid || 'admin';
    const currentName = currentUser?.name || 'كاشير رئيسي';

    const newInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: invoiceNum,
      shiftId: effShift.id,
      date: dateStr,
      items: cart.map(item => ({
        ...item,
        name: item.name || item.product?.name || 'صنف',
        price: Number(item.unitPrice ?? item.price ?? item.product?.sellingPrice ?? 0),
        unitPrice: Number(item.unitPrice ?? item.price ?? item.product?.sellingPrice ?? 0),
        quantity: Number(item.qty ?? item.quantity ?? 1),
        qty: Number(item.qty ?? item.quantity ?? 1),
        discount: Number(item.discount || 0),
        // تكلفة الصنف لحظة البيع — تُثبَّت في الفاتورة حتى لا يتغيّر
        // ربح الشهور الماضية إذا تغيّر سعر المورد لاحقاً.
        costAtSale: Number(
          item.costPrice
          ?? item.product?.costPrice
          ?? (products || []).find(p => p.id === (item.product?.id || item.id))?.costPrice
          ?? 0
        ) || 0
      })),
      customer: effectiveCustomer,
      cashier: currentName,
      cashierId: effectiveUid,
      userId: effectiveUid,
      subtotal: totals.subtotal,
      discount: totals.totalDiscount,
      taxRate: totals.taxRate,
      taxAmount: totals.taxAmount,
      taxableAmount: totals.taxableAmount,
      taxInclusive: totals.isTaxInclusive,
      taxEnabled: totals.isTaxActive,
      total: totals.total,
      paymentMethod: isSplitType ? 'split' : paymentMethod,
      paymentMethodName: isSplitType ? 'دفع مقسم (متعدد)' : resolvePaymentMethodName({ id: paymentMethod, name: paymentMethodName, type: paymentMethodType }, storeInfo?.paymentMethods),
      paymentMethodType: isSplitType ? 'split' : (paymentMethodType || 'card'),
      receivedAmount: calculatedReceived,
      changeAmount: calculatedChange,
      splitCash: splitCashSum,
      splitCard: splitCardSum,
      splitCredit: splitCreditSum,
      splitPayments: effectiveSplitPayments,
      notes: notes || cartNotes,
      qrData,
      status: 'completed', // completed, refunded
    };

    // 1. فحص كفاية المخزون وتحذير الكاشير
    const insufficientItems = (cart || []).filter(ci => {
      if (ci.product?.isService || ci.isService) return false;
      const pid = ci.product?.id || ci.id;
      const prod = (products || []).find(p => p.id === pid);
      return prod && !prod.isService && prod.stock < ci.qty;
    });
    if (insufficientItems.length > 0) {
      const warnMsg = insufficientItems.map(ci => {
        const pid = ci.product?.id || ci.id;
        const prod = (products || []).find(p => p.id === pid);
        const name = ci.product?.name || ci.name || prod?.name || 'صنف';
        return `• ${name}: المطلوب ${ci.qty} / المتوفر ${prod?.stock || 0}`;
      }).join('\n');
      if (!confirm(`⚠️ تحذير: بعض المنتجات تتجاوز الكمية المتوفرة بالمخزون:\n\n${warnMsg}\n\nهل تريد المتابعة بالبيع رغم ذلك؟`)) {
        return null;
      }
    }

    // 2. خصم المخزون — بطريقة الفرق (increment) وليس بكتابة جدول المنتجات كاملاً.
    // السبب: الكتابة الكاملة ترسل "اجعل الرصيد ٤" من ذاكرة هذا الجهاز، فلو باع
    // جهاز آخر نفس الصنف في نفس اللحظة ضاع خصمه. الآن نرسل "أنقص ٣" فيجمع
    // Firestore الخصمين معاً مهما تزامنا.
    const stockDeltas = (cart || [])
      .filter(ci => !(ci.isService || ci.product?.isService))
      .map(ci => ({ id: ci.product?.id || ci.id, delta: -(Number(ci.qty) || 1) }))
      .filter(d => d.id && d.delta);

    // تحديث الشاشة فوراً (تفاؤلياً)، ومنع الرفع الكامل للجدول لأن المزامنة تتم بالفرق
    isRemoteUpdateRef.current['products'] = true;
    setProducts(prevProducts => {
      const updated = (prevProducts || []).map(prod => {
        if (prod.isService) return prod;
        const d = stockDeltas.find(x => x.id === prod.id);
        if (!d) return prod;
        return { ...prod, stock: Math.max(0, (Number(prod.stock) || 0) + d.delta) };
      });
      try { localStorage.setItem('naif_pos_v3_products', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    if (stockDeltas.length > 0) {
      syncEngine.adjustStock(stockDeltas);
    }

    // 2. تحديث حساب العميل إذا كان الدفع آجلاً أو جزء منه آجل وحفظه سحابياً فوراً
    if (effectiveCustomer && !effectiveCustomer.isDefault) {
      const debtAmountToAdd = isCreditType ? totals.total : (isSplitType && splitCreditSum > 0 ? splitCreditSum : 0);
      if (debtAmountToAdd > 0) {
        // زيادة الدين بالفرق (increment) لا بكتابة قائمة العملاء كاملة،
        // حتى لا يُلغي بيعٌ آجل على جهاز آخر أو سدادٌ حصل في نفس اللحظة.
        isRemoteUpdateRef.current['customers'] = true;
        setCustomers(prevCusts => {
          const updated = (prevCusts || []).map(c => 
            c.id === effectiveCustomer.id 
              ? { ...c, balance: (Number(c.balance) || 0) + debtAmountToAdd } 
              : c
          );
          try { localStorage.setItem('naif_pos_v3_customers', JSON.stringify(updated)); } catch (e) {}
          return updated;
        });
        syncEngine.adjustFields('customers', effectiveCustomer.id, { balance: debtAmountToAdd }, {}, true);

        setSelectedCustomer(prev => (prev && prev.id === effectiveCustomer.id ? { ...prev, balance: (Number(prev.balance) || 0) + debtAmountToAdd } : prev));
      }
    }

    // 3. تحديث مبيعات الوردية بحسب نوع الدفع وتوزيع التقسيم للمستخدم الحالي
    const targetShift = effShift;
    if (targetShift) {
      const shiftUid = targetShift.userId || currentUser?.id || 'admin';
      let cashAdd = 0;
      let cardAdd = 0;
      let creditAdd = 0;

      if (isCashType) {
        cashAdd = totals.total;
      } else if (isCreditType) {
        creditAdd = totals.total;
      } else if (isSplitType) {
        cashAdd = splitCashSum;
        cardAdd = splitCardSum;
        creditAdd = splitCreditSum;
      } else {
        // أي طريقة أخرى (شبكة، آبل باي، مدى، تحويل، تمارا، تابي، أو وسيلة مخصصة)
        cardAdd = totals.total;
      }

      const nextActiveShift = {
        ...targetShift,
        isOpen: true,
        status: 'open',
        cashSales: (targetShift.cashSales || 0) + cashAdd,
        cardSales: (targetShift.cardSales || 0) + cardAdd,
        creditSales: (targetShift.creditSales || 0) + creditAdd,
        totalSales: (targetShift.totalSales || 0) + (cashAdd + cardAdd + creditAdd)
      };
      setActiveShift(nextActiveShift);
      saveAndSync('active_shift', nextActiveShift, true);

      setUserShifts(uPrev => {
        const existing = uPrev[shiftUid] || targetShift;
        const updated = {
          ...existing,
          cashSales: (existing.cashSales || 0) + cashAdd,
          cardSales: (existing.cardSales || 0) + cardAdd,
          creditSales: (existing.creditSales || 0) + creditAdd,
          totalSales: (existing.totalSales || 0) + (cashAdd + cardAdd + creditAdd),
          updatedAt: new Date().toISOString()
        };
        const next = { ...uPrev, [shiftUid]: updated };
        localStorage.setItem('naif_pos_v3_user_shifts', JSON.stringify(next));
        saveAndSync('user_shifts', next, true);
        return next;
      });
    }

    // 4. حفظ الفاتورة محلياً وسحابياً فوراً دون أي تأخير
    const currentInvoicesList = Array.isArray(invoices) ? invoices : [];
    const targetInvoices = [newInvoice, ...currentInvoicesList.filter(i => i && i.id !== newInvoice.id)];
    
    setInvoices(targetInvoices);
    try {
      localStorage.setItem('naif_pos_v3_invoices', JSON.stringify(targetInvoices));
      localStorage.setItem('naif_pos_v3_ts_invoices', String(Date.now()));
    } catch (e) {
      console.warn('[Storage] Failed to save invoices locally:', e);
    }

    // مزامنة فورية عاجلة (Immediate Sync)
    saveAndSync('invoices', targetInvoices, true);

    broadcastStoreActivity({
      type: 'invoice_created',
      title: 'فاتورة مبيعات جديدة 🧾',
      message: `تم إصدار فاتورة #${newInvoice.invoiceNumber} للعميل (${effectiveCustomer?.name || 'نقدي'})`,
      amount: totals.total
    });

    // 5. مسح السلة
    clearCart();

    return newInvoice;
  };

  // دالة مساعدة لحساب تفصيل مبالغ وسائل الدفع للفاتورة (نقدي، شبكة، آجل، تحويل، تمارا، نينجا، إلخ)
  const calculateInvoicePaymentBreakdown = (inv) => {
    let cash = 0;
    let card = 0;
    let credit = 0;
    let transfer = 0;
    let tamara = 0;
    let ninja = 0;
    let visa = 0;
    const byMethod = {};

    const tot = Number(inv.total) || 0;

    if (inv.splitPayments && Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) {
      inv.splitPayments.forEach(sp => {
        const amt = Number(sp.amount) || 0;
        if (amt <= 0) return;
        const mId = sp.methodId || '';
        const mType = sp.methodType || '';

        byMethod[mId] = (byMethod[mId] || 0) + amt;

        if (mType === 'cash' || mId === 'cash') cash += amt;
        else if (mType === 'credit' || mId === 'credit') credit += amt;
        else if (mType === 'online' || mId === 'transfer' || mId === 'bank') transfer += amt;
        else if (mId === 'tamara') tamara += amt;
        else if (mId === 'ninja') ninja += amt;
        else if (mId === 'visa') visa += amt;
        else card += amt;
      });
    } else if (inv.paymentMethodType === 'split' || inv.paymentMethod === 'split') {
      const sCash = Number(inv.splitCash) || 0;
      const sCard = Number(inv.splitCard) || 0;
      const sCredit = Number(inv.splitCredit) || 0;
      const sTransfer = Number(inv.splitTransfer) || 0;

      if (sCash > 0) { cash += sCash; byMethod['cash'] = (byMethod['cash'] || 0) + sCash; }
      if (sCard > 0) { card += sCard; byMethod['card'] = (byMethod['card'] || 0) + sCard; }
      if (sCredit > 0) { credit += sCredit; byMethod['credit'] = (byMethod['credit'] || 0) + sCredit; }
      if (sTransfer > 0) { transfer += sTransfer; byMethod['transfer'] = (byMethod['transfer'] || 0) + sTransfer; }
    } else {
      const mId = inv.paymentMethod || 'cash';
      const mType = inv.paymentMethodType || 'cash';

      byMethod[mId] = (byMethod[mId] || 0) + tot;

      if (mType === 'cash' || mId === 'cash') cash += tot;
      else if (mType === 'credit' || mId === 'credit') credit += tot;
      else if (mType === 'online' || mId === 'transfer' || mId === 'bank') transfer += tot;
      else if (mId === 'tamara') tamara += tot;
      else if (mId === 'ninja') ninja += tot;
      else if (mId === 'visa') visa += tot;
      else card += tot;
    }

    return {
      cash,
      card,
      credit,
      transfer,
      tamara,
      ninja,
      visa,
      byMethod,
      total: tot
    };
  };

  // استرجاع / إلغاء فاتورة (Refund)
  const refundInvoice = (invoiceId, reason = 'طلب العميل') => {
    // الحارس داخل دالة التنفيذ لا عند الزر: المرتجع يُخرج نقداً من الدرج
    // فلا يكفي إخفاء الزر — من يستدعي الدالة من مسار آخر يجب أن يُمنع أيضاً.
    if (!checkUserPermission(currentUser, 'invoices_refund')) {
      console.warn('[Guard] محاولة استرجاع بلا صلاحية invoices_refund');
      return false;
    }
    // حماية صارمة: منع الاسترجاع نهائياً إذا لم تكن هناك وردية مفتوحة للمستخدم الحالي
    const isShiftValidAndOpen = (sh) => {
      if (!sh || sh.isOpen !== true || sh.status === 'closed' || sh.closedAt) return false;
      return true;
    };
    const currentUid = currentUser?.id;
    const isCurrentShiftValid = (sh) => {
      if (!isShiftValidAndOpen(sh)) return false;
      return Boolean(currentUid && sh.userId === currentUid);
    };

    const effShift = isCurrentShiftValid(activeShift)
      ? activeShift
      : isCurrentShiftValid(activeShiftRef.current)
        ? activeShiftRef.current
        : (userShifts && currentUid && isCurrentShiftValid(userShifts[currentUid]))
          ? userShifts[currentUid]
          : null;

    if (!effShift || effShift.isOpen !== true) {
      alert('⛔ تنبيه صارم: لا يمكن استرجاع أو إلغاء الفاتورة إلا بعد فتح وردية للمستخدم الحالي (' + (currentUser?.name || '') + ') لتسجيل حركة النقدية المرتجعة بدقة!');
      return false;
    }

    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv || inv.status === 'refunded') return false;

    // ===================================================================
    //  حارس الاسترجاع المزدوج
    // ===================================================================
    //  الفحص أعلاه يقرأ الحالة من مصفوفة الفواتير في React، وهي لا
    //  تُحدَّث فوراً. فنقرتان متتاليتان على "استرجاع" تمرّان كلتاهما،
    //  فتُعاد الكمية للمخزون مرتين ويُخصم المبلغ من الدرج مرتين.
    //  هذا المرجع يُحدَّث لحظياً فيقطع الطريق على النقرة الثانية.
    if (refundingIdsRef.current.has(invoiceId)) {
      console.warn('[Refund] مُنع استرجاع مزدوج للفاتورة:', invoiceId);
      return false;
    }
    refundingIdsRef.current.add(invoiceId);

    // حساب التوزيع المالي الدقيق لطرق الدفع في الفاتورة المسترجعة
    const breakdown = calculateInvoicePaymentBreakdown(inv);
    const refundTotal = breakdown.total;
    const cashDeduct = breakdown.cash;
    const cardDeduct = breakdown.card;
    const creditDeduct = breakdown.credit;
    const transferDeduct = breakdown.transfer;
    const tamaraDeduct = breakdown.tamara;
    const ninjaDeduct = breakdown.ninja;
    const visaDeduct = breakdown.visa;

    // تنبيه قبل صرف استرجاع نقدي من درج لا يحتوي نقدية كافية
    // (يحدث عادةً بعد سحب العهدة النقدية من الكاشير للمدير: الدرج فاضٍ فيظهر بالسالب)
    if (cashDeduct > 0) {
      const drawerCash = (Number(effShift.startCash) || 0)
        + (Number(effShift.cashSales) || 0)
        + (Number(effShift.cashIn) || 0)
        - (Number(effShift.cashOut) || 0)
        - (Number(effShift.drawerExpenses) || 0);

      if (cashDeduct > drawerCash + 0.01) {
        const proceed = window.confirm(
          '⚠️ النقدية المتاحة في درج الكاشير (' + drawerCash.toFixed(2) + ') أقل من مبلغ الاسترجاع النقدي (' + cashDeduct.toFixed(2) + ').\n\n' +
          'غالباً لأن العهدة النقدية سُحبت للمدير.\n\n' +
          'إذا كان المبلغ سيُصرف من خزينة المدير، اضغط "موافق" للمتابعة — وسيظهر رصيد الدرج بالسالب حتى تُضاف عهدة جديدة.\n' +
          'وإلا اضغط "إلغاء" وأعد فتح عهدة نقدية للكاشير أولاً.'
        );
        if (!proceed) {
          refundingIdsRef.current.delete(invoiceId);   // أُلغيت العملية: نسمح بإعادة المحاولة
          return false;
        }
      }
    }

    // 1. إعادة الكميات للمخزون — بطريقة الفرق أيضاً (نفس سبب الخصم عند البيع)
    const returnDeltas = (inv.items || [])
      .filter(it => !(it.isService || it.product?.isService))
      .map(it => ({
        id: it.product?.id || it.productId || it.id,
        delta: Number(it.qty ?? it.quantity ?? 1) || 0
      }))
      .filter(d => d.id && d.delta);

    isRemoteUpdateRef.current['products'] = true;
    setProducts(prev => {
      const updated = (prev || []).map(prod => {
        const d = returnDeltas.find(x => x.id === prod.id);
        if (!d) return prod;
        return { ...prod, stock: (Number(prod.stock) || 0) + d.delta };
      });
      try { localStorage.setItem('naif_pos_v3_products', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    if (returnDeltas.length > 0) {
      syncEngine.adjustStock(returnDeltas);
    }

    // 2. تعديل رصيد العميل إن كانت آجلة أو جزء منها آجل وحفظه سحابياً فوراً
    if (inv.customer && !inv.customer.isDefault && creditDeduct > 0) {
      isRemoteUpdateRef.current['customers'] = true;
      setCustomers(prev => {
        const updated = (prev || []).map(c => 
          (c.id === inv.customer.id || c.name === inv.customer.name)
            ? { ...c, balance: Math.max(0, (Number(c.balance) || 0) - creditDeduct) } 
            : c
        );
        try { localStorage.setItem('naif_pos_v3_customers', JSON.stringify(updated)); } catch (e) {}
        return updated;
      });
      // إنقاص الدين بالفرق حتى لا تُلغى حركة أخرى تمّت على جهاز آخر
      syncEngine.adjustFields('customers', inv.customer.id, { balance: -creditDeduct }, {}, true);

      setSelectedCustomer(prev => (prev && (prev.id === inv.customer.id || prev.name === inv.customer.name) ? { ...prev, balance: Math.max(0, (Number(prev.balance) || 0) - creditDeduct) } : prev));
    }

    // 3. تعديل حالة الفاتورة وتوثيق معرف الوردية المسترجعة فيها وحفظها فوراً
    // ===================================================================
    //  الخلل الجذري الذي كان يُفشل الاسترجاع
    // ===================================================================
    //  الكود السابق كان يبني القائمة الجديدة *داخل* دالة تحديث الحالة:
    //      let updatedInvs = [];
    //      setInvoices(prev => { updatedInvs = ...; return updatedInvs; });
    //      saveAndSync('invoices', updatedInvs, true);
    //  لكن React لا يشغّل دالة التحديث فوراً — يؤجّلها للرسم التالي.
    //  فعند سطر الحفظ تكون القائمة ما زالت [] فارغة، فيُرسل للسحابة
    //  "لا شيء" ولا تُحفظ حالة "مرتجعة" إطلاقاً — بينما تظهر رسالة النجاح
    //  لأن الدالة أكملت عملها. ثم تصل لقطة السحابة بالنسخة القديمة
    //  فترتدّ الفاتورة إلى "مكتملة" أمام عينيك.
    //  الحل: نبني القائمة من الحالة الحالية مباشرة قبل التحديث.
    // ===================================================================
    // ===================================================================
    //  تحديد الوردية التي سيُخصم منها المرتجع — قبل ختم الفاتورة
    // ===================================================================
    //  كان refundShiftId يُكتب بوردية المنفّذ بينما المال يخرج من وردية
    //  البائع (تُحسب أدناه). فالفاتورة تقول إن المرتجع يخصّ وردية كاشير ٢
    //  والمبلغ خرج فعلاً من وردية كاشير ١ — فأي تقرير أو تسوية تعتمد على
    //  refundShiftId تنظر إلى الوردية الخطأ. الآن يُحسب مرة واحدة هنا
    //  ويُستعمل في الختم وفي الخصم معاً، فلا يفترقان.
    const saleUid = inv.cashierId || inv.userId || null;
    const saleShift = (saleUid && userShifts && userShifts[saleUid] && userShifts[saleUid].isOpen === true)
      ? userShifts[saleUid]
      : null;
    const targetShift = saleShift || effShift;
    const shiftUid = targetShift.userId || saleUid || currentUser?.id || 'admin';
    const isOwnShift = shiftUid === (currentUser?.id || 'admin');
    // وردية البائع مغلقة فسقط الخصم على المنفّذ: أثرٌ مالي يخصّ شخصاً لم يبع.
    // نوثّقه على الفاتورة وفي سجل التدقيق بدل تحذير في الطرفية لا يراه أحد.
    const chargedToOtherUser = !saleShift && !!saleUid && saleUid !== (currentUser?.id || 'admin');

    const updatedInvs = (invoices || []).map(i =>
        i.id === invoiceId
          ? {
              ...i,
              status: 'refunded',
              updatedAt: new Date().toISOString(),   // ختم وقت التعديل ليفوز على أي نسخة أقدم
              refundReason: reason,
              refundedAt: new Date().toISOString(),
              refundedBy: currentUser?.name || '',
              refundedByUserId: currentUser?.id || '',
              // الوردية التي خرج منها المال فعلاً — لا وردية من ضغط الزر
              refundShiftId: targetShift.id || effShift.id || activeShift?.id || null,
              refundChargedUserId: shiftUid,
              refundChargedToSeller: !!saleShift,
              refundShiftFallback: chargedToOtherUser
            }
          : i
    );
    setInvoices(updatedInvs);
    try {
      localStorage.setItem('naif_pos_v3_invoices', JSON.stringify(updatedInvs));
      localStorage.setItem('naif_pos_v3_ts_invoices', String(Date.now()));
    } catch (e) {}

    saveAndSync('invoices', updatedInvs, true);

    // 4. خصم المبالغ المسترجعة من مبيعات الوردية الحالية للمستخدم وتحديث كافة طرق الدفع
    if (effShift && effShift.isOpen) {
      // ===================================================================
      //  الاسترجاع يُخصم من وردية الفاتورة الأصلية لا من وردية من ينفّذه
      // ===================================================================
      //  كان كل شيء يُخصم من وردية المنفّذ: فيخرج النقد من درجه هو بينما
      //  المبلغ فعلياً في درج الكاشير الذي باع. النتيجة درج المدير بالسالب
      //  ووردية الكاشير ما زالت تُظهر مبيعات كاش لم تعد موجودة.
      //  الآن: إن كانت وردية البائع ما تزال مفتوحة، يُخصم منها هي.
      // saleUid / saleShift / targetShift / shiftUid / isOwnShift حُسبت أعلاه
      // قبل ختم الفاتورة، فيستعمل الختمُ والخصمُ نفس الوردية بلا افتراق.
      if (chargedToOtherUser) {
        console.warn('[Refund] وردية البائع مغلقة — خُصم الاسترجاع من وردية المنفّذ.');
      }

      const updateShiftWithRefund = (s) => {
        const currentBreakdown = { ...(s.paymentMethodsBreakdown || {}) };
        Object.entries(breakdown.byMethod).forEach(([mId, amt]) => {
          if (currentBreakdown[mId]) {
            currentBreakdown[mId] = {
              ...currentBreakdown[mId],
              amount: Math.max(0, (currentBreakdown[mId].amount || 0) - amt),
              count: Math.max(0, (currentBreakdown[mId].count || 0) - 1)
            };
          }
        });

        return {
          ...s,
          cashSales: Math.max(0, (s.cashSales || 0) - cashDeduct),
          cardSales: Math.max(0, (s.cardSales || 0) - cardDeduct),
          creditSales: Math.max(0, (s.creditSales || 0) - creditDeduct),
          transferSales: Math.max(0, (s.transferSales || 0) - transferDeduct),
          bankSales: Math.max(0, (s.bankSales || 0) - transferDeduct),
          tamaraSales: Math.max(0, (s.tamaraSales || 0) - tamaraDeduct),
          ninjaSales: Math.max(0, (s.ninjaSales || 0) - ninjaDeduct),
          visaSales: Math.max(0, (s.visaSales || 0) - visaDeduct),
          totalSales: Math.max(0, (s.totalSales || 0) - refundTotal),
          cashRefunds: (s.cashRefunds || 0) + cashDeduct,
          totalRefunds: (s.totalRefunds || 0) + refundTotal,
          paymentMethodsBreakdown: currentBreakdown
        };
      };

      // لا نعدّل ورديتي المعروضة إلا إن كانت هي الوردية المستهدفة فعلاً
      if (isOwnShift) {
        setActiveShift(prev => {
          const nextS = updateShiftWithRefund(prev);
          saveAndSync('active_shift', nextS, true);
          return nextS;
        });
      }

      setUserShifts(prev => {
        const cur = prev[shiftUid] || targetShift;
        const updated = { ...updateShiftWithRefund(cur), updatedAt: new Date().toISOString() };
        const next = { ...prev, [shiftUid]: updated };
        localStorage.setItem('naif_pos_v3_user_shifts', JSON.stringify(next));
        saveAndSync('user_shifts', next, true);
        return next;
      });

      // 5. إذا كان هناك نقد تم استرجاعه للعميل، تسجيل حركة خروج نقدية من الدرج (Cash Out)
      if (cashDeduct > 0) {
        const refundTx = {
          id: `dtx-ref-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          shiftId: targetShift.id,
          userId: shiftUid,
          user: targetShift.cashierName || currentUser?.name || 'كاشير',
          type: 'out',
          category: 'مرتجع مبيعات نقدية',
          amount: cashDeduct,
          reason: `استرجاع نقدي للفاتورة #${inv.invoiceNumber} - ${reason}`,
          recipient: inv.customer?.name || 'العميل',
          authorizedBy: currentUser?.name || '',
          executedBy: currentUser?.name || '',
          voucherNo: inv.invoiceNumber,
          date: new Date().toISOString()
        };

        setDrawerTransactions(prev => {
          const updated = [refundTx, ...(prev || [])];
          saveAndSync('drawer_tx', updated, true);
          return updated;
        });
      }
    }

    broadcastStoreActivity({
      type: 'invoice_refunded',
      title: 'استرجاع فاتورة 🔄',
      message: `تم استرجاع الفاتورة #${inv.invoiceNumber} بمبلغ ${formatMoney(inv.total, storeInfo?.currency || 'ر.س')} - السبب: ${reason}`,
      amount: inv.total
    });

    logAudit({
      action: 'مرتجع فاتورة',
      target: `فاتورة #${inv.invoiceNumber}`,
      details:
        `السبب: ${reason} — العميل: ${inv.customerName || 'نقدي'}` +
        ` — البائع: ${inv.cashier || '—'}` +
        ` — خُصم من وردية: ${targetShift.cashierName || targetShift.userName || shiftUid}` +
        (chargedToOtherUser
          ? ' ⚠️ وردية البائع مغلقة، فخُصم المرتجع من وردية المنفّذ لا من وردية من باع'
          : ''),
      amount: inv.total,
      severity: 'high'
    });

    return true;
  };

  // إدارة المنتجات
  const addProduct = (prodData) => {
    const newProd = {
      ...prodData,
      id: prodData.id || `prod-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      costPrice: Number(prodData.costPrice) || 0,
      sellingPrice: Number(prodData.sellingPrice) || 0,
      stock: Number(prodData.stock) || 0,
      minStock: Number(prodData.minStock) || 5,
    };
    setProducts(prev => {
      const updated = [newProd, ...prev];
      saveAndSync('products', updated, true);
      return updated;
    });
    return newProd;
  };

  // reason: سبب التعديل — إلزامي عند تسوية الكمية (الجرد)
  // stockBaseline: الكمية التي رآها المستخدم لحظة فتح النموذج. تُمرَّر من كل
  // شاشة تحتفظ بلقطة قديمة (نموذج التعديل، أزرار +/-). بدونها يُحسب الفرق
  // مقابل الكمية الحيّة، وهذا يُعيد إلى الرصيد كل بيعٍ تمّ على جهاز آخر بين
  // فتح النموذج وحفظه. انظر الشرح المفصّل عند حساب الفرق أدناه.
  const updateProduct = (id, updatedData, reason = '', stockBaseline) => {
    // ===================================================================
    //  سجل تسويات المخزون
    // ===================================================================
    //  تغيير الكمية يدوياً هو أسهل طريقة لإخفاء نقص. لذلك يُسجَّل كل
    //  تعديل على الكمية كقيد مستقل يحمل: من عدّل، الكمية قبل وبعد،
    //  الفرق، والسبب — ولا يمكن حذفه لأن سجل التدقيق إضافة فقط.
    //  أما تعديل الأسعار فيُسجَّل كقيد منفصل لأنه شأن آخر.
    try {
      const before = (products || []).find(p => p.id === id);
      if (before) {
        // 1) تسوية الكمية — قيد مستقل
        if (updatedData.stock !== undefined) {
          // نسجّل التسوية كما رآها من نفّذها، لا مقابل كمية حيّة تغيّرت تحته
          const oldQty = stockBaseline !== undefined
            ? Number(stockBaseline) || 0
            : Number(before.stock) || 0;
          const newQty = Number(updatedData.stock) || 0;
          if (oldQty !== newQty) {
            const diff = newQty - oldQty;
            logAudit({
              action: 'تسوية مخزون',
              target: before.name || id,
              details:
                `الكمية: ${oldQty} ← ${newQty} (${diff > 0 ? '+' : ''}${diff})` +
                (reason ? ` — السبب: ${reason}` : ' — بلا سبب مسجّل'),
              amount: diff,
              severity: 'high'
            });
          }
        }

        // 2) تعديل الأسعار — قيد منفصل
        const priceChanges = [];
        const cmp = (label, a, b) => {
          const na = Number(a) || 0, nb = Number(b) || 0;
          if (na !== nb) priceChanges.push(`${label}: ${nb} ← ${na}`);
        };
        if (updatedData.sellingPrice !== undefined) cmp('سعر البيع', updatedData.sellingPrice, before.sellingPrice);
        if (updatedData.costPrice !== undefined) cmp('التكلفة', updatedData.costPrice, before.costPrice);
        if (priceChanges.length > 0) {
          logAudit({
            action: 'تعديل أسعار منتج',
            target: before.name || id,
            details: priceChanges.join(' | ') + (reason ? ` — السبب: ${reason}` : ''),
            severity: 'high'
          });
        }
      }
    } catch (e) {}
    // المخزون يُزامَن حصراً عبر increment (تماماً كالبيع) كي لا تدهس الكتابةُ
    // الكاملةُ لبيانات الصنف خصمَ بيعٍ متزامنٍ على جهاز آخر. المحرّك يُجرِّد
    // stock من الكتابة الكاملة عند التحديث، فنرسل فرق الكمية هنا صراحةً.
    // =====================================================================
    //  الأساس الذي يُقاس عليه الفرق هو ما رآه المستخدم، لا الكمية الحيّة
    // =====================================================================
    //  الخلل الذي كان هنا (ضاع به خصم بيع فعلي): الكاشير يفتح نموذج تعديل
    //  صنف كميته ٣، ثم يبيع زميله وحدةً على جهاز آخر فتصل المزامنة وتصير
    //  الكمية الحيّة ٢ — والنموذج ما زال يعرض ٣. فإذا حفظ (ولو لم يلمس حقل
    //  الكمية أصلاً) حُسب الفرق ٣ − ٢ = +١ وأُرسل increment(+1)، فعادت
    //  الوحدة المباعة إلى الرصيد وضاع خصم البيع.
    //  الصواب: نقيس مقابل الكمية التي كانت أمام المستخدم (stockBaseline).
    //  فإن لم يغيّرها صار الفرق صفراً ولم يُمسّ المخزون إطلاقاً، وإن غيّرها
    //  طُبِّق فرقه هو فقط فوق ما في السحابة — فيبقى بيع الجهاز الآخر محفوظاً.
    //  (النظير في العملاء: CustomersScreen تجرّد balance من حمولة التعديل.)
    // =====================================================================
    let stockDelta = 0;
    if (updatedData.stock !== undefined) {
      const prevProd = (products || []).find(p => p.id === id);
      const baseQty = stockBaseline !== undefined
        ? Number(stockBaseline) || 0
        : Number(prevProd?.stock) || 0;
      const newQty = Number(updatedData.stock) || 0;
      stockDelta = newQty - baseQty;
      if (stockDelta !== 0) syncEngine.adjustStock([{ id, delta: stockDelta }]);
    }
    setProducts(prev => {
      const updated = prev.map(p => p.id === id ? {
        ...p,
        ...updatedData,
        costPrice: Number(updatedData.costPrice ?? p.costPrice) || 0,
        sellingPrice: Number(updatedData.sellingPrice ?? p.sellingPrice) || 0,
        // نطبّق الفرق نفسه المُرسَل للسحابة فوق الكمية الحيّة — لا القيمة
        // المطلقة القادمة من النموذج، وإلا ارتدّت الشاشة للقيمة القديمة.
        stock: (Number(p.stock) || 0) + stockDelta,
        minStock: Number(updatedData.minStock ?? p.minStock) || 0,
      } : p);
      saveAndSync('products', updated, true);
      return updated;
    });
  };

  // أرشفة المنتج بدل حذفه نهائياً: الحذف الفعلي يكسر ارتباط الفواتير
  // والتقارير القديمة فتفقد اسم الصنف وتكلفته. الأرشفة تُخفيه من كل
  // شاشات العمل مع بقاء بياناته للتقارير التاريخية.
  const deleteProduct = (id) => {
    const prod = (products || []).find(x => x.id === id);
    try {
      logAudit({
        action: 'أرشفة منتج',
        target: prod?.name || id,
        details: `الكمية وقت الأرشفة: ${Number(prod?.stock) || 0} — يبقى في التقارير التاريخية`,
        severity: 'high'
      });
    } catch (e) {}
    setProducts(prev => {
      const updated = prev.map(p => p.id === id ? {
        ...p,
        isArchived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: currentUser?.name || '',
        updatedAt: new Date().toISOString()
      } : p);
      saveAndSync('products', updated, true);
      return updated;
    });
  };

  // استرجاع منتج مؤرشف
  const restoreProduct = (id) => {
    const prod = (products || []).find(x => x.id === id);
    logAudit({ action: 'استرجاع منتج من الأرشيف', target: prod?.name || id, details: '', severity: 'normal' });
    setProducts(prev => {
      const updated = prev.map(p => p.id === id ? {
        ...p, isArchived: false, archivedAt: null, updatedAt: new Date().toISOString()
      } : p);
      saveAndSync('products', updated, true);
      return updated;
    });
  };

  // استيراد وإضافة وتحديث دفعة منتجات وتصنيفات كاملة (Batch Bulk Import)
  const importProductsBatch = (newProductsList = [], updatedProductsList = [], newCategoriesList = []) => {
    if (Array.isArray(newCategoriesList) && newCategoriesList.length > 0) {
      setCategories(prev => {
        const existingCatIds = new Set(prev.map(c => c.id));
        const filteredNewCats = newCategoriesList.filter(c => !existingCatIds.has(c.id));
        const updatedCats = [...prev, ...filteredNewCats];
        saveAndSync('categories', updatedCats, true);
        return updatedCats;
      });
    }

    setProducts(prev => {
      let current = [...prev];
      
      // 1. تحديث المنتجات الحالية المتطابقة في الباركود أو المعرف
      if (Array.isArray(updatedProductsList) && updatedProductsList.length > 0) {
        const updateMap = new Map();
        updatedProductsList.forEach(p => updateMap.set(p.id, p));
        current = current.map(p => updateMap.has(p.id) ? { ...p, ...updateMap.get(p.id) } : p);
      }

      // 2. إضافة المنتجات الجديدة دفعة واحدة في بداية القائمة
      if (Array.isArray(newProductsList) && newProductsList.length > 0) {
        current = [...newProductsList, ...current];
      }

      saveAndSync('products', current, true);
      return current;
    });
  };

  // =========================================================================
  //  تسجيل تالف وهالك الورد الطبيعي (Flower Spoilage)
  // =========================================================================
  const recordSpoilage = ({ productId, productName, qty, costPrice, sellingPrice, reason, notes, reportedBy }) => {
    const quantity = Number(qty) || 0;
    if (quantity <= 0 || !productId) return false;

    // حساب الخسارة المالية بناء على سعر التكلفة إن وُجد أو سعر البيع
    const unitCost = Number(costPrice) || 0;
    const unitPrice = Number(sellingPrice) || 0;
    const totalCostLoss = Math.round(quantity * unitCost * 100) / 100;

    const newLog = {
      id: `spoilage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId,
      productName: productName || 'صنف غير محدد',
      qty: quantity,
      unitCost,
      unitPrice,
      totalCostLoss,
      reason: reason || 'ذبول طبيعي',
      notes: notes || '',
      reportedBy: reportedBy || currentUser?.name || 'كاشير',
      userId: currentUser?.id || '',
      date: new Date().toISOString(),
      at: Date.now()
    };

    // 1. إضافة القيد إلى سجل التالف
    setSpoilageLogs(prev => {
      const updated = [newLog, ...(Array.isArray(prev) ? prev : [])];
      saveAndSync('spoilage_logs', updated, true);
      return updated;
    });

    // 2. خصم الكمية التالفة فورياً من مخزون المنتج
    syncEngine.adjustStock([{ id: productId, delta: -quantity }]);
    setProducts(prev => {
      const updated = (prev || []).map(p => p.id === productId ? {
        ...p,
        stock: Math.max(0, (Number(p.stock) || 0) - quantity),
        updatedAt: new Date().toISOString()
      } : p);
      saveAndSync('products', updated, true);
      return updated;
    });

    // 3. تدوين الحدث في سجل التدقيق
    try {
      logAudit({
        action: 'تسجيل تالف وهالك ورد',
        target: productName,
        details: `إتلاف ${quantity} حبة/عود - السبب: ${reason || 'ذبول طبيعي'} - الخسارة: ${totalCostLoss} ر.س ${notes ? '(' + notes + ')' : ''}`,
        amount: totalCostLoss,
        severity: totalCostLoss > 100 ? 'high' : 'normal'
      });
    } catch (e) {}

    return newLog;
  };

  // حذف قيد تالف مع خيار استرجاع المخزون
  const deleteSpoilageRecord = (spoilageId, restoreStock = false) => {
    const targetLog = (spoilageLogs || []).find(l => l.id === spoilageId);
    if (!targetLog) return false;

    if (restoreStock && targetLog.productId && targetLog.qty > 0) {
      syncEngine.adjustStock([{ id: targetLog.productId, delta: targetLog.qty }]);
      setProducts(prev => {
        const updated = (prev || []).map(p => p.id === targetLog.productId ? {
          ...p,
          stock: (Number(p.stock) || 0) + Number(targetLog.qty),
          updatedAt: new Date().toISOString()
        } : p);
        saveAndSync('products', updated, true);
        return updated;
      });
    }

    setSpoilageLogs(prev => {
      const updated = (prev || []).filter(l => l.id !== spoilageId);
      saveAndSync('spoilage_logs', updated, true);
      return updated;
    });

    try {
      logAudit({
        action: 'حذف قيد تالف',
        target: targetLog.productName,
        details: `حذف قيد هالك بقيمة ${targetLog.totalCostLoss} ر.س ${restoreStock ? '(مع استعادة المخزون)' : ''}`,
        severity: 'normal'
      });
    } catch (e) {}

    return true;
  };

  // إدارة التصنيفات
  const addCategory = (categoryDataOrName, icon = 'Package', color = '#3B82F6') => {
    const isObj = typeof categoryDataOrName === 'object' && categoryDataOrName !== null;
    const name = isObj ? categoryDataOrName.name : categoryDataOrName;
    const catIcon = isObj ? (categoryDataOrName.icon || 'Package') : icon;
    const catColor = isObj ? (categoryDataOrName.color || '#3B82F6') : color;
    const newCat = {
      id: (isObj && categoryDataOrName.id) ? categoryDataOrName.id : `cat-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name,
      icon: catIcon,
      color: catColor
    };
    setCategories(prev => {
      const updated = [...prev, newCat];
      saveAndSync('categories', updated, true);
      return updated;
    });
    return newCat;
  };

  const updateCategory = (id, data) => {
    setCategories(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, ...data } : c);
      saveAndSync('categories', updated, true);
      return updated;
    });
  };

  const deleteCategory = (id) => {
    syncEngine.deleteRecord('categories', id);   // حذف صريح من السحابة
    setCategories(prev => {
      const updated = prev.filter(c => c.id !== id);
      saveAndSync('categories', updated, true);
      return updated;
    });
  };

  // إدارة العملاء
  const addCustomer = (custData) => {
    const newCust = {
      ...custData,
      id: `cust-${Date.now()}`,
      balance: Number(custData.balance) || 0,
      isDefault: false,
    };
    setCustomers(prev => {
      const updated = [...prev, newCust];
      saveAndSync('customers', updated, true);
      return updated;
    });
    return newCust;
  };

  const updateCustomer = (id, data) => {
    // ضمان بقاء الرصيد رقماً مهما كان مصدر البيانات (حقول النماذج ترجع نصوصاً)
    const safeData = (data && data.balance !== undefined)
      ? { ...data, balance: Number(data.balance) || 0 }
      : data;
    // الرصيد يُدار عبر increment: الكتابة الكاملة تُجرَّد منه في المحرّك كي لا
    // تدهس سداداً/ديناً متزامناً على جهاز آخر. فنرسل الفرق صراحةً عند تغييره
    // يدوياً (تعديل رصيد من نموذج العميل).
    if (safeData && safeData.balance !== undefined) {
      const prevCust = (customers || []).find(c => c.id === id);
      const delta = (Number(safeData.balance) || 0) - (Number(prevCust?.balance) || 0);
      if (delta !== 0) syncEngine.adjustFields('customers', id, { balance: delta }, {}, true);
    }
    setCustomers(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, ...safeData } : c);
      saveAndSync('customers', updated, true);
      return updated;
    });
  };

  const deleteCustomer = (id) => {
    // منع الحذف إذا كان على العميل دين أو فواتير آجلة غير مسددة،
    // وإلا اختفى الدين من التقارير وبقيت فواتيره معلّقة بلا صاحب.
    const cust = (customers || []).find(c => c.id === id);
    const bal = Number(cust?.balance) || 0;
    const openCredit = (invoices || []).filter(i =>
      i && i.status !== 'refunded' && !i.isCreditSettled &&
      (i.customer?.id === id || i.customerId === id) &&
      (i.paymentMethod === 'credit' || i.paymentMethodType === 'credit' || Number(i.splitCredit) > 0 ||
       (Array.isArray(i.splitPayments) && i.splitPayments.some(sp => sp.methodType === 'credit' || sp.methodId === 'credit')))
    );
    if (bal > 0 || openCredit.length > 0) {
      alert(
        '⛔ لا يمكن حذف العميل (' + (cust?.name || '') + ').\n\n' +
        (bal > 0 ? '• رصيد مستحق عليه: ' + formatMoney(bal, storeInfo?.currency || 'ر.س') + '\n' : '') +
        (openCredit.length > 0 ? '• فواتير آجلة غير مسددة: ' + openCredit.length + '\n' : '') +
        '\nسدّد الدين أو سوّه أولاً ثم احذفه.'
      );
      return false;
    }

    syncEngine.deleteRecord('customers', id);   // حذف صريح من السحابة
    setCustomers(prev => {
      const updated = prev.filter(c => c.id !== id);
      saveAndSync('customers', updated, true);
      return updated;
    });
  };

  // سند قبض دفعة من عميل مع الفصل المحاسبي التام وتوثيق الفواتير الآجلة المسددة
  const addCustomerPayment = (customerId, amount, method = 'cash', notes = '', targetInvoiceId = null) => {
    // الحارس داخل دالة التنفيذ: سند القبض يُدخل نقداً ويُسقط ديناً — يغطّي كل
    // مسارات الفتح (قائمة العملاء، كشف الحساب، لوحة الخزينة) حتى غير المحروسة.
    if (!checkUserPermission(currentUser, 'customers_receipt_voucher')) {
      console.warn('[Guard] محاولة سند قبض بلا صلاحية customers_receipt_voucher');
      return null;
    }
    let actualAmount = amount;
    let actualMethod = method;
    let actualNotes = notes;
    if (typeof amount === 'object' && amount !== null) {
      actualAmount = amount.amount;
      actualMethod = amount.method || method;
      actualNotes = amount.notes || notes;
    }

    const numAmount = Number(actualAmount) || 0;
    if (numAmount <= 0) return null;

    // ===================================================================
    //  التحصيل النقدي يشترط وردية مفتوحة — كالمصروفات تماماً
    // ===================================================================
    //  كان التحصيل لا يمسّ الورديات إطلاقاً، فالنقد المستلَم بلا وردية
    //  مفتوحة يذهب افتراضياً لحساب المدير بلا أثر في درج أحد. النتيجة:
    //  كاشير يستلم مبلغاً بيده ولا يظهر في عهدته، فلا يُطالَب به عند
    //  الإقفال. الآن نمنع ذلك ونطلب فتح وردية أولاً.
    //  التحويل والشبكة لا يشترطان وردية لأنهما لا يمرّان بالدرج.
    // ===================================================================
    const isCashCollection = !(
      String(actualMethod) === 'transfer' || String(actualMethod) === 'bank' ||
      String(actualMethod) === 'card' || String(actualMethod) === 'visa' || String(actualMethod) === 'mada'
    );
    if (isCashCollection) {
      const uid = currentUser?.id;
      const myShift = (userShifts && uid && userShifts[uid]) ||
        (activeShift?.userId === uid ? activeShift : null);
      const myShiftOpen = Boolean(myShift && myShift.isOpen === true && !myShift.closedAt && myShift.status !== 'closed');
      if (!myShiftOpen) {
        alert(
          '⛔ لا يمكن تحصيل سداد نقدي بدون وردية مفتوحة.\n\n' +
          'المبلغ يدخل درج الكاشير ويجب أن يظهر في عهدته عند الإقفال.\n' +
          'افتح وردية أولاً ثم أعد التحصيل، أو استلم المبلغ عبر تحويل/شبكة.'
        );
        return null;
      }
    }

    // توحيد كود طريقة الدفع ديناميكياً مع دعم كافة وسائل الدفع
    const resolvedMethod = resolvePaymentMethod(actualMethod, storeInfo?.paymentMethods);
    const mType = resolvedMethod?.type || '';
    const mId = resolvedMethod?.id || '';

    const finalMethod = (mType === 'online' || mId === 'transfer' || mId === 'bank' || actualMethod === 'transfer' || actualMethod === 'bank') 
      ? 'transfer' 
      : (mType === 'card' || mId === 'card' || mId === 'visa' || mId === 'mada' || actualMethod === 'card' || actualMethod === 'visa' || actualMethod === 'mada') 
        ? 'card' 
        : 'cash';

    const currentUserId = currentUser?.id || 'admin';
    const currentUserName = currentUser?.name || 'كاشير';
    const custObj = (customers || []).find(c => c.id === customerId);
    const custName = custObj?.name || 'عميل';
    const custPhone = custObj?.phone || '';
    const previousBalance = Number(custObj?.balance) || 0;
    const remainingBalance = Math.max(0, previousBalance - numAmount);

    const receiptDate = new Date().toISOString();
    const receiptNumber = `REC-${Date.now().toString().slice(-6)}`;

    // 1. تسوية وتحديث الفواتير الآجلة غير المسددة للعميل (نظام الأقدم فالأحدث FIFO)
    let unallocated = numAmount;
    const settledInvoicesList = [];
    let updatedInvoices = [...(invoices || [])];

    const creditInvoicesIndices = [];
    updatedInvoices.forEach((inv, index) => {
      if (!inv || inv.status === 'refunded') return;
      const isThisCust = (inv.customer?.id === customerId || inv.customerId === customerId);
      if (!isThisCust) return;

      const isSplit = inv.paymentMethod === 'split' || inv.paymentMethodType === 'split' || (Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0);
      let creditDue = 0;
      if (isSplit) {
        if (Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) {
          creditDue = inv.splitPayments
            .filter(sp => sp.methodType === 'credit' || sp.methodId === 'credit')
            .reduce((s, sp) => s + (Number(sp.amount) || 0), 0);
        } else {
          creditDue = Number(inv.splitCredit) || 0;
        }
      } else if (inv.paymentMethod === 'credit' || inv.paymentMethodType === 'credit') {
        creditDue = Number(inv.total) || 0;
      }

      if (creditDue > 0 && !inv.isCreditSettled) {
        creditInvoicesIndices.push({ index, inv, creditDue });
      }
    });

    // الترتيب: إذا اختار المستخدم فاتورة بعينها (من شاشة الفواتير) تُسدَّد أولاً،
    // ثم الباقي بالأقدم فالأحدث. سابقاً كان السداد يُرحَّل دائماً لأقدم فاتورة
    // بينما السند والرسالة يقولان إنه للفاتورة المختارة — فتُطالَب مرتين.
    creditInvoicesIndices.sort((a, b) => {
      if (targetInvoiceId) {
        const aIsTarget = a.inv.id === targetInvoiceId ? 0 : 1;
        const bIsTarget = b.inv.id === targetInvoiceId ? 0 : 1;
        if (aIsTarget !== bIsTarget) return aIsTarget - bIsTarget;
      }
      return new Date(a.inv.date || 0) - new Date(b.inv.date || 0);
    });

    creditInvoicesIndices.forEach(({ index, inv, creditDue }) => {
      const alreadyPaid = Number(inv.creditPaidAmount) || 0;
      const remainingOnInv = Math.max(0, creditDue - alreadyPaid);

      if (remainingOnInv <= 0) {
        updatedInvoices[index] = {
          ...inv,
          isCreditSettled: true,
          creditSettledAt: inv.creditSettledAt || receiptDate,
          settledReceiptNo: inv.settledReceiptNo || receiptNumber
        };
        return;
      }

      if (unallocated > 0) {
        const payForThisInv = Math.min(unallocated, remainingOnInv);
        const newTotalPaid = alreadyPaid + payForThisInv;
        const isFullySettled = newTotalPaid >= creditDue;

        updatedInvoices[index] = {
          ...inv,
          creditPaidAmount: newTotalPaid,
          updatedAt: new Date().toISOString(),
          isCreditSettled: isFullySettled,
          settledReceiptNo: receiptNumber,
          creditSettledAt: isFullySettled ? receiptDate : (inv.creditSettledAt || null),
          settledBy: currentUserName,
          settledHistory: [
            ...(inv.settledHistory || []),
            {
              receiptNumber,
              amount: payForThisInv,
              date: receiptDate,
              method: finalMethod,
              user: currentUserName
            }
          ]
        };

        settledInvoicesList.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amount: payForThisInv,
          isFullySettled
        });

        unallocated -= payForThisInv;
      }
    });

    // إذا أصبح رصيد العميل 0 بعد السداد، تسوية جميع فواتيره الآجلة ضماناً للتطابق الكامل
    // شرط إضافي مهم: لا نعتبر الفواتير مسددة إلا إذا كان على العميل رصيد فعلي
    // وغطّاه المبلغ المدفوع. بدون هذا الشرط، عميل رصيده صفر (أو ضاع رصيده لأي سبب)
    // يدفع ١٠ ريال فتُختم كل فواتيره الآجلة "مسددة بالكامل" ويضيع الدين نهائياً.
    if (remainingBalance === 0 && previousBalance > 0 && numAmount >= previousBalance) {
      updatedInvoices = updatedInvoices.map(inv => {
        if ((inv.customer?.id === customerId || inv.customerId === customerId) && inv.status !== 'refunded') {
          const cDue = (inv.paymentMethod === 'credit' || inv.paymentMethodType === 'credit')
            ? (Number(inv.total) || 0)
            : (Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0
              ? inv.splitPayments.filter(sp => sp.methodType === 'credit' || sp.methodId === 'credit').reduce((s, sp) => s + (Number(sp.amount) || 0), 0)
              : (Number(inv.splitCredit) || 0));
          if (cDue > 0 && !inv.isCreditSettled) {
            return {
              ...inv,
              creditPaidAmount: cDue,
              updatedAt: new Date().toISOString(),
              isCreditSettled: true,
              creditSettledAt: receiptDate,
              settledReceiptNo: receiptNumber,
              settledBy: currentUserName
            };
          }
        }
        return inv;
      });
    }

    setInvoices(updatedInvoices);
    try {
      localStorage.setItem('naif_pos_v3_invoices', JSON.stringify(updatedInvoices));
      localStorage.setItem('naif_pos_v3_ts_invoices', String(Date.now()));
    } catch (e) {}
    saveAndSync('invoices', updatedInvoices, true);

    // 2. تحديث رصيد العميل — بالفرق (المبلغ المسدَّد) لا بقيمة نهائية محسوبة محلياً
    const paidDelta = -(Math.max(0, previousBalance - remainingBalance));
    isRemoteUpdateRef.current['customers'] = true;
    setCustomers(prev => {
      const updated = (prev || []).map(c => 
        c.id === customerId ? { ...c, balance: remainingBalance } : c
      );
      try { localStorage.setItem('naif_pos_v3_customers', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
    if (paidDelta !== 0) {
      syncEngine.adjustFields('customers', customerId, { balance: paidDelta }, {}, true);
    }

    setSelectedCustomer(prev => (prev && prev.id === customerId ? { ...prev, balance: remainingBalance } : prev));

    // 3. بناء وتوثيق سند القبض بكامل تفاصيله وبيانات الكاشير والأرصدة
    const receipt = {
      id: `rcpt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      receiptNumber,
      customerId,
      customerName: custName,
      customerPhone: custPhone,
      amount: numAmount,
      previousBalance,
      remainingBalance,
      method: finalMethod,
      methodName: resolvedMethod?.name || (finalMethod === 'cash' ? 'نقداً' : finalMethod === 'card' ? 'شبكة مدى / فيزا' : 'تحويل بنكي'),
      notes: actualNotes,
      date: receiptDate,
      userId: currentUserId,
      user: currentUserName,
      shiftId: activeShift?.id || null,
      settledInvoices: settledInvoicesList
    };

    setPaymentReceipts(prev => {
      const updated = [receipt, ...(prev || [])];
      saveAndSync('receipts', updated, true);
      return updated;
    });

    // 4. الدفع نقداً (تضاف لدرج الوردية إذا كانت مفتوحة، أو لخزينة الإدارة كاش المدير إن لم تكن هناك وردية)
    if (finalMethod === 'cash') {
      if (activeShift?.isOpen) {
        const tx = {
          id: `dtx-${Date.now()}`,
          shiftId: activeShift?.id || null,
          userId: currentUserId,
          type: 'in',
          category: 'سند قبض عميل نقدي',
          amount: numAmount,
          reason: `سند قبض نقدي من العميل (${custName}) - ${actualNotes || 'سداد آجل'}`,
          recipient: custName,
          authorizedBy: currentUser?.name || '',
          voucherNo: receipt.receiptNumber,
          date: receiptDate,
          user: currentUserName
        };

        const newCashIn = (activeShift.cashIn || 0) + numAmount;
        const nextActive = {
          ...activeShift,
          cashIn: newCashIn
        };
        setActiveShift(nextActive);
        saveAndSync('active_shift', nextActive, true);

        setUserShifts(prev => {
          const cur = prev[currentUserId] || activeShift;
          const updated = {
            ...prev,
            [currentUserId]: {
              ...cur,
              cashIn: newCashIn,
              updatedAt: new Date().toISOString()
            }
          };
          saveAndSync('user_shifts', updated, true);
          return updated;
        });

        setDrawerTransactions(prev => {
          const updatedTxList = [tx, ...(prev || [])];
          saveAndSync('drawer_tx', updatedTxList, true);
          return updatedTxList;
        });
      } else {
        // توريد النقد فوراً إلى خزينة الإدارة (كاش المدير) وتوثيق حركة الخزينة
        const vaultEntry = {
          id: `tled-cpay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          type: 'customer_debt_collection',
          title: `سداد دين عميل نقداً (خزينة الإدارة) (${custName})`,
          notes: actualNotes || `سداد دين عميل نقداً أودع مباشرة في خزينة كاش الإدارة لعدم وجود وردية كاشير مفتوحة (${custName})`,
          amount: numAmount,
          grossAmount: numAmount,
          depositSlipNumber: receipt.receiptNumber,
          voucherNo: receipt.receiptNumber,
          customerId,
          customerName: custName,
          user: currentUserName,
          userId: currentUserId,
          date: receiptDate,
          createdAt: receiptDate
        };

        setTreasuryLedger(lPrev => {
          const next = [vaultEntry, ...(lPrev || [])];
          localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(next));
          saveAndSync('treasury_ledger', next, true);
          return next;
        });
      }

      broadcastStoreActivity({
        type: 'customer_payment',
        title: 'سند قبض نقدي 💵',
        message: activeShift?.isOpen
          ? `تم استلام ${formatMoney(numAmount, storeInfo?.currency || 'ر.س')} نقداً من العميل (${custName}) وأضيفت لدرج الوردية (سند #${receipt.receiptNumber})`
          : `تم استلام ${formatMoney(numAmount, storeInfo?.currency || 'ر.س')} نقداً من العميل (${custName}) وأودعت في خزينة الإدارة (سند #${receipt.receiptNumber})`,
        amount: numAmount
      });
    }

    // 5. الدفع شبكة مدى / فيزا (تضاف لمبيعات نقاط البيع POS لتسويتها مع البنك)
    else if (finalMethod === 'card') {
      if (activeShift?.isOpen) {
        const nextCardSales = (activeShift.cardSales || 0) + numAmount;
        const nextActive = {
          ...activeShift,
          cardSales: nextCardSales
        };
        setActiveShift(nextActive);
        saveAndSync('active_shift', nextActive, true);

        setUserShifts(prev => {
          const cur = prev[currentUserId] || activeShift;
          const updated = {
            ...prev,
            [currentUserId]: {
              ...cur,
              cardSales: nextCardSales,
              updatedAt: new Date().toISOString()
            }
          };
          saveAndSync('user_shifts', updated, true);
          return updated;
        });
      }

      broadcastStoreActivity({
        type: 'customer_payment',
        title: 'سند قبض شبكة 💳',
        message: `تم تحصيل ${formatMoney(numAmount, storeInfo?.currency || 'ر.س')} عبر الشبكة من العميل (${custName}) (سند #${receipt.receiptNumber})`,
        amount: numAmount
      });
    }

    // 6. الدفع تحويل بنكي مباشر (تسمّع فوراً في صافي رصيد البنك ودفتر الخزينة المعتمد)
    else if (finalMethod === 'transfer') {
      const transferLedgerEntry = {
        id: `tled-trf-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: 'direct_bank_transfer',
        title: `سداد دين عميل بتحويل بنكي مباشر (${custName})`,
        amount: 0, // لا يؤثر على نقدية كاش المدير بالخزينة
        grossAmount: numAmount,
        commissionAmount: 0,
        netAmount: numAmount,
        depositSlipNumber: receipt.receiptNumber,
        voucherNo: receipt.receiptNumber,
        customerId,
        customerName: custName,
        user: currentUserName,
        userId: currentUserId,
        date: receiptDate,
        notes: actualNotes || `سداد دين عميل بتحويل بنكي مباشر لحساب المؤسسة (${custName})`
      };

      setTreasuryLedger(lPrev => {
        const next = [transferLedgerEntry, ...(lPrev || [])];
        localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(next));
        saveAndSync('treasury_ledger', next, true);
        return next;
      });

      broadcastStoreActivity({
        type: 'customer_payment',
        title: 'سداد بحوالة بنكية 🏛️',
        message: `تم قيد سداد تحويل بنكي مباشر بمبلغ ${formatMoney(numAmount, storeInfo?.currency || 'ر.س')} من العميل (${custName}) (سند #${receipt.receiptNumber})`,
        amount: numAmount
      });
    }

    return receipt;
  };

  // إدارة الموردين وفواتير المشتريات
  const addSupplier = (supData) => {
    const newSup = {
      ...supData,
      id: `sup-${Date.now()}`,
      balance: Number(supData.balance) || 0
    };
    setSuppliers(prev => {
      const updated = [...prev, newSup];
      saveAndSync('suppliers', updated, true);
      return updated;
    });
    return newSup;
  };

  const updateSupplier = (id, data) => {
    // ضمان بقاء الرصيد رقماً مهما كان مصدر البيانات (حقول النماذج ترجع نصوصاً)
    const safeData = (data && data.balance !== undefined)
      ? { ...data, balance: Number(data.balance) || 0 }
      : data;
    // الرصيد يُدار عبر increment (يُجرَّد من الكتابة الكاملة) — نرسل الفرق صراحةً.
    if (safeData && safeData.balance !== undefined) {
      const prevSup = (suppliers || []).find(s => s.id === id);
      const delta = (Number(safeData.balance) || 0) - (Number(prevSup?.balance) || 0);
      if (delta !== 0) syncEngine.adjustFields('suppliers', id, { balance: delta }, {}, true);
    }
    setSuppliers(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, ...safeData } : s);
      saveAndSync('suppliers', updated, true);
      return updated;
    });
  };

  const deleteSupplier = (id) => {
    // منع الحذف إذا كان للمورد رصيد مستحق أو فواتير مشتريات غير مسددة
    const sup = (suppliers || []).find(x => x.id === id);
    logAudit({ action: 'محاولة حذف مورد', target: sup?.name || id, details: '', severity: 'normal' });
    const bal = Number(sup?.balance) || 0;
    const openPur = (purchases || []).filter(p => p && p.supplierId === id && (Number(p.remainingDebt) || 0) > 0);
    if (bal > 0 || openPur.length > 0) {
      alert(
        '⛔ لا يمكن حذف المورد (' + (sup?.name || '') + ').\n\n' +
        (bal > 0 ? '• رصيد مستحق له: ' + formatMoney(bal, storeInfo?.currency || 'ر.س') + '\n' : '') +
        (openPur.length > 0 ? '• فواتير مشتريات غير مسددة: ' + openPur.length + '\n' : '') +
        '\nسدّد المستحق أولاً ثم احذفه.'
      );
      return false;
    }

    syncEngine.deleteRecord('suppliers', id);   // حذف صريح من السحابة
    setSuppliers(prev => {
      const updated = prev.filter(s => s.id !== id);
      saveAndSync('suppliers', updated, true);
      return updated;
    });
  };

  const addPurchaseInvoice = ({
    supplierId,
    supplierName,
    items, // [{ product, qty, costPrice }]
    totalAmount,
    paidAmount,
    paymentMethod = 'cash',
    invoiceRef = '',
    notes = ''
  }) => {
    // الحارس داخل دالة التنفيذ: فاتورة الشراء تغيّر المخزون والخزينة ورصيد المورد.
    if (!checkUserPermission(currentUser, 'purchases_add')) {
      console.warn('[Guard] محاولة تسجيل مشتريات بلا صلاحية purchases_add');
      return null;
    }
    const numTotal = Number(totalAmount) || 0;
    const numPaid = Number(paidAmount) || 0;
    const remaining = numTotal - numPaid;

    const currentUserId = currentUser?.id || 'admin';
    const currentUserName = currentUser?.name || 'مستخدم';

    const newPurchase = {
      id: `pur-${Date.now()}`,
      purchaseNumber: `PUR-${Date.now().toString().slice(-6)}`,
      invoiceRef,
      supplierId,
      supplierName,
      items,
      totalAmount: numTotal,
      paidAmount: numPaid,
      total: numTotal,
      amount: numPaid,
      remainingDebt: remaining,
      paymentMethod,
      shiftId: activeShift?.id || null,
      userId: currentUserId,
      user: currentUserName,
      date: new Date().toISOString(),
      notes
    };

    // 1. زيادة كميات المخزون وتحديث أسعار التكلفة
    // استلام المشتريات يزيد الكمية بالفرق (increment) حتى لا يُلغي خصم بيعة
    // حصلت في نفس اللحظة على جهاز آخر. سعر التكلفة قيمة مطلقة فيُكتب كالمعتاد.
    const purchaseDeltas = (items || [])
      .map(i => ({ id: i.product?.id || i.id, delta: Number(i.qty) || 0 }))
      .filter(d => d.id && d.delta);

    isRemoteUpdateRef.current['products'] = true;
    setProducts(prev => {
      const updated = (prev || []).map(p => {
        const item = (items || []).find(i => (i.product?.id || i.id) === p.id);
        if (!item) return p;
        return {
          ...p,
          stock: (Number(p.stock) || 0) + (Number(item.qty) || 0),
          costPrice: Number(item.costPrice) || p.costPrice
        };
      });
      try { localStorage.setItem('naif_pos_v3_products', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    // الكمية بالفرق، وسعر التكلفة قيمة مطلقة تُكتب مع نفس العملية
    purchaseDeltas.forEach(d => {
      const item = (items || []).find(i => (i.product?.id || i.id) === d.id);
      const newCost = Number(item?.costPrice) || 0;
      syncEngine.adjustFields(
        'products',
        d.id,
        { stock: d.delta },
        newCost > 0 ? { costPrice: newCost } : {}
      );
    });

    // 2. تحديث رصيد المورد إذا تبقى دين
    if (supplierId && remaining > 0) {
      isRemoteUpdateRef.current['suppliers'] = true;
      setSuppliers(prev => {
        const updated = (prev || []).map(s => 
          s.id === supplierId ? { ...s, balance: (Number(s.balance) || 0) + remaining } : s
        );
        try { localStorage.setItem('naif_pos_v3_suppliers', JSON.stringify(updated)); } catch (e) {}
        return updated;
      });
      // زيادة دين المورد بالفرق حتى لا تُلغى حركة أخرى على جهاز آخر
      syncEngine.adjustFields('suppliers', supplierId, { balance: remaining }, {}, true);
    }

    // 3. خصم المبلغ المدفوع من نقدية الوردية إذا كان نقداً وتحديث ورديات المستخدمين
    if (paymentMethod === 'cash' && numPaid > 0 && activeShift?.isOpen) {
      setActiveShift(prev => {
        const updated = {
          ...prev,
          cashOut: (prev.cashOut || 0) + numPaid
        };
        saveAndSync('active_shift', updated, true);
        return updated;
      });

      setUserShifts(prev => {
        const cur = prev[currentUserId] || activeShift;
        const updated = {
          ...prev,
          [currentUserId]: {
            ...cur,
            cashOut: (cur.cashOut || 0) + numPaid,
            updatedAt: new Date().toISOString()
          }
        };
        saveAndSync('user_shifts', updated, true);
        return updated;
      });
    }

    setPurchases(prev => {
      const updated = [newPurchase, ...(prev || [])];
      saveAndSync('purchases', updated, true);
      return updated;
    });
    broadcastStoreActivity({
      type: 'purchase_created',
      title: 'فاتورة مشتريات وتوريد 📦',
      message: `تم تسجيل مشتريات من (${newPurchase.supplierName || 'مورد'}) بقيمة ${formatMoney(numTotal, storeInfo.currency)}`,
      amount: numTotal
    });
    return newPurchase;
  };

  // حذف فاتورة مشتريات وتعديل المخزون ورصيد المورد
  const deletePurchaseInvoice = (purchaseId) => {
    // الحارس داخل دالة التنفيذ: الحذف يعيد المخزون ويعدّل رصيد المورد.
    if (!checkUserPermission(currentUser, 'purchases_delete')) {
      console.warn('[Guard] محاولة حذف مشتريات بلا صلاحية purchases_delete');
      return false;
    }
    const pur = purchases.find(p => p.id === purchaseId);
    if (!pur) return false;

    // 1. إعادة تعديل المخزون (خصم الكميات التي كانت قد أضيفت)
    if (Array.isArray(pur.items)) {
      const deleteDeltas = pur.items
        .map(pi => ({ id: pi.product?.id || pi.productId, delta: -(Number(pi.qty) || 0) }))
        .filter(d => d.id && d.delta);

      isRemoteUpdateRef.current['products'] = true;
      setProducts(prev => {
        const updated = (prev || []).map(prod => {
          const d = deleteDeltas.find(x => x.id === prod.id);
          if (!d) return prod;
          return { ...prod, stock: Math.max(0, (Number(prod.stock) || 0) + d.delta) };
        });
        try { localStorage.setItem('naif_pos_v3_products', JSON.stringify(updated)); } catch (e) {}
        return updated;
      });

      if (deleteDeltas.length > 0) syncEngine.adjustStock(deleteDeltas);
    }

    // 2. تعديل رصيد المورد إذا كان مسجلاً
    if (pur.supplierId && pur.remainingDebt > 0) {
      // محلياً فقط + إرسال الفرق (بدون saveAndSync وإلا صار الخصم مرتين)
      isRemoteUpdateRef.current['suppliers'] = true;
      setSuppliers(prev => {
        const updated = (prev || []).map(s =>
          s.id === pur.supplierId
            ? { ...s, balance: Math.max(0, (Number(s.balance) || 0) - pur.remainingDebt) }
            : s
        );
        try { localStorage.setItem('naif_pos_v3_suppliers', JSON.stringify(updated)); } catch (e) {}
        return updated;
      });
      syncEngine.adjustFields('suppliers', pur.supplierId, { balance: -(Number(pur.remainingDebt) || 0) }, {}, true);
    }

    // 2ب. إعادة المبلغ النقدي المدفوع إلى الدرج (كان الحذف يترك النقد مخصوماً)
    const paidBack = Number(pur.paidAmount) || 0;
    if (pur.paymentMethod === 'cash' && paidBack > 0 && activeShift?.isOpen) {
      const uid = currentUser?.id || 'admin';
      setActiveShift(prev => {
        const updated = { ...prev, cashOut: Math.max(0, (Number(prev.cashOut) || 0) - paidBack) };
        saveAndSync('active_shift', updated, true);
        return updated;
      });
      setUserShifts(prev => {
        const cur = prev[uid] || activeShift;
        const updated = {
          ...prev,
          [uid]: { ...cur, cashOut: Math.max(0, (Number(cur.cashOut) || 0) - paidBack), updatedAt: new Date().toISOString() }
        };
        saveAndSync('user_shifts', updated, true);
        return updated;
      });
    }

    // 3. حذف الفاتورة من السجل
    syncEngine.deleteRecord('purchases', purchaseId);   // حذف صريح من السحابة
    setPurchases(prev => {
      const updated = (prev || []).filter(p => p.id !== purchaseId);
      saveAndSync('purchases', updated, true);
      return updated;
    });
    return true;
  };

  // سداد مستحقات ودفعات الموردين (سند صرف لمورد) مع التوثيق المحاسبي الدقيق
  const addSupplierPayment = ({ supplierId, amount, method = 'cash', notes = '' }) => {
    // الحارس داخل دالة التنفيذ: سند الصرف يُخرج نقداً فعلياً من الخزينة.
    if (!checkUserPermission(currentUser, 'suppliers_payment_voucher')) {
      console.warn('[Guard] محاولة سند صرف بلا صلاحية suppliers_payment_voucher');
      return null;
    }
    const numAmount = Number(amount) || 0;
    if (!supplierId || numAmount <= 0) return null;

    const currentUserId = currentUser?.id || 'admin';
    const currentUserName = currentUser?.name || 'مستخدم';
    const supObj = (suppliers || []).find(s => s.id === supplierId);
    const supName = supObj?.name || 'مورد';

    // 1. خصم المبلغ من رصيد المورد المستحق وحفظه سحابياً فوراً
    isRemoteUpdateRef.current['suppliers'] = true;
    setSuppliers(prev => {
      const updated = (prev || []).map(s => 
        s.id === supplierId ? { ...s, balance: Math.max(0, (Number(s.balance) || 0) - numAmount) } : s
      );
      try { localStorage.setItem('naif_pos_v3_suppliers', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
    syncEngine.adjustFields('suppliers', supplierId, { balance: -numAmount }, {}, true);

    const paymentVoucher = {
      id: `spay-${Date.now()}`,
      supplierId,
      supplierName: supName,
      amount: numAmount,
      method,
      type: 'supplier_payment',
      notes,
      date: new Date().toISOString(),
      voucherNumber: `PAY-${Date.now().toString().slice(-6)}`,
      user: currentUserName,
      userId: currentUserId
    };

    // حفظ في سندات الصرف / الإيصالات
    setPaymentReceipts(prev => {
      const updated = [paymentVoucher, ...(prev || [])];
      saveAndSync('receipts', updated, true);
      return updated;
    });

    // 2. إذا كان الدفع نقداً
    if (method === 'cash') {
      if (activeShift?.isOpen) {
        const tx = {
          id: `dtx-${Date.now()}`,
          shiftId: activeShift?.id || null,
          userId: currentUserId,
          type: 'out',
          category: 'سند صرف مورد نقدي',
          amount: numAmount,
          reason: `سند صرف دفعة للمورد (${supName}) - ${notes || 'سداد مستحقات'}`,
          recipient: supName,
          authorizedBy: currentUser?.name || '',
          voucherNo: paymentVoucher.voucherNumber,
          date: new Date().toISOString(),
          user: currentUserName
        };

        const newCashOut = (activeShift.cashOut || 0) + numAmount;
        const nextActive = {
          ...activeShift,
          cashOut: newCashOut
        };
        setActiveShift(nextActive);
        saveAndSync('active_shift', nextActive, true);

        setUserShifts(prev => {
          const cur = prev[currentUserId] || activeShift;
          const updated = {
            ...prev,
            [currentUserId]: {
              ...cur,
              cashOut: newCashOut,
              updatedAt: new Date().toISOString()
            }
          };
          saveAndSync('user_shifts', updated, true);
          return updated;
        });

        setDrawerTransactions(prev => {
          const updatedTxList = [tx, ...(prev || [])];
          saveAndSync('drawer_tx', updatedTxList, true);
          return updatedTxList;
        });
      } else {
        // لا توجد وردية مفتوحة -> يسجل سحب نقدي من خزينة الإدارة
        const vaultEntry = {
          id: `tled-spay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          type: 'supplier_payment_vault',
          title: `سند صرف نقدي لمورد من الخزينة (${supName})`,
          notes: notes || `سداد مستحقات مورد نقداً من خزينة كاش الإدارة (${supName})`,
          amount: -numAmount,
          grossAmount: numAmount,
          depositSlipNumber: paymentVoucher.voucherNumber,
          voucherNo: paymentVoucher.voucherNumber,
          supplierId,
          supplierName: supName,
          user: currentUserName,
          userId: currentUserId,
          date: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };

        setTreasuryLedger(lPrev => {
          const next = [vaultEntry, ...(lPrev || [])];
          localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(next));
          saveAndSync('treasury_ledger', next, true);
          return next;
        });
      }

      broadcastStoreActivity({
        type: 'supplier_payment',
        title: 'سند صرف نقدي لمورد 💸',
        message: activeShift?.isOpen
          ? `تم صرف مبلغ ${formatMoney(numAmount, storeInfo?.currency || 'ر.س')} نقداً للمورد (${supName}) من درج الوردية`
          : `تم صرف مبلغ ${formatMoney(numAmount, storeInfo?.currency || 'ر.س')} نقداً للمورد (${supName}) من خزينة الإدارة`,
        amount: numAmount
      });
    } else if (method === 'transfer' || method === 'bank') {
      const transferLedgerEntry = {
        id: `tled-sup-trf-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: 'supplier_bank_transfer',
        title: `سداد مستحقات مورد بحوالة بنكية (${supName})`,
        amount: 0,
        grossAmount: numAmount,
        netAmount: -numAmount,
        depositSlipNumber: paymentVoucher.voucherNumber,
        voucherNo: paymentVoucher.voucherNumber,
        supplierId,
        supplierName: supName,
        user: currentUserName,
        userId: currentUserId,
        date: new Date().toISOString(),
        notes: notes || `سداد مستحقات مورد بحوالة بنكية من حساب المؤسسة (${supName})`
      };

      setTreasuryLedger(lPrev => {
        const next = [transferLedgerEntry, ...(lPrev || [])];
        localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(next));
        saveAndSync('treasury_ledger', next, true);
        return next;
      });

      broadcastStoreActivity({
        type: 'supplier_payment',
        title: 'سداد لمورد بحوالة بنكية 🏛️',
        message: `تم قيد سداد تحويل بنكي بمبلغ ${formatMoney(numAmount, storeInfo?.currency || 'ر.س')} للمورد (${supName}) من حساب البنك`,
        amount: numAmount
      });
    } else {
      broadcastStoreActivity({
        type: 'supplier_payment',
        title: 'سند صرف لمورد 💳',
        message: `تم سداد ${formatMoney(numAmount, storeInfo?.currency || 'ر.س')} للمورد (${supName}) عبر البطاقة / الشبكة`,
        amount: numAmount
      });
    }

    return paymentVoucher;
  };

  // المصروفات مع دعم مصادر الدفع (درج الكاشير، خزينة المدير، حساب البنك)
  // =====================================================================
  //  تسجيل مصروف أو إيراد — مصدر واضح وأثر ظاهر دائماً
  // =====================================================================
  //  paymentSource = من أين خرج المال فعلاً: درج الكاشير / خزينة المدير / البنك
  //  paymentMethod = بأي طريقة دُفع: نقداً / شبكة / تحويل بنكي
  //  الدرج والخزينة نقد دائماً؛ البنك شبكة أو تحويل. وكل مصروف يترك أثراً
  //  مرئياً: حركة في سجل درج الكاشير، أو قيداً في دفتر الخزينة.
  const addExpense = ({ category, amount, paymentMethod = 'cash', paymentSource = 'drawer', notes = '', isIncome = false }) => {
    // الحارس في الطبقة الخلفية يغطي كل مسارات الاستدعاء — كانت الحماية
    // عند زر الفتح في الشاشة فقط، ودالة الحفظ نفسها بلا فحص.
    if (!checkUserPermission(currentUser, 'expenses_add')) {
      alert('⛔ ليس لديك صلاحية تسجيل المصروفات والإيرادات.\nتُمنح من: الإعدادات ← المستخدمون ← الصلاحيات.');
      return null;
    }

    const numAmount = Number(amount) || 0;
    if (numAmount <= 0) {
      alert('⚠️ أدخل مبلغاً أكبر من صفر.');
      return null;
    }

    // توحيد الطريقة مع المصدر حتى لا تتناقض البيانات
    const src = (paymentSource === 'manager_vault' || paymentSource === 'bank') ? paymentSource : 'drawer';
    const method = src === 'bank'
      ? (paymentMethod === 'transfer' ? 'transfer' : 'card')
      : 'cash';

    // زيادة درج الكاشير لها باب واحد فقط: تغذية الدرج من خزينة المدير أو
    // البنك بقيد مزدوج. "إيراد إضافي" مصدره الدرج كان باباً خلفياً يزيد
    // النقدية بلا مصدر ولا طرف مقابل، فتختل مطابقة الخزينة.
    // إيراد بلا مصدر مكتوب = زيادة نقدية بلا مبرر قابل للمراجعة
    if (isIncome && !String(notes || '').trim()) {
      alert('⚠️ اكتب مصدر الإيراد: من أين جاء هذا المبلغ؟');
      return { success: false, message: 'مصدر الإيراد مطلوب' };
    }

    if (isIncome && src === 'drawer') {
      alert('⛔ لا يمكن زيادة درج الكاشير كإيراد إضافي.\nاستخدم: الخزينة ← عهدة الكاشير ← "تغذية درج" ليُسجَّل المصدر والطرف المقابل.');
      return { success: false, message: 'زيادة الدرج تتم من تغذية الدرج فقط' };
    }

    const currentUserId = currentUser?.id || 'admin';
    const currentUserName = currentUser?.name || 'مستخدم';
    const srcLabel = src === 'manager_vault' ? 'خزينة المدير'
      : src === 'bank' ? 'حساب البنك' : 'درج الكاشير';

    // ===================================================================
    //  "درج الكاشير" يعني درج المستخدم الحالي — لا أي وردية مفتوحة
    // ===================================================================
    //  مع وجود ورديتين مفتوحتين (فاطمة وروان مثلاً) كان الاعتماد على
    //  activeShift غامضاً: قد يحمل وردية كاشير آخر فيُخصم المصروف من
    //  درجه هو بلا علمه. الآن نحسم: الخصم من درج صاحب الشاشة فقط.
    const myExpenseShift =
      (userShifts && currentUserId && userShifts[currentUserId]) ||
      (activeShift?.userId === currentUserId ? activeShift : null);
    const myExpenseShiftOpen = Boolean(
      myExpenseShift && myExpenseShift.isOpen === true && !myExpenseShift.closedAt && myExpenseShift.status !== 'closed'
    );

    if (src === 'drawer' && !myExpenseShiftOpen) {
      alert('⛔ لا يمكن الصرف نقداً من درج الكاشير بدون وردية مفتوحة باسمك.\n\nافتح وردية أولاً، أو اختر الصرف من خزينة المدير أو من البنك.');
      return null;
    }

    const nowIso = new Date().toISOString();
    const voucherNo = `EXP-${Date.now().toString().slice(-6)}`;
    const expenseId = `exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    logAudit({
      action: isIncome ? 'إيراد خارجي' : 'مصروف',
      target: category || 'غير مصنّف',
      details: `المصدر: ${srcLabel}${notes ? ' — ' + notes : ''}`,
      amount: numAmount,
      severity: 'high'
    });

    const newExp = {
      id: expenseId,
      shiftId: src === 'drawer' ? (myExpenseShift?.id || null) : null,
      userId: currentUserId,
      category,
      amount: numAmount,
      paymentMethod: method,
      paymentSource: src, // 'drawer' = درج الكاشير, 'manager_vault' = كاش الإدارة, 'bank' = حساب البنك
      notes,
      isIncome,
      voucherNo,
      date: nowIso,
      updatedAt: nowIso,
      user: currentUserName
    };

    // -----------------------------------------------------------------
    // 1. مصروف من درج الكاشير: يخصم من عهدته ويظهر كحركة في سجل الدرج
    // -----------------------------------------------------------------
    //  سابقاً كان يخصم من الرصيد بلا أي سطر في "حركات الدرج"، فيرى الكاشير
    //  رصيده نقص ولا يجد ما يفسّره. الآن تُسجَّل حركة مرجعية مربوطة بالسند.
    //  ملاحظة محاسبية: هذه الحركة للعرض فقط ولا تُجمَع في cashOut المحسوب
    //  من حركات الدرج (subType: 'expense' مستثنى)، لأن المصروف يُخصم أصلاً
    //  من قائمة المصروفات عند حساب النقدية المتوقعة — وإلا خُصم مرتين.
    if (src === 'drawer') {
      const baseShift = myExpenseShift || activeShift;
      const nextMyShift = {
        ...baseShift,
        cashOut: (Number(baseShift?.cashOut) || 0) + numAmount,
        updatedAt: nowIso
      };
      const nextShifts = { ...(userShifts || {}), [currentUserId]: nextMyShift };
      setUserShifts(nextShifts);
      try { localStorage.setItem('naif_pos_v3_user_shifts', JSON.stringify(nextShifts)); } catch (e) {}
      saveAndSync('user_shifts', nextShifts, true);

      if ((activeShift?.userId || currentUserId) === currentUserId) {
        activeShiftRef.current = nextMyShift;
        setActiveShift(nextMyShift);
        try { localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(nextMyShift)); } catch (e) {}
      }

      const expTx = {
        id: `dtx-exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        shiftId: newExp.shiftId,
        userId: currentUserId,
        user: currentUserName,
        type: 'out',
        subType: 'expense',
        expenseId,
        amount: numAmount,
        reason: `مصروف: ${category || 'غير مصنّف'}`,
        notes: notes || '',
        voucherNo,
        date: nowIso
      };
      const nextTxList = [expTx, ...(drawerTransactions || [])];
      setDrawerTransactions(nextTxList);
      try { localStorage.setItem('naif_pos_v3_drawer_tx', JSON.stringify(nextTxList)); } catch (e) {}
      saveAndSync('drawer_tx', nextTxList, true);
    }

    // -----------------------------------------------------------------
    // 2. من خزينة المدير أو من البنك: قيد صريح في دفتر الخزينة
    // -----------------------------------------------------------------
    //  البنك كان بلا قيد إطلاقاً، فكان الإيراد البنكي يختفي ولا يزيد رصيد
    //  البنك. الآن لكل حركة بنكية قيدها الظاهر في الدفتر أيضاً.
    if (src === 'manager_vault' || src === 'bank') {
      const isVault = src === 'manager_vault';
      const ledgerEntry = {
        id: `tled-exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: isVault ? 'manager_expense' : 'bank_expense',
        title: `${isIncome ? 'إيراد' : 'مصروف'} ${isVault ? 'من خزينة المدير' : 'من الحساب البنكي'}: ${category || 'غير مصنّف'}`,
        // خزينة المدير: المبلغ يدخل في رصيد الخزينة (سالب للمصروف).
        // البنك: لا يمس الخزينة، ويؤثر في رصيد البنك عبر bankAmount.
        amount: isVault ? (isIncome ? numAmount : -numAmount) : 0,
        bankAmount: isVault ? 0 : (isIncome ? numAmount : -numAmount),
        isIncome,
        expenseId,
        category: category || '',
        paymentMethod: method,
        date: nowIso,
        user: currentUserName,
        userId: currentUserId,
        voucherNo,
        notes: notes || `${isIncome ? 'إيراد' : 'مصروف'} ${srcLabel} (${category || 'غير مصنّف'})`
      };
      const nextLedger = [ledgerEntry, ...(treasuryLedger || [])];
      setTreasuryLedger(nextLedger);
      try { localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(nextLedger)); } catch (e) {}
      saveAndSync('treasury_ledger', nextLedger, true);
      newExp.ledgerEntryId = ledgerEntry.id;
    }

    const nextExpenses = [newExp, ...(expenses || [])];
    setExpenses(nextExpenses);
    try { localStorage.setItem('naif_pos_v3_expenses', JSON.stringify(nextExpenses)); } catch (e) {}
    saveAndSync('expenses', nextExpenses, true);

    broadcastStoreActivity({
      type: 'expense_created',
      title: isIncome ? 'تسجيل إيراد إضافي 📈' : 'تسجيل مصروف جديد 💸',
      message: `${isIncome ? 'إيراد' : 'مصروف'} (${newExp.category || 'تشغيلي'}) بقيمة ${formatMoney(newExp.amount, storeInfo.currency)} — من ${srcLabel}`,
      amount: newExp.amount
    });
    return newExp;
  };

  // =====================================================================
  //  حذف سند مصروف/إيراد — يُعكس أثره بالكامل أو يُرفض الحذف
  // =====================================================================
  //  سابقاً: حذف مصروف من وردية مقفلة لا يعيد المبلغ إطلاقاً (يختفي السند
  //  ويبقى الخصم)، وحذف مصروف خزينة المدير يمسح القيد من الشاشة فقط ولا
  //  يمسحه من السحابة — فيعود بعد أول مزامنة. كلاهما مُصلَح هنا.
  const deleteExpense = (expenseId) => {
    // حذف سند مصروف يعيد المبلغ للدرج/الخزينة — عملية مالية تحتاج حارساً
    // في التنفيذ لا عند الزر وحده.
    if (!checkUserPermission(currentUser, 'expenses_delete')) {
      alert('⛔ ليس لديك صلاحية حذف سندات المصروفات.\nتُمنح من: الإعدادات ← المستخدمون ← الصلاحيات.');
      return false;
    }

    const exp = (expenses || []).find(e => e.id === expenseId);
    if (!exp) return false;

    const currentUserId = currentUser?.id || 'admin';
    const isDrawer = exp.paymentSource === 'drawer' || (!exp.paymentSource && exp.paymentMethod === 'cash');

    if (isDrawer) {
      // وردية صاحب السند: هل ما زالت مفتوحة؟
      const ownerUid = exp.userId || currentUserId;
      const ownerShift = (userShifts && userShifts[ownerUid]) || null;
      const isSameShift = Boolean(
        ownerShift && ownerShift.isOpen === true && !ownerShift.closedAt &&
        (!exp.shiftId || exp.shiftId === ownerShift.id)
      );

      if (!isSameShift) {
        alert(
          '⛔ لا يمكن حذف هذا السند: وردية صاحبه مُقفلة وصدر تقريرها.\n\n' +
          'حذفه الآن يُخفي السند ويُبقي المبلغ مخصوماً من عهدة مقفلة، فتختل مطابقة الوردية.\n' +
          'لتصحيح الخطأ سجّل سنداً مقابلاً في الوردية الحالية.'
        );
        return false;
      }

      // عكس الأثر على درج صاحب السند
      const revertedShift = {
        ...ownerShift,
        cashOut: exp.isIncome ? ownerShift.cashOut : Math.max(0, (Number(ownerShift.cashOut) || 0) - (Number(exp.amount) || 0)),
        cashIn: exp.isIncome ? Math.max(0, (Number(ownerShift.cashIn) || 0) - (Number(exp.amount) || 0)) : ownerShift.cashIn,
        updatedAt: new Date().toISOString()
      };
      const nextShifts = { ...(userShifts || {}), [ownerUid]: revertedShift };
      setUserShifts(nextShifts);
      try { localStorage.setItem('naif_pos_v3_user_shifts', JSON.stringify(nextShifts)); } catch (e) {}
      saveAndSync('user_shifts', nextShifts, true);
      if (ownerUid === currentUserId) {
        activeShiftRef.current = revertedShift;
        setActiveShift(revertedShift);
        try { localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(revertedShift)); } catch (e) {}
      }

      // حذف حركة الدرج المرجعية المرتبطة بالسند (من الشاشة والسحابة)
      const linkedTxs = (drawerTransactions || []).filter(t => t && t.expenseId === expenseId);
      if (linkedTxs.length > 0) {
        linkedTxs.forEach(t => syncEngine.deleteRecord('drawer_tx', t.id));
        const nextTx = (drawerTransactions || []).filter(t => !(t && t.expenseId === expenseId));
        setDrawerTransactions(nextTx);
        try { localStorage.setItem('naif_pos_v3_drawer_tx', JSON.stringify(nextTx)); } catch (e) {}
        saveAndSync('drawer_tx', nextTx, true);
      }
    }

    // قيد الخزينة أو البنك المرتبط بالسند: حذف صريح من السحابة أيضاً
    const linkedEntries = (treasuryLedger || []).filter(t => t && t.expenseId === expenseId);
    if (linkedEntries.length > 0) {
      linkedEntries.forEach(t => syncEngine.deleteRecord('treasury_ledger', t.id));
      const nextLedger = (treasuryLedger || []).filter(t => !(t && t.expenseId === expenseId));
      setTreasuryLedger(nextLedger);
      try { localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(nextLedger)); } catch (e) {}
      saveAndSync('treasury_ledger', nextLedger, true);
    }

    logAudit({
      action: exp.isIncome ? 'حذف سند إيراد' : 'حذف سند مصروف',
      target: exp.category || 'غير مصنّف',
      details: `المصدر: ${exp.paymentSource === 'manager_vault' ? 'خزينة المدير' : exp.paymentSource === 'bank' ? 'حساب البنك' : 'درج الكاشير'}`,
      amount: Number(exp.amount) || 0,
      severity: 'high'
    });

    syncEngine.deleteRecord('expenses', expenseId);   // حذف صريح من السحابة
    const nextExpenses = (expenses || []).filter(e => e.id !== expenseId);
    setExpenses(nextExpenses);
    try { localStorage.setItem('naif_pos_v3_expenses', JSON.stringify(nextExpenses)); } catch (e) {}
    saveAndSync('expenses', nextExpenses, true);
    return true;
  };

  // حركة الخزينة (سحب وإيداع نقدي)
  const addDrawerMovement = ({ type = 'in', amount, reason = '', recipient = '', voucherNo = '', authorizedBy = '' }) => {
    const numAmount = Number(amount) || 0;
    const currentUserId = currentUser?.id || 'admin';
    const currentUserName = currentUser?.name || 'كاشير';
    const isTreasuryDrop = type === 'treasury_drop' || reason?.includes('ترحيل للخزينة') || reason?.includes('سحب للخزينة');
    const actualType = isTreasuryDrop ? 'treasury_drop' : type;

    const tx = {
      id: `dtx-${Date.now()}`,
      shiftId: activeShift?.id || null,
      userId: currentUserId,
      type: actualType, // 'in' or 'out' or 'treasury_drop'
      category: isTreasuryDrop ? 'سحب وترحيل للخزينة الرئيسية' : actualType === 'in' ? 'إيداع نقدي بالدرج' : 'سحب نقدي من الدرج',
      amount: numAmount,
      reason: reason || (isTreasuryDrop ? 'سحب وترحيل نقدي للخزينة الرئيسية' : actualType === 'in' ? 'إيداع نقدي' : 'سحب نقدي'),
      recipient: recipient || (isTreasuryDrop ? 'أمين الخزينة الرئيسية' : ''),
      authorizedBy: authorizedBy || (currentUser?.role === 'admin' ? currentUser?.name : ''),
      voucherNo: voucherNo || `TR-${Date.now().toString().slice(-6)}`,
      date: new Date().toISOString(),
      user: currentUserName
    };

    if (activeShift?.isOpen) {
      const isDeduct = actualType === 'out' || actualType === 'treasury_drop';
      const newCashIn = actualType === 'in' ? (activeShift.cashIn || 0) + numAmount : (activeShift.cashIn || 0);
      const newCashOut = isDeduct ? (activeShift.cashOut || 0) + numAmount : (activeShift.cashOut || 0);

      const nextActive = {
        ...activeShift,
        cashIn: newCashIn,
        cashOut: newCashOut,
      };
      setActiveShift(nextActive);

      setUserShifts(prev => {
        const cur = prev[currentUserId] || activeShift;
        const updated = {
          ...prev,
          [currentUserId]: {
            ...cur,
            cashIn: newCashIn,
            cashOut: newCashOut,
            updatedAt: new Date().toISOString()
          }
        };
        saveAndSync('user_shifts', updated, true);
        return updated;
      });
    }

    // نفس الخلل: القائمة كانت تُبنى داخل دالة التحديث المؤجَّلة فتُحفظ فارغة
    const updatedTxList = [tx, ...(drawerTransactions || [])];
    setDrawerTransactions(updatedTxList);
    try {
      localStorage.setItem('naif_pos_v3_drawer_tx', JSON.stringify(updatedTxList));
    } catch (e) {}
    saveAndSync('drawer_tx', updatedTxList, true);

    if (isTreasuryDrop) {
      const dropEntry = {
        id: `tled-drop-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: 'treasury_drop',
        title: `ترحيل نقدي من درج الكاشير (${currentUserName})`,
        amount: numAmount,
        drawerTxId: tx.id,
        shiftId: activeShift?.id || null,
        user: currentUserName,
        userId: currentUserId,
        voucherNo: tx.voucherNo,
        date: tx.date,
        notes: tx.reason || 'ترحيل نقدي من درج الكاشير إلى الخزينة الرئيسية'
      };
      setTreasuryLedger(lPrev => {
        const next = [dropEntry, ...(lPrev || [])];
        localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(next));
        saveAndSync('treasury_ledger', next, true);
        return next;
      });
    }

    broadcastStoreActivity({
      type: 'drawer_tx',
      title: isTreasuryDrop ? 'سحب وترحيل للخزينة 🏦' : actualType === 'in' ? 'إيداع نقدي بالدرج 💵' : 'سحب نقدي من الدرج 💸',
      message: `${isTreasuryDrop ? 'ترحيل للخزينة' : actualType === 'in' ? 'إيداع' : 'سحب'}: ${tx.reason} (${formatMoney(tx.amount, storeInfo?.currency || 'ر.س')})`,
      amount: tx.amount
    });

    return tx;
  };

  // إغلاق الوردية وتوثيق تقرير المعاملات التفصيلي الكامل مع عزل حسابات كل كاشير ومستخدم بدقة
  const closeShift = (actualCash, notes = '', targetShift = null) => {
    const effShift = targetShift || activeShift;
    if (!effShift) return null;
    const actual = Number(actualCash) || 0;
    logAudit({
      action: 'إغلاق وردية',
      target: effShift.cashierName || effShift.userId || '',
      details: `النقدية المعدودة: ${actual}${notes ? ' — ' + notes : ''}`,
      amount: actual,
      severity: 'high'
    });
    const closedDate = new Date().toISOString();
    const currentUserId = effShift.userId || currentUser?.id || 'admin';
    const currentUserName = effShift.cashierName || currentUser?.name || 'كاشير بيت الورد';
    const openTime = effShift.openedAt ? new Date(effShift.openedAt).getTime() : 0;

    // إحصائيات دقيقة لفواتير الوردية الحالية لهذا الكاشير تحديداً - عزل تام وشامل (شاملة الفواتير المكتملة والمرتجعة لاحقاً لحساب إجمالي المبيعات بدقة)
    const shiftInvoices = (invoices || []).filter(i => {
      if (!i.date) return false;
      if (i.shiftId && effShift.id && i.shiftId === effShift.id) return true;
      const invTime = new Date(i.date).getTime();
      let isUserMatch = false;
      if (i.cashierId && i.cashierId === currentUserId) isUserMatch = true;
      else if (i.userId && i.userId === currentUserId) isUserMatch = true;
      else if (i.cashier) {
        const invC = String(i.cashier).trim().toLowerCase();
        const curN = String(currentUserName).trim().toLowerCase();
        if (invC === curN) isUserMatch = true;
      }
      return invTime >= openTime && isUserMatch;
    });

    // استخراج كافة وسائل الدفع المعرفة في إعدادات النظام (مع استبعاد 'split')
    const configuredMethods = storeInfo?.paymentMethods || INITIAL_PAYMENT_METHODS;
    const paymentMethodsBreakdown = {};
    configuredMethods.forEach(m => {
      if (m.id !== 'split' && m.type !== 'split') {
        paymentMethodsBreakdown[m.id] = {
          id: m.id,
          name: m.name || m.subtitle || m.id,
          subtitle: m.subtitle || '',
          type: m.type || 'card',
          amount: 0,
          count: 0
        };
      }
    });

    let cashierCashSales = 0;
    let cashierCardSales = 0;
    let cashierCreditSales = 0;
    let cashierTransferSales = 0;
    let cashierVisaSales = 0;
    let cashierTamaraSales = 0;
    let cashierNinjaSales = 0;

    const recordPayment = (methodId, methodType, methodName, amount, isSplit = false) => {
      const amt = Number(amount) || 0;
      if (amt <= 0) return;
      
      const resolved = resolvePaymentMethod({ id: methodId, name: methodName, type: methodType }, configuredMethods);
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

      if (id === 'cash' || type === 'cash') cashierCashSales += amt;
      else if (id === 'credit' || type === 'credit') cashierCreditSales += amt;
      else if (id === 'transfer' || id === 'bank' || type === 'online') cashierTransferSales += amt;
      else if (id === 'visa') cashierVisaSales += amt;
      else if (id === 'tamara') cashierTamaraSales += amt;
      else if (id === 'ninja') cashierNinjaSales += amt;
      else cashierCardSales += amt;
    };

    let splitInvoicesCount = 0;
    // حصر فواتير الوردية: الفواتير النقدية تسجل إجمالياً ويطرح منها المرتجع النقدي للدرج، أما الفواتير غير النقدية (شبكة، تحويل، آجل، تمارا، نينجا) فتسجل الفواتير المكتملة فقط لخصم المرتجع فوراً
    shiftInvoices.forEach(inv => {
      const isRefunded = inv.status === 'refunded';
      const tot = Number(inv.total) || 0;
      const isSplitInv = (inv.splitPayments && Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) ||
        inv.paymentMethodType === 'split' || 
        inv.paymentMethod === 'split';
      if (isSplitInv && !isRefunded) splitInvoicesCount++;

      if (inv.splitPayments && Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) {
        inv.splitPayments.forEach(sp => {
          const isCash = sp.methodType === 'cash' || sp.methodId === 'cash';
          // النقد يسجل إجمالياً ثم يُطرح المرتجع بدقة من حركة الدرج
          // أما غير النقد فيسجل فقط إذا لم تكن الفاتورة مسترجعة
          if (isCash || !isRefunded) {
            recordPayment(sp.methodId, sp.methodType, sp.methodName, sp.amount, true);
          }
        });
      } else if (inv.paymentMethodType === 'split' || inv.paymentMethod === 'split') {
        const sCash = Number(inv.splitCash) || 0;
        const sCard = Number(inv.splitCard) || 0;
        const sCredit = Number(inv.splitCredit) || 0;
        const sTransfer = Number(inv.splitTransfer) || 0;
        if (sCash > 0) recordPayment('cash', 'cash', 'كاش', sCash, true);
        if (!isRefunded) {
          if (sCard > 0) recordPayment('card', 'card', 'شبكة', sCard, true);
          if (sCredit > 0) recordPayment('credit', 'credit', 'آجل', sCredit, true);
          if (sTransfer > 0) recordPayment('transfer', 'online', 'تحويل', sTransfer, true);
        }
      } else {
        const isCash = inv.paymentMethodType === 'cash' || inv.paymentMethod === 'cash';
        if (isCash || !isRefunded) {
          recordPayment(inv.paymentMethod, inv.paymentMethodType, inv.paymentMethodName, tot, false);
        }
      }
    });

    // حركات الخزينة والدرج الخاصة بهذا الكاشير خلال الوردية
    const shiftDrawerTx = (drawerTransactions || []).filter(tx => {
      if (!tx.date) return false;
      if (tx.shiftId && effShift.id && tx.shiftId === effShift.id) return true;
      const txTime = new Date(tx.date).getTime();
      const isUserMatch = (tx.userId && tx.userId === currentUserId) || (tx.user === currentUserName);
      return txTime >= openTime && isUserMatch;
    });

    // حركات المصروف مرجعية للعرض فقط: المصروف يُخصم عبر totalCashExpenses
    const shiftCashIn = shiftDrawerTx.filter(t => t.type === 'in' && t.subType !== 'expense' && !t.countedInStartCash && t.status !== 'pending').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    // استبعاد حركات مرتجع المبيعات النقدية من shiftCashOut لأنها تخصم صراحة عبر shiftCashRefunds منعاً للازدواجية المحاسبية
    const shiftCashOut = shiftDrawerTx.filter(t => (t.type === 'out' || t.type === 'treasury_drop') && t.subType !== 'expense' && t.category !== 'مرتجع مبيعات نقدية').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const shiftTreasuryDrops = shiftDrawerTx.filter(t => t.type === 'treasury_drop').reduce((s, t) => s + (Number(t.amount) || 0), 0);

    // حساب المشتريات والمصروفات خلال الوردية الخاصة بهذا الكاشير (فقط ما صُرف نقداً من درج الكاشير)
    const shiftPurchases = (purchases || []).filter(p => {
      if (!p.date) return false;
      const isDrawerCash = (!p.paymentMethod || p.paymentMethod === 'cash') && (p.paymentSource === 'drawer' || !p.paymentSource);
      if (!isDrawerCash) return false;
      if (p.shiftId && effShift.id && p.shiftId === effShift.id) return true;
      const pTime = new Date(p.date).getTime();
      const isUserMatch = (p.userId && p.userId === currentUserId) || (p.user === currentUserName);
      return pTime >= openTime && (isUserMatch || !p.userId);
    });

    const shiftExpenses = (expenses || []).filter(e => {
      if (!e.date || e.isIncome) return false;
      const isDrawerCash = (e.paymentSource === 'drawer' || (!e.paymentSource && e.paymentMethod === 'cash')) && e.paymentMethod === 'cash';
      if (!isDrawerCash) return false;
      if (e.shiftId && effShift.id && e.shiftId === effShift.id) return true;
      const eTime = new Date(e.date).getTime();
      const isUserMatch = (e.userId && e.userId === currentUserId) || (e.user === currentUserName);
      return eTime >= openTime && isUserMatch;
    });

    const totalCashExpenses = shiftExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalCashPurchases = shiftPurchases.reduce((s, p) => s + (Number(p.paidAmount ?? p.totalAmount ?? p.total ?? p.amount) || 0), 0);

    // المبالغ النقدية المرتجعة للعملاء من الدرج خلال هذه الوردية
    const shiftCashRefunds = (invoices || []).filter(i => {
      if (i.status !== 'refunded') return false;
      if (i.refundShiftId && effShift.id && i.refundShiftId === effShift.id) return true;
      if (!i.refundedAt) return false;
      const refTime = new Date(i.refundedAt).getTime();
      const isUserMatch = (i.refundedBy === currentUserName) || (i.refundedBy === currentUserId) || (i.refundedByUserId === currentUserId);
      return refTime >= openTime && isUserMatch;
    }).reduce((sum, inv) => {
      const b = calculateInvoicePaymentBreakdown(inv);
      return sum + (b.cash || 0);
    }, 0);

    // إجمالي المرتجعات بكافة وسائل الدفع للوردية
    const shiftTotalRefunds = (invoices || []).filter(i => {
      if (i.status !== 'refunded') return false;
      if (i.refundShiftId && effShift.id && i.refundShiftId === effShift.id) return true;
      if (!i.refundedAt) return false;
      const refTime = new Date(i.refundedAt).getTime();
      const isUserMatch = (i.refundedBy === currentUserName) || (i.refundedBy === currentUserId) || (i.refundedByUserId === currentUserId);
      return refTime >= openTime && isUserMatch;
    }).reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

    const finalCashSales = cashierCashSales;
    const finalCardSales = cashierCardSales;
    const finalCreditSales = cashierCreditSales;
    // إجمالي المبيعات الصافي بعد خصم المرتجعات بكافة طرق الدفع
    const netCashSales = Math.max(0, finalCashSales - shiftCashRefunds);
    const totalSales = netCashSales + finalCardSales + finalCreditSales + cashierTransferSales + cashierTamaraSales + cashierNinjaSales + cashierVisaSales;

    // سندات قبض العملاء النقدية المحصلة في الدرج خلال الوردية
    const shiftReceipts = (paymentReceipts || []).filter(r => {
      if (!r.date || r.method !== 'cash') return false;
      const rTime = new Date(r.date).getTime();
      return rTime >= openTime;
    });
    const shiftCustomerCashReceipts = shiftReceipts.reduce((s, r) => s + (Number(r.amount) || 0), 0);

    const startCash = Number(effShift.startCash ?? activeShift?.startCash ?? 0);
    const expected = startCash + finalCashSales - shiftCashRefunds + shiftCashIn - shiftCashOut - totalCashExpenses - totalCashPurchases;
    const difference = actual - expected;

    const openInfo = formatShiftDateTime(effShift.openedAt || activeShift?.openedAt);
    const closeInfo = formatShiftDateTime(closedDate);
    const duration = formatShiftDuration(effShift.openedAt || activeShift?.openedAt, closedDate);

    const cashierUser = (Array.isArray(users) ? users.find(u => u.id === currentUserId || u.name === currentUserName) : null) || currentUser;

    // حساب الخصومات والضريبة من الفواتير
    const totalDiscounts = shiftInvoices.reduce((s, inv) => s + (Number(inv.discount) || 0), 0);
    const taxAmount = shiftInvoices.reduce((s, inv) => s + (Number(inv.taxAmount || inv.tax) || 0), 0);
    const bankSales = cashierTransferSales;

    const closed = {
      ...effShift,
      isOpen: false,
      closedAt: closedDate,
      dayName: closeInfo.dayName || openInfo.dayName || '',
      dateFormatted: closeInfo.date || openInfo.date || '',
      openTimeFormatted: openInfo.time || '',
      closeTimeFormatted: closeInfo.time || '',
      durationText: duration,
      cashierName: currentUserName,
      cashierId: currentUserId,
      cashierRole: cashierUser?.roleName || (cashierUser?.role === 'admin' ? '👑 مدير النظام' : '🌸 كاشير مبيعات'),
      startCash,
      openingCash: startCash,
      paymentMethodsBreakdown,
      cashSales: finalCashSales,
      cardSales: finalCardSales,
      creditSales: finalCreditSales,
      bankSales: cashierTransferSales,
      transferSales: cashierTransferSales,
      visaSales: cashierVisaSales,
      tamaraSales: cashierTamaraSales,
      ninjaSales: cashierNinjaSales,
      customerPaymentsCash: shiftCustomerCashReceipts,
      cashRefunds: shiftCashRefunds,
      expectedCash: expected,
      actualCash: actual,
      difference: difference,
      cashIn: shiftCashIn,
      cashOut: shiftCashOut,
      totalSales,
      totalOrders: shiftInvoices.length,
      totalDiscounts,
      taxAmount,
      totalExpenses: totalCashExpenses,
      totalPurchases: totalCashPurchases,
      treasuryDrops: shiftTreasuryDrops,
      netCashInDrawer: expected,
      notes,
      invoicesCount: shiftInvoices.length,
      splitInvoicesCount,
      paymentOperationsCount: Object.values(paymentMethodsBreakdown).reduce((s, m) => s + (Number(m.count) || 0), 0),
      purchasesCount: shiftPurchases.length,
      expensesCount: shiftExpenses.length,
      closedBy: currentUser?.name || currentUserName,
      closedByRole: currentUser?.roleName || (currentUser?.role === 'admin' ? '👑 مدير النظام' : '🌸 كاشير مبيعات'),
      userId: currentUserId,
      status: 'closed',
      updatedAt: new Date().toISOString(),
      handoverStatus: 'pending', // النقدية معلقة بعهدة الكاشير حتى يستلمها المدير
      handoverAmount: actual,     // المبلغ الفعلي المسلم من الكاشير
      handoverReceivedBy: null,
      handoverReceivedById: null,
      handoverReceivedAt: null,
      handoverNotes: ''
    };

    setUserShifts(prev => {
      const updated = { ...prev, [currentUserId]: closed };
      saveAndSync('user_shifts', updated, true);
      return updated;
    });

    if (activeShift?.id === effShift.id || currentUserId === (currentUser?.id || 'admin')) {
      setActiveShift(closed);
      localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(closed));
    }

    setShiftsHistory(prev => {
      const updated = [closed, ...prev];
      saveAndSync('shifts_history', updated, true);
      return updated;
    });

    broadcastStoreActivity({
      type: 'shift_closed',
      title: 'إغلاق وردية كاشير 🔒',
      message: `أغلق الكاشير (${currentUser?.name}) الوردية - إجمالي المبيعات: ${formatMoney(closed.totalSales, storeInfo?.currency || 'ر.س')}`,
      amount: closed.totalSales
    });

    return closed;
  };

  // فتح وردية جديدة خاصة بالمستخدم الحالي بشكل معزول مع منع التكرار السحابي التام
  // =====================================================================
  //  العهد المُسلّمة بانتظار فتح الوردية
  // =====================================================================
  //  تُخزَّن كحركات درج (subType: 'drawer_funding') بحالة 'pending'.
  //  المال خرج من مصدره فعلاً، لكنه لم يدخل أي وردية بعد. عند فتح
  //  الوردية يصير الرصيد الافتتاحي حتماً، وتُختم الحركة بـ 'consumed'.
  const isPendingFloatTx = (t) => Boolean(
    t && t.subType === 'drawer_funding' && t.status === 'pending'
  );

  const getPendingFloatsFor = (userId) => (
    (drawerTransactions || []).filter(t => isPendingFloatTx(t) && t.userId === userId)
  );

  const getPendingFloatTotalFor = (userId) => (
    getPendingFloatsFor(userId).reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  );

  const myPendingFloatTotal = getPendingFloatTotalFor(currentUser?.id || 'admin');

  const allPendingFloats = (drawerTransactions || []).filter(isPendingFloatTx);
  const allPendingFloatsTotal = allPendingFloats.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  // استرجاع عهدة لم تُستلم بعد: يُعاد المبلغ لمصدره ويُحذف أثرها بالكامل
  const cancelPendingFloat = (txId) => {
    const isManager = currentUser?.role === 'admin'
      || checkUserPermission(currentUser, 'treasury_manage')
      || checkUserPermission(currentUser, 'drawer_manage');
    if (!isManager) {
      alert('⛔ استرجاع العهدة مقتصر على مدير المتجر أو المسؤول المعتمد!');
      return { success: false };
    }
    const tx = (drawerTransactions || []).find(t => t && t.id === txId);
    if (!isPendingFloatTx(tx)) {
      alert('⚠️ هذه العهدة استُلمت بالفعل ولا يمكن استرجاعها.\nالتصحيح يكون بسحب نقدية من درج الكاشير.');
      return { success: false };
    }

    syncEngine.deleteRecord('drawer_tx', tx.id);
    const nextTx = (drawerTransactions || []).filter(t => t.id !== tx.id);
    setDrawerTransactions(nextTx);
    try { localStorage.setItem('naif_pos_v3_drawer_tx', JSON.stringify(nextTx)); } catch (e) {}
    saveAndSync('drawer_tx', nextTx, true);

    const linked = (treasuryLedger || []).filter(e => e && e.drawerTxId === tx.id);
    if (linked.length > 0) {
      linked.forEach(e => syncEngine.deleteRecord('treasury_ledger', e.id));
      const nextLedger = (treasuryLedger || []).filter(e => !(e && e.drawerTxId === tx.id));
      setTreasuryLedger(nextLedger);
      try { localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(nextLedger)); } catch (e) {}
      saveAndSync('treasury_ledger', nextLedger, true);
    }

    logAudit({
      action: 'استرجاع عهدة لم تُستلم',
      target: tx.user || tx.userId || '',
      details: `أُعيد المبلغ إلى ${tx.fundingSource === 'bank' ? 'الحساب البنكي' : 'كاش خزينة المدير'}`,
      amount: Number(tx.amount) || 0,
      severity: 'high'
    });
    return { success: true, amount: Number(tx.amount) || 0 };
  };

  const openNewShift = (startCash = 0) => {
    const currentUserId = currentUser?.id || 'admin';

    // فحص صارم ومحكم لمنع فتح الوردية مرتين: هل لدى هذا المستخدم وردية مفتوحة بالفعل محلياً أو سحابياً؟
    const isShiftValidAndOpen = (sh) => {
      if (!sh || sh.isOpen !== true || sh.status === 'closed' || sh.closedAt) return false;
      const inHist = (shiftsHistory || []).some(h => h && h.id === sh.id && (h.status === 'closed' || h.closedAt || h.isOpen === false));
      return !inHist;
    };

    // وردية موجودة في السجل التاريخي كمغلقة = مغلقة مهما قالت النسخة
    // المحلية. بدون هذا الفحص تبقى وردية "عالقة مفتوحة" تمنع الكاشير
    // من فتح وردية جديدة إلى الأبد رغم أنه أغلقها فعلاً.
    const isClosedInHistory = (sh) => Boolean(
      sh && sh.id && (shiftsHistory || []).some(h => h && h.id === sh.id &&
        (h.status === 'closed' || h.closedAt || h.isOpen === false))
    );
    const userShift = userShifts?.[currentUserId];
    const isUserShiftOpen = isShiftValidAndOpen(userShift) && !isClosedInHistory(userShift);
    const isActiveOpen = isShiftValidAndOpen(activeShift) && activeShift.userId === currentUserId && !isClosedInHistory(activeShift);
    const existingShift = isUserShiftOpen ? userShift : (isActiveOpen ? activeShift : null);

    if (existingShift) {
      // التحقق مما إذا كانت الوردية قديمة من يوم سابق أو عالقة
      const shiftDate = existingShift.openedAt ? new Date(existingShift.openedAt).toDateString() : '';
      const todayDate = new Date().toDateString();
      const isOldDay = shiftDate && shiftDate !== todayDate;

      const confirmMsg = isOldDay
        ? `⚠️ تنبيه: لدى الكاشير (${currentUser?.name || 'المدير'}) وردية سابقة مفتوحة من تاريخ (${shiftDate || 'سابق'}) برقم #${existingShift.id}.\n\nهل تريد إغلاق الوردية السابقة الآن وبدء وردية جديدة برصيد (${Number(startCash) || 0} ر.س)؟\n\nاضغط [موافق] لإغلاق السابقة وفتح وردية جديدة فوراً.\nاضغط [إلغاء] لاستئناف الوردية السابقة ومتابعة العمل بها.`
        : `⚠️ تنبيه: لدى الكاشير (${currentUser?.name || 'المدير'}) وردية جارية مفتوحة بالفعل برقم #${existingShift.id}.\n\nهل تريد استئناف هذه الوردية المفتوحة والمتابعة بها؟\n\nاضغط [موافق] لاستئناف الوردية الحالية.\nاضغط [إلغاء] لإغلاقها الآن وبدء وردية جديدة بالرصيد المدخل (${Number(startCash) || 0} ر.س).`;

      let shouldCloseAndStartNew = false;
      if (isOldDay) {
        shouldCloseAndStartNew = window.confirm(confirmMsg);
      } else {
        const resume = window.confirm(confirmMsg);
        shouldCloseAndStartNew = !resume;
      }

      if (!shouldCloseAndStartNew) {
        // استئناف الوردية القائمة وتحديث حالتها في كل المواضع
        const resumedShift = { ...existingShift, isOpen: true, status: 'open' };
        activeShiftRef.current = resumedShift;
        setActiveShift(resumedShift);
        setUserShifts(prev => {
          const updated = { ...prev, [currentUserId]: resumedShift };
          saveAndSync('user_shifts', updated, true);
          return updated;
        });
        localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(resumedShift));
        return resumedShift;
      }

      // إغلاق الوردية السابقة وتوثيقها في السجل التاريخي قبل إنشاء الوردية الجديدة
      try {
        closeShift(existingShift.actualCash ?? existingShift.startCash ?? 0, 'إغلاق آلي لبدء وردية جديدة', existingShift);
      } catch (err) {
        console.warn('Error closing existing shift before opening new one:', err);
      }
    }

    // =================================================================
    //  عهدة مُسلّمة من المدير؟ هي الرصيد الافتتاحي حتماً
    // =================================================================
    //  المبلغ صار فعلياً في يد الكاشير أو في الدرج. لو أُضيف كـ"إيداع"
    //  فوق ما يعدّه الكاشير لحُسب مرتين وظهر الدرج بضعف المبلغ. ولأن
    //  الإدارة اختارت التثبيت الإجباري: الرصيد الافتتاحي = مبلغ العهدة،
    //  وأي نقص يظهر كعجز عند إقفال الوردية.
    const myFloats = getPendingFloatsFor(currentUserId);
    const myFloatTotal = myFloats.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const effectiveStartCash = myFloats.length > 0 ? myFloatTotal : (Number(startCash) || 0);

    const newShift = {
      id: `shift-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      isOpen: true,
      openedAt: new Date().toISOString(),
      startCash: effectiveStartCash,
      cashSales: 0,
      cardSales: 0,
      creditSales: 0,
      cashIn: 0,
      cashOut: 0,
      userId: currentUserId,
      cashierName: currentUser?.name || 'كاشير بيت الورد',
      cashierRole: currentUser?.roleName || (currentUser?.role === 'admin' ? '👑 مدير النظام' : '🌸 كاشير مبيعات'),
      status: 'open',
      updatedAt: new Date().toISOString()
    };

    // ختم العهد المستهلَكة حتى لا تُحسب ثانيةً ولا تُصرف مرتين
    if (myFloats.length > 0) {
      const consumedIds = new Set(myFloats.map(t => t.id));
      const consumedAt = new Date().toISOString();
      const nextTx = (drawerTransactions || []).map(t => (
        consumedIds.has(t.id)
          ? {
              ...t,
              status: 'consumed',
              shiftId: newShift.id,
              consumedShiftId: newShift.id,
              consumedAt,
              updatedAt: consumedAt,
              // مضمَّنة في الرصيد الافتتاحي: لا تُجمع في إيداعات الدرج
              countedInStartCash: true,
              reason: `${t.reason || 'عهدة'} — استُلمت كرصيد افتتاحي`
            }
          : t
      ));
      setDrawerTransactions(nextTx);
      try { localStorage.setItem('naif_pos_v3_drawer_tx', JSON.stringify(nextTx)); } catch (e) {}
      saveAndSync('drawer_tx', nextTx, true);

      logAudit({
        action: 'استلام عهدة كرصيد افتتاحي',
        target: currentUser?.name || currentUserId,
        details: `عدد السندات: ${myFloats.length}`,
        amount: myFloatTotal,
        severity: 'high'
      });
    }

    activeShiftRef.current = newShift;
    setActiveShift(newShift);
    setUserShifts(prev => {
      const updated = { ...prev, [currentUserId]: newShift };
      saveAndSync('user_shifts', updated, true);
      return updated;
    });
    localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(newShift));

    broadcastStoreActivity({
      type: 'shift_opened',
      title: 'فتح وردية كاشير جديدة 🔓',
      message: `بدأ الكاشير (${currentUser?.name}) وردية جديدة برصيد افتتاحي ${formatMoney(startCash, storeInfo?.currency || 'ر.س')}`,
      amount: Number(startCash) || 0
    });

    return newShift;
  };

  // حذف تقرير وردية قديم من السجل - مقتصر حصراً على مدير النظام فقط (Admin Only)
  const deleteShiftRecord = (shiftId) => {
    const isManager = currentUser?.role === 'admin' || checkUserPermission(currentUser, 'drawer_delete_shifts');
    if (!isManager) {
      alert('⛔ عذراً، حذف تقارير الورديات السابقة مقتصر حصراً على مدير النظام!');
      return false;
    }
    const shiftToDelete = shiftsHistory.find(s => s.id === shiftId);
    logAudit({
      action: 'حذف وردية من السجل',
      target: shiftToDelete?.cashierName || shiftId,
      details: `النقدية المعدودة وقت الحذف: ${Number(shiftToDelete?.actualCash) || 0}`,
      severity: 'high'
    });
    syncEngine.deleteRecord('shifts_history', shiftId);   // حذف صريح من السحابة
    setShiftsHistory(prev => {
      const updated = prev.filter(s => s.id !== shiftId);
      localStorage.setItem('naif_pos_v3_shifts_history', JSON.stringify(updated));
      saveAndSync('shifts_history', updated, true);
      return updated;
    });

    broadcastStoreActivity({
      type: 'shift_deleted',
      title: 'حذف تقرير وردية 🗑️',
      message: `قام مدير النظام (${currentUser?.name}) بحذف تقرير الوردية (${shiftToDelete?.cashierName || 'كاشير'} #${String(shiftId).slice(-6)}) من الأرشيف.`
    });
    return true;
  };

  // تعديل تقرير وردية في السجل التاريخي (مدير النظام حصراً)
  const updateShiftRecord = (shiftId, updatedFields, reason = '') => {
    const isManager = currentUser?.role === 'admin' || checkUserPermission(currentUser, 'drawer_delete_shifts');
    if (!isManager) {
      alert('⛔ عذراً، تعديل تقارير الورديات السابقة مقتصر حصراً على مدير النظام!');
      return false;
    }

    // ===== قفل الوردية المغلقة =====
    // الوردية بعد إغلاقها مستند محاسبي. لا نمنع تصحيحها، لكن لا يجوز
    // أن تُغيَّر بصمت: كل تعديل يحتاج سبباً، ويُحفظ كقيد تسوية داخل الوردية
    // نفسها مع القيمة قبل وبعد واسم من عدّلها، ويُقيَّد في سجل التدقيق.
    const targetShift = (shiftsHistory || []).find(s => s.id === shiftId);
    let editReason = String(reason || '').trim();
    if (!editReason) {
      editReason = String(window.prompt(
        'سبب تعديل وردية مغلقة (إلزامي):\n' +
        'سيُحفظ السبب واسمك والقيمة قبل وبعد داخل الوردية وفي سجل التدقيق.',
        ''
      ) || '').trim();
    }
    if (!editReason) {
      alert('⚠️ لم يُنفَّذ التعديل: سبب تعديل الوردية المغلقة إلزامي.');
      return false;
    }

    const changeLines = [];
    if (targetShift) {
      Object.keys(updatedFields || {}).forEach(k => {
        const before = targetShift[k];
        const after = updatedFields[k];
        if (String(before ?? '') !== String(after ?? '')) {
          changeLines.push(`${k}: ${before ?? '—'} ← ${after ?? '—'}`);
        }
      });
    }

    const adjustmentEntry = {
      at: new Date().toISOString(),
      by: currentUser?.id || 'unknown',
      byName: currentUser?.name || 'غير معروف',
      reason: editReason,
      changes: changeLines
    };

    setShiftsHistory(prev => {
      const updated = prev.map(s => {
        if (s.id === shiftId) {
          const merged = { ...s, ...updatedFields };
          // إعادة احتساب الفارق إذا تم تعديل النقدية الفعلية أو المتوقعة
          if (updatedFields.actualCash !== undefined || updatedFields.expectedCash !== undefined) {
            const act = Number(merged.actualCash) || 0;
            const exp = Number(merged.expectedCash) || 0;
            merged.difference = act - exp;
          }
          // نحفظ القيم الأصلية أول مرة فقط حتى تبقى الحقيقة الأولى معروفة
          if (s.originalActualCash === undefined && updatedFields.actualCash !== undefined) {
            merged.originalActualCash = Number(s.actualCash) || 0;
          }
          if (s.originalExpectedCash === undefined && updatedFields.expectedCash !== undefined) {
            merged.originalExpectedCash = Number(s.expectedCash) || 0;
          }
          merged.isAdjusted = true;
          merged.adjustments = [...(Array.isArray(s.adjustments) ? s.adjustments : []), adjustmentEntry];
          merged.updatedAt = adjustmentEntry.at;
          return merged;
        }
        return s;
      });
      localStorage.setItem('naif_pos_v3_shifts_history', JSON.stringify(updated));
      saveAndSync('shifts_history', updated, true);
      return updated;
    });

    logAudit({
      action: 'تعديل وردية مغلقة',
      target: targetShift?.cashierName || shiftId,
      details: `السبب: ${editReason}${changeLines.length ? ' — ' + changeLines.join(' | ') : ''}`,
      severity: 'high'
    });

    broadcastStoreActivity({
      type: 'shift_updated',
      title: 'تعديل تقرير وردية 📝',
      message: `قام مدير النظام (${currentUser?.name}) بتعديل بيانات تقرير الوردية (#${String(shiftId).slice(-6)}).`
    });
    return true;
  };

  // تصفير سجل الورديات التاريخي بالكامل (مدير النظام حصراً)
  const resetShiftsHistory = () => {
    const nowTs = Date.now();
    setShiftsHistory([]);
    localStorage.setItem('naif_pos_v3_shifts_history', '[]');
    localStorage.setItem('naif_pos_v3_shifts_history_reset_at', String(nowTs));
    syncEngine.saveKey('shifts_history', [], true, nowTs, true);
    
    broadcastStoreActivity({
      type: 'shifts_reset',
      title: 'تصفير سجل الورديات 🔄',
      message: `قام مدير النظام (${currentUser?.name}) بتصفير سجل الورديات التاريخي بالكامل.`
    });
    return { success: true, message: 'تم تصفير سجل الورديات التاريخي بالكامل بنجاح 🌸' };
  };

  // تأكيد استلام كاش الوردية من الكاشير وتبرئة ذمته وإدخال المبلغ لخزينة المدير
  const confirmShiftCashHandover = (shiftId, receivedAmount, notes = '') => {
    const isManager = currentUser?.role === 'admin' || checkUserPermission(currentUser, 'treasury_manage') || checkUserPermission(currentUser, 'drawer_manage');
    if (!isManager) {
      alert('⛔ عذراً، تأكيد استلام كاش الوردية وتبرئة ذمة الكاشير مقتصر حصراً على مدير المتجر أو المسؤول المعتمد!');
      return { success: false, message: 'صلاحيات غير كافية' };
    }

    const targetShift = (shiftsHistory || []).find(s => s.id === shiftId);
    if (!targetShift) {
      alert('⚠️ لم يتم العثور على سجل الوردية المطلوب!');
      return { success: false, message: 'الوردية غير موجودة' };
    }

    const numReceived = Number(receivedAmount !== undefined && receivedAmount !== null ? receivedAmount : (targetShift.handoverAmount ?? targetShift.actualCash ?? 0)) || 0;
    const receivedDate = new Date().toISOString();

    logAudit({
      action: 'استلام عهدة وردية وتبرئة الذمة',
      target: targetShift.cashierName || targetShift.userId || shiftId,
      details: `جرد الكاشير: ${Number(targetShift.actualCash) || 0}${notes ? ' — ' + notes : ''}`,
      amount: numReceived,
      severity: 'high'
    });
    const managerName = currentUser?.name || 'مدير المتجر';
    const managerId = currentUser?.id || 'admin';
    const voucherNo = `REC-SH-${Date.now().toString().slice(-6)}`;

    // 1. تحديث حالة تسليم الوردية في shiftsHistory
    // نفس الخلل: القائمة كانت تُبنى داخل دالة تحديث مؤجَّلة، فيُحفظ فارغاً
    // ولا يُسجَّل استلام العهدة في السحابة رغم ظهور رسالة النجاح.
    const updatedShifts = (shiftsHistory || []).map(s => {
      if (s.id === shiftId) {
        return {
          ...s,
          handoverStatus: 'received',
          handoverReceivedAmount: numReceived,
          handoverReceivedBy: managerName,
          handoverReceivedById: managerId,
          handoverReceivedAt: receivedDate,
          handoverVoucherNo: voucherNo,
          handoverNotes: notes || s.handoverNotes || '',
          updatedAt: receivedDate
        };
      }
      return s;
    });
    setShiftsHistory(updatedShifts);
    try {
      localStorage.setItem('naif_pos_v3_shifts_history', JSON.stringify(updatedShifts));
    } catch (e) {}
    saveAndSync('shifts_history', updatedShifts, true);

    // 2. تسجيل قيد استلام نقدية في دفتر أستاذ الخزينة (عهدة الإدارة)
    const ledgerEntry = {
      id: `tled-handover-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: 'shift_handover',
      title: `استلام كاش وردية: ${targetShift.cashierName || 'كاشير'}`,
      amount: numReceived, // مبلغ موجب يدخل لخزينة الإدارة
      shiftId: targetShift.id,
      shiftNumber: targetShift.id,
      cashierName: targetShift.cashierName || 'كاشير',
      cashierId: targetShift.cashierId || targetShift.userId,
      user: managerName,
      userId: managerId,
      date: receivedDate,
      voucherNo: voucherNo,
      notes: notes || `استلام كاش الوردية وتبرئة ذمة الكاشير (${targetShift.cashierName || 'الكاشير'})`
    };

    setTreasuryLedger(lPrev => {
      const next = [ledgerEntry, ...(lPrev || [])];
      localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(next));
      saveAndSync('treasury_ledger', next, true);
      return next;
    });

    broadcastStoreActivity({
      type: 'shift_cash_received',
      title: 'استلام نقدية وردية 🤝',
      message: `استلم المدير (${managerName}) كاش وردية الكاشير (${targetShift.cashierName}) بقيمة ${formatMoney(numReceived, storeInfo?.currency || 'ر.س')}`,
      amount: numReceived
    });

    return { success: true, entry: ledgerEntry };
  };

  // =====================================================================
  //  تغذية درج كاشير من خزينة المدير أو من البنك — قيد مزدوج
  // =====================================================================
  //  المدير يزيد عهدة كاشير معيّن، ويحدد مصدر الزيادة. الأثر مزدوج دائماً:
  //    مدين  : درج الكاشير (cashIn +)
  //    دائن  : كاش خزينة المدير (قيد بمبلغ سالب) أو الحساب البنكي
  //  الشروط: صلاحية إدارة الخزينة، ووردية المستلم مفتوحة، ورصيد المصدر كافٍ.
  const fundCashierDrawer = ({ cashierUserId, amount, source = 'manager_cash', notes = '' }) => {
    const isManager = currentUser?.role === 'admin'
      || checkUserPermission(currentUser, 'treasury_manage')
      || checkUserPermission(currentUser, 'drawer_manage');
    if (!isManager) {
      alert('⛔ تغذية درج الكاشير مقتصرة على مدير المتجر أو المسؤول المعتمد!');
      return { success: false, message: 'صلاحيات غير كافية' };
    }

    const numAmount = Number(amount) || 0;
    if (numAmount <= 0) {
      alert('⚠️ أدخل مبلغاً أكبر من صفر.');
      return { success: false, message: 'مبلغ غير صالح' };
    }

    // =================================================================
    //  وردية المستلم مغلقة؟ تُسجَّل كعهدة مُسلّمة بانتظار فتح الوردية
    // =================================================================
    //  المدير يجهّز الفكة قبل أن يأتي الكاشير عادةً، لا بعده. فاشتراط
    //  وردية مفتوحة كان يقلب الترتيب الطبيعي. الآن: المال يخرج من المصدر
    //  فوراً (فتبقى الخزينة مضبوطة)، وينتظر باسم الكاشير كعهدة، ثم يصير
    //  رصيده الافتتاحي حتماً عند فتح ورديته.
    const targetShift = (userShifts || {})[cashierUserId];
    const isTargetOpen = Boolean(
      targetShift && targetShift.isOpen === true && !targetShift.closedAt && targetShift.status !== 'closed'
    );

    const summary = getTreasurySummary();
    const isBank = source === 'bank';
    const available = isBank
      ? (Number(summary?.netBankBalance) || 0)
      : (Number(summary?.managerVaultCash) || 0);
    if (numAmount > available + 0.005) {
      alert(`⚠️ الرصيد المتاح في ${isBank ? 'الحساب البنكي' : 'كاش خزينة المدير'} هو ${formatMoney(available, storeInfo?.currency || 'ر.س')} فقط، والمطلوب ${formatMoney(numAmount, storeInfo?.currency || 'ر.س')}.`);
      return { success: false, message: 'رصيد المصدر غير كافٍ' };
    }

    const nowIso = new Date().toISOString();
    const voucherNo = `FUND-${Date.now().toString().slice(-6)}`;
    const managerName = currentUser?.name || 'مدير المتجر';
    const managerId = currentUser?.id || 'admin';
    const cashierName = (targetShift && targetShift.cashierName)
      || (Array.isArray(users) ? (users.find(u => u && u.id === cashierUserId)?.name) : null)
      || 'كاشير';
    const sourceLabel = isBank ? 'الحساب البنكي' : 'كاش خزينة المدير';

    // 1. وردية مفتوحة: يدخل الدرج فوراً. مغلقة: ينتظر كعهدة ولا يمس أي وردية.
    if (isTargetOpen) {
      const fundedShift = {
        ...targetShift,
        cashIn: (Number(targetShift.cashIn) || 0) + numAmount,
        updatedAt: nowIso
      };
      const nextShifts = { ...(userShifts || {}), [cashierUserId]: fundedShift };
      setUserShifts(nextShifts);
      try { localStorage.setItem('naif_pos_v3_user_shifts', JSON.stringify(nextShifts)); } catch (e) {}
      saveAndSync('user_shifts', nextShifts, true);
      if ((currentUser?.id || 'admin') === cashierUserId) {
        activeShiftRef.current = fundedShift;
        setActiveShift(fundedShift);
        try { localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(fundedShift)); } catch (e) {}
      }
    }

    // 2. حركة إيداع في درج الكاشير
    const tx = {
      id: `dtx-fund-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      shiftId: isTargetOpen ? (targetShift.id || null) : null,
      userId: cashierUserId,
      user: cashierName,
      type: 'in',
      subType: 'drawer_funding',
      fundingSource: source,
      // 'delivered' = دخلت الدرج فوراً | 'pending' = عهدة تنتظر فتح الوردية
      status: isTargetOpen ? 'delivered' : 'pending',
      amount: numAmount,
      reason: isTargetOpen
        ? `تغذية درج من ${sourceLabel}`
        : `عهدة مُسلّمة بانتظار فتح الوردية — من ${sourceLabel}`,
      notes: notes || '',
      voucherNo,
      date: nowIso,
      updatedAt: nowIso,
      by: managerName,
      byId: managerId
    };
    const updatedTxList = [tx, ...(drawerTransactions || [])];
    setDrawerTransactions(updatedTxList);
    try { localStorage.setItem('naif_pos_v3_drawer_tx', JSON.stringify(updatedTxList)); } catch (e) {}
    saveAndSync('drawer_tx', updatedTxList, true);

    // 3. الطرف الدائن في دفتر الخزينة
    const entry = {
      id: `tled-fund-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: 'drawer_funding',
      fundingSource: source,
      title: `تغذية درج الكاشير (${cashierName}) من ${sourceLabel}`,
      // كاش المدير: مبلغ سالب يخصم من الخزينة. البنك: لا يمس الخزينة،
      // ويُخصم من رصيد البنك عبر bankAmount في ملخص الخزينة.
      amount: isBank ? 0 : -numAmount,
      bankAmount: isBank ? numAmount : 0,
      fundedAmount: numAmount,
      cashierName,
      cashierId: cashierUserId,
      shiftId: isTargetOpen ? (targetShift.id || null) : null,
      floatStatus: isTargetOpen ? 'delivered' : 'pending',
      drawerTxId: tx.id,
      voucherNo,
      user: managerName,
      userId: managerId,
      date: nowIso,
      notes: notes || `تغذية درج الكاشير (${cashierName}) بمبلغ ${formatMoney(numAmount, storeInfo?.currency || 'ر.س')} من ${sourceLabel}`
    };
    const nextLedger = [entry, ...(treasuryLedger || [])];
    setTreasuryLedger(nextLedger);
    try { localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(nextLedger)); } catch (e) {}
    saveAndSync('treasury_ledger', nextLedger, true);

    logAudit({
      action: isTargetOpen ? 'تغذية درج كاشير' : 'تسليم عهدة بانتظار فتح وردية',
      target: cashierName,
      details: `المصدر: ${sourceLabel}${notes ? ' — ' + notes : ''}`,
      amount: numAmount,
      severity: 'high'
    });

    broadcastStoreActivity({
      type: 'drawer_funding',
      title: isTargetOpen ? 'تغذية درج كاشير 💵' : 'تسليم عهدة كاشير 🤝',
      message: isTargetOpen
        ? `أضاف (${managerName}) مبلغ ${formatMoney(numAmount, storeInfo?.currency || 'ر.س')} إلى درج الكاشير (${cashierName}) من ${sourceLabel}`
        : `سلّم (${managerName}) عهدة ${formatMoney(numAmount, storeInfo?.currency || 'ر.س')} للكاشير (${cashierName}) من ${sourceLabel} — تُضاف كرصيد افتتاحي عند فتح ورديته`,
      amount: numAmount
    });

    return {
      success: true,
      voucherNo,
      entry,
      tx,
      cashierName,
      managerName,
      sourceLabel,
      fundingSource: source,
      isPendingFloat: !isTargetOpen,
      shiftId: isTargetOpen ? (targetShift.id || null) : null,
      amount: numAmount,
      notes: notes || '',
      date: nowIso
    };
  };

  // تسجيل ترحيل وإيداع نقدي بالحساب البنكي وخصمه من كاش المدير
  const depositCashToBank = ({ amount, bankName = 'الراجحي', depositSlipNumber = '', notes = '', receiptImage = null }) => {
    const isManager = currentUser?.role === 'admin' || checkUserPermission(currentUser, 'treasury_manage') || checkUserPermission(currentUser, 'drawer_manage');
    if (!isManager) {
      alert('⛔ عذراً، ترحيل وإيداع المبالغ في الحساب البنكي مقتصر حصراً على مدير المتجر!');
      return { success: false, message: 'صلاحيات غير كافية' };
    }

    const numAmount = Number(amount) || 0;
    if (numAmount <= 0) {
      alert('⚠️ الرجاء إدخال مبلغ صحيح للإيداع البنكي!');
      return { success: false, message: 'المبلغ غير صالح' };
    }

    const depositDate = new Date().toISOString();
    const managerName = currentUser?.name || 'مدير المتجر';
    const managerId = currentUser?.id || 'admin';
    const voucherNo = `BNK-${Date.now().toString().slice(-6)}`;

    // تسجيل حركة إيداع بنكي وخصمها من كاش المدير
    const bankEntry = {
      id: `tled-bank-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: 'bank_deposit',
      title: `إيداع بنكي: ${bankName}`,
      amount: -numAmount, // سالب يخرج من عهدة المدير ويدخل البنك
      depositAmount: numAmount,
      bankName: bankName,
      depositSlipNumber: depositSlipNumber || '',
      receiptImage: receiptImage || null,
      user: managerName,
      userId: managerId,
      date: depositDate,
      voucherNo: voucherNo,
      notes: notes || `إيداع مبيعات نقدية في ${bankName} برقم إيصال ${depositSlipNumber || '-'}`
    };

    setTreasuryLedger(lPrev => {
      const next = [bankEntry, ...(lPrev || [])];
      localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(next));
      saveAndSync('treasury_ledger', next, true);
      return next;
    });

    broadcastStoreActivity({
      type: 'bank_deposit_recorded',
      title: 'إيداع بنكي للمبيعات 🏦',
      message: `تم ترحيل وإيداع ${formatMoney(numAmount, storeInfo?.currency || 'ر.س')} في حساب (${bankName}) برقم إيصال [${depositSlipNumber || '-'}]`,
      amount: numAmount
    });

    return { success: true, entry: bankEntry };
  };

  // تسوية عمليات الشبكة ومدى والفيزا وخصم عمولة البنك وترحيل الصافي للبنك
  const reconcilePosSettlement = ({ 
    methodId = 'card', 
    methodName = '',
    txCount = 0,
    settledRefs = [],   // العمليات التي غطّتها هذه التسوية (ربط كل عملية بما يقابلها)
    grossAmount, 
    commissionAmount = 0, 
    commissionRate = 0, 
    netAmount, 
    bankName = 'مصرف الراجحي', 
    referenceNumber = '', 
    notes = '' 
  }) => {
    // =====================================================================
    //  الفحص قبل القيد — لا العكس
    // =====================================================================
    //  كان قيد التدقيق يُكتب أولاً ثم تُفحص الصلاحية. فمحاولة مرفوضة
    //  تُسجَّل في pos_audit_logs كتسوية شبكة نُفِّذت فعلاً، بمبلغها
    //  وتفاصيلها وبلا أي إشارة إلى أنها رُفضت — فيفقد السجل قيمته كدليل
    //  لأنه يحتوي عمليات لم تحدث.
    // =====================================================================
    const isManager = currentUser?.role === 'admin' || checkUserPermission(currentUser, 'treasury_manage') || checkUserPermission(currentUser, 'drawer_manage');
    if (!isManager) {
      alert('⛔ عذراً، تسوية عمليات الشبكة مقتصرة حصراً على الإدارة المعتمدة!');
      return { success: false, message: 'صلاحيات غير كافية' };
    }

    logAudit({
      action: 'تسوية شبكة/بطاقة',
      target: methodName || methodId,
      details: `عدد العمليات: ${txCount} — الرسوم والعمولة: ${Number(commissionAmount) || 0}${referenceNumber ? ' — مرجع: ' + referenceNumber : ''}`,
      amount: Number(grossAmount) || 0,
      severity: 'high'
    });

    const numGross = Number(grossAmount) || 0;
    const numCommission = Number(commissionAmount) || 0;
    const numNet = Number(netAmount !== undefined && netAmount !== null ? netAmount : (numGross - numCommission)) || 0;

    if (numGross <= 0) {
      alert('⚠️ الرجاء تحديد مبلغ صحيح لتسوية الشبكة!');
      return { success: false, message: 'المبلغ غير صالح' };
    }

    const recDate = new Date().toISOString();
    const managerName = currentUser?.name || 'مدير المتجر';
    const managerId = currentUser?.id || 'admin';
    const voucherNo = `POS-SET-${Date.now().toString().slice(-6)}`;

    const entry = {
      id: `tled-pos-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: 'pos_settlement',
      title: `تسوية شبكة ${methodName || methodId}: ${bankName}`,
      methodId,
      methodName: methodName || methodId,
      txCount: Number(txCount) || (Array.isArray(settledRefs) ? settledRefs.length : 0),
      settledRefs: Array.isArray(settledRefs) ? settledRefs : [],
      amount: 0, // لا يمس كاش المدير بالخزينة بل يثبت حركة البنك
      grossAmount: numGross,
      commissionAmount: numCommission,
      commissionRate: commissionRate,
      netAmount: numNet,
      bankName,
      depositSlipNumber: referenceNumber || '',
      voucherNo,
      user: managerName,
      userId: managerId,
      date: recDate,
      notes: notes || `تسوية شبكة مبيعات إجمالي ${formatMoney(numGross, storeInfo?.currency || 'ر.س')} بعمولة محسومة ${formatMoney(numCommission, storeInfo?.currency || 'ر.س')} وصافي مودع بالبنك ${formatMoney(numNet, storeInfo?.currency || 'ر.س')}`
    };

    setTreasuryLedger(lPrev => {
      const next = [entry, ...(lPrev || [])];
      localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(next));
      saveAndSync('treasury_ledger', next, true);
      return next;
    });

    broadcastStoreActivity({
      type: 'pos_settlement_recorded',
      title: 'تسوية شبكة POS بالبنك 💳',
      message: `تم تسوية مبيعات شبكة بقيمة ${formatMoney(numGross, storeInfo?.currency || 'ر.س')} بعمولة ${formatMoney(numCommission, storeInfo?.currency || 'ر.س')} وإيداع صافي ${formatMoney(numNet, storeInfo?.currency || 'ر.س')} في (${bankName})`,
      amount: numNet
    });

    return { success: true, entry };
  };

  // تسوية مستحقات التطبيقات والمواقع الإلكترونية (تمارا / نينجا) وترحيل الصافي للبنك
  const reconcileAppSettlement = ({ 
    appName = 'تمارا', 
    grossAmount, 
    commissionAmount = 0, 
    commissionRate = 0, 
    netAmount, 
    bankName = 'مصرف الراجحي', 
    referenceNumber = '', 
    notes = '' 
  }) => {
    const isManager = currentUser?.role === 'admin' || checkUserPermission(currentUser, 'treasury_manage') || checkUserPermission(currentUser, 'drawer_manage');
    if (!isManager) {
      alert('⛔ عذراً، تسوية المنصات الإلكترونية مقتصرة حصراً على الإدارة!');
      return { success: false, message: 'صلاحيات غير كافية' };
    }

    const numGross = Number(grossAmount) || 0;
    const numCommission = Number(commissionAmount) || 0;
    const numNet = Number(netAmount !== undefined && netAmount !== null ? netAmount : (numGross - numCommission)) || 0;

    if (numGross <= 0) {
      alert('⚠️ الرجاء تحديد مبلغ صحيح لتسوية مستحقات المنصة!');
      return { success: false, message: 'المبلغ غير صالح' };
    }

    const recDate = new Date().toISOString();
    const managerName = currentUser?.name || 'مدير المتجر';
    const managerId = currentUser?.id || 'admin';
    const voucherNo = `APP-SET-${Date.now().toString().slice(-6)}`;

    const entry = {
      id: `tled-app-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: 'app_settlement',
      title: `تسوية مستحقات منصة: ${appName}`,
      appName,
      amount: 0,
      grossAmount: numGross,
      commissionAmount: numCommission,
      commissionRate: commissionRate,
      netAmount: numNet,
      bankName,
      depositSlipNumber: referenceNumber || '',
      voucherNo,
      user: managerName,
      userId: managerId,
      date: recDate,
      notes: notes || `تسوية مبيعات منصة ${appName} إجمالي ${formatMoney(numGross, storeInfo?.currency || 'ر.س')} بعمولة محسومة ${formatMoney(numCommission, storeInfo?.currency || 'ر.س')} وصافي محول للبنك ${formatMoney(numNet, storeInfo?.currency || 'ر.س')}`
    };

    setTreasuryLedger(lPrev => {
      const next = [entry, ...(lPrev || [])];
      localStorage.setItem('naif_pos_v3_treasury_ledger', JSON.stringify(next));
      saveAndSync('treasury_ledger', next, true);
      return next;
    });

    broadcastStoreActivity({
      type: 'app_settlement_recorded',
      title: `تسوية مستحقات ${appName} ⚡`,
      message: `تم تحويل مستحقات ${appName} بقيمة إجمالية ${formatMoney(numGross, storeInfo?.currency || 'ر.س')} بعمولة ${formatMoney(numCommission, storeInfo?.currency || 'ر.س')} وصافي مودع بالبنك ${formatMoney(numNet, storeInfo?.currency || 'ر.س')}`,
      amount: numNet
    });

    return { success: true, entry };
  };

  // ملخص محاسبي فوري لتدفق النقدية والخزينة والبنك بكافة الركائز الـ 7
  const getTreasurySummary = () => {
    const history = Array.isArray(shiftsHistory) ? shiftsHistory : [];
    const ledger = Array.isArray(treasuryLedger) ? treasuryLedger : [];
    const invList = Array.isArray(invoices) ? invoices : [];
    const expList = Array.isArray(expenses) ? expenses : [];
    const custList = Array.isArray(customers) ? customers : [];

    // 1. عهدة الكاشير اليومية (الورديات المغلقة المعلقة + الورديات المفتوحة الجارية بالدرج)
    const pendingShifts = history.filter(s => {
      if (!s) return false;
      const isPending = s.handoverStatus === 'pending' || (!s.handoverStatus && (Number(s.actualCash ?? s.expectedCash ?? 0) > 0));
      return isPending;
    });
    const pendingHandoversTotal = pendingShifts.reduce((sum, s) => sum + (Number(s.handoverAmount ?? s.actualCash ?? s.expectedCash ?? 0) || 0), 0);

    const activeOpenShiftsList = Object.values(userShifts || {}).filter(s => s && s.isOpen === true);
    const openShiftsCashTotal = activeOpenShiftsList.reduce((sum, s) => {
      const startCash = Number(s.startCash) || 0;
      const cashSales = Number(s.cashSales) || 0;
      const cashIn = Number(s.cashIn) || 0;
      const cashOut = Number(s.cashOut) || 0;
      const drawerExpenses = Number(s.drawerExpenses) || 0;
      return sum + Math.max(0, startCash + cashSales + cashIn - cashOut - drawerExpenses);
    }, 0);

    const cashierTotalCash = pendingHandoversTotal + openShiftsCashTotal;
    const totalActiveCashiersCount = pendingShifts.length + activeOpenShiftsList.length;

    // 2. عهدة كاش المدير المتاحة بالخزينة (المستلم من الكاشيرات + سندات قبض الديون الموردة للخزينة - المصروفات من الخزينة - المودع كاش بالبنك)
    const totalReceivedHandovers = ledger
      .filter(entry => entry.type === 'shift_handover' || entry.type === 'treasury_drop' || entry.type === 'customer_debt_collection')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const totalManagerExpenses = ledger
      .filter(entry => entry.type === 'manager_expense' && !entry.isIncome)
      .reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0);

    const totalCashBankDeposits = ledger
      .filter(entry => entry.type === 'bank_deposit')
      .reduce((sum, e) => sum + (Number(e.depositAmount ?? Math.abs(e.amount)) || 0), 0);

    const managerVaultCash = ledger.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // 3. معاملات شبكة مدى وفيزا (POS) والتطبيقات والتحويل البنكي المباشر (ديناميكياً لجميع طرق الدفع)
    let posGrossSales = 0;
    let appsGrossSales = 0;
    let directBankTransfers = 0;

    const configuredMethods = storeInfo?.paymentMethods;

    // فصل مبيعات كل شبكة على حدة (مدى غير فيزا غير أي وسيلة أخرى)
    // لأن لكل وسيلة نسبة عمولة مختلفة وتسوية بنكية مستقلة.
    const posByMethod = {};
    // كل عملية شبكة تُسجَّل كسجل مستقل (رقم الفاتورة/السند + المبلغ + التاريخ)
    // حتى تُربط لاحقاً بالتسوية التي غطّتها، فلا تُحسب مرتين ولا تضيع.
    const addPosMethod = (res, amt, ref = {}) => {
      const id = res?.id || 'card';
      if (!posByMethod[id]) {
        posByMethod[id] = { id, name: res?.name || id, gross: 0, count: 0, txs: [] };
      }
      posByMethod[id].gross += amt;
      posByMethod[id].count += 1;
      posByMethod[id].txs.push({
        txId: ref.txId || `${ref.docId || 'tx'}-${id}`,
        docId: ref.docId || '',
        label: ref.label || '',
        date: ref.date || '',
        amount: amt
      });
    };

    invList.forEach(inv => {
      if (inv.status === 'refunded') return;
      if (inv.splitPayments && Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) {
        inv.splitPayments.forEach(sp => {
          const amt = Number(sp.amount) || 0;
          const res = resolvePaymentMethod(sp.methodId || sp.methodType || sp, configuredMethods);
          const rName = String(res.name || '').toLowerCase();
          const isAppPlatform = res.type === 'tamara' || ['tamara', 'ninja', 'tabby'].includes(res.id) || rName.includes('تمارا') || rName.includes('نينجا') || rName.includes('تابي') || rName.includes('تطبيق') || rName.includes('منصة');
          const isTransfer = res.id === 'transfer' || res.id === 'bank' || rName.includes('تحويل') || rName.includes('بنك') || (res.type === 'online' && !isAppPlatform);
          const isPosCard = res.type === 'card' || ['card', 'visa', 'mada'].includes(res.id) || rName.includes('فيزا') || rName.includes('مدى') || rName.includes('شبك');

          if (isAppPlatform) appsGrossSales += amt;
          else if (isTransfer) directBankTransfers += amt;
          else if (isPosCard) { posGrossSales += amt; addPosMethod(res, amt, { txId: `${inv.id}-${res?.id || 'card'}`, docId: inv.id, label: inv.invoiceNumber || inv.id, date: inv.date }); }
        });
      } else if (inv.paymentMethod === 'split') {
        if (Number(inv.splitCard) > 0) { posGrossSales += Number(inv.splitCard); addPosMethod({ id: 'card', name: 'شبكة' }, Number(inv.splitCard), { txId: `${inv.id}-card`, docId: inv.id, label: inv.invoiceNumber || inv.id, date: inv.date }); }
        if (Number(inv.splitTransfer) > 0) directBankTransfers += Number(inv.splitTransfer);
      } else {
        const tot = Number(inv.total) || 0;
        const res = resolvePaymentMethod(inv.paymentMethod || inv, configuredMethods);
        const rName = String(res.name || '').toLowerCase();
        const isAppPlatform = res.type === 'tamara' || ['tamara', 'ninja', 'tabby'].includes(res.id) || rName.includes('تمارا') || rName.includes('نينجا') || rName.includes('تابي') || rName.includes('تطبيق') || rName.includes('منصة');
        const isTransfer = res.id === 'transfer' || res.id === 'bank' || rName.includes('تحويل') || rName.includes('بنك') || (res.type === 'online' && !isAppPlatform);
        const isPosCard = res.type === 'card' || ['card', 'visa', 'mada'].includes(res.id) || rName.includes('فيزا') || rName.includes('مدى') || rName.includes('شبك');

        if (isAppPlatform) appsGrossSales += tot;
        else if (isTransfer) directBankTransfers += tot;
        else if (isPosCard) { posGrossSales += tot; addPosMethod(res, tot, { txId: `${inv.id}-${res?.id || 'card'}`, docId: inv.id, label: inv.invoiceNumber || inv.id, date: inv.date }); }
      }
    });

    // سندات القبض المحولة للبنك أو الشبكة أو التطبيقات
    (paymentReceipts || []).forEach(rcpt => {
      const amt = Number(rcpt.amount) || 0;
      const res = resolvePaymentMethod(rcpt.method || rcpt.paymentMethod, configuredMethods);
      const rName = String(res.name || '').toLowerCase();
      const isAppPlatform = res.type === 'tamara' || ['tamara', 'ninja', 'tabby'].includes(res.id) || rName.includes('تمارا') || rName.includes('نينجا') || rName.includes('تابي');
      const isTransfer = res.id === 'transfer' || res.id === 'bank' || rName.includes('تحويل') || rName.includes('بنك') || (res.type === 'online' && !isAppPlatform);
      const isPosCard = res.type === 'card' || ['card', 'visa', 'mada'].includes(res.id) || rName.includes('فيزا') || rName.includes('مدى') || rName.includes('شبك');

      if (isAppPlatform) appsGrossSales += amt;
      else if (isTransfer) directBankTransfers += amt;
      else if (isPosCard) { posGrossSales += amt; addPosMethod(res, amt, { txId: `${rcpt.id}-${res?.id || 'card'}`, docId: rcpt.id, label: rcpt.receiptNumber || rcpt.id, date: rcpt.date }); }
    });

    const posSettledEntries = ledger.filter(e => e.type === 'pos_settlement');
    const posSettledGross = posSettledEntries.reduce((s, e) => s + (Number(e.grossAmount) || 0), 0);
    const posSettledCommissions = posSettledEntries.reduce((s, e) => s + (Number(e.commissionAmount) || 0), 0);
    const posSettledNet = posSettledEntries.reduce((s, e) => s + (Number(e.netAmount) || 0), 0);

    // ما تمّت تسويته لكل شبكة، مع ربط العمليات المسوّاة بمرجعها في السند
    const settledTxIds = new Set();
    posSettledEntries.forEach(e => {
      const id = e.methodId || 'card';
      if (!posByMethod[id]) {
        posByMethod[id] = { id, name: e.methodName || id, gross: 0, count: 0, txs: [] };
      }
      posByMethod[id].settled = (posByMethod[id].settled || 0) + (Number(e.grossAmount) || 0);
      posByMethod[id].commissions = (posByMethod[id].commissions || 0) + (Number(e.commissionAmount) || 0);
      // السندات الجديدة تحمل قائمة العمليات التي غطّتها
      if (Array.isArray(e.settledRefs) && e.settledRefs.length > 0) {
        e.settledRefs.forEach(r => { if (r?.txId) settledTxIds.add(r.txId); });
      } else {
        // سندات قديمة بلا ربط: نطرح مبلغها فقط (توافقية للخلف)
        posByMethod[id].legacySettled = (posByMethod[id].legacySettled || 0) + (Number(e.grossAmount) || 0);
      }
    });

    const posMethodsBreakdown = Object.values(posByMethod).map(m => {
      const allTxs = Array.isArray(m.txs) ? m.txs : [];
      // العمليات التي لم تُربط بأي تسوية بعد، الأقدم أولاً
      let pendingTxs = allTxs
        .filter(t => !settledTxIds.has(t.txId))
        .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

      // خصم مبالغ السندات القديمة غير المربوطة من أقدم العمليات
      let legacy = Number(m.legacySettled) || 0;
      if (legacy > 0) {
        const remaining = [];
        pendingTxs.forEach(t => {
          if (legacy >= t.amount - 0.001) { legacy -= t.amount; }
          else remaining.push(t);
        });
        pendingTxs = remaining;
      }

      const pending = pendingTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      return {
        ...m,
        txs: allTxs,
        pendingTxs,
        settled: Number(m.settled) || 0,
        commissions: Number(m.commissions) || 0,
        pending: Number(pending.toFixed(2)),
        pendingCount: pendingTxs.length
      };
    }).sort((a, b) => b.pending - a.pending);
    const posPendingGross = Math.max(0, posGrossSales - posSettledGross);
    // تقدير العمولة بنسبة كل شبكة وعمولتها الثابتة من الإعدادات (بدل نسبة ثابتة للجميع)
    const posEstimatedCommission = Number(posMethodsBreakdown.reduce((sum, m) => {
      const cfg = (configuredMethods || []).find(x => x && x.id === m.id) || {};
      const rate = Number(cfg.commissionRate) || 0;
      const fixed = Number(cfg.commissionFixed) || 0;
      return sum + (m.pending * rate / 100) + (m.pendingCount * fixed);
    }, 0).toFixed(2));
    const posEstimatedNet = Math.max(0, posPendingGross - posEstimatedCommission);

    // 4. معاملات التطبيقات والمنصات (تمارا / نينجا)
    const appSettledEntries = ledger.filter(e => e.type === 'app_settlement');
    const appsSettledGross = appSettledEntries.reduce((s, e) => s + (Number(e.grossAmount) || 0), 0);
    const appsSettledCommissions = appSettledEntries.reduce((s, e) => s + (Number(e.commissionAmount) || 0), 0);
    const appsSettledNet = appSettledEntries.reduce((s, e) => s + (Number(e.netAmount) || 0), 0);
    const appsPendingGross = Math.max(0, appsGrossSales - appsSettledGross);
    const appsEstimatedCommission = Number((appsPendingGross * 0.05).toFixed(2));
    const appsEstimatedNet = Math.max(0, appsPendingGross - appsEstimatedCommission);

    // 5. الآجل (ذمم وديون العملاء)
    const totalCustomerDebt = custList.reduce((sum, c) => sum + (Number(c.balance) || 0), 0);

    // 6. المصروفات البنكية (المسددة شبكة أو تحويل)
    const isBankExpenseRecord = (e) => (
      e.paymentSource === 'bank' || e.paymentMethod === 'bank' || e.paymentMethod === 'transfer' || e.paymentMethod === 'card'
    );
    const bankExpensesTotal = expList
      .filter(e => !e.isIncome && isBankExpenseRecord(e))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    // الإيراد المسجَّل على الحساب البنكي كان لا يُحسب في أي مكان إطلاقاً،
    // فيختفي المبلغ ولا يزيد رصيد البنك. الآن يُضاف كما يُطرح المصروف.
    const bankIncomesTotal = expList
      .filter(e => e.isIncome && isBankExpenseRecord(e))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // 6.أ عهد مُسلّمة خرجت من المصدر ولم تدخل أي وردية بعد
    const pendingFloatsTotal = (drawerTransactions || [])
      .filter(t => t && t.subType === 'drawer_funding' && t.status === 'pending')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    // 6.ب تغذية دروج الكاشيرات المسحوبة من الحساب البنكي
    const drawerFundingFromBank = ledger
      .filter(e => e.type === 'drawer_funding' && e.fundingSource === 'bank')
      .reduce((sum, e) => sum + (Number(e.bankAmount ?? e.fundedAmount) || 0), 0);
    const drawerFundingFromVault = ledger
      .filter(e => e.type === 'drawer_funding' && e.fundingSource !== 'bank')
      .reduce((sum, e) => sum + (Number(e.fundedAmount ?? Math.abs(e.amount)) || 0), 0);

    // 7. صافي رصيد الحساب البنكي المعتمد
    const netBankBalance = totalCashBankDeposits + directBankTransfers + posSettledNet + appsSettledNet + bankIncomesTotal - bankExpensesTotal - drawerFundingFromBank;
    const totalExpectedBank = netBankBalance + posEstimatedNet + appsEstimatedNet;

    return {
      pendingFloatsTotal,
      bankIncomesTotal,
      bankExpensesTotal,
      drawerFundingFromBank,
      drawerFundingFromVault,
      // 1. الكاشيرات
      pendingShifts,
      pendingHandoversTotal,
      openShiftsCashTotal,
      cashierTotalCash,
      totalActiveCashiersCount,
      activeOpenShiftsList,
      // 2. كاش المدير
      totalReceivedHandovers,
      totalManagerExpenses,
      totalBankDeposits: totalCashBankDeposits,
      managerVaultCash: Math.max(0, managerVaultCash),
      netManagerVaultCash: managerVaultCash,
      // 3. شبكة ومدى
      posGrossSales,
      posPendingGross,
      posMethodsBreakdown,   // تفصيل مبيعات كل شبكة (مدى/فيزا/...) والمعلّق منها
      posSettledGross,
      posSettledCommissions,
      posSettledNet,
      posEstimatedCommission,
      posEstimatedNet,
      // 4. تطبيقات
      appsGrossSales,
      appsPendingGross,
      appsSettledGross,
      appsSettledCommissions,
      appsSettledNet,
      appsEstimatedCommission,
      appsEstimatedNet,
      // 5. آجل
      totalCustomerDebt,
      // 6. تحويل مباشر
      directBankTransfers,
      // 7. صافي البنك
      netBankBalance,
      totalExpectedBank,
      ledger
    };
  };

  // تحديث إعدادات المحل وخيارات العرض مع الحفظ الفوري
  const updateStoreInfo = (data) => {
    setStoreInfo(prev => {
      const updated = sanitizeStoreInfo({ ...prev, ...data });
      try {
        localStorage.setItem('naif_pos_v3_store_info', JSON.stringify(updated));
        if (hasInitializedRef.current) {
          syncEngine.saveKey('store_info', updated);
        }
      } catch (e) {
        console.error('Error saving store_info:', e);
      }
      return updated;
    });
  };

  // تصدير واستيراد النسخة الاحتياطية
  const exportBackup = () => {
    const fullData = {
      storeInfo,
      categories,
      products,
      customers,
      suppliers,
      users,
      invoices,
      purchases,
      expenses,
      paymentReceipts,
      drawerTransactions,
      shiftsHistory,
      userShifts,
      heldBills,
      spoilageLogs,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pos_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // =========================================================================
  //  نسخة احتياطية سحابية تلقائية (كل ٢٤ ساعة)
  // =========================================================================
  //  exportBackup ينزّل ملفاً ويحتاج إنساناً أمام الشاشة يتذكّر الضغط، فالنسخ
  //  كان معلّقاً على الانتباه البشري. ومحرّك المزامنة فيه saveBackup يرفع إلى
  //  pos_backups لكنه لم يكن مستدعى من أي مكان في البرنامج إطلاقاً.
  //  هنا نربطه: لقطة كاملة تُرفع تلقائياً مرة كل ٢٤ ساعة.
  //
  //  لماذا من جهاز المدير فقط: قواعد pos_backups تسمح بالكتابة للمدير وحده،
  //  فالمحاولة من جهاز كاشير تُرفض بـ permission-denied وتملأ السجل ضجيجاً.
  //
  //  حد الحجم: مستند Firestore سقفه ١ ميجابايت. نتوقف قبله بهامش ونُنبّه،
  //  لأن فشلاً صامتاً هنا يعني أن المتجر بلا نسخة وهو يظن أنه محمي.
  // =========================================================================
  const AUTO_BACKUP_EVERY_MS = 24 * 60 * 60 * 1000;
  const AUTO_BACKUP_MAX_BYTES = 800 * 1024;
  const AUTO_BACKUP_STAMP_KEY = 'naif_pos_v3_last_auto_cloud_backup';

  const runAutoCloudBackup = async (source = 'auto') => {
    const payload = {
      storeInfo, categories, products, customers, suppliers, users,
      invoices, purchases, expenses, paymentReceipts,
      drawerTransactions, shiftsHistory, userShifts, heldBills,
      spoilageLogs,
      exportedAt: new Date().toISOString()
    };
    const strData = JSON.stringify(payload);

    if (strData.length > AUTO_BACKUP_MAX_BYTES) {
      console.warn('[Backup] النسخة أكبر من حد المستند — لم تُرفع تلقائياً. نزّل نسخة يدوية وأرشِف الفواتير القديمة.');
      return { success: false, tooLarge: true };
    }

    const res = await syncEngine.saveBackup({
      id: 'bkp-' + Date.now(),
      date: new Date().toISOString(),
      source,
      size: (strData.length / 1024).toFixed(1) + ' KB',
      invoicesCount: (invoices || []).length,
      productsCount: (products || []).length,
      customersCount: (customers || []).length,
      data: strData
    });

    if (res?.success) {
      try { localStorage.setItem(AUTO_BACKUP_STAMP_KEY, String(Date.now())); } catch (e) {}
    }
    return res;
  };

  const autoBackupRanRef = useRef(false);
  const autoBackupTimerRef = useRef(null);

  // مرجع متجدّد: المؤقّت يستدعي أحدث نسخة من الدالة فيلتقط بيانات مكتملة
  // لحظة الرفع، لا اللقطة التي كانت وقت جدولته
  const runAutoCloudBackupRef = useRef(() => {});
  runAutoCloudBackupRef.current = runAutoCloudBackup;

  // =======================================================================
  //  لماذا لا يُلغى المؤقّت عند إعادة التصيير
  // =======================================================================
  //  الخلل الذي كان هنا جعل الميزة لا تعمل ولا مرة: العلم يُرفع قبل أن
  //  يعمل المؤقّت، والتنظيف كان يُلغي المؤقّت في كل إعادة تصيير، و products
  //  ضمن مصفوفة الاعتماد وهي تتغيّر مع كل نبضة مزامنة وكل بيع. فأي تغيّر
  //  خلال الخمس عشرة ثانية يُلغي المؤقّت، ثم يخرج المؤثّر فوراً لأن العلم
  //  مرفوع — فلا يُعاد جدولته أبداً. والنتيجة: متجر يظن أنه محمي وهو بلا
  //  أي نسخة. لذلك نحفظ المؤقّت في مرجع ولا نُلغيه إلا عند إزالة المزوّد.
  // =======================================================================
  useEffect(() => {
    if (autoBackupRanRef.current) return;
    if (storeInfo?.autoCloudBackupEnabled === false) return;
    if (getRoleByEmail(firebaseUser?.email)?.role !== 'admin') return;
    if (!Array.isArray(products) || products.length === 0) return;   // لم تُحمَّل البيانات بعد

    let last = 0;
    try { last = Number(localStorage.getItem(AUTO_BACKUP_STAMP_KEY)) || 0; } catch (e) {}
    if (Date.now() - last < AUTO_BACKUP_EVERY_MS) return;

    autoBackupRanRef.current = true;
    // تأخير بسيط حتى تستقر أول مزامنة فلا تُرفع لقطة ناقصة
    autoBackupTimerRef.current = setTimeout(() => {
      autoBackupTimerRef.current = null;
      // فحص أخير قبل الرفع: قد يكون تبويب/جهاز آخر رفع نسخة خلال الانتظار،
      // فلا نُضاعف المستندات بلا فائدة (الختم مشترك على مستوى المتصفّح)
      let lastNow = 0;
      try { lastNow = Number(localStorage.getItem(AUTO_BACKUP_STAMP_KEY)) || 0; } catch (e) {}
      if (Date.now() - lastNow < AUTO_BACKUP_EVERY_MS) return;

      runAutoCloudBackupRef.current('auto').then(r => {
        if (r?.success) console.log('[Backup] ✅ رُفعت نسخة احتياطية سحابية تلقائية');
        // فشل الرفع لا يكتب ختماً، فتُعاد المحاولة عند الإقلاع القادم
        else console.warn('[Backup] ✖ لم تُرفع النسخة التلقائية:', r);
      }).catch(e => console.warn('[Backup] ✖ خطأ في النسخة التلقائية:', e));
    }, 15000);
  }, [firebaseUser, products, storeInfo?.autoCloudBackupEnabled]);

  // التنظيف عند إزالة المزوّد فقط — لا عند كل إعادة تصيير
  useEffect(() => () => {
    if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current);
  }, []);

  const importBackup = (jsonContent, options = { mode: 'replace' }) => {
    try {
      const data = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
      if (!data || typeof data !== 'object') {
        return { success: false, message: 'ملف النسخة الاحتياطية فارغ أو غير صالح' };
      }

      const isMerge = options?.mode === 'merge';

      // 1. تحديث storeInfo
      if (data.storeInfo) {
        const nextStore = isMerge ? { ...storeInfo, ...data.storeInfo } : data.storeInfo;
        setStoreInfo(nextStore);
        localStorage.setItem('naif_pos_v3_store_info', JSON.stringify(nextStore));
        syncEngine.saveKey('store_info', nextStore, true);
      }

      // 2. تحديث categories
      if (Array.isArray(data.categories)) {
        let nextCat = data.categories;
        if (isMerge) {
          const existingIds = new Set(categories.map(c => c.id));
          const toAdd = data.categories.filter(c => !existingIds.has(c.id));
          nextCat = [...categories, ...toAdd];
        }
        setCategories(nextCat);
        localStorage.setItem('naif_pos_v3_categories', JSON.stringify(nextCat));
        syncEngine.saveKey('categories', nextCat, true);
      }

      // 3. تحديث products
      if (Array.isArray(data.products)) {
        let nextProd = data.products;
        if (isMerge) {
          const existingIds = new Set(products.map(p => p.id));
          const toAdd = data.products.filter(p => !existingIds.has(p.id));
          nextProd = [...products, ...toAdd];
        }
        setProducts(nextProd);
        localStorage.setItem('naif_pos_v3_products', JSON.stringify(nextProd));
        syncEngine.saveKey('products', nextProd, true);
      }

      // 4. تحديث customers
      if (Array.isArray(data.customers)) {
        let nextCust = data.customers;
        if (isMerge) {
          const existingIds = new Set(customers.map(c => c.id));
          const toAdd = data.customers.filter(c => !existingIds.has(c.id));
          nextCust = [...customers, ...toAdd];
        }
        setCustomers(nextCust);
        localStorage.setItem('naif_pos_v3_customers', JSON.stringify(nextCust));
        syncEngine.saveKey('customers', nextCust, true);
      }

      // 5. تحديث suppliers
      if (Array.isArray(data.suppliers)) {
        let nextSup = data.suppliers;
        if (isMerge) {
          const existingIds = new Set(suppliers.map(s => s.id));
          const toAdd = data.suppliers.filter(s => !existingIds.has(s.id));
          nextSup = [...suppliers, ...toAdd];
        }
        setSuppliers(nextSup);
        localStorage.setItem('naif_pos_v3_suppliers', JSON.stringify(nextSup));
        syncEngine.saveKey('suppliers', nextSup, true);
      }

      // 6. تحديث invoices
      if (Array.isArray(data.invoices)) {
        let nextInv = data.invoices;
        if (isMerge) {
          const existingIds = new Set(invoices.map(i => i.id));
          const toAdd = data.invoices.filter(i => !existingIds.has(i.id));
          nextInv = [...toAdd, ...invoices];
        }
        setInvoices(nextInv);
        localStorage.setItem('naif_pos_v3_invoices', JSON.stringify(nextInv));
        syncEngine.saveKey('invoices', nextInv, true);
      }

      // 7. تحديث purchases
      if (Array.isArray(data.purchases)) {
        let nextPur = data.purchases;
        if (isMerge) {
          const existingIds = new Set(purchases.map(p => p.id));
          const toAdd = data.purchases.filter(p => !existingIds.has(p.id));
          nextPur = [...toAdd, ...purchases];
        }
        setPurchases(nextPur);
        localStorage.setItem('naif_pos_v3_purchases', JSON.stringify(nextPur));
        syncEngine.saveKey('purchases', nextPur, true);
      }

      // 8. تحديث expenses
      if (Array.isArray(data.expenses)) {
        let nextExp = data.expenses;
        if (isMerge) {
          const existingIds = new Set(expenses.map(e => e.id));
          const toAdd = data.expenses.filter(e => !existingIds.has(e.id));
          nextExp = [...toAdd, ...expenses];
        }
        setExpenses(nextExp);
        localStorage.setItem('naif_pos_v3_expenses', JSON.stringify(nextExp));
        syncEngine.saveKey('expenses', nextExp, true);
      }

      // 9. تحديث drawerTransactions
      if (Array.isArray(data.drawerTransactions)) {
        const nextTx = isMerge ? [...data.drawerTransactions, ...drawerTransactions] : data.drawerTransactions;
        setDrawerTransactions(nextTx);
        localStorage.setItem('naif_pos_v3_drawer_tx', JSON.stringify(nextTx));
        syncEngine.saveKey('drawer_tx', nextTx, true);
      }

      // 10. تحديث shiftsHistory
      if (Array.isArray(data.shiftsHistory)) {
        const nextShifts = isMerge ? [...data.shiftsHistory, ...shiftsHistory] : data.shiftsHistory;
        setShiftsHistory(nextShifts);
        localStorage.setItem('naif_pos_v3_shifts_history', JSON.stringify(nextShifts));
        syncEngine.saveKey('shifts_history', nextShifts, true);
      }

      // 11. تحديث users
      if (Array.isArray(data.users) && data.users.length > 0) {
        let nextUsers = data.users;
        if (isMerge) {
          const existingIds = new Set(users.map(u => u.id));
          const toAdd = data.users.filter(u => !existingIds.has(u.id));
          nextUsers = [...users, ...toAdd];
        }
        setUsers(nextUsers);
        localStorage.setItem('naif_pos_v3_users', JSON.stringify(nextUsers));
        syncEngine.saveKey('users', nextUsers, true);
      }

      // 12. تحديث سجل تالف وهالك الورد
      if (Array.isArray(data.spoilageLogs)) {
        const nextSpoilage = isMerge ? [...data.spoilageLogs, ...spoilageLogs] : data.spoilageLogs;
        setSpoilageLogs(nextSpoilage);
        localStorage.setItem('naif_pos_v3_spoilage_logs', JSON.stringify(nextSpoilage));
        syncEngine.saveKey('spoilage_logs', nextSpoilage, true);
      }

      return {
        success: true,
        stats: {
          products: Array.isArray(data.products) ? data.products.length : 0,
          invoices: Array.isArray(data.invoices) ? data.invoices.length : 0,
          customers: Array.isArray(data.customers) ? data.customers.length : 0,
          categories: Array.isArray(data.categories) ? data.categories.length : 0,
          expenses: Array.isArray(data.expenses) ? data.expenses.length : 0
        },
        message: 'تمت استعادة ومزامنة بيانات النسخة الاحتياطية بنجاح 🌸'
      };
    } catch (e) {
      console.error('Import error:', e);
      return { success: false, message: 'حدث خطأ أثناء استيراد وقراءة الملف: ' + e.message };
    }
  };

  // =========================================================================
  // دوال إدارة المستخدمين وصلاحيات النظام الدقيقة مع التطهير الفوري لسجل الورديات
  // =========================================================================
  const addUser = (userData) => {
    const rawPin = String(userData.pin || '1234').trim();
    const newUser = {
      id: userData.id || `user-${Date.now()}`,
      name: (userData.name || '').trim() || 'مستخدم جديد',
      // pin field removed - never store PIN in plain text
      pinHash: userData.pinHash || hashPin(rawPin),
      role: userData.role || 'cashier',
      roleName: userData.roleName || (userData.role === 'admin' ? '👑 مدير النظام' : '🌸 كاشير مبيعات'),
      phone: userData.phone || '',
      // nfcCardId removed - card number is never stored in plain text
      nfcCardHash: userData.nfcCardHash || (userData.nfcCardId ? hashNfcCard(userData.nfcCardId) : ''),
      isActive: userData.isActive !== false,
      avatar: userData.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=60',
      permissions: userData.permissions || (userData.role === 'admin' ? { ...FULL_ADMIN_PERMISSIONS } : { ...(ROLE_PRESETS.find(r => r.id === 'cashier')?.permissions || {}) }),
      createdAt: userData.createdAt || new Date().toISOString()
    };
    setUsers(prev => {
      const next = [...prev, newUser];
      saveAndSync('users', next, true);
      return next;
    });
    return newUser;
  };

  const updateUser = (userData) => {
    let updatedUsersList = [];
    const pinHashUpdate = userData.pin ? { pinHash: hashPin(userData.pin) } : {};
    const nfcHashUpdate = userData.nfcCardId ? { nfcCardHash: hashNfcCard(userData.nfcCardId) } : {};
    // plain-text secrets never reach the stored record
    const { pin: _pin, nfcCardId: _card, password: _pw, ...safeUserData } = userData;
    setUsers(prev => {
      const updated = prev.map(u => u.id === userData.id ? { ...u, ...safeUserData, ...pinHashUpdate, ...nfcHashUpdate, updatedAt: new Date().toISOString() } : u);
      updatedUsersList = updated;
      saveAndSync('users', updated, true);
      // إذا تم إلغاء تفعيل المستخدم (isActive: false)، تنقية الورديات المفتوحة الخاصة به فوراً
      if (userData.isActive === false) {
        setUserShifts(sPrev => {
          const cleaned = cleanUserShifts(sPrev, updated);
          saveAndSync('user_shifts', cleaned, true);
          return cleaned;
        });
      }
      return updated;
    });

    if (currentUser?.id === userData.id) {
      setCurrentUser(prev => ({ ...prev, ...userData }));
    }

    // تحديث كافة الورديات النشطة للمستخدم فوراً بالاسم الجديد لضمان المزامنة الآنية
    setUserShifts(sPrev => {
      const nextShifts = { ...sPrev };
      let changed = false;
      Object.keys(nextShifts).forEach(k => {
        if (nextShifts[k]?.userId === userData.id || k === userData.id) {
          nextShifts[k] = {
            ...nextShifts[k],
            cashierName: userData.name || nextShifts[k].cashierName,
            cashierRole: userData.roleName || nextShifts[k].cashierRole,
            updatedAt: new Date().toISOString()
          };
          changed = true;
        }
      });
      if (changed) {
        saveAndSync('user_shifts', nextShifts, true);
      }
      return nextShifts;
    });

    // تحديث الوردية النشطة إذا كانت لهذا المستخدم
    setActiveShift(prev => {
      if (prev && (prev.userId === userData.id || (currentUser?.id === userData.id))) {
        const updatedShift = {
          ...prev,
          cashierName: userData.name || prev.cashierName,
          cashierRole: userData.roleName || prev.cashierRole
        };
        saveAndSync('active_shift', updatedShift, true);
        return updatedShift;
      }
      return prev;
    });

    // تحديث سجل الفواتير والمصروفات وحركات الصندوق لتنعكس التسمية الجديدة
    setInvoices(prev => {
      if (!Array.isArray(prev)) return prev;
      let hasChange = false;
      const updatedInvs = prev.map(inv => {
        if (inv.cashierId === userData.id || inv.userId === userData.id) {
          hasChange = true;
          return { ...inv, cashier: userData.name || inv.cashier };
        }
        return inv;
      });
      if (hasChange) {
        localStorage.setItem('naif_pos_v3_invoices', JSON.stringify(updatedInvs));
        saveAndSync('invoices', updatedInvs, true);
      }
      return hasChange ? updatedInvs : prev;
    });
  };

  const deleteUser = (userId) => {
    if (users.length <= 1) {
      alert('لا يمكن حذف آخر مستخدم في النظام');
      return false;
    }
    const userToDelete = users.find(u => u.id === userId);
    if (userToDelete?.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1) {
      alert('يجب أن يبقى مدير نظام واحد على الأقل');
      return false;
    }
    syncEngine.deleteRecord('users', userId);   // حذف صريح من السحابة
    const remainingUsers = users.filter(u => u.id !== userId);
    setUsers(remainingUsers);
    saveAndSync('users', remainingUsers, true);

    // تنقية وتطهير سجل الورديات فوراً من أي وردية خاصة بهذا المستخدم لمنع الورديات الشبحية نهائياً
    setUserShifts(prevShifts => {
      const nextShifts = { ...prevShifts };
      delete nextShifts[userId];
      if (userToDelete?.name) {
        const delName = String(userToDelete.name).trim().toLowerCase();
        Object.keys(nextShifts).forEach(k => {
          if (String(nextShifts[k]?.cashierName || '').trim().toLowerCase() === delName || nextShifts[k]?.userId === userId) {
            delete nextShifts[k];
          }
        });
      }
      const cleaned = cleanUserShifts(nextShifts, remainingUsers);
      saveAndSync('user_shifts', cleaned, true);
      return cleaned;
    });

    if (currentUser?.id === userId) {
      setCurrentUser(remainingUsers[0]);
    }
    if (activeShift?.userId === userId) {
      setActiveShift(resolveTargetShift(remainingUsers[0], null, {}, shiftsHistory));
    }
    return true;
  };

  // دالة تحديد وتثبيت الوردية الفعالة عند تبديل المستخدم أو تسجيل الدخول مع العزل المحاسبي الصارم
  const resolveTargetShift = (user, currentActiveShift, currentUserShifts, historyList) => {
    if (!user || !user.id) {
      return { id: 'shift-guest', isOpen: false, status: 'closed', cashierName: 'غير محدد' };
    }
    const history = historyList || [];
    const isShiftValidAndOpen = (sh) => {
      if (!sh || sh.isOpen !== true || sh.status === 'closed' || sh.closedAt) return false;
      return !history.some(h => h && h.id === sh.id && (h.status === 'closed' || h.closedAt || h.isOpen === false));
    };

    // 1. فحص هل لهذا المستخدم تحديداً وردية مفتوحة خاصة به في userShifts؟
    const targetShift = currentUserShifts?.[user.id];
    if (isShiftValidAndOpen(targetShift)) {
      return { ...targetShift, isOpen: true, status: 'open' };
    }

    // 2. فحص هل الوردية الحالية في activeShift تخص هذا المستخدم تحديداً ومفتوحة بالفعل؟
    if (currentActiveShift && currentActiveShift.userId === user.id && isShiftValidAndOpen(currentActiveShift)) {
      return currentActiveShift;
    }

    // 3. هذا المستخدم ليس لديه أي وردية مفتوحة -> تبقى حالته مغلقة ومستقلة تماماً ويمنع البيع حتى يفتح وردية
    return {
      id: `shift-${user.id}`,
      isOpen: false,
      openedAt: null,
      closedAt: null,
      startCash: 0,
      cashSales: 0,
      cardSales: 0,
      creditSales: 0,
      cashIn: 0,
      cashOut: 0,
      userId: user.id,
      cashierName: user.name || 'كاشير المبيعات',
      status: 'closed'
    };
  };

  const switchUser = (userId) => {
    const target = users.find(u => u.id === userId);
    if (target) {
      // لا فاتورة معلقة عند تبديل المستخدم — التعليق موقوف في النظام
      if (cart && cart.length > 0 && currentUser?.id !== target.id) {
        clearCart();
      }

      setCurrentUser(target);
      const nextShift = resolveTargetShift(target, activeShift, userShifts, shiftsHistory);
      setActiveShift(nextShift);
      localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(nextShift));
      localStorage.setItem('naif_pos_v3_current_user', JSON.stringify(target));
      recordLoginEvent(target, 'switch');
      return true;
    }
    return false;
  };

  // تسجيل حركة دخول جديدة ومواصفات الجهاز في سجل المراقبة والأمان
  const recordLoginEvent = (user, method = 'pin') => {
    if (!user) return;
    try {
      const deviceInfo = getDeviceInfo();
      const newLog = {
        id: `login-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        userId: user.id,
        userName: user.name || 'مستخدم',
        userRole: user.role || 'cashier',
        roleLabel: user.role === 'admin' ? 'المدير العام 👑' : 'كاشير مبيعات 👤',
        loginMethod: method, // 'pin' | 'nfc' | 'switch'
        methodLabel: method === 'nfc' ? 'بطاقة NFC ذكية 🪪' : method === 'switch' ? 'تبديل مستخدم سريع 🔄' : 'رمز PIN السري 🔑',
        device: deviceInfo,
        status: 'success'
      };

      setLoginLogs(prev => {
        const next = [newLog, ...(Array.isArray(prev) ? prev : [])].slice(0, 300);
        try {
          localStorage.setItem('naif_pos_v3_login_logs', JSON.stringify(next));
          syncEngine.saveKey('login_logs', next, true);
        } catch (e) {
          console.warn('Failed to save login log:', e);
        }
        return next;
      });
    } catch (err) {
      console.warn('Error recording login event:', err);
    }
  };

  const clearLoginLogs = () => {
    setLoginLogs([]);
    try {
      localStorage.removeItem('naif_pos_v3_login_logs');
      syncEngine.saveKey('login_logs', [], true);
    } catch (e) {
      console.warn('Failed to clear login logs:', e);
    }
  };

  const loginWithPin = (enteredPin, specificUserId = null) => {
    let foundUser = null;
    if (specificUserId) {
      foundUser = users.find(u => u.id === specificUserId && verifyPin(enteredPin, u) && u.isActive !== false);
    } else {
      foundUser = users.find(u => verifyPin(enteredPin, u) && u.isActive !== false);
    }

    if (foundUser) {
      // سلة الكاشير السابق تُفرَّغ ولا تُحوَّل إلى فاتورة معلقة، لأن
      // تعليق الفواتير موقوف في النظام. السلة ليست فاتورة ولم يُسجَّل
      // فيها أي أثر مالي، فلا يضيع شيء بتفريغها.
      if (cart && cart.length > 0 && currentUser?.id !== foundUser.id) {
        clearCart();
      }

      setCurrentUser(foundUser);
      const nextShift = resolveTargetShift(foundUser, activeShift, userShifts, shiftsHistory);
      setActiveShift(nextShift);
      localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(nextShift));
      setIsLocked(false);
      setIsInactivityLock(false);
      localStorage.setItem('naif_pos_v3_current_user', JSON.stringify(foundUser));
      recordLoginEvent(foundUser, 'pin');
      return { success: true, user: foundUser };
    }
    return { success: false, message: 'رمز الدخول (PIN) غير صحيح!' };
  };

  const loginWithNfc = (nfcCardId) => {
    if (!nfcCardId) return { success: false, message: 'رقم البطاقة غير صالح' };
    const cleanId = String(nfcCardId).trim().toLowerCase();
    const foundUser = users.find(u => verifyNfcCard(cleanId, u));
    if (foundUser) {
      // الاحتياط التام: حفظ الفاتورة والعمليات القائمة للكاشير السابق كفاتورة معلقة بأمان
      let cartSafeguarded = false;
      let prevCashierName = currentUser?.name || 'كاشير';

      if (cart && cart.length > 0 && currentUser?.id !== foundUser.id) {
        const heldBill = {
          id: `hold-nfc-${Date.now()}`,
          label: `فاتورة معلقة تلقائياً (الكاشير: ${prevCashierName})`,
          cart: [...cart],
          selectedCustomer,
          cartDiscount,
          cartNotes,
          cashierId: currentUser?.id,
          cashierName: prevCashierName,
          timestamp: new Date().toISOString(),
          itemsCount: cart.reduce((s, i) => s + i.qty, 0),
          total: getCartTotals().total,
          isNfcAutoParked: true
        };
        const nextHeld = [heldBill, ...heldBills];
        setHeldBills(nextHeld);
        localStorage.setItem('naif_pos_v3_held_bills', JSON.stringify(nextHeld));
        syncEngine.saveKey('held_bills', nextHeld, true);
        clearCart();
        cartSafeguarded = true;
      }

      setCurrentUser(foundUser);
      const nextShift = resolveTargetShift(foundUser, activeShift, userShifts, shiftsHistory);
      setActiveShift(nextShift);
      localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(nextShift));
      setIsLocked(false);
      setIsInactivityLock(false);
      localStorage.setItem('naif_pos_v3_current_user', JSON.stringify(foundUser));
      recordLoginEvent(foundUser, 'nfc');

      const msg = cartSafeguarded 
        ? `مرحباً بك (${foundUser.name}) 🌸 • تم حفظ فاتورة (${prevCashierName}) السابقة معلقة بأمان 📥`
        : `مرحباً بك، تم التبديل لحساب: ${foundUser.name} 🌸`;

      return { 
        success: true, 
        user: foundUser, 
        cartSafeguarded,
        message: msg 
      };
    }
    return { success: false, message: `بطاقة NFC رقم (${nfcCardId}) غير مسجلة لأي مستخدم!` };
  };

  // ===== تسجيل الدخول عبر Firebase (البريد وكلمة المرور) =====
  const loginWithEmail = async (email, password) => {
    const cleanEmail = String(email || '').trim().toLowerCase();

    const roleInfo = getRoleByEmail(cleanEmail);
    if (!roleInfo) {
      return { success: false, message: 'هذا الحساب غير مسجّل في النظام. راجع ملف authUsers.js' };
    }

    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (err) {
      const codes = {
        'auth/invalid-credential': 'البريد أو كلمة المرور غير صحيحة',
        'auth/wrong-password': 'كلمة المرور غير صحيحة',
        'auth/user-not-found': 'لا يوجد حساب بهذا البريد',
        'auth/invalid-email': 'صيغة البريد غير صحيحة',
        'auth/user-disabled': 'هذا الحساب موقوف',
        'auth/too-many-requests': 'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة',
        'auth/network-request-failed': 'لا يوجد اتصال بالإنترنت'
      };
      return { success: false, message: codes[err?.code] || `تعذر تسجيل الدخول (${err?.code || 'خطأ غير معروف'})` };
    }

    // =================================================================
    //  البريد يفتح النظام، والرمز السري يحدد الموظف
    // =================================================================
    //  كان هنا: النظام يختار تلقائياً أول مستخدم يطابق دور البريد ثم يفتح
    //  القفل فوراً. ولأن الكاشيرات يتشاركون بريداً واحداً، كان أول كاشير
    //  في القائمة (فاطمة) يُنتحل تلقائياً لكل من يدخل — فيبيع باسمها،
    //  ويرث وردية مفتوحة لم يفتحها هو، ولا يعرف النظام من الموجود فعلاً.
    //  الآن: بعد نجاح البريد ننتقل إلى شاشة الرمز السري، ولا يُحدَّد
    //  المستخدم ولا تُفتح الشاشة إلا بعد إدخال رمزه الشخصي.
    const activeUsers = (users || []).filter(u => u && u.isActive !== false);
    if (activeUsers.length === 0) {
      return { success: false, message: 'لا يوجد مستخدم نشط في النظام' };
    }

    setCurrentUser(null);
    localStorage.removeItem('naif_pos_v3_current_user');
    const guestShift = { id: 'shift-guest', isOpen: false, status: 'closed', userId: null };
    setActiveShift(guestShift);
    localStorage.removeItem('naif_pos_v3_active_shift');
    setIsLocked(true);
    setIsInactivityLock(false);

    return { success: true, needsPin: true, roleLabel: roleInfo.label };
  };

  const logoutFirebase = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('تعذر تسجيل الخروج من Firebase:', err);
    }
    // لا يبقى موظف محدداً بعد الخروج، وإلا فُتح النظام باسمه عند الدخول التالي
    setCurrentUser(null);
    localStorage.removeItem('naif_pos_v3_current_user');
    setIsLocked(true);
    setIsInactivityLock(false);
  };

  const logout = () => {
    setCurrentUser(null);
    setIsLocked(true);
    setIsInactivityLock(false);
    localStorage.removeItem('naif_pos_v3_current_user');
    const guestShift = { id: 'shift-guest', isOpen: false, status: 'closed', userId: null };
    setActiveShift(guestShift);
    localStorage.removeItem('naif_pos_v3_active_shift');
  };

  const lockScreen = () => {
    setIsLocked(true);
    setIsInactivityLock(false);
  };

  // قفل النظام التلقائي لعدم الحركة مع الحفاظ التام على حالة الوردية
  const lockDueToInactivity = useCallback(() => {
    setIsInactivityLock(true);
    setIsLocked(true);
    // حالة الوردية تبقى على حالها تماماً دون أي مساس (المفتوحة تبقى مفتوحة والمغلقة تبقى مغلقة)
  }, []);

  const hasPermission = (permissionKey) => {
    return checkUserPermission(currentUser, permissionKey);
  };

  // =========================================================================
  // تسجيل عملية في سجل التدقيق
  //   action  : وصف عربي مختصر للعملية (مثال: 'مرتجع فاتورة')
  //   target  : اسم أو رقم الشيء المتأثر (اسم منتج، رقم فاتورة...)
  //   details : تفصيل نصي حر (السبب، المبلغ، القيمة قبل/بعد)
  //   severity: 'high' للعمليات المالية الخطرة، 'normal' لغيرها
  // =========================================================================
  const logAudit = ({ action = '', target = '', details = '', severity = 'normal', amount = null } = {}) => {
    try {
      const entry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        action,
        target: String(target || ''),
        details: String(details || ''),
        severity,
        amount: amount === null ? null : Number(amount),
        userId: currentUser?.id || 'unknown',
        userName: currentUser?.name || 'غير معروف',
        role: currentUser?.role || '',
        device: (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) ? 'جوال' : 'كمبيوتر'
      };
      setAuditLogs(prev => {
        const next = [entry, ...(Array.isArray(prev) ? prev : [])].slice(0, 1000);
        try {
          localStorage.setItem('naif_pos_v3_audit_logs', JSON.stringify(next));
        } catch (e) {
          console.warn('[Audit] save failed:', e?.message);
        }
        return next;
      });
      // القيد السحابي عبر المسار المتوافق مع قاعدة pos_audit_logs
      // (serverTimestamp + userEmail) بدل مسار syncEngine الذي كانت
      // القاعدة ترفضه بـ permission-denied
      logAuditCloud({
        action,
        targetName: String(target || '') || null,
        amount: amount === null ? null : Number(amount),
        reason: String(details || '') || null,
      }, currentUser);
    } catch (err) {
      // سجل التدقيق لا يجوز أن يُعطّل عملية بيع أبداً
      console.warn('[Audit] skipped:', err?.message);
    }
  };

  // =========================================================================
  // دوال تصفير الحسابات والأنظمة بشكل تفصيلي ودقيق مع الحفظ السحابي الفوري
  // =========================================================================
  
  // =========================================================================
  // دوال تصفير الحسابات والأنظمة بشكل تفصيلي ودقيق مع الحفظ السحابي الفوري
  // =========================================================================
  
  // 1. تصفير سجل فواتير المبيعات
  // =====================================================================
  //  إغلاق قسري لكل الورديات المفتوحة ومسح محتواها — يُنفَّذ مع كل تصفير
  // =====================================================================
  //  المطلوب: عند التصفير لا تبقى أي وردية مفتوحة ولا عهدة معلقة تنتقل
  //  إلى الدورة المالية الجديدة. كان التصفير يمسح الأرقام ويترك الوردية
  //  مفتوحة بأرقام لم تعد موجودة، فتظهر "وردية معلقة" لا تُغلق ولا تُفتح.
  const forceCloseAllShifts = (reason = 'تصفير الحسابات') => {
    const nowTs = Date.now();
    const nowIso = new Date(nowTs).toISOString();
    const closerName = currentUser?.name || 'مدير النظام';
    const currentUid = currentUser?.id || 'admin';

    const openOnes = Object.values(userShifts || {}).filter(sh => sh && sh.isOpen === true);

    // 1. سجل مختصر لكل وردية أُغلقت قسرياً — بلا عهدة معلقة وبلا أرقام
    const forcedRecords = openOnes.map(sh => ({
      ...sh,
      isOpen: false,
      status: 'closed',
      closedAt: nowIso,
      updatedAt: nowIso,
      forcedClose: true,
      forcedCloseReason: reason,
      closedBy: closerName,
      cashSales: 0, cardSales: 0, creditSales: 0, totalSales: 0,
      cashIn: 0, cashOut: 0, startCash: 0,
      actualCash: 0, expectedCash: 0, difference: 0,
      handoverStatus: 'settled',
      handoverAmount: 0,
      handoverReceivedBy: closerName,
      handoverReceivedAt: nowIso,
      handoverNotes: `أُغلقت آلياً عند: ${reason}`,
      notes: `إغلاق قسري عند: ${reason}`
    }));

    forcedRecords.forEach(r => {
      logAudit({
        action: 'إغلاق وردية قسرياً بالتصفير',
        target: r.cashierName || r.userId || '',
        details: reason,
        severity: 'high'
      });
    });

    // 2. تسوية أي عهدة معلقة قديمة + إضافة السجلات القسرية
    const nextHistory = [
      ...forcedRecords,
      ...((Array.isArray(shiftsHistory) ? shiftsHistory : []).map(sh => (
        sh && sh.handoverStatus === 'pending'
          ? { ...sh, handoverStatus: 'settled', updatedAt: nowIso, handoverNotes: `تمت التسوية آلياً عند: ${reason}` }
          : sh
      )))
    ];
    setShiftsHistory(nextHistory);
    try { localStorage.setItem('naif_pos_v3_shifts_history', JSON.stringify(nextHistory)); } catch (e) {}
    syncEngine.saveKey('shifts_history', nextHistory, true, nowTs, false);

    // 3. مسح قاموس ورديات كل المستخدمين من السحابة والمحلي (حذف صريح)
    setUserShifts({});
    try {
      localStorage.setItem('naif_pos_v3_user_shifts', '{}');
      localStorage.setItem('naif_pos_v3_user_shifts_reset_at', String(nowTs));
    } catch (e) {}
    syncEngine.saveKey('user_shifts', {}, true, nowTs, true);

    // 4. وردية المستخدم الحالي على الشاشة: مغلقة وصفرية
    const cleanClosedShift = {
      id: `shift-closed-${currentUid}`,
      isOpen: false,
      status: 'closed',
      openedAt: null,
      closedAt: nowIso,
      updatedAt: nowIso,
      startCash: 0, cashSales: 0, cardSales: 0, creditSales: 0,
      cashIn: 0, cashOut: 0,
      userId: currentUid,
      cashierName: closerName
    };
    activeShiftRef.current = cleanClosedShift;
    setActiveShift(cleanClosedShift);
    try { localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(cleanClosedShift)); } catch (e) {}
    syncEngine.saveKey('active_shift', cleanClosedShift, true, nowTs, true);

    return forcedRecords.length;
  };

  const resetSalesInvoices = (options = { clearHeld: false }) => {
    const nowTs = Date.now();
    forceCloseAllShifts('تصفير فواتير المبيعات');
    setInvoices([]);
    localStorage.setItem('naif_pos_v3_invoices', '[]');
    localStorage.setItem('naif_pos_v3_invoices_reset_at', String(nowTs));
    syncEngine.saveKey('invoices', [], true, nowTs, true);

    if (options?.clearHeld) {
      setHeldBills([]);
      localStorage.setItem('naif_pos_v3_held_bills', '[]');
      localStorage.setItem('naif_pos_v3_held_bills_reset_at', String(nowTs));
      syncEngine.saveKey('held_bills', [], true, nowTs, true);
    }
    clearCart();
    broadcastStoreActivity({
      type: 'reset_invoices',
      title: 'تصفير فواتير المبيعات 🧾',
      message: `قام (${currentUser?.name || 'المدير'}) بتصفير سجل فواتير المبيعات بالكامل.`
    });
    return { success: true, message: 'تم تصفير سجل فواتير المبيعات سحابياً ومحلياً بنجاح 🌸' };
  };

  // 2. تصفير الفواتير المعلقة وحدها
  const resetHeldInvoices = () => {
    const nowTs = Date.now();
    setHeldBills([]);
    localStorage.setItem('naif_pos_v3_held_bills', '[]');
    localStorage.setItem('naif_pos_v3_held_bills_reset_at', String(nowTs));
    syncEngine.saveKey('held_bills', [], true, nowTs, true);
    return { success: true, message: 'تم تصفير الفواتير المعلقة سحابياً ومحلياً بنجاح 🌸' };
  };

  // 3. تصفير ديون وأرصدة العملاء
  const resetCustomerBalances = (options = { clearReceipts: false }) => {
    const nowTs = Date.now();
    const updatedCust = customers.map(c => ({ ...c, balance: 0 }));
    setCustomers(updatedCust);
    localStorage.setItem('naif_pos_v3_customers', JSON.stringify(updatedCust));
    // مهم: هذه العملية تصفّر الأرصدة فقط ولا تحذف العملاء، لذلك لا نمرر isReset=true.
    // تمريره يجعل محرك المزامنة يحذف من السحابة كل عميل غير موجود في النسخة المحلية —
    // ولو كانت المحلية ناقصة (جهاز جديد أو قبل اكتمال السحب) لضاع العملاء من كل الأجهزة.
    syncEngine.saveKey('customers', updatedCust, true, nowTs);
    // الرصيد مُدار بـ increment ويُجرَّد من الكتابة الكاملة، فنصفّره صراحةً في السحابة
    updatedCust.forEach(c => { if (c && c.id) syncEngine.adjustFields('customers', c.id, {}, { balance: 0 }, true); });

    if (options?.clearReceipts) {
      setPaymentReceipts([]);
      localStorage.setItem('naif_pos_v3_receipts', '[]');
      localStorage.setItem('naif_pos_v3_receipts_reset_at', String(nowTs));
      syncEngine.saveKey('receipts', [], true, nowTs, true);
    }
    return { success: true, message: 'تم تصفير ذمم وديون جميع العملاء سحابياً ومحلياً بنجاح 🌸' };
  };

  // 4. تصفير سندات القبض والصرف المالي
  const resetPaymentReceiptsVouchers = () => {
    const nowTs = Date.now();
    forceCloseAllShifts('تصفير سندات القبض');
    setPaymentReceipts([]);
    localStorage.setItem('naif_pos_v3_receipts', '[]');
    localStorage.setItem('naif_pos_v3_receipts_reset_at', String(nowTs));
    syncEngine.saveKey('receipts', [], true, nowTs, true);
    return { success: true, message: 'تم تصفير سندات القبض والصرف المالي سحابياً ومحلياً بنجاح 🌸' };
  };

  // 5. تصفير مستحقات الموردين وفواتير المشتريات
  const resetSupplierBalances = (options = { clearPurchases: true }) => {
    const nowTs = Date.now();
    if (options?.clearPurchases) forceCloseAllShifts('تصفير المشتريات والموردين');
    const updatedSup = suppliers.map(s => ({ ...s, balance: 0 }));
    setSuppliers(updatedSup);
    localStorage.setItem('naif_pos_v3_suppliers', JSON.stringify(updatedSup));
    // مهم: تصفير أرصدة فقط بدون حذف الموردين — نفس سبب العملاء أعلاه (لا isReset).
    syncEngine.saveKey('suppliers', updatedSup, true, nowTs);
    // الرصيد مُدار بـ increment ويُجرَّد من الكتابة الكاملة، فنصفّره صراحةً في السحابة
    updatedSup.forEach(s => { if (s && s.id) syncEngine.adjustFields('suppliers', s.id, {}, { balance: 0 }, true); });

    if (options?.clearPurchases) {
      setPurchases([]);
      localStorage.setItem('naif_pos_v3_purchases', '[]');
      localStorage.setItem('naif_pos_v3_purchases_reset_at', String(nowTs));
      syncEngine.saveKey('purchases', [], true, nowTs, true);
    }
    return { success: true, message: 'تم تصفير مستحقات الموردين وسجل المشتريات سحابياً ومحلياً بنجاح 🌸' };
  };

  // 6. تصفير عهد وورديات جميع الكاشيرات والصندوق بالكامل
  const resetCashierShiftsAndDrawers = (startCash = 0) => {
    const nowTs = Date.now();
    const currentUid = currentUser?.id || 'admin';
    const currentName = currentUser?.name || 'كاشير';

    // 1. تصفير حركات الدرج والسحب والإيداع
    setDrawerTransactions([]);
    localStorage.setItem('naif_pos_v3_drawer_tx', '[]');
    localStorage.setItem('naif_pos_v3_drawer_tx_reset_at', String(nowTs));
    syncEngine.saveKey('drawer_tx', [], true, nowTs, true);

    // 2. إغلاق قسري لكل الورديات المفتوحة ومسح محتواها وتسوية العهد
    forceCloseAllShifts('تصفير عهد وورديات الكاشيرات');

    broadcastStoreActivity({
      type: 'drawer_reset',
      title: 'تصفير عهد وورديات الكاشيرات 💵',
      message: `قام (${currentUser?.name || 'المدير'}) بتصفير عهد وورديات كافة الكاشيرات والصندوق بنجاح.`
    });

    return { success: true, message: 'تم تصفير عهد وورديات جميع الكاشيرات والصندوق وإعادتها إلى 0.00 ر.س بنجاح 🌸' };
  };

  // alias للتوافق
  const resetCashDrawerAndShifts = resetCashierShiftsAndDrawers;

  // 7. تصفير دفتر تدقيق الخزينة والإيداعات البنكية
  const resetTreasuryAuditLedger = () => {
    const nowTs = Date.now();
    forceCloseAllShifts('تصفير دفتر الخزينة');
    setTreasuryLedger([]);
    localStorage.setItem('naif_pos_v3_treasury_ledger', '[]');
    localStorage.setItem('naif_pos_v3_treasury_ledger_reset_at', String(nowTs));
    syncEngine.saveKey('treasury_ledger', [], true, nowTs, true);
    return { success: true, message: 'تم تصفير دفتر تدقيق الخزينة والإيداعات البنكية سحابياً ومحلياً بنجاح 🌸' };
  };

  // 8. تصفير المصروفات والنثريات
  const resetExpensesData = () => {
    const nowTs = Date.now();
    forceCloseAllShifts('تصفير المصروفات');
    setExpenses([]);
    localStorage.setItem('naif_pos_v3_expenses', '[]');
    localStorage.setItem('naif_pos_v3_expenses_reset_at', String(nowTs));
    syncEngine.saveKey('expenses', [], true, nowTs, true);
    return { success: true, message: 'تم تصفير سجل المصروفات والنثريات سحابياً ومحلياً بنجاح 🌸' };
  };

  // 9. تصفير كميات المخزون لجميع الأصناف للجرد
  const zeroInventoryStock = () => {
    // المخزون يُدار عبر increment، فنصفّره بفروق سالبة (‑الكمية الحالية) بدل
    // كتابة stock:0 في الكتابة الكاملة (التي يُجرَّد منها stock في المحرّك).
    const deltas = (products || [])
      .map(p => ({ id: p.id, delta: -(Number(p.stock) || 0) }))
      .filter(d => d.id && d.delta !== 0);
    const updatedProd = products.map(p => ({ ...p, stock: 0 }));
    setProducts(updatedProd);
    localStorage.setItem('naif_pos_v3_products', JSON.stringify(updatedProd));
    if (deltas.length > 0) syncEngine.adjustStock(deltas);
    return { success: true, message: 'تم تصفير كميات جميع الأصناف في المخزون بنجاح 🌸' };
  };

  // 10. تصفير سجلات تسجيل الدخول والأمان
  const resetLoginAuditLogs = () => {
    const nowTs = Date.now();
    setLoginLogs([]);
    localStorage.removeItem('naif_pos_v3_login_logs');
    localStorage.setItem('naif_pos_v3_login_logs_reset_at', String(nowTs));
    syncEngine.saveKey('login_logs', [], true, nowTs, true);
    return { success: true, message: 'تم مسح سجلات الدخول ومراقبة الأجهزة بنجاح 🌸' };
  };

  // 11. تصفير السنة المالية وبدء موسم جديد
  const resetFiscalYear = () => {
    const nowTs = Date.now();
    const currentUid = currentUser?.id || 'admin';
    const currentName = currentUser?.name || 'كاشير';

    // لا تبقى وردية مفتوحة ولا عهدة معلقة تعبر إلى الموسم الجديد
    forceCloseAllShifts('تصفير السنة المالية');

    setInvoices([]);
    localStorage.setItem('naif_pos_v3_invoices', '[]');
    localStorage.setItem('naif_pos_v3_invoices_reset_at', String(nowTs));
    syncEngine.saveKey('invoices', [], true, nowTs, true);

    setHeldBills([]);
    localStorage.setItem('naif_pos_v3_held_bills', '[]');
    localStorage.setItem('naif_pos_v3_held_bills_reset_at', String(nowTs));
    syncEngine.saveKey('held_bills', [], true, nowTs, true);

    setPurchases([]);
    localStorage.setItem('naif_pos_v3_purchases', '[]');
    localStorage.setItem('naif_pos_v3_purchases_reset_at', String(nowTs));
    syncEngine.saveKey('purchases', [], true, nowTs, true);

    setExpenses([]);
    localStorage.setItem('naif_pos_v3_expenses', '[]');
    localStorage.setItem('naif_pos_v3_expenses_reset_at', String(nowTs));
    syncEngine.saveKey('expenses', [], true, nowTs, true);

    setDrawerTransactions([]);
    localStorage.setItem('naif_pos_v3_drawer_tx', '[]');
    localStorage.setItem('naif_pos_v3_drawer_tx_reset_at', String(nowTs));
    syncEngine.saveKey('drawer_tx', [], true, nowTs, true);

    setPaymentReceipts([]);
    localStorage.setItem('naif_pos_v3_receipts', '[]');
    localStorage.setItem('naif_pos_v3_receipts_reset_at', String(nowTs));
    syncEngine.saveKey('receipts', [], true, nowTs, true);

    setTreasuryLedger([]);
    localStorage.setItem('naif_pos_v3_treasury_ledger', '[]');
    localStorage.setItem('naif_pos_v3_treasury_ledger_reset_at', String(nowTs));
    syncEngine.saveKey('treasury_ledger', [], true, nowTs, true);

    setShiftsHistory([]);
    localStorage.setItem('naif_pos_v3_shifts_history', '[]');
    localStorage.setItem('naif_pos_v3_shifts_history_reset_at', String(nowTs));
    syncEngine.saveKey('shifts_history', [], true, nowTs, true);

    setUserShifts({});
    localStorage.setItem('naif_pos_v3_user_shifts', '{}');
    localStorage.setItem('naif_pos_v3_user_shifts_reset_at', String(nowTs));
    syncEngine.saveKey('user_shifts', {}, true, nowTs, true);

    const cleanClosedShift = {
      id: `shift-closed-${currentUid}`,
      isOpen: false,
      status: 'closed',
      openedAt: null,
      closedAt: new Date(nowTs).toISOString(),
      startCash: 0,
      cashSales: 0,
      cardSales: 0,
      creditSales: 0,
      cashIn: 0,
      cashOut: 0,
      userId: currentUid,
      cashierName: currentName
    };
    setActiveShift(cleanClosedShift);
    localStorage.setItem('naif_pos_v3_active_shift', JSON.stringify(cleanClosedShift));
    syncEngine.saveKey('active_shift', cleanClosedShift, true, nowTs, true);

    const updatedCust = customers.map(c => ({ ...c, balance: 0 }));
    setCustomers(updatedCust);
    localStorage.setItem('naif_pos_v3_customers', JSON.stringify(updatedCust));
    // مهم: هذه العملية تصفّر الأرصدة فقط ولا تحذف العملاء، لذلك لا نمرر isReset=true.
    // تمريره يجعل محرك المزامنة يحذف من السحابة كل عميل غير موجود في النسخة المحلية —
    // ولو كانت المحلية ناقصة (جهاز جديد أو قبل اكتمال السحب) لضاع العملاء من كل الأجهزة.
    syncEngine.saveKey('customers', updatedCust, true, nowTs);
    // الرصيد مُدار بـ increment ويُجرَّد من الكتابة الكاملة، فنصفّره صراحةً في السحابة
    updatedCust.forEach(c => { if (c && c.id) syncEngine.adjustFields('customers', c.id, {}, { balance: 0 }, true); });

    const updatedSup = suppliers.map(s => ({ ...s, balance: 0 }));
    setSuppliers(updatedSup);
    localStorage.setItem('naif_pos_v3_suppliers', JSON.stringify(updatedSup));
    // مهم: تصفير أرصدة فقط بدون حذف الموردين — نفس سبب العملاء أعلاه (لا isReset).
    syncEngine.saveKey('suppliers', updatedSup, true, nowTs);
    // الرصيد مُدار بـ increment ويُجرَّد من الكتابة الكاملة، فنصفّره صراحةً في السحابة
    updatedSup.forEach(s => { if (s && s.id) syncEngine.adjustFields('suppliers', s.id, {}, { balance: 0 }, true); });

    clearCart();
    return { success: true, message: 'تم تصفير السنة المالية وبدء موسم جديد وتحديث السحابة بنجاح 🌸' };
  };

  // 12. إعادة ضبط المصنع الكاملة
  const factoryResetAll = () => {
    localStorage.clear();
    setStoreInfo(INITIAL_STORE_INFO);
    setCategories(INITIAL_CATEGORIES);
    setProducts(INITIAL_PRODUCTS);
    setCustomers(INITIAL_CUSTOMERS);
    setSuppliers(INITIAL_SUPPLIERS);
    setUsers(INITIAL_USERS);
    setCurrentUser(INITIAL_USERS[0]);
    setInvoices([]);
    setPurchases([]);
    setExpenses([]);
    setHeldBills([]);
    setDrawerTransactions([]);
    setPaymentReceipts([]);
    setShiftsHistory([]);
    setTreasuryLedger([]);
    setUserShifts({});
    clearCart();

    const defaultShift = {
      id: 'shift-1',
      isOpen: false,
      status: 'closed',
      openedAt: null,
      closedAt: new Date().toISOString(),
      startCash: 0,
      cashSales: 0,
      cardSales: 0,
      creditSales: 0,
      cashIn: 0,
      cashOut: 0,
      userId: INITIAL_USERS[0]?.id || 'admin',
      cashierName: INITIAL_USERS[0]?.name || 'الكاشير'
    };
    setActiveShift(defaultShift);

    // رفع الحالة الابتدائية فوراً للسحابة
    syncEngine.pushAllLocal({
      store_info: INITIAL_STORE_INFO,
      categories: INITIAL_CATEGORIES,
      products: INITIAL_PRODUCTS,
      customers: INITIAL_CUSTOMERS,
      suppliers: INITIAL_SUPPLIERS,
      users: INITIAL_USERS,
      active_shift: defaultShift,
      user_shifts: {},
      invoices: [],
      purchases: [],
      expenses: [],
      drawer_tx: [],
      receipts: [],
      held_bills: [],
      shifts_history: [],
      treasury_ledger: []
    }, true);

    return { success: true, message: 'تمت استعادة ضبط المصنع الكامل وتحديث السحابة بنجاح 🌸' };
  };

  return (
    <AppContext.Provider value={{
      storeInfo,
      updateStoreInfo,
      categories,
      addCategory,
      updateCategory,
      deleteCategory,
      products,
      addProduct,
      updateProduct,
      deleteProduct,
      importProductsBatch,
      customers,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addCustomerPayment,
      paymentReceipts,
      suppliers,
      addSupplier,
      updateSupplier,
      deleteSupplier,
      purchases,
      addPurchaseInvoice,
      deletePurchaseInvoice,
      addSupplierPayment,
      expenses,
      addExpense,
      deleteExpense,
      currentUser,
      users,
      addUser,
      updateUser,
      deleteUser,
      switchUser,
      hasPermission,
      loginWithPin,
      loginWithEmail,
      logoutFirebase,
      firebaseUser,
      loginWithNfc,
      logout,
      isLocked,
      lockScreen,
      isInactivityLock,
      setIsInactivityLock,
      lockDueToInactivity,
      activeShift,
      openNewShift,
      closeShift,
      shiftsHistory,
      deleteShiftRecord,
      updateShiftRecord,
      resetShiftsHistory,
      treasuryLedger,
      confirmShiftCashHandover,
      fundCashierDrawer,
      cancelPendingFloat,
      getPendingFloatsFor,
      getPendingFloatTotalFor,
      myPendingFloatTotal,
      allPendingFloats,
      allPendingFloatsTotal,
      depositCashToBank,
      getTreasurySummary,
      reconcilePosSettlement,
      reconcileAppSettlement,
      addDrawerMovement,
      drawerTransactions,
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
      cartDiscount,
      setCartDiscount,
      cartNotes,
      setCartNotes,
      auditLogs,
      logAudit,
      restoreProduct,
      heldBills,
      holdCurrentCart,
      canHoldBills: HOLD_BILLS_ENABLED,
      forceCloseAllShifts,
      restoreHeldBill,
      deleteHeldBill,
      checkout,
      invoices,
      refundInvoice,
      addPaymentMethod,
      updatePaymentMethod,
      deletePaymentMethod,
      userShifts,
      loginLogs,
      recordLoginEvent,
      clearLoginLogs,
      notifications,
      unreadNotificationsCount,
      clearAllNotifications,
      markAllNotificationsRead,
      liveAlert,
      setLiveAlert,
      exportBackup,
      runAutoCloudBackup,
      importBackup,
      syncStatus,
      lastSyncTime,
      pushAllToCloud,
      pullAllFromCloud,
      syncAllDevicesInvoices,
      resetSalesInvoices,
      resetHeldInvoices,
      resetCustomerBalances,
      resetSupplierBalances,
      resetPaymentReceiptsVouchers,
      resetCashierShiftsAndDrawers,
      resetCashDrawerAndShifts,
      resetTreasuryAuditLedger,
      resetExpensesData,
      zeroInventoryStock,
      resetLoginAuditLogs,
      resetFiscalYear,
      factoryResetAll,
      spoilageLogs,
      setSpoilageLogs,
      recordSpoilage,
      deleteSpoilageRecord,
      resolveUserName,
      hashPin,
      verifyPin
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
