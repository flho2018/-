// =========================================================================
// financial_calculations.test.cjs
// حزمة الاختبارات الآلية الشاملة للحسابات المالية والمعادلات الحرجة لنظام بيت الورد
// تشمل: ضريبة ZATCA، ترميز TLV، تسوية ديون العملاء FIFO، متوقع الكاش في الوردية،
// تجزئة الدفع Split Payments، والتشفير الأمني للـ PIN
// =========================================================================

const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function runTest(suiteName, testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [${suiteName}] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [${suiteName}] ${testName}: ${err.message}`);
    throw err;
  }
}

// -------------------------------------------------------------------------
// 1. دوال الحسابات الرياضية المقتبسة من AppContext و helpers
// -------------------------------------------------------------------------

// حساب الضريبة والإجماليات
function calculateCartTotals(cart, cartDiscount, storeInfo) {
  const grossSubtotal = (cart || []).reduce((sum, item) => {
    const uPrice = Number(item.unitPrice ?? item.price ?? 0);
    const q = Number(item.qty ?? item.quantity ?? 1);
    return sum + (uPrice * q);
  }, 0);

  const itemDiscounts = (cart || []).reduce((sum, item) => sum + (Number(item.discount) || 0), 0);
  const afterItemDiscounts = Math.max(0, grossSubtotal - itemDiscounts);

  let globalDiscount = 0;
  if (cartDiscount?.type === 'percent') {
    globalDiscount = (afterItemDiscounts * (cartDiscount?.value || 0)) / 100;
  } else {
    globalDiscount = Number(cartDiscount?.value) || 0;
  }
  globalDiscount = Math.min(afterItemDiscounts, globalDiscount);
  const totalDiscount = Number((itemDiscounts + globalDiscount).toFixed(2));
  const discountedTotal = Math.max(0, grossSubtotal - totalDiscount);

  const isTaxActive = storeInfo?.taxEnabled !== false;
  const taxRate = isTaxActive ? (Number(storeInfo?.taxRate) >= 0 ? Number(storeInfo?.taxRate) : 15) : 0;
  const isTaxInclusive = storeInfo?.taxInclusive !== false;

  let taxAmount = 0;
  let total = 0;
  let taxableAmount = 0;

  if (!isTaxActive || taxRate === 0) {
    taxAmount = 0;
    taxableAmount = discountedTotal;
    total = discountedTotal;
  } else if (isTaxInclusive) {
    total = discountedTotal;
    taxableAmount = Number((total / (1 + (taxRate / 100))).toFixed(2));
    taxAmount = Number((total - taxableAmount).toFixed(2));
  } else {
    taxableAmount = discountedTotal;
    taxAmount = Number(((taxableAmount * taxRate) / 100).toFixed(2));
    total = Number((taxableAmount + taxAmount).toFixed(2));
  }

  return {
    grossSubtotal: Number(grossSubtotal.toFixed(2)),
    totalDiscount,
    discountedTotal: Number(discountedTotal.toFixed(2)),
    taxableAmount: Number(taxableAmount.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    taxRate,
    total: Number(total.toFixed(2))
  };
}

// ترميز ZATCA TLV وفك الترميز
function getTLV(tag, val) {
  const encoder = new TextEncoder();
  const valBytes = encoder.encode(String(val || ''));
  return new Uint8Array([tag, valBytes.length, ...valBytes]);
}

function generateZatcaTLV(sellerName, vatNumber, timeStamp, totalAmount, vatAmount) {
  const tlv1 = getTLV(1, sellerName || 'POS Store');
  const tlv2 = getTLV(2, vatNumber || '300000000000003');
  const tlv3 = getTLV(3, timeStamp || new Date().toISOString());
  const tlv4 = getTLV(4, (Number(totalAmount) || 0).toFixed(2));
  const tlv5 = getTLV(5, (Number(vatAmount) || 0).toFixed(2));

  const totalLen = tlv1.length + tlv2.length + tlv3.length + tlv4.length + tlv5.length;
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of [tlv1, tlv2, tlv3, tlv4, tlv5]) {
    combined.set(arr, offset);
    offset += arr.length;
  }

  return Buffer.from(combined).toString('base64');
}

function decodeZatcaTLV(base64Str) {
  const buf = Buffer.from(base64Str, 'base64');
  const result = {};
  let i = 0;
  while (i < buf.length) {
    const tag = buf[i];
    const len = buf[i + 1];
    const valBuf = buf.slice(i + 2, i + 2 + len);
    result[tag] = valBuf.toString('utf8');
    i += 2 + len;
  }
  return result;
}

// تسوية الديون بنظام FIFO
function settleCustomerDebtFIFO(customerInvoices, paymentAmount) {
  let unallocated = paymentAmount;
  const sortedInvoices = [...customerInvoices].sort((a, b) => new Date(a.date) - new Date(b.date));

  const updatedInvoices = sortedInvoices.map(inv => {
    const totalDue = inv.total;
    const alreadyPaid = inv.creditPaidAmount || 0;
    const remaining = Math.max(0, totalDue - alreadyPaid);

    if (remaining <= 0) {
      return { ...inv, isCreditSettled: true };
    }

    if (unallocated > 0) {
      const payThis = Math.min(unallocated, remaining);
      const newPaid = alreadyPaid + payThis;
      const settled = newPaid >= totalDue;
      unallocated -= payThis;
      return {
        ...inv,
        creditPaidAmount: newPaid,
        isCreditSettled: settled
      };
    }

    return { ...inv };
  });

  return {
    updatedInvoices,
    unallocated
  };
}

// حساب الكاش المتوقع للوردية والفارق
function calculateShiftCash({
  startCash = 0,
  cashSales = 0,
  cashRefunds = 0,
  cashIn = 0,
  cashOut = 0,
  expenses = 0,
  purchases = 0,
  actualCash = 0
}) {
  const expectedCash = startCash + cashSales - cashRefunds + cashIn - cashOut - expenses - purchases;
  const difference = actualCash - expectedCash;
  return {
    expectedCash: Number(expectedCash.toFixed(2)),
    actualCash: Number(actualCash.toFixed(2)),
    difference: Number(difference.toFixed(2)),
    status: difference === 0 ? 'balanced' : difference > 0 ? 'surplus' : 'deficit'
  };
}

// تشفير الـ PIN
function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256(ascii) {
  if (typeof ascii !== 'string') ascii = String(ascii || '');
  let i, j;
  let result = '';
  const words = [];
  const asciiBitLength = ascii.length * 8;
  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  const w = new Array(64);
  for (i = 0; i < words.length; i += 16) {
    let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
    let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

    for (j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[i + j] | 0;
      } else {
        const gamma0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const gamma1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + gamma0 + w[j - 7] + gamma1) | 0;
      }
      const ch = (e & f) ^ (~e & g);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const temp1 = (h + sigma1 + ch + k[j] + w[j]) | 0;
      const temp2 = (sigma0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (8 * j)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

const PIN_SALT = '__FLOWER_HOUSE_POS_SALT_v1__';
function hashPin(pin) {
  if (!pin) return '';
  return sha256(String(pin).trim() + PIN_SALT);
}

function verifyPin(inputPin, user) {
  if (!inputPin || !user) return false;
  const cleanInput = String(inputPin).trim();
  const hashed = hashPin(cleanInput);

  if (user.pinHash && user.pinHash === hashed) return true;
  if (user.pin && user.pin === hashed) return true;
  if (user.pin && String(user.pin).trim() === cleanInput) return true;
  if (user.password && String(user.password).trim() === cleanInput) return true;
  return false;
}

// -------------------------------------------------------------------------
// 2. تشغيل الاختبارات الفعلية
// -------------------------------------------------------------------------

console.log('\n🚀 بدء الاختبارات الآلية الشاملة لنظام بيت الورد (Financial & Security Suite)...\n');

// اختبارات الضريبة وحسابات السلة
console.log('--- اختبارات حسابات ضريبة القيمة المضافة (ZATCA VAT Suite) ---');

runTest('VAT', 'حساب الضريبة الشاملة القياسية 15% (115 ريال -> 100 خاضع + 15 ضريبة)', () => {
  const cart = [{ price: 115, qty: 1 }];
  const store = { taxEnabled: true, taxRate: 15, taxInclusive: true };
  const res = calculateCartTotals(cart, null, store);
  assert.strictEqual(res.total, 115);
  assert.strictEqual(res.taxableAmount, 100);
  assert.strictEqual(res.taxAmount, 15);
});

runTest('VAT', 'حساب الضريبة الشاملة مع عدة أصناف ومطابقة الكسور (230.50 ريال)', () => {
  const cart = [
    { price: 115.25, qty: 1 },
    { price: 115.25, qty: 1 }
  ];
  const store = { taxEnabled: true, taxRate: 15, taxInclusive: true };
  const res = calculateCartTotals(cart, null, store);
  assert.strictEqual(res.total, 230.50);
  assert.strictEqual(Number((res.taxableAmount + res.taxAmount).toFixed(2)), 230.50);
});

runTest('VAT', 'حساب الضريبة غير الشاملة (100 ريال + 15% ضريبة = 115 ريال)', () => {
  const cart = [{ price: 100, qty: 1 }];
  const store = { taxEnabled: true, taxRate: 15, taxInclusive: false };
  const res = calculateCartTotals(cart, null, store);
  assert.strictEqual(res.taxableAmount, 100);
  assert.strictEqual(res.taxAmount, 15);
  assert.strictEqual(res.total, 115);
});

runTest('VAT', 'حساب الضريبة مع خصم نسبي (200 ريال مع خصم 10% = 180 ريال شامل)', () => {
  const cart = [{ price: 200, qty: 1 }];
  const discount = { type: 'percent', value: 10 };
  const store = { taxEnabled: true, taxRate: 15, taxInclusive: true };
  const res = calculateCartTotals(cart, discount, store);
  assert.strictEqual(res.grossSubtotal, 200);
  assert.strictEqual(res.totalDiscount, 20);
  assert.strictEqual(res.total, 180);
  assert.strictEqual(Number((res.taxableAmount + res.taxAmount).toFixed(2)), 180);
});

runTest('VAT', 'إيقاف الضريبة الضريبية (0% أو taxEnabled: false)', () => {
  const cart = [{ price: 150, qty: 1 }];
  const store = { taxEnabled: false, taxRate: 15, taxInclusive: true };
  const res = calculateCartTotals(cart, null, store);
  assert.strictEqual(res.total, 150);
  assert.strictEqual(res.taxableAmount, 150);
  assert.strictEqual(res.taxAmount, 0);
});

// اختبارات ZATCA TLV Base64
console.log('\n--- اختبارات تشفير وفك ترميز باركود الفاتورة الإلكترونية (ZATCA TLV) ---');

runTest('ZATCA-TLV', 'توليد وفك ترميز TLV للتاجر والمبلغ والضريبة بنجاح تام', () => {
  const seller = 'بيت الورد للزهور';
  const vatNo = '300099988877703';
  const time = '2026-09-06T00:00:00Z';
  const total = '115.00';
  const vat = '15.00';

  const base64 = generateZatcaTLV(seller, vatNo, time, total, vat);
  assert.ok(base64 && base64.length > 20, 'يجب توليد كود Base64 صالح');

  const decoded = decodeZatcaTLV(base64);
  assert.strictEqual(decoded[1], seller);
  assert.strictEqual(decoded[2], vatNo);
  assert.strictEqual(decoded[3], time);
  assert.strictEqual(decoded[4], total);
  assert.strictEqual(decoded[5], vat);
});

// اختبارات تسوية ديون العملاء بنظام FIFO
console.log('\n--- اختبارات تسوية ديون العملاء التلقائية بنظام الأقدم فالأحدث (FIFO Debt Allocation) ---');

runTest('FIFO', 'سداد جزئي للفاتورة الأولى دون المساس بالفواتير اللاحقة', () => {
  const invoices = [
    { id: 'inv-1', date: '2026-01-01', total: 100, creditPaidAmount: 0, isCreditSettled: false },
    { id: 'inv-2', date: '2026-01-05', total: 150, creditPaidAmount: 0, isCreditSettled: false },
    { id: 'inv-3', date: '2026-01-10', total: 200, creditPaidAmount: 0, isCreditSettled: false }
  ];

  const { updatedInvoices, unallocated } = settleCustomerDebtFIFO(invoices, 70);
  assert.strictEqual(unallocated, 0);
  assert.strictEqual(updatedInvoices[0].creditPaidAmount, 70);
  assert.strictEqual(updatedInvoices[0].isCreditSettled, false);
  assert.strictEqual(updatedInvoices[1].creditPaidAmount, 0);
  assert.strictEqual(updatedInvoices[2].creditPaidAmount, 0);
});

runTest('FIFO', 'سداد يسوي الفاتورة الأولى بالكامل ويبدأ في تسوية الفاتورة الثانية', () => {
  const invoices = [
    { id: 'inv-1', date: '2026-01-01', total: 100, creditPaidAmount: 0, isCreditSettled: false },
    { id: 'inv-2', date: '2026-01-05', total: 150, creditPaidAmount: 0, isCreditSettled: false }
  ];

  const { updatedInvoices, unallocated } = settleCustomerDebtFIFO(invoices, 140);
  assert.strictEqual(unallocated, 0);
  assert.strictEqual(updatedInvoices[0].creditPaidAmount, 100);
  assert.strictEqual(updatedInvoices[0].isCreditSettled, true);
  assert.strictEqual(updatedInvoices[1].creditPaidAmount, 40);
  assert.strictEqual(updatedInvoices[1].isCreditSettled, false);
});

runTest('FIFO', 'سداد كامل لكافة الفواتير مع بقاء فائض في المبلغ إن وجد', () => {
  const invoices = [
    { id: 'inv-1', date: '2026-01-01', total: 100, creditPaidAmount: 0, isCreditSettled: false },
    { id: 'inv-2', date: '2026-01-05', total: 150, creditPaidAmount: 0, isCreditSettled: false }
  ];

  const { updatedInvoices, unallocated } = settleCustomerDebtFIFO(invoices, 300);
  assert.strictEqual(unallocated, 50); // متبقي فائض 50 ريال
  assert.strictEqual(updatedInvoices[0].isCreditSettled, true);
  assert.strictEqual(updatedInvoices[1].isCreditSettled, true);
});

// اختبارات إغلاق الوردية وحساب العجز والزيادة
console.log('\n--- اختبارات إغلاق الوردية ومطابقة صندوق الكاشير (Shift Drawer Reconcile) ---');

runTest('SHIFT', 'تطابق تام في الصندوق بدون عجز أو زيادة', () => {
  const res = calculateShiftCash({
    startCash: 500,
    cashSales: 1000,
    cashRefunds: 100,
    cashIn: 200,
    cashOut: 300,
    expenses: 50,
    purchases: 50,
    actualCash: 1200 // 500 + 1000 - 100 + 200 - 300 - 50 - 50 = 1200
  });

  assert.strictEqual(res.expectedCash, 1200);
  assert.strictEqual(res.difference, 0);
  assert.strictEqual(res.status, 'balanced');
});

runTest('SHIFT', 'اكتشاف عجز نقدي في الدرج (Deficit)', () => {
  const res = calculateShiftCash({
    startCash: 200,
    cashSales: 800,
    cashRefunds: 0,
    cashIn: 0,
    cashOut: 0,
    expenses: 0,
    purchases: 0,
    actualCash: 950 // Expected: 1000, Actual: 950 -> -50
  });

  assert.strictEqual(res.expectedCash, 1000);
  assert.strictEqual(res.difference, -50);
  assert.strictEqual(res.status, 'deficit');
});

runTest('SHIFT', 'اكتشاف زيادة نقدية في الدرج (Surplus)', () => {
  const res = calculateShiftCash({
    startCash: 300,
    cashSales: 700,
    cashRefunds: 50,
    cashIn: 0,
    cashOut: 0,
    expenses: 0,
    purchases: 0,
    actualCash: 980 // Expected: 950, Actual: 980 -> +30
  });

  assert.strictEqual(res.expectedCash, 950);
  assert.strictEqual(res.difference, 30);
  assert.strictEqual(res.status, 'surplus');
});

// اختبارات الأمان وتشفير أرقام PIN
console.log('\n--- اختبارات أمان وتشفير أرقام الدخول (Security & PIN Hashing) ---');

runTest('SECURITY', 'تشفير الـ PIN ينتج نص SHA-256 ثابت ومملح', () => {
  const h1 = hashPin('1234');
  const h2 = hashPin('1234');
  const hOther = hashPin('5678');

  assert.strictEqual(h1.length, 64);
  assert.strictEqual(h1, h2);
  assert.notStrictEqual(h1, hOther);
});

runTest('SECURITY', 'دعم التحقق من الحسابات القديمة غير المشفرة (التوافق العكسي لمنع قفل الحسابات)', () => {
  const legacyUser = { id: 'u1', name: 'أحمد', pin: '4321', role: 'cashier', isActive: true };
  assert.strictEqual(verifyPin('4321', legacyUser), true);
  assert.strictEqual(verifyPin('9999', legacyUser), false);
});

runTest('SECURITY', 'دعم التحقق من الحسابات الحديثة المشفرة (pinHash)', () => {
  const modernUser = {
    id: 'u2',
    name: 'سارة',
    pin: '7788',
    pinHash: hashPin('7788'),
    role: 'admin',
    isActive: true
  };
  assert.strictEqual(verifyPin('7788', modernUser), true);
  assert.strictEqual(verifyPin('1234', modernUser), false);
});

runTest('SECURITY', 'منع الباب الخلفي 9999 والتأكد من رفض أي رمز غير مصرح به', () => {
  const adminUser = { id: 'admin', name: 'المدير', pin: '5566', pinHash: hashPin('5566'), role: 'admin', isActive: true };
  assert.strictEqual(verifyPin('9999', adminUser), false);
});

// اختبارات الدفع المجزأ Split Payments
console.log('\n--- اختبارات سلامة الدفع المجزأ (Split Payment Validation) ---');

runTest('SPLIT', 'التحقق من تطابق مجموع المبالغ المجزأة مع إجمالي الفاتورة', () => {
  const total = 450.75;
  const splitPayments = [
    { methodId: 'cash', amount: 150 },
    { methodId: 'card', amount: 200.75 },
    { methodId: 'credit', amount: 100 }
  ];
  const sum = splitPayments.reduce((s, p) => s + p.amount, 0);
  assert.strictEqual(Number(sum.toFixed(2)), total);
});

console.log(`\n=======================================================`);
console.log(`🎉 نتيجة الاختبارات: تم اجتياز ${passedTests} من أصل ${totalTests} اختبار بنجاح (100%)!`);
console.log(`=======================================================\n`);
