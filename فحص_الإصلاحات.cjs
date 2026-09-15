/* =========================================================================
 *  فحص_الإصلاحات.cjs — تحقق تلقائي من تطبيق كل الإصلاحات
 * =========================================================================
 *  شغّله من داخل مجلد المشروع (بجوار package.json):
 *
 *      node فحص_الإصلاحات.cjs
 *
 *  لا يعدّل أي ملف — يقرأ فقط ويطبع تقريراً.
 * ========================================================================= */

const fs = require('fs');
const path = require('path');

const S = (p) => path.join('src', ...p.split('/'));

// [رقم, وصف, الملف, نص يجب أن يوجد | {absent: نص يجب ألا يوجد}]
const CHECKS = [
  [1, 'الباب الخلفي (PIN 9999) محذوف', 'components/settings/ResetAccountsTab.jsx', { absent: "cleanPin === '9999'" }],
  [2, 'مقارنة PIN النصية الصريحة محذوفة', 'components/settings/ResetAccountsTab.jsx', { absent: 'admin.pin && String(admin.pin)' }],
  [3, 'الحد من محاولات PIN مربوط', 'components/auth/PinLockModal.jsx', 'recordFailedPin'],
  [4, 'بوابة المحاولات تُفحص قبل التحقق', 'components/auth/PinLockModal.jsx', "checkPinAttempt('global')"],
  [5, 'مفتاح treasury_manage في الكتالوج', 'utils/permissions.js', "key: 'treasury_manage'"],
  [6, 'مفتاح drawer_manage في الكتالوج', 'utils/permissions.js', "key: 'drawer_manage'"],
  [7, 'دالة resolvePermissions مضافة', 'utils/permissions.js', 'export const resolvePermissions'],
  [8, 'دالة hasAnyPermission مضافة', 'utils/permissions.js', 'export const hasAnyPermission'],
  [9, 'خريطة PERMISSION_LABELS مضافة', 'utils/permissions.js', 'export const PERMISSION_LABELS'],
  [10, 'checkUserPermission يدعم notify', 'utils/permissions.js', 'options.notify'],
  [11, 'حارس شاشة الإعدادات', 'App.jsx', "canAccessModule(currentUser, 'settings')"],
  [12, 'حارس شاشة الخزينة', 'App.jsx', "checkUserPermission(currentUser, 'drawer_open_close')"],
  [13, 'حارس شاشة التقارير', 'App.jsx', "checkUserPermission(currentUser, 'reports_view_sales')"],
  [14, 'دالة تهريب HTML موجودة', 'utils/printHelper.js', 'const esc ='],
  [15, 'اسم الصنف مُهرَّب في الفاتورة', 'utils/printHelper.js', 'esc(itemName)'],
  [16, 'اسم العميل مُهرَّب', 'utils/printHelper.js', 'esc(invoice.customer.name)'],
  [17, 'منع الأسعار السالبة (إكسل)', 'utils/excelHelper.js', 'const cleanMoney'],
  [18, 'حماية __proto__ (إكسل)', 'utils/excelHelper.js', 'Object.create(null)'],
  [19, 'كمية التقارير مُصلَحة', 'components/reports/ReportsScreen.jsx', 'item.qty ?? item.quantity'],
  [20, 'كمية الشاشة الرئيسية مُصلَحة', 'components/dashboard/Dashboard.jsx', 'it.qty ?? it.quantity'],
  [21, 'كمية التقرير المالي مُصلَحة', 'components/reports/tabs/FinancialOverviewTab.jsx', 'it.qty ?? it.quantity'],
  [22, 'فحص قوة PIN عند التعيين', 'components/settings/UsersSettingsTab.jsx', 'validatePinStrength'],
  [23, 'الرمز لا يُمرَّر صريحاً', 'components/settings/UsersSettingsTab.jsx', { absent: 'pin: pin.trim()' }],
  [24, 'عرض حالة الرمز بدل undefined', 'components/settings/UsersSettingsTab.jsx', "user.pinHash ? 'معيَّن"],
  [25, 'حارس سند القبض (العملاء)', 'components/customers/CustomersScreen.jsx', "hasPermission('customers_receipt_voucher')"],
  [26, 'حارس سند الصرف (الموردين)', 'components/suppliers/SuppliersScreen.jsx', "hasPermission('suppliers_payment_voucher')"],
  [27, 'حارس فاتورة المشتريات', 'components/suppliers/SuppliersScreen.jsx', "hasPermission('purchases_add')"],
  [28, 'حارس تعديل الوردية المغلقة', 'components/reports/tabs/ShiftsHistoryLog.jsx', 'متاح للمدير وحده'],
  [29, 'رمز المدير لاستعادة النسخة', 'components/settings/BackupSettingsTab.jsx', 'verifyPin(String(importPin'],
  [30, 'قيد التدقيق بعد فحص الصلاحية', 'context/AppContext.jsx', 'الفحص قبل القيد'],
  [31, 'حارس addExpense الداخلي', 'context/AppContext.jsx', "checkUserPermission(currentUser, 'expenses_add')"],
  [32, 'حارس deleteExpense الداخلي', 'context/AppContext.jsx', "checkUserPermission(currentUser, 'expenses_delete')"],
  [33, 'حارس فتح استيراد إكسل', 'components/products/ProductsScreen.jsx', 'استيراد المنتجات من إكسيل'],
  [34, 'حارس تنفيذ استيراد إكسل', 'components/products/ExcelImportModal.jsx', 'checkUserPermission'],
  [35, 'إصلاح catMap في نافذة الاستيراد', 'components/products/ExcelImportModal.jsx', 'Object.create(null)'],
];

if (!fs.existsSync('src')) {
  console.log('\n❌ لم أجد مجلد src هنا.');
  console.log('   شغّل الأمر من داخل مجلد المشروع (حيث يوجد package.json).\n');
  process.exit(1);
}

let pass = 0, fail = 0, missing = 0;
const failures = [];

console.log('\n══════════════════════════════════════════════════════');
console.log('   فحص الإصلاحات في ملفات المشروع');
console.log('══════════════════════════════════════════════════════\n');

for (const [num, desc, file, expect] of CHECKS) {
  const full = S(file);
  const label = String(num).padStart(2, ' ') + '. ' + desc;

  if (!fs.existsSync(full)) {
    console.log('  ⬜ ' + label + '  → الملف غير موجود');
    missing++;
    continue;
  }

  const content = fs.readFileSync(full, 'utf8');
  let ok;

  if (typeof expect === 'object' && expect.absent) {
    ok = !content.includes(expect.absent);
  } else {
    ok = content.includes(expect);
  }

  if (ok) {
    console.log('  ✅ ' + label);
    pass++;
  } else {
    console.log('  ❌ ' + label);
    failures.push({ num, desc, file });
    fail++;
  }
}

// ---------------------------------------------------------------- فحوص إضافية
console.log('\n──────────── فحوص عامة ────────────\n');

// ملفات .bak داخل src
const baks = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.bak\d?$/.test(f)) baks.push(p);
  }
})('src');
console.log(baks.length === 0
  ? '  ✅ لا ملفات نسخ احتياطية (.bak) داخل src'
  : '  ⚠️  توجد ' + baks.length + ' ملف .bak داخل src:\n       ' + baks.join('\n       '));

// مطابقة مفاتيح الصلاحيات
try {
  const perm = fs.readFileSync(S('utils/permissions.js'), 'utf8');
  const defined = new Set([...perm.matchAll(/key: '([a-z_]+)'/g)].map(m => m[1]));
  const used = new Set();
  (function walk2(dir) {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk2(p);
      else if (/\.(jsx?|js)$/.test(f) && !/\.bak/.test(f)) {
        const c = fs.readFileSync(p, 'utf8');
        for (const m of c.matchAll(/(?:checkUserPermission\(currentUser,|hasPermission\(|canAccessModule\()\s*'([a-z_]+)'/g)) {
          used.add(m[1]);
        }
      }
    }
  })('src');

  const orphan = [...used].filter(k => !defined.has(k));
  console.log('  ' + (orphan.length === 0 ? '✅' : '❌') +
    ' مفاتيح مفحوصة في الكود وغير معرَّفة في الكتالوج: ' +
    (orphan.length === 0 ? 'لا يوجد' : orphan.join(', ')));
  console.log('  ℹ️  عدد الصلاحيات في الكتالوج: ' + defined.size);
} catch (e) {
  console.log('  ⚠️  تعذّر فحص مطابقة المفاتيح: ' + e.message);
}

// ---------------------------------------------------------------- الخلاصة
console.log('\n══════════════════════════════════════════════════════');
console.log('   الخلاصة:  ✅ ' + pass + ' ناجح   ❌ ' + fail + ' فاشل   ⬜ ' + missing + ' ملف مفقود');
console.log('══════════════════════════════════════════════════════\n');

if (fail > 0) {
  console.log('الإصلاحات غير الموجودة — غالباً لأن الملف لم يُستبدل:\n');
  failures.forEach(f => console.log('  • (' + f.num + ') ' + f.desc + '\n      ' + S(f.file)));
  console.log('\nأرسل هذه القائمة كما هي.\n');
  process.exit(1);
}

console.log('كل الإصلاحات موجودة في ملفاتك. ✅');
console.log('الخطوة التالية: شغّل npm run dev وجرّب الاختبارات اليدوية.\n');
