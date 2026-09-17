import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Landmark, X, Printer, Lock, AlertCircle } from 'lucide-react';
import { formatMoney } from '../../utils/helpers';
import { printTreasuryDropVoucherHtml } from '../../utils/printHelper';
import { verifyPin } from '../../utils/security';

export const TreasuryDropModal = ({ isOpen, onClose, currentDrawerCash = 0 }) => {
  const {
    activeShift,
    addDrawerMovement,
    users,
    storeInfo,
    currentUser,
    confirmDialog
  } = useApp();

  const startCash = activeShift?.startCash || storeInfo?.defaultStartCash || 500;
  const surplusCash = Math.max(0, currentDrawerCash - startCash);

  const isAdmin = currentUser?.role === 'admin';
  const [amount, setAmount] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [recipient, setRecipient] = useState(() => {
    const adminUser = (users || []).find(u => u.role === 'admin');
    return adminUser?.name || 'أمين الخزينة الرئيسية';
  });
  const [reason, setReason] = useState('ترحيل دوري لتخفيف النقدية بالدرج وحفظها بالخزينة');
  const [voucherNo, setVoucherNo] = useState(() => `TR-${Date.now().toString().slice(-6)}`);
  const [autoPrint, setAutoPrint] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setVoucherNo(`TR-${Date.now().toString().slice(-6)}`);
      setAmount('');
      setAdminPin('');
      setPinError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const numAmount = Number(amount) || 0;
  const remainingInDrawer = Math.max(0, currentDrawerCash - numAmount);

  const handleQuickAmount = (val) => {
    setAmount(String(val));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPinError('');

    if (numAmount <= 0) {
      alert('يرجى إدخال مبلغ صحيح للسحب والترحيل');
      return;
    }

    if (numAmount > currentDrawerCash) {
      const confirmExceed = await confirmDialog({
        title: '⚠️ المبلغ أكبر من الدرج',
        message: `المبلغ المدخل (${formatMoney(numAmount, storeInfo?.currency || 'ر.س')}) أكبر من النقدية المتوفرة بالدرج (${formatMoney(currentDrawerCash, storeInfo?.currency || 'ر.س')}).\n\nهل أنت متأكد من المتابعة والترحيل؟`,
        confirmText: 'متابعة الترحيل',
        tone: 'warning'
      });
      if (!confirmExceed) return;
    }

    let authorizedAdminName = '';
    if (isAdmin) {
      authorizedAdminName = currentUser?.name || 'مدير النظام';
    } else {
      // التحقق الصارم من رمز المدير السري (الخيار الأول - الأمان التام)
      if (!adminPin.trim()) {
        setPinError('🔒 يرجى إدخال رمز المدير السري (PIN) لاعتماد استلام المبلغ');
        return;
      }
      const adminUsers = (users || []).filter(u => u.role === 'admin' && u.isActive !== false);
      const matchedAdmin = adminUsers.find(u => verifyPin(adminPin, u));

      if (!matchedAdmin) {
        setPinError('⛔ رمز المدير السري غير صحيح! يلزم حضور المدير وإدخال الرمز الصحيح لاعتماد الترحيل.');
        return;
      }
      authorizedAdminName = matchedAdmin.name;
    }

    setIsSubmitting(true);
    try {
      const finalRecipient = recipient.trim() || authorizedAdminName || 'أمين الخزينة';
      const tx = addDrawerMovement({
        type: 'treasury_drop',
        amount: numAmount,
        reason: reason.trim() || 'سحب وترحيل نقدي إلى الخزينة الرئيسية',
        recipient: finalRecipient,
        authorizedBy: authorizedAdminName,
        voucherNo: voucherNo.trim()
      });

      if (autoPrint && tx) {
        try {
          printTreasuryDropVoucherHtml(tx, storeInfo, activeShift);
        } catch (err) {
          console.error('Print drop voucher error:', err);
        }
      }

      alert(`✅ تم سحب وترحيل مبلغ (${formatMoney(numAmount, storeInfo?.currency || 'ر.س')}) إلى الخزينة الرئيسية بنجاح.\nالمعتمد: ${authorizedAdminName}`);

      setTimeout(() => {
        setIsSubmitting(false);
        onClose();
      }, 300);
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ حركة الترحيل للخزينة');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in select-none">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-pink-100 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* رأس النافذة */}
        <div className="bg-gradient-to-r from-amber-600 via-purple-700 to-indigo-900 text-white p-4 sm:p-5 flex items-center justify-between relative">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-2xl shadow-inner">
              🏦
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg flex items-center gap-2">
                <span>سحب وترحيل نقدي للخزينة</span>
                <span className="bg-amber-400/30 text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-md border border-amber-400/40">
                  Safe Drop
                </span>
              </h3>
              <p className="text-xs text-purple-200/90 font-medium">
                ترحيل النقدية من درج الكاشير إلى الخزينة الرئيسية وتوثيق السند
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* جسم النافذة */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          
          {/* كرت ملخص رصيد الدرج الحالي */}
          <div className="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white p-4 rounded-2xl border border-purple-800/50 shadow-md">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="text-xs text-purple-200">💵 رصيد الدرج المتوفر حالياً:</span>
              <span className="font-black text-base sm:text-lg text-emerald-400">
                {formatMoney(currentDrawerCash, storeInfo?.currency || 'ر.س')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2.5 text-xs">
              <div>
                <span className="text-[11px] text-white/60 block">العهدة الأساسية المثبتة:</span>
                <span className="font-bold text-white">
                  {formatMoney(startCash, storeInfo?.currency || 'ر.س')}
                </span>
              </div>
              <div className="text-left">
                <span className="text-[11px] text-amber-300/80 block">فائض المبيعات المتاح للترحيل:</span>
                <span className="font-black text-amber-300">
                  {formatMoney(surplusCash, storeInfo?.currency || 'ر.س')}
                </span>
              </div>
            </div>
          </div>

          {/* أزرار الحساب السريع */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-700 block">خيارات الترحيل السريعة:</span>
            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => handleQuickAmount(surplusCash)}
                disabled={surplusCash <= 0}
                className="p-2.5 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-900 rounded-xl border border-amber-200 transition flex items-center justify-center gap-1.5"
              >
                <span>⭐ ترحيل فائض المبيعات</span>
                <span className="text-[11px] font-black">({formatMoney(surplusCash, storeInfo?.currency || 'ر.س')})</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickAmount(currentDrawerCash)}
                disabled={currentDrawerCash <= 0}
                className="p-2.5 bg-purple-50 hover:bg-purple-100 disabled:opacity-50 text-purple-900 rounded-xl border border-purple-200 transition flex items-center justify-center gap-1.5"
              >
                <span>🏦 ترحيل كامل النقدية</span>
                <span className="text-[11px] font-black">({formatMoney(currentDrawerCash, storeInfo?.currency || 'ر.س')})</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
              {[100, 200, 500, 1000, 2000].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickAmount(val)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold border border-slate-200 transition shrink-0"
                >
                  +{val}
                </button>
              ))}
            </div>
          </div>

          {/* نموذج إدخال بيانات الترحيل */}
          <form onSubmit={handleSubmit} className="space-y-3 pt-2">
            
            {/* حقل المبلغ */}
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-900 flex items-center justify-between">
                <span>المبلغ المطلوب سحبه وترحيله للخزينة:</span>
                <span className="text-[11px] text-pink-600 font-bold">إلزامي *</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-14 pr-4 py-3 bg-white border-2 border-purple-300 focus:border-purple-600 rounded-2xl font-black text-xl text-purple-950 outline-none transition shadow-sm"
                  autoFocus
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-purple-700">
                  {storeInfo?.currency || 'ر.س'}
                </span>
              </div>
            </div>

            {/* معاينة رصيد الدرج بعد السحب */}
            {numAmount > 0 && (
              <div className="p-2.5 rounded-xl bg-purple-50/60 border border-purple-200 text-xs flex items-center justify-between font-bold">
                <span className="text-slate-600">المتبقي في درج الكاشير بعد الترحيل:</span>
                <span className={`font-black ${remainingInDrawer < startCash ? 'text-amber-700' : 'text-purple-900'}`}>
                  {formatMoney(remainingInDrawer, storeInfo?.currency || 'ر.س')}
                </span>
              </div>
            )}

            {/* أمين الخزينة / المستلم */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 block">
                أمين الخزينة / المستلم للنقدية:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none"
                >
                  <option value="أمين الخزينة الرئيسية">أمين الخزينة الرئيسية</option>
                  {(users || []).map(u => (
                    <option key={u.id} value={u.name}>
                      {u.name} ({u.role === 'admin' ? 'المدير' : 'موظف'})
                    </option>
                  ))}
                  <option value="إيداع بنكي مباشر">إيداع بنكي مباشر</option>
                  <option value="أخرى">جهة أخرى</option>
                </select>

                <input
                  type="text"
                  placeholder="أو اكتب اسم المستلم يدوياً"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none"
                />
              </div>
            </div>

            {/* سبب السحب ورقم السند */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 block">
                  رقم سند الترحيل:
                </label>
                <input
                  type="text"
                  value={voucherNo}
                  onChange={(e) => setVoucherNo(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 block">
                  السبب والبيان:
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="سبب السحب..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none"
                />
              </div>
            </div>

            {/* خيار الطباعة التلقائية */}
            <div className="pt-1">
              <label className="flex items-center gap-2 p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 cursor-pointer text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={autoPrint}
                  onChange={(e) => setAutoPrint(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                />
                <Printer className="w-4 h-4 text-purple-600" />
                <span>طباعة سند سحب وترحيل حراري فوراً عند التأكيد 🖨️</span>
              </label>
            </div>

            {/* قسم إشراف واعتماد المدير بالرمز السري - الخيار الأول المعتمد */}
            {isAdmin ? (
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-950 text-xs font-bold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">👑</span>
                  <div>
                    <span className="block font-black">معتمد بصلاحية المدير الحالي</span>
                    <span className="text-[10px] text-emerald-700">المشرف المسؤول: {currentUser?.name || 'مدير النظام'}</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded-full text-[10px] font-black">
                  مصرّح وموثّق ✅
                </span>
              </div>
            ) : (
              <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-300 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                      🛡️
                    </div>
                    <div>
                      <h4 className="font-black text-xs text-amber-950">إشراف وتأكيد المدير (إلزامي)</h4>
                      <p className="text-[10px] text-amber-800">حضور المدير وإدخال الرمز السري لتأكيد استلام المبلغ وتبرئة ذمتك</p>
                    </div>
                  </div>
                  <Lock className="w-4 h-4 text-amber-600" />
                </div>

                <div className="relative">
                  <input
                    type="password"
                    maxLength={8}
                    required
                    placeholder="أدخل رمز المدير السري (PIN)..."
                    value={adminPin}
                    onChange={(e) => {
                      setAdminPin(e.target.value);
                      setPinError('');
                    }}
                    className="w-full pl-4 pr-10 py-2.5 bg-white border-2 border-amber-300 focus:border-amber-500 rounded-xl text-center font-black text-base text-slate-900 tracking-widest outline-none transition shadow-sm"
                  />
                  <Lock className="w-4 h-4 text-amber-500 absolute right-3.5 top-3.5" />
                </div>

                {pinError && (
                  <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{pinError}</span>
                  </p>
                )}
              </div>
            )}

            {/* أزرار الإجراء */}
            <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition"
              >
                إلغاء
              </button>

              <button
                type="submit"
                disabled={isSubmitting || numAmount <= 0}
                className="flex-2 py-3 bg-gradient-to-r from-amber-600 via-purple-700 to-indigo-800 hover:from-amber-500 text-white rounded-2xl text-xs font-black shadow-lg shadow-purple-900/30 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Landmark className="w-4 h-4" />
                <span>
                  {isSubmitting ? 'جاري الترحيل والحفظ...' : 'تأكيد السحب والترحيل للخزينة 🏦'}
                </span>
              </button>
            </div>

          </form>

        </div>

      </div>
    </div>
  );
};
