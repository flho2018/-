import { DEFAULT_PAYMENT_ICONS } from './paymentIcons';
import { FULL_ADMIN_PERMISSIONS } from './permissions';


export const INITIAL_PAYMENT_METHODS = [
  {
    id: 'cash',
    name: 'كاش',
    subtitle: 'نقداً',
    type: 'cash',
    iconName: 'Banknote',
    image: DEFAULT_PAYMENT_ICONS.cash,
    color: 'from-emerald-500 to-teal-600',
    enabled: true,
    isCustom: false
  },
  {
    id: 'card',
    name: 'شبكة',
    subtitle: 'مدى Mada',
    type: 'card',
    iconName: 'CreditCard',
    image: DEFAULT_PAYMENT_ICONS.card,
    color: 'from-pink-600 to-rose-600',
    enabled: true,
    isCustom: false
  },
  {
    id: 'transfer',
    name: 'تحويل',
    subtitle: 'حوالة بنكية',
    type: 'online',
    iconName: 'Globe',
    image: DEFAULT_PAYMENT_ICONS.transfer,
    color: 'from-blue-600 to-indigo-700',
    enabled: true,
    isCustom: false
  },
  {
    id: 'visa',
    name: 'فيزا',
    subtitle: 'بطاقة ائتمان',
    type: 'card',
    iconName: 'CreditCard',
    image: DEFAULT_PAYMENT_ICONS.visa,
    color: 'from-purple-600 to-indigo-800',
    enabled: true,
    isCustom: false
  },
  {
    id: 'tamara',
    name: 'تمارا',
    subtitle: 'تقسيط Tamara',
    type: 'online',
    iconName: 'Sparkles',
    image: DEFAULT_PAYMENT_ICONS.tamara,
    color: 'from-amber-500 to-orange-600',
    enabled: true,
    isCustom: false
  },
  {
    id: 'ninja',
    name: 'نينجا',
    subtitle: 'تطبيق نينجا',
    type: 'online',
    iconName: 'Zap',
    image: DEFAULT_PAYMENT_ICONS.ninja,
    color: 'from-red-600 to-rose-700',
    enabled: true,
    isCustom: false
  },
  {
    id: 'credit',
    name: 'آجل',
    subtitle: 'على الحساب',
    type: 'credit',
    iconName: 'UserCheck',
    image: DEFAULT_PAYMENT_ICONS.credit,
    color: 'from-amber-600 to-yellow-600',
    enabled: true,
    isCustom: false
  },
  {
    id: 'split',
    name: 'تقسيم',
    subtitle: 'دفع متعدد',
    type: 'split',
    iconName: 'Split',
    image: DEFAULT_PAYMENT_ICONS.split,
    color: 'from-purple-600 to-pink-600',
    enabled: true,
    isCustom: false
  }
];

export const INITIAL_STORE_INFO = {
  name: "بيت الورد للزهور والهدايا",
  appName: "بيت الورد للزهور والهدايا",
  appSubtitle: "أزهار طبيعية • فازات • هدايا فاخرة",
  taxNumber: "310123456700003",
  crNumber: "1010789456",
  phone: "0508333996",
  email: "manager@baytalward.com",
  address: "الرياض - شارع التخصصي - مجمع بيت الورد",
  currency: "ر.س",
  // الضريبة معطّلة افتراضياً.
  // ⚠️ الاسم الصحيح هو taxEnabled — وهذا ما يقرأه كل الكود فعلاً
  // (helpers.js، التقارير، الطباعة، شاشة الإعدادات) بصيغة (taxEnabled !== false).
  // كان المفتاح المضاف سابقاً باسم isTaxActive لا يقرأه أحد، فبقيت العلة:
  // القيمة مفقودة ⇒ undefined !== false ⇒ الضريبة تعود مفعّلة بعد كل مزامنة.
  taxEnabled: false,
  taxRate: 15,
  taxInclusive: true,
  // الرصيد الافتتاحي للوردية صفر افتراضياً. كانت هاتان القيمتان موجودتين
  // داخل posSettings فقط، بينما الكود يقرأهما من المستوى الأعلى — فلا
  // يجدهما فيسقط على الرقم 500 المكتوب في الكود.
  defaultStartCash: 0,
  fixedOpeningCash: 0,
  footerNote: "شكراً لزيارتكم بيت الورد 🌸 نسعد بمشاركتكم أجمل اللحظات والمناسبات السعيدة.",
  logo: "",
  hideStoreNameAfterLogin: false,
  hideTotalSalesAfterLogin: false,
  hideMainCards: false,
  inactivityTimeoutMinutes: 15,
  posLayoutMode: 'grid', // 'grid' or 'list'
  posColumns: 8, // 4 to 12 columns, default 8
  posImageScale: 'medium', // 'small', 'medium', 'large'
  showBarcodeInPos: false,
  showStockInPos: true,
  whatsappNumber: "0508333996",
  managerPhone: "0508333996",
  managerEmail: "manager@baytalward.com",
  managerName: "المدير العام",
  googleMapsUrl: "https://maps.google.com/?q=بيت+الورد",
  paymentMethods: INITIAL_PAYMENT_METHODS,
  paymentSettings: {
    defaultMethod: 'cash',
    autoPrintAfterPayment: true,
    quick1ClickCheckout: false,
    playSuccessSound: true,
    openDrawerOnCash: true,
    defaultStartCash: 0,
    fixedOpeningCash: 0,
    bankBalance: 0,
    treasuryBalance: 0,
    quickCashAmounts: [10, 50, 100, 500],
  },
  terminalSettings: {
    enabled: true,
    terminalType: 'nami_usb', // 'nami_usb', 'mada_ecr', 'geidea', 'pax', 'ingenico'
    terminalName: 'جهاز دفع نامي الذكي (Nami Smart POS - USB)',
    connectionType: 'usb_serial', // 'usb_serial', 'network_ip', 'bluetooth'
    comPort: 'COM3',
    baudRate: '115200',
    ipAddress: '192.168.1.150',
    ipPort: '8080',
    terminalId: 'NAMI-8849201',
    merchantId: 'NAMI-6281009',
    autoPushAmount: true,
    autoCompleteOnApproval: true,
    printTerminalSlipOnInvoice: true,
    status: 'connected' // 'ready', 'connected', 'offline'
  },
  // =====================================================================
  //  توجيه الطابعات عبر QZ Tray
  // =====================================================================
  //  المتصفّح لا يسمح باختيار طابعة بالاسم، لذلك يحتاج الفصلُ بين طابعة
  //  الفواتير وطابعة الملصقات جسراً محلياً. انظر utils/qzPrint.js.
  //  الأوضاع: default = الطابعة الافتراضية للنظام | name = طابعة مثبَّتة
  //  بالاسم | network = إرسال مباشر إلى IP ومنفذ بلا تعريف مثبّت.
  //  التقارير تتبع الفواتير افتراضياً (follow_invoice).
  // =====================================================================
  printers: {
    useQz: false,          // يُفعّل من الإعدادات بعد تثبيت QZ Tray
    invoice: { mode: 'default', name: '', host: '', port: 9100 },
    report: { mode: 'follow_invoice', name: '', host: '', port: 9100 },
    barcode: { mode: 'name', name: '', host: '', port: 9100 }
  },
  invoicePrintSettings: {
    paperSize: '80mm', // '80mm', '57mm', 'A4', 'A5'
    fontFamily: 'Cairo', // 'Cairo', 'Tajawal', 'Almarai', 'IBM Plex Sans Arabic', 'Amiri', 'Arial'
    fontSize: 'normal', // 'small', 'normal', 'large', 'bold'
    printerType: 'thermal', // 'thermal', 'system', 'network', 'bluetooth'
    // ⚠️ الحقلان التاليان للعرض فقط ولا يوجّهان الطباعة — التوجيه الفعلي
    // صار في storeInfo.printers أدناه عبر QZ Tray. أُبقيا لئلا تنكسر
    // نسخ احتياطية قديمة تحملهما.
    printerName: '',
    barcodePrinterName: '',
    showLogo: true,
    invoiceLogo: '', // شعار خاص بالفاتورة مستقل عن هوية المتجر
    invoiceLogoSize: 'medium', // 'small', 'medium', 'large'
    showQrCode: true,
    qrCodeType: 'zatca', // 'zatca', 'custom_url', 'invoice_details'
    qrCustomUrl: '', // رابط مخصص مثل خرائط جوجل أو الموقع
    qrCodeSize: 'medium', // 'small', 'medium', 'large'
    qrScanText: 'امسح للتحقق من الفاتورة',
    showCashierName: true,
    showCustomerInfo: true,
    showTaxDetails: true,
    showCrNumber: true,
    showBarcode: true,
    showReturnPolicy: true,
    autoPrintOnCheckout: true,
    autoPrintMode: 'auto',
    skipReceiptModalOnCheckout: true,
    openDrawerOnPrint: true,
    returnPolicy: "البضاعة المباعة تسترجع أو تستبدل خلال 24 ساعة بشرط حالتها الأصلية مع إحضار الفاتورة.",
    headerNote: "أهلاً بكم في بيت الورد للزهور والهدايا 🌸",
    footerNote: "شكراً لزيارتكم بيت الورد 🌸 نسعد بخدمتكم دائماً."
  },
  barcodeLabelSettings: {
    labelSize: '50x25', // '50x25', '40x30', '38x25', '60x40'
    showStoreName: true,
    showProductName: true,
    showPrice: true,
    showVatText: true,
    showBarcodeNumber: true,
    labelCopiesDefault: 1
  },
  themeSettings: {
    fontFamily: 'Cairo', // 'Cairo', 'Tajawal', 'Almarai', 'IBM Plex Sans Arabic'
    fontSize: 'normal', // 'small', 'normal', 'large'
    themeColor: 'pink', // 'pink', 'purple', 'emerald', 'dark'
  },
  whatsappSettings: {
    enabled: true,
    storePhone: "0508333996",
    managerPhone: "0508333996",
    managerEmail: "manager@baytalward.com",
    managerName: "المدير العام",
    sendInvoiceAfterPayment: true,
    sendShiftReportOnClose: true,
    sendDebtReminders: true,
    enablePdfExport: true,
    enableImageExport: true,
    defaultShareFormat: "image",
    autoSendShiftReport: true,
    enableEmailExport: true,
    enableWhatsAppText: true,
    invoiceGreeting: "عزيزنا العميل، نشكر لك تسوقك من بيت الورد 🌸 تم إصدار فاتورتك الضريبية:",
    shiftCloseGreeting: "تقرير إغلاق الوردية والـ Z-Report لمدير المتجر 📊",
    debtGreeting: "عزيزنا العميل، نذكركم بوجود مستحقات مالية سابقة بقيمة:"
  },
  menuItemsOrder: ['dashboard', 'pos', 'invoices', 'products', 'customers', 'suppliers', 'expenses', 'cashDrawer', 'reports', 'settings'],
  visibleModules: {
    dashboard: true,
    pos: true,
    invoices: true,
    products: true,
    customers: true,
    suppliers: true,
    expenses: true,
    cashDrawer: true,
    reports: true,
    settings: true,
  }
};

export const INITIAL_CATEGORIES = [
  { id: 'cat-1', name: 'باقات الورد الطبيعي', icon: 'Flower2', color: '#BE185D' },
  { id: 'cat-2', name: 'فازات وتنسيقات ورد', icon: 'Sparkles', color: '#DB2777' },
  { id: 'cat-3', name: 'بوكسات الهدايا والشوكولاتة', icon: 'Gift', color: '#9333EA' },
  { id: 'cat-4', name: 'ورد أبدي ومجفف', icon: 'Heart', color: '#E11D48' },
  { id: 'cat-5', name: 'بالونات وتغليف', icon: 'PartyPopper', color: '#C084FC' },
  { id: 'cat-6', name: 'كروت وإكسسوارات', icon: 'Bookmark', color: '#F472B6' },
];

export const INITIAL_PRODUCTS = [];

export const INITIAL_CUSTOMERS = [
  {
    id: 'cust-1',
    name: 'عميل نقدي عام',
    phone: '-',
    balance: 0,
    address: '-',
    isDefault: true
  }
];

export const INITIAL_SUPPLIERS = [];

// =========================================================================
//  المستخدمون الافتراضيون — بلا أرقام دخول عمداً
// =========================================================================
//  ما كان هنا: pin: '1234' و '5555' و '7777' نصّاً صريحاً. وهذه ليست
//  بيانات بذرة بريئة — الملف يُحزَم مع البرنامج، فكانت الأرقام الثلاثة
//  تُقرأ حرفياً من ملف الإنتاج المنشور على الإنترنت
//  (dist/assets/index-*.js يحوي pin:"1234"). أي أن من يعرف الرابط
//  ويصل إلى جهاز مسجَّل دخوله في Firebase يدخل محاسباً أو مشرفاً.
//  والمفارقة أن الثلاثة كلها في قائمة WEAK_PINS التي يرفضها
//  validatePinStrength نفسه عند تعيين رقم جديد.
//
//  وكان المدير user-2 بلا pin وبلا pinHash، و verifyPin ترفض من لا
//  تجزئة له — فاجتمع الأسوأ: الحسابات الضعيفة المنشورة تعمل وحساب
//  المالك مقفل على أي تثبيت نظيف.
//
//  البديل: لا رقم لأحد في البذرة إطلاقاً. وعند أول تشغيل يرى من سجّل
//  دخوله بحساب Firebase شاشةَ «تهيئة أول رقم» فيضع رقم المدير بيده
//  (AppContext → needsPinSetup و setupInitialPin). الرقم لا يمرّ
//  بالكود ولا بملفات البناء ولا بـ git.
// =========================================================================
export const INITIAL_USERS = [
  {
    "id": "user-2",
    "name": "مدير المتجر (المدير العام)",
    "role": "admin",
    "roleName": "مدير نظام كامل الصلاحيات",
    "phone": "0508333996",
    "isActive": true,
    "avatar": "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=60",
    "nfcCardId": "",
    "permissions": {
      "customers_add": true,
      "customers_delete": true,
      "customers_manage": true,
      "customers_receipt_voucher": true,
      "drawer_cash_movement": true,
      "drawer_delete_shifts": true,
      "drawer_manage": true,
      "drawer_open_close": true,
      "drawer_view_shifts_history": true,
      "expenses_add": true,
      "expenses_delete": true,
      "expenses_manage": true,
      "invoices_export": true,
      "invoices_refund": true,
      "invoices_send_whatsapp": true,
      "invoices_view": true,
      "pos_clear_cart": true,
      "pos_credit_sale": true,
      "pos_custom_item": true,
      "pos_delete_item": true,
      "pos_discount": true,
      "pos_hold_bill": true,
      "pos_price_override": true,
      "pos_reprint_last": true,
      "products_add": true,
      "products_adjust_stock": true,
      "products_barcode_print": true,
      "products_delete": true,
      "products_edit": true,
      "products_view": true,
      "products_view_cost": true,
      "purchases_add": true,
      "purchases_delete": true,
      "reports_export": true,
      "reports_vat_zatca": true,
      "reports_view_profits": true,
      "reports_view_sales": true,
      "settings_cloud_sync_backup": true,
      "settings_manage_users": true,
      "settings_payment_methods": true,
      "settings_printers_whatsapp": true,
      "settings_reset_accounts": true,
      "settings_store_info": true,
      "settings_terminal_nami": true,
      "suppliers_add": true,
      "suppliers_delete": true,
      "suppliers_manage": true,
      "suppliers_payment_voucher": true,
      "treasury_manage": true
    },
    "bonusRule": {
      "enabled": false,
      "base": "net_sales",
      "type": "percent",
      "percent": 1,
      "perInvoice": 0,
      "tiers": [],
      "threshold": 0,
      "cap": 0,
      "deductShortage": false
    }
  },
  {
    "id": "user-1788564143104",
    "name": "نايف",
    "role": "supervisor",
    "roleName": "مشرف مبيعات ومخزون",
    "phone": "",
    "isActive": true,
    "avatar": "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=60",
    "nfcCardId": "",
    "permissions": {
      "customers_add": true,
      "customers_delete": true,
      "customers_manage": true,
      "customers_receipt_voucher": true,
      "drawer_cash_movement": false,
      "drawer_delete_shifts": false,
      "drawer_open_close": true,
      "drawer_view_shifts_history": true,
      "expenses_add": true,
      "expenses_delete": true,
      "expenses_manage": true,
      "invoices_export": true,
      "invoices_refund": true,
      "invoices_send_whatsapp": true,
      "invoices_view": true,
      "pos_clear_cart": true,
      "pos_credit_sale": true,
      "pos_custom_item": true,
      "pos_delete_item": true,
      "pos_discount": true,
      "pos_hold_bill": true,
      "pos_price_override": true,
      "pos_reprint_last": true,
      "products_add": true,
      "products_adjust_stock": true,
      "products_barcode_print": true,
      "products_delete": true,
      "products_edit": true,
      "products_view": true,
      "products_view_cost": true,
      "purchases_add": true,
      "purchases_delete": true,
      "reports_export": true,
      "reports_vat_zatca": true,
      "reports_view_profits": true,
      "reports_view_sales": true,
      "settings_cloud_sync_backup": true,
      "settings_manage_users": true,
      "settings_payment_methods": true,
      "settings_printers_whatsapp": true,
      "settings_store_info": true,
      "settings_terminal_nami": true,
      "suppliers_add": true,
      "suppliers_delete": true,
      "suppliers_manage": true,
      "suppliers_payment_voucher": true
    },
    "bonusRule": {
      "enabled": false,
      "base": "net_sales",
      "type": "percent",
      "percent": 1,
      "perInvoice": 0,
      "tiers": [],
      "threshold": 0,
      "cap": 0,
      "deductShortage": false
    }
  },
  {
    "id": "user-1",
    "name": "روان",
    "role": "cashier",
    "roleName": "كاشير مبيعات (نقاط البيع)",
    "phone": "0555555555",
    "isActive": true,
    "avatar": "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=60",
    "nfcCardId": "",
    "permissions": {
      "customers_add": true,
      "customers_delete": true,
      "customers_manage": true,
      "customers_receipt_voucher": true,
      "drawer_cash_movement": true,
      "drawer_delete_shifts": true,
      "drawer_manage": true,
      "drawer_open_close": true,
      "drawer_view_shifts_history": true,
      "expenses_add": true,
      "expenses_delete": true,
      "expenses_manage": true,
      "invoices_export": true,
      "invoices_refund": true,
      "invoices_send_whatsapp": true,
      "invoices_view": true,
      "pos_clear_cart": true,
      "pos_credit_sale": true,
      "pos_custom_item": true,
      "pos_delete_item": true,
      "pos_discount": true,
      "pos_hold_bill": true,
      "pos_price_override": true,
      "pos_reprint_last": true,
      "products_add": true,
      "products_adjust_stock": true,
      "products_barcode_print": true,
      "products_delete": true,
      "products_edit": true,
      "products_view": true,
      "products_view_cost": true,
      "purchases_add": true,
      "purchases_delete": true,
      "reports_export": true,
      "reports_vat_zatca": true,
      "reports_view_profits": true,
      "reports_view_sales": true,
      "settings_cloud_sync_backup": true,
      "settings_manage_users": true,
      "settings_payment_methods": true,
      "settings_printers_whatsapp": true,
      "settings_reset_accounts": true,
      "settings_store_info": true,
      "settings_terminal_nami": true,
      "suppliers_add": true,
      "suppliers_delete": true,
      "suppliers_manage": true,
      "suppliers_payment_voucher": true,
      "treasury_manage": true
    },
    "bonusRule": {
      "enabled": true,
      "base": "gross_profit",
      "type": "percent",
      "percent": 5,
      "perInvoice": 0,
      "tiers": [],
      "threshold": 0,
      "cap": 0,
      "deductShortage": true
    }
  },
  {
    "id": "user-1788635756843",
    "name": "فاطمة",
    "role": "cashier",
    "roleName": "كاشير مبيعات (نقاط البيع)",
    "phone": "",
    "isActive": true,
    "avatar": "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=60",
    "nfcCardId": "",
    "permissions": {
      "customers_add": true,
      "customers_delete": true,
      "customers_manage": true,
      "customers_receipt_voucher": true,
      "drawer_cash_movement": true,
      "drawer_delete_shifts": true,
      "drawer_manage": true,
      "drawer_open_close": true,
      "drawer_view_shifts_history": true,
      "expenses_add": true,
      "expenses_delete": true,
      "expenses_manage": true,
      "invoices_export": true,
      "invoices_refund": true,
      "invoices_send_whatsapp": true,
      "invoices_view": true,
      "pos_clear_cart": true,
      "pos_credit_sale": true,
      "pos_custom_item": true,
      "pos_delete_item": true,
      "pos_discount": true,
      "pos_hold_bill": true,
      "pos_price_override": true,
      "pos_reprint_last": true,
      "products_add": true,
      "products_adjust_stock": true,
      "products_barcode_print": true,
      "products_delete": true,
      "products_edit": true,
      "products_view": true,
      "products_view_cost": true,
      "purchases_add": true,
      "purchases_delete": true,
      "reports_export": true,
      "reports_vat_zatca": true,
      "reports_view_profits": true,
      "reports_view_sales": true,
      "settings_cloud_sync_backup": true,
      "settings_manage_users": true,
      "settings_payment_methods": true,
      "settings_printers_whatsapp": true,
      "settings_reset_accounts": true,
      "settings_store_info": true,
      "settings_terminal_nami": true,
      "suppliers_add": true,
      "suppliers_delete": true,
      "suppliers_manage": true,
      "suppliers_payment_voucher": true,
      "treasury_manage": true
    },
    "bonusRule": {
      "enabled": true,
      "base": "gross_profit",
      "type": "percent",
      "percent": 5,
      "perInvoice": 0,
      "tiers": [],
      "threshold": 0,
      "cap": 0,
      "deductShortage": true
    }
  },
  {
    "id": "user-3",
    "name": "نوره",
    "role": "accountant",
    "roleName": "محاسب ومدقق مالي",
    "phone": "0558442661",
    "isActive": true,
    "avatar": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=60",
    "nfcCardId": "",
    "permissions": {
      "customers_delete": false,
      "customers_manage": true,
      "customers_receipt_voucher": true,
      "drawer_cash_movement": true,
      "drawer_open_close": true,
      "expenses_delete": true,
      "expenses_manage": true,
      "invoices_export": true,
      "invoices_refund": true,
      "invoices_send_whatsapp": true,
      "invoices_view": true,
      "pos_clear_cart": false,
      "pos_credit_sale": false,
      "pos_custom_item": false,
      "pos_delete_item": false,
      "pos_discount": false,
      "pos_hold_bill": false,
      "pos_price_override": false,
      "pos_reprint_last": false,
      "products_add": false,
      "products_adjust_stock": true,
      "products_barcode_print": false,
      "products_delete": false,
      "products_edit": false,
      "products_view": true,
      "products_view_cost": true,
      "reports_export": true,
      "reports_vat_zatca": true,
      "reports_view_profits": true,
      "reports_view_sales": true,
      "settings_cloud_sync_backup": true,
      "settings_manage_users": false,
      "settings_payment_methods": false,
      "settings_printers_whatsapp": false,
      "settings_store_info": false,
      "settings_terminal_nami": false,
      "suppliers_delete": false,
      "suppliers_manage": true,
      "suppliers_payment_voucher": true
    },
    "bonusRule": {
      "enabled": false,
      "base": "net_sales",
      "type": "percent",
      "percent": 1,
      "perInvoice": 0,
      "tiers": [],
      "threshold": 0,
      "cap": 0,
      "deductShortage": false
    }
  }
];
