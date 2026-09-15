// =========================================================================
//  اختبارات محرّك أداء الموظفين والبونص
// =========================================================================
//  يستورد الملف الحقيقي (src/utils/staffPerformance.js) لا نسخةً منه،
//  فما يمرّ هنا هو ما يعمل في البرنامج فعلاً. المحرّك خالٍ من أي استيراد
//  فيُحمَّل في Node مباشرة.
//
//  التشغيل:  node tests/staff_performance.test.mjs
// =========================================================================

import assert from 'assert';
import {
  computeStaffPerformance,
  computeBonus,
  attachBonuses,
  refundOwnerOf
} from '../src/utils/staffPerformance.js';

let passed = 0, total = 0;
const test = (name, fn) => {
  total++;
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.error(`  ❌ ${name}\n     ${e.message}`); process.exitCode = 1; }
};

const USERS = [
  { id: 'u1', name: 'كاشير ١', role: 'cashier' },
  { id: 'u2', name: 'كاشير ٢', role: 'cashier' }
];

const item = (price, cost, qty = 1) => ({ price, costAtSale: cost, qty });
const inv = (o) => ({ status: 'completed', items: [item(100, 60)], total: 100, ...o });

console.log('\n— نسبة الالتزام —');

test('١٠ ورديات، ٨ منها بفروق ← الالتزام ٢٠٪ لا ٩٠٪', () => {
  const shifts = [];
  for (let i = 0; i < 10; i++) {
    shifts.push({
      userId: 'u1',
      cashierName: 'كاشير ١',
      openedAt: '2026-03-10T08:00:00.000Z',
      closedAt: '2026-03-10T16:00:00.000Z',
      difference: i < 8 ? -20 : 0
    });
  }
  const p = computeStaffPerformance({ users: USERS, shiftsHistory: shifts, period: 'all' });
  const s = p.staff.find(x => x.id === 'u1');
  assert.strictEqual(s.shiftsWithVariance, 8);
  assert.strictEqual(Math.round(s.complianceRate), 20);
});

test('فرق أقل من ريال لا يُعدّ اختلالاً (تقريب القروش)', () => {
  const shifts = [
    { userId: 'u1', difference: 0.4, openedAt: '2026-03-10T08:00:00Z', closedAt: '2026-03-10T10:00:00Z' },
    { userId: 'u1', difference: -0.8, openedAt: '2026-03-11T08:00:00Z', closedAt: '2026-03-11T10:00:00Z' }
  ];
  const p = computeStaffPerformance({ users: USERS, shiftsHistory: shifts, period: 'all' });
  const s = p.staff.find(x => x.id === 'u1');
  assert.strictEqual(s.shiftsWithVariance, 0);
  assert.strictEqual(Math.round(s.complianceRate), 100);
});

console.log('\n— دقّة الدرج: مجموع القيم المطلقة لا محصّلتها —');

test('من نقص ٥٠ وزاد ٥٠ ليس أدقّ ممن نقص ريالاً واحداً', () => {
  const shifts = [
    // u1: تذبذب كبير، محصّلته صفر
    { userId: 'u1', difference: -50, openedAt: '2026-03-10T08:00:00Z', closedAt: '2026-03-10T16:00:00Z' },
    { userId: 'u1', difference: 50, openedAt: '2026-03-11T08:00:00Z', closedAt: '2026-03-11T16:00:00Z' },
    // u2: انحراف ضئيل مرة واحدة
    { userId: 'u2', difference: -2, openedAt: '2026-03-10T08:00:00Z', closedAt: '2026-03-10T16:00:00Z' },
    { userId: 'u2', difference: 0, openedAt: '2026-03-11T08:00:00Z', closedAt: '2026-03-11T16:00:00Z' }
  ];
  const p = computeStaffPerformance({ users: USERS, shiftsHistory: shifts, period: 'all' });
  const u1 = p.staff.find(x => x.id === 'u1');
  const u2 = p.staff.find(x => x.id === 'u2');

  assert.strictEqual(u1.netVariance, 0, 'المحصّلة الموقّعة صفر — وهي ما كان يخدع الترتيب القديم');
  assert.strictEqual(u1.absVariance, 100);
  assert.strictEqual(u2.absVariance, 2);
  assert.strictEqual(p.leaders.mostAccurate.id, 'u2', 'الأدقّ يجب أن يكون u2');
});

test('العجز يُفصل عن الزيادة — العجز وحده هو المخاطرة', () => {
  const shifts = [
    { userId: 'u1', difference: -30, openedAt: '2026-03-10T08:00:00Z', closedAt: '2026-03-10T16:00:00Z' },
    { userId: 'u1', difference: 12, openedAt: '2026-03-11T08:00:00Z', closedAt: '2026-03-11T16:00:00Z' }
  ];
  const p = computeStaffPerformance({ users: USERS, shiftsHistory: shifts, period: 'all' });
  const s = p.staff.find(x => x.id === 'u1');
  assert.strictEqual(s.cashShortage, 30);
  assert.strictEqual(s.cashOverage, 12);
});

console.log('\n— المرتجع يدخل فترة وقوعه —');

const JAN = { from: new Date('2026-01-01').getTime(), to: new Date('2026-01-31T23:59:59').getTime() };
const FEB = { from: new Date('2026-02-01').getTime(), to: new Date('2026-02-28T23:59:59').getTime() };

// بيع في يناير، أُرجع في فبراير
const SALE_JAN_REFUND_FEB = [inv({
  id: 'i1', cashierId: 'u1', date: '2026-01-15T10:00:00.000Z',
  status: 'refunded', refundedAt: '2026-02-05T10:00:00.000Z',
  refundChargedUserId: 'u1'
})];

const runRange = (invoices, range) => {
  // نمرّر فترة مخصّصة بتزييف "الآن" ليقع المدى المطلوب
  const p = computeStaffPerformance({ users: USERS, invoices, period: 'all' });
  return p; // 'all' يشمل كل شيء — تُستعمل للمجموع الكلي
};

test('يناير يسجّل البيع موجباً (لا يُمحى بأثر رجعي)', () => {
  const p = computeStaffPerformance({
    users: USERS, invoices: SALE_JAN_REFUND_FEB, period: 'today',
    now: new Date('2026-01-15T20:00:00.000Z')
  });
  const s = p.staff.find(x => x.id === 'u1');
  assert.strictEqual(s.grossSales, 100, 'البيع يجب أن يظهر في يوم وقوعه');
  assert.strictEqual(s.refundsAmount, 0, 'المرتجع لم يقع بعد في هذا اليوم');
  assert.strictEqual(s.netSales, 100);
});

test('فبراير يسجّل المرتجع سالباً (استرداد البونص)', () => {
  const p = computeStaffPerformance({
    users: USERS, invoices: SALE_JAN_REFUND_FEB, period: 'today',
    now: new Date('2026-02-05T20:00:00.000Z')
  });
  const s = p.staff.find(x => x.id === 'u1');
  assert.strictEqual(s.grossSales, 0, 'البيع ليس في فبراير');
  assert.strictEqual(s.refundsAmount, 100);
  assert.strictEqual(s.netSales, -100, 'صافي فبراير سالب — وهو الاسترداد');
});

test('على مدى الزمن كله يتصافى القيدان إلى صفر', () => {
  const p = runRange(SALE_JAN_REFUND_FEB, null);
  const s = p.staff.find(x => x.id === 'u1');
  assert.strictEqual(s.grossSales, 100);
  assert.strictEqual(s.refundsAmount, 100);
  assert.strictEqual(s.netSales, 0, 'لا عقاب مزدوج ولا ربح من عملية أُلغيت');
});

console.log('\n— نسبة المرتجع لمن خرج المال من ورديته —');

test('المرتجع يُحمَّل على refundChargedUserId لا على البائع', () => {
  const invoices = [inv({
    id: 'i2', cashierId: 'u1', date: '2026-03-01T10:00:00.000Z',
    status: 'refunded', refundedAt: '2026-03-02T10:00:00.000Z',
    refundChargedUserId: 'u2'      // وردية البائع كانت مغلقة
  })];
  const p = computeStaffPerformance({ users: USERS, invoices, period: 'all' });
  const u1 = p.staff.find(x => x.id === 'u1');
  const u2 = p.staff.find(x => x.id === 'u2');
  assert.strictEqual(u1.refundsAmount, 0, 'البائع لا يُخصم منه ما لم يخرج من درجه');
  assert.strictEqual(u2.refundsAmount, 100);
  assert.strictEqual(u2.refundsChargedNotSold, 100, 'يُعلَّم أنه حُمّل مرتجع فاتورة لم يبعها');
});

test('الفواتير القديمة بلا الحقل الجديد ترجع للبائع', () => {
  const old = { id: 'i3', cashierId: 'u1', total: 50, items: [], status: 'refunded', date: '2026-03-01T10:00:00Z', refundedAt: '2026-03-02T10:00:00Z' };
  assert.strictEqual(refundOwnerOf(old), 'u1');
});

console.log('\n— مجمل الربح —');

test('الربح = (البيع − التكلفة) × الكمية، ويُخصم منه ربح المرتجع', () => {
  const invoices = [
    inv({ id: 'a', cashierId: 'u1', date: '2026-03-01T10:00:00Z', items: [item(100, 60, 2)], total: 200 }),
    inv({ id: 'b', cashierId: 'u1', date: '2026-03-02T10:00:00Z', items: [item(100, 60, 1)], total: 100,
          status: 'refunded', refundedAt: '2026-03-03T10:00:00Z', refundChargedUserId: 'u1' })
  ];
  const p = computeStaffPerformance({ users: USERS, invoices, period: 'all' });
  const s = p.staff.find(x => x.id === 'u1');
  assert.strictEqual(s.grossProfit, 120, '(100−60)×2 + (100−60)×1 = 120');
  assert.strictEqual(s.refundedProfit, 40);
  assert.strictEqual(s.netProfit, 80);
});

console.log('\n— البونص —');

const stats = (o) => ({ netSales: 0, netProfit: 0, invoicesCount: 0, cashShortage: 0, ...o });

test('نسبة مئوية من صافي المبيعات', () => {
  const b = computeBonus(stats({ netSales: 10000 }), { enabled: true, base: 'net_sales', type: 'percent', percent: 1.5 });
  assert.strictEqual(b.amount, 150);
});

test('حدّ أدنى للاستحقاق يمنع البونص تحته', () => {
  const b = computeBonus(stats({ netSales: 4000 }), { enabled: true, type: 'percent', percent: 2, threshold: 5000 });
  assert.strictEqual(b.amount, 0);
  assert.strictEqual(b.belowThreshold, true);
});

test('الشرائح: تُطبَّق أعلى شريحة بلغها', () => {
  const rule = { enabled: true, type: 'tiers', tiers: [{ from: 5000, percent: 1 }, { from: 20000, percent: 3 }] };
  assert.strictEqual(computeBonus(stats({ netSales: 25000 }), rule).amount, 750);
  assert.strictEqual(computeBonus(stats({ netSales: 10000 }), rule).amount, 100);
  assert.strictEqual(computeBonus(stats({ netSales: 1000 }), rule).amount, 0);
});

test('السقف يحدّ البونص', () => {
  const b = computeBonus(stats({ netSales: 100000 }), { enabled: true, type: 'percent', percent: 5, cap: 2000 });
  assert.strictEqual(b.amount, 2000);
  assert.strictEqual(b.capped, true);
});

test('خصم العجز النقدي لا يجعل البونص سالباً', () => {
  const b = computeBonus(stats({ netSales: 1000, cashShortage: 500 }), { enabled: true, type: 'percent', percent: 1, deductShortage: true });
  assert.strictEqual(b.gross, 10);
  assert.strictEqual(b.shortageDeducted, 10, 'لا يُخصم أكثر من البونص نفسه');
  assert.strictEqual(b.amount, 0);
});

test('البونص على الربح لا على الإيراد يعطي نتيجة مختلفة', () => {
  const s = stats({ netSales: 10000, netProfit: 1500 });
  const onSales = computeBonus(s, { enabled: true, base: 'net_sales', type: 'percent', percent: 2 });
  const onProfit = computeBonus(s, { enabled: true, base: 'gross_profit', type: 'percent', percent: 2 });
  assert.strictEqual(onSales.amount, 200);
  assert.strictEqual(onProfit.amount, 30);
});

test('قاعدة غير مفعّلة ← لا بونص', () => {
  assert.strictEqual(computeBonus(stats({ netSales: 99999 }), { enabled: false, percent: 10 }).amount, 0);
});

test('attachBonuses تربط قاعدة كل موظف بأرقامه', () => {
  const invoices = [inv({ cashierId: 'u1', date: '2026-03-01T10:00:00Z', total: 1000, items: [item(1000, 400)] })];
  const users = [
    { id: 'u1', name: 'كاشير ١', bonusRule: { enabled: true, base: 'net_sales', type: 'percent', percent: 3 } },
    { id: 'u2', name: 'كاشير ٢' }
  ];
  const p = attachBonuses(computeStaffPerformance({ users, invoices, period: 'all' }), users);
  assert.strictEqual(p.staff.find(s => s.id === 'u1').bonus.amount, 30);
  assert.strictEqual(p.staff.find(s => s.id === 'u2').bonus.amount, 0);
  assert.strictEqual(p.totals.bonus, 30);
});

console.log('\n— المعدّل الساعي —');

test('دون ربع ساعة عمل لا يُعرض معدّل ساعي مضلّل', () => {
  const shifts = [{ userId: 'u1', openedAt: '2026-03-10T08:00:00Z', closedAt: '2026-03-10T08:05:00Z', difference: 0 }];
  const invoices = [inv({ cashierId: 'u1', date: '2026-03-10T08:02:00Z', total: 500 })];
  const p = computeStaffPerformance({ users: USERS, invoices, shiftsHistory: shifts, period: 'all' });
  const s = p.staff.find(x => x.id === 'u1');
  assert.strictEqual(s.hasHours, false);
  assert.strictEqual(s.salesPerHour, null, 'null يُعرض كـ «—» بدل رقم منفوخ');
});

console.log(`\n${passed}/${total} اختباراً ناجحاً\n`);
if (passed !== total) process.exit(1);
