import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { LayoutGrid, Save, CheckCircle, Sliders, Volume2, CreditCard } from 'lucide-react';
import { downloadWindowsKioskScript } from '../../utils/printHelper';

export const PosSettingsTab = () => {
  const { storeInfo, updateStoreInfo } = useApp();

  const defaultPos = {
    posColumns: 8,
    cardStyle: 'rounded',
    showStockInPos: true,
    showBarcodeInPos: true,
    showCostInPos: false,
    showImageInPos: true,
    imageHeight: 'medium',
    enableBeepSound: true,
    quickCashAmounts: [50, 100, 200, 500],
    showCategoryBar: true,
    showSearchSuggestions: true,
    defaultCartDrawerOpen: false,
    fontSize: 'normal'
  };

  const [settings, setSettings] = useState({
    ...defaultPos,
    posColumns: storeInfo.posColumns || 8,
    showStockInPos: storeInfo.showStockInPos !== false,
    showBarcodeInPos: storeInfo.showBarcodeInPos !== false,
    showCostInPos: !!storeInfo.showCostInPos,
    ...(storeInfo.posSettings || {})
  });

  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleUpdate = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    updateStoreInfo({
      ...storeInfo,
      posColumns: settings.posColumns,
      showStockInPos: settings.showStockInPos,
      showBarcodeInPos: settings.showBarcodeInPos,
      showCostInPos: settings.showCostInPos,
      posSettings: settings
    });
    localStorage.setItem('naif_pos_cols', String(settings.posColumns));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="space-y-5 animate-in fade-in text-xs font-cairo">
      
      {/* رأس الصفحة */}
      <div className="bg-gradient-to-r from-pink-900 via-rose-900 to-purple-900 text-white p-5 rounded-3xl shadow-lg border border-pink-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-2xl border border-white/20 shadow-inner">
            🛒
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black flex items-center gap-2">
              <span>إعدادات وطريقة عرض شاشة الكاشير ونقاط البيع (POS)</span>
              <span className="text-pink-400">🌸</span>
            </h3>
            <p className="text-xs text-pink-200/80 mt-0.5">
              تخصيص عدد الأعمدة في السطر، تصميم بطاقات المنتجات، التنبيهات الصوتية، وأزرار الدفع السريع
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="px-5 py-2.5 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-400 text-white rounded-2xl font-black shadow-md transition flex items-center gap-1.5 active:scale-95 border border-pink-300/30"
        >
          <Save className="w-4 h-4" />
          <span>حفظ إعدادات الكاشير 💾</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 font-bold flex items-center gap-2 shadow-xs animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>تم حفظ وتحديث إعدادات عرض الكاشير بنجاح! 🌸</span>
        </div>
      )}

      {/* خيارات العرض والشبكة */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* 1. عدد المنتجات في السطر الواحد */}
        <div className="p-4 bg-white rounded-3xl border border-pink-100 shadow-xs space-y-3">
          <h4 className="font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <LayoutGrid className="w-4 h-4 text-pink-600" />
            <span>عدد المنتجات في السطر الواحد (الأعمدة):</span>
          </h4>

          <div className="grid grid-cols-5 gap-2">
            {[4, 6, 8, 10, 12].map(cols => (
              <button
                key={cols}
                type="button"
                onClick={() => handleUpdate('posColumns', cols)}
                className={'p-2.5 rounded-2xl border text-center transition active:scale-95 ' + (
                  settings.posColumns === cols
                    ? 'bg-gradient-to-tr from-pink-600 to-purple-600 text-white shadow-md font-black'
                    : 'bg-slate-50 border-slate-200 hover:border-pink-200 text-slate-700 font-bold'
                )}
              >
                <span className="text-base block font-black font-mono">{cols}</span>
                <span className="text-[10px]">{cols === 8 ? '٨ (افتراضي)' : cols + ' أعمدة'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. عناصر بطاقة المنتج */}
        <div className="p-4 bg-white rounded-3xl border border-pink-100 shadow-xs space-y-3">
          <h4 className="font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <Sliders className="w-4 h-4 text-purple-600" />
            <span>عناصر ومعلومات بطاقة المنتج:</span>
          </h4>

          <div className="space-y-2">
            {[
              { key: 'showStockInPos', label: 'إظهار رصيد المخزون المتوفر على البطاقة' },
              { key: 'showBarcodeInPos', label: 'إظهار رقم الباركود الخاص بالصنف' },
              { key: 'showImageInPos', label: 'إظهار صورة المنتج المرفوعة' },
              { key: 'showCostInPos', label: 'إظهار سعر التكلفة (للمدير فقط)' }
            ].map(item => (
              <label key={item.key} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer font-bold text-slate-800">
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={settings[item.key] !== false}
                  onChange={e => handleUpdate(item.key, e.target.checked)}
                  className="w-4 h-4 text-pink-600 rounded"
                />
              </label>
            ))}
          </div>
        </div>

        {/* 3. الأصوات والتنبيهات */}
        <div className="p-4 bg-white rounded-3xl border border-pink-100 shadow-xs space-y-3">
          <h4 className="font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <Volume2 className="w-4 h-4 text-pink-600" />
            <span>التنبيهات الصوتية وتأثيرات الكاشير:</span>
          </h4>

          <label className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer font-bold text-slate-800">
            <div>
              <span className="block text-xs">تفعيل صوت Beep عند مسح الباركود وإضافة المنتج</span>
              <span className="text-[10px] text-slate-400 font-normal">صوت نقرة واضح عند إضافة أي صنف للسلة</span>
            </div>
            <input
              type="checkbox"
              checked={settings.enableBeepSound !== false}
              onChange={e => handleUpdate('enableBeepSound', e.target.checked)}
              className="w-4 h-4 text-pink-600 rounded"
            />
          </label>
        </div>

        {/* 4. أزرار الدفع السريع بالكاش */}
        <div className="p-4 bg-white rounded-3xl border border-pink-100 shadow-xs space-y-3">
          <h4 className="font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span>أزرار الفئات النقدية السريعة عند المحاسبة:</span>
          </h4>

          <div className="grid grid-cols-4 gap-2">
            {[10, 50, 100, 500].map(amt => (
              <div key={amt} className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center font-black text-emerald-900">
                <span className="text-sm font-mono">{amt}</span>
                <span className="text-[9px] block text-emerald-600 font-normal">ر.س</span>
              </div>
            ))}
          </div>
        </div>

        {/* 5. ميزة الطباعة الصامتة الفورية لويندوز */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl border border-indigo-500/30 shadow-xs space-y-3 sm:col-span-2">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">⚡</span>
              <div>
                <h4 className="font-black text-xs sm:text-sm text-white">الطباعة الصامتة المباشرة بدون نافذة طابعة (Windows Silent Print)</h4>
                <p className="text-2xs text-indigo-200/80">تشغيل التطبيق بنمط Kiosk للطباعة الفورية على طابعة الكاشير في 0.1 ثانية بدون أي نوافذ منبثقة</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => downloadWindowsKioskScript()}
              className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white rounded-xl text-xs font-black shadow transition active:scale-95 flex items-center gap-1.5"
            >
              <span>📥 تحميل مشغل الطباعة الصامتة (.bat)</span>
            </button>
          </div>

          <label className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/10 cursor-pointer font-bold text-white">
            <div>
              <span className="block text-xs">⚡ تخطي نافذة الفاتورة والطباعة الفورية في الخلفية (أسرع للكاشير)</span>
              <span className="text-2xs text-indigo-200/70 font-normal">عند إتمام البيع، تطبع الفاتورة فوراً في الخلفية وتبقى شاشة البيع جاهزة للزبون التالي مباشرة دون فتح نافذة الفاتورة</span>
            </div>
            <input
              type="checkbox"
              checked={storeInfo?.invoicePrintSettings?.skipReceiptModalOnCheckout !== false}
              onChange={e => {
                const nextPrint = {
                  ...(storeInfo?.invoicePrintSettings || {}),
                  skipReceiptModalOnCheckout: e.target.checked
                };
                updateStoreInfo({
                  ...storeInfo,
                  invoicePrintSettings: nextPrint
                });
              }}
              className="w-4 h-4 text-emerald-500 rounded"
            />
          </label>
        </div>

      </div>

    </div>
  );
};
