import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, CheckCircle, AlertCircle, Printer } from 'lucide-react';
import { formatMoney } from '../../utils/helpers';
import { printBankDepositVoucherHtml } from '../../utils/printHelper';

const POPULAR_BANKS = [
  'مصرف الراجحي',
  'البنك الأهلي السعودي (SNB)',
  'مصرف الإنماء',
  'بنك الرياض',
  'بنك البلاد',
  'البنك العربي الوطني (ANB)',
  'بنك الجزيرة',
  'البنك السعودي الأول (SAB)',
  'بنك آخر / محفظة'
];

export const BankDepositModal = ({ isOpen, onClose, availableVaultCash = 0 }) => {
  const { depositCashToBank, storeInfo, currentUser } = useApp();

  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState(POPULAR_BANKS[0]);
  const [depositSlipNumber, setDepositSlipNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [autoPrint, setAutoPrint] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAmount(availableVaultCash > 0 ? String(availableVaultCash) : '');
      setDepositSlipNumber('');
      setNotes('');
      setErrorMsg('');
    }
  }, [isOpen, availableVaultCash]);

  if (!isOpen) return null;

  const handleDepositAll = () => {
    if (availableVaultCash > 0) {
      setAmount(String(availableVaultCash));
      setErrorMsg('');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const numAmt = Number(amount) || 0;

    if (numAmt <= 0) {
      setErrorMsg('الرجاء إدخال مبلغ إيداع صحيح أكبر من الصفر');
      return;
    }

    if (numAmt > availableVaultCash && availableVaultCash > 0) {
      const confirmExceed = window.confirm(
        `تنبيه محاسبي: المبلغ المراد إيداعه (${formatMoney(numAmt, storeInfo?.currency || 'ر.س')}) أكبر من الكاش المتوفر حالياً بالخزينة (${formatMoney(availableVaultCash, storeInfo?.currency || 'ر.س')}). هل ترغب في المتابعة؟`
      );
      if (!confirmExceed) return;
    }

    const res = depositCashToBank({
      amount: numAmt,
      bankName,
      depositSlipNumber: depositSlipNumber.trim(),
      notes: notes.trim()
    });

    if (res && res.success) {
      if (autoPrint && res.entry) {
        setTimeout(() => {
          printBankDepositVoucherHtml(res.entry, storeInfo);
        }, 150);
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-sm animate-in fade-in select-none font-cairo">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* رأس النافذة */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center text-xl shadow-inner">
              🏦
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base leading-snug">إيداع نقدية في الحساب البنكي</h3>
              <p className="text-[11px] text-emerald-100/90">ترحيل كاش المبيعات من عهدة الإدارة إلى البنك وتوثيق رقم الإيصال</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* جسم النافذة */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto text-xs">
          
          {/* بطاقة رصيد الخزينة المتاح للمدير */}
          <div className="p-3.5 bg-gradient-to-br from-emerald-50 to-teal-50/70 rounded-2xl border border-emerald-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-lg shadow-sm">
                💼
              </div>
              <div>
                <span className="text-[11px] font-bold text-emerald-900/80 block">نقدية الخزينة المتوفرة في يد الإدارة:</span>
                <span className="text-base sm:text-lg font-black text-emerald-950">
                  {formatMoney(availableVaultCash, storeInfo?.currency || 'ر.س')}
                </span>
              </div>
            </div>

            {availableVaultCash > 0 && (
              <button
                type="button"
                onClick={handleDepositAll}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-[11px] transition active:scale-95 shadow-xs flex items-center gap-1"
              >
                <span>⚡ إيداع الكل</span>
              </button>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* المبلغ المراد إيداعه */}
          <div>
            <label className="block font-black text-slate-800 mb-1">المبلغ المراد إيداعه في البنك *</label>
            <div className="relative">
              <input
                type="number"
                step="any"
                required
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={e => {
                  setAmount(e.target.value);
                  setErrorMsg('');
                }}
                className="w-full px-4 py-3 border-2 border-emerald-300 focus:border-emerald-600 rounded-2xl font-black text-slate-900 text-lg text-center outline-none bg-emerald-50/20"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">
                {storeInfo?.currency || 'ر.س'}
              </span>
            </div>
          </div>

          {/* اختيار البنك */}
          <div>
            <label className="block font-black text-slate-800 mb-1">اسم البنك المودع فيه *</label>
            <select
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 font-bold outline-none focus:border-emerald-500"
            >
              {POPULAR_BANKS.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* رقم إيصال الإيداع */}
          <div>
            <label className="block font-black text-slate-800 mb-1">
              رقم إيصال الإيداع البنكي (Deposit Slip #)
              <span className="text-slate-400 font-normal mr-1">(من إيصال الصراف أو الفرع)</span>
            </label>
            <input
              type="text"
              placeholder="مثال: 94827104 أو أرقام الحركة"
              value={depositSlipNumber}
              onChange={e => setDepositSlipNumber(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-bold font-mono outline-none focus:border-emerald-500"
            />
          </div>

          {/* ملاحظات */}
          <div>
            <label className="block font-black text-slate-800 mb-1">ملاحظات توضيحية (اختياري)</label>
            <input
              type="text"
              placeholder="مثال: إيداع كاش مبيعات عطلة نهاية الأسبوع"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-bold outline-none focus:border-emerald-500"
            />
          </div>

          {/* خيار الطباعة التلقائية */}
          <label className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition">
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={e => setAutoPrint(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded"
            />
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5 text-emerald-600" />
              <span>طباعة سند إيداع بنكي رسمي فور تأكيد العملية</span>
            </span>
          </label>

          {/* أزرار الإجراء */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white rounded-xl font-black shadow-md transition active:scale-95 flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              <span>تأكيد وترحيل الإيداع للبنك 🏦</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
