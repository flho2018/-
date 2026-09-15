/* =========================================================================
 *  اختبارات قواعد الأمان
 * =========================================================================
 *  لماذا هذا الملف هو الأهم في مجلد tests:
 *
 *  قواعد Firestore لا تُخطئ بصوت مسموع. قاعدة مكتوبة غلطاً تبدو سليمة
 *  تماماً — البرنامج يعمل، لا رسالة خطأ، ولا أحد يلاحظ. يُكتشف الخلل
 *  يوم يُخرج أحدهم نقداً من الدرج. هذه الاختبارات تجعل الخلل يصرخ
 *  في ثوانٍ بدل أن يصمت شهوراً.
 *
 *  التشغيل:
 *    npm i -D @firebase/rules-unit-testing
 *    npx firebase-tools emulators:exec --only firestore "node tests/firestore.rules.test.cjs"
 *
 *  يتطلب Java مثبّتاً (المحاكي يعمل عليه).
 * ========================================================================= */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, addDoc, serverTimestamp }
  = require('firebase/firestore');

const ADMIN   = 'fl.ho2018@gmail.com';
const CASHIER = 'f1@flower-house.com';
const OUTSIDER= 'someone@gmail.com';

let testEnv;
let passed = 0, failed = 0;

async function it(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ✅ ' + name);
  } catch (err) {
    failed++;
    console.log('  ❌ ' + name);
    console.log('     → ' + (err.message || err));
  }
}

function ctx(email) {
  return testEnv.authenticatedContext(email.replace(/[^a-z0-9]/gi, ''), { email }).firestore();
}

async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (c) => fn(c.firestore()));
}

// ---------------------------------------------------------------------

async function main() {
  testEnv = await initializeTestEnvironment({
    projectId: 'flower-house-test',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  console.log('\n── الغرباء ─────────────────────────────────────────');

  await it('حساب غير معتمد لا يقرأ المنتجات', async () => {
    await assertFails(getDoc(doc(ctx(OUTSIDER), 'pos_products/p1')));
  });

  await it('حساب غير معتمد لا يكتب شيئاً', async () => {
    await assertFails(setDoc(doc(ctx(OUTSIDER), 'pos_products/p9'), { name: 'x' }));
  });

  await it('الزائر بلا تسجيل دخول مرفوض تماماً', async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'pos_products/p1')));
  });

  console.log('\n── المنتجات: السعر والتكلفة ────────────────────────');

  await seed(async (db) => {
    await setDoc(doc(db, 'pos_products/p1'),
      { name: 'وردة', sellingPrice: 25, costPrice: 10, stock: 100, barcode: '111' });
  });

  await it('الكاشير يُنقص المخزون (البيع يعمل)', async () => {
    await assertSucceeds(updateDoc(doc(ctx(CASHIER), 'pos_products/p1'), { stock: 99 }));
  });

  await it('الكاشير لا يغيّر سعر البيع', async () => {
    await assertFails(updateDoc(doc(ctx(CASHIER), 'pos_products/p1'), { sellingPrice: 1 }));
  });

  await it('الكاشير لا يغيّر سعر التكلفة', async () => {
    await assertFails(updateDoc(doc(ctx(CASHIER), 'pos_products/p1'), { costPrice: 1 }));
  });

  await it('الكاشير لا يحذف منتجاً', async () => {
    await assertFails(deleteDoc(doc(ctx(CASHIER), 'pos_products/p1')));
  });

  await it('المدير يغيّر السعر والتكلفة', async () => {
    await assertSucceeds(updateDoc(doc(ctx(ADMIN), 'pos_products/p1'), { sellingPrice: 30, costPrice: 12 }));
  });

  console.log('\n── الفواتير: الإجمالي ثابت ─────────────────────────');

  await seed(async (db) => {
    await setDoc(doc(db, 'pos_invoices/inv1'), {
      invoiceNumber: 'INV-001', total: 450, subtotal: 391.3,
      items: [{ id: 'p1', qty: 2 }], cashierId: CASHIER,
      createdAt: '2026-09-01T10:00:00Z', isRefunded: false,
    });
  });

  await it('الكاشير يُصدر فاتورة جديدة', async () => {
    await assertSucceeds(setDoc(doc(ctx(CASHIER), 'pos_invoices/inv2'),
      { invoiceNumber: 'INV-002', total: 100, items: [] }));
  });

  await it('⚠️ الكاشير لا يصفّر إجمالي فاتورة قديمة', async () => {
    await assertFails(updateDoc(doc(ctx(CASHIER), 'pos_invoices/inv1'), { total: 0 }));
  });

  await it('الكاشير لا يبدّل أصناف فاتورة صادرة', async () => {
    await assertFails(updateDoc(doc(ctx(CASHIER), 'pos_invoices/inv1'), { items: [] }));
  });

  await it('الكاشير لا ينسب فاتورة لكاشير آخر', async () => {
    await assertFails(updateDoc(doc(ctx(CASHIER), 'pos_invoices/inv1'),
      { cashierId: 'f2@flower-house.com' }));
  });

  await it('الكاشير يعلّم الفاتورة كمرتجعة (المسار المشروع)', async () => {
    await assertSucceeds(updateDoc(doc(ctx(CASHIER), 'pos_invoices/inv1'),
      { isRefunded: true, refundedBy: CASHIER }));
  });

  await it('الكاشير لا يحذف فاتورة', async () => {
    await assertFails(deleteDoc(doc(ctx(CASHIER), 'pos_invoices/inv1')));
  });

  console.log('\n── المصروفات والخزينة ──────────────────────────────');

  await seed(async (db) => {
    await setDoc(doc(db, 'pos_expenses/e1'),
      { amount: 200, note: 'ماء', createdAt: '2026-09-01T10:00:00Z' });
    await setDoc(doc(db, 'pos_treasury_ledger/t1'), { amount: 5000, type: 'in' });
  });

  await it('الكاشير لا يعدّل مبلغ مصروف مقيَّد', async () => {
    await assertFails(updateDoc(doc(ctx(CASHIER), 'pos_expenses/e1'), { amount: 20 }));
  });

  await it('الكاشير لا يعدّل دفتر الخزينة', async () => {
    await assertFails(updateDoc(doc(ctx(CASHIER), 'pos_treasury_ledger/t1'), { amount: 1 }));
  });

  console.log('\n── الورديات المغلقة ────────────────────────────────');

  await seed(async (db) => {
    await setDoc(doc(db, 'pos_shifts_history/s1'), { status: 'closed', difference: -150 });
    await setDoc(doc(db, 'pos_shifts_history/s2'), { status: 'open', difference: 0 });
  });

  await it('⚠️ الكاشير لا يعدّل وردية مغلقة (تغطية عجز)', async () => {
    await assertFails(updateDoc(doc(ctx(CASHIER), 'pos_shifts_history/s1'), { difference: 0 }));
  });

  await it('الكاشير يعدّل وردية مفتوحة', async () => {
    await assertSucceeds(updateDoc(doc(ctx(CASHIER), 'pos_shifts_history/s2'), { difference: 5 }));
  });

  await it('المدير يعدّل وردية مغلقة', async () => {
    await assertSucceeds(updateDoc(doc(ctx(ADMIN), 'pos_shifts_history/s1'), { difference: 0 }));
  });

  console.log('\n── المستخدمون والإعدادات ───────────────────────────');

  await seed(async (db) => {
    await setDoc(doc(db, 'pos_users/u1'), { name: 'كاشير ١', role: 'cashier' });
    await setDoc(doc(db, 'pos_meta/store_info'), { name: 'بيت الورد' });
    await setDoc(doc(db, 'pos_meta/active_shift'), { shiftId: 's2' });
  });

  await it('⚠️ الكاشير لا يمنح نفسه صلاحيات', async () => {
    await assertFails(updateDoc(doc(ctx(CASHIER), 'pos_users/u1'), { role: 'admin' }));
  });

  await it('الكاشير لا يعدّل بيانات المتجر', async () => {
    await assertFails(updateDoc(doc(ctx(CASHIER), 'pos_meta/store_info'), { name: 'x' }));
  });

  await it('الكاشير يبثّ نشاطه للأجهزة الأخرى', async () => {
    await assertSucceeds(setDoc(doc(ctx(CASHIER), 'pos_meta/latest_activity'),
      { type: 'sale', _syncedAt: 1 }));
  });

  await it('الكاشير لا يكتب علامات التصفير', async () => {
    await assertFails(setDoc(doc(ctx(CASHIER), 'pos_meta/reset_marks'), { invoices: 1 }));
  });

  await it('الكاشير يكتب الوردية النشطة (لازم للعمل)', async () => {
    await assertSucceeds(setDoc(doc(ctx(CASHIER), 'pos_meta/active_shift'), { shiftId: 's3' }));
  });

  console.log('\n── سجل التدقيق ─────────────────────────────────────');

  await it('الكاشير يكتب قيداً باسمه', async () => {
    await assertSucceeds(addDoc(collection(ctx(CASHIER), 'pos_audit_logs'),
      { userEmail: CASHIER, at: serverTimestamp(), action: 'invoice_refund' }));
  });

  await it('⚠️ الكاشير لا يكتب قيداً باسم زميله', async () => {
    await assertFails(addDoc(collection(ctx(CASHIER), 'pos_audit_logs'),
      { userEmail: 'f2@flower-house.com', at: serverTimestamp(), action: 'invoice_refund' }));
  });

  await it('قيد بلا وقت من الخادم مرفوض', async () => {
    await assertFails(addDoc(collection(ctx(CASHIER), 'pos_audit_logs'),
      { userEmail: CASHIER, at: '2020-01-01', action: 'x' }));
  });

  await it('محرّك المزامنة يكتب سجل الدخول (بلا حقل بريد)', async () => {
    await assertSucceeds(setDoc(doc(ctx(CASHIER), 'pos_login_logs/log1'),
      { userName: 'كاشير', _src: 'dev1', _ts: 1 }));
  });

  await it('سجل الدخول لا يُحذف', async () => {
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'pos_login_logs/log1')));
  });

  await it('⚠️ حتى المدير لا يحذف قيداً', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'pos_audit_logs/a1'), { userEmail: CASHIER, action: 'x' });
    });
    await assertFails(deleteDoc(doc(ctx(ADMIN), 'pos_audit_logs/a1')));
  });

  await it('الكاشير لا يقرأ سجل التدقيق', async () => {
    await assertFails(getDoc(doc(ctx(CASHIER), 'pos_audit_logs/a1')));
  });

  console.log('\n── النسخ الاحتياطية ────────────────────────────────');

  await seed(async (db) => {
    await setDoc(doc(db, 'pos_backups/b1'), { data: 'كل بيانات المتجر' });
  });

  await it('⚠️ الكاشير لا يقرأ نسخة احتياطية (فيها كل التكاليف)', async () => {
    await assertFails(getDoc(doc(ctx(CASHIER), 'pos_backups/b1')));
  });

  console.log('\n── المجموعات غير المعرّفة ──────────────────────────');

  await it('مجموعة عشوائية مرفوضة', async () => {
    await assertFails(setDoc(doc(ctx(CASHIER), 'hacker_data/x'), { a: 1 }));
  });

  // -------------------------------------------------------------------

  await testEnv.cleanup();

  console.log('\n════════════════════════════════════════════════════');
  console.log(`  نجح: ${passed}   |   فشل: ${failed}`);
  console.log('════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('⛔ لا تنشر القواعد قبل أن تصبح كل الاختبارات خضراء.\n');
    process.exit(1);
  }
  console.log('✅ القواعد تحمي ما تدّعي حمايته.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
