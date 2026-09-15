import React from 'react';
import { X, Receipt, ShoppingBag, TrendingDown, DollarSign, Lock, Unlock, Sparkles, RotateCcw } from 'lucide-react';
import { formatMoney } from '../../utils/helpers';

export const LiveAlertBanner = ({ alert, onClose, onOpenHistory, currency = 'ر.س' }) => {
  if (!alert) return null;

  const getIcon = () => {
    switch (alert.type) {
      case 'invoice_created':
        return <Receipt className="w-5 h-5 text-emerald-400" />;
      case 'invoice_returned':
        return <RotateCcw className="w-5 h-5 text-rose-400" />;
      case 'purchase_created':
        return <ShoppingBag className="w-5 h-5 text-blue-400" />;
      case 'expense_created':
        return <TrendingDown className="w-5 h-5 text-amber-400" />;
      case 'drawer_tx':
        return <DollarSign className="w-5 h-5 text-purple-400" />;
      case 'shift_closed':
        return <Lock className="w-5 h-5 text-rose-300" />;
      case 'shift_opened':
        return <Unlock className="w-5 h-5 text-emerald-300" />;
      default:
        return <Sparkles className="w-5 h-5 text-pink-400" />;
    }
  };

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-3 pointer-events-auto font-cairo select-none animate-in slide-in-from-top-4 duration-200">
      <div 
        onClick={onOpenHistory}
        className="bg-slate-950/95 backdrop-blur-md border border-pink-500/40 text-white rounded-3xl shadow-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:border-pink-400 transition group ring-2 ring-pink-500/20"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
            {getIcon()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-black text-xs text-white truncate">{alert.title}</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-pink-500/30 text-pink-200 shrink-0">
                {alert.userName || 'مستخدم آخر'}
              </span>
            </div>

            <p className="text-[11px] text-pink-100/90 truncate font-medium mt-0.5">
              {alert.message}
            </p>

            {alert.amount !== undefined && Number(alert.amount) > 0 && (
              <span className="text-[10px] font-black text-emerald-400 font-mono block mt-0.5">
                القيمة: {formatMoney(alert.amount, currency)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" title="تنبيه حي ومباشر" />
          
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition active:scale-95"
            title="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
