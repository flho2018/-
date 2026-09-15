import React from 'react';
import { Award, Plus, Trash2, Info } from 'lucide-react';
import { DEFAULT_BONUS_RULE, computeBonus } from '../../utils/staffPerformance';

// =========================================================================
//  ضبط قاعدة بونص الموظف
// =========================================================================
//  قاعدة كل موظف تُحفظ في user.bonusRule ويقرأها محرّك الأداء
//  (utils/staffPerformance.js) عند بناء التقرير.
//
//  لماذا «قاعدة الاحتساب» خيار وليست ثابتة على المبيعات: البونص على
//  الإيراد وحده يدفع الموظف لبيع الرخيص بكثرة ولمنح الخصومات ليُغلق
//  البيع — كلاهما يرفع مبيعاته ويخفض ربح المتجر. الاحتساب على مجمل
//  الربح يوائم مصلحته مع مصلحة المالك.
//
//  والمعاينة الحيّة أسفل الشاشة مقصودة: قاعدة بونص بلا رقم أمام العين
//  تُضبط بالحدس ثم تُكتشف في نهاية الشهر.
// =========================================================================

const BASES = [
  { id: 'net_sales', label: 'صافي المبيعات (بعد المرتجعات)', hint: 'الأشهر استعمالاً' },
  { id: 'gross_profit', label: 'مجمل الربح (البيع − التكلفة)', hint: 'الأعدل للمتجر' },
  { id: 'invoices', label: 'عدد الفواتير', hint: 'يكافئ سرعة الخدمة' }
];

const TYPES = [
  { id: 'percent', label: 'نسبة مئوية' },
  { id: 'per_invoice', label: 'مبلغ ثابت لكل فاتورة' },
  { id: 'tiers', label: 'شرائح تصاعدية' }
];

export const BonusRuleEditor = ({ rule, onChange, currency = 'ر.س' }) => {
  const r = { ...DEFAULT_BONUS_RULE, ...(rule || {}) };
  const set = (patch) => onChange({ ...r, ...patch });

  const setTier = (i, patch) => {
    const tiers = [...(r.tiers || [])];
    tiers[i] = { ...tiers[i], ...patch };
    set({ tiers });
  };
  const addTier = () => set({ tiers: [...(r.tiers || []), { from: 0, percent: 1 }] });
  const removeTier = (i) => set({ tiers: (r.tiers || []).filter((_, x) => x !== i) });

  // معاينة على مثال ثابت، فيرى صاحب المتجر أثر القاعدة قبل اعتمادها
  const SAMPLE = { netSales: 30000, netProfit: 6000, invoicesCount: 150, cashShortage: 40 };
  const preview = computeBonus(SAMPLE, r);

  const numField = (label, value, onSet, suffix = '', placeholder = '0') => (
    <div>
      <label className="block text-slate-600 text-xs font-bold mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          step="any"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onSet(Number(e.target.value) || 0)}
          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-sm"
        />
        {suffix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-bold pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="border-2 border-amber-100 rounded-2xl p-4 bg-amber-50/40 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-black text-slate-800 flex items-center gap-2 text-sm">
          <Award size={17} className="text-amber-600" />
          بونص الموظف (حافز متغيّر)
        </h4>
        <label className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl px-3 py-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={r.enabled === true}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="w-4 h-4 text-amber-600 rounded"
          />
          <span className="font-bold text-slate-700 text-xs">مفعّل لهذا الموظف</span>
        </label>
      </div>

      {!r.enabled && (
        <p className="text-[11px] text-slate-500">
          غير مفعّل: لن يظهر لهذا الموظف بونص في تقرير الأداء.
        </p>
      )}

      {r.enabled && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-600 text-xs font-bold mb-1">يُحتسب على:</label>
              <select
                value={r.base}
                onChange={(e) => set({ base: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-sm"
              >
                {BASES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                {BASES.find(b => b.id === r.base)?.hint}
              </p>
            </div>

            <div>
              <label className="block text-slate-600 text-xs font-bold mb-1">طريقة الحساب:</label>
              <select
                value={r.type}
                onChange={(e) => set({ type: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-sm"
              >
                {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {r.type === 'percent' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {numField('النسبة', r.percent, (v) => set({ percent: v }), '%', '1')}
            </div>
          )}

          {r.type === 'per_invoice' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {numField('المبلغ لكل فاتورة', r.perInvoice, (v) => set({ perInvoice: v }), currency)}
            </div>
          )}

          {r.type === 'tiers' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">
                  الشرائح — تُطبَّق أعلى شريحة بلغها الموظف
                </span>
                <button
                  type="button"
                  onClick={addTier}
                  className="flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold"
                >
                  <Plus size={13} /> شريحة
                </button>
              </div>
              {(r.tiers || []).length === 0 && (
                <p className="text-[11px] text-rose-600 font-bold">
                  لم تُضف أي شريحة — لن يُحتسب بونص.
                </p>
              )}
              {(r.tiers || []).map((t, i) => (
                <div key={i} className="flex items-end gap-2 bg-white border border-slate-200 rounded-xl p-2">
                  <div className="flex-1">
                    {numField('من', t.from, (v) => setTier(i, { from: v }), currency)}
                  </div>
                  <div className="flex-1">
                    {numField('النسبة', t.percent, (v) => setTier(i, { percent: v }), '%')}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTier(i)}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-2 rounded-lg mb-0.5"
                    title="حذف الشريحة"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-amber-100">
            {numField('حدّ أدنى للاستحقاق (لا بونص تحته)', r.threshold, (v) => set({ threshold: v }), currency)}
            {numField('سقف أعلى للبونص (0 = بلا سقف)', r.cap, (v) => set({ cap: v }), currency)}
          </div>

          <label className="flex items-start gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={r.deductShortage === true}
              onChange={(e) => set({ deductShortage: e.target.checked })}
              className="w-4 h-4 text-amber-600 rounded mt-0.5"
            />
            <span className="text-xs">
              <b className="text-slate-700">خصم العجز النقدي من البونص</b>
              <span className="block text-[10px] text-slate-500 mt-0.5">
                العجز فقط — لا الزيادة. ولا يُخصم أكثر من البونص نفسه فلا يصير سالباً.
              </span>
            </span>
          </label>

          {/* معاينة حيّة: القاعدة بلا رقم أمام العين تُضبط بالحدس */}
          <div className="bg-white border border-amber-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-2">
              <Info size={12} />
              معاينة على مثال: مبيعات 30,000 — ربح 6,000 — 150 فاتورة — عجز 40
            </div>
            {preview.belowThreshold ? (
              <p className="text-sm font-black text-rose-600">
                لا بونص — لم يبلغ الحدّ الأدنى ({r.threshold} {currency})
              </p>
            ) : (
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-black text-emerald-700">
                  {preview.amount.toFixed(2)} {currency}
                </span>
                <span className="text-[11px] text-slate-500">
                  ({preview.baseLabel}: {preview.baseValue.toLocaleString()} × {preview.rateLabel})
                  {preview.shortageDeducted > 0 && ` − عجز ${preview.shortageDeducted.toFixed(2)}`}
                  {preview.capped && ' — بلغ السقف'}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default BonusRuleEditor;
