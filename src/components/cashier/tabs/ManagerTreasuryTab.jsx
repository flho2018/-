import React, { useState, useMemo } from 'react';
import { Landmark, DollarSign, Clock, Printer, CheckCircle, Search, FileText, Sparkles, CreditCard, X, Users, Zap, Banknote } from 'lucide-react';
import { formatMoney, formatDate, calculateSettlementCommission, getMethodCommissionSettings } from '../../../utils/helpers';
// دالتا طباعة السندات كانتا مستخدمتين هنا بدون استيراد بعد تقسيم شاشة الخزينة
import { printHtmlDirectly, printShiftHandoverVoucherHtml, printBankDepositVoucherHtml, printDrawerFundingVoucherHtml } from '../../../utils/printHelper';
import { useApp } from '../../../context/AppContext';
import { BankDepositModal } from '../BankDepositModal';
import { ShiftHandoverModal } from '../ShiftHandoverModal';


export const ManagerTreasuryTab = ({ treasurySummary, isAdmin }) => {
  const {
    shiftsHistory,
    treasuryLedger,
    userShifts,
    invoices,
    expenses,
    customers,
    paymentReceipts,
    getTreasurySummary,
    currentUser,
    users,
    // activeShift كان مستخدماً في هذا الملف بدون تعريف (يعطّل تبويب الخزينة)
    activeShift,
    addCustomerPayment,
    reconcilePosSettlement,
    reconcileAppSettlement,
    addExpense,
    fundCashierDrawer,
    cancelPendingFloat,
    allPendingFloats,
    allPendingFloatsTotal,
    storeInfo
  } = useApp();

  const [isBankDepositOpen, setIsBankDepositOpen] = useState(false);
  const [isHandoverModalOpen, setIsHandoverModalOpen] = useState(false);
  const [handoverShiftTarget, setHandoverShiftTarget] = useState(null);
  const [treasuryTypeFilter, setTreasuryTypeFilter] = useState('all');
  const [treasurySearch, setTreasurySearch] = useState('');

  // نوافذ تسوية الشبكة والمنصات ومصروف الإدارة وسداد الديون
  const [isPosReconcileOpen, setIsPosReconcileOpen] = useState(false);
  const [posReconcileGross, setPosReconcileGross] = useState('');
  const [posReconcileCommissionRate, setPosReconcileCommissionRate] = useState('0.8');
  // وسيلة الشبكة المراد تسويتها وعدد عملياتها وخيار الضريبة على العمولة
  const [posReconcileMethodId, setPosReconcileMethodId] = useState('card');
  const [posReconcileCount, setPosReconcileCount] = useState('');
  const [posReconcileVat, setPosReconcileVat] = useState(false);
  const [posReconcileCommission, setPosReconcileCommission] = useState('');
  const [posReconcileNet, setPosReconcileNet] = useState('');
  const [posReconcileBank, setPosReconcileBank] = useState('مصرف الراجحي');
  const [posReconcileRef, setPosReconcileRef] = useState('');
  const [posReconcileNotes, setPosReconcileNotes] = useState('');

  const [isAppReconcileOpen, setIsAppReconcileOpen] = useState(false);
  const [appReconcileName, setAppReconcileName] = useState('تمارا');
  const [appReconcileGross, setAppReconcileGross] = useState('');
  const [appReconcileCommissionRate, setAppReconcileCommissionRate] = useState('5.0');
  const [appReconcileCommission, setAppReconcileCommission] = useState('');
  const [appReconcileNet, setAppReconcileNet] = useState('');
  const [appReconcileBank, setAppReconcileBank] = useState('مصرف الراجحي');
  const [appReconcileRef, setAppReconcileRef] = useState('');
  const [appReconcileNotes, setAppReconcileNotes] = useState('');

  const [isManagerExpenseOpen, setIsManagerExpenseOpen] = useState(false);
  const [managerExpenseAmount, setManagerExpenseAmount] = useState('');
  const [managerExpenseCategory, setManagerExpenseCategory] = useState('نثريات ومشتريات');
  const [managerExpenseNotes, setManagerExpenseNotes] = useState('');

  // نافذة تغذية درج الكاشير من خزينة المدير أو من البنك
  const [isFundDrawerOpen, setIsFundDrawerOpen] = useState(false);
  const [fundCashierId, setFundCashierId] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [fundSource, setFundSource] = useState('manager_cash');
  const [fundNotes, setFundNotes] = useState('');

  // كل مستخدم نشط قابل للاستلام — مفتوح الوردية يدخل درجه فوراً،
  // ومغلقها تُسجَّل له عهدة تصير رصيده الافتتاحي عند فتح ورديته.
  const fundTargets = useMemo(() => (
    (users || [])
      .filter(u => u && u.isActive !== false)
      .map(u => {
        const sh = (userShifts || {})[u.id];
        const isOpen = Boolean(sh && sh.isOpen === true && !sh.closedAt && sh.status !== 'closed');
        return { id: u.id, name: u.name || 'مستخدم', shift: isOpen ? sh : null, isOpen };
      })
      .sort((a, b) => (b.isOpen ? 1 : 0) - (a.isOpen ? 1 : 0))
  ), [users, userShifts]);

  const openShiftCashiers = useMemo(() => fundTargets.filter(t => t.isOpen), [fundTargets]);

  const openFundDrawerModal = () => {
    if (fundTargets.length === 0) {
      alert('⚠️ لا يوجد مستخدم نشط في النظام.');
      return;
    }
    setFundCashierId(fundTargets[0].id);
    setFundAmount('');
    setFundSource('manager_cash');
    setFundNotes('');
    setIsFundDrawerOpen(true);
  };

  const handleSaveDrawerFunding = (e) => {
    e.preventDefault();
    const res = fundCashierDrawer({
      cashierUserId: fundCashierId,
      amount: Number(fundAmount) || 0,
      source: fundSource,
      notes: fundNotes
    });
    if (!res || !res.success) return;
    setIsFundDrawerOpen(false);
    setFundAmount('');
    setFundNotes('');
    const wantPrint = window.confirm(
      (res.isPendingFloat
        ? `✅ سُجّلت عهدة بقيمة ${formatMoney(res.amount, storeInfo?.currency || 'ر.س')} باسم (${res.cashierName}) من ${res.sourceLabel}.\nوردية المستلم مغلقة الآن، فستكون هذه العهدة رصيده الافتتاحي المثبَّت عند فتح ورديته.`
        : `✅ تمت تغذية درج (${res.cashierName}) بمبلغ ${formatMoney(res.amount, storeInfo?.currency || 'ر.س')} من ${res.sourceLabel}.`
      ) + `\n\nهل تريد طباعة السند؟`
    );
    if (wantPrint) {
      try { printDrawerFundingVoucherHtml(res, storeInfo); } catch (err) { console.error(err); }
    }
  };

  const [isQuickDebtPayOpen, setIsQuickDebtPayOpen] = useState(false);
  const [quickDebtCustomer, setQuickDebtCustomer] = useState(null);
  const [quickDebtAmount, setQuickDebtAmount] = useState('');
  const [quickDebtMethod, setQuickDebtMethod] = useState('cash');

  // إعادة حساب عمولة تسوية الشبكة من إعدادات وسيلة الدفع (نسبة + ثابت لكل عملية + ضريبة اختيارية)
  const recalcPosCommission = ({ gross, rate, count, vat, methodId } = {}) => {
    const g = gross !== undefined ? gross : posReconcileGross;
    const r = rate !== undefined ? rate : posReconcileCommissionRate;
    const c = count !== undefined ? count : posReconcileCount;
    const v = vat !== undefined ? vat : posReconcileVat;
    const mId = methodId !== undefined ? methodId : posReconcileMethodId;
    const cfg = getMethodCommissionSettings(mId, storeInfo);
    const res = calculateSettlementCommission({
      gross: g,
      count: c,
      rate: r,
      fixedPerTx: cfg.fixedPerTx,
      vatEnabled: v,
      vatRate: Number(storeInfo?.taxRate) || 15
    });
    setPosReconcileCommission(res.total > 0 ? res.total.toFixed(2) : '');
    setPosReconcileNet(res.net > 0 ? res.net.toFixed(2) : '');
    return res;
  };

  // عمليات الشبكة المختارة غير المسوّاة، والعمليات التي سيغطّيها مبلغ التسوية (الأقدم أولاً)
  const posPendingTxs = ((treasurySummary?.posMethodsBreakdown || []).find(m => m.id === posReconcileMethodId)?.pendingTxs) || [];
  const posCoveredTxs = (() => {
    const target = Number(posReconcileGross) || 0;
    if (target <= 0) return [];
    const picked = [];
    let sum = 0;
    for (const t of posPendingTxs) {
      if (sum + t.amount > target + 0.01) break;
      picked.push(t);
      sum += t.amount;
    }
    return picked;
  })();

  // ملخص حي لتفصيل العمولة يظهر أسفل الحقول
  const posCommissionBreakdown = calculateSettlementCommission({
    gross: posReconcileGross,
    count: posReconcileCount,
    rate: posReconcileCommissionRate,
    fixedPerTx: getMethodCommissionSettings(posReconcileMethodId, storeInfo).fixedPerTx,
    vatEnabled: posReconcileVat,
    vatRate: Number(storeInfo?.taxRate) || 15
  });

  const handleSavePosReconcile = (e) => {
    e.preventDefault();
    const gross = Number(posReconcileGross) || 0;
    if (gross <= 0) {
      alert('الرجاء إدخال مبلغ إجمالي صحيح لتسوية مبيعات الشبكة!');
      return;
    }
    const rate = Number(posReconcileCommissionRate) || 0;
    const comm = posReconcileCommission !== '' ? Number(posReconcileCommission) : (gross * rate / 100);
    const net = gross - comm;

    const methodRow = (treasurySummary?.posMethodsBreakdown || []).find(x => x.id === posReconcileMethodId);
    reconcilePosSettlement({
      methodId: posReconcileMethodId || 'card',
      methodName: methodRow?.name || getMethodCommissionSettings(posReconcileMethodId, storeInfo).name,
      txCount: posCoveredTxs.length || Number(posReconcileCount) || 0,
      settledRefs: posCoveredTxs.map(t => ({ txId: t.txId, docId: t.docId, label: t.label, amount: t.amount, date: t.date })),
      grossAmount: gross,
      commissionAmount: comm,
      commissionRate: rate,
      netAmount: net,
      bankName: posReconcileBank,
      referenceNumber: posReconcileRef,
      notes: posReconcileNotes
    });

    setIsPosReconcileOpen(false);
    setPosReconcileGross('');
    setPosReconcileCount('');
    setPosReconcileCommission('');
    setPosReconcileNet('');
    setPosReconcileRef('');
    setPosReconcileNotes('');
    alert(`✅ تم إيداع صافي تسوية الشبكة (${formatMoney(net, storeInfo?.currency || 'ر.س')}) في ${posReconcileBank} بنجاح!`);
  };

  const handleSaveAppReconcile = (e) => {
    e.preventDefault();
    const gross = Number(appReconcileGross) || 0;
    if (gross <= 0) {
      alert('الرجاء إدخال مبلغ إجمالي صحيح لتسوية مبيعات المنصة!');
      return;
    }
    const rate = Number(appReconcileCommissionRate) || 0;
    const comm = appReconcileCommission !== '' ? Number(appReconcileCommission) : (gross * rate / 100);
    const net = gross - comm;

    reconcileAppSettlement({
      appName: appReconcileName,
      grossAmount: gross,
      commissionAmount: comm,
      commissionRate: rate,
      netAmount: net,
      bankName: appReconcileBank,
      referenceNumber: appReconcileRef,
      notes: appReconcileNotes
    });

    setIsAppReconcileOpen(false);
    setAppReconcileGross('');
    setAppReconcileCommission('');
    setAppReconcileNet('');
    setAppReconcileRef('');
    setAppReconcileNotes('');
    alert(`✅ تم إيداع صافي تسوية (${appReconcileName}) بمبلغ (${formatMoney(net, storeInfo?.currency || 'ر.س')}) في ${appReconcileBank} بنجاح!`);
  };

  const handleSaveManagerExpense = (e) => {
    e.preventDefault();
    const amount = Number(managerExpenseAmount) || 0;
    if (amount <= 0) {
      alert('الرجاء إدخال مبلغ المصروف بشكل صحيح!');
      return;
    }
    // منع الصرف بأكثر من النقدية الموجودة فعلاً في عهدة الإدارة.
    // كان مجرد تنبيه يمكن تجاوزه، فيُصرف من خزينة رصيدها صفر ويصبح الرصيد بالسالب.
    const availableVault = Number(treasurySummary?.managerVaultCash) || 0;
    if (amount > availableVault) {
      alert(`⛔ لا يمكن الصرف: المبلغ المطلوب (${formatMoney(amount, storeInfo?.currency || 'ر.س')}) أكبر من النقدية المتاحة في عهدة الإدارة (${formatMoney(availableVault, storeInfo?.currency || 'ر.س')}).\n\nاستلم عهدة من الكاشير أو سجّل تحصيلاً أولاً، ثم أعد المحاولة.`);
      return;
    }

    addExpense({
      title: `مصروف عهدة إدارة - ${managerExpenseCategory}`,
      amount: amount,
      category: managerExpenseCategory,
      notes: managerExpenseNotes,
      paymentMethod: 'cash',
      paymentSource: 'manager_vault',
      isManagerVaultExpense: true,
      user: currentUser?.name || 'المدير'
    });

    setIsManagerExpenseOpen(false);
    setManagerExpenseAmount('');
    setManagerExpenseNotes('');
    alert(`✅ تم صرف ${formatMoney(amount, storeInfo?.currency || 'ر.س')} من عهدة الإدارة بنجاح وتسجيل السند.`);
  };

  const handleSaveQuickDebtPayment = (e) => {
    e.preventDefault();
    if (!quickDebtCustomer) {
      alert('الرجاء اختيار العميل المدين!');
      return;
    }
    const amount = Number(quickDebtAmount) || 0;
    if (amount <= 0) {
      alert('الرجاء إدخال مبلغ سداد صحيح!');
      return;
    }

    const notesText = quickDebtMethod === 'cash' 
      ? 'نقداً - عهدة الدرج' 
      : quickDebtMethod === 'card' 
        ? 'شبكة - مدى / فيزا POS' 
        : 'تحويل بنكي مباشر لحساب المؤسسة';

    addCustomerPayment(
      quickDebtCustomer.id, 
      amount, 
      quickDebtMethod, 
      `سداد دين سريع عبر لوحة الخزينة الإدارية (${notesText})`
    );

    setIsQuickDebtPayOpen(false);
    setQuickDebtCustomer(null);
    setQuickDebtAmount('');
    alert(`✅ تم قيد سداد دفعة دين بمبلغ ${formatMoney(amount, storeInfo?.currency || 'ر.س')} لحساب العميل (${quickDebtCustomer.name}) بنجاح!`);
  };

  const handlePrintBankStatement = () => {
    const printContent = `
      <div dir="rtl" style="font-family: 'Cairo', Tahoma, sans-serif; padding: 25px; color: #0f172a;">
        <div style="border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h1 style="margin: 0; font-size: 20px; color: #0369a1;">${storeInfo?.name || 'بيت الورد'}</h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">كشف الحساب البنكي وحركة الخزينة والتحصيلات</p>
          </div>
          <div style="text-align: left; font-size: 12px; color: #64748b;">
            <p style="margin: 0;">تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}</p>
            <p style="margin: 4px 0 0 0;">المسؤول: ${currentUser?.name || 'المدير'}</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 25px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; color: #64748b;">عهدة الكاشيرات الحالية</div>
            <div style="font-size: 16px; font-weight: bold; color: #d97706; margin-top: 4px;">${formatMoney(treasurySummary.cashierTotalCash, storeInfo?.currency || 'ر.س')}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; color: #64748b;">عهدة كاش الإدارة</div>
            <div style="font-size: 16px; font-weight: bold; color: #059669; margin-top: 4px;">${formatMoney(treasurySummary.managerVaultCash, storeInfo?.currency || 'ر.س')}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; color: #64748b;">ديون وذمم العملاء (الآجل)</div>
            <div style="font-size: 16px; font-weight: bold; color: #dc2626; margin-top: 4px;">${formatMoney(treasurySummary.totalCustomerDebt, storeInfo?.currency || 'ر.س')}</div>
          </div>
          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 12px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; color: #166534;">صافي الرصيد البنكي المقيد</div>
            <div style="font-size: 16px; font-weight: bold; color: #15803d; margin-top: 4px;">${formatMoney(treasurySummary.netBankBalance, storeInfo?.currency || 'ر.س')}</div>
          </div>
        </div>

        <h3 style="font-size: 14px; margin-bottom: 10px; color: #1e293b; border-right: 4px solid #0284c7; padding-right: 8px;">سجل حركة الخزينة والتحصيلات البنكية</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px;">
          <thead>
            <tr style="background: #f1f5f9; color: #475569; text-align: right;">
              <th style="padding: 8px; border: 1px solid #cbd5e1;">النوع</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1;">البيان والتفاصيل</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1;">المستخدم</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1;">التاريخ</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">المبلغ الإجمالي</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">العمولة</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">الصافي المودع</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">رقم السند/الإيصال</th>
            </tr>
          </thead>
          <tbody>
            ${(treasurySummary.ledger || []).map(item => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold;">
                  ${item.type === 'shift_handover' ? 'استلام كاش وردية' :
                    item.type === 'bank_deposit' ? 'إيداع كاش للبنك' :
                    item.type === 'pos_settlement' ? 'تسوية مبيعات شبكة' :
                    item.type === 'app_settlement' ? 'تسوية تطبيقات/تمارا' :
                    (item.type === 'manager_expense' || item.type === 'manager_vault_expense') ? 'مصروف من الخزينة' :
                    item.type === 'customer_debt_collection' ? 'سداد دين آجل' :
                    item.type === 'drawer_funding' ? `تغذية درج (${item.cashierName || 'كاشير'})` :
                    item.type === 'bank_expense' ? 'مصروف بنكي مباشر' :
                    item.type === 'direct_bank_transfer' ? 'تحويل بنكي مباشر' : item.type}
                </td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${item.notes || '-'}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${item.user || 'المدير'}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${formatDate(item.date)}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">${formatMoney(item.grossAmount || item.amount || 0, storeInfo?.currency || 'ر.س')}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; color: #dc2626;">${item.commissionAmount ? ('-' + formatMoney(item.commissionAmount, storeInfo?.currency || 'ر.س')) : '-'}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: #15803d;">${formatMoney(item.netAmount || item.amount || 0, storeInfo?.currency || 'ر.س')}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">${item.depositSlipNumber || item.referenceNumber || item.voucherNo || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="margin-top: 30px; display: flex; justify-content: space-between; font-size: 12px; color: #475569; padding-top: 15px; border-top: 1px dashed #cbd5e1;">
          <div>ختم وتوقيع المحاسب: __________________</div>
          <div>اعتماد الإدارة العامة: __________________</div>
        </div>
      </div>
    `;
    printHtmlDirectly(printContent);
  };

  return (
    <>
        <div className="space-y-6 animate-in fade-in">

          {/* 1. رأس خلاصة العمليات الحسابية والعهد (The 7 Strategic Financial Pillars) */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-pink-600" />
                <span>خلاصة العمليات والعهد المالية اللحظية (الركائز الـ 7)</span>
                <span className="text-[10px] bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full font-bold">محدث لحظياً</span>
              </h2>
              <span className="text-[11px] text-slate-400 font-semibold">تسميع فوري بكافة القيود المحاسبية</span>
            </div>

            {/* 1. بطاقة صافي رصيد الحساب البنكي في الأعلى بكامل السطر وبنفس الارتفاع وبخط كبير وواضح */}
            <div className="w-full p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-blue-50 via-indigo-50/70 to-blue-100/60 border-2 border-blue-400 shadow-sm relative overflow-hidden mb-3.5">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                
                {/* الجانب الأيمن: العنوان والرصيد البنكي الكبير والواضح */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center border-2 border-blue-400 shadow-md shadow-blue-500/20 shrink-0">
                    <Landmark className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-black text-blue-950">صافي رصيد الحساب البنكي</span>
                      <span className="bg-blue-200/90 text-blue-950 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-blue-300">
                        موثق ومطابق ✅
                      </span>
                    </div>
                    <div className="text-3xl sm:text-4xl font-black text-blue-950 font-mono tracking-tight mt-0.5">
                      {formatMoney(treasurySummary.netBankBalance, storeInfo?.currency || 'ر.س')}
                    </div>
                  </div>
                </div>

                {/* المنتصف: تفاصيل المودع والمصروفات البنكية بأرقام واضحة */}
                <div className="bg-white/95 px-4 py-2.5 rounded-2xl border border-blue-200 text-xs font-mono space-y-1 w-full lg:w-auto shadow-2xs">
                  <div className="flex justify-between items-center gap-4 text-slate-600">
                    <span className="text-[11px] font-bold">المودع (كاش + تحويل + شبكة مسواة):</span>
                    <span className="text-emerald-700 font-black text-xs sm:text-sm">
                      +{formatMoney((treasurySummary.netBankBalance + treasurySummary.bankExpensesTotal), storeInfo?.currency || 'ر.س')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-4 text-slate-600">
                    <span className="text-[11px] font-bold">مصروفات شبكة / تحويل (خصمت فوراً):</span>
                    <span className="text-rose-600 font-black text-xs sm:text-sm">
                      -{formatMoney(treasurySummary.bankExpensesTotal, storeInfo?.currency || 'ر.س')}
                    </span>
                  </div>
                </div>

                {/* الجانب الأيسر: الإجراء ومطابقة الكشف */}
                <div className="flex items-center justify-between lg:justify-end gap-3 w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-blue-200/60">
                  <div className="hidden sm:block text-right">
                    <span className="text-[11px] text-blue-900 font-bold block">مطابقة كشف الحساب البنكي</span>
                    <span className="text-[9.5px] text-blue-600 font-medium">جاهز للطباعة والتدقيق اللحظي</span>
                  </div>
                  <button 
                    type="button"
                    onClick={handlePrintBankStatement}
                    className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-2xl text-xs font-black transition active:scale-95 shadow-md shadow-blue-700/20 flex items-center gap-1.5 shrink-0"
                  >
                    <Printer className="w-4 h-4" />
                    <span>كشف البنك 🖨️</span>
                  </button>
                </div>

              </div>
            </div>

            {/* المستطيلات الستة الأخرى تحت بطاقة البنك بتوزيع 3 أعمدة متناسق وخط كبير وواضح */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">

              {/* 1. عهدة الكاشير اليومية (حتى يتم سحبها) */}
              <div className="p-4 rounded-3xl bg-gradient-to-br from-amber-50 via-amber-50/60 to-orange-50 border-2 border-amber-200 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-amber-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span>عهدة الكاشير اليومية</span>
                    </span>
                    <span className="bg-amber-200/90 text-amber-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                      بالدرج ⏳
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-950 font-mono tracking-tight">
                    {formatMoney(treasurySummary.cashierTotalCash, storeInfo?.currency || 'ر.س')}
                  </div>
                  <p className="text-[11px] text-amber-800/90 leading-relaxed">
                    نقدية بالدرج لدى الكاشيرات (وردية جارية + مقفلة) تظل بذمة الكاشير حتى يسحبها المدير.
                  </p>
                </div>
                <div className="pt-3 mt-2 border-t border-amber-200/60 flex items-center justify-between">
                  <span className="text-[10px] text-amber-900 font-bold">
                    {treasurySummary.totalActiveCashiersCount > 0 ? `${treasurySummary.totalActiveCashiersCount} كاشير نشط` : 'لا توجد ورديات جارية'}
                  </span>
                  {treasurySummary.pendingShifts.length > 0 ? (
                    <button 
                      type="button"
                      onClick={() => {
                        setHandoverShiftTarget(treasurySummary.pendingShifts[0]);
                        setIsHandoverModalOpen(true);
                      }}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-black transition active:scale-95 shadow-xs flex items-center gap-1"
                    >
                      <span>سحب العهدة 📥</span>
                      <span className="bg-white/20 px-1 rounded-full text-[9px]">{treasurySummary.pendingShifts.length}</span>
                    </button>
                  ) : (
                    <span className="text-[10px] text-amber-700 font-medium">العهد مستلمة بالكامل</span>
                  )}
                </div>
                {allPendingFloatsTotal > 0 && (
                  <div className="mt-2 p-2 rounded-2xl bg-white/70 border border-emerald-300">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-black text-emerald-900">عهد مُسلّمة بانتظار فتح الوردية</span>
                      <span className="text-[11px] font-black font-mono text-emerald-900">
                        {formatMoney(allPendingFloatsTotal, storeInfo?.currency || 'ر.س')}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {allPendingFloats.map(f => (
                        <div key={f.id} className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="font-bold text-emerald-950 truncate">
                            {f.user || 'كاشير'} — {formatMoney(Number(f.amount) || 0, storeInfo?.currency || 'ر.س')}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`استرجاع عهدة (${f.user || 'الكاشير'}) وإعادة المبلغ إلى مصدره؟`)) {
                                cancelPendingFloat(f.id);
                              }
                            }}
                            className="shrink-0 px-2 py-0.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-black transition"
                          >
                            استرجاع
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-amber-900/80 font-bold">
                    {openShiftCashiers.length > 0 ? `${openShiftCashiers.length} وردية مفتوحة` : 'لا وردية مفتوحة'}
                  </span>
                  <button
                    type="button"
                    onClick={openFundDrawerModal}
                    className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[10px] font-black transition active:scale-95 shadow-xs flex items-center gap-1"
                  >
                    <span>تغذية درج 💵</span>
                  </button>
                </div>
              </div>

              {/* 2. عهدة كاش المدير (بعد الاستلام من الكاشير) */}
              <div className="p-4 rounded-3xl bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-teal-50 border-2 border-emerald-200 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-emerald-900 flex items-center gap-1.5">
                      <Banknote className="w-4 h-4 text-emerald-600" />
                      <span>عهدة كاش المدير (الخزينة)</span>
                    </span>
                    <span className="bg-emerald-200/90 text-emerald-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                      متاحة بيدك ✨
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-emerald-950 font-mono tracking-tight">
                    {formatMoney(treasurySummary.managerVaultCash, storeInfo?.currency || 'ر.س')}
                  </div>
                  <p className="text-[11px] text-emerald-800/90 leading-relaxed">
                    نقدية فعلية استلمها المدير من الكاشيرات؛ جاهزة للصرف منها أو توريدها وإيداعها بالبنك.
                  </p>
                </div>
                <div className="pt-3 mt-2 border-t border-emerald-200/60 flex items-center gap-1.5">
                  <button 
                    type="button"
                    onClick={() => setIsBankDepositOpen(true)}
                    className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black transition text-center shadow-xs flex items-center justify-center gap-1"
                  >
                    <span>إيداع للبنك 🏦</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsManagerExpenseOpen(true)}
                    className="flex-1 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[10px] font-black transition text-center flex items-center justify-center gap-1"
                  >
                    <span>صرف كاش 💸</span>
                  </button>
                </div>
              </div>

              {/* 3. المعاملات البنكية (شبكة مدى وفيزا) */}
              <div className="p-4 rounded-3xl bg-gradient-to-br from-purple-50 via-purple-50/60 to-indigo-50 border-2 border-purple-200 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-purple-900 flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-purple-600" />
                      <span>شبكة مدى وفيزا (POS)</span>
                    </span>
                    {treasurySummary.posPendingGross === 0 ? (
                      <span className="bg-emerald-100 text-emerald-900 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span>مسواة بالكامل</span>
                        <span>✅</span>
                      </span>
                    ) : (
                      <span className="bg-purple-200/90 text-purple-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                        بانتظار التسوية 🏛️
                      </span>
                    )}
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-purple-950 font-mono tracking-tight">
                    {formatMoney(treasurySummary.posPendingGross, storeInfo?.currency || 'ر.س')}
                  </div>
                  {/* تفصيل كل شبكة على حدة: مدى غير فيزا، لأن لكل واحدة عمولة وتسوية مستقلة */}
                  {(treasurySummary.posMethodsBreakdown || []).filter(m => m.pending > 0).length > 0 && (
                    <div className="bg-white/80 p-2 rounded-xl border border-purple-100 text-[10px] space-y-1 font-mono">
                      <div className="text-purple-900 font-black border-b border-purple-100 pb-1">المعلّق حسب الشبكة:</div>
                      {(treasurySummary.posMethodsBreakdown || []).filter(m => m.pending > 0).map(m => {
                        const cfg = getMethodCommissionSettings(m.id, storeInfo);
                        return (
                          <div key={m.id} className="flex justify-between items-center text-slate-700 font-bold">
                            <span>
                              {m.name}
                              <span className="text-slate-400 font-normal"> ({m.pendingCount} عملية{cfg.rate ? ` • ${cfg.rate}%` : ''}{cfg.fixedPerTx ? ` + ${cfg.fixedPerTx}/عملية` : ''})</span>
                            </span>
                            <span className="text-purple-800 font-black">{formatMoney(m.pending, storeInfo?.currency || 'ر.س')}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="bg-white/80 p-2 rounded-xl border border-purple-100 text-[10px] space-y-0.5 font-mono">
                    <div className="flex justify-between text-slate-500 font-bold">
                      <span>رسوم الشبكات (حسب نسبة كل وسيلة):</span>
                      <span className="text-rose-600 font-black">-{formatMoney(treasurySummary.posEstimatedCommission, storeInfo?.currency || 'ر.س')}</span>
                    </div>
                    <div className="flex justify-between text-purple-950 font-black">
                      <span>صافي التوريد المودع بالبنك:</span>
                      <span className="text-purple-700 font-black">{formatMoney(treasurySummary.posEstimatedNet, storeInfo?.currency || 'ر.س')}</span>
                    </div>
                  </div>
                </div>
                <div className="pt-3 mt-2 border-t border-purple-200/60 flex items-center justify-between">
                  <span className="text-[10px] text-purple-900 font-bold">
                    {treasurySummary.posSettledGross > 0 ? `تم تسوية ${formatMoney(treasurySummary.posSettledGross, storeInfo?.currency || 'ر.س')}` : 'عمليات الشبكة الجارية'}
                  </span>
                  <button 
                    type="button"
                    onClick={() => {
                      const pGross = treasurySummary.posPendingGross || 0;
                      if (pGross <= 0) {
                        alert('✅ كافة مبيعات الشبكة ونقاط البيع (POS) مسواة بالكامل مع البنك!');
                        return;
                      }
                      setPosReconcileGross(String(pGross));
                      const rate = 0.8;
                      const comm = (pGross * rate / 100);
                      setPosReconcileCommissionRate('0.8');
                      setPosReconcileCommission(comm > 0 ? comm.toFixed(2) : '0');
                      setPosReconcileNet((pGross - comm) > 0 ? (pGross - comm).toFixed(2) : '0');
                      setIsPosReconcileOpen(true);
                    }}
                    className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-[10px] font-black transition active:scale-95 shadow-xs flex items-center gap-1"
                  >
                    <span>تسوية بنكية 🧾</span>
                  </button>
                </div>
              </div>

              {/* 4. المعاملات الإلكترونية والتطبيقات (تمارا / نينجا) */}
              <div className="p-4 rounded-3xl bg-gradient-to-br from-pink-50 via-rose-50/60 to-pink-100/50 border-2 border-pink-200 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-pink-900 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-pink-600" />
                      <span>المنصات الإلكترونية والتطبيقات</span>
                    </span>
                    {treasurySummary.appsPendingGross === 0 ? (
                      <span className="bg-emerald-100 text-emerald-900 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span>محولة بالكامل</span>
                        <span>✅</span>
                      </span>
                    ) : (
                      <span className="bg-pink-200/90 text-pink-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                        تمارا ونينجا 📲
                      </span>
                    )}
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-pink-950 font-mono tracking-tight">
                    {formatMoney(treasurySummary.appsPendingGross, storeInfo?.currency || 'ر.س')}
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-pink-100 text-[10px] space-y-0.5 font-mono">
                    <div className="flex justify-between text-slate-500 font-bold">
                      <span>عمولات المواقع والتطبيقات:</span>
                      <span className="text-rose-600 font-black">-{formatMoney(treasurySummary.appsEstimatedCommission, storeInfo?.currency || 'ر.س')}</span>
                    </div>
                    <div className="flex justify-between text-pink-950 font-black">
                      <span>صافي المحول للبنك:</span>
                      <span className="text-pink-700 font-black">{formatMoney(treasurySummary.appsEstimatedNet, storeInfo?.currency || 'ر.س')}</span>
                    </div>
                  </div>
                </div>
                <div className="pt-3 mt-2 border-t border-pink-200/60 flex items-center justify-between">
                  <span className="text-[10px] text-pink-900 font-bold">عةدة للمدير حتى إيداعها</span>
                  <button 
                    type="button"
                    onClick={() => {
                      const aGross = treasurySummary.appsPendingGross || 0;
                      if (aGross <= 0) {
                        alert('✅ مستحقات كافة المنصات والتطبيقات الإلكترونية محولة ومودعة بالكامل بالبنك!');
                        return;
                      }
                      setAppReconcileGross(String(aGross));
                      const rate = 5.0;
                      const comm = (aGross * rate / 100);
                      setAppReconcileCommissionRate('5.0');
                      setAppReconcileCommission(comm > 0 ? comm.toFixed(2) : '0');
                      setAppReconcileNet((aGross - comm) > 0 ? (aGross - comm).toFixed(2) : '0');
                      setIsAppReconcileOpen(true);
                    }}
                    className="px-2.5 py-1 bg-pink-700 hover:bg-pink-800 text-white rounded-lg text-[10px] font-black transition active:scale-95 shadow-xs flex items-center gap-1"
                  >
                    <span>تأكيد التحويل 📥</span>
                  </button>
                </div>
              </div>

              {/* 5. الآجل (ذمم وديون العملاء حتى يتم سداده) */}
              <div className="p-4 rounded-3xl bg-gradient-to-br from-rose-50 to-orange-50 border-2 border-rose-200 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-rose-900 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-rose-600" />
                      <span>ذمم وديون العملاء (الآجل)</span>
                    </span>
                    <span className="bg-rose-200 text-rose-900 text-[10px] font-black px-2 py-0.5 rounded-full">
                      معلق حتى السداد ⏳
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-rose-950 font-mono tracking-tight">
                    {formatMoney(treasurySummary.totalCustomerDebt, storeInfo?.currency || 'ر.س')}
                  </div>
                  <p className="text-[11px] text-rose-800/90 leading-relaxed">
                    فواتير آجلة معلقة لدى العملاء؛ عند السداد تُسجل في عهدة الكاشير (إذا كاش) أو في البنك مباشرة (إذا شبكة/تحويل).
                  </p>
                </div>
                <div className="pt-3 mt-2 border-t border-rose-200/60 flex items-center justify-between">
                  <span className="text-[10px] text-rose-900 font-bold">
                    {(customers || []).filter(c => Number(c.balance || c.credit || 0) > 0).length} عميل مدين
                  </span>
                  <button 
                    type="button"
                    onClick={() => {
                      const debtors = (customers || []).filter(c => Number(c.balance || c.credit || 0) > 0);
                      if (debtors.length > 0) {
                        setQuickDebtCustomer(debtors[0]);
                        setQuickDebtAmount(String(Number(debtors[0].balance || debtors[0].credit || 0)));
                      }
                      setIsQuickDebtPayOpen(true);
                    }}
                    className="px-3 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-[10px] font-black transition active:scale-95 shadow-xs flex items-center gap-1"
                  >
                    <span>قبض دفعة 💵</span>
                  </button>
                </div>
              </div>

              {/* 6. التحويلات البنكية المباشرة (تسجل بالبنك فوراً) */}
              <div className="p-4 rounded-3xl bg-gradient-to-br from-cyan-50 to-blue-50 border-2 border-cyan-200 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-cyan-900 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-cyan-600" />
                      <span>التحويل البنكي المباشر</span>
                    </span>
                    <span className="bg-cyan-200 text-cyan-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                      بالبنك مباشرة 🏛️
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-cyan-950 font-mono tracking-tight">
                    {formatMoney(treasurySummary.directBankTransfers, storeInfo?.currency || 'ر.س')}
                  </div>
                  <p className="text-[11px] text-cyan-800/90 leading-relaxed">
                    مبيعات وسدادات قام العميل بتحويلها لحساب المؤسسة البنكي مباشرة؛ تُسمّع في رصيد البنك فوراً.
                  </p>
                </div>
                <div className="pt-3 mt-2 border-t border-cyan-200/60 flex items-center justify-between">
                  <span className="text-[10px] text-cyan-900 font-bold">معتمد بالإشعار</span>
                  <span className="text-[10px] font-mono text-cyan-700 font-bold">حساب المؤسسة البنكي</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. دفتر تدقيق حركات الخزينة والبنك (Treasury & Bank Audit Ledger) */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-5 h-5 text-slate-700" />
                    <div>
                      <h3 className="font-black text-slate-900 text-sm">سجل تدقيق حركات الخزينة والإيداعات البنكية (Treasury Audit Ledger)</h3>
                      <p className="text-xs text-slate-500">توثيق محاسبي دقيق وغير قابل للتعديل لكل حركة نقدية، تحويل، أو تسوية بنكية</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* تصفية بنوع الحركة */}
                    <select
                      value={treasuryTypeFilter}
                      onChange={(e) => setTreasuryTypeFilter(e.target.value)}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-bold outline-none bg-white text-slate-700 focus:ring-2 focus:ring-emerald-200"
                    >
                      <option value="all">كافة أنواع الحركات ({treasurySummary.ledger.length})</option>
                      <option value="shift_handover">📥 استلام كاش وردية</option>
                      <option value="bank_deposit">🏦 إيداع نقدي للبنك</option>
                      <option value="pos_settlement">💳 تسوية مبيعات شبكة</option>
                      <option value="app_settlement">⚡ تسوية تطبيقات وتمارا</option>
                      <option value="manager_vault_expense">💸 صرف من عهدة الإدارة</option>
                      <option value="customer_debt_collection">👥 سداد دين آجل</option>
                      <option value="drawer_funding">💵 تغذية درج كاشير</option>
                      <option value="direct_bank_transfer">🏛️ تحويل بنكي مباشر</option>
                      <option value="bank_expense">📉 مصروف بنكي مباشر</option>
                    </select>

                    <div className="relative">
                      <input 
                        type="text" 
                        value={treasurySearch}
                        onChange={(e) => setTreasurySearch(e.target.value)}
                        placeholder="بحث برقم السند أو الكاشير..." 
                        className="pr-8 pl-3 py-1.5 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-200" 
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    <button 
                      type="button"
                      onClick={handlePrintBankStatement}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>طباعة السجل 🖨️</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right table-auto min-w-[820px] border-collapse">
                    <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 select-none">
                      <tr>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap w-[14%]">نوع الحركة</th>
                        <th className="py-2.5 px-3 text-right w-[24%]">البيان / التفاصيل</th>
                        <th className="py-2.5 px-2.5 text-right whitespace-nowrap w-[11%]">المسؤول</th>
                        <th className="py-2.5 px-2.5 text-center whitespace-nowrap w-[11%]">التاريخ والوقت</th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap w-[9%]">الإجمالي</th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap w-[8%]">العمولة</th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap w-[10%]">الصافي</th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap w-[9%]">رقم السند</th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap w-[6%]">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {(treasurySummary.ledger || [])
                        .filter(item => {
                          // توحيد الاسمين القديم والجديد لنوع "صرف من عهدة الإدارة"
                          const normalizeType = (t) => (t === 'manager_vault_expense' ? 'manager_expense' : t);
                          if (treasuryTypeFilter !== 'all' && normalizeType(item.type) !== normalizeType(treasuryTypeFilter)) return false;
                          if (treasurySearch.trim()) {
                            const q = treasurySearch.toLowerCase();
                            const matchVoucher = String(item.voucherNo || item.depositSlipNumber || item.referenceNumber || '').toLowerCase().includes(q);
                            const matchUser = String(item.user || item.cashierName || '').toLowerCase().includes(q);
                            const matchNotes = String(item.notes || item.title || '').toLowerCase().includes(q);
                            return matchVoucher || matchUser || matchNotes;
                          }
                          return true;
                        })
                        .map((item) => {
                          const isHandover = item.type === 'shift_handover';
                          const isDeposit = item.type === 'bank_deposit';
                          const isPosSet = item.type === 'pos_settlement';
                          const isAppSet = item.type === 'app_settlement';
                          const isManagerExp = (item.type === 'manager_expense' || item.type === 'manager_vault_expense');
                          const isDebtPay = item.type === 'customer_debt_collection';
                          const isDrawerFunding = item.type === 'drawer_funding';
                          const isBankExp = item.type === 'bank_expense';
                          const isDirectTransfer = item.type === 'direct_bank_transfer';

                          const grossAmt = Number(item.grossAmount || (isDeposit ? item.depositAmount : item.amount) || 0);
                          const commAmt = Number(item.commissionAmount || 0);
                          const netAmt = Number(item.netAmount || (isDeposit ? item.depositAmount : item.amount) || 0);

                          let badgeStyle = 'bg-slate-100 text-slate-700';
                          let badgeIcon = '📄';
                          let badgeTitle = item.title || 'حركة خزينة';

                          if (isHandover) {
                            badgeStyle = 'bg-amber-100 text-amber-800';
                            badgeIcon = '📥';
                            badgeTitle = 'استلام كاش وردية';
                          } else if (isDeposit) {
                            badgeStyle = 'bg-emerald-100 text-emerald-800';
                            badgeIcon = '🏦';
                            badgeTitle = 'إيداع كاش للبنك';
                          } else if (isPosSet) {
                            badgeStyle = 'bg-purple-100 text-purple-800';
                            badgeIcon = '💳';
                            badgeTitle = 'تسوية مبيعات شبكة';
                          } else if (isAppSet) {
                            badgeStyle = 'bg-pink-100 text-pink-800';
                            badgeIcon = '⚡';
                            badgeTitle = `تسوية ${item.appName || 'تطبيقات'}`;
                          } else if (isManagerExp) {
                            badgeStyle = 'bg-orange-100 text-orange-800';
                            badgeIcon = '💸';
                            badgeTitle = 'مصروف من الخزينة';
                          } else if (isDebtPay) {
                            badgeStyle = 'bg-teal-100 text-teal-800';
                            badgeIcon = '👥';
                            badgeTitle = 'سداد دين آجل';
                          } else if (isBankExp) {
                            badgeStyle = 'bg-rose-100 text-rose-800';
                            badgeIcon = '📉';
                            badgeTitle = 'مصروف بنكي مباشر';
                          } else if (isDirectTransfer) {
                            badgeStyle = 'bg-cyan-100 text-cyan-800';
                            badgeIcon = '🏛️';
                            badgeTitle = 'تحويل بنكي مباشر';
                          } else if (isDrawerFunding) {
                            badgeStyle = 'bg-emerald-100 text-emerald-900';
                            badgeIcon = '💵';
                            badgeTitle = `تغذية درج (${item.cashierName || 'كاشير'}) من ${item.fundingSource === 'bank' ? 'البنك' : 'خزينة المدير'}`;
                          }

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/90 transition border-b border-slate-100 last:border-b-0">
                              {/* 1. نوع الحركة */}
                              <td className="p-2.5 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded-lg text-[10.5px] font-black inline-flex items-center gap-1 ${badgeStyle}`}>
                                  <span>{badgeIcon}</span>
                                  <span>{badgeTitle}</span>
                                </span>
                              </td>

                              {/* 2. البيان / التفاصيل المحاسبية */}
                              <td className="p-2.5">
                                <div className="font-bold text-slate-800 leading-snug break-words" title={item.notes || item.title || '-'}>
                                  {item.title || item.notes || '-'}
                                </div>
                                {item.notes && item.notes !== item.title && !item.notes.startsWith('تسوية مبيعات') && (
                                  <div className="text-[10px] text-slate-500 mt-0.5 leading-tight truncate max-w-[260px]" title={item.notes}>
                                    {item.notes}
                                  </div>
                                )}
                                {item.bankName && (
                                  <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1 font-medium whitespace-nowrap">
                                    <span>🏦 {item.bankName}</span>
                                    {item.depositSlipNumber && <span className="font-mono text-slate-400">• إشعار: {item.depositSlipNumber}</span>}
                                  </div>
                                )}
                              </td>

                              {/* 3. المسؤول */}
                              <td className="p-2.5 whitespace-nowrap font-bold text-slate-700">
                                <span className="truncate block max-w-[110px]" title={item.user || 'المدير'}>
                                  {String(item.user || 'المدير').replace(/\(المدير العام\)/g, '').trim()}
                                </span>
                              </td>

                              {/* 4. التاريخ والوقت */}
                              <td className="p-2.5 text-center whitespace-nowrap">
                                <div className="font-mono text-[11px] text-slate-700 leading-tight">
                                  <span>{formatDate(item.date)}</span>
                                </div>
                              </td>

                              {/* 5. المبلغ الإجمالي */}
                              <td className="p-2.5 text-center whitespace-nowrap font-mono text-xs text-slate-700 font-bold">
                                <span>{formatMoney(grossAmt, '')}</span>
                                <span className="text-[9.5px] text-slate-400 font-normal mr-0.5">{storeInfo?.currency || 'ر.س'}</span>
                              </td>

                              {/* 6. العمولة المحسومة */}
                              <td className="p-2.5 text-center whitespace-nowrap font-mono text-xs">
                                {commAmt > 0 ? (
                                  <span className="text-rose-600 font-bold">-{formatMoney(commAmt, '')}</span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>

                              {/* 7. الصافي المودع */}
                              <td className="p-2.5 text-center whitespace-nowrap font-black font-mono text-xs sm:text-sm">
                                <span className={isDeposit || isPosSet || isAppSet || isDirectTransfer || isDebtPay ? 'text-emerald-700' : isManagerExp || isBankExp ? 'text-rose-700' : 'text-slate-800'}>
                                  {formatMoney(netAmt, '')}
                                </span>
                                <span className="text-[9.5px] font-normal text-slate-500 mr-0.5">{storeInfo?.currency || 'ر.س'}</span>
                              </td>

                              {/* 8. رقم السند/الإيصال */}
                              <td className="p-2.5 text-center whitespace-nowrap font-mono text-[10.5px] text-slate-600 font-bold">
                                <span className="bg-slate-100 border border-slate-200/80 px-1.5 py-0.5 rounded text-[10px] inline-block max-w-[110px] truncate" title={item.voucherNo || item.depositSlipNumber || '-'}>
                                  {item.voucherNo || item.depositSlipNumber || '-'}
                                </span>
                              </td>

                              {/* 9. الإجراءات */}
                              <td className="p-2.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isHandover) {
                                      printShiftHandoverVoucherHtml(item, storeInfo, users);
                                    } else if (isDeposit) {
                                      printBankDepositVoucherHtml(item, storeInfo);
                                    } else {
                                      handlePrintBankStatement();
                                    }
                                  }}
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10.5px] font-bold inline-flex items-center gap-1 transition shadow-2xs"
                                  title="طباعة السند"
                                >
                                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                                  <span>طباعة</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>

                  {treasurySummary.ledger.length === 0 && (
                    <div className="py-12 text-center text-slate-400">
                      <div className="text-3xl mb-2">📜</div>
                      <p className="font-bold text-xs">لا توجد أي حركات مسجلة في دفتر أستاذ الخزينة بعد.</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
      {isPosReconcileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-purple-200 animate-in zoom-in-95">
            <div className="p-4 bg-gradient-to-r from-purple-800 to-indigo-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-purple-200" />
                <h3 className="font-black text-sm">تسوية مبيعات شبكة مدى وفيزا (POS) 🏛️</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setIsPosReconcileOpen(false)} 
                className="text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePosReconcile} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-purple-50 rounded-2xl border border-purple-100 space-y-1">
                <span className="font-bold text-purple-950 block">حركة تسوية وإيداع بنكي لمبيعات الشبكة</span>
                <p className="text-[11px] text-purple-800/80">
                  سيتم تسجيل خصم رسوم وعمولة البنك، وإيداع صافي المبلغ مباشرة في الحساب البنكي المعتمد.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">المبلغ الإجمالي لعمليات الشبكة المراد تسويتها *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={posReconcileGross}
                  onChange={(e) => {
                    const g = e.target.value;
                    setPosReconcileGross(g);
                    // عدد العمليات يُحسب تلقائياً من العمليات التي يغطّيها المبلغ
                    const target = Number(g) || 0;
                    let sum = 0, n = 0;
                    for (const t of posPendingTxs) {
                      if (sum + t.amount > target + 0.01) break;
                      sum += t.amount; n += 1;
                    }
                    setPosReconcileCount(n > 0 ? String(n) : '');
                    recalcPosCommission({ gross: g, count: n });
                  }}
                  className="w-full px-3 py-2.5 border rounded-xl font-mono font-black text-slate-900 text-base outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>

              {/* اختيار الشبكة وعدد العمليات — لحساب العمولة تلقائياً حسب إعدادات كل وسيلة */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الشبكة المراد تسويتها</label>
                  <select
                    value={posReconcileMethodId}
                    onChange={(e) => {
                      const mId = e.target.value;
                      setPosReconcileMethodId(mId);
                      const cfg = getMethodCommissionSettings(mId, storeInfo);
                      const newRate = cfg.rate ? String(cfg.rate) : '0';
                      setPosReconcileCommissionRate(newRate);
                      // تعبئة المبلغ وعدد العمليات تلقائياً من مبيعات هذه الشبكة غير المسوّاة
                      const row = (treasurySummary?.posMethodsBreakdown || []).find(x => x.id === mId);
                      const g = row ? String(Number(row.pending).toFixed(2)) : '';
                      const c = row ? String(row.pendingCount || 0) : '';
                      setPosReconcileGross(g);
                      setPosReconcileCount(c);
                      recalcPosCommission({ methodId: mId, rate: newRate, gross: g, count: c });
                    }}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-purple-300 bg-white"
                  >
                    {(treasurySummary?.posMethodsBreakdown || []).length > 0
                      ? (treasurySummary.posMethodsBreakdown).map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} — معلّق: {Number(m.pending).toFixed(2)} ({m.pendingCount} عملية)
                          </option>
                        ))
                      : (storeInfo?.paymentMethods || [])
                          .filter(m => m && m.id !== 'split' && m.type !== 'split' && m.type !== 'credit' && m.type !== 'cash')
                          .map(m => (<option key={m.id} value={m.id}>{m.name || m.id}</option>))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">عدد العمليات (للعمولة الثابتة)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={posReconcileCount}
                    onChange={(e) => {
                      const c = e.target.value;
                      setPosReconcileCount(c);
                      recalcPosCommission({ count: c });
                    }}
                    placeholder="اتركه فارغاً إذا لا توجد عمولة ثابتة"
                    className="w-full px-3 py-2 border rounded-xl font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={posReconcileVat}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setPosReconcileVat(v);
                    recalcPosCommission({ vat: v });
                  }}
                  className="w-4 h-4 accent-purple-600"
                />
                <span>إضافة ضريبة القيمة المضافة ({Number(storeInfo?.taxRate) || 15}%) على الرسوم والعمولة</span>
              </label>

              {posCoveredTxs.length > 0 && (
                <div className="text-[11px] bg-white border border-purple-200 rounded-xl p-2 max-h-32 overflow-y-auto space-y-1">
                  <div className="font-black text-purple-900 border-b border-purple-100 pb-1 sticky top-0 bg-white">
                    العمليات التي ستُربط بهذه التسوية ({posCoveredTxs.length} من {posPendingTxs.length}):
                  </div>
                  {posCoveredTxs.map(t => (
                    <div key={t.txId} className="flex justify-between text-slate-700 font-bold">
                      <span className="truncate">{t.label}</span>
                      <span className="font-mono text-purple-800">{formatMoney(t.amount, storeInfo?.currency || 'ر.س')}</span>
                    </div>
                  ))}
                </div>
              )}

              {(posCommissionBreakdown.percentPart > 0 || posCommissionBreakdown.fixedPart > 0) && (
                <div className="text-[11px] bg-purple-50/70 border border-purple-200 rounded-xl px-3 py-2 space-y-0.5 text-purple-900 font-bold">
                  <div>الرسوم (نسبة): {formatMoney(posCommissionBreakdown.percentPart, storeInfo?.currency || 'ر.س')}</div>
                  {posCommissionBreakdown.fixedPart > 0 && (
                    <div>العمولة الثابتة ({posReconcileCount || 0} عملية × {getMethodCommissionSettings(posReconcileMethodId, storeInfo).fixedPerTx}): {formatMoney(posCommissionBreakdown.fixedPart, storeInfo?.currency || 'ر.س')}</div>
                  )}
                  {posCommissionBreakdown.vat > 0 && (
                    <div>ضريبة على العمولة: {formatMoney(posCommissionBreakdown.vat, storeInfo?.currency || 'ر.س')}</div>
                  )}
                  <div className="pt-1 border-t border-purple-200">إجمالي الرسوم والعمولة المتوقعة: {formatMoney(posCommissionBreakdown.total, storeInfo?.currency || 'ر.س')} — يمكنك تعديلها يدوياً لتطابق كشف البنك</div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الرسوم (%)</label>
                  <input
                    type="number"
                    step="any"
                    value={posReconcileCommissionRate}
                    onChange={(e) => {
                      const r = e.target.value;
                      setPosReconcileCommissionRate(r);
                      recalcPosCommission({ rate: r });
                    }}
                    placeholder="0.8"
                    className="w-full px-3 py-2 border rounded-xl font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">إجمالي المحسوم (رسوم + عمولة)</label>
                  <input
                    type="number"
                    step="any"
                    value={posReconcileCommission}
                    onChange={(e) => {
                      const c = e.target.value;
                      setPosReconcileCommission(c);
                      const numG = Number(posReconcileGross) || 0;
                      setPosReconcileNet((numG - Number(c)) > 0 ? (numG - Number(c)).toFixed(2) : '');
                    }}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border rounded-xl font-mono font-bold text-rose-700 outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>
              </div>

              {/* الصافي المحول للبنك */}
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between">
                <span className="font-black text-emerald-900">الصافي المودع بالحساب البنكي:</span>
                <span className="text-base font-black font-mono text-emerald-800">
                  {formatMoney(Number(posReconcileNet) || ((Number(posReconcileGross) || 0) - (Number(posReconcileCommission) || 0)), storeInfo?.currency || 'ر.س')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الحساب البنكي المستلم *</label>
                  <select
                    value={posReconcileBank}
                    onChange={(e) => setPosReconcileBank(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 outline-none bg-white focus:ring-2 focus:ring-purple-300"
                  >
                    <option value="مصرف الراجحي">مصرف الراجحي</option>
                    <option value="البنك الأهلي السعودي">البنك الأهلي السعودي</option>
                    <option value="بنك الرياض">بنك الرياض</option>
                    <option value="مصرف الإنماء">مصرف الإنماء</option>
                    <option value="بنك البلاد">بنك البلاد</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم دفعة التسوية / المرجع</label>
                  <input
                    type="text"
                    value={posReconcileRef}
                    onChange={(e) => setPosReconcileRef(e.target.value)}
                    placeholder="مثال: SET-9982"
                    className="w-full px-3 py-2 border rounded-xl font-mono text-slate-800 outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات وبيان العملية</label>
                <input
                  type="text"
                  value={posReconcileNotes}
                  onChange={(e) => setPosReconcileNotes(e.target.value)}
                  placeholder="ملاحظات محاسبية إضافية..."
                  className="w-full px-3 py-2 border rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 text-white rounded-xl font-black text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>تأكيد قيد التسوية والإيداع البنكي</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPosReconcileOpen(false)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تسوية مستحقات المنصات والتطبيقات (تمارا / نينجا) */}
      {isAppReconcileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-pink-200 animate-in zoom-in-95">
            <div className="p-4 bg-gradient-to-r from-pink-800 to-rose-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-pink-200" />
                <h3 className="font-black text-sm">تسوية مستحقات التطبيقات والمنصات (تمارا / نينجا) 📲</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setIsAppReconcileOpen(false)} 
                className="text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAppReconcile} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-pink-50 rounded-2xl border border-pink-100 space-y-1">
                <span className="font-bold text-pink-950 block">تحويل مستحقات مبيعات التطبيقات لحساب البنك</span>
                <p className="text-[11px] text-pink-800/80">
                  تُسجل كعهدة لدى المدير حتى تحول المنصة المبلغ للبنك بعد خصم عمولاتها.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم المنصة / التطبيق *</label>
                <select
                  value={appReconcileName}
                  onChange={(e) => setAppReconcileName(e.target.value)}
                  className="w-full px-3 py-2.5 border rounded-xl font-bold text-slate-900 bg-white outline-none focus:ring-2 focus:ring-pink-300"
                >
                  <option value="تمارا">تمارا (تقسيط Tamara)</option>
                  <option value="نينجا">تطبيق نينجا (Ninja)</option>
                  <option value="تابي">تابي (Tabby)</option>
                  <option value="جاهز">جاهز (Jahez)</option>
                  <option value="هنقرستيشن">هنقرستيشن (Hungerstation)</option>
                  <option value="تويو">تويو (ToYou)</option>
                  <option value="منصة إلكترونية">منصة إلكترونية أخرى</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">المبلغ الإجمالي للمبيعات *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={appReconcileGross}
                  onChange={(e) => {
                    const g = e.target.value;
                    setAppReconcileGross(g);
                    const rate = Number(appReconcileCommissionRate) || 0;
                    const numG = Number(g) || 0;
                    const comm = (numG * rate / 100);
                    setAppReconcileCommission(comm > 0 ? comm.toFixed(2) : '');
                    setAppReconcileNet((numG - comm) > 0 ? (numG - comm).toFixed(2) : '');
                  }}
                  className="w-full px-3 py-2.5 border rounded-xl font-mono font-black text-slate-900 text-base outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">عمولة المنصة (%)</label>
                  <input
                    type="number"
                    step="any"
                    value={appReconcileCommissionRate}
                    onChange={(e) => {
                      const r = e.target.value;
                      setAppReconcileCommissionRate(r);
                      const numG = Number(appReconcileGross) || 0;
                      const comm = (numG * Number(r) / 100);
                      setAppReconcileCommission(comm > 0 ? comm.toFixed(2) : '');
                      setAppReconcileNet((numG - comm) > 0 ? (numG - comm).toFixed(2) : '');
                    }}
                    placeholder="5.0"
                    className="w-full px-3 py-2 border rounded-xl font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">مبلغ العمولة المحسوم</label>
                  <input
                    type="number"
                    step="any"
                    value={appReconcileCommission}
                    onChange={(e) => {
                      const c = e.target.value;
                      setAppReconcileCommission(c);
                      const numG = Number(appReconcileGross) || 0;
                      setAppReconcileNet((numG - Number(c)) > 0 ? (numG - Number(c)).toFixed(2) : '');
                    }}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border rounded-xl font-mono font-bold text-rose-700 outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
              </div>

              {/* الصافي المحول للبنك */}
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between">
                <span className="font-black text-emerald-900">الصافي المورد للبنك:</span>
                <span className="text-base font-black font-mono text-emerald-800">
                  {formatMoney(Number(appReconcileNet) || ((Number(appReconcileGross) || 0) - (Number(appReconcileCommission) || 0)), storeInfo?.currency || 'ر.س')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الحساب البنكي المودع به *</label>
                  <select
                    value={appReconcileBank}
                    onChange={(e) => setAppReconcileBank(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800 outline-none bg-white focus:ring-2 focus:ring-pink-300"
                  >
                    <option value="مصرف الراجحي">مصرف الراجحي</option>
                    <option value="البنك الأهلي السعودي">البنك الأهلي السعودي</option>
                    <option value="بنك الرياض">بنك الرياض</option>
                    <option value="مصرف الإنماء">مصرف الإنماء</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم التحويل / الإشعار</label>
                  <input
                    type="text"
                    value={appReconcileRef}
                    onChange={(e) => setAppReconcileRef(e.target.value)}
                    placeholder="رقم مرجع الحوالة..."
                    className="w-full px-3 py-2 border rounded-xl font-mono text-slate-800 outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات وبيان التسوية</label>
                <input
                  type="text"
                  value={appReconcileNotes}
                  onChange={(e) => setAppReconcileNotes(e.target.value)}
                  placeholder="ملاحظات التسوية..."
                  className="w-full px-3 py-2 border rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-pink-700 to-rose-700 hover:from-pink-800 text-white rounded-xl font-black text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>تأكيد التسوية وإيداع الصافي بالبنك</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAppReconcileOpen(false)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة صرف مشتريات ونثريات من عهدة كاش الإدارة */}
      {isManagerExpenseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-emerald-200 animate-in zoom-in-95">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-emerald-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <h3 className="font-black text-sm">صرف من عهدة كاش المدير (الخزينة) 💸</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setIsManagerExpenseOpen(false)} 
                className="text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManagerExpense} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-emerald-950 block">عهدة كاش المدير المتاحة حالياً:</span>
                  <span className="text-[10px] text-emerald-700">متاحة للصرف الفعلي دون المساس بصندوق الكاشير</span>
                </div>
                <span className="text-base font-black font-mono text-emerald-900">
                  {formatMoney(treasurySummary.managerVaultCash, storeInfo?.currency || 'ر.س')}
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">المبلغ المطلوب صرفه *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={managerExpenseAmount}
                  onChange={(e) => setManagerExpenseAmount(e.target.value)}
                  className="w-full px-3 py-2.5 border rounded-xl font-mono font-black text-rose-700 text-base outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">تصنيف المصروف *</label>
                <select
                  value={managerExpenseCategory}
                  onChange={(e) => setManagerExpenseCategory(e.target.value)}
                  className="w-full px-3 py-2.5 border rounded-xl font-bold text-slate-900 bg-white outline-none focus:ring-2 focus:ring-emerald-300"
                >
                  <option value="نثريات ومشتريات">نثريات ومشتريات يومية</option>
                  <option value="فواتير وضيافة">فواتير وضيافة وإعاشة</option>
                  <option value="صيانة وتشغيل">صيانة وتشغيل</option>
                  <option value="بضاعة ومستلزمات">شراء بضاعة ومستلزمات مستعجلة</option>
                  <option value="سلف ورواتب">سلف ورواتب نقدية</option>
                  <option value="أخرى">مصروفات أخرى</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">بيان المصروف وتفاصيله *</label>
                <input
                  type="text"
                  required
                  value={managerExpenseNotes}
                  onChange={(e) => setManagerExpenseNotes(e.target.value)}
                  placeholder="مثال: شراء ورود إضافية ومواد تغليف نقدياً..."
                  className="w-full px-3 py-2 border rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-700 to-teal-800 hover:from-emerald-800 text-white rounded-xl font-black text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>تأكيد الصرف وقيد السند المحاسبي</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsManagerExpenseOpen(false)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة سداد وقبض دفعة دين آجل سريعة */}
      {isFundDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-emerald-200 animate-in zoom-in-95">
            <div className="p-4 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-200" />
                <h3 className="font-black text-sm">تغذية درج كاشير 💵</h3>
              </div>
              <button type="button" onClick={() => setIsFundDrawerOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDrawerFunding} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-1">
                <span className="font-bold text-emerald-950 block">قيد مزدوج تلقائي</span>
                <p className="text-[11px] text-emerald-900/80 leading-relaxed">
                  المبلغ يُخصم من المصدر فوراً. فإن كانت وردية المستلم مفتوحة دخل درجه في الحال،
                  وإن كانت مغلقة سُجِّل كعهدة باسمه تصير رصيده الافتتاحي المثبَّت عند فتح ورديته.
                  وفي الحالتين يُحسب عليه عند الإقفال.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">الكاشير المستلم *</label>
                <select
                  value={fundCashierId}
                  onChange={(e) => setFundCashierId(e.target.value)}
                  required
                  className="w-full p-3 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {fundTargets.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.isOpen
                        ? `${c.name} — وردية مفتوحة، درج حالي: ${formatMoney(
                            Math.max(0, (Number(c.shift.startCash) || 0) + (Number(c.shift.cashSales) || 0) + (Number(c.shift.cashIn) || 0) - (Number(c.shift.cashOut) || 0)),
                            storeInfo?.currency || 'ر.س'
                          )}`
                        : `${c.name} — لا وردية مفتوحة (تُسجَّل كعهدة)`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-black text-slate-700 mb-1">مصدر الزيادة *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFundSource('manager_cash')}
                    className={`p-3 rounded-2xl font-bold text-[11px] border transition flex flex-col items-center gap-1 text-center ${
                      fundSource === 'manager_cash'
                        ? 'bg-purple-50 border-purple-600 text-purple-900 ring-1 ring-purple-400'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base">💼</span>
                    <span>كاش خزينة المدير</span>
                    <span className="text-[9px] font-mono">
                      {formatMoney(treasurySummary.managerVaultCash, storeInfo?.currency || 'ر.س')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFundSource('bank')}
                    className={`p-3 rounded-2xl font-bold text-[11px] border transition flex flex-col items-center gap-1 text-center ${
                      fundSource === 'bank'
                        ? 'bg-blue-50 border-blue-600 text-blue-900 ring-1 ring-blue-400'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base">🏛️</span>
                    <span>الحساب البنكي</span>
                    <span className="text-[9px] font-mono">
                      {formatMoney(treasurySummary.netBankBalance, storeInfo?.currency || 'ر.س')}
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">المبلغ *</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  placeholder="0.00"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-slate-200 bg-slate-50 font-black text-slate-900 font-mono text-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">البيان / سبب التغذية</label>
                <input
                  type="text"
                  placeholder="مثال: فكة لبداية الوردية"
                  value={fundNotes}
                  onChange={(e) => setFundNotes(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-black transition active:scale-95 shadow-sm"
                >
                  تنفيذ التغذية وطباعة السند ✅
                </button>
                <button
                  type="button"
                  onClick={() => setIsFundDrawerOpen(false)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isQuickDebtPayOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-rose-200 animate-in zoom-in-95">
            <div className="p-4 bg-gradient-to-r from-rose-800 to-orange-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-rose-200" />
                <h3 className="font-black text-sm">قبض دفعة من ديون وذمم العملاء (الآجل) 💵</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setIsQuickDebtPayOpen(false)} 
                className="text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickDebtPayment} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200 space-y-1">
                <span className="font-bold text-rose-950 block">سداد ديون العملاء الآجلة وتوزيعها المحاسبي</span>
                <p className="text-[11px] text-rose-800/80">
                  إذا تم السداد (كاش) يُقيد بعهدة صندوق الكاشير الحالي، وإذا تم (تحويل/شبكة) يُقيد بالبنك مباشرة.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">اختر العميل المدين *</label>
                <select
                  value={quickDebtCustomer?.id || ''}
                  onChange={(e) => {
                    const found = (customers || []).find(c => c.id === e.target.value);
                    setQuickDebtCustomer(found || null);
                    if (found) {
                      setQuickDebtAmount(String(Number(found.balance || found.credit || 0)));
                    }
                  }}
                  className="w-full px-3 py-2.5 border rounded-xl font-bold text-slate-900 bg-white outline-none focus:ring-2 focus:ring-rose-300"
                >
                  <option value="">-- اختر العميل --</option>
                  {(customers || [])
                    .filter(c => Number(c.balance || c.credit || 0) > 0)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} (المتبقي عليه: {formatMoney(Number(c.balance || c.credit || 0), storeInfo?.currency || 'ر.س')})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">مبلغ السداد المقبوض *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={quickDebtAmount}
                  onChange={(e) => setQuickDebtAmount(e.target.value)}
                  className="w-full px-3 py-2.5 border rounded-xl font-mono font-black text-emerald-800 text-base outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5 text-xs sm:text-sm">طريقة القبض وجهة الإيداع *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickDebtMethod('cash')}
                    className={`py-2 px-2 rounded-xl font-bold border-2 transition flex flex-col items-center justify-center gap-1 text-center ${
                      quickDebtMethod === 'cash'
                        ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-sm ring-2 ring-amber-200'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base">💵</span>
                    <span className="text-xs font-black">نقداً</span>
                    <span className="text-[10px] text-amber-700 font-normal">
                      {activeShift?.isOpen ? 'عهدة الدرج' : 'خزينة الإدارة'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDebtMethod('card')}
                    className={`py-2 px-2 rounded-xl font-bold border-2 transition flex flex-col items-center justify-center gap-1 text-center ${
                      quickDebtMethod === 'card'
                        ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-sm ring-2 ring-blue-200'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base">💳</span>
                    <span className="text-xs font-black">شبكة (POS)</span>
                    <span className="text-[10px] text-blue-700 font-normal">مدى / فيزا</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDebtMethod('transfer')}
                    className={`py-2 px-2 rounded-xl font-bold border-2 transition flex flex-col items-center justify-center gap-1 text-center ${
                      quickDebtMethod === 'transfer'
                        ? 'bg-cyan-50 border-cyan-500 text-cyan-900 shadow-sm ring-2 ring-cyan-200'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base">🏛️</span>
                    <span className="text-xs font-black">تحويل بنكي</span>
                    <span className="text-[10px] text-cyan-700 font-normal">مباشر للحساب</span>
                  </button>
                </div>
              </div>

              <div className="text-[11px] p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 leading-normal">
                {quickDebtMethod === 'cash' && (
                  activeShift?.isOpen 
                    ? '💵 سيتم إضافة المبلغ لنقدية درج الوردية الحالية وتسجيل حركة إيداع نقدية موثقة بالدرج.'
                    : '💵 سيتم توريد المبلغ مباشرة لخزينة الإدارة (كاش المدير) وتوثيقه بدفتر الخزينة لعدم وجود وردية كاشير مفتوحة.'
                )}
                {quickDebtMethod === 'card' && '💳 سيتم إضافة الدفعة إلى مبيعات نقاط البيع (شبكة مدى/فيزا) لتقييدها مع مبيعات الـ POS.'}
                {quickDebtMethod === 'transfer' && '🏛️ سيتم قيد الدفعة كتحويل بنكي مباشر وتسميعها فوراً في صافي رصيد الحساب البنكي.'}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-rose-700 to-orange-700 hover:from-rose-800 text-white rounded-xl font-black text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>تأكيد قبض الدفعة وتنزيل الدين</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsQuickDebtPayOpen(false)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* نوافذ الخزينة: كانت مستوردة لكن لم تُعرض إطلاقاً بعد تقسيم الشاشة،
          فكان زر "إيداع للبنك" وزر استلام العهدة لا يفتحان أي نافذة */}
      <BankDepositModal
        isOpen={isBankDepositOpen}
        onClose={() => setIsBankDepositOpen(false)}
        availableVaultCash={treasurySummary?.managerVaultCash || 0}
      />

      <ShiftHandoverModal
        isOpen={isHandoverModalOpen}
        onClose={() => { setIsHandoverModalOpen(false); setHandoverShiftTarget(null); }}
        shift={handoverShiftTarget}
      />

    </>
  );
};
