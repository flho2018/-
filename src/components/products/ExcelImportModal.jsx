import React, { useState, useRef } from 'react';
import { X, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { parseProductsExcelFile, generateProductsExcelTemplate } from '../../utils/excelHelper';
import { useApp } from '../../context/AppContext';
import { checkUserPermission } from '../../utils/permissions';


export const ExcelImportModal = ({ 
  isOpen, 
  onClose, 
  categories = [], 
  products = [], 
  onImportComplete,
  addCategory,
  addProduct,
  updateProduct,
  importProductsBatch,
  storeInfo
}) => {
  const { currentUser } = useApp();
  const [file, setFile] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [parseError, setParseError] = useState(null);

  // خيارات الاستيراد
  const [updateExisting, setUpdateExisting] = useState(true);
  const [autoCreateCategories, setAutoCreateCategories] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importReport, setImportReport] = useState(null);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setParseError(null);
    setParseResult(null);
    setImportReport(null);
    setIsParsing(true);

    try {
      const result = await parseProductsExcelFile(selectedFile, categories, products);
      if (result.success) {
        setParseResult(result);
      } else {
        setParseError(result.error || 'تعذر قراءة بيانات الملف.');
      }
    } catch (err) {
      setParseError('حدث خطأ أثناء معالجة ملف الإكسيل.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // تنفيذ عملية الاستيراد وحفظ المنتجات والأقسام
  const handleExecuteImport = async () => {
    if (!parseResult || !parseResult.validItems || parseResult.validItems.length === 0) return;

    // الحارس الفعلي عند التنفيذ — يحمي مهما كان مسار فتح النافذة
    if (!checkUserPermission(currentUser, 'products_add') && !checkUserPermission(currentUser, 'products_edit')) {
      alert('⛔ ليس لديك صلاحية استيراد أو تعديل المنتجات.\nتُمنح من: الإعدادات ← المستخدمون ← الصلاحيات.');
      return;
    }

    setIsImporting(true);
    let addedCount = 0;
    let updatedCount = 0;
    let createdCatCount = 0;

    try {
      // 1. خريطة الأقسام الحالية
      // نفس حماية excelHelper: تصنيف بلا اسم كان يُفشل الاستيراد كله،
      // و__proto__ كمفتاح يُربك فحص الوجود.
      const catMap = Object.create(null);
      (categories || []).forEach(c => {
        const nm = String(c?.name ?? '').trim().toLowerCase();
        if (nm && nm !== '__proto__' && nm !== 'constructor') catMap[nm] = c.id;
      });

      const newCategoriesList = [];

      // 2. إنشاء الأقسام الجديدة تلقائياً إذا كانت مفعلة
      if (autoCreateCategories && parseResult.newCategories && parseResult.newCategories.length > 0) {
        parseResult.newCategories.forEach((catName, idx) => {
          const trimmed = catName.trim();
          if (trimmed && !catMap[trimmed.toLowerCase()]) {
            const newCatId = `cat-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`;
            const newCat = {
              id: newCatId,
              name: trimmed,
              icon: '🌸',
              color: '#EC4899'
            };
            newCategoriesList.push(newCat);
            catMap[trimmed.toLowerCase()] = newCatId;
            createdCatCount++;
          }
        });
      }

      const newProductsList = [];
      const updatedProductsList = [];

      // 3. إضافة وتحديث المنتجات
      parseResult.validItems.forEach((item, idx) => {
        const catId = catMap[item.categoryName.trim().toLowerCase()] || categories[0]?.id || 'default';

        if (item.isExisting && item.existingProduct) {
          if (updateExisting) {
            updatedProductsList.push({
              ...item.existingProduct,
              name: item.name,
              categoryId: catId,
              unit: item.unit || item.existingProduct.unit || 'حبة',
              costPrice: Number(item.costPrice),
              sellingPrice: Number(item.sellingPrice),
              stock: item.isService ? 9999 : Number(item.stock),
              minStock: Number(item.minStock),
              isService: item.isService,
              notes: item.notes || item.existingProduct.notes || ''
            });
            updatedCount++;
          }
        } else {
          newProductsList.push({
            id: `prod-${Date.now()}-${idx}-${Math.floor(Math.random() * 100000)}`,
            name: item.name,
            barcode: item.barcode,
            categoryId: catId,
            unit: item.unit || 'حبة',
            costPrice: Number(item.costPrice),
            sellingPrice: Number(item.sellingPrice),
            stock: item.isService ? 9999 : Number(item.stock),
            minStock: Number(item.minStock),
            isService: item.isService,
            notes: item.notes || ''
          });
          addedCount++;
        }
      });

      if (typeof importProductsBatch === 'function') {
        importProductsBatch(newProductsList, updatedProductsList, newCategoriesList);
      } else {
        newCategoriesList.forEach(c => addCategory && addCategory(c));
        updatedProductsList.forEach(p => updateProduct && updateProduct(p.id, p));
        newProductsList.forEach(p => addProduct && addProduct(p));
      }

      const report = {
        total: parseResult.validItems.length,
        addedCount,
        updatedCount,
        createdCatCount
      };

      setImportReport(report);
      if (onImportComplete) {
        onImportComplete(report);
      }
    } catch (err) {
      console.error('Import Execution Error:', err);
      setParseError('حدث خطأ أثناء حفظ المنتجات في قاعدة البيانات.');
    } finally {
      setIsImporting(false);
    }
  };

  const newItemsCount = parseResult?.validItems?.filter(i => !i.isExisting).length || 0;
  const existingItemsCount = parseResult?.validItems?.filter(i => i.isExisting).length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-pink-200 animate-in zoom-in-95 max-h-[92vh] flex flex-col text-slate-800 text-xs">
        
        {/* رأس النافذة */}
        <div className="p-4 bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base">استيراد وتحديث المنتجات من ملف إكسيل (Excel)</h3>
              <p className="text-[10px] text-emerald-200">إضافة دفعات المنتجات الكبيرة وتحديث الأسعار والمخزون بضغطة زر</p>
            </div>
          </div>

          <button 
            type="button" 
            onClick={onClose} 
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* جسم النافذة */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          
          {/* نجاح الاستيراد */}
          {importReport ? (
            <div className="p-5 bg-emerald-50 rounded-3xl border border-emerald-200 text-center space-y-3 animate-in zoom-in-95">
              <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-emerald-600/30">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="font-black text-base text-emerald-950">اكتمل الاستيراد والتحديث بنجاح! 🌸</h4>
                <p className="text-xs text-emerald-700 font-medium mt-1">تمت معالجة وتحديث قاعدة بيانات المنتجات والمخزون</p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs pt-2">
                <div className="p-3 bg-white rounded-2xl border border-emerald-200">
                  <span className="text-[10px] text-slate-500 block">منتجات جديدة أضيفت:</span>
                  <strong className="text-base font-black text-emerald-700 font-mono">+{importReport.addedCount}</strong>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-emerald-200">
                  <span className="text-[10px] text-slate-500 block">منتجات تم تحديثها:</span>
                  <strong className="text-base font-black text-blue-700 font-mono">{importReport.updatedCount}</strong>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-emerald-200">
                  <span className="text-[10px] text-slate-500 block">أقسام جديدة أُنشئت:</span>
                  <strong className="text-base font-black text-purple-700 font-mono">{importReport.createdCatCount}</strong>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition active:scale-95"
                >
                  الرجوع لشاشة المنتجات ✅
                </button>
              </div>
            </div>
          ) : !parseResult ? (
            /* مرحلة 1: اختيار ورفع الملف */
            <div className="space-y-4">
              
              {/* منطقة سحب وإفلات الملف */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="p-8 border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/70 rounded-3xl text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 group"
              >
                <div className="w-16 h-16 rounded-2xl bg-white shadow-md border border-emerald-200 flex items-center justify-center group-hover:scale-105 transition text-emerald-600">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="font-black text-sm text-slate-900">اضغط لاختيار ملف إكسيل أو اسحبه وأفلته هنا</h4>
                  <p className="text-[11px] text-slate-500 mt-1">يدعم ملفات الإكسيل بصيغ: (.xlsx / .xls / .csv)</p>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => handleFileSelect(e.target.files?.[0])}
                  className="hidden"
                />
              </div>

              {/* خطأ في القراءة */}
              {parseError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-rose-800 font-bold">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* شريط تنزيل النموذج الإرشادي الفارغ */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📋</span>
                  <div>
                    <strong className="text-xs font-bold text-slate-800 block">هل تحتاج إلى نموذج إكسيل فارغ جاهز للتعبئة؟</strong>
                    <span className="text-[10px] text-slate-500">يحتوي على الأعمدة المطلوبة وعينات توضيحية لسهولة التعبئة</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => generateProductsExcelTemplate(categories, storeInfo?.name || 'بيت الورد')}
                  className="px-3 py-2 bg-white hover:bg-pink-50 text-pink-700 hover:text-pink-800 border border-pink-200 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shrink-0 shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تنزيل النموذج 📥</span>
                </button>
              </div>
            </div>
          ) : (
            /* مرحلة 2: معاينة المنتجات وتأكيد الاستيراد */
            <div className="space-y-4 animate-in fade-in">
              
              {/* بطاقات ملخص القراءة */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 bg-emerald-50 rounded-2xl border border-emerald-200 text-center">
                  <span className="text-[10px] text-emerald-800 block font-bold">إجمالي الأصناف:</span>
                  <strong className="text-base font-black text-emerald-900 font-mono">{parseResult.validItems.length}</strong>
                </div>

                <div className="p-2.5 bg-blue-50 rounded-2xl border border-blue-200 text-center">
                  <span className="text-[10px] text-blue-800 block font-bold">أصناف جديدة:</span>
                  <strong className="text-base font-black text-blue-900 font-mono">+{newItemsCount}</strong>
                </div>

                <div className="p-2.5 bg-amber-50 rounded-2xl border border-amber-200 text-center">
                  <span className="text-[10px] text-amber-800 block font-bold">أصناف ستحدث:</span>
                  <strong className="text-base font-black text-amber-900 font-mono">{existingItemsCount}</strong>
                </div>

                <div className="p-2.5 bg-purple-50 rounded-2xl border border-purple-200 text-center">
                  <span className="text-[10px] text-purple-800 block font-bold">أقسام جديدة:</span>
                  <strong className="text-base font-black text-purple-900 font-mono">{parseResult.newCategories.length}</strong>
                </div>
              </div>

              {/* خيارات الاستيراد الذكية */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <span className="font-black text-slate-800 block text-xs">خيارات الاستيراد والمعالجة:</span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={updateExisting}
                      onChange={e => setUpdateExisting(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span>تحديث المنتجات إذا تطابق الباركود</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={autoCreateCategories}
                      onChange={e => setAutoCreateCategories(e.target.checked)}
                      className="w-4 h-4 text-purple-600 rounded"
                    />
                    <span>إنشاء الأقسام والتصنيفات الجديدة تلقائياً</span>
                  </label>
                </div>
              </div>

              {/* جدول معاينة أولية للأصناف */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 text-xs">معاينة الأصناف في الملف (أول 8 أصناف):</span>
                  <span className="text-[10px] text-slate-400 font-mono">{parseResult.fileName}</span>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-right text-[11px] border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-black sticky top-0">
                      <tr>
                        <th className="p-2 border-b">الحالة</th>
                        <th className="p-2 border-b">الباركود</th>
                        <th className="p-2 border-b">اسم المنتج</th>
                        <th className="p-2 border-b">القسم</th>
                        <th className="p-2 border-b text-center">التكلفة</th>
                        <th className="p-2 border-b text-center">سعر البيع</th>
                        <th className="p-2 border-b text-center">الكمية</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {parseResult.validItems.slice(0, 8).map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                              item.isExisting 
                                ? 'bg-amber-100 text-amber-800' 
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {item.isExisting ? 'تحديث 🔄' : 'جديد ✨'}
                            </span>
                          </td>
                          <td className="p-2 font-mono text-slate-600">{item.barcode}</td>
                          <td className="p-2 font-bold text-slate-900">{item.name}</td>
                          <td className="p-2 text-slate-600">{item.categoryName}</td>
                          <td className="p-2 text-center font-mono">{item.costPrice.toFixed(2)}</td>
                          <td className="p-2 text-center font-mono font-bold text-emerald-700">{item.sellingPrice.toFixed(2)}</td>
                          <td className="p-2 text-center font-bold">{item.isService ? 'خدمة' : item.stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* أزرار التنفيذ والرجوع */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setParseResult(null);
                    setParseError(null);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition text-xs"
                >
                  اختيار ملف آخر ↺
                </button>

                <button
                  type="button"
                  onClick={handleExecuteImport}
                  disabled={isImporting}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 text-white rounded-xl font-black text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition active:scale-95 disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري استيراد وحفظ المنتجات...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>تأكيد استيراد {parseResult.validItems.length} منتج 🚀</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
