import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, CheckCircle, AlertCircle, Printer, User, Clock } from 'lucide-react';
import { formatMoney, formatDate, resolveUserName } from '../../utils/helpers';
import { printShiftHandoverVoucherHtml } from '../../utils/printHelper';

export const ShiftHandoverModal = ({ isOpen, onClose, shift }) => {
  const { confirmShiftCashHandover, storeInfo, currentUser, users } = useApp();

  const [receivedAmount, setReceivedAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [autoPrint, setAutoPrint] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen && shift) {
      const defaultAmt = shift.handoverAmount !== undefined && shift.handoverAmount !== null
        ? shift.handoverAmount
        : (shift.actualCash !== undefined && shift.actualCash !== null ? shift.actualCash : 0);
      setReceivedAmount(String(defaultAmt));
      setNotes('');
      setErrorMsg('');
    }
  }, [isOpen, shift]);

  if (!isOpen || !shift) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const numAmt = Number(receivedAmount);

    if (isNaN(numAmt) || numAmt < 0) {
      setErrorMsg('الرجاء إدخال مبلغ صحيح مستلم');
      return;
    }

    const res = confirmShiftCashHandover(shift.id, numAmt, notes.trim());

    if (res && res.success) {
      if (autoPrint && res.entry) {
        setTimeout(() => {
          printShiftHandoverVoucherHtml(res.entry, storeInfo, users);
        }, 150);
      }
      onClose();
    } else if (res && res.message) {
      setErrorMsg(res.message);
    }
  };

  const cashierName = resolveUserName(shift, users) || shift.cashierName || 'كاشير نقطة البيع';
  const expectedCash = Number(shift.expectedCash) || 0;
  const actualCash = Number(shift.actualCash) || 0;
  const difference = Number(shift.difference) || (actualCash - expectedCash);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-sm animate-in fade-in select-none font-cairo">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* رأس النافذة */}
        <div className="px-5 py-4 bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center text-xl shadow-inner">
              🤝
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base leading-snug">تأكيد استلام كاش الوردية وتبرئة الذمة</h3>
              <p className="text-[11px] text-purple-100/90">استلام النقدية يداً بيد ونقلها من عهدة الكاشير إلى خزينة الإدارة</p>
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
          
          {/* بيانات الوردية المقفلة */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-500 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-purple-600" />
                <span>الكاشير المسلّم:</span>
              </span>
              <span className="font-black text-slate-900 text-xs bg-purple-50 text-purple-800 px-2 py-0.5 rounded-lg border border-purple-200">
                {cashierName}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>توقيت الإغلاق:</span>
              </span>
              <span className="font-bold text-slate-700 font-mono text-[11px]">
                {formatDate(shift.closedAt || shift.date || new Date().toISOString())}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-center">
              <div className="p-2 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block">المتوقع بالدرج</span>
                <span className="font-black text-slate-800 text-xs">
                  {formatMoney(expectedCash, storeInfo?.currency || 'ر.س')}
                </span>
              </div>
              <div className="p-2 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block">جرد الكاشير الفعلي</span>
                <span className="font-black text-purple-900 text-xs">
                  {formatMoney(actualCash, storeInfo?.currency || 'ر.س')}
                </span>
              </div>
            </div>

            {difference !== 0 && (
              <div className={`p-2 rounded-xl text-center font-bold text-[11px] ${difference > 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                {difference > 0 
                  ? `زيادة نقدية مسجلة: +${formatMoney(difference, storeInfo?.currency || 'ر.س')}` 
                  : `عجز نقدي مسجل: ${formatMoney(difference, storeInfo?.currency || 'ر.س')}`}
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* المبلغ المستلم فعلياً من الكاشير */}
          <div>
            <label className="block font-black text-slate-800 mb-1">المبلغ النقدي المستلم باليد *</label>
            <div className="relative">
              <input
                type="number"
                step="any"
                required
                min="0"
                placeholder="0.00"
                value={receivedAmount}
                onChange={e => {
                  setReceivedAmount(e.target.value);
                  setErrorMsg('');
                }}
                className="w-full px-4 py-3 border-2 border-purple-300 focus:border-purple-600 rounded-2xl font-black text-slate-900 text-lg text-center outline-none bg-purple-50/20"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">
                {storeInfo?.currency || 'ر.س'}
              </span>
            </div>
          </div>

          {/* ملاحظات الاستلام */}
          <div>
            <label className="block font-black text-slate-800 mb-1">ملاحظات الاستلام وتبرئة الذمة (اختياري)</label>
            <input
              type="text"
              placeholder="مثال: تم استلام المبلغ مطابقاً وجاهز للإيداع"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-bold outline-none focus:border-purple-500"
            />
          </div>

          {/* خيار طباعة السند */}
          <label className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition">
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={e => setAutoPrint(e.target.checked)}
              className="w-4 h-4 text-purple-600 rounded"
            />
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5 text-purple-600" />
              <span>طباعة سند استلام نقدية وردية معتمد فور التأكيد</span>
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
              className="px-6 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 text-white rounded-xl font-black shadow-md transition active:scale-95 flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              <span>تأكيد الاستلام وتبرئة الذمة 🤝</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
