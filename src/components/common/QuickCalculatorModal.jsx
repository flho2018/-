import React, { useState } from 'react';
import { X, Delete } from 'lucide-react';

// =========================================================================
//  آلة حاسبة سريعة للكاشير
// =========================================================================
//  الحاجة: الكاشير يحسب باقي العميل أو مجموع طلب قبل إدخاله، فيخرج من
//  البرنامج لتطبيق آخر. هذه نافذة صغيرة داخل الشاشة لا تمسّ السلة ولا
//  الفاتورة إطلاقاً — حساب مجرّد فقط.
// =========================================================================

const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', '.', '=', '+'];

export const QuickCalculatorModal = ({ isOpen, onClose }) => {
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('');

  if (!isOpen) return null;

  const compute = (raw) => {
    const normalized = String(raw).replace(/÷/g, '/').replace(/×/g, '*');
    // مسموح فقط بالأرقام والنقطة وعمليات الحساب الأربع والأقواس
    if (!/^[0-9+\-*/(). ]+$/.test(normalized)) return 'خطأ';
    try {
      // eslint-disable-next-line no-new-func
      const value = Function('"use strict"; return (' + normalized + ')')();
      if (!Number.isFinite(value)) return 'خطأ';
      return String(Math.round(value * 10000) / 10000);
    } catch (e) {
      return 'خطأ';
    }
  };

  const handleKey = (key) => {
    if (key === '=') {
      if (!expression.trim()) return;
      setResult(compute(expression));
      return;
    }
    setExpression(prev => prev + key);
  };

  const handleClear = () => {
    setExpression('');
    setResult('');
  };

  const handleBackspace = () => {
    setExpression(prev => prev.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-[9998] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="w-full max-w-[320px] bg-white rounded-3xl border border-pink-200 shadow-2xl overflow-hidden font-cairo">

        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-l from-pink-600 to-rose-500 text-white">
          <h3 className="font-black text-sm flex items-center gap-2">
            <span>🧮</span>
            <span>آلة حاسبة سريعة</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            title="إغلاق"
            className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-left" dir="ltr">
          <div className="text-slate-500 text-sm font-mono min-h-[20px] break-all">{expression || '0'}</div>
          <div className="text-slate-900 text-2xl font-black font-mono min-h-[32px] break-all">{result}</div>
        </div>

        <div className="p-3 grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="col-span-2 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-sm border border-rose-200 transition active:scale-95"
          >
            مسح الكل
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="col-span-2 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 font-black text-sm border border-amber-200 transition active:scale-95 flex items-center justify-center gap-1"
          >
            <Delete className="w-4 h-4" />
            <span>حذف</span>
          </button>

          {KEYS.map(key => {
            const isOperator = ['÷', '×', '-', '+'].includes(key);
            const isEquals = key === '=';
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleKey(key)}
                className={'py-3 rounded-xl font-black text-base transition active:scale-95 border ' + (
                  isEquals
                    ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white border-pink-300'
                    : isOperator
                      ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                      : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
                )}
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
