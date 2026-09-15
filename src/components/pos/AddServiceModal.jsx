import React, { useState } from 'react';
import { Sparkles, X, Plus, Tag, DollarSign, FileText } from 'lucide-react';


export const AddServiceModal = ({ isOpen, onClose, onAddService, currency = 'ر.س' }) => {
  const [serviceName, setServiceName] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceNotes, setServiceNotes] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(null);

  if (!isOpen) return null;

  // قوالب الخدمات الشائعة والمجهزة مسبقاً لمحل الورد والهدايا
  const SERVICE_PRESETS = [
    { id: 'arr-1', name: 'تنسيق باقة خاصة', defaultPrice: 50, icon: '🌸', note: 'خدمة تنسيق وتجهيز باقة ورد' },
    { id: 'del-1', name: 'خدمة توصيل الطلب', defaultPrice: 30, icon: '🚚', note: 'توصيل عبر المندوب لموقع العميل' },
    { id: 'wrp-1', name: 'تغليف هدايا فاخر', defaultPrice: 25, icon: '🎁', note: 'تغليف هدية مع شرائط وزينة' },
    { id: 'crd-1', name: 'كتابة وطباعة كارت إهداء', defaultPrice: 15, icon: '💌', note: 'طباعة نص الإهداء والعبارات' },
    { id: 'hlm-1', name: 'تعبئة هيليوم وبالونات', defaultPrice: 20, icon: '🎈', note: 'تعبئة وتجهيز بالونات الحفلات' },
    { id: 'cst-1', name: 'خدمة مخصصة حرة', defaultPrice: '', icon: '✨', note: 'خدمة عمل خاصة' },
  ];

  const handleSelectPreset = (preset) => {
    setSelectedPreset(preset.id);
    setServiceName(preset.name);
    if (preset.defaultPrice !== '') {
      setServicePrice(String(preset.defaultPrice));
    } else {
      setServicePrice('');
    }
    setServiceNotes(preset.note || '');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!serviceName.trim()) {
      alert('يرجى تحديد أو كتابة اسم الخدمة');
      return;
    }

    const priceNum = Number(servicePrice) || 0;
    if (priceNum <= 0) {
      alert('يرجى إدخال سعر الخدمة بشكل صحيح');
      return;
    }

    const serviceProduct = {
      id: `svc-${Date.now()}`,
      name: serviceName.trim(),
      sellingPrice: priceNum,
      costPrice: 0,
      isService: true,
      unit: 'خدمة',
      stock: 999999,
      categoryId: 'services',
      notes: serviceNotes.trim(),
      barcode: `SRV${Math.floor(100000 + Math.random() * 900000)}`
    };

    onAddService(serviceProduct);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in select-none font-cairo">
      <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-5 shadow-2xl border border-pink-100 flex flex-col space-y-4 max-h-[90vh] overflow-y-auto">
        
        {/* رأس النافذة */}
        <div className="flex items-center justify-between pb-2.5 border-b border-pink-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-600 to-purple-600 text-white flex items-center justify-center font-black shadow-md shadow-pink-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-900">إضافة وبيع خدمة 🌸</h3>
              <p className="text-[11px] text-slate-500">خدمات غير مرتبطة بمخزون أو كمية (تنسيق، توصيل، تغليف...)</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* قوالب سريعة للخدمات */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 block">اختر نوع الخدمة أو القالب السريع:</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {SERVICE_PRESETS.map((preset) => {
              const isSelected = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`p-2 rounded-2xl border text-right transition active:scale-95 flex flex-col justify-between ${
                    isSelected
                      ? 'bg-gradient-to-br from-pink-50 to-purple-50 border-pink-500 ring-2 ring-pink-400/30 shadow-xs'
                      : 'bg-slate-50/70 hover:bg-pink-50/40 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-base">{preset.icon}</span>
                    {preset.defaultPrice !== '' && (
                      <span className="text-[10px] font-black text-pink-700 font-mono">
                        {preset.defaultPrice} {currency}
                      </span>
                    )}
                  </div>
                  <span className={`text-[11px] font-bold leading-tight block ${
                    isSelected ? 'text-pink-900 font-black' : 'text-slate-800'
                  }`}>
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* نموذج تفاصيل الخدمة */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          
          {/* اسم الخدمة */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اسم الخدمة المخصصة: <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Tag className="w-4 h-4 absolute right-3 top-3 text-pink-400" />
              <input
                type="text"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="مثال: تنسيق باقة خاصة، خدمة توصيل VIP..."
                className="w-full pl-3 pr-9 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white transition"
                required
              />
            </div>
          </div>

          {/* سعر الخدمة */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              سعر الخدمة ({currency}): <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <DollarSign className="w-4 h-4 absolute right-3 top-3 text-pink-400" />
              <input
                type="number"
                step="any"
                min="0"
                value={servicePrice}
                onChange={(e) => setServicePrice(e.target.value)}
                placeholder="0.00"
                className="w-full pl-3 pr-9 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl text-sm font-black text-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white transition"
                required
              />
            </div>
          </div>

          {/* ملاحظات الخدمة */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ملاحظات أو تفاصيل إضافية للخدمة (اختياري):
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 absolute right-3 top-3 text-pink-400" />
              <input
                type="text"
                value={serviceNotes}
                onChange={(e) => setServiceNotes(e.target.value)}
                placeholder="مثال: التوصيل لحي الياسمين، كرت إهداء باسم سارة..."
                className="w-full pl-3 pr-9 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white transition"
              />
            </div>
          </div>

          {/* أزرار الإجراء */}
          <div className="flex items-center gap-2 pt-2 border-t border-pink-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 text-white rounded-xl font-black text-xs shadow-md shadow-pink-600/30 transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة الخدمة للفاتورة</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
