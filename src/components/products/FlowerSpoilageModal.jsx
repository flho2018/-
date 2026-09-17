import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  X, Trash2, AlertTriangle, Calendar, DollarSign, FileSpreadsheet, 
  Plus, Search, Sparkles, CheckCircle2, ArrowDownRight, TrendingDown,
  Info, History, Filter
} from 'lucide-react';
import { formatMoney } from '../../utils/helpers';
import { checkUserPermission } from '../../utils/permissions';
import * as XLSX from 'xlsx';

const SPOILAGE_REASONS = [
  { id: 'natural_wilting', label: 'ذبول طبيعي وانتهاء صلاحية 🥀', defaultCost: true },
  { id: 'handling_breakage', label: 'كسر وتلف أثناء التنسيق والتجهيز ✂️', defaultCost: true },
  { id: 'supplier_defect', label: 'عيب مورد وتلف عند الاستلام 📦', defaultCost: true },
  { id: 'temperature_heat', label: 'تعرض لحرارة أو سوء حفظ وتبريد ☀️', defaultCost: true },
  { id: 'sample_display', label: 'عينات عرض وتجارب بوكيهات 🌸', defaultCost: true },
  { id: 'other', label: 'سبب آخر (ملاحظة إضافية) 📝', defaultCost: true }
];

export const FlowerSpoilageModal = ({ isOpen, onClose }) => {
  const {
    products,
    categories,
    spoilageLogs,
    recordSpoilage,
    deleteSpoilageRecord,
    currentUser,
    storeInfo,
    confirmDialog
  } = useApp();

  const canViewCost = checkUserPermission(currentUser, 'products_view_cost');
  const canAdjustStock = checkUserPermission(currentUser, 'products_adjust_stock');
  const isAdmin = currentUser?.role === 'admin' || currentUser?.isAdmin;
  const currency = storeInfo?.currency || 'ر.س';

  // حالة النموذج
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('natural_wilting');
  const [notes, setNotes] = useState('');
  const [successToast, setSuccessToast] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'history'

  // تصفية السجل
  const [filterQuery, setFilterQuery] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('all'); // 'today' | 'month' | 'all'

  // قائمة المنتجات النشطة المؤهلة
  const activeProducts = useMemo(() => {
    return (products || []).filter(p => !p?.isArchived && !p?.isService);
  }, [products]);

  // المنتج المختار حالياً
  const selectedProduct = useMemo(() => {
    return activeProducts.find(p => p.id === selectedProductId) || null;
  }, [activeProducts, selectedProductId]);

  // المنتجات المفلترة بحسب بحث المستخدم في قائمة الاختيار
  const filteredProductsList = useMemo(() => {
    if (!productSearch.trim()) return activeProducts.slice(0, 30);
    const q = productSearch.trim().toLowerCase();
    return activeProducts.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.barcode && String(p.barcode).includes(q))
    ).slice(0, 30);
  }, [activeProducts, productSearch]);

  // إحصائيات الهالك والتالف
  const stats = useMemo(() => {
    const logs = Array.isArray(spoilageLogs) ? spoilageLogs : [];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const todayStr = now.toISOString().slice(0, 10);

    let totalMonthLoss = 0;
    let totalMonthQty = 0;
    let todayLoss = 0;
    let todayQty = 0;
    let totalAllLoss = 0;
    let totalAllQty = 0;

    logs.forEach(item => {
      const itemDate = new Date(item.date || item.at || 0);
      const isThisMonth = itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
      const isToday = (item.date || '').slice(0, 10) === todayStr;

      const loss = Number(item.totalCostLoss) || 0;
      const count = Number(item.qty) || 0;

      totalAllLoss += loss;
      totalAllQty += count;

      if (isThisMonth) {
        totalMonthLoss += loss;
        totalMonthQty += count;
      }
      if (isToday) {
        todayLoss += loss;
        todayQty += count;
      }
    });

    return {
      totalMonthLoss: Math.round(totalMonthLoss * 100) / 100,
      totalMonthQty,
      todayLoss: Math.round(todayLoss * 100) / 100,
      todayQty,
      totalAllLoss: Math.round(totalAllLoss * 100) / 100,
      totalAllQty,
      totalRecords: logs.length
    };
  }, [spoilageLogs]);

  // تصفية سجل الهالك
  const filteredLogs = useMemo(() => {
    let list = Array.isArray(spoilageLogs) ? [...spoilageLogs] : [];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const todayStr = now.toISOString().slice(0, 10);

    if (filterPeriod === 'today') {
      list = list.filter(l => (l.date || '').slice(0, 10) === todayStr);
    } else if (filterPeriod === 'month') {
      list = list.filter(l => {
        const d = new Date(l.date || l.at || 0);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
    }

    if (filterQuery.trim()) {
      const q = filterQuery.trim().toLowerCase();
      list = list.filter(l => 
        (l.productName && l.productName.toLowerCase().includes(q)) ||
        (l.reason && l.reason.toLowerCase().includes(q)) ||
        (l.reportedBy && l.reportedBy.toLowerCase().includes(q)) ||
        (l.notes && l.notes.toLowerCase().includes(q))
      );
    }

    return list.sort((a, b) => new Date(b.date || b.at || 0) - new Date(a.date || a.at || 0));
  }, [spoilageLogs, filterPeriod, filterQuery]);

  // حفظ الهالك
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedProduct) {
      setErrorMsg('الرجاء اختيار الصنف المراد تسجيل إتلافه.');
      return;
    }

    const damageQty = Number(qty);
    if (!damageQty || damageQty <= 0) {
      setErrorMsg('الرجاء إدخال كمية صالحة أكبر من الصفر.');
      return;
    }

    const currentStock = Number(selectedProduct.stock) || 0;
    if (damageQty > currentStock) {
      const ok = await confirmDialog({
        title: '⚠️ الكمية أكبر من الرصيد',
        message: `الكمية المدخلة للإتلاف (${damageQty}) أكبر من الرصيد الحالي المتوفر (${currentStock}).\n\nهل تريد المتابعة وتحديث المخزون بالسالب؟`,
        confirmText: 'متابعة',
        tone: 'warning'
      });
      if (!ok) return;
    }

    const selectedReasonObj = SPOILAGE_REASONS.find(r => r.id === reason);
    const reasonLabel = selectedReasonObj ? selectedReasonObj.label : 'ذبول طبيعي';

    const result = recordSpoilage({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      qty: damageQty,
      costPrice: selectedProduct.costPrice ?? 0,
      sellingPrice: selectedProduct.sellingPrice ?? selectedProduct.price ?? 0,
      reason: reasonLabel,
      notes: notes.trim(),
      reportedBy: currentUser?.name || 'كاشير'
    });

    if (result) {
      setSuccessToast(`✅ تم تسجيل إتلاف (${damageQty}) من (${selectedProduct.name}) وخصمها من المخزون بنجاح.`);
      setSelectedProductId('');
      setProductSearch('');
      setQty(1);
      setNotes('');
      setTimeout(() => setSuccessToast(null), 5000);
    } else {
      setErrorMsg('تعذّر تسجيل الإتلاف، يرجى المحاولة مرة أخرى.');
    }
  };

  // تصدير سجل الهالك إلى Excel
  const handleExportExcel = () => {
    try {
      const rows = filteredLogs.map((item, idx) => ({
        'م': idx + 1,
        'التاريخ والوقت': new Date(item.date || item.at || 0).toLocaleString('ar-SA'),
        'اسم الصنف': item.productName || '',
        'الكمية التالفة': item.qty || 0,
        'سعر التكلفة للوحدة': canViewCost ? (item.unitCost || 0) : 'محجوب',
        'إجمالي خسارة التكلفة (ر.س)': canViewCost ? (item.totalCostLoss || 0) : 'محجوب',
        'سبب التلف': item.reason || '',
        'الملاحظات': item.notes || '',
        'الموظف المسؤول': item.reportedBy || ''
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!dir'] = 'rtl';
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'سجل تالف الورد');
      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `سجل_تالف_وهالك_الورد_${dateStr}.xlsx`);
    } catch (err) {
      console.error('Export error:', err);
      alert('حدث خطأ أثناء تصدير ملف الإكسيل.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-md animate-in fade-in select-none">
      <div className="bg-gradient-to-b from-[#25081E] via-[#1E0618] to-[#140310] border-2 border-rose-500/40 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-white">
        
        {/* رأس النافذة */}
        <div className="p-5 border-b border-rose-900/40 bg-gradient-to-r from-rose-950/80 via-[#2A0822] to-purple-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-300 flex items-center justify-center border-2 border-rose-400/50 shadow-inner">
              <span className="text-2xl">🥀</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg text-white">سجل تالف وهالك الورد الطبيعي</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-200 font-bold">
                  خصم مخزون فوري
                </span>
              </div>
              <p className="text-xs text-rose-200/80 mt-0.5">
                رصد إتلاف الزهور الذابلة والمكسورة، احتساب الخسائر المالية، وتوثيق الأسباب
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 hover:text-white transition border border-rose-500/30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* بطاقات الإحصائيات السريعة */}
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/20 border-b border-rose-900/30">
          <div className="bg-rose-950/40 border border-rose-800/40 rounded-2xl p-3">
            <div className="flex items-center justify-between text-rose-300 text-xs mb-1">
              <span>خسائر هذا الشهر 🥀</span>
              <DollarSign className="w-3.5 h-3.5" />
            </div>
            <div className="text-lg font-black text-rose-100">
              {canViewCost ? formatMoney(stats.totalMonthLoss, currency) : 'محجوب 🔒'}
            </div>
            <div className="text-[10px] text-rose-400/80 mt-0.5">
              {stats.totalMonthQty} حبة / عود تالف
            </div>
          </div>

          <div className="bg-purple-950/40 border border-purple-800/40 rounded-2xl p-3">
            <div className="flex items-center justify-between text-purple-300 text-xs mb-1">
              <span>هالك اليوم ⏱️</span>
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
            <div className="text-lg font-black text-purple-100">
              {canViewCost ? formatMoney(stats.todayLoss, currency) : 'محجوب 🔒'}
            </div>
            <div className="text-[10px] text-purple-400/80 mt-0.5">
              {stats.todayQty} عود تم إتلافه اليوم
            </div>
          </div>

          <div className="bg-amber-950/40 border border-amber-800/40 rounded-2xl p-3">
            <div className="flex items-center justify-between text-amber-300 text-xs mb-1">
              <span>إجمالي الهالك التراكمي</span>
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <div className="text-lg font-black text-amber-100">
              {canViewCost ? formatMoney(stats.totalAllLoss, currency) : 'محجوب 🔒'}
            </div>
            <div className="text-[10px] text-amber-400/80 mt-0.5">
              {stats.totalAllQty} حبة إجمالية
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/40 rounded-2xl p-3">
            <div className="flex items-center justify-between text-slate-300 text-xs mb-1">
              <span>عدد القيود المسجلة</span>
              <History className="w-3.5 h-3.5" />
            </div>
            <div className="text-lg font-black text-slate-100">
              {stats.totalRecords}
            </div>
            <div className="text-[10px] text-slate-400/80 mt-0.5">
              عملية إتلاف موثقة
            </div>
          </div>
        </div>

        {/* أشرطة التبويب */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-rose-900/30">
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'new'
                ? 'border-rose-500 text-rose-300'
                : 'border-transparent text-rose-200/60 hover:text-rose-100'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل إتلاف جديد</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-rose-500 text-rose-300'
                : 'border-transparent text-rose-200/60 hover:text-rose-100'
            }`}
          >
            <History className="w-4 h-4" />
            <span>السجل التاريخي والتحليلات ({filteredLogs.length})</span>
          </button>
        </div>

        {/* إشعار النجاح */}
        {successToast && (
          <div className="mx-5 mt-3 p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-2xl text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {/* إشعار الخطأ */}
        {errorMsg && (
          <div className="mx-5 mt-3 p-3 bg-red-950/80 border border-red-500/50 rounded-2xl text-red-200 text-xs flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* المحتوى الرئيسي */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'new' ? (
            <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl mx-auto">
              <div>
                <label className="block text-xs font-bold text-rose-200 mb-1.5">
                  1. اختيار الصنف المراد إتلافه: <span className="text-rose-400">*</span>
                </label>
                
                <div className="relative mb-2">
                  <Search className="w-4 h-4 text-rose-400/70 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="ابحث باسم الوردة، الباقة، أو الباركود..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full bg-rose-950/30 border border-rose-800/40 rounded-2xl pr-9 pl-3 py-2 text-xs text-white placeholder-rose-400/40 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-rose-900/30 rounded-2xl bg-black/20">
                  {filteredProductsList.map(prod => {
                    const isSelected = selectedProductId === prod.id;
                    const stock = Number(prod.stock) || 0;
                    return (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => setSelectedProductId(prod.id)}
                        className={`text-right p-2.5 rounded-xl border transition flex items-center justify-between text-xs ${
                          isSelected
                            ? 'bg-rose-900/60 border-rose-400 text-white shadow-md'
                            : 'bg-rose-950/20 border-rose-900/30 text-rose-200 hover:bg-rose-900/30'
                        }`}
                      >
                        <div className="truncate pr-1">
                          <div className="font-bold truncate">{prod.name}</div>
                          <div className="text-[10px] text-rose-300/70">
                            سعر البيع: {formatMoney(prod.sellingPrice ?? prod.price, currency)}
                            {canViewCost && ` • التكلفة: ${formatMoney(prod.costPrice, currency)}`}
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                          stock <= 0 ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          المتوفر: {stock} {prod.unit || 'حبة'}
                        </span>
                      </button>
                    );
                  })}
                  {filteredProductsList.length === 0 && (
                    <div className="col-span-2 text-center py-6 text-xs text-rose-400/60">
                      لا توجد أصناف مطابقة للبحث
                    </div>
                  )}
                </div>
              </div>

              {selectedProduct && (
                <div className="p-3 bg-rose-950/40 border border-rose-700/40 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-xs border-b border-rose-900/40 pb-2">
                    <span className="font-bold text-rose-100">
                      الصنف المحدد: {selectedProduct.name}
                    </span>
                    <span className="text-[11px] text-rose-300">
                      الرصيد المتبقي: {selectedProduct.stock} {selectedProduct.unit || 'حبة'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-rose-200 mb-1">
                        الكمية التالفة ({selectedProduct.unit || 'حبة'}): <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={qty}
                        onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-rose-950/50 border border-rose-600/50 rounded-xl px-3 py-2 text-sm font-black text-white focus:outline-none focus:border-rose-400"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-rose-200 mb-1">
                        سبب الإتلاف: <span className="text-rose-400">*</span>
                      </label>
                      <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full bg-rose-950/50 border border-rose-600/50 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-rose-400"
                      >
                        {SPOILAGE_REASONS.map(r => (
                          <option key={r.id} value={r.id} className="bg-slate-900 text-white">
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {canViewCost && (
                    <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl text-xs">
                      <span className="text-rose-300">قيمة الخسارة المالية للتكلفة:</span>
                      <span className="font-black text-rose-200 text-sm">
                        {formatMoney((Number(selectedProduct.costPrice) || 0) * (Number(qty) || 0), currency)}
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-rose-200 mb-1">
                      ملاحظات أو توضيح إضافي:
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: ذبلت أوراقها بعد انتهاء الوردية / كسر بالفرع أثناء التنسيق"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full bg-rose-950/50 border border-rose-800/40 rounded-xl px-3 py-2 text-xs text-white placeholder-rose-400/40 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-rose-900/40 border border-rose-400/50 transition flex items-center justify-center gap-2 active:scale-95"
                  >
                    <span>تسجيل إتلاف ({qty}) {selectedProduct.unit || 'حبة'} وخصم المخزون 🥀</span>
                  </button>
                </div>
              )}
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-black/20 p-3 rounded-2xl border border-rose-900/30">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-3.5 h-3.5 text-rose-400/70 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="بحث في سجل الهالك..."
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      className="w-full bg-rose-950/30 border border-rose-800/40 rounded-xl pr-8 pl-3 py-1.5 text-xs text-white placeholder-rose-400/40 focus:outline-none"
                    />
                  </div>

                  <select
                    value={filterPeriod}
                    onChange={(e) => setFilterPeriod(e.target.value)}
                    className="bg-rose-950/50 border border-rose-800/40 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="all">كل الفترات</option>
                    <option value="month">هذا الشهر</option>
                    <option value="today">اليوم فقط</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold border border-emerald-400/40 flex items-center gap-1.5 shadow-sm active:scale-95"
                  title="تصدير سجل الهالك إلى ملف Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                  <span>تصدير إكسيل 📊</span>
                </button>
              </div>

              <div className="overflow-x-auto border border-rose-900/30 rounded-2xl bg-black/30">
                <table className="w-full text-right text-xs">
                  <thead className="bg-rose-950/60 text-rose-300 border-b border-rose-900/40">
                    <tr>
                      <th className="p-3">التاريخ والوقت</th>
                      <th className="p-3">اسم الصنف</th>
                      <th className="p-3 text-center">الكمية</th>
                      {canViewCost && <th className="p-3">خسارة التكلفة</th>}
                      <th className="p-3">السبب</th>
                      <th className="p-3">الملاحظات</th>
                      <th className="p-3">الموظف</th>
                      {isAdmin && <th className="p-3 text-center">إجراء</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-950/40 text-rose-100">
                    {filteredLogs.map(item => (
                      <tr key={item.id} className="hover:bg-rose-900/20 transition">
                        <td className="p-3 whitespace-nowrap text-rose-300/80 font-mono text-[11px]">
                          {new Date(item.date || item.at || 0).toLocaleString('ar-SA', {
                            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </td>
                        <td className="p-3 font-bold text-white">
                          {item.productName}
                        </td>
                        <td className="p-3 text-center font-black text-rose-300">
                          {item.qty}
                        </td>
                        {canViewCost && (
                          <td className="p-3 font-bold text-rose-200">
                            {formatMoney(item.totalCostLoss, currency)}
                          </td>
                        )}
                        <td className="p-3 text-rose-200/90">
                          {item.reason}
                        </td>
                        <td className="p-3 text-rose-300/70 text-[11px] max-w-[150px] truncate">
                          {item.notes || '—'}
                        </td>
                        <td className="p-3 text-rose-300/80">
                          {item.reportedBy || 'كاشير'}
                        </td>
                        {isAdmin && (
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={async () => {
                                // كانت نافذة واحدة بثلاث نتائج مستحيلة: «موافق» تحذف
                                // وتُعيد المخزون، و«إلغاء» **تحذف أيضاً** بلا إعادة —
                                // فلم يكن للمستخدم أي طريق للتراجع عن الحذف نفسه.
                                // فُصل السؤالان: الحذف أولاً، ثم مصير الكمية.
                                const del = await confirmDialog({
                                  title: 'حذف قيد تالف',
                                  message: `حذف قيد إتلاف (${item.productName || 'صنف'}) بكمية ${item.qty}؟`,
                                  confirmText: 'حذف',
                                  tone: 'danger'
                                });
                                if (!del) return;
                                const restore = await confirmDialog({
                                  title: 'مصير الكمية',
                                  message: `هل تُعاد الكمية (${item.qty}) إلى المخزون؟\n\nاختر «إعادة للمخزون» إن كان القيد خاطئاً والبضاعة سليمة، و«بدون إعادة» إن كانت تالفة فعلاً.`,
                                  confirmText: 'إعادة للمخزون',
                                  cancelText: 'بدون إعادة'
                                });
                                deleteSpoilageRecord(item.id, restore);
                              }}
                              className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-800 text-red-300 hover:text-white transition"
                              title="حذف القيد"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {filteredLogs.length === 0 && (
                      <tr>
                        <td colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-rose-400/60">
                          لا توجد قيود إتلاف مسجلة حتى الآن 🌸
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ذيل النافذة */}
        <div className="p-4 border-t border-rose-900/40 bg-black/40 flex items-center justify-between text-xs text-rose-300/80">
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-rose-400" />
            <span>تسجيل التالف يخصم المخزون آلياً ويوثق في سجل التدقيق السحابي (Audit Log)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-rose-950/70 hover:bg-rose-900 text-white rounded-xl font-bold border border-rose-500/30 transition"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
