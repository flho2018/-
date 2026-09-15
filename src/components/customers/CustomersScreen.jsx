import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Plus, Search, Phone, FileText, DollarSign, Edit2, Trash2, X, Receipt, Printer, MessageSquare } from 'lucide-react';
import { formatMoney, formatDate, calculateInvoicePaymentBreakdown } from '../../utils/helpers';
import { printHtmlDirectly } from '../../utils/printHelper';

export const CustomersScreen = () => {
  const {
    customers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    addCustomerPayment,
    paymentReceipts,
    invoices,
    storeInfo,
    activeShift,
    hasPermission
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isReceiptsModalOpen, setIsReceiptsModalOpen] = useState(false);
  const [receiptSearchQuery, setReceiptSearchQuery] = useState('');
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [selectedForPayment, setSelectedForPayment] = useState(null);
  const [selectedForStatement, setSelectedForStatement] = useState(null);

  // نموذج العميل
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    balance: '0'
  });

  // نموذج سند القبض
  const [paymentData, setPaymentData] = useState({
    amount: '',
    method: 'cash',
    notes: ''
  });

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  );

  const totalDebts = customers.reduce((sum, c) => sum + (c.balance || 0), 0);

  const handleOpenAdd = () => {
    if (!hasPermission('customers_add')) {
      alert('⛔ ليس لديك صلاحية لإضافة عميل جديد!');
      return;
    }
    setEditingCustomer(null);
    setFormData({ name: '', phone: '', address: '', balance: '0' });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (c) => {
    if (!hasPermission('customers_manage')) {
      alert('⛔ ليس لديك صلاحية لتعديل بيانات العملاء!');
      return;
    }
    setEditingCustomer(c);
    setFormData({
      name: c.name,
      phone: c.phone || '',
      address: c.address || '',
      balance: String(c.balance || 0)
    });
    setIsAddModalOpen(true);
  };

  const handleSaveCustomer = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingCustomer) {
      // لا نرسل الرصيد عند التعديل: الرصيد يتغيّر فقط عبر البيع الآجل وسندات القبض.
      // إرساله كان يعيد كتابة القيمة التي التُقطت لحظة فتح النافذة، فيمحو أي دين
      // سُجّل أثناء فتحها أو من جهاز آخر. وهو أيضاً نص وليس رقماً فيسبب 500 + 300 = "500300".
      const { balance, ...editableFields } = formData;
      updateCustomer(editingCustomer.id, editableFields);
    } else {
      addCustomer({ ...formData, balance: Number(formData.balance) || 0 });
    }

    setIsAddModalOpen(false);
  };

  const handlePrintReceiptVoucher = (receiptData) => {
    const currency = storeInfo?.currency || 'ر.س';
    const custName = receiptData.customerName || selectedForPayment?.name || 'عميل';
    const html = `
      <div style="font-family: 'Cairo', sans-serif; direction: rtl; text-align: right; padding: 25px; color: #1e293b; max-width: 500px; margin: 0 auto; border: 2px solid #059669; border-radius: 12px; background: #fff;">
        <div style="text-align: center; border-bottom: 2px dashed #059669; padding-bottom: 12px; margin-bottom: 15px;">
          <h2 style="margin: 0; color: #065f46; font-size: 20px;">${storeInfo?.name || 'بيت الورد للزهور والهدايا'}</h2>
          <p style="margin: 3px 0 0 0; color: #64748b; font-size: 12px;">سند قبض مالي معتمد (سداد آجل)</p>
          <div style="display: inline-block; background: #ecfdf5; color: #065f46; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-top: 6px; border: 1px solid #a7f3d0;">
            رقم السند: ${receiptData.receiptNumber || 'REC'}
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px;">
          <span style="color: #64748b;">التاريخ والوقت:</span>
          <strong>${formatDate(receiptData.date || new Date())}</strong>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px;">
          <span style="color: #64748b;">استلمنا من العميل:</span>
          <strong style="color: #0f172a; font-size: 13px;">${custName}</strong>
        </div>

        ${receiptData.user ? `
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px;">
          <span style="color: #64748b;">الكاشير / المستلم:</span>
          <strong>${receiptData.user}</strong>
        </div>` : ''}

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px; margin: 15px 0; text-align: center;">
          <span style="font-size: 11px; color: #166534; display: block;">المبلغ المستلم</span>
          <strong style="font-size: 24px; color: #15803d; font-family: monospace;">${formatMoney(receiptData.amount, currency)}</strong>
          <span style="font-size: 11px; color: #166534; display: block; margin-top: 4px;">طريقة الدفع: ${
            receiptData.methodName || (
              receiptData.method === 'cash' 
                ? 'نقداً (خزينة الدرج)' 
                : receiptData.method === 'card' 
                  ? 'شبكة (مدى / فيزا POS)' 
                  : 'تحويل بنكي مباشر لحساب المؤسسة'
            )
          }</span>
        </div>

        ${receiptData.previousBalance !== undefined && receiptData.remainingBalance !== undefined ? `
        <div style="display: flex; justify-content: space-between; background: #f8fafc; padding: 8px 12px; border-radius: 6px; font-size: 11px; margin-bottom: 12px; border: 1px solid #e2e8f0;">
          <div><span style="color: #64748b;">الرصيد السابق:</span> <b>${formatMoney(receiptData.previousBalance, currency)}</b></div>
          <div><span style="color: #64748b;">الرصيد المتبقي:</span> <b style="color: #059669;">${formatMoney(receiptData.remainingBalance, currency)}</b></div>
        </div>` : ''}

        ${receiptData.notes ? `
        <div style="font-size: 11px; color: #475569; margin-bottom: 12px; background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #f1f5f9;">
          <strong>البيان / الملاحظات:</strong> ${receiptData.notes}
        </div>` : ''}

        <div style="border-top: 1px dashed #cbd5e1; padding-top: 10px; margin-top: 15px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b;">
          <div>توقيع المستلم: .................</div>
          <div>ختم المتجر: .................</div>
        </div>
      </div>
    `;
    printHtmlDirectly(html, `سند_قبض_${receiptData.receiptNumber || 'عميل'}`);
  };

  const handleShareReceiptWhatsApp = (receiptData) => {
    const currency = storeInfo?.currency || 'ر.س';
    const cust = (customers || []).find(c => c.id === receiptData.customerId) || {};
    const phone = receiptData.customerPhone || cust.phone || '';
    const custName = receiptData.customerName || cust.name || 'عميلنا العزيز';
    
    const text = 
      `🌸 *${storeInfo?.name || 'بيت الورد'}*\n` +
      `🧾 *سند قبض مالي معتمد (سداد آجل)*\n` +
      `────────────────────\n` +
      `رقم السند: #${receiptData.receiptNumber}\n` +
      `التاريخ: ${formatDate(receiptData.date)}\n` +
      `العميل: ${custName}\n` +
      `المبلغ المسدد: *${formatMoney(receiptData.amount, currency)}*\n` +
      `طريقة السداد: ${receiptData.methodName || (receiptData.method === 'cash' ? 'نقداً' : receiptData.method === 'card' ? 'شبكة مدى' : 'تحويل بنكي')}\n` +
      (receiptData.remainingBalance !== undefined ? `الرصيد المتبقي المستحق: *${formatMoney(receiptData.remainingBalance, currency)}*\n` : '') +
      (receiptData.notes ? `ملاحظات: ${receiptData.notes}\n` : '') +
      `المستلم: ${receiptData.user || 'الكاشير'}\n` +
      `────────────────────\n` +
      `شكراً لتعاملكم معنا 🌸`;

    const cleanPhone = phone.replace(/\D/g, '');
    const finalPhone = cleanPhone.startsWith('966') ? cleanPhone : cleanPhone.startsWith('05') ? `966${cleanPhone.slice(1)}` : cleanPhone;
    const url = finalPhone ? `https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleSavePayment = (e) => {
    e.preventDefault();

    // =====================================================================
    //  الحارس الفعلي لسند القبض — هنا لا عند الزر
    // =====================================================================
    //  للنافذة مسارا فتح: زر السداد في قائمة العملاء (محمي)، وزر "سداد
    //  دفعة" داخل نافذة كشف الحساب (كان بلا فحص إطلاقاً). فمن يُمنع من
    //  الأول كان يفتح كشف الحساب ويحصّل من الثاني.
    //  الحماية عند نقطة التنفيذ تغطي كل مسارات الفتح الحالية والمستقبلية.
    // =====================================================================
    if (!hasPermission('customers_receipt_voucher')) {
      alert('⛔ ليس لديك صلاحية تحصيل الديون وإصدار سندات القبض.\nتُمنح من: الإعدادات ← المستخدمون ← الصلاحيات.');
      return;
    }

    const amt = Number(paymentData.amount) || 0;
    if (amt <= 0 || !selectedForPayment) return;

    // منع السداد بأكثر من الدين: النظام كان يبتلع الزيادة (يجعل الرصيد صفراً)
    // فتدخل الفلوس الدرج بدون ما تُسجّل كأمانة للعميل، ويختلّ تقرير الوردية.
    const currentDebt = Number(selectedForPayment.balance) || 0;
    if (amt > currentDebt) {
      alert(`⛔ المبلغ المدخل (${formatMoney(amt, storeInfo.currency)}) أكبر من دين العميل (${formatMoney(currentDebt, storeInfo.currency)}).\n\nالنظام لا يسجّل المبالغ الزائدة كأمانة للعميل، فيرجى إدخال مبلغ لا يتجاوز الدين.`);
      return;
    }

    const receiptObj = addCustomerPayment(selectedForPayment.id, amt, paymentData.method, paymentData.notes);

    if (confirm(`✅ تم تسجيل سند القبض بمبلغ ${formatMoney(amt, storeInfo.currency)} بنجاح!\n\nهل ترغب في طباعة سند القبض للعميل الآن؟`)) {
      if (receiptObj) {
        handlePrintReceiptVoucher(receiptObj);
      }
    }
    setSelectedForPayment(null);
  };

  const customerStatementMovements = useMemo(() => {
    if (!selectedForStatement) return [];
    const custId = selectedForStatement.id;

    const custInvoices = (invoices || [])
      .filter(i => (i.customer?.id === custId || i.customerId === custId) && i.status !== 'refunded')
      .map(inv => {
        const b = calculateInvoicePaymentBreakdown(inv);
        const creditDue = b.credit || 0;
        const isCashOrCardOnly = creditDue === 0;

        return {
          id: inv.id,
          type: 'invoice',
          number: inv.invoiceNumber || inv.id,
          date: inv.date,
          title: isCashOrCardOnly ? `فاتورة مبيعات (مسددة فوري)` : `فاتورة مبيعات (آجل)`,
          notes: (inv.items || []).map(it => `${it.name} (${it.qty})`).slice(0, 2).join('، ') + ((inv.items || []).length > 2 ? '...' : ''),
          debit: creditDue, // فقط الجزء الآجل يمثل ذمة/مديونية على العميل!
          credit: 0,
          paymentMethod: inv.paymentMethod || 'credit',
          paymentMethodName: inv.paymentMethodName || (creditDue > 0 ? 'آجل' : 'مسددة فوراً'),
          isCreditSettled: inv.isCreditSettled || false,
          settledReceiptNo: inv.settledReceiptNo || null
        };
      });

    const custReceipts = (paymentReceipts || [])
      .filter(r => r.customerId === custId)
      .map(rcpt => ({
        id: rcpt.id,
        type: 'receipt',
        number: rcpt.receiptNumber || rcpt.id,
        date: rcpt.date,
        title: `سند قبض / سداد`,
        notes: rcpt.notes || (
          rcpt.method === 'cash' 
            ? 'سداد نقدي بالخزينة' 
            : rcpt.method === 'card' 
              ? 'سداد شبكة (مدى / POS)' 
              : 'سداد تحويل بنكي مباشر'
        ),
        debit: 0,
        credit: Number(rcpt.amount) || 0,
        paymentMethod: rcpt.method || 'cash',
        paymentMethodName: rcpt.methodName || (rcpt.method === 'cash' ? 'نقداً (الخزينة)' : rcpt.method === 'card' ? 'شبكة (مدى)' : 'تحويل بنكي مباشر'),
        receiptObj: rcpt
      }));

    const allChronological = [...custInvoices, ...custReceipts].sort((a, b) => new Date(a.date) - new Date(b.date));
    let running = 0;
    return allChronological.map(item => {
      running += (item.debit - item.credit);
      return {
        ...item,
        runningBalance: running
      };
    });
  }, [selectedForStatement, invoices, paymentReceipts]);

  const statementSummary = useMemo(() => {
    const totalDebit = customerStatementMovements.reduce((s, m) => s + m.debit, 0);
    const totalCredit = customerStatementMovements.reduce((s, m) => s + m.credit, 0);
    const remainingBalance = selectedForStatement?.balance ?? (totalDebit - totalCredit);
    return {
      totalDebit,
      totalCredit,
      remainingBalance
    };
  }, [customerStatementMovements, selectedForStatement]);

  const handlePrintStatement = () => {
    if (!selectedForStatement) return;
    const currency = storeInfo?.currency || 'ر.س';
    const rowsHtml = customerStatementMovements.map((m, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
        <td style="padding: 6px 8px; text-align: center; color: #64748b;">${idx + 1}</td>
        <td style="padding: 6px 8px; font-family: monospace;">${formatDate(m.date)}</td>
        <td style="padding: 6px 8px; font-weight: bold; color: ${m.type === 'invoice' ? '#0369a1' : '#15803d'};">
          ${m.type === 'invoice' ? '🧾 فاتورة ' : '🟢 سند قبض '} ${m.number}
        </td>
        <td style="padding: 6px 8px; color: #475569;">${m.notes || '—'} (${m.paymentMethodName})</td>
        <td style="padding: 6px 8px; text-align: left; font-family: monospace; color: ${m.debit > 0 ? '#b91c1c' : '#94a3b8'}; font-weight: ${m.debit > 0 ? 'bold' : 'normal'};">
          ${m.debit > 0 ? formatMoney(m.debit, '') : '—'}
        </td>
        <td style="padding: 6px 8px; text-align: left; font-family: monospace; color: ${m.credit > 0 ? '#15803d' : '#94a3b8'}; font-weight: ${m.credit > 0 ? 'bold' : 'normal'};">
          ${m.credit > 0 ? formatMoney(m.credit, '') : '—'}
        </td>
        <td style="padding: 6px 8px; text-align: left; font-family: monospace; font-weight: bold; color: #0f172a; background: #f8fafc;">
          ${formatMoney(m.runningBalance, currency)}
        </td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family: 'Cairo', sans-serif; direction: rtl; text-align: right; padding: 25px; color: #1e293b; max-width: 800px; margin: 0 auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #db2777; padding-bottom: 15px; margin-bottom: 15px;">
          <div>
            <h1 style="margin: 0; color: #831843; font-size: 20px;">${storeInfo?.name || 'بيت الورد للزهور والهدايا'}</h1>
            <p style="margin: 3px 0 0 0; color: #64748b; font-size: 12px;">كشف حساب عميل معتمد ومفصل</p>
            ${storeInfo?.taxNumber ? `<p style="margin: 2px 0 0 0; color: #64748b; font-size: 11px;">الرقم الضريبي: ${storeInfo.taxNumber}</p>` : ''}
          </div>
          <div style="text-align: left;">
            <div style="background: #fdf2f8; border: 1px solid #fbcfe8; padding: 8px 14px; border-radius: 10px;">
              <span style="font-size: 11px; color: #9d174d; display: block;">الرصيد المتبقي المستحق</span>
              <strong style="font-size: 18px; color: #831843; font-family: monospace;">${formatMoney(statementSummary.remainingBalance, currency)}</strong>
            </div>
            <span style="font-size: 10px; color: #94a3b8; display: block; margin-top: 4px;">تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-SA')}</span>
          </div>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 15px; display: grid; grid-template-columns: repeat(3, 1fr); font-size: 12px;">
          <div><strong>اسم العميل:</strong> ${selectedForStatement.name}</div>
          <div><strong>رقم الهاتف:</strong> <span style="font-family: monospace;">${selectedForStatement.phone || '—'}</span></div>
          <div><strong>العنوان:</strong> ${selectedForStatement.address || '—'}</div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px; text-align: center;">
          <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 8px; border-radius: 8px;">
            <span style="font-size: 11px; color: #991b1b; display: block;">إجمالي المشتريات (مدين +)</span>
            <strong style="font-size: 14px; color: #b91c1c; font-family: monospace;">${formatMoney(statementSummary.totalDebit, currency)}</strong>
          </div>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 8px; border-radius: 8px;">
            <span style="font-size: 11px; color: #166534; display: block;">إجمالي السدادات (دائن -)</span>
            <strong style="font-size: 14px; color: #15803d; font-family: monospace;">${formatMoney(statementSummary.totalCredit, currency)}</strong>
          </div>
          <div style="background: #fdf2f8; border: 1px solid #fbcfe8; padding: 8px; border-radius: 8px;">
            <span style="font-size: 11px; color: #9d174d; display: block;">صافي المديونية الحالية</span>
            <strong style="font-size: 14px; color: #831843; font-family: monospace;">${formatMoney(statementSummary.remainingBalance, currency)}</strong>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #f1f5f9; color: #334155; font-size: 11px; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 8px; text-align: center; width: 30px;">#</th>
              <th style="padding: 8px;">التاريخ</th>
              <th style="padding: 8px;">نوع المعاملة</th>
              <th style="padding: 8px;">البيان</th>
              <th style="padding: 8px; text-align: left;">مدين (+)</th>
              <th style="padding: 8px; text-align: left;">دائن (-)</th>
              <th style="padding: 8px; text-align: left;">الرصيد المتبقي</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #94a3b8;">لا توجد حركات مسجلة لهذا العميل</td></tr>'}
          </tbody>
        </table>

        <div style="border-top: 1px dashed #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b;">
          <div>إقرار العميل: .......................................</div>
          <div>ختم المحل والمحاسب: .......................................</div>
        </div>
      </div>
    `;
    printHtmlDirectly(html, `كشف_حساب_${selectedForStatement.name}`);
  };

  const handleShareStatementWhatsApp = () => {
    if (!selectedForStatement) return;
    const currency = storeInfo?.currency || 'ر.س';
    const phone = selectedForStatement.phone || '';
    const clean = String(phone).replace(/[^0-9]/g, '');
    const intl = clean.startsWith('05') ? '966' + clean.slice(1) : clean.startsWith('5') ? '966' + clean : clean;

    const msg = `🌸 *كشف حساب - ${storeInfo?.name || 'بيت الورد'}*\n` +
      `👤 العميل المكرم: *${selectedForStatement.name}*\n` +
      `📅 التاريخ: ${new Date().toLocaleDateString('ar-SA')}\n` +
      `--------------------------------\n` +
      `🧾 إجمالي المشتريات: ${formatMoney(statementSummary.totalDebit, currency)}\n` +
      `💵 إجمالي السدادات: ${formatMoney(statementSummary.totalCredit, currency)}\n` +
      `📌 *الرصيد المتبقي المستحق:* *${formatMoney(statementSummary.remainingBalance, currency)}*\n` +
      `--------------------------------\n` +
      `نشكركم لتعاملكم معنا ونسعد بخدمتكم دائماً 🌸`;

    const enc = encodeURIComponent(msg);
    if (intl) {
      window.open(`https://wa.me/${intl}?text=${enc}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${enc}`, '_blank');
    }
  };

  return (
    <div className="p-3 sm:p-5 lg:p-8 max-w-md md:max-w-3xl lg:max-w-7xl mx-auto space-y-4 pb-24 select-none animate-in fade-in">
      
      {/* رأس صفحة العملاء مع زر إضافة عميل جديد */}
      <div className="bg-white/95 backdrop-blur-md p-4 rounded-3xl border-2 border-pink-100 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white flex items-center justify-center text-2xl shadow-md">
            👥
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900">سجل العملاء والحسابات الآجلة</h2>
            <p className="text-xs text-slate-500">متابعة مديونيات العملاء، كشوفات الحساب، وسندات القبض</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsReceiptsModalOpen(true)}
            className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-2 border-emerald-300 rounded-2xl text-xs font-black shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
            title="سجل سندات القبض الصادرة والبحث والطباعة والمشاركة"
          >
            <Receipt className="w-4 h-4 text-emerald-600" />
            <span>📑 سندات القبض ({paymentReceipts?.length || 0})</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-white rounded-2xl text-xs font-black shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>➕ إضافة عميل جديد</span>
          </button>
        </div>
      </div>

      {/* بطاقات ملخص حسابات العملاء المستطيلة الزاهية */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {/* 1. إجمالي الديون المستحقة */}
        <div className="p-3.5 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50/70 rounded-2xl border-2 border-amber-300/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-amber-950 text-xs font-black block mb-0.5">إجمالي الديون (الآجل)</span>
            <strong className="text-base sm:text-lg font-black text-amber-700 font-mono tracking-tight">{formatMoney(totalDebts, storeInfo.currency)}</strong>
          </div>
          <span className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-base shadow-md shadow-amber-500/25">⏳</span>
        </div>

        {/* 2. إجمالي العملاء */}
        <div className="p-3.5 bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-50/70 rounded-2xl border-2 border-blue-300/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-blue-950 text-xs font-black block mb-0.5">إجمالي العملاء المسجلين</span>
            <strong className="text-base sm:text-lg font-black text-blue-700 font-mono tracking-tight">{customers.length} عميل</strong>
          </div>
          <span className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center font-black text-base shadow-md shadow-blue-500/25">👥</span>
        </div>

        {/* 3. عملاء بمديونية نشطة */}
        <div className="p-3.5 bg-gradient-to-br from-rose-50 via-pink-50 to-red-50/70 rounded-2xl border-2 border-rose-300/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-rose-950 text-xs font-black block mb-0.5">عملاء بمديونية نشطة</span>
            <strong className="text-base sm:text-lg font-black text-rose-700 font-mono tracking-tight">{customers.filter(c => (c.balance || 0) > 0).length} عميل</strong>
          </div>
          <span className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black text-base shadow-md shadow-rose-500/25">⚠️</span>
        </div>

        {/* 4. عملاء مسددين بالكامل */}
        <div className="p-3.5 bg-gradient-to-br from-emerald-50 via-teal-50 to-green-50/70 rounded-2xl border-2 border-emerald-300/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-emerald-950 text-xs font-black block mb-0.5">عملاء رصيدهم صفر (مسدد)</span>
            <strong className="text-base sm:text-lg font-black text-emerald-700 font-mono tracking-tight">{customers.filter(c => (c.balance || 0) <= 0).length} عميل</strong>
          </div>
          <span className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black text-base shadow-md shadow-emerald-500/25">✅</span>
        </div>
      </div>

      {/* البحث */}
      <div className="relative">
        <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث باسم العميل أو رقم الهاتف..."
          className="w-full pl-3 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      {/* قائمة العملاء */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredCustomers.map(c => {
          const hasDebt = (c.balance || 0) > 0;
          return (
            <div
              key={c.id}
              className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm space-y-2.5 hover:border-slate-300 transition"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-xs text-slate-900">{c.name}</h4>
                    {c.isDefault && (
                      <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded">
                        افتراضي
                      </span>
                    )}
                  </div>
                  {c.phone && c.phone !== '-' && (
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 font-mono">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{c.phone}</span>
                    </p>
                  )}
                </div>

                <div className="text-left">
                  <span className="text-[10px] text-slate-400 block">الرصيد / الدين:</span>
                  <span className={`text-xs font-black ${hasDebt ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {formatMoney(c.balance || 0, storeInfo.currency)}
                  </span>
                </div>
              </div>

              {/* أزرار الإجراءات */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1">
                  {!c.isDefault && (
                    <button
                      onClick={() => handleOpenEdit(c)}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!c.isDefault && (
                    <button
                      onClick={() => {
                        if (!hasPermission('customers_delete')) {
                          alert('⛔ ليس لديك صلاحية لحذف العملاء!');
                          return;
                        }
                        if (confirm(`حذف العميل (${c.name})؟`)) deleteCustomer(c.id);
                      }}
                      className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg"
                      title="حذف العميل"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setSelectedForStatement(c)}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>كشف حساب</span>
                  </button>

                  {!c.isDefault && hasDebt && (
                    <button
                      onClick={() => {
                        if (!hasPermission('customers_receipt_voucher')) {
                          alert('⛔ ليس لديك صلاحية لإنشاء سندات قبض!');
                          return;
                        }
                        setSelectedForPayment(c);
                        setPaymentData({ amount: String(c.balance || ''), method: 'cash', notes: '' });
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm shadow-emerald-500/20 active:scale-95"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>سند قبض</span>
                    </button>
                  )}
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* نافذة إضافة / تعديل عميل */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">{editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">اسم العميل *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="الاسم الكامل أو اسم المؤسسة"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">رقم الجوال</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="05XXXXXXXX"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">العنوان</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="المدينة - الحي"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">الرصيد الافتتاحي (مديونية سابقة)</label>
                <input
                  type="number"
                  step="any"
                  value={formData.balance}
                  onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold shadow-md shadow-amber-600/30 transition mt-2"
              >
                {editingCustomer ? 'حفظ التعديلات' : 'إضافة العميل'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* نافذة سند قبض دفعة من العميل */}
      {selectedForPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="p-4 bg-emerald-800 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">سند قبض دفعة نقدية</h3>
                <p className="text-[11px] text-emerald-200">العميل: {selectedForPayment.name}</p>
              </div>
              <button onClick={() => setSelectedForPayment(null)} className="p-1 rounded-lg bg-emerald-900 text-emerald-300 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-4 space-y-3 text-xs">
              <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 text-emerald-900">
                <span>الرصيد المستحق الحالي: </span>
                <strong className="font-black">{formatMoney(selectedForPayment.balance || 0, storeInfo.currency)}</strong>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">المبلغ المقبوض *</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-black text-emerald-700 text-base text-center"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1.5 text-xs sm:text-sm">طريقة القبض وجهة الإيداع *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentData({ ...paymentData, method: 'cash' })}
                    className={`py-2.5 px-2 rounded-xl font-bold border-2 transition flex flex-col items-center justify-center gap-1 text-center ${
                      paymentData.method === 'cash'
                        ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-sm ring-2 ring-amber-200'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base">💵</span>
                    <span className="text-xs font-black">نقداً</span>
                    <span className="text-[10px] text-amber-700 font-normal">
                      {activeShift?.isOpen ? 'خزينة الوردية' : 'خزينة الإدارة'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentData({ ...paymentData, method: 'card' })}
                    className={`py-2.5 px-2 rounded-xl font-bold border-2 transition flex flex-col items-center justify-center gap-1 text-center ${
                      paymentData.method === 'card'
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
                    onClick={() => setPaymentData({ ...paymentData, method: 'transfer' })}
                    className={`py-2.5 px-2 rounded-xl font-bold border-2 transition flex flex-col items-center justify-center gap-1 text-center ${
                      paymentData.method === 'transfer'
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

              <div className="text-[11px] p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 leading-normal">
                {paymentData.method === 'cash' && '💵 سيتم إضافة المبلغ لنقدية درج الوردية الحالية وتسجيل حركة إيداع نقدية موثقة.'}
                {paymentData.method === 'card' && '💳 سيتم إضافة الدفعة إلى مبيعات نقاط البيع (شبكة مدى/فيزا) لتسويتها مع حساب البنك.'}
                {paymentData.method === 'transfer' && '🏛️ سيتم قيد الدفعة كتحويل بنكي مباشر وتسميعها فوراً في صافي رصيد الحساب البنكي.'}
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">ملاحظات</label>
                <input
                  type="text"
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                  placeholder="ملاحظات أو رقم الحوالة..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-md transition"
              >
                تأكيد سند القبض وتحديث الرصيد
              </button>
            </form>
          </div>
        </div>
      )}

      {/* نافذة كشف حساب العميل المتكاملة والمفصلة */}
      {selectedForStatement && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col border border-pink-100">
            
            {/* رأس نافذة كشف الحساب مع أزرار الإجراءات */}
            <div className="p-4 bg-gradient-to-r from-[#2A0845] via-[#200535] to-[#380624] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">📜</span>
                  <h3 className="text-sm sm:text-base font-black text-white">كشف حساب العميل المعتمد</h3>
                  <span className="px-2 py-0.5 rounded-full bg-pink-500/30 text-pink-200 text-[10px] font-mono">
                    {customerStatementMovements.length} حركة مسجلة
                  </span>
                </div>
                <p className="text-xs text-pink-200/80 mt-0.5">
                  العميل: <strong className="text-white">{selectedForStatement.name}</strong> {selectedForStatement.phone ? `• ${selectedForStatement.phone}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handlePrintStatement}
                  className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1 transition active:scale-95 border border-white/20 shadow-xs"
                  title="طباعة كشف الحساب بصيغة رسمية"
                >
                  <Printer className="w-3.5 h-3.5 text-pink-300" />
                  <span>طباعة 🖨️</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareStatementWhatsApp}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 transition active:scale-95 shadow-xs"
                  title="إرسال ملخص الحساب للعميل عبر الواتساب"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>واتساب 💬</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!hasPermission('customers_receipt_voucher')) {
                      alert('⛔ ليس لديك صلاحية تحصيل الديون وإصدار سندات القبض.');
                      return;
                    }
                    const target = selectedForStatement;
                    setSelectedForStatement(null);
                    setSelectedForPayment(target);
                    setPaymentData({ amount: String(target.balance || ''), method: 'cash', notes: '' });
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black flex items-center gap-1 transition active:scale-95 shadow-xs"
                  title="تسجيل سند قبض وسداد دفعة للعميل"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>سداد دفعة 💵</span>
                </button>

                <button 
                  onClick={() => setSelectedForStatement(null)} 
                  className="p-1.5 rounded-xl bg-white/10 text-pink-200 hover:text-white transition active:scale-95"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* بطاقات المؤشرات المالية الثلاث لكشف الحساب */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white p-2.5 rounded-2xl border border-rose-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 block font-bold">إجمالي المشتريات (مدين +)</span>
                <strong className="text-sm sm:text-base font-black text-rose-600 font-mono">
                  {formatMoney(statementSummary.totalDebit, storeInfo.currency)}
                </strong>
              </div>

              <div className="bg-white p-2.5 rounded-2xl border border-emerald-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 block font-bold">إجمالي السدادات (دائن -)</span>
                <strong className="text-sm sm:text-base font-black text-emerald-600 font-mono">
                  {formatMoney(statementSummary.totalCredit, storeInfo.currency)}
                </strong>
              </div>

              <div className="bg-white p-2.5 rounded-2xl border border-pink-300 shadow-2xs">
                <span className="text-[10px] text-pink-800 block font-bold">الرصيد المتبقي المستحق</span>
                <strong className="text-sm sm:text-base font-black text-pink-700 font-mono">
                  {formatMoney(statementSummary.remainingBalance, storeInfo.currency)}
                </strong>
              </div>
            </div>

            {/* جدول الحركات المحاسبية التفصيلي */}
            <div className="p-3 sm:p-4 overflow-y-auto space-y-3 text-xs flex-1">
              <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-2 text-center w-10">#</th>
                      <th className="py-2.5 px-3">التاريخ</th>
                      <th className="py-2.5 px-3">السند / المعاملة</th>
                      <th className="py-2.5 px-3">البيان وطريقة الدفع</th>
                      <th className="py-2.5 px-3 text-left">مدين (+)</th>
                      <th className="py-2.5 px-3 text-left">دائن (-)</th>
                      <th className="py-2.5 px-3 text-left">الرصيد المتبقي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {customerStatementMovements.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="py-8 text-center text-slate-400">
                          لا توجد فواتير أو سندات سداد مسجلة لهذا العميل حتى الآن
                        </td>
                      </tr>
                    ) : (
                      customerStatementMovements.map((m, idx) => (
                        <tr key={m.id || idx} className="hover:bg-pink-50/40 transition">
                          <td className="py-2.5 px-2 text-center text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                            {formatDate(m.date)}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                              m.type === 'invoice'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              {m.type === 'invoice' ? '🧾 فاتورة' : '🟢 سند قبض'} {m.number}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-slate-800 font-bold block truncate max-w-[180px]" title={m.notes}>
                              {m.notes || '—'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono block">
                              {m.paymentMethodName}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono font-bold text-rose-600 whitespace-nowrap">
                            {m.debit > 0 ? formatMoney(m.debit, '') : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-600 whitespace-nowrap">
                            {m.credit > 0 ? formatMoney(m.credit, '') : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono font-black text-slate-900 bg-slate-50/80 whitespace-nowrap">
                            {formatMoney(m.runningBalance, storeInfo.currency)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* تذييل النافذة */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>الحساب متطابق مع القيود المحاسبية لنظام بيت الورد</span>
              <button
                type="button"
                onClick={() => setSelectedForStatement(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

      {/* نافذة سجل سندات القبض والتحصيل المالي */}
      {isReceiptsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* رأس النافذة */}
            <div className="p-4 bg-gradient-to-r from-emerald-600 via-teal-700 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-2xl bg-white/10 text-xl">📑</span>
                <div>
                  <h3 className="text-base font-black">سجل سندات القبض والتحصيل المالي</h3>
                  <p className="text-[11px] text-emerald-200">
                    توثيق كافة عمليات سداد الآجل مع إمكانية البحث والطباعة والمشاركة عبر الواتساب
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsReceiptsModalOpen(false)}
                className="p-1 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* شريط البحث والإحصائية */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="بحث برقم السند أو اسم العميل..."
                  value={receiptSearchQuery}
                  onChange={(e) => setReceiptSearchQuery(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 text-xs bg-white rounded-xl border border-slate-200 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="px-3 py-1.5 rounded-xl bg-emerald-100/70 text-emerald-800 font-bold border border-emerald-200">
                  عدد السندات: {paymentReceipts?.length || 0}
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-slate-200 text-slate-800 font-bold font-mono">
                  إجمالي التحصيل: {formatMoney((paymentReceipts || []).reduce((s, r) => s + (Number(r.amount) || 0), 0), storeInfo?.currency || 'ر.س')}
                </span>
              </div>
            </div>

            {/* جدول السندات */}
            <div className="p-4 overflow-y-auto flex-1">
              {(() => {
                const filtered = (paymentReceipts || []).filter(r => {
                  if (!receiptSearchQuery.trim()) return true;
                  const q = receiptSearchQuery.trim().toLowerCase();
                  const cust = (customers || []).find(c => c.id === r.customerId) || {};
                  const name = (r.customerName || cust.name || '').toLowerCase();
                  const rNo = (r.receiptNumber || r.id || '').toLowerCase();
                  return name.includes(q) || rNo.includes(q);
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-slate-400">
                      <Receipt className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-bold">لا توجد سندات قبض مسجلة تطابق البحث</p>
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">رقم السند</th>
                          <th className="py-2.5 px-3">التاريخ والوقت</th>
                          <th className="py-2.5 px-3">العميل</th>
                          <th className="py-2.5 px-3">المبلغ</th>
                          <th className="py-2.5 px-3">طريقة السداد</th>
                          <th className="py-2.5 px-3">المستلم / الكاشير</th>
                          <th className="py-2.5 px-3">البيان</th>
                          <th className="py-2.5 px-3 text-center">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {filtered.map(rcpt => {
                          const cust = (customers || []).find(c => c.id === rcpt.customerId) || {};
                          const cName = rcpt.customerName || cust.name || 'عميل';

                          return (
                            <tr key={rcpt.id} className="hover:bg-emerald-50/30 transition">
                              <td className="py-2.5 px-3 font-mono font-bold text-emerald-700 whitespace-nowrap">
                                {rcpt.receiptNumber || rcpt.id}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap font-mono text-[11px]">
                                {formatDate(rcpt.date)}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-slate-900">
                                {cName}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-black text-emerald-700 text-sm whitespace-nowrap">
                                {formatMoney(rcpt.amount, storeInfo?.currency || 'ر.س')}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold border ${
                                  rcpt.method === 'cash' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                  rcpt.method === 'card' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                                  'bg-purple-50 text-purple-800 border-purple-200'
                                }`}>
                                  {rcpt.methodName || (rcpt.method === 'cash' ? 'نقداً' : rcpt.method === 'card' ? 'شبكة مدى' : 'تحويل بنكي')}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">
                                {rcpt.user || 'كاشير'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-500 max-w-[150px] truncate" title={rcpt.notes}>
                                {rcpt.notes || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handlePrintReceiptVoucher(rcpt)}
                                    className="p-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition shadow-xs"
                                    title="طباعة سند القبض"
                                  >
                                    <Printer className="w-3.5 h-3.5 text-emerald-400" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleShareReceiptWhatsApp(rcpt)}
                                    className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
                                    title="مشاركة سند القبض عبر الواتساب"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* تذييل النافذة */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>سندات القبض موثقة ومتزامنة سحابياً ولحظياً</span>
              <button
                type="button"
                onClick={() => setIsReceiptsModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
