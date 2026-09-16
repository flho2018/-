// =========================================================================
// تفاصيل الصلاحيات والأدوار الوظيفية لنظام كاشير بيت الورد
// =========================================================================

export const PERMISSION_CATEGORIES = [
  {
    id: 'pos',
    name: 'نقطة البيع والكاشير (POS & Sales)',
    icon: 'ShoppingCart',
    color: 'from-pink-600 to-rose-600',
    permissions: [
      { key: 'pos_discount', label: 'تطبيق خصم على الفاتورة (مبلغ أو نسبة)', desc: 'السماح بإدخال خصم يدوي على إجمالي الفاتورة' },
      { key: 'pos_price_override', label: 'تعديل سعر الصنف في السلة بمجرد النقر عليه', desc: 'السماح للمستخدم بالنقر المباشر على سعر أي منتج أو خدمة في السلة وتغييره فوراً' },
      { key: 'pos_delete_item', label: 'حذف أصناف من السلة', desc: 'إمكانية إزالة منتج مضاف للسلة قبل إتمام الدفع' },
      { key: 'pos_clear_cart', label: 'إلغاء ومسح الفاتورة بالكامل', desc: 'تفريغ السلة وإلغاء عملية البيع الجارية' },
      { key: 'pos_hold_bill', label: 'تعليق واسترجاع الفواتير', desc: 'حفظ الفاتورة مؤقتاً لخدمة عميل آخر والعودة لها' },
      { key: 'pos_custom_item', label: 'إضافة صنف حر / مخصص', desc: 'إدخال اسم وسعر منتج غير مسجل مسبقاً في المخزون' },
      { key: 'pos_credit_sale', label: 'البيع الآجل (على الحساب)', desc: 'إصدار فواتير ذمم آجلة للعملاء المسجلين' },
      { key: 'pos_reprint_last', label: 'إعادة طباعة آخر فاتورة', desc: 'طباعة نسخة إضافية من آخر عملية بيع' }
    ]
  },
  {
    id: 'invoices',
    name: 'سجل الفواتير والمرتجعات (Invoices & Refunds)',
    icon: 'Receipt',
    color: 'from-purple-600 to-indigo-600',
    permissions: [
      { key: 'invoices_view', label: 'استعراض سجل الفواتير والمبيعات', desc: 'رؤية الفواتير الصادرة وتفاصيل الأصناف المباعة' },
      { key: 'invoices_refund', label: 'إصدار مرتجع واسترجاع المبالغ', desc: 'إلغاء الفاتورة وإعادة الكميات للمخزون ورصيد الصندوق' },
      { key: 'invoices_export', label: 'تصدير الفواتير كـ PDF و Excel', desc: 'تنزيل كشوف الفواتير بصيغ ملفات خارجية' },
      { key: 'invoices_send_whatsapp', label: 'إرسال الفاتورة عبر الواتساب', desc: 'مشاركة رابط أو صورة الفاتورة للعميل مباشرة' }
    ]
  },
  {
    id: 'products',
    name: 'المنتجات والمخزون والتسعير (Inventory & Products)',
    icon: 'Package',
    color: 'from-blue-600 to-cyan-600',
    permissions: [
      { key: 'products_view', label: 'استعراض قائمة المنتجات والتصنيفات', desc: 'رؤية كشف الأصناف والكميات المتوفرة' },
      { key: 'products_add', label: 'إضافة منتجات وتصنيفات جديدة', desc: 'تسجيل أصناف وأقسام جديدة في قاعدة البيانات' },
      { key: 'products_edit', label: 'تعديل بيانات وأسعار بيع المنتجات', desc: 'تحديث الأسعار، الأسماء، والباركود' },
      { key: 'products_delete', label: 'حذف المنتجات من النظام', desc: 'مسح الصنف نهائياً من قائمة المتجر' },
      { key: 'products_view_cost', label: 'رؤية سعر التكلفة وهوامش الربح', desc: 'إظهار سعر شراء المنتج ومقدار الربح المحقق' },
      { key: 'products_adjust_stock', label: 'تسوية وتعديل كميات المخزون والجرد', desc: 'تعديل الرصيد الفعلي في المستودع' },
      { key: 'products_barcode_print', label: 'طباعة ملصقات الباركود والأسعار', desc: 'توليد وطباعة استكرات الباركود للأصناف' }
    ]
  },
  {
    id: 'customers_suppliers',
    name: 'العملاء والموردين والمشتريات (CRM & Purchases)',
    icon: 'Users',
    color: 'from-emerald-600 to-teal-600',
    permissions: [
      { key: 'customers_manage', label: 'استعراض وتعديل بيانات العملاء', desc: 'رؤية كشف العملاء ومتابعة أرصدتهم' },
      { key: 'customers_add', label: 'إضافة عملاء جدد', desc: 'تسجيل حساب عميل جديد' },
      { key: 'customers_delete', label: 'حذف العملاء من النظام', desc: 'مسح حساب العميل نهائياً' },
      { key: 'customers_receipt_voucher', label: 'إنشاء سندات قبض وتحصيل الديون', desc: 'تسجيل دفعات سداد المبالغ الآجلة من العملاء' },
      { key: 'suppliers_manage', label: 'استعراض وتعديل بيانات الموردين', desc: 'رؤية كشف الموردين والأرصدة الدائنة' },
      { key: 'suppliers_add', label: 'إضافة موردين جدد', desc: 'تسجيل مورد جديد في النظام' },
      { key: 'suppliers_delete', label: 'حذف الموردين من النظام', desc: 'مسح بيانات المورد نهائياً' },
      { key: 'purchases_add', label: 'إضافة وتسجيل فواتير المشتريات', desc: 'تسجيل بضاعة جديدة وزيادة كميات المخزون' },
      { key: 'purchases_delete', label: 'حذف وإلغاء فواتير المشتريات', desc: 'مسح فاتورة الشراء وتعديل رصيد المورد' },
      { key: 'suppliers_payment_voucher', label: 'إنشاء سندات صرف وسداد الموردين', desc: 'توثيق المبالغ المدفوعة للموردين من الصندوق' }
    ]
  },
  {
    id: 'drawer_expenses',
    name: 'الخزينة والوردية والمصروفات (Cash Drawer & Expenses)',
    icon: 'DollarSign',
    color: 'from-amber-600 to-yellow-600',
    permissions: [
      { key: 'drawer_open_close', label: 'فتح وإغلاق الوردية وطباعة تقرير Z', desc: 'بدء وردية الكاشير وتصفير الخزينة وإقفالها' },
      { key: 'drawer_view_shifts_history', label: 'استعراض سجل وتقارير الورديات السابقة', desc: 'رؤية تفاصيل ورديات جميع الكاشيرات والمستخدمين' },
      { key: 'drawer_delete_shifts', label: 'حذف تقارير الورديات السابقة (خاص بالمدير)', desc: 'صلاحية استثنائية لمسح وإلغاء تقارير الورديات من الأرشيف' },
      { key: 'drawer_cash_movement', label: 'السحب والإيداع اليدوي (Cash In / Out)', desc: 'إضافة عهدة نقدية أو سحب نقدية من الدرج لسبب طارئ' },
      // ملاحظة: هذان المفتاحان كانا مفحوصين في الكود (١١ موضعاً في AppContext
      // وشاشات الدرج) لكنهما غير معرّفين هنا، فكان checkUserPermission يرجع
      // false دائماً لغير المدير — فتُقفل ميزات الخزينة على المدير وحده ولا
      // يمكن منحها للمحاسب أو المشرف من شاشة الصلاحيات إطلاقاً.
      { key: 'drawer_manage', label: 'إدارة أدراج الكاشيرات واستلام العهد', desc: 'استلام عهدة الكاشير وإدارة أدراج بقية المستخدمين' },
      { key: 'treasury_manage', label: 'إدارة الخزينة المركزية والإيداع البنكي', desc: 'استلام كاش الورديات في خزينة الإدارة وتسجيل الإيداعات البنكية' },
      { key: 'expenses_manage', label: 'استعراض المصروفات والنثريات اليومية', desc: 'رؤية كشف المصاريف والمدفوعات' },
      { key: 'expenses_add', label: 'إضافة وتسجيل سند مصروفات أو إيراد جديد', desc: 'توثيق مصاريف المتجر والرواتب والإيجارات' },
      { key: 'expenses_delete', label: 'حذف وإلغاء سندات المصروفات والإيرادات', desc: 'مسح سند الصرف وتعديل أثر النقدية' }
    ]
  },
  {
    id: 'reports',
    name: 'التقارير المالية والأرباح وإقرار الزكاة',
    icon: 'PieChart',
    color: 'from-rose-600 to-pink-700',
    permissions: [
      { key: 'reports_view_sales', label: 'استعراض تقارير المبيعات وحركة الفترات', desc: 'رؤية إجمالي الدخل وحركة المبيعات اليومية والشهرية' },
      { key: 'reports_view_profits', label: 'رؤية تقارير الأرباح الصافية والمكاسب', desc: 'كشف الأرباح بعد خصم التكاليف والمصروفات' },
      { key: 'reports_vat_zatca', label: 'استعراض تقرير ضريبة القيمة المضافة ZATCA', desc: 'كشف الضريبة المستحقة للزكاة والضريبة والجمارك' },
      { key: 'reports_export', label: 'تصدير التقارير المالية والضريبية', desc: 'تنزيل التقارير كملفات PDF و Excel' }
    ]
  },
  {
    id: 'settings',
    name: 'إعدادات النظام والتهيئة الشاملة (System Settings)',
    icon: 'Settings',
    color: 'from-slate-700 to-slate-900',
    permissions: [
      { key: 'settings_store_info', label: 'تعديل هوية المتجر والرقم الضريبي', desc: 'تغيير اسم المتجر، الشعار، ورقم السجل التجاري' },
      { key: 'settings_payment_methods', label: 'إدارة وتعديل وسائل الدفع والأيقونات', desc: 'إضافة، حذف، وإعادة ترتيب طرق الدفع' },
      { key: 'settings_terminal_nami', label: 'إعدادات ربط جهاز الدفع نامي (ECR/USB)', desc: 'برمجة منافذ الاتصال لجهاز نقاط البيع' },
      { key: 'settings_printers_whatsapp', label: 'ضبط إعدادات الطابعة والواتساب والمظهر', desc: 'تخصيص مقاس الورق ونصوص رسائل الواتساب' },
      { key: 'settings_manage_users', label: 'إدارة المستخدمين والصلاحيات والـ PIN', desc: 'إنشاء كاشيرات ومدراء وتحديد صلاحيات كل موظف' },
      { key: 'settings_cloud_sync_backup', label: 'المزامنة السحابية والنسخ الاحتياطي', desc: 'سحب ورفع البيانات والنسخ التلقائي' },
      // مفتاح مستقلّ لأخطر شاشة في النظام. كانت شاشة التصفير تُفتح بصلاحية
      // «النسخ الاحتياطي» — أي أن من يُؤتمن على أخذ نسخة كان يُؤتمن على
      // محو كل شيء. حفظ البيانات وإتلافها ليسا صلاحية واحدة.
      { key: 'settings_reset_accounts', label: '⛔ تصفير الحسابات والبيانات', desc: 'محو الفواتير والأرصدة والورديات — لا يُمنح إلا للمالك' }
    ]
  }
];

export const ALL_PERMISSION_KEYS = PERMISSION_CATEGORIES.flatMap(c => c.permissions.map(p => p.key));

export const FULL_ADMIN_PERMISSIONS = ALL_PERMISSION_KEYS.reduce((acc, key) => {
  acc[key] = true;
  return acc;
}, {});

export const ROLE_PRESETS = [
  {
    id: 'admin',
    name: 'مدير نظام كامل الصلاحيات',
    badge: '👑 مدير النظام',
    color: 'from-purple-600 to-indigo-700',
    permissions: { ...FULL_ADMIN_PERMISSIONS }
  },
  {
    id: 'cashier',
    name: 'كاشير مبيعات (نقاط البيع)',
    badge: '🌸 كاشير',
    color: 'from-pink-600 to-rose-600',
    permissions: {
      pos_discount: false,
      pos_price_override: false,
      pos_delete_item: true,
      pos_clear_cart: true,
      pos_hold_bill: true,
      pos_custom_item: true,
      pos_credit_sale: true,
      pos_reprint_last: true,
      invoices_view: true,
      invoices_refund: true,      // يحق للكاشير الاسترجاع عند غياب المدير
      invoices_export: false,
      invoices_send_whatsapp: true,
      products_view: true,
      products_add: false,
      products_edit: false,
      products_delete: false,
      products_view_cost: true,   // يرى التكلفة، ولا يرى الأرباح (reports_view_profits: false)
      products_adjust_stock: false,
      products_barcode_print: false,
      customers_manage: true,
      customers_add: true,
      customers_delete: false,
      customers_receipt_voucher: true,
      suppliers_manage: false,
      suppliers_add: false,
      suppliers_delete: false,
      purchases_add: false,
      purchases_delete: false,
      suppliers_payment_voucher: false,
      drawer_open_close: true,
      drawer_view_shifts_history: false,
      drawer_delete_shifts: false,
      drawer_cash_movement: false,
      drawer_manage: false,
      treasury_manage: false,
      expenses_manage: false,
      expenses_add: false,
      expenses_delete: false,
      reports_view_sales: false,
      reports_view_profits: false,
      reports_vat_zatca: false,
      reports_export: false,
      settings_store_info: false,
      settings_payment_methods: false,
      settings_terminal_nami: false,
      settings_printers_whatsapp: false,
      settings_manage_users: false,
      settings_cloud_sync_backup: false,
      settings_reset_accounts: false
    }
  },
  {
    id: 'supervisor',
    name: 'مشرف مبيعات ومخزون',
    badge: '⭐ مشرف فرع',
    color: 'from-blue-600 to-cyan-600',
    permissions: {
      pos_discount: true,
      pos_price_override: true,
      pos_delete_item: true,
      pos_clear_cart: true,
      pos_hold_bill: true,
      pos_custom_item: true,
      pos_credit_sale: true,
      pos_reprint_last: true,
      invoices_view: true,
      invoices_refund: true,
      invoices_export: true,
      invoices_send_whatsapp: true,
      products_view: true,
      products_add: true,
      products_edit: true,
      products_delete: false,
      products_view_cost: false,
      products_adjust_stock: true,
      products_barcode_print: true,
      customers_manage: true,
      customers_add: true,
      customers_delete: false,
      customers_receipt_voucher: true,
      suppliers_manage: true,
      suppliers_add: true,
      suppliers_delete: false,
      purchases_add: true,
      purchases_delete: false,
      suppliers_payment_voucher: true,
      drawer_open_close: true,
      drawer_view_shifts_history: true,
      drawer_delete_shifts: false,
      drawer_cash_movement: true,
      drawer_manage: true,
      treasury_manage: false,
      expenses_manage: true,
      expenses_add: true,
      expenses_delete: false,
      reports_view_sales: true,
      reports_view_profits: false,
      reports_vat_zatca: false,
      reports_export: true,
      settings_store_info: false,
      settings_payment_methods: false,
      settings_terminal_nami: false,
      settings_printers_whatsapp: false,
      settings_manage_users: false,
      settings_cloud_sync_backup: false,
      settings_reset_accounts: false
    }
  },
  {
    id: 'accountant',
    name: 'محاسب ومدقق مالي',
    badge: '💼 محاسب مالي',
    color: 'from-emerald-600 to-teal-700',
    permissions: {
      pos_discount: false,
      pos_price_override: false,
      pos_delete_item: false,
      pos_clear_cart: false,
      pos_hold_bill: false,
      pos_custom_item: false,
      pos_credit_sale: false,
      pos_reprint_last: false,
      invoices_view: true,
      invoices_refund: true,
      invoices_export: true,
      invoices_send_whatsapp: true,
      products_view: true,
      products_add: false,
      products_edit: false,
      products_delete: false,
      products_view_cost: true,
      products_adjust_stock: true,
      products_barcode_print: false,
      customers_manage: true,
      customers_add: true,
      customers_delete: false,
      customers_receipt_voucher: true,
      suppliers_manage: true,
      suppliers_add: true,
      suppliers_delete: true,
      purchases_add: true,
      purchases_delete: true,
      suppliers_payment_voucher: true,
      drawer_open_close: true,
      drawer_view_shifts_history: true,
      drawer_delete_shifts: false,
      drawer_cash_movement: true,
      drawer_manage: true,
      treasury_manage: true,
      expenses_manage: true,
      expenses_add: true,
      expenses_delete: true,
      reports_view_sales: true,
      reports_view_profits: true,
      reports_vat_zatca: true,
      reports_export: true,
      settings_store_info: false,
      settings_payment_methods: false,
      settings_terminal_nami: false,
      settings_printers_whatsapp: false,
      settings_manage_users: false,
      settings_cloud_sync_backup: true,
      settings_reset_accounts: false
    }
  }
];

// =========================================================================
//  خرائط مساعدة: مفاتيح الصلاحيات وأسماؤها العربية
// =========================================================================
//  P يُستخدم بدل كتابة المفتاح نصاً، فخطأ الكتابة يصبح خطأ برمجياً ظاهراً
//  بدل صلاحية تُرفض صامتة. مثال: P.INVOICES_REFUND
// =========================================================================
export const P = ALL_PERMISSION_KEYS.reduce((acc, key) => {
  acc[key.toUpperCase()] = key;
  return acc;
}, {});

/** المفتاح → التسمية العربية المعروضة (تُستخدم في رسائل الرفض) */
export const PERMISSION_LABELS = PERMISSION_CATEGORIES.reduce((acc, cat) => {
  cat.permissions.forEach(p => { acc[p.key] = p.label; });
  return acc;
}, {});

/**
 * يتحقق من صلاحية واحدة.
 *
 * @param {object|null} user
 * @param {string} permissionKey
 * @param {{notify?: Function}} [options]  عند تمرير notify تظهر رسالة رفض واضحة
 * @returns {boolean}
 */
export const checkUserPermission = (user, permissionKey, options = {}) => {
  const allowed = (() => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'مدير النظام' || user.isAdmin) return true;
    // =====================================================================
    //  المفتاح غير الموجود في بطاقة المستخدم يرجع لقالب دوره
    // =====================================================================
    //  كان الفحص `!!user.permissions[key]` فور وجود كائن الصلاحيات. وبما أن
    //  الكائن **لقطة جامدة** تُحفظ يوم إنشاء المستخدم، فأي صلاحية تُضاف
    //  للنظام لاحقاً تكون غائبة عن بطاقات كل الموظفين الحاليين فتُمنع عنهم
    //  **صامتة** — ميزة جديدة لا تعمل لأحد ولا رسالة تشرح لماذا، حتى
    //  يُعاد حفظ كل بطاقة يدوياً.
    //  الآن: المفتاح الموجود في البطاقة يُحترم كما هو (بما فيه المنع
    //  الصريح `false`)، والمفتاح **الغائب وحده** يرجع لقالب الدور.
    // =====================================================================
    const preset = ROLE_PRESETS.find(r => r.id === user.role);
    if (user.permissions && typeof user.permissions === 'object') {
      if (permissionKey in user.permissions) return !!user.permissions[permissionKey];
      if (preset && preset.permissions) return !!preset.permissions[permissionKey];
      return false;
    }
    // لا كائن صلاحيات إطلاقاً: قالب الدور يحمي النظام
    if (preset && preset.permissions) {
      return !!preset.permissions[permissionKey];
    }
    return false;
  })();

  if (!allowed && typeof options.notify === 'function') {
    const label = PERMISSION_LABELS[permissionKey] || permissionKey;
    options.notify('⛔ ليس لديك صلاحية: ' + label + '\nتُمنح من: الإعدادات ← المستخدمون ← الصلاحيات.', 'error');
  }
  return allowed;
};

// =========================================================================
//  الدوال التي يعتمد عليها usePermission.js
// =========================================================================
//  كانت مفقودة تماماً من هذا الملف، فكان أي استيراد لـ usePermission
//  يُفشل تحميل الشاشة بخطأ استيراد. لذلك بقي الملف كله بلا استخدام.
// =========================================================================

/** صلاحية واحدة — اسم مختصر لـ checkUserPermission */
export const hasPermission = (user, perm, options) =>
  checkUserPermission(user, perm, options);

/** يكفي أن يملك واحدة من القائمة */
export const hasAnyPermission = (user, perms = []) =>
  Array.isArray(perms) && perms.some(p => checkUserPermission(user, p));

/** يجب أن يملكها كلها */
export const hasAllPermissions = (user, perms = []) =>
  Array.isArray(perms) && perms.length > 0 && perms.every(p => checkUserPermission(user, p));

/**
 * كائن الصلاحيات الفعلي للمستخدم بعد حسم الدور والتخصيص.
 * المدير: كل المفاتيح true. غيره: صلاحياته المخصّصة، أو قالب دوره.
 */
export const resolvePermissions = (user) => {
  if (!user) return {};
  if (user.role === 'admin' || user.role === 'مدير النظام' || user.isAdmin) {
    return { ...FULL_ADMIN_PERMISSIONS };
  }
  if (user.permissions && typeof user.permissions === 'object') {
    return { ...user.permissions };
  }
  const preset = ROLE_PRESETS.find(r => r.id === user.role);
  return preset?.permissions ? { ...preset.permissions } : {};
};

// =========================================================================
//  التحقق من صلاحية الدخول لشاشة كاملة (تُستخدم في القائمة الجانبية)
// =========================================================================
//  تربط كل شاشة بالصلاحية التي تفتحها. الشاشة التي لا يملك المستخدم
//  صلاحيتها لا تظهر له في القائمة أصلاً.
//  المدير يمرّ دائماً عبر checkUserPermission.
// =========================================================================
const MODULE_PERMISSION_MAP = {
  dashboard:   null,                  // الرئيسية متاحة للجميع
  pos:         null,                  // نقطة البيع متاحة لكل من يسجّل الدخول
  invoices:    'invoices_view',
  products:    'products_view',
  customers:   'customers_manage',
  suppliers:   'suppliers_manage',
  expenses:    'expenses_add',
  cashDrawer:  'drawer_open_close',
  reports:     'reports_view_sales',
  userReports: 'reports_view_sales',
  ownerMobileDashboard: 'reports_view_profits', // لوحة المالك للمدير وحاملي صلاحية الأرباح
  settings:    'settings_store_info'
};

export const canAccessModule = (user, moduleKey) => {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'مدير النظام' || user.isAdmin) return true;

  // =======================================================================
  //  الشاشة غير المسجّلة في الخريطة: تُمنع لا تُفتح
  // =======================================================================
  //  كان الافتراض «نسمح بدل أن نخفي شاشة بلا سبب». عملياً هذا يعني أن أي
  //  شاشة جديدة تُضاف وينسى كاتبها تسجيلها هنا تنفتح **للجميع** — والنسيان
  //  هو الحالة الغالبة. الافتراض الآمن في نظام فيه نقد ومخزون هو المنع:
  //  شاشة محجوبة تُكتشف في دقيقة، وشاشة مفتوحة للجميع قد لا تُكتشف أبداً.
  // =======================================================================
  if (!(moduleKey in MODULE_PERMISSION_MAP)) {
    console.warn('[Permissions] شاشة غير مسجّلة في MODULE_PERMISSION_MAP — مُنعت افتراضياً:', moduleKey);
    return false;
  }

  const required = MODULE_PERMISSION_MAP[moduleKey];
  if (!required) return true;   // شاشة لا تحتاج صلاحية خاصة

  // شاشة الإعدادات تُفتح بأي صلاحية إعدادات يملكها المستخدم
  if (moduleKey === 'settings') {
    return [
      'settings_store_info',
      'settings_manage_users',
      'settings_payment_methods',
      'settings_printers_whatsapp',
      'settings_cloud_sync_backup',
      'settings_reset_accounts',
      'settings_terminal_nami'
    ].some(k => checkUserPermission(user, k));
  }

  return checkUserPermission(user, required);
};
