import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { Package, Plus, Search, Edit2, Trash2, Barcode, Sparkles, FolderPlus, X, Check, Image as ImageIcon, Printer, Copy, LayoutList, LayoutGrid, ArrowUpDown, FileSpreadsheet, Download } from 'lucide-react';
import { formatMoney, generateSequentialBarcode } from '../../utils/helpers';
import { checkUserPermission } from '../../utils/permissions';
import { exportProductsToExcel } from '../../utils/excelHelper';
import { ExcelImportModal } from './ExcelImportModal';
import { printThermalBarcodeLabels } from '../../utils/printHelper';
import JsBarcode from 'jsbarcode';

// مكون توليد باركود حقيقي قابل للمسح باستخدام مكتبة JsBarcode
const BarcodeSvgVisual = ({ code, height = 36, showText = true, textSize = 10, format = 'CODE128' }) => {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !code) return;
    try {
      // تحديد التنسيق الذكي تلقائياً
      let barFormat = format || 'CODE128';
      const cleanCode = String(code).trim();
      
      // تحقق ذكي: EAN-13 يحتاج 13 رقم بالضبط
      if (barFormat === 'EAN13' && (cleanCode.length !== 13 || !/^\d+$/.test(cleanCode))) {
        barFormat = 'CODE128'; // تراجع تلقائي للكود128 إذا الرقم غير صالح لـ EAN
      }
      if (barFormat === 'UPCA' && (cleanCode.length !== 12 || !/^\d+$/.test(cleanCode))) {
        barFormat = 'CODE128';
      }

      JsBarcode(svgRef.current, cleanCode, {
        format: barFormat,
        width: 1.8,
        height: height,
        displayValue: showText,
        fontSize: textSize,
        font: 'monospace',
        fontOptions: 'bold',
        textMargin: 2,
        margin: 0,
        background: 'transparent',
        lineColor: '#000000'
      });
    } catch (e) {
      // إذا فشل التنسيق المطلوب، استخدم CODE128 كاحتياط
      try {
        JsBarcode(svgRef.current, String(code).trim(), {
          format: 'CODE128',
          width: 1.8,
          height: height,
          displayValue: showText,
          fontSize: textSize,
          font: 'monospace',
          fontOptions: 'bold',
          textMargin: 2,
          margin: 0,
          background: 'transparent',
          lineColor: '#000000'
        });
      } catch (e2) {
        console.warn('[Barcode] Failed to render:', e2);
      }
    }
  }, [code, height, showText, textSize, format]);

  return (
    <div className="flex flex-col items-center justify-center w-full select-none">
      <svg ref={svgRef} className="w-full max-w-[220px]" />
    </div>
  );
};

export const ProductsScreen = () => {
  const {
    products,
    categories,
    addProduct,
    updateProduct,
    deleteProduct,
    addCategory,
    deleteCategory,
    importProductsBatch,
    storeInfo,
    currentUser,
    restoreProduct
  } = useApp();

  // عرض المنتجات المؤرشفة (المحذوفة سابقاً) بدل النشطة
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = (products || []).filter(p => p?.isArchived).length;

  // ================= الصلاحيات =================
  const canAdd        = checkUserPermission(currentUser, 'products_add');
  const canEdit       = checkUserPermission(currentUser, 'products_edit');
  const canDelete     = checkUserPermission(currentUser, 'products_delete');
  const canViewCost   = checkUserPermission(currentUser, 'products_view_cost');
  const canAdjustStock= checkUserPermission(currentUser, 'products_adjust_stock');
  const canPrintLabel = checkUserPermission(currentUser, 'products_barcode_print');
  const denyMsg = (what) => alert(`⛔ ليس لديك صلاحية ${what}.\nتُمنح من: الإعدادات ← المستخدمون ← الصلاحيات.`);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatId, setSelectedCatId] = useState('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [excelToast, setExcelToast] = useState(null);
  const [newCatName, setNewCatName] = useState('');
  
  // نافذة طباعة ملصق الباركود
  const [barcodePrintModalProduct, setBarcodePrintModalProduct] = useState(null);
  const [barcodeCopies, setBarcodeCopies] = useState(1);
  const [selectedLabelSize, setSelectedLabelSize] = useState('50x25');

  // نموذج المنتج
  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    factoryBarcode: '',
    categoryId: '',
    unit: 'حبة',
    costPrice: '',
    sellingPrice: '',
    stock: '',
    minStock: '5',
    image: '',
    isService: false
  });

  const [stockFilter, setStockFilter] = useState('all'); // all, in_stock, low_stock, out_of_stock
  const [viewMode, setViewMode] = useState('table'); // 'table' (الأسطر الذكية - الافتراضي) | 'grid' (البطاقات)
  const [sortBy, setSortBy] = useState('default'); // 'default', 'name', 'price_asc', 'price_desc', 'stock_asc', 'stock_desc'
  const [copiedBarcode, setCopiedBarcode] = useState(null);

  const handleCopyBarcode = (code) => {
    if (!code) return;
    try {
      navigator.clipboard.writeText(String(code).trim());
      setCopiedBarcode(code);
      setTimeout(() => setCopiedBarcode(null), 2000);
    } catch (e) {}
  };

  const filteredProducts = products.filter(p => {
    // الأرشيف مخفي افتراضياً — يظهر فقط عند تفعيل عرض الأرشيف
    if (Boolean(p?.isArchived) !== showArchived) return false;
    const matchCat = selectedCatId === 'all' || p.categoryId === selectedCatId;
    const matchQuery = !searchQuery || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.barcode?.includes(searchQuery) ||
      p.factoryBarcode?.includes(searchQuery);

    let matchStock = true;
    const stockNum = Number(p.stock) || 0;
    const minStockNum = Number(p.minStock) || 3;
    if (stockFilter === 'in_stock') matchStock = stockNum > minStockNum;
    else if (stockFilter === 'low_stock') matchStock = stockNum > 0 && stockNum <= minStockNum;
    else if (stockFilter === 'out_of_stock') matchStock = stockNum <= 0;

    return matchCat && matchQuery && matchStock;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name, 'ar');
    } else if (sortBy === 'price_asc') {
      return (Number(a.sellingPrice) || 0) - (Number(b.sellingPrice) || 0);
    } else if (sortBy === 'price_desc') {
      return (Number(b.sellingPrice) || 0) - (Number(a.sellingPrice) || 0);
    } else if (sortBy === 'stock_asc') {
      return (Number(a.stock) || 0) - (Number(b.stock) || 0);
    } else if (sortBy === 'stock_desc') {
      return (Number(b.stock) || 0) - (Number(a.stock) || 0);
    }
    return 0; // الافتراضي
  });

  // الأزرار السريعة (+/-): تعديل بمقدار واحد أثناء الاستلام أو الجرد.
  // لا نطلب سبباً في كل نقرة حتى لا تتعطّل، لكن يُسجَّل القيد كاملاً
  // في سجل التدقيق باسم المستخدم والكمية قبل وبعد.
  const handleQuickStockChange = (p, delta) => {
    if (!canAdjustStock) return denyMsg('تعديل كميات المخزون');
    const newStock = Math.max(0, (Number(p.stock) || 0) + delta);
    // نمرّر الكمية المعروضة أساساً، فيكون المُرسَل للسحابة ±١ بالضبط مهما
    // تغيّرت الكمية الحيّة ببيع متزامن على جهاز آخر
    updateProduct(p.id, { ...p, stock: newStock }, 'تعديل سريع من قائمة المخزون', Number(p.stock) || 0);
  };

  const handleOpenAdd = () => {
    if (!canAdd) return denyMsg('إضافة منتجات');
    setEditingProduct(null);
    setFormData({
      name: '',
      barcode: generateSequentialBarcode(products),
      factoryBarcode: '',
      categoryId: categories[0]?.id || '',
      unit: 'حبة',
      costPrice: '',
      sellingPrice: '',
      stock: '10',
      minStock: '3',
      image: '',
      isService: false
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (p) => {
    if (!canEdit) return denyMsg('تعديل المنتجات');
    setEditingProduct(p);
    setFormData({
      name: p.name,
      barcode: p.barcode || generateSequentialBarcode(products),
      factoryBarcode: p.factoryBarcode || '',
      categoryId: p.categoryId,
      unit: p.unit || 'حبة',
      costPrice: String(p.costPrice || ''),
      sellingPrice: String(p.sellingPrice || ''),
      stock: String(p.stock || 0),
      minStock: String(p.minStock || 3),
      image: p.image || '',
      isService: Boolean(p.isService)
    });
    setIsAddModalOpen(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.sellingPrice) {
      alert('يرجى كتابة اسم المنتج وسعر البيع');
      return;
    }

    if (editingProduct) {
      if (!canEdit) return denyMsg('تعديل المنتجات');

      // تسوية الكمية يدوياً تحتاج سبباً — لأنها أسهل طريقة لإخفاء نقص.
      // السبب يُحفظ في سجل التدقيق مع الكمية قبل وبعد واسم من عدّلها.
      const oldQty = Number(editingProduct.stock) || 0;
      const newQty = Number(formData.stock) || 0;
      let reason = '';
      // الكمية لم تُمسّ: لا نرسلها إطلاقاً. إرسالها كان يجعلها تُقارن بالكمية
      // الحيّة التي ربما نقصت ببيعٍ على جهاز آخر أثناء فتح النافذة، فيُحسب
      // فرق وهمي يُعيد المبيع إلى الرصيد. (نفس ما تفعله شاشة العملاء بالرصيد.)
      let payload = formData;
      if (oldQty === newQty) {
        const { stock, ...withoutStock } = formData;
        payload = withoutStock;
      }
      if (oldQty !== newQty) {
        const diff = newQty - oldQty;
        reason = String(window.prompt(
          `سبب تسوية كمية (${editingProduct.name}) إلزامي:\n\n` +
          `الكمية الحالية: ${oldQty}\n` +
          `الكمية الجديدة: ${newQty}  (${diff > 0 ? '+' : ''}${diff})\n\n` +
          `مثال: جرد فعلي، تالف، هالك، خطأ إدخال سابق، هدية.`,
          ''
        ) || '').trim();
        if (!reason) {
          alert('⚠️ لم يُحفظ التعديل: سبب تسوية الكمية إلزامي.');
          return;
        }
      }
      // oldQty هو ما رآه المستخدم في النموذج — عليه يُقاس الفرق لا على الحيّ
      updateProduct(editingProduct.id, payload, reason, oldQty);
    } else {
      if (!canAdd) return denyMsg('إضافة منتجات');
      addProduct(formData);
    }

    setIsAddModalOpen(false);
  };

  // دالة إرسال وطباعة الملصقات الحرارية الذكية بباركود حقيقي قابل للمسح
  const handlePrintThermalLabels = (product, copies = 1, size = '50x25') => {
    if (!canPrintLabel) return denyMsg('طباعة ملصقات الباركود');
    try {
      printThermalBarcodeLabels({ product, copies, size, storeInfo });
    } catch (err) {
      console.error('Thermal Barcode Print Error:', err);
      window.print();
    }
  };

  const handleDelete = (p) => {
    if (!canDelete) return denyMsg('حذف المنتجات');
    if (confirm(
      `سيُنقل المنتج (${p.name}) إلى الأرشيف.\n\n` +
      `لن يظهر في شاشة البيع ولا في قوائم المخزون، لكنه يبقى محفوظاً ` +
      `حتى لا تفقد الفواتير والتقارير القديمة اسمه وتكلفته.\n\n` +
      `يمكنك استرجاعه لاحقاً من زر (الأرشيف). متابعة؟`
    )) {
      deleteProduct(p.id);
    }
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    addCategory(newCatName.trim());
    setNewCatName('');
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData(prev => ({ ...prev, image: event.target.result }));
    };
    reader.readAsDataURL(file);
  };

  // ===================================================================
  //  إحصائيات المخزون تحسب الأصناف النشطة فقط
  // ===================================================================
  //  الأصناف المؤرشفة لم تعد جزءاً من المخزون العامل: لا تُباع ولا تظهر
  //  في القوائم. احتسابها كان يضخّم عدد الأصناف وقيمة المخزون ويُظهر
  //  عشرات الأصناف "نافذة من المخزون" وهي في الحقيقة مؤرشفة.
  const activeProducts = (products || []).filter(p => !p?.isArchived);
  const totalStockCount = activeProducts.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  const totalInventoryValue = activeProducts.reduce((sum, p) => sum + ((Number(p.sellingPrice) || 0) * (Number(p.stock) || 0)), 0);
  const lowStockCount = activeProducts.filter(p => (Number(p.stock) || 0) > 0 && (Number(p.stock) || 0) <= (Number(p.minStock) || 3)).length;
  const outOfStockCount = activeProducts.filter(p => (Number(p.stock) || 0) <= 0).length;

  return (
    <div className="p-3 max-w-6xl mx-auto space-y-4 pb-24 select-none animate-in fade-in">
      
      {/* رأس الصفحة والمؤشرات السريعة */}
      <div className="bg-gradient-to-r from-[#5B1B47] via-[#481A6E] to-[#6A1D6E] rounded-3xl p-5 text-white shadow-xl border-2 border-pink-400/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-pink-500/20 text-pink-300 flex items-center justify-center border-2 border-pink-400/50 shadow-inner">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-black text-lg text-white flex items-center gap-2">
              <span>دليل المنتجات والمخزون</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 border-2 border-pink-300 text-white font-black">{activeProducts.length} صنف</span>
            </h2>
            <p className="text-xs text-pink-100/90 mt-0.5 font-medium">إدارة الباقات، الفازات، توليد وطباعة الباركود، ومتابعة الجرد الفوري</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* أزرار الإكسيل الذكية */}
          <button
            type="button"
            onClick={() => {
              // الاستيراد الجماعي يُنشئ ويعدّل مئات المنتجات — يحتاج نفس
              // صلاحية الإضافة/التعديل، وكان مفتوحاً لكل من يرى الشاشة.
              if (!canAdd && !canEdit) return denyMsg('استيراد المنتجات من إكسيل');
              setIsExcelImportOpen(true);
            }}
            className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 border-2 border-emerald-300 text-white rounded-2xl text-xs font-black transition flex items-center gap-1.5 active:scale-95 shadow-md"
            title="استيراد وتحديث المنتجات من ملف إكسيل"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
            <span>استيراد إكسيل 📥</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!checkUserPermission(currentUser, 'reports_export')) return denyMsg('تصدير الملفات');
              const res = exportProductsToExcel(filteredProducts, categories, storeInfo?.name || 'بيت الورد');
              setExcelToast(`✅ تم تصدير ${res.count} صنف إلى ملف (${res.fileName}) بنجاح! 🌸`);
              setTimeout(() => setExcelToast(null), 5000);
            }}
            className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 border-2 border-blue-300 text-white rounded-2xl text-xs font-black transition flex items-center gap-1.5 active:scale-95 shadow-md"
            title="تصدير قائمة المنتجات الحالية إلى ملف إكسيل"
          >
            <Download className="w-4 h-4 text-blue-100" />
            <span>تصدير إكسيل 📤</span>
          </button>

          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            className={`px-3.5 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 active:scale-95 shadow-sm border-2 ${
              showArchived
                ? 'bg-slate-800 border-slate-500 text-white'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="المنتجات المؤرشفة تبقى في التقارير التاريخية ولا تظهر في شاشة البيع"
          >
            <span>{showArchived ? 'الرجوع للمنتجات النشطة ↩️' : `الأرشيف 🗄️ (${archivedCount})`}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="px-3.5 py-2.5 bg-pink-800/80 hover:bg-pink-700 border-2 border-pink-300 text-white rounded-2xl text-xs font-bold transition flex items-center gap-1.5 active:scale-95 shadow-sm"
          >
            <FolderPlus className="w-4 h-4 text-pink-200" />
            <span>التصنيفات</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-4 py-2.5 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 text-white rounded-2xl text-xs font-black shadow-lg shadow-pink-600/30 transition flex items-center gap-1.5 active:scale-95 border-2 border-pink-300"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صنف جديد 🌸</span>
          </button>
        </div>
      </div>

      {/* إشعار تصدير/استيراد الإكسيل الذكي */}
      {excelToast && (
        <div className="p-3 bg-gradient-to-r from-emerald-800 to-teal-800 text-white rounded-2xl shadow-md text-xs font-bold text-center animate-in fade-in flex items-center justify-between gap-2 border border-emerald-400/30">
          <span>{excelToast}</span>
          <button onClick={() => setExcelToast(null)} className="text-emerald-200 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* بطاقات مؤشرات المخزون السريعة */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {/* 1. إجمالي عدد الأصناف */}
        <div className="p-3.5 bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-50/70 rounded-2xl border-2 border-blue-300/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-blue-950 text-xs font-black block mb-0.5">إجمالي عدد الأصناف</span>
            <strong className="text-base sm:text-lg font-black text-blue-700 font-mono tracking-tight">{activeProducts.length} صنف</strong>
          </div>
          <span className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center font-black text-base shadow-md shadow-blue-500/25">📦</span>
        </div>

        {/* 2. قيمة المخزون الإجمالية */}
        <div className="p-3.5 bg-gradient-to-br from-emerald-50 via-teal-50 to-green-50/70 rounded-2xl border-2 border-emerald-300/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-emerald-950 text-xs font-black block mb-0.5">قيمة المخزون الإجمالية</span>
            <strong className="text-base sm:text-lg font-black text-emerald-700 font-mono tracking-tight">{formatMoney(totalInventoryValue, storeInfo.currency)}</strong>
          </div>
          <span className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black text-base shadow-md shadow-emerald-500/25">💰</span>
        </div>

        {/* 3. مخزون منخفض (تحذير) */}
        <div 
          onClick={() => setStockFilter('low_stock')}
          className={`p-3.5 rounded-2xl border-2 shadow-sm flex items-center justify-between cursor-pointer transition ${
            stockFilter === 'low_stock' 
              ? 'bg-amber-100/95 border-amber-500 ring-2 ring-amber-400 shadow-md' 
              : 'bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50/70 border-amber-300/90 hover:border-amber-400'
          }`}
        >
          <div>
            <span className="text-amber-950 text-xs font-black block mb-0.5">مخزون منخفض (تحذير)</span>
            <strong className="text-base sm:text-lg font-black text-amber-700 font-mono tracking-tight">{lowStockCount} أصناف</strong>
          </div>
          <span className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-base shadow-md shadow-amber-500/25">⚠️</span>
        </div>

        {/* 4. نفذ من المخزون */}
        <div 
          onClick={() => setStockFilter('out_of_stock')}
          className={`p-3.5 rounded-2xl border-2 shadow-sm flex items-center justify-between cursor-pointer transition ${
            stockFilter === 'out_of_stock' 
              ? 'bg-rose-100/95 border-rose-500 ring-2 ring-rose-400 shadow-md' 
              : 'bg-gradient-to-br from-rose-50 via-pink-50 to-red-50/70 border-rose-300/90 hover:border-rose-400'
          }`}
        >
          <div>
            <span className="text-rose-950 text-xs font-black block mb-0.5">نفذ من المخزون</span>
            <strong className="text-base sm:text-lg font-black text-rose-700 font-mono tracking-tight">{outOfStockCount} أصناف</strong>
          </div>
          <span className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black text-base shadow-md shadow-rose-500/25">❌</span>
        </div>
      </div>

      {/* شريط البحث وتصفية التصنيفات والمخزون */}
      <div className="bg-white rounded-3xl p-3.5 border border-pink-100 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3.5 top-3 text-pink-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم الصنف أو رقم الباركود أو التصنيف..."
              className="w-full pl-3 pr-10 py-2.5 bg-pink-50/40 border border-pink-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white transition"
            />
            {searchQuery && (
              <button 
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-3 text-pink-400 hover:text-pink-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* فلاتر حالة المخزون */}
          <div className="flex gap-1.5 overflow-x-auto text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setStockFilter('all')}
              className={`px-3 py-2 rounded-xl transition ${stockFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              الكل
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('in_stock')}
              className={`px-3 py-2 rounded-xl transition ${stockFilter === 'in_stock' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}`}
            >
              المتوفر 🟢
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('low_stock')}
              className={`px-3 py-2 rounded-xl transition ${stockFilter === 'low_stock' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
            >
              المنخفض ⚠️
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('out_of_stock')}
              className={`px-3 py-2 rounded-xl transition ${stockFilter === 'out_of_stock' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-800 hover:bg-rose-100'}`}
            >
              النافذ ❌
            </button>
          </div>
        </div>

        {/* تصنيفات الأصناف */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedCatId('all')}
            className={`px-3.5 py-2 rounded-2xl font-bold text-xs whitespace-nowrap transition shrink-0 ${
              selectedCatId === 'all'
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-md font-extrabold'
                : 'bg-pink-50/60 text-slate-700 hover:bg-pink-100 border border-pink-100'
            }`}
          >
            جميع الأقسام ({activeProducts.length})
          </button>

          {categories.map(cat => {
            const count = activeProducts.filter(p => p.categoryId === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCatId(cat.id)}
                className={`px-3.5 py-2 rounded-2xl font-bold text-xs whitespace-nowrap transition shrink-0 flex items-center gap-1.5 ${
                  selectedCatId === cat.id
                    ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-md font-extrabold'
                    : 'bg-pink-50/60 text-slate-700 hover:bg-pink-100 border border-pink-100'
                }`}
              >
                <span>{cat.name}</span>
                <span className="text-[10px] opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* شريط التحكم في العرض والفرز وعدد النتائج */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-black text-slate-800 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-pink-600" />
            <span>قائمة أصناف المخزون</span>
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-pink-100/80 text-pink-900 font-extrabold text-[11px] border border-pink-200">
            {sortedProducts.length} صنف
          </span>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* اختيار الترتيب والفرز */}
          <div className="flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-xl border border-pink-100 shadow-2xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-pink-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent font-bold text-slate-700 text-[11px] outline-none cursor-pointer"
            >
              <option value="default">الترتيب: الافتراضي</option>
              <option value="name">الاسم: أ - ي</option>
              <option value="price_asc">السعر: من الأقل للأعلى</option>
              <option value="price_desc">السعر: من الأعلى للأقل</option>
              <option value="stock_asc">المخزون: المنخفض أولاً ⚠️</option>
              <option value="stock_desc">المخزون: الأكثر أولاً 📦</option>
            </select>
          </div>

          {/* زر تبديل طريقة العرض (أسطر ذكية / شبكة بطاقات) */}
          <div className="flex bg-pink-50/80 p-0.5 rounded-xl border border-pink-200">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition flex items-center gap-1 text-[11px] font-black ${
                viewMode === 'table'
                  ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-pink-700'
              }`}
              title="عرض الأسطر الذكية (جدول المخزون)"
            >
              <LayoutList className="w-4 h-4" />
              <span className="hidden sm:inline">أسطر</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition flex items-center gap-1 text-[11px] font-black ${
                viewMode === 'grid'
                  ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-pink-700'
              }`}
              title="عرض شبكة البطاقات"
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">بطاقات</span>
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1. عرض الأسطر الذكية (Smart Rows / Table View) - الافتراضي */}
      {/* ======================================================== */}
      {viewMode === 'table' ? (
        <div className="bg-white rounded-3xl border border-pink-100 shadow-sm overflow-hidden divide-y divide-pink-50 text-xs">
          
          {/* ترويسة الجدول على الشاشات المتوسطة والكبيرة */}
          <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-4 py-3 bg-gradient-to-r from-pink-50/90 via-purple-50/50 to-slate-50 text-[11px] font-black text-slate-700 border-b border-pink-100 items-center">
            <div className="col-span-4 flex items-center gap-2">
              <span className="text-pink-600">🌸</span>
              <span>الصنف والقسم</span>
            </div>
            <div className="col-span-2 text-center">الباركود</div>
            <div className="col-span-2 text-center">الأسعار والأرباح</div>
            <div className="col-span-2 text-center">المخزون والجرد السريع</div>
            <div className="col-span-2 text-left pl-2">الإجراءات</div>
          </div>

          {/* محتوى الأسطر */}
          {sortedProducts.length === 0 ? (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <span className="text-3xl block">🔍</span>
              <p className="font-bold">لا توجد منتجات مطابقة لخيارات البحث الحالية</p>
            </div>
          ) : (
            sortedProducts.map((product, idx) => {
              const stockNum = Number(product.stock) || 0;
              const minStockNum = Number(product.minStock) || 3;
              const isOutOfStock = !product.isService && stockNum <= 0;
              const isLowStock = !product.isService && !isOutOfStock && stockNum <= minStockNum;

              const sellPrice = Number(product.sellingPrice) || 0;
              const costPrice = canViewCost ? (Number(product.costPrice) || 0) : 0;
              const profitMargin = sellPrice > 0 && costPrice > 0 
                ? Math.round(((sellPrice - costPrice) / sellPrice) * 100) 
                : null;
              const profitAmount = sellPrice > 0 && costPrice > 0 ? (sellPrice - costPrice) : null;

              const catObj = categories.find(c => c.id === product.categoryId);

              return (
                <div
                  key={product.id}
                  className={`p-3 sm:p-3.5 transition flex flex-col lg:grid lg:grid-cols-12 gap-2.5 lg:gap-3 lg:items-center hover:bg-pink-50/30 ${
                    isOutOfStock 
                      ? 'bg-rose-50/20' 
                      : isLowStock 
                        ? 'bg-amber-50/20' 
                        : idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'
                  }`}
                >
                  {/* 1. عمود الصنف والصورة والقسم (Col 4) */}
                  <div className="lg:col-span-4 flex items-center gap-2.5 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-pink-50 overflow-hidden shrink-0 border border-pink-100 flex items-center justify-center shadow-inner relative">
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg">🌸</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 
                          onClick={() => handleOpenEdit(product)}
                          className="font-black text-xs text-slate-900 hover:text-pink-600 transition cursor-pointer truncate max-w-[200px]" 
                          title={product.name}
                        >
                          {product.name}
                        </h4>
                        {product.isService && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-purple-100 text-purple-700 rounded-md font-bold shrink-0">
                            خدمة ⚡
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="font-bold text-pink-700 bg-pink-50 px-1.5 py-0.2 rounded-md border border-pink-100">
                          {catObj?.name || 'غير مصنف'}
                        </span>
                        <span className="text-slate-400">الوحدة: {product.unit || 'حبة'}</span>
                      </div>
                    </div>
                  </div>

                  {/* 2. عمود الباركود (Col 2) */}
                  <div className="lg:col-span-2 flex lg:flex-col lg:items-center justify-between lg:justify-center gap-1">
                    <span className="text-[10px] text-slate-400 lg:hidden font-bold">الباركود:</span>
                    <div className="flex flex-col gap-1 items-end lg:items-center">
                      {product.barcode ? (
                        <div className="flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200">
                          <Barcode className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="font-mono text-[11px] font-bold text-slate-700 truncate max-w-[110px]">
                            {product.barcode}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyBarcode(product.barcode)}
                            className="text-slate-400 hover:text-pink-600 transition p-0.5"
                            title="نسخ الباركود"
                          >
                            {copiedBarcode === product.barcode ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-italic">بدون باركود</span>
                      )}

                      {product.factoryBarcode && (
                        <div className="flex items-center gap-1 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-200 text-blue-800 text-[10px] font-mono" title="باركود المصنع / الكرتون الوارد">
                          <span>🏭</span>
                          <span className="truncate max-w-[95px] font-bold">{product.factoryBarcode}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. عمود الأسعار والأرباح (Col 2) */}
                  <div className="lg:col-span-2 flex lg:flex-col lg:items-center justify-between lg:justify-center gap-0.5">
                    <span className="text-[10px] text-slate-400 lg:hidden font-bold">الأسعار:</span>
                    <div className="text-right lg:text-center space-y-0.5">
                      <div className="flex items-center gap-1 lg:justify-center">
                        <span className="font-black text-pink-700 text-xs sm:text-sm">
                          {formatMoney(product.sellingPrice, storeInfo.currency)}
                        </span>
                        {profitMargin !== null && profitMargin > 0 && (
                          <span className="text-[9px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-md">
                            +{profitMargin}%
                          </span>
                        )}
                      </div>
                      {costPrice > 0 && (
                        <span className="text-[10px] text-slate-400 block font-mono">
                          التكلفة: {formatMoney(costPrice, storeInfo.currency)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 4. عمود المخزون والتحكم السريع (Col 2) */}
                  <div className="lg:col-span-2 flex lg:flex-col lg:items-center justify-between lg:justify-center gap-1">
                    <span className="text-[10px] text-slate-400 lg:hidden font-bold">المخزون:</span>
                    {product.isService ? (
                      <span className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-xl font-black text-[11px] border border-purple-200">
                        خدمة غير مقيدة
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQuickStockChange(product, -1)}
                          className="w-6 h-6 rounded-lg bg-white hover:bg-rose-100 text-rose-700 font-black flex items-center justify-center border border-slate-200 shadow-2xs text-xs active:scale-95 transition"
                          title="إنقاص المخزون بواحد (-1)"
                        >
                          -
                        </button>
                        
                        <span className={`font-black text-xs px-2 py-1 rounded-xl text-center min-w-[55px] shadow-2xs ${
                          isOutOfStock
                            ? 'bg-rose-100 text-rose-700 border border-rose-200'
                            : isLowStock
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {stockNum} <span className="text-[9px] font-bold opacity-80">{product.unit || 'حبة'}</span>
                        </span>

                        <button
                          type="button"
                          onClick={() => handleQuickStockChange(product, 1)}
                          className="w-6 h-6 rounded-lg bg-white hover:bg-emerald-100 text-emerald-700 font-black flex items-center justify-center border border-slate-200 shadow-2xs text-xs active:scale-95 transition"
                          title="زيادة المخزون بواحد (+1)"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 5. عمود الإجراءات (Col 2) */}
                  <div className="lg:col-span-2 flex items-center justify-end lg:justify-start gap-1 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    <button
                      type="button"
                      onClick={() => setBarcodePrintModalProduct(product)}
                      className="px-2.5 py-1.5 bg-pink-50 hover:bg-pink-100 text-pink-700 rounded-xl font-bold text-[11px] flex items-center gap-1 transition active:scale-95 border border-pink-200"
                      title="طباعة ملصق الباركود الحراري"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">باركود</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(product)}
                      className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl font-bold text-[11px] flex items-center gap-1 transition active:scale-95 border border-slate-200"
                      title="تعديل الصنف"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => (product.isArchived ? restoreProduct(product.id) : handleDelete(product))}
                      className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-bold text-[11px] transition active:scale-95 border border-rose-200"
                      title="حذف الصنف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                </div>
              );
            })
          )}

        </div>
      ) : (
        /* ======================================================== */
        /* 2. عرض شبكة البطاقات (Cards Grid View) */
        /* ======================================================== */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {sortedProducts.map(product => {
            const stockNum = Number(product.stock) || 0;
            const minStockNum = Number(product.minStock) || 3;
            const isOutOfStock = !product.isService && stockNum <= 0;
            const isLowStock = !product.isService && !isOutOfStock && stockNum <= minStockNum;

            const sellPrice = Number(product.sellingPrice) || 0;
            const costPrice = canViewCost ? (Number(product.costPrice) || 0) : 0;
            const profitMargin = sellPrice > 0 && costPrice > 0 
              ? Math.round(((sellPrice - costPrice) / sellPrice) * 100) 
              : null;

            return (
              <div
                key={product.id}
                className={`bg-white rounded-3xl p-4 border transition flex flex-col justify-between space-y-3 ${
                  isOutOfStock 
                    ? 'border-rose-200 bg-rose-50/20' 
                    : isLowStock 
                      ? 'border-amber-200 bg-amber-50/20' 
                      : 'border-pink-100 hover:shadow-md'
                }`}
              >
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-pink-50 overflow-hidden shrink-0 border border-pink-100 relative shadow-inner flex items-center justify-center">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">🌸</span>
                    )}
                    {profitMargin !== null && profitMargin > 0 && (
                      <span className="absolute bottom-0 right-0 left-0 bg-slate-900/80 backdrop-blur-sm text-emerald-300 text-[9px] font-black text-center py-0.5">
                        ربح {profitMargin}%
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <h4 className="font-black text-xs text-slate-900 truncate" title={product.name}>{product.name}</h4>
                    <span className="text-[10px] text-pink-600 font-bold block">{categories.find(c => c.id === product.categoryId)?.name || 'غير مصنف'}</span>
                    
                    {product.barcode && (
                      <span className="text-[10px] font-mono text-slate-500 block truncate flex items-center gap-1">
                        <Barcode className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{product.barcode}</span>
                      </span>
                    )}
                    {product.factoryBarcode && (
                      <span className="text-[9px] font-mono text-blue-700 bg-blue-50 px-1 py-0.5 rounded border border-blue-200 block truncate flex items-center gap-1" title="باركود المصنع">
                        <span>🏭</span>
                        <span>{product.factoryBarcode}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* تفاصيل الأسعار وتعديل المخزون المباشر */}
                <div className="pt-2 border-t border-pink-50 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">سعر البيع</span>
                      <span className="font-black text-pink-700 text-sm">{formatMoney(product.sellingPrice, storeInfo.currency)}</span>
                    </div>

                    {costPrice > 0 && (
                      <div className="text-left">
                        <span className="text-[10px] text-slate-400 block">التكلفة</span>
                        <span className="font-bold text-slate-500 text-xs">{formatMoney(costPrice, storeInfo.currency)}</span>
                      </div>
                    )}
                  </div>

                  {/* شريط التحكم السريع بالرصيد بالمخزون */}
                  <div className="p-1.5 rounded-2xl bg-pink-50/60 border border-pink-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-600">المخزون:</span>
                    {product.isService ? (
                      <span className="text-[10px] font-bold text-purple-700">خدمة</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQuickStockChange(product, -1)}
                          className="w-6 h-6 rounded-lg bg-white hover:bg-rose-100 text-rose-700 font-black flex items-center justify-center border border-pink-200 shadow-sm text-xs active:scale-95"
                          title="إنقاص المخزون بواحد"
                        >
                          -
                        </button>
                        <span className={`font-black text-xs px-2 py-0.5 rounded-lg ${
                          isOutOfStock 
                            ? 'bg-rose-100 text-rose-700' 
                            : isLowStock 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {stockNum} {product.unit || 'حبة'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQuickStockChange(product, 1)}
                          className="w-6 h-6 rounded-lg bg-white hover:bg-emerald-100 text-emerald-700 font-black flex items-center justify-center border border-pink-200 shadow-sm text-xs active:scale-95"
                          title="زيادة المخزون بواحد"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* أزرار الإجراءات (طباعة باركود، تعديل، حذف) */}
                <div className="pt-1 border-t border-pink-50 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => setBarcodePrintModalProduct(product)}
                    className="p-2 bg-pink-50 hover:bg-pink-100 text-pink-700 rounded-xl text-xs font-bold flex items-center gap-1 transition flex-1 justify-center active:scale-95"
                    title="طباعة ملصق الباركود الحراري"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>باركود</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(product)}
                    className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition flex-1 justify-center active:scale-95"
                    title="تعديل الصنف"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>تعديل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => (product.isArchived ? restoreProduct(product.id) : handleDelete(product))}
                    className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold transition px-2.5 active:scale-95"
                    title="حذف الصنف"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* نافذة إضافة / تعديل صنف */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-5 border border-pink-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-pink-100">
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-pink-600" />
                <span>{editingProduct ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد'}</span>
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-800 block mb-1">اسم الصنف / الباقة *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: باقة جوري أحمر ملكي"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2.5 bg-pink-50/30 border border-pink-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>

              {/* حقل الباركود مع زر التوليد التلقائي والمعاينة المباشرة */}
              <div>
                <label className="font-bold text-slate-800 block mb-1">رقم الباركود (EAN-13 / كود المنتج):</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Barcode className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="628123456789"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                      className="w-full pl-3 pr-9 py-2.5 bg-slate-50 border border-pink-200 rounded-xl font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, barcode: generateSequentialBarcode(products) })}
                    className="px-3 py-2.5 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow-sm transition active:scale-95 shrink-0"
                    title="توليد كود باركود عشوائي فريد"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>توليد باركود 🪄</span>
                  </button>
                </div>

                {/* معاينة شفرة الباركود الفورية */}
                {formData.barcode && (
                  <div className="mt-2 p-2 bg-slate-50 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center">
                    <BarcodeSvgVisual code={formData.barcode} height={30} textSize={9} />
                  </div>
                )}
              </div>

              {/* حقل باركود المصنع والمورد البديل */}
              <div className="p-3 bg-blue-50/60 rounded-2xl border border-blue-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-blue-950 flex items-center gap-1.5 text-xs">
                    <span>🏭</span>
                    <span>باركود المصنع / الكرتون الوارد (اختياري):</span>
                  </label>
                  <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                    شفرة المصدر البديلة
                  </span>
                </div>
                <div className="relative">
                  <Barcode className="w-4 h-4 absolute right-3 top-3 text-blue-500" />
                  <input
                    type="text"
                    placeholder="امسح باركود كرتون أو علبة المصنع هنا..."
                    value={formData.factoryBarcode || ''}
                    onChange={(e) => setFormData({ ...formData, factoryBarcode: e.target.value })}
                    className="w-full pl-3 pr-9 py-2.5 bg-white border border-blue-200 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                  />
                </div>
                <p className="text-[10px] text-blue-800/90 leading-relaxed">
                  💡 عند إدخال باركود المصنع، سيتعرف الكاشير على الصنف فوراً سواء مسح باركودك الخاص أعلاه أو مسح باركود كرتون المصنع!
                </p>
                {formData.factoryBarcode && (
                  <div className="mt-1 p-2 bg-white rounded-xl border border-dashed border-blue-200 flex flex-col items-center justify-center">
                    <BarcodeSvgVisual code={formData.factoryBarcode} height={26} textSize={8} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">التصنيف:</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-pink-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:outline-none"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-800 block mb-1">الوحدة:</label>
                  <input
                    type="text"
                    placeholder="باقة، حبة، فازة، طقم"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-pink-200 rounded-xl font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">سعر البيع (شامل الضريبة) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="120.00"
                    value={formData.sellingPrice}
                    onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                    className="w-full px-3 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl font-black text-pink-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-pink-500 text-center"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-800 block mb-1">سعر التكلفة (اختياري)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="45.00"
                    value={formData.costPrice}
                    onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-pink-200 rounded-xl font-bold text-slate-800 text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">الكمية المتوفرة بالمخزون:</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-pink-200 rounded-xl font-black text-slate-900 text-sm text-center"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-800 block mb-1">حد إعادة الطلب (تنبيه النواقص):</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.minStock}
                    onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-pink-200 rounded-xl font-bold text-slate-800 text-center"
                  />
                </div>
              </div>

              {/* صورة الصنف */}
              <div>
                <label className="font-bold text-slate-800 block mb-1">صورة الصنف (اختياري):</label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-pink-50 border border-pink-200 flex items-center justify-center overflow-hidden shrink-0">
                    {formData.image ? (
                      <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-pink-300" />
                    )}
                  </div>

                  <label className="flex-1 px-3 py-2.5 bg-slate-50 hover:bg-pink-50 border border-dashed border-pink-300 rounded-xl text-center cursor-pointer text-xs font-bold text-pink-700 transition">
                    <span>انقر لاختيار صورة من جهازك 🖼️</span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>

                  {formData.image && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, image: '' })}
                      className="p-2.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-pink-100">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 text-white rounded-xl font-black text-xs shadow-md transition active:scale-95"
                >
                  {editingProduct ? 'حفظ التعديلات' : 'إضافة الصنف للدليل 🌸'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة طباعة ملصق الباركود الحراري الدقيق */}
      {barcodePrintModalProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-5 border border-pink-100 space-y-4 font-cairo">
            <div className="flex items-center justify-between pb-2 border-b border-pink-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-pink-100 text-pink-700 flex items-center justify-center">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">طباعة ملصق الباركود الحراري 🏷️</h3>
                  <p className="text-[10px] text-slate-500">متوافق مع جميع طابعات الباركود الحرارية (Xprinter / Zebra)</p>
                </div>
              </div>
              <button onClick={() => setBarcodePrintModalProduct(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* اختيار مقاس الملصق الحراري */}
            <div className="space-y-1.5 p-2.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">مقاس وقالب الملصق:</span>
                <span className="text-[10px] text-pink-700 font-bold bg-pink-100/60 px-2 py-0.5 rounded-md">حراري / ليزر</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {[
                  { id: '50x25', label: '50×25 مم (قياسي)' },
                  { id: '40x30', label: '40×30 مم' },
                  { id: '38x25', label: '38×25 مم' },
                  { id: '60x40', label: '60×40 مم' },
                  { id: '70x35', label: '70×35 مم' },
                  { id: '80x50', label: '80×50 مم' },
                  { id: 'a4_3x8', label: 'ورق A4 لاصق (24)' }
                ].map(sz => (
                  <button
                    key={sz.id}
                    type="button"
                    onClick={() => setSelectedLabelSize(sz.id)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition ${
                      selectedLabelSize === sz.id
                        ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-xs font-black'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>
            </div>

            {/* معاينة الملصق المطبوع الحية والدقيقة */}
            <div 
              style={{ fontFamily: "'Tahoma', 'Segoe UI', 'Cairo', Arial, 'Simplified Arabic', sans-serif" }}
              className="p-4 bg-white rounded-2xl border-2 border-dashed border-slate-300 shadow-inner flex flex-col items-center justify-between text-center space-y-1.5 min-h-[140px]"
            >
              <span className="font-black text-xs text-slate-900 block truncate max-w-full tracking-tight">
                {storeInfo.barcodeLabelSettings?.customStoreName || storeInfo.name || 'بيت الورد للزهور والهدايا'} 🌸
              </span>
              
              <span className="font-black text-xs text-pink-800 block truncate max-w-full">
                {barcodePrintModalProduct.name}
              </span>

              {/* الباركود المتجه الدقيق */}
              <div className="w-full py-1">
                <BarcodeSvgVisual 
                  code={barcodePrintModalProduct.barcode || '628100234567'} 
                  height={34} 
                  textSize={10} 
                />
              </div>

              {/* السعر وشامل الضريبة */}
              <div className="pt-1 border-t border-slate-200 w-full flex items-center justify-between px-2 text-xs font-black">
                <span className="text-slate-900 text-sm font-mono">
                  {formatMoney(barcodePrintModalProduct.sellingPrice, storeInfo.currency)}
                </span>
                <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-300">
                  {storeInfo.taxInclusive !== false ? 'شامل الضريبة' : ''}
                </span>
              </div>

              {storeInfo.barcodeLabelSettings?.showCustomFooter !== false && (
                <div className="text-[9px] text-slate-400 font-bold">
                  {storeInfo.barcodeLabelSettings?.customFooterText || 'بيت الورد - جودة وأناقة 🌸'}
                </div>
              )}
            </div>

            {/* عدد النسخ المطلوبة والخيارات الذكية */}
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 bg-pink-50/50 rounded-2xl border border-pink-100 text-xs">
                <span className="font-bold text-slate-800">عدد ملصقات الطباعة:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={barcodeCopies}
                    onChange={(e) => setBarcodeCopies(Math.max(1, Number(e.target.value) || 1))}
                    className="w-16 px-2 py-1.5 bg-white border border-pink-200 rounded-xl font-mono font-black text-center text-slate-900 text-sm"
                  />
                  <span className="text-[11px] font-bold text-pink-700">ملصق</span>
                </div>
              </div>

              {/* أزرار سريعة للعدد + زر رصيد المخزون الذكي */}
              <div className="flex flex-wrap gap-1 justify-center text-xs">
                {barcodePrintModalProduct.stock > 0 && (
                  <button
                    type="button"
                    onClick={() => setBarcodeCopies(Number(barcodePrintModalProduct.stock))}
                    className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 rounded-xl font-black text-[10px] transition active:scale-95 flex items-center gap-1"
                  >
                    <span>📦 بعدد المخزون ({barcodePrintModalProduct.stock})</span>
                  </button>
                )}
                {[1, 2, 5, 10, 20, 50, 100].map(cnt => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setBarcodeCopies(cnt)}
                    className={`px-2.5 py-1 rounded-xl font-bold text-[10px] transition ${
                      barcodeCopies === cnt ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>

            {/* أزرار الطباعة والإغلاق */}
            <div className="flex items-center gap-2 pt-2 border-t border-pink-100">
              <button
                type="button"
                onClick={() => handlePrintThermalLabels(barcodePrintModalProduct, barcodeCopies, selectedLabelSize)}
                className="flex-1 py-3 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 text-white rounded-2xl font-black text-xs shadow-lg shadow-pink-600/20 transition active:scale-95 flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>إرسال للطابعة الحرارية ({barcodeCopies} ملصق) 🖨️</span>
              </button>
              <button
                type="button"
                onClick={() => setBarcodePrintModalProduct(null)}
                className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة إدارة التصنيفات */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-5 border border-pink-100 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-pink-100">
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-pink-600" />
                <span>إدارة تصنيفات الأزهار والهدايا</span>
              </h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="اسم التصنيف الجديد..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-50 border border-pink-200 rounded-xl text-xs font-bold"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="px-3.5 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-bold text-xs shadow transition active:scale-95"
              >
                إضافة
              </button>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 text-xs">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between p-2 rounded-xl bg-pink-50/40 border border-pink-100">
                  <span className="font-bold text-slate-800">{cat.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`هل أنت متأكد من حذف تصنيف (${cat.name})؟`)) {
                        deleteCategory(cat.id);
                      }
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* نافذة استيراد وتحديث المنتجات من ملف إكسيل */}
      <ExcelImportModal
        isOpen={isExcelImportOpen}
        onClose={() => setIsExcelImportOpen(false)}
        categories={categories}
        products={products}
        addCategory={addCategory}
        addProduct={addProduct}
        updateProduct={updateProduct}
        importProductsBatch={importProductsBatch}
        storeInfo={storeInfo}
        onImportComplete={(report) => {
          setExcelToast(`✅ تم استيراد ${report.addedCount} صنف جديد وتحديث ${report.updatedCount} صنف بنجاح! 🌸`);
          setTimeout(() => setExcelToast(null), 6000);
        }}
      />

    </div>
  );
};
