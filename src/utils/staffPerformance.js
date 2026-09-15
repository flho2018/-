// =========================================================================
//  محرّك قياس أداء الموظفين واحتساب البونص
// =========================================================================
//  فُصل عن شاشة التقرير عمداً: الأرقام التي يُبنى عليها راتب متغيّر يجب أن
//  تكون قابلة للقراءة والمراجعة والاختبار وحدها، لا مدفونة داخل JSX.
//
//  ثلاثة أخطاء في الحساب السابق يصحّحها هذا الملف:
//
//  ١. نسبة الالتزام: كانت تطرح ورديةً واحدة إن كان للموظف أي فرق نقدي
//     في أي وردية (hasDiscrepancy قيمة منطقية واحدة). فمن عنده ٨ ورديات
//     مختلّة من ١٠ تظهر نسبته ٩٠٪. هنا تُعدّ الورديات المختلّة فعلاً.
//
//  ٢. دقّة الدرج: كانت تُرتَّب بالقيمة المطلقة لمجموع الفروقات، فيتصدّر
//     من نقص ٥٠ وزاد ٥٠ (المجموع صفر) على من نقص ريالاً واحداً مرة.
//     هنا نجمع القيم المطلقة، ونفصل العجز عن الزيادة لأن العجز وحده
//     هو المخاطرة المالية.
//
//  ٣. المرتجعات: كانت تُنسب لفترة الفاتورة الأصلية لا لتاريخ الإرجاع،
//     فبيعٌ في يناير يُرجَع في فبراير لا يظهر في تقرير فبراير إطلاقاً —
//     يُدفع بونصه ولا يُسترد. هنا المرتجع يدخل الفترة التي وقع فيها.
// =========================================================================

const num = (v) => Number(v) || 0;

const inPeriod = (dateStr, range) => {
  if (!dateStr) return false;
  if (!range || (!range.from && !range.to)) return true;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return false;
  if (range.from && t < range.from) return false;
  if (range.to && t > range.to) return false;
  return true;
};

// الفترات الجاهزة في الشاشة تُترجم إلى مدى زمني صريح، فيصير الحساب
// واحداً مهما كان مصدر الفترة (أزرار جاهزة أو مدى يختاره المستخدم).
export const resolvePeriodRange = (period, now = new Date()) => {
  const start = new Date(now);
  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      return { from: start.getTime(), to: now.getTime(), label: 'اليوم' };
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      return { from: d.getTime(), to: now.getTime(), label: 'آخر ٧ أيام' };
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { from: d.getTime(), to: now.getTime(), label: 'هذا الشهر' };
    }
    default:
      return { from: null, to: null, label: 'كل الفترات' };
  }
};

// =========================================================================
//  نسبة المرتجع: لمن يُخصم؟
// =========================================================================
//  refundChargedUserId يُكتب عند الإرجاع ويحمل من خرج المال من ورديته
//  فعلاً (البائع إن كانت ورديته مفتوحة، وإلا المنفّذ). نعتمده أولاً لأنه
//  يطابق الحركة المالية. وللفواتير القديمة التي سبقت هذا الحقل نرجع
//  للبائع، وهو التصرّف الأقرب للصواب.
// =========================================================================
export const refundOwnerOf = (inv) =>
  inv?.refundChargedUserId || inv?.cashierId || inv?.userId || null;

export const sellerOf = (inv) => inv?.cashierId || inv?.userId || null;

const emptyStats = (u) => ({
  id: u.id,
  name: (u.name || 'موظف').trim(),
  role: u.role || 'cashier',
  roleName: u.roleName || '',
  isActive: u.isActive !== false,
  avatar: u.avatar || '',

  // المبيعات
  invoicesCount: 0,
  grossSales: 0,          // إجمالي الفواتير المكتملة في الفترة
  discountsGiven: 0,
  itemsSold: 0,
  grossProfit: 0,         // (سعر البيع − التكلفة) × الكمية

  // المرتجعات — بتاريخ الإرجاع لا تاريخ البيع
  refundsCount: 0,
  refundsAmount: 0,
  refundedProfit: 0,
  refundsChargedNotSold: 0,   // مرتجعات حُمّلت عليه لفاتورة لم يبعها هو

  // الورديات والدرج
  shiftsCount: 0,
  shiftsWithVariance: 0,
  cashShortage: 0,        // مجموع العجز (موجب)
  cashOverage: 0,         // مجموع الزيادة (موجب)
  absVariance: 0,         // مجموع القيم المطلقة — مقياس الدقّة الصحيح
  netVariance: 0,         // المحصّلة الموقّعة (للعرض فقط، لا للترتيب)
  workMs: 0,
  isOnline: false
});

// =========================================================================
//  الحساب الرئيسي
// =========================================================================
export const computeStaffPerformance = ({
  users = [],
  invoices = [],
  shiftsHistory = [],
  userShifts = {},
  period = 'month',
  now = new Date()
} = {}) => {
  const range = resolvePeriodRange(period, now);
  const map = {};

  (users || []).forEach(u => {
    if (u && u.id) map[u.id] = emptyStats(u);
  });

  // موظف ظهر في البيانات ولم يعد في قائمة المستخدمين (حُذف أو أُعيد ضبطه):
  // لا نُسقط أرقامه، فإسقاطها يجعل مجموع التقرير أقل من مبيعات المتجر.
  const ensure = (id, fallbackName) => {
    if (!id) return null;
    if (!map[id]) {
      map[id] = emptyStats({ id, name: fallbackName || 'موظف سابق', isActive: false });
      map[id].isFormer = true;
    }
    return map[id];
  };

  (invoices || []).forEach(inv => {
    if (!inv) return;

    // =====================================================================
    //  كل قيد يدخل الفترة التي وقع فيها هو — لا فترة الفاتورة الأصلية
    // =====================================================================
    //  بيعٌ في يناير أُرجع في فبراير: يناير يسجّل البيع موجباً، وفبراير
    //  يسجّل المرتجع سالباً، فيتصافيان على مدى الزمن ولا تُعاد كتابة فترة
    //  صُرف راتبها. ولو استبعدنا البيع من يناير *و* خصمنا المرتجع في
    //  فبراير لعوقب الموظف مرتين على عملية واحدة.
    // =====================================================================
    if (inv.status === 'refunded') {
      const when = inv.refundedAt || inv.updatedAt || inv.date;
      if (inPeriod(when, range)) {
        const owner = ensure(refundOwnerOf(inv), inv.refundedBy || inv.cashier);
        if (owner) {
          owner.refundsCount += 1;
          owner.refundsAmount += num(inv.total);
          const prof = (inv.items || []).reduce((s, it) => {
            const qty = num(it.qty ?? it.quantity ?? 1);
            return s + (num(it.price ?? it.unitPrice) - num(it.costAtSale)) * qty;
          }, 0);
          owner.refundedProfit += prof;
          if (sellerOf(inv) && refundOwnerOf(inv) !== sellerOf(inv)) {
            owner.refundsChargedNotSold += num(inv.total);
          }
        }
      }
      // ولا نتوقّف هنا: البيع نفسه ما زال قيداً في فترة وقوعه
    }

    // البيع يدخل بتاريخ الفاتورة ويُنسب للبائع
    if (!inPeriod(inv.date, range)) return;
    const staff = ensure(sellerOf(inv), inv.cashier);
    if (!staff) return;

    staff.invoicesCount += 1;
    staff.grossSales += num(inv.total);
    staff.discountsGiven += num(inv.discount);

    (inv.items || []).forEach(it => {
      const qty = num(it.qty ?? it.quantity ?? 1);
      staff.itemsSold += qty;
      staff.grossProfit += (num(it.price ?? it.unitPrice) - num(it.costAtSale)) * qty;
    });
  });

  // 3) الورديات المغلقة: الدقّة النقدية وساعات العمل
  (shiftsHistory || []).forEach(sh => {
    if (!sh) return;
    const when = sh.closedAt || sh.openedAt;
    if (!inPeriod(when, range)) return;
    const staff = ensure(sh.userId, sh.cashierName);
    if (!staff) return;

    staff.shiftsCount += 1;
    const diff = num(sh.difference);
    // العتبة ريال واحد: فروق القروش من التقريب ليست إهمالاً
    if (Math.abs(diff) > 1) {
      staff.shiftsWithVariance += 1;
      staff.absVariance += Math.abs(diff);
      if (diff < 0) staff.cashShortage += Math.abs(diff);
      else staff.cashOverage += diff;
    }
    staff.netVariance += diff;

    if (sh.openedAt && sh.closedAt) {
      const d = new Date(sh.closedAt).getTime() - new Date(sh.openedAt).getTime();
      if (d > 0 && d < 48 * 3600 * 1000) staff.workMs += d;
    }
  });

  // 4) الورديات المفتوحة الآن
  Object.values(userShifts || {}).forEach(s => {
    if (!s || s.isOpen !== true) return;
    const staff = ensure(s.userId, s.cashierName);
    if (!staff) return;
    staff.isOnline = true;
    if (s.openedAt) {
      const d = Date.now() - new Date(s.openedAt).getTime();
      if (d > 0 && d < 48 * 3600 * 1000) staff.workMs += d;
    }
  });

  // 5) المشتقّات
  const list = Object.values(map).map(s => {
    const netSales = s.grossSales - s.refundsAmount;
    const netProfit = s.grossProfit - s.refundedProfit;
    const hours = s.workMs / 3600000;
    // لا نُلمّع الأرقام بقسمة على ربع ساعة وهمي: دون ١٥ دقيقة فعلية
    // لا يوجد معدّل ساعي ذو معنى، فنقول ذلك صراحةً بدل رقم مضلّل.
    const hasHours = hours >= 0.25;

    return {
      ...s,
      netSales,
      netProfit,
      profitMargin: netSales > 0 ? (netProfit / netSales) * 100 : 0,
      avgTicket: s.invoicesCount > 0 ? s.grossSales / s.invoicesCount : 0,
      itemsPerInvoice: s.invoicesCount > 0 ? s.itemsSold / s.invoicesCount : 0,
      refundRate: s.grossSales > 0 ? (s.refundsAmount / s.grossSales) * 100 : 0,
      discountRate: s.grossSales > 0 ? (s.discountsGiven / s.grossSales) * 100 : 0,
      hours,
      hasHours,
      salesPerHour: hasHours ? netSales / hours : null,
      invoicesPerHour: hasHours ? s.invoicesCount / hours : null,
      // نسبة الالتزام الحقيقية: الورديات السليمة ÷ كل الورديات
      cleanShifts: Math.max(0, s.shiftsCount - s.shiftsWithVariance),
      complianceRate: s.shiftsCount > 0
        ? ((s.shiftsCount - s.shiftsWithVariance) / s.shiftsCount) * 100
        : null,
      avgVariancePerShift: s.shiftsCount > 0 ? s.absVariance / s.shiftsCount : 0
    };
  });

  const totalNet = list.reduce((a, s) => a + s.netSales, 0);
  list.forEach(s => {
    s.contributionPercent = totalNet > 0 ? (s.netSales / totalNet) * 100 : 0;
  });

  list.sort((a, b) => b.netSales - a.netSales);

  const withSales = list.filter(s => s.invoicesCount > 0);
  const withShifts = list.filter(s => s.shiftsCount > 0);

  return {
    range,
    staff: list,
    totals: {
      netSales: totalNet,
      grossSales: list.reduce((a, s) => a + s.grossSales, 0),
      refunds: list.reduce((a, s) => a + s.refundsAmount, 0),
      netProfit: list.reduce((a, s) => a + s.netProfit, 0),
      invoices: list.reduce((a, s) => a + s.invoicesCount, 0),
      shortage: list.reduce((a, s) => a + s.cashShortage, 0),
      overage: list.reduce((a, s) => a + s.cashOverage, 0)
    },
    leaders: {
      topSeller: withSales[0] || null,
      topProfit: [...withSales].sort((a, b) => b.netProfit - a.netProfit)[0] || null,
      topAvgTicket: [...withSales].filter(s => s.invoicesCount >= 3)
        .sort((a, b) => b.avgTicket - a.avgTicket)[0] || null,
      // الأدقّ = أقل مجموع قيم مطلقة لكل وردية، لا أقل محصّلة موقّعة
      mostAccurate: [...withShifts]
        .sort((a, b) => a.avgVariancePerShift - b.avgVariancePerShift)[0] || null,
      highestRefundRate: [...withSales].filter(s => s.refundsAmount > 0)
        .sort((a, b) => b.refundRate - a.refundRate)[0] || null
    }
  };
};

// =========================================================================
//  البونص
// =========================================================================
//  يُضبط لكل موظف في شاشة المستخدمين. القاعدة تُطبَّق على قاعدة احتساب
//  يختارها صاحب المتجر:
//    net_sales    صافي المبيعات بعد المرتجعات
//    gross_profit مجمل الربح (سعر البيع − التكلفة) — الأعدل، لأن البونص
//                 على الإيراد وحده يُغري ببيع الرخيص كثيراً وبالخصومات
//    invoices     عدد الفواتير
//
//  والأنواع:
//    percent      نسبة مئوية من القاعدة
//    per_invoice  مبلغ ثابت لكل فاتورة
//    tiers        شرائح تصاعدية: أول شريحة تتحقّق من الأعلى تُطبَّق
//
//  وضوابط: حدّ أدنى للاستحقاق، سقف أعلى للبونص، وخصم العجز النقدي.
// =========================================================================
export const DEFAULT_BONUS_RULE = {
  enabled: false,
  base: 'net_sales',
  type: 'percent',
  percent: 1,
  perInvoice: 0,
  tiers: [],              // [{ from: 10000, percent: 1.5 }]
  threshold: 0,           // لا بونص قبل بلوغ هذا الرقم من القاعدة
  cap: 0,                 // 0 = بلا سقف
  deductShortage: false   // خصم العجز النقدي من البونص
};

export const getBonusRule = (user) => ({
  ...DEFAULT_BONUS_RULE,
  ...(user?.bonusRule || {})
});

export const computeBonus = (stats, rule) => {
  const r = { ...DEFAULT_BONUS_RULE, ...(rule || {}) };
  const out = {
    enabled: r.enabled,
    baseLabel: r.base === 'gross_profit' ? 'مجمل الربح'
      : r.base === 'invoices' ? 'عدد الفواتير' : 'صافي المبيعات',
    baseValue: 0,
    rateLabel: '—',
    gross: 0,
    shortageDeducted: 0,
    capped: false,
    belowThreshold: false,
    amount: 0
  };
  if (!r.enabled || !stats) return out;

  const baseValue = r.base === 'gross_profit' ? stats.netProfit
    : r.base === 'invoices' ? stats.invoicesCount
    : stats.netSales;
  out.baseValue = baseValue;

  if (r.threshold > 0 && baseValue < r.threshold) {
    out.belowThreshold = true;
    return out;
  }

  let gross = 0;
  if (r.type === 'per_invoice') {
    gross = num(r.perInvoice) * stats.invoicesCount;
    out.rateLabel = `${num(r.perInvoice)} لكل فاتورة`;
  } else if (r.type === 'tiers') {
    const tiers = [...(r.tiers || [])]
      .map(t => ({ from: num(t.from), percent: num(t.percent) }))
      .sort((a, b) => b.from - a.from);
    const hit = tiers.find(t => baseValue >= t.from);
    if (hit) {
      gross = baseValue * (hit.percent / 100);
      out.rateLabel = `${hit.percent}% (شريحة من ${hit.from})`;
    } else {
      out.rateLabel = 'لم يبلغ أول شريحة';
    }
  } else {
    gross = baseValue * (num(r.percent) / 100);
    out.rateLabel = `${num(r.percent)}%`;
  }

  out.gross = gross;

  if (r.deductShortage && stats.cashShortage > 0) {
    out.shortageDeducted = Math.min(gross, stats.cashShortage);
    gross -= out.shortageDeducted;
  }

  if (r.cap > 0 && gross > r.cap) {
    out.capped = true;
    gross = r.cap;
  }

  out.amount = Math.max(0, gross);
  return out;
};

// يضيف حساب البونص لكل موظف اعتماداً على قاعدته المحفوظة
export const attachBonuses = (perf, users = []) => {
  const byId = {};
  (users || []).forEach(u => { if (u?.id) byId[u.id] = u; });
  perf.staff.forEach(s => {
    s.bonus = computeBonus(s, getBonusRule(byId[s.id]));
  });
  perf.totals.bonus = perf.staff.reduce((a, s) => a + (s.bonus?.amount || 0), 0);
  return perf;
};
