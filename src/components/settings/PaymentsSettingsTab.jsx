import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CreditCard, Plus, Edit2, Trash2, Upload, RotateCcw, CheckCircle, X, ArrowUp, ArrowDown, Sliders } from 'lucide-react';
import { INITIAL_PAYMENT_METHODS } from '../../utils/initialData';
import { DEFAULT_PAYMENT_ICONS, PRESET_LOGO_LIST } from '../../utils/paymentIcons';
import { compressImageFile } from '../../utils/helpers';

export const PaymentsSettingsTab = () => {
  const { storeInfo, updateStoreInfo } = useApp();

  const [formData, setFormData] = useState({ ...storeInfo });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('تم حفظ إعدادات وسائل الدفع بنجاح! 🌸');

  // نموذج إضافة وسيلة دفع جديدة
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newType, setNewType] = useState('card');
  const [newColor, setNewColor] = useState('from-pink-600 to-purple-600');
  const [newImage, setNewImage] = useState(DEFAULT_PAYMENT_ICONS.card);

  // نموذج تعديل وسيلة دفع موجودة
  const [editingMethod, setEditingMethod] = useState(null);

  const currentMethods = formData.paymentMethods && formData.paymentMethods.length > 0 
    ? formData.paymentMethods 
    : INITIAL_PAYMENT_METHODS;

  const handleSave = (msg = 'تم حفظ إعدادات وسائل الدفع بنجاح! 🌸', updatedMethods = null) => {
    const toSave = {
      ...formData,
      paymentMethods: updatedMethods || currentMethods
    };
    updateStoreInfo(toSave);
    setSaveSuccess(true);
    setSuccessMessage(msg);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // إعادة تهيئة وضبط وسائل الدفع إلى الأصلية
  const handleResetToDefaults = () => {
    if (confirm('هل أنت متأكد من إعادة تهيئة جميع وسائل الدفع للوضع الافتراضي الأنيق واسترجاع الشعارات الأصلية؟')) {
      const resetList = INITIAL_PAYMENT_METHODS.map(m => ({
        ...m,
        enabled: true,
        image: DEFAULT_PAYMENT_ICONS[m.id] || m.image || ''
      }));
      setFormData(prev => ({ ...prev, paymentMethods: resetList }));
      handleSave('تمت إعادة تهيئة وسائل الدفع للوضع الافتراضي بنجاح! 🌸', resetList);
    }
  };

  // تفعيل / تعطيل وسيلة دفع
  const handleToggleMethod = (methodId) => {
    const updated = currentMethods.map(m => m.id === methodId ? { ...m, enabled: !m.enabled } : m);
    setFormData(prev => ({ ...prev, paymentMethods: updated }));
    handleSave(undefined, updated);
  };

  // حذف وسيلة دفع
  const handleDeleteMethod = (methodId) => {
    if (currentMethods.length <= 1) {
      alert('يجب الإبقاء على وسيلة دفع واحدة على الأقل');
      return;
    }
    if (confirm('هل أنت متأكد من حذف وسيلة الدفع هذه؟')) {
      const updated = currentMethods.filter(m => m.id !== methodId);
      setFormData(prev => ({ ...prev, paymentMethods: updated }));
      handleSave('تم حذف وسيلة الدفع بنجاح! 🌸', updated);
    }
  };

  // تقديم الترتيب للأعلى
  const handleMoveUp = (index) => {
    if (index === 0) return;
    const updated = [...currentMethods];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    setFormData(prev => ({ ...prev, paymentMethods: updated }));
    handleSave(undefined, updated);
  };

  // تأخير الترتيب للأسفل
  const handleMoveDown = (index) => {
    if (index === currentMethods.length - 1) return;
    const updated = [...currentMethods];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    setFormData(prev => ({ ...prev, paymentMethods: updated }));
    handleSave(undefined, updated);
  };

  // رفع صورة مخصصة لوسيلة دفع محددة
  const handleDirectImageUpload = async (methodId, e) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, 256);
        const updated = currentMethods.map(m => m.id === methodId ? { ...m, image: compressed } : m);
        setFormData(prev => ({ ...prev, paymentMethods: updated }));
        handleSave('تم رفع وحفظ صورة وسيلة الدفع بنجاح! 🌸', updated);
      } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء تحميل الصورة');
      }
    }
    e.target.value = '';
  };

  // استعادة الأيقونة الأصلية لوسيلة دفع
  const handleResetIcon = (methodId) => {
    const defaultImg = DEFAULT_PAYMENT_ICONS[methodId] || INITIAL_PAYMENT_METHODS.find(im => im.id === methodId)?.image || '';
    const updated = currentMethods.map(m => m.id === methodId ? { ...m, image: defaultImg } : m);
    setFormData(prev => ({ ...prev, paymentMethods: updated }));
    handleSave('تم استعادة الأيقونة الأصلية بنجاح! 🌸', updated);
  };

  // تعيين أيقونة جاهزة لوسيلة دفع مباشرة
  const handleApplyPresetIcon = (methodId, presetImg) => {
    const updated = currentMethods.map(m => m.id === methodId ? { ...m, image: presetImg } : m);
    setFormData(prev => ({ ...prev, paymentMethods: updated }));
    handleSave('تم تحديث الشعار بنجاح! 🌸', updated);
  };

  // إضافة وسيلة دفع جديدة
  const handleCreateMethod = (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      alert('يرجى إدخال اسم وسيلة الدفع');
      return;
    }

    const newMethodObj = {
      id: `custom_${Date.now()}`,
      name: newName.trim(),
      subtitle: newSubtitle.trim() || 'دفع إلكتروني',
      type: newType,
      color: newColor,
      image: newImage || DEFAULT_PAYMENT_ICONS.card,
      enabled: true,
      isCustom: true
    };

    const updated = [...currentMethods, newMethodObj];
    setFormData(prev => ({ ...prev, paymentMethods: updated }));
    handleSave(`تمت إضافة وسيلة الدفع (${newName}) بنجاح! 🌸`, updated);

    setNewName('');
    setNewSubtitle('');
    setNewImage(DEFAULT_PAYMENT_ICONS.card);
    setIsAddingOpen(false);
  };

  // حفظ تعديل وسيلة الدفع
  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editingMethod) return;

    const updated = currentMethods.map(m => m.id === editingMethod.id ? { ...editingMethod } : m);
    setFormData(prev => ({ ...prev, paymentMethods: updated }));
    handleSave(`تم تحديث وسيلة الدفع (${editingMethod.name}) بنجاح! 🌸`, updated);
    setEditingMethod(null);
  };

  const colorOptions = [
    { label: 'وردي ملكي', val: 'from-pink-600 to-purple-600' },
    { label: 'أخضر نقدي', val: 'from-emerald-500 to-teal-600' },
    { label: 'أزرق بنكي', val: 'from-blue-600 to-indigo-700' },
    { label: 'بنفسجي فيزا', val: 'from-purple-600 to-indigo-800' },
    { label: 'برتقالي تمارا', val: 'from-amber-500 to-orange-600' },
    { label: 'أحمر نينجا', val: 'from-red-600 to-rose-700' },
    { label: 'عنبري آجل', val: 'from-amber-600 to-yellow-600' },
    { label: 'بنفسجي تقسيم', val: 'from-purple-600 to-pink-600' }
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-200 font-cairo">
      
      {/* إشعار الحفظ الناجح */}
      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-950 text-xs font-bold flex items-center justify-between shadow-sm animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2.5 py-1 rounded-lg">محفوظ ومحدث فوراً ✅</span>
        </div>
      )}

      {/* بطاقة رأس قسم وسائل الدفع مع زر التهيئة الشاملة */}
      <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-pink-950 text-white p-5 rounded-3xl shadow-xl border border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-2xl border border-white/20 shadow-inner">
            💳
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-purple-100">إدارة وتخصيص وسائل وطرق البيع 🌸</h3>
              <span className="bg-pink-500/30 text-pink-200 border border-pink-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {currentMethods.filter(m => m.enabled).length} من {currentMethods.length} مفعلة
              </span>
            </div>
            <p className="text-xs text-purple-200/80 mt-0.5">
              ترتيب وسائل الدفع، تخصيص الشعارات، وتحديد الأثر المحاسبي في الكاشير والخزينة.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetToDefaults}
            className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-pink-200 hover:text-white rounded-2xl text-xs font-black border border-white/20 transition active:scale-95 flex items-center gap-1.5"
            title="استعادة الأيقونات والوسائل الأصلية كاملة"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>🔄 إعادة تهيئة للأصل</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddingOpen(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 text-white rounded-2xl text-xs font-black shadow-lg shadow-pink-600/30 transition active:scale-95 flex items-center gap-1.5 border border-pink-400/30"
          >
            <Plus className="w-4 h-4" />
            <span>➕ إضافة وسيلة جديدة</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* شبكة بطاقات وسائل الدفع الحالية بتصميم متناسق ومريح وعالي الوضوح */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {currentMethods.map((m, idx) => {
          const displayImage = m.image || DEFAULT_PAYMENT_ICONS[m.id];
          return (
            <div
              key={m.id}
              className={`p-4 sm:p-5 rounded-3xl border transition-all duration-200 flex flex-col justify-between gap-4 bg-white shadow-xs hover:shadow-md ${
                m.enabled 
                  ? 'border-pink-100 hover:border-pink-300' 
                  : 'border-slate-200 bg-slate-50/80 opacity-65'
              }`}
            >
              {/* رأس البطاقة: الشعار المحدد بدقة + الاسم والوصف + شارة الحالة ورقم الترتيب */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  
                  {/* صندوق الشعار الثابت والمحمي بدقة */}
                  <div className="relative group shrink-0 w-14 h-14 min-w-[56px] max-w-[56px] min-h-[56px] max-h-[56px]">
                    <div className="w-14 h-14 min-w-[56px] max-w-[56px] min-h-[56px] max-h-[56px] rounded-2xl bg-slate-50 border border-slate-200 p-1.5 flex items-center justify-center shadow-xs overflow-hidden">
                      {displayImage ? (
                        <img 
                          src={displayImage} 
                          alt={m.name} 
                          className="w-full h-full max-w-[44px] max-h-[44px] object-contain drop-shadow-2xs select-none" 
                        />
                      ) : (
                        <div className={`w-full h-full rounded-xl bg-gradient-to-tr ${m.color || 'from-pink-600 to-purple-600'} text-white flex items-center justify-center font-black text-xs`}>
                          <CreditCard className="w-6 h-6 text-white" />
                        </div>
                      )}
                    </div>
                    <label 
                      className="absolute inset-0 bg-slate-950/80 text-white rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-[9px] font-black cursor-pointer transition backdrop-blur-2xs"
                      title="رفع وتغيير الشعار"
                    >
                      <span>تغيير 📷</span>
                      <input type="file" accept="image/*" onChange={(e) => handleDirectImageUpload(m.id, e)} className="hidden" />
                    </label>
                  </div>

                  {/* نصوص وتفاصيل وسيلة الدفع والأثر المحاسبي */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-black text-sm sm:text-base text-slate-900 truncate">{m.name}</h4>
                      {m.isCustom && (
                        <span className="text-[9px] bg-pink-100 text-pink-700 px-2 py-0.5 rounded-md font-bold shrink-0">
                          مخصص
                        </span>
                      )}
                    </div>
                    
                    <span className="text-xs text-slate-500 block truncate font-medium">{m.subtitle || m.type}</span>
                    
                    <div className="pt-0.5">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg inline-flex items-center gap-1.5 ${
                        m.type === 'cash' 
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                          : m.type === 'credit' 
                          ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                          : m.type === 'split'
                          ? 'bg-purple-50 text-purple-800 border border-purple-200'
                          : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                      }`}>
                        {m.type === 'cash' ? '💵 أثر نقدي في الدرج' : m.type === 'credit' ? '👥 حساب آجل ذمم' : m.type === 'split' ? '🔀 تقسيم ودفع متعدد' : '💳 شبكة ومدفوعات بنكية'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* زر تفعيل / تعطيل ورقم الترتيب */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleMethod(m.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-black transition border shadow-2xs flex items-center gap-1.5 ${
                      m.enabled 
                        ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200 border-emerald-300' 
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300 border-slate-300'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${m.enabled ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'}`}></span>
                    <span>{m.enabled ? 'مفعل 🟢' : 'معطل ⚪'}</span>
                  </button>
                  <span className="text-xs text-slate-400 font-mono font-bold">#{idx + 1}</span>
                </div>
              </div>

              {/* شريط الإجراءات والترتيب السفلي بأزرار واضحة وواسعة */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs gap-2">
                
                {/* أزرار تقديم وتأخير الترتيب */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 shadow-2xs">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMoveUp(idx)}
                    className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-pink-600 disabled:opacity-25 transition"
                    title="تقديم للأعلى"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === currentMethods.length - 1}
                    onClick={() => handleMoveDown(idx)}
                    className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-pink-600 disabled:opacity-25 transition"
                    title="تأخير للأسفل"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>

                {/* أزرار العمليات (رفع شعار / تعديل / حذف / الأصل) */}
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {m.image && (
                    <button
                      type="button"
                      onClick={() => handleResetIcon(m.id)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-rose-50 text-rose-600 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-slate-200"
                      title="استعادة الشعار الأصلي"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>الأصل</span>
                    </button>
                  )}

                  <label 
                    className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-bold cursor-pointer transition flex items-center gap-1 border border-purple-200 shadow-2xs"
                    title="رفع وتغيير الشعار"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>شعار 📷</span>
                    <input type="file" accept="image/*" onChange={(e) => handleDirectImageUpload(m.id, e)} className="hidden" />
                  </label>

                  <button
                    type="button"
                    onClick={() => setEditingMethod({ ...m })}
                    className="px-3 py-1.5 bg-pink-50 hover:bg-pink-100 text-pink-700 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-pink-200 shadow-2xs"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>تعديل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteMethod(m.id)}
                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition border border-transparent hover:border-rose-200"
                    title="حذف وسيلة الدفع"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 2. إعدادات وسلوكيات الدفع في الكاشير */}
      {/* ========================================================================= */}
      <div className="p-5 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-purple-600" />
            <h4 className="text-xs sm:text-sm font-black text-slate-900">إعدادات وسلوكيات نافذة الدفع في الكاشير:</h4>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <label className="flex items-center gap-2 p-3 bg-slate-50 hover:bg-pink-50/40 rounded-2xl border border-slate-200 font-bold text-slate-800 cursor-pointer transition">
            <input
              type="checkbox"
              checked={formData.paymentSettings?.autoPrintAfterPayment !== false}
              onChange={e => {
                const next = { ...formData, paymentSettings: { ...formData.paymentSettings, autoPrintAfterPayment: e.target.checked } };
                setFormData(next);
                handleSave(undefined, next.paymentMethods);
              }}
              className="w-4 h-4 text-pink-600 rounded"
            />
            <span>الطباعة التلقائية بعد السداد 🖨️</span>
          </label>

          <label className="flex items-center gap-2 p-3 bg-slate-50 hover:bg-pink-50/40 rounded-2xl border border-slate-200 font-bold text-slate-800 cursor-pointer transition">
            <input
              type="checkbox"
              checked={formData.paymentSettings?.openDrawerOnCash !== false}
              onChange={e => {
                const next = { ...formData, paymentSettings: { ...formData.paymentSettings, openDrawerOnCash: e.target.checked } };
                setFormData(next);
                handleSave(undefined, next.paymentMethods);
              }}
              className="w-4 h-4 text-pink-600 rounded"
            />
            <span>فتح درج الكاشير في الدفع النقدي 💵</span>
          </label>

          <label className="flex items-center gap-2 p-3 bg-slate-50 hover:bg-pink-50/40 rounded-2xl border border-slate-200 font-bold text-slate-800 cursor-pointer transition">
            <input
              type="checkbox"
              checked={formData.paymentSettings?.playSuccessSound !== false}
              onChange={e => {
                const next = { ...formData, paymentSettings: { ...formData.paymentSettings, playSuccessSound: e.target.checked } };
                setFormData(next);
                handleSave(undefined, next.paymentMethods);
              }}
              className="w-4 h-4 text-pink-600 rounded"
            />
            <span>تشغيل صوت رنين عند نجاح العملية 🔔</span>
          </label>
        </div>

        {/* بطاقة إعدادات تقسيم الفاتورة والربط الحسابي */}
        <div className="p-4 bg-purple-50/50 rounded-2xl border border-purple-200 space-y-2.5">
          <div className="flex items-center gap-2 text-purple-950 font-black text-xs">
            <span className="text-sm">🔀</span>
            <span>إعدادات تقسيم الفاتورة والربط المحاسبي التلقائي:</span>
          </div>
          <p className="text-[11px] text-purple-800">
            عند تفعيل تقسيم الفاتورة، يمكنك توزيع المبلغ على أي عدد من طرق الدفع، مع تدوين الملاحظات والمراجع، والربط التلقائي بالخزينة وعملاء الآجل.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <label className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-purple-200 font-bold text-purple-900 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.paymentSettings?.allowMultiSplit !== false}
                onChange={e => {
                  const next = { ...formData, paymentSettings: { ...formData.paymentSettings, allowMultiSplit: e.target.checked } };
                  setFormData(next);
                  handleSave('تم تحديث إعدادات تقسيم الفاتورة بنجاح! 🌸', next.paymentMethods);
                }}
                className="w-4 h-4 text-purple-600 rounded"
              />
              <span>تفعيل تقسيم الفاتورة المتعدد (2+ وسائل)</span>
            </label>

            <label className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-purple-200 font-bold text-purple-900 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.paymentSettings?.autoLinkSplitAccounts !== false}
                onChange={e => {
                  const next = { ...formData, paymentSettings: { ...formData.paymentSettings, autoLinkSplitAccounts: e.target.checked } };
                  setFormData(next);
                  handleSave('تم تفعيل الربط المحاسبي لتقسيم الفاتورة! 🌸', next.paymentMethods);
                }}
                className="w-4 h-4 text-purple-600 rounded"
              />
              <span>ربط كل دفعة بمقابلها في الخزينة والعملاء</span>
            </label>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* نافذة منبثقة: إضافة وسيلة دفع جديدة مع معرض الشعارات الجاهزة */}
      {/* ========================================================================= */}
      {isAddingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-pink-200 animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="p-4 bg-gradient-to-r from-purple-950 via-slate-900 to-pink-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">➕</span>
                <h3 className="font-black text-sm">إضافة وسيلة دفع جديدة مخصصة 🌸</h3>
              </div>
              <button type="button" onClick={() => setIsAddingOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMethod} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              
              {/* معرض الشعارات السريعة */}
              <div className="space-y-1.5">
                <label className="block font-black text-slate-800">اختر شعاراً جاهزاً بنقرة واحدة (أو ارفع صورة خاصة):</label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 p-2.5 bg-slate-50 rounded-2xl border border-slate-200">
                  {PRESET_LOGO_LIST.map((preset) => {
                    const isPicked = newImage === preset.image;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setNewImage(preset.image);
                          if (!newName) setNewName(preset.name.split(' ')[0]);
                          if (preset.type) setNewType(preset.type);
                        }}
                        className={`p-1.5 rounded-xl border flex flex-col items-center gap-1 transition active:scale-95 ${
                          isPicked 
                            ? 'bg-white border-pink-500 ring-2 ring-pink-400 shadow-sm' 
                            : 'bg-white/80 border-slate-200 hover:border-pink-300'
                        }`}
                      >
                        <div className="w-10 h-7 flex items-center justify-center">
                          <img src={preset.image} alt={preset.name} className="w-full h-full object-contain" />
                        </div>
                        <span className="text-[9px] font-bold text-slate-700 truncate w-full text-center">
                          {preset.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* الاسم والوصف */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">اسم وسيلة الدفع *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: Apple Pay أو STC Pay"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold focus:border-pink-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الوصف الفرعي</label>
                  <input
                    type="text"
                    placeholder="مثال: محفظة إلكترونية"
                    value={newSubtitle}
                    onChange={e => setNewSubtitle(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold focus:border-pink-500 outline-none"
                  />
                </div>
              </div>

              {/* نوع الحساب */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">المعاملة الحسابية (نوع الحساب)</label>
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-800 outline-none bg-slate-50"
                  >
                    <option value="card">💳 بطاقة ومدفوعات بنكية (شبكة / فيزا / مدى)</option>
                    <option value="cash">💵 نقدي (يؤثر في نقدية الخزينة والصندوق)</option>
                    <option value="online">📱 تطبيق دفع ومحفظة رقمية</option>
                    <option value="credit">👥 ذمة آجلة (حساب ديون العملاء)</option>
                    <option value="split">🔀 تقسيم / دفع متعدد</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">لون التدرج الخلفي</label>
                  <select
                    value={newColor}
                    onChange={e => setNewColor(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-800 outline-none bg-slate-50"
                  >
                    {colorOptions.map(c => (
                      <option key={c.val} value={c.val}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* معاينة الشعار ورفع صورة مخصصة */}
              <div className="p-3 bg-pink-50/50 rounded-2xl border border-pink-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-1 shadow-xs overflow-hidden">
                    {newImage ? <img src={newImage} alt="Preview" className="w-full h-full object-contain" /> : <CreditCard className="w-5 h-5 text-slate-400" />}
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 block">الشعار المحدد</span>
                    <span className="text-[10px] text-slate-500">تم اختيار الشعار بنجاح</span>
                  </div>
                </div>

                <label className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-[11px] cursor-pointer shadow flex items-center gap-1 transition">
                  <Upload className="w-3.5 h-3.5" />
                  <span>رفع صورة خاصة 📷</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const comp = await compressImageFile(file, 256);
                        setNewImage(comp);
                      }
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddingOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 text-white rounded-xl font-black shadow-md flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>إضافة وسيلة الدفع فوراً</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* نافذة منبثقة: تعديل وسيلة دفع موجودة مع معرض الشعارات الجاهزة */}
      {/* ========================================================================= */}
      {editingMethod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-pink-200 animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="p-4 bg-gradient-to-r from-purple-950 via-slate-900 to-pink-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">✏️</span>
                <h3 className="font-black text-sm">تعديل وسيلة الدفع: {editingMethod.name}</h3>
              </div>
              <button type="button" onClick={() => setEditingMethod(null)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              
              {/* معرض الشعارات السريعة */}
              <div className="space-y-1.5">
                <label className="block font-black text-slate-800">اختر شعاراً من المعرض الجاهز:</label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 p-2.5 bg-slate-50 rounded-2xl border border-slate-200">
                  {PRESET_LOGO_LIST.map((preset) => {
                    const isPicked = editingMethod.image === preset.image;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setEditingMethod(p => ({ ...p, image: preset.image }));
                        }}
                        className={`p-1.5 rounded-xl border flex flex-col items-center gap-1 transition active:scale-95 ${
                          isPicked 
                            ? 'bg-white border-pink-500 ring-2 ring-pink-400 shadow-sm' 
                            : 'bg-white/80 border-slate-200 hover:border-pink-300'
                        }`}
                      >
                        <div className="w-10 h-7 flex items-center justify-center">
                          <img src={preset.image} alt={preset.name} className="w-full h-full object-contain" />
                        </div>
                        <span className="text-[9px] font-bold text-slate-700 truncate w-full text-center">
                          {preset.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* الاسم والوصف */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">اسم وسيلة الدفع *</label>
                  <input
                    type="text"
                    required
                    value={editingMethod.name || ''}
                    onChange={e => setEditingMethod(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold focus:border-pink-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الوصف الفرعي</label>
                  <input
                    type="text"
                    value={editingMethod.subtitle || ''}
                    onChange={e => setEditingMethod(p => ({ ...p, subtitle: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold focus:border-pink-500 outline-none"
                  />
                </div>
              </div>

              {/* نوع الحساب */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">المعاملة الحسابية (نوع الحساب)</label>
                  <select
                    value={editingMethod.type || 'card'}
                    onChange={e => setEditingMethod(p => ({ ...p, type: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-800 outline-none bg-slate-50"
                  >
                    <option value="card">💳 بطاقة ومدفوعات بنكية (شبكة / فيزا / مدى)</option>
                    <option value="cash">💵 نقدي (يؤثر في نقدية الخزينة والصندوق)</option>
                    <option value="online">📱 تطبيق دفع ومحفظة رقمية</option>
                    <option value="credit">👥 ذمة آجلة (حساب ديون العملاء)</option>
                    <option value="split">🔀 تقسيم / دفع متعدد</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">لون التدرج الخلفي</label>
                  <select
                    value={editingMethod.color || 'from-pink-600 to-purple-600'}
                    onChange={e => setEditingMethod(p => ({ ...p, color: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-800 outline-none bg-slate-50"
                  >
                    {colorOptions.map(c => (
                      <option key={c.val} value={c.val}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* تغيير أو مسح الصورة */}
              <div className="p-3 bg-pink-50/50 rounded-2xl border border-pink-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-1 shadow-xs overflow-hidden">
                    {editingMethod.image ? (
                      <img src={editingMethod.image} alt="Preview" className="w-full h-full object-contain" />
                    ) : (
                      <CreditCard className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 block">شعار وسيلة الدفع</span>
                    <span className="text-[10px] text-slate-500">
                      {editingMethod.image ? 'تم تعيين شعار مخصص' : 'أيقونة متجهية افتراضية'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <label className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-[11px] cursor-pointer shadow flex items-center gap-1 transition">
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع صورة 📷</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const comp = await compressImageFile(file, 256);
                          setEditingMethod(p => ({ ...p, image: comp }));
                        }
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* رسوم وعمولة وسيلة الدفع — تُستخدم تلقائياً عند تسوية الشبكة */}
              <div className="pt-3 mt-1 border-t border-slate-100 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-700">
                  <span>💳 رسوم وعمولة هذه الوسيلة (اختياري)</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  تُحسب تلقائياً عند تسوية هذه الشبكة في شاشة الخزينة. الرسوم نسبة من المبلغ، والعمولة مبلغ ثابت يُخصم عن كل عملية. اتركها فارغة إذا لم تكن على هذه الوسيلة.
                </p>
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">الرسوم (%) — نسبة من المبلغ</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={editingMethod.commissionRate ?? ''}
                      onChange={(e) => setEditingMethod(p => ({ ...p, commissionRate: e.target.value }))}
                      placeholder="مثال: مدى 0.8 — فيزا 2.2"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-300"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">العمولة — مبلغ ثابت لكل عملية</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={editingMethod.commissionFixed ?? ''}
                      onChange={(e) => setEditingMethod(p => ({ ...p, commissionFixed: e.target.value }))}
                      placeholder="فيزا غالباً: 1 أو 2 ريال — واتركه فارغاً لمدى"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-300"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingMethod(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 text-white rounded-xl font-black shadow-md flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>حفظ التعديلات 🌸</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
