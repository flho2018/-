import React from 'react';
import { Award, Package } from 'lucide-react';
import { formatMoney } from '../../../utils/helpers';

export const TopProductsTab = ({
  topProductsSortBy,
  setTopProductsSortBy,
  topProductsList,
  totalSales,
  storeInfo
}) => {
  return (
        <div className="bg-white rounded-3xl p-5 border border-pink-100 shadow-sm space-y-4 animate-in fade-in text-xs">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-pink-100">
            <div>
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                <span>تحليل المنتجات والأصناف الأكثر مبيعاً وإيراداً</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">ترتيب الأصناف بالكمية المباعة، الإيراد المالي، أو صافي الأرباح المحققة</p>
            </div>

            {/* أزرار ترتيب الأصناف */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl font-bold text-xs">
              <button
                type="button"
                onClick={() => setTopProductsSortBy('qty')}
                className={`px-3 py-1 rounded-lg transition ${
                  topProductsSortBy === 'qty' ? 'bg-pink-700 text-white font-black shadow-xs' : 'text-slate-600 hover:text-pink-800'
                }`}
              >
                الأعلى بالكمية
              </button>
              <button
                type="button"
                onClick={() => setTopProductsSortBy('revenue')}
                className={`px-3 py-1 rounded-lg transition ${
                  topProductsSortBy === 'revenue' ? 'bg-pink-700 text-white font-black shadow-xs' : 'text-slate-600 hover:text-pink-800'
                }`}
              >
                الأعلى بالإيراد
              </button>
              <button
                type="button"
                onClick={() => setTopProductsSortBy('profit')}
                className={`px-3 py-1 rounded-lg transition ${
                  topProductsSortBy === 'profit' ? 'bg-pink-700 text-white font-black shadow-xs' : 'text-slate-600 hover:text-pink-800'
                }`}
              >
                الأعلى بالربح
              </button>
            </div>
          </div>

          {topProductsList.length === 0 ? (
            <div className="p-10 text-center text-slate-400 space-y-2">
              <Package className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
              <h4 className="font-bold text-slate-700">لا توجد مبيعات أصناف مسجلة في هذه الفترة</h4>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {topProductsList.map((item, idx) => {
                const maxVal = topProductsSortBy === 'revenue' 
                  ? (topProductsList[0]?.totalRevenue || 1) 
                  : topProductsSortBy === 'profit' 
                  ? (topProductsList[0]?.profit || 1) 
                  : (topProductsList[0]?.qty || 1);
                
                const currVal = topProductsSortBy === 'revenue' ? item.totalRevenue : topProductsSortBy === 'profit' ? item.profit : item.qty;
                const pct = Math.max(8, Math.round((currVal / maxVal) * 100));

                return (
                  <div key={idx} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-pink-50/30 px-2 rounded-2xl transition">
                    <div className="flex items-center gap-3 flex-1">
                      <span className={`w-6 h-6 rounded-full font-black text-xs flex items-center justify-center shrink-0 ${
                        idx === 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                        idx === 1 ? 'bg-slate-200 text-slate-700' :
                        idx === 2 ? 'bg-amber-50 text-amber-700' : 'bg-pink-50 text-pink-700'
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-slate-800 text-xs">{item.name}</h4>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">
                            {item.category}
                          </span>
                        </div>
                        <div className="w-full max-w-xs h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                          <div style={{ width: `${pct}%` }} className="h-full bg-gradient-to-r from-pink-500 to-purple-600 rounded-full" />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 text-xs shrink-0 pt-1 sm:pt-0">
                      <div className="text-right sm:text-left">
                        <span className="text-[10px] text-slate-400 block font-bold">الكمية المباعة</span>
                        <strong className="text-slate-800 font-mono font-bold">{item.qty} قطعة</strong>
                      </div>

                      <div className="text-right sm:text-left">
                        <span className="text-[10px] text-slate-400 block font-bold">إجمالي الإيراد</span>
                        <strong className="text-pink-700 font-mono font-black">{formatMoney(item.totalRevenue, storeInfo?.currency)}</strong>
                      </div>

                      <div className="text-right sm:text-left">
                        <span className="text-[10px] text-emerald-700 block font-bold">صافي الربح</span>
                        <strong className="text-emerald-600 font-mono font-black">+{formatMoney(item.profit, storeInfo?.currency)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
  );
};
