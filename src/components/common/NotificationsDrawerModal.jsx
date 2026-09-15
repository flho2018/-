import React, { useState } from 'react';
import { 
  X, 
  Bell, 
  Check, 
  Trash2, 
  Receipt, 
  ShoppingBag, 
  TrendingDown, 
  DollarSign, 
  Lock, 
  Unlock, 
  Sparkles,
  RotateCcw,
  Volume2
} from 'lucide-react';
import { formatMoney, formatDate } from '../../utils/helpers';
import { playGentleNotificationSound } from '../../utils/soundHelper';

export const NotificationsDrawerModal = ({ 
  isOpen, 
  onClose, 
  notifications = [], 
  onClearAll, 
  onMarkAllRead,
  currency = 'ر.س'
}) => {
  const [filterType, setFilterType] = useState('all');

  if (!isOpen) return null;

  const filteredList = notifications.filter(n => {
    if (filterType === 'all') return true;
    if (filterType === 'invoices') return n.type === 'invoice_created' || n.type === 'invoice_returned';
    if (filterType === 'shifts') return n.type === 'shift_closed' || n.type === 'shift_opened';
    if (filterType === 'money') return n.type === 'expense_created' || n.type === 'purchase_created' || n.type === 'drawer_tx';
    return true;
  });

  const getIcon = (type) => {
    switch (type) {
      case 'invoice_created':
        return <Receipt className="w-4 h-4 text-emerald-600" />;
      case 'invoice_returned':
        return <RotateCcw className="w-4 h-4 text-rose-600" />;
      case 'purchase_created':
        return <ShoppingBag className="w-4 h-4 text-blue-600" />;
      case 'expense_created':
        return <TrendingDown className="w-4 h-4 text-amber-600" />;
      case 'drawer_tx':
        return <DollarSign className="w-4 h-4 text-purple-600" />;
      case 'shift_closed':
        return <Lock className="w-4 h-4 text-rose-600" />;
      case 'shift_opened':
        return <Unlock className="w-4 h-4 text-emerald-600" />;
      default:
        return <Sparkles className="w-4 h-4 text-pink-600" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:justify-start p-3 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-pink-200 animate-in slide-in-from-right duration-200 max-h-[92vh] flex flex-col text-slate-800 text-xs">
        
        {/* رأس النافذة */}
        <div className="p-4 bg-gradient-to-r from-[#380624] via-[#2A0845] to-[#4A0E4E] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-pink-500/20 text-pink-300 flex items-center justify-center border border-pink-400/30">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm">مركز التنبيهات والعمليات المباشرة 🔔</h3>
              <p className="text-[10px] text-pink-200/80">إشعارات فورية بكل ما يتم تنفيذه عبر أجهزة الكاشير والمستخدمين</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => playGentleNotificationSound()}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-pink-200 transition"
              title="تجربة التنبيه الصوتي الخفيف"
            >
              <Volume2 className="w-4 h-4" />
            </button>

            <button 
              type="button" 
              onClick={onClose} 
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* شريط الفلترة والأزرار الإدارية */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap text-[11px]">
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${
                filterType === 'all' ? 'bg-pink-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              الكل ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('invoices')}
              className={`px-2 py-1 rounded-lg font-bold transition ${
                filterType === 'invoices' ? 'bg-pink-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              المبيعات
            </button>
            <button
              type="button"
              onClick={() => setFilterType('money')}
              className={`px-2 py-1 rounded-lg font-bold transition ${
                filterType === 'money' ? 'bg-pink-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              المالية
            </button>
            <button
              type="button"
              onClick={() => setFilterType('shifts')}
              className={`px-2 py-1 rounded-lg font-bold transition ${
                filterType === 'shifts' ? 'bg-pink-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              الورديات
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {onMarkAllRead && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="p-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-bold transition"
                title="تحديد الكل كمقروء"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            )}

            {onClearAll && (
              <button
                type="button"
                onClick={onClearAll}
                className="p-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg font-bold transition"
                title="مسح سجل الإشعارات"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* قائمة الإشعارات الحية */}
        <div className="p-3 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-100">
          {filteredList.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <span className="text-3xl block">🌸</span>
              <p className="font-bold text-xs">لا توجد إشعارات جديدة حالياً</p>
              <span className="text-[10px] text-slate-400">ستظهر التنبيهات هنا فور قيام أي كاشير بتنفيذ فاتورة أو عملية مالية</span>
            </div>
          ) : (
            filteredList.map((n, idx) => (
              <div 
                key={n.id || idx} 
                className={`pt-2 first:pt-0 p-2.5 rounded-2xl transition flex items-start justify-between gap-2.5 ${
                  n.isRead ? 'bg-white hover:bg-slate-50' : 'bg-pink-50/60 border border-pink-200/80 shadow-2xs'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                    {getIcon(n.type)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <strong className="font-black text-slate-900 text-xs truncate">{n.title}</strong>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-800 shrink-0">
                        {n.userName || 'كاشير'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 font-medium mt-0.5 leading-relaxed">
                      {n.message}
                    </p>

                    <div className="flex items-center gap-3 mt-1 text-[9px] text-slate-400 font-mono">
                      <span>⏰ {formatDate(n.timestamp || new Date())}</span>
                      {n.amount !== undefined && Number(n.amount) > 0 && (
                        <span className="font-black text-emerald-700 font-bold">
                          المبلغ: {formatMoney(n.amount, currency)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {!n.isRead && (
                  <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0 mt-2" title="غير مقروء" />
                )}
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
};
