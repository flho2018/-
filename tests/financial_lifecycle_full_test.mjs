import assert from 'assert';

/**
 * محاكاة دورة الحياة المالية والتشغيلية الكاملة لنظام بيت الورد (FL-HO2018)
 * تشمل:
 *  1. الرصيد الافتتاحي وفتح الوردية
 *  2. جميع وسائل البيع (كاش، شبكة، تحويل بنكي، آجل، دفع مجزأ)
 *  3. عمليات الشراء (نقدي من الدرج، ومن الحساب البنكي) وانعكاسها على المخزون
 *  4. المرتجع واسترداد النقد والمخزون
 *  5. مصروفات المتجر (من الدرج ومن البنك) ومصروفات المدير (من الخزينة)
 *  6. حركات النقد بين المدير والكاشير (تغذية الدرج من الخزينة/البنك، وترحيل نقدية للخزينة)
 *  7. حركة البنك (إيداع كاش بالبنك، تسوية عمليات الشبكة مع خصم العمولة)
 *  8. إغلاق الوردية ومطابقة Z-Report ومطابقة الخزينة العامة
 */

console.log('════════════════════════════════════════════════════════════════════');
console.log('   🌸 تجربة المحاكاة الشاملة للعمليات المالية والخزينة والبنك 🌸    ');
console.log('════════════════════════════════════════════════════════════════════\n');

// -----------------------------------------------------------------------------
// الحسابات والأرصدة الأولية (Initial Balances)
// -----------------------------------------------------------------------------
let managerVaultCash = 2000.00; // رصيد كاش خزينة المدير الأولية (2,000 ريال)
let bankBalance = 10000.00;     // رصيد الحساب البنكي الأولي (10,000 ريال)
let customerDebt = 0.00;        // ديون العملاء
let productStock = {
  roseBundle: 50,               // باقة جوري (مخزون 50)
  glassVase: 20                 // فازة زجاجية (مخزون 20)
};

// سجلات العمليات
const invoices = [];
const drawerTransactions = [];
const treasuryLedger = [];
const expenses = [];
const purchases = [];

// -----------------------------------------------------------------------------
// الخطوة 1: عهدة وتغذية من المدير للكاشير + فتح الوردية
// -----------------------------------------------------------------------------
console.log('🔹 الخطوة 1: تسليم عهدة نقدية من المدير للكاشير وفتح الوردية');
const initialFloat = 200.00; // المدير يسلم الكاشير 200 ريال عهدة بداية اليوم

// خصم من كاش خزينة المدير
managerVaultCash -= initialFloat;
treasuryLedger.push({
  id: 'tled-1',
  type: 'drawer_funding',
  amount: -initialFloat,
  title: 'تسليم عهدة افتتاحية للكاشير (أحمد)',
  date: new Date().toISOString()
});

// فتح وردية الكاشير بالرصيد الافتتاحي
const shift = {
  id: 'shift-101',
  userId: 'user-1',
  cashierName: 'أحمد - كاشير المبيعات',
  isOpen: true,
  startCash: initialFloat,
  cashSales: 0,
  cardSales: 0,
  creditSales: 0,
  transferSales: 0,
  cashIn: 0,
  cashOut: 0,
  drawerExpenses: 0,
  drawerPurchases: 0,
  cashRefunds: 0
};

console.log(`  - تم خصم ${initialFloat} ر.س من خزينة المدير (المتبقي بالخزينة: ${managerVaultCash} ر.س)`);
console.log(`  - تم فتح وردية الكاشير برصيد افتتاحي: ${shift.startCash} ر.س\n`);

// -----------------------------------------------------------------------------
// الخطوة 2: تجربة جميع وسائل البيع (نقدي، شبكة، تحويل، آجل، ومجزأ)
// -----------------------------------------------------------------------------
console.log('🔹 الخطوة 2: تنفيذ مبيعات بجميع وسائل الدفع');

// أ) بيع نقدي (Cash): باقة جوري بـ 115 ريال (شامل الضريبة)
const sale1 = { id: 'inv-1', total: 115.00, method: 'cash', items: [{ id: 'roseBundle', qty: 1 }] };
invoices.push(sale1);
shift.cashSales += sale1.total;
productStock.roseBundle -= 1;
console.log(`  [1] بيع نقدي: فاتورة #${sale1.id} بمبلغ ${sale1.total} ر.س (كاش الدرج ارتفع إلى ${shift.startCash + shift.cashSales} ر.س، مخزون الجوري: ${productStock.roseBundle})`);

// ب) بيع شبكة مدى (Card/Mada): فازة زجاجية بـ 150 ريال
const sale2 = { id: 'inv-2', total: 150.00, method: 'card', methodId: 'mada', items: [{ id: 'glassVase', qty: 1 }] };
invoices.push(sale2);
shift.cardSales += sale2.total;
productStock.glassVase -= 1;
console.log(`  [2] بيع شبكة (مدى): فاتورة #${sale2.id} بمبلغ ${sale2.total} ر.س (معاملة شبكة معلقة للتسوية البنكية، مخزون الفازات: ${productStock.glassVase})`);

// ج) بيع تحويل بنكي مباشر (Bank Transfer): باقة جوري بـ 230 ريال
const sale3 = { id: 'inv-3', total: 230.00, method: 'transfer', items: [{ id: 'roseBundle', qty: 2 }] };
invoices.push(sale3);
shift.transferSales += sale3.total;
bankBalance += sale3.total; // التحويل يدخل الحساب البنكي فوراً
productStock.roseBundle -= 2;
console.log(`  [3] بيع تحويل بنكي: فاتورة #${sale3.id} بمبلغ ${sale3.total} ر.س (أضيفت لحساب البنك مباشرة -> رصيد البنك: ${bankBalance} ر.س)`);

// د) بيع آجل (Credit / ذمم عملاء): باقة جوري بـ 300 ريال
const sale4 = { id: 'inv-4', total: 300.00, method: 'credit', customerId: 'cust-vip', items: [{ id: 'roseBundle', qty: 2 }] };
invoices.push(sale4);
shift.creditSales += sale4.total;
customerDebt += sale4.total; // قيد على ذمة العميل دون لمس الكاش
productStock.roseBundle -= 2;
console.log(`  [4] بيع آجل (على الحساب): فاتورة #${sale4.id} بمبلغ ${sale4.total} ر.س (ذمة العميل: ${customerDebt} ر.س، نقدية الدرج لم تتأثر)`);

// هـ) بيع بدفع مجزأ (Split Payment): 100 ر.س كاش + 100 ر.س شبكة مدى = 200 ر.س
const sale5 = {
  id: 'inv-5',
  total: 200.00,
  method: 'split',
  splitCash: 100.00,
  splitCard: 100.00,
  items: [{ id: 'glassVase', qty: 1 }]
};
invoices.push(sale5);
shift.cashSales += sale5.splitCash;
shift.cardSales += sale5.splitCard;
productStock.glassVase -= 1;
console.log(`  [5] بيع مجزأ (Split): فاتورة #${sale5.id} بمبلغ 200 ر.س (100 ر.س كاش في الدرج + 100 ر.س شبكة معلقة)\n`);

// -----------------------------------------------------------------------------
// الخطوة 3: حركة الشراء (Purchases)
// -----------------------------------------------------------------------------
console.log('🔹 الخطوة 3: عمليات شراء بضاعة (نقدي من الدرج + عبر البنك)');

// أ) شراء مستلزمات وتغليف نقداً من درج الكاشير بـ 50 ريال
const purchase1 = { id: 'pur-1', amount: 50.00, source: 'drawer', notes: 'شراء شرائط تغليف كاش' };
purchases.push(purchase1);
shift.drawerPurchases += purchase1.amount;
drawerTransactions.push({ id: 'dtx-pur-1', type: 'out', amount: 50.00, reason: 'شراء مستلزمات من الدرج' });
console.log(`  - شراء نقدي من الدرج بمبلغ ${purchase1.amount} ر.س (خصم مباشر من رصيد الكاشير)`);

// ب) شراء شحنة زهور من المورد عبر التحويل البنكي بـ 1,500 ريال (+20 باقة جوري)
const purchase2 = { id: 'pur-2', amount: 1500.00, source: 'bank', notes: 'شراء زهور جوري من المورد عبر البنك' };
purchases.push(purchase2);
bankBalance -= purchase2.amount;
productStock.roseBundle += 20;
console.log(`  - شراء بضاعة عبر البنك بمبلغ ${purchase2.amount} ر.س (رصيد البنك: ${bankBalance} ر.س، وزاد مخزون الجوري إلى: ${productStock.roseBundle})\n`);

// -----------------------------------------------------------------------------
// الخطوة 4: حركة المرتجع (Refund)
// -----------------------------------------------------------------------------
console.log('🔹 الخطوة 4: إصدار مرتجع نقدي لفاتورة سابقة');
// استرجاع الفاتورة الأولى (sale1 = 115 ريال كاش وإعادة حبة جوري للمخزون)
const refundInv = sale1;
refundInv.status = 'refunded';
refundInv.refundedAt = new Date().toISOString();
shift.cashRefunds += refundInv.total;
productStock.roseBundle += 1; // استعادة المخزون
console.log(`  - مرتجع نقدي للفاتورة #${refundInv.id} بمبلغ ${refundInv.total} ر.س (خصم من كاش الدرج + إعادة المخزون إلى ${productStock.roseBundle})\n`);

// -----------------------------------------------------------------------------
// الخطوة 5: المصروفات (Expenses: من الدرج، من البنك، ومصروفات المدير)
// -----------------------------------------------------------------------------
console.log('🔹 الخطوة 5: تسجيل المصروفات المتنوعة وانعكاسها الدقيق');

// أ) مصروفات تشغيلية للمتجر من درج الكاشير (ضيافة وتنظيف) = 35 ريال
const expDrawer = { id: 'exp-1', amount: 35.00, paymentSource: 'drawer', category: 'نظافة وضيافة' };
expenses.push(expDrawer);
shift.drawerExpenses += expDrawer.amount;
drawerTransactions.push({ id: 'dtx-exp-1', type: 'out', amount: 35.00, reason: 'مصروف نظافة من الدرج' });
console.log(`  - مصروف من درج الكاشير: ${expDrawer.amount} ر.س (يُخصم من رصيد الدرج)`);

// ب) مصروفات المتجر من الحساب البنكي (فاتورة كهرباء المتجر) = 280 ريال
const expBank = { id: 'exp-2', amount: 280.00, paymentSource: 'bank', category: 'كهرباء وإنترنت' };
expenses.push(expBank);
bankBalance -= expBank.amount;
console.log(`  - مصروف المتجر من البنك: ${expBank.amount} ر.س (يُخصم من رصيد البنك -> المتبقي: ${bankBalance} ر.س)`);

// ج) سحوبات ومصروفات المدير الشخصية/الإدارية من الخزينة الرئيسية = 300 ريال
const expManager = { id: 'exp-3', amount: 300.00, paymentSource: 'manager_vault', category: 'مصروفات وسحوبات المدير' };
expenses.push(expManager);
managerVaultCash -= expManager.amount;
treasuryLedger.push({ id: 'tled-exp-mgr', type: 'manager_expense', amount: -expManager.amount, title: 'سحب شخصي للمدير' });
console.log(`  - سحوبات المدير من الخزينة: ${expManager.amount} ر.س (يُخصم من كاش المدير -> المتبقي بالخزينة: ${managerVaultCash} ر.س)\n`);

// -----------------------------------------------------------------------------
// الخطوة 6: حركات النقد والتحويل بين المدير والكاشير
// -----------------------------------------------------------------------------
console.log('🔹 الخطوة 6: حركات النقد والعهد بين المدير والكاشير');

// أ) المدير يغذي درج الكاشير أثناء اليوم بسيولة نقدية (Cash In) بـ 150 ريال من كاش الخزينة
const managerFunding = 150.00;
managerVaultCash -= managerFunding;
shift.cashIn += managerFunding;
drawerTransactions.push({ id: 'dtx-fund-midday', type: 'in', amount: managerFunding, reason: 'تغذية نقدية إضافية من المدير' });
treasuryLedger.push({ id: 'tled-fund-2', type: 'drawer_funding', amount: -managerFunding, title: 'تغذية درج الكاشير أثناء العمل' });
console.log(`  - تغذية درج الكاشير من الخزينة: +${managerFunding} ر.س للدرج (خصمت من خزينة المدير -> ${managerVaultCash} ر.س)`);

// ب) الكاشير يورّد فائض سيولة للمدير (Treasury Drop / ترحيل للخزينة) بـ 100 ريال
const treasuryDrop = 100.00;
shift.cashOut += treasuryDrop;
managerVaultCash += treasuryDrop;
drawerTransactions.push({ id: 'dtx-drop-1', type: 'treasury_drop', amount: treasuryDrop, reason: 'ترحيل نقدية زائدة للخزينة' });
treasuryLedger.push({ id: 'tled-drop-1', type: 'treasury_drop', amount: treasuryDrop, title: 'استلام نقدية مرحلة من الكاشير' });
console.log(`  - توريد نقدي من الكاشير للخزينة (سحب للخزينة): -${treasuryDrop} ر.س من الدرج (+${treasuryDrop} ر.س إلى كاش الخزينة -> ${managerVaultCash} ر.س)\n`);

// -----------------------------------------------------------------------------
// الخطوة 7: الخصم من البنك والدفع للبنك (التسويات المصرفية)
// -----------------------------------------------------------------------------
console.log('🔹 الخطوة 7: حركات البنك والتسويات الإلكترونية');

// أ) إيداع نقدي من خزينة المدير إلى الحساب البنكي بـ 500 ريال
const bankCashDeposit = 500.00;
managerVaultCash -= bankCashDeposit;
bankBalance += bankCashDeposit;
treasuryLedger.push({ id: 'tled-dep-bank', type: 'bank_deposit', amount: -bankCashDeposit, depositAmount: bankCashDeposit, title: 'إيداع نقدي في الحساب البنكي' });
console.log(`  - إيداع كاش من الخزينة إلى البنك: ${bankCashDeposit} ر.س (كاش الخزينة: ${managerVaultCash} ر.س، رصيد البنك: ${bankBalance} ر.س)`);

// ب) تسوية مبيعات الشبكة (مدى) إلى البنك:
// إجمالي مبيعات الشبكة = 150 (فاتورة 2) + 100 (جزء من فاتورة 5) = 250 ريال
const totalCardSales = shift.cardSales; // 250 ريال
const posCommissionRate = 0.01; // عمولة بنكية 1% = 2.50 ريال
const posCommission = totalCardSales * posCommissionRate;
const posNetDeposit = totalCardSales - posCommission; // الصافي المودع في البنك = 247.50 ريال
bankBalance += posNetDeposit;
treasuryLedger.push({
  id: 'tled-pos-settle',
  type: 'pos_settlement',
  grossAmount: totalCardSales,
  commissionAmount: posCommission,
  netAmount: posNetDeposit,
  title: 'تسوية مبيعات شبكة مدى بالبنك'
});
console.log(`  - تسوية مبيعات الشبكة بالبنك: إجمالي ${totalCardSales} ر.س، عمولة ${posCommission} ر.س، المودع الصافي بالبنك: ${posNetDeposit} ر.س (رصيد البنك: ${bankBalance} ر.س)\n`);

// -----------------------------------------------------------------------------
// الخطوة 8: إغلاق الوردية والتحقق المحاسبي الشامل لـ Z-Report والخزينة
// -----------------------------------------------------------------------------
console.log('════════════════════════════════════════════════════════════════════');
console.log('   📊 التحقق والمطابقة المحاسبية الشاملة (Reconciliation & Z-Report) 📊');
console.log('════════════════════════════════════════════════════════════════════\n');

// 1. حساب نقدية الدرج المتوقعة رياضياً:
// الرصيد المتوقع = الرصيد الافتتاحي + مبيعات الكاش - مرتجعات الكاش + تغذية الدرج - التوريد للخزينة - مصروفات الدرج - مشتريات الدرج
const expectedDrawerCash = 
  shift.startCash        // 200.00
  + shift.cashSales      // 115 (بيع 1) + 100 (مجزأ بيع 5) = 215.00
  - shift.cashRefunds    // 115 (مرتجع بيع 1)
  + shift.cashIn         // 150 (تغذية من المدير)
  - shift.cashOut        // 100 (ترحيل للخزينة)
  - shift.drawerExpenses // 35 (مصروف نظافة)
  - shift.drawerPurchases; // 50 (شراء مستلزمات)

// الحساب اليدوي: 200 + 215 - 115 + 150 - 100 - 35 - 50 = 265.00 ريال
console.log(`💵 تفصيل حركة صندوق الكاشير (Z-Report):`);
console.log(`  + الرصيد الافتتاحي:        ${shift.startCash.toFixed(2)} ر.س`);
console.log(`  + المبيعات النقدية:         ${shift.cashSales.toFixed(2)} ر.س`);
console.log(`  - المرتجعات النقدية:       -${shift.cashRefunds.toFixed(2)} ر.س`);
console.log(`  + تغذية الدرج (من المدير):   +${shift.cashIn.toFixed(2)} ر.س`);
console.log(`  - توريد للخزينة (للمدير):   -${shift.cashOut.toFixed(2)} ر.س`);
console.log(`  - مصروفات المتجر من الدرج:  -${shift.drawerExpenses.toFixed(2)} ر.س`);
console.log(`  - مشتريات بضاعة من الدرج:   -${shift.drawerPurchases.toFixed(2)} ر.س`);
console.log(`  ──────────────────────────────────────────`);
console.log(`  = النقدية الفعلية المتوقعة:  ${expectedDrawerCash.toFixed(2)} ر.س`);

assert.strictEqual(expectedDrawerCash, 265.00, 'خطأ في معادلة رصيد الدرج المتوقع');
console.log('  ✅ [DRAWER] معادلة الدرج مطابقة 100% بدون أي هللة عجز أو زيادة.\n');

// 2. التحقق من كاش خزينة المدير (Manager Vault):
// البدء: 2000 - 200 (عهدة أولى) - 300 (مصروف مدير) - 150 (تغذية إضافية) + 100 (ترحيل من الكاشير) - 500 (إيداع بنك)
// = 2000 - 200 - 300 - 150 + 100 - 500 = 950.00 ريال
console.log(`🏛️ كاش خزينة المدير الرئيسية:`);
console.log(`  = الرصيد النهائي بالخزينة:  ${managerVaultCash.toFixed(2)} ر.س`);
assert.strictEqual(managerVaultCash, 950.00, 'خطأ في معادلة رصيد خزينة المدير');
console.log('  ✅ [VAULT] رصيد كاش خزينة المدير سليم ومطابق تماماً (950.00 ر.س).\n');

// 3. التحقق من الحساب البنكي:
// البدء: 10000 + 230 (تحويل بيع 3) - 1500 (شراء بضاعة) - 280 (كهرباء) + 500 (إيداع كاش) + 247.50 (تسوية شبكة بعد خصم العمولة)
// = 10000 + 230 - 1500 - 280 + 500 + 247.50 = 9,197.50 ريال
console.log(`💳 الحساب البنكي المعتمد:`);
console.log(`  = الرصيد النهائي بالبنك:    ${bankBalance.toFixed(2)} ر.س`);
assert.strictEqual(bankBalance, 9197.50, 'خطأ في رصيد الحساب البنكي');
console.log('  ✅ [BANK] رصيد الحساب البنكي سليم ومطابق للتسويات والعمولات (9,197.50 ر.س).\n');

// 4. التحقق من المخزون:
// الجوري: بدأ بـ 50، بيع 1 (1)، بيع 3 (2)، بيع 4 (2)، ارتجع 1 (+1)، شراء بضاعة (+20) -> 50 - 1 - 2 - 2 + 1 + 20 = 66
// الفازات: بدأ بـ 20، بيع 2 (1)، بيع 5 (1) -> 20 - 1 - 1 = 18
console.log(`📦 جرد المخزون:`);
console.log(`  - باقة جوري:  ${productStock.roseBundle} حبة (الأصلي 50 - 5 مباع + 1 مرتجع + 20 مشتريات = 66)`);
console.log(`  - فازة زجاج:  ${productStock.glassVase} حبة (الأصلي 20 - 2 مباع = 18)`);
assert.strictEqual(productStock.roseBundle, 66);
assert.strictEqual(productStock.glassVase, 18);
console.log('  ✅ [STOCK] المخزون مطابق للبيع والشراء والمرتجع بدقة تامة.\n');

// 5. التحقق من الآجل والديون:
console.log(`📋 ذمم وديون العملاء:`);
console.log(`  = إجمالي ديون العملاء:      ${customerDebt.toFixed(2)} ر.س`);
assert.strictEqual(customerDebt, 300.00);
console.log('  ✅ [CREDIT] الذمم الآجلة مقيدة بدقة على العميل دون المساس بكاش الصندوق (300.00 ر.س).\n');

console.log('════════════════════════════════════════════════════════════════════');
console.log('🎉 اكتملت المحاكاة الشاملة بنجاح 100% وتطابق كافة الأرصدة والقيود! 🎉');
console.log('════════════════════════════════════════════════════════════════════');
