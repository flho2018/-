/* =========================================================================
 *  patch_invoices.cjs — سدّ ثغرة السداد + تفعيل سجل التدقيق
 * =========================================================================
 *  يعدّل InvoicesScreen.jsx في أربعة مواضع:
 *
 *   1) الاستيراد: يضيف logAudit و AUDIT
 *   2) صلاحية السداد: canSettleCredit من customers_receipt_voucher
 *   3) حارس في handleConfirmSettle + تقييد العملية
 *   4) تقييد المرتجع بالسبب الذي يُدخله المستخدم
 *
 *  الثغرة المسدودة: سداد الفاتورة الآجلة كان يستقبل نقداً ويُصدر سند
 *  قبض بلا أي فحص صلاحية — بينما نفس العملية محميّة في شاشة العملاء.
 *  أي أن منع الكاشير هناك كان يُتجاوَز من هنا.
 *
 *  يكتب UTF-8 بلا BOM. لا يعدّل شيئاً إن لم يجد النص المتوقع بالضبط.
 * ========================================================================= */

const fs = require('fs');
const path = require('path');

const FILE = path.join('src', 'components', 'invoices', 'InvoicesScreen.jsx');

if (!fs.existsSync(FILE)) {
  console.log('X  لم يُعثر على ' + FILE);
  console.log('   شغّل الأمر من داخل D:\\FL-HO2018');
  process.exit(1);
}

let s = fs.readFileSync(FILE, 'utf8');
const before = s.length;
const done = [];
const failed = [];

function swap(label, oldText, newText) {
  const n = s.split(oldText).length - 1;
  if (n === 0) { failed.push(label + '  (not found)'); return; }
  if (n > 1)   { failed.push(label + '  (found ' + n + ' times, expected 1)'); return; }
  s = s.replace(oldText, newText);
  done.push(label);
}

// ---------------------------------------------------------------- 1
swap(
  '1. import',
  "import { checkUserPermission } from '../../utils/permissions';",
  "import { checkUserPermission } from '../../utils/permissions';\n" +
  "import { logAudit, AUDIT } from '../../utils/audit';"
);

// ---------------------------------------------------------------- 2
//  نفس صلاحية سند القبض المستخدمة في شاشة العملاء — فلا يبقى باب خلفي.
swap(
  '2. canSettleCredit',
  "  const canRefund = checkUserPermission(currentUser, 'invoices_refund');",
  "  const canRefund = checkUserPermission(currentUser, 'invoices_refund');\n" +
  "  // سداد الفاتورة الآجلة = سند قبض: نفس صلاحية شاشة العملاء بالضبط.\n" +
  "  // بدونها كان الكاشير الممنوع هناك ينفّذها من هنا.\n" +
  "  const canSettleCredit = checkUserPermission(currentUser, 'customers_receipt_voucher');"
);

// ---------------------------------------------------------------- 3
swap(
  '3. guard on settle',
  "  const handleConfirmSettle = (e) => {\n" +
  "    if (e && e.preventDefault) e.preventDefault();\n" +
  "    if (!settleModalInvoice) return;",
  "  const handleConfirmSettle = (e) => {\n" +
  "    if (e && e.preventDefault) e.preventDefault();\n" +
  "    if (!settleModalInvoice) return;\n" +
  "    // هذه العملية تستقبل نقداً وتُصدر سنداً — تُعامَل كسند قبض\n" +
  "    if (!canSettleCredit) {\n" +
  "      alert('\\u26D4 ليس لديك صلاحية تحصيل سداد وإصدار سند قبض.\\nتُمنح من: الإعدادات \\u2190 المستخدمون \\u2190 الصلاحيات.');\n" +
  "      return;\n" +
  "    }"
);

// ---------------------------------------------------------------- 4
swap(
  '4. audit settle',
  "    const receiptObj = addCustomerPayment(custId, amt, settleForm.method, settleForm.notes, invoice.id);",
  "    const receiptObj = addCustomerPayment(custId, amt, settleForm.method, settleForm.notes, invoice.id);\n" +
  "    logAudit({\n" +
  "      action: AUDIT.CREDIT_SETTLE,\n" +
  "      targetId: invoice.id,\n" +
  "      targetName: invoice.invoiceNumber,\n" +
  "      amount: amt,\n" +
  "      reason: settleForm.notes || null,\n" +
  "      after: { method: settleForm.method, customerId: custId }\n" +
  "    }, currentUser);"
);

// ---------------------------------------------------------------- 5
//  السبب كان يُطلب من المستخدم ثم يُهمَل. الآن يُقيَّد.
swap(
  '5. audit refund',
  "      const isRefunded = refundInvoice(inv.id, reason || 'طلب العميل');\n" +
  "      if (isRefunded) {",
  "      const isRefunded = refundInvoice(inv.id, reason || 'طلب العميل');\n" +
  "      logAudit({\n" +
  "        action: AUDIT.INVOICE_REFUND,\n" +
  "        targetId: inv.id,\n" +
  "        targetName: inv.invoiceNumber,\n" +
  "        amount: Number(inv.total) || 0,\n" +
  "        reason: String(reason || '').trim(),\n" +
  "        before: { status: inv.status || 'completed', total: Number(inv.total) || 0 },\n" +
  "        after: { status: isRefunded ? 'refunded' : 'unchanged' },\n" +
  "        result: isRefunded ? 'success' : 'failed'\n" +
  "      }, currentUser);\n" +
  "      if (isRefunded) {"
);

// ----------------------------------------------------------------
console.log('');
done.forEach(function (d) { console.log('  [OK]   ' + d); });
failed.forEach(function (f) { console.log('  [FAIL] ' + f); });
console.log('');

if (failed.length) {
  console.log('== لم يُكتب أي تعديل — الملف كما هو. أرسل هذه الرسالة. ==');
  process.exit(1);
}

fs.writeFileSync(FILE, s, 'utf8');
console.log('=====================================');
console.log('  DONE - 5 edits applied');
console.log('=====================================');
console.log('  size: ' + before + ' -> ' + s.length + '\n');
