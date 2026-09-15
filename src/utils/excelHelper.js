import * as XLSX from 'xlsx';
import { generateSequentialBarcode } from './helpers';

// تصدير قائمة المنتجات الحالية إلى ملف إكسيل (.xlsx) منسق واحترافي
export const exportProductsToExcel = (products = [], categories = [], storeName = 'بيت الورد') => {
  try {
    const catMap = Object.create(null);
    categories.forEach(c => { if (c && c.id) catMap[c.id] = c.name; });

    // تحييد حقن الصيَغ: خلية نصية تبدأ بـ = + - @ (أو tab/CR) تُنفَّذ كصيغة
    // عند فتح الملف في Excel. نسبق الأبوستروف حتى تُعامَل كنص عادي.
    const csvSafe = (v) => {
      const s = String(v ?? '');
      return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    };

    const rows = products.map(p => ({
      'الباركود': csvSafe(p.barcode || ''),
      'باركود المصنع': csvSafe(p.factoryBarcode || ''),
      'اسم المنتج': csvSafe(p.name || ''),
      'القسم / التصنيف': csvSafe(catMap[p.categoryId] || 'عام'),
      'الوحدة': csvSafe(p.unit || 'حبة'),
      'سعر التكلفة': Number(p.costPrice || 0),
      'سعر البيع': Number(p.sellingPrice || 0),
      'الكمية بالمخزون': Number(p.stock || 0),
      'حد التنبيه الأدنى': Number(p.minStock || 3),
      'نوع الصنف': p.isService ? 'خدمة' : 'منتج عادي',
      'ملاحظات': csvSafe(p.notes || '')
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);

    // ضبط عرض الأعمدة تلقائياً لسهولة القراءة
    worksheet['!cols'] = [
      { wch: 18 }, // الباركود
      { wch: 20 }, // باركود المصنع
      { wch: 32 }, // اسم المنتج
      { wch: 18 }, // القسم
      { wch: 10 }, // الوحدة
      { wch: 14 }, // التكلفة
      { wch: 14 }, // البيع
      { wch: 15 }, // المخزون
      { wch: 16 }, // حد التنبيه
      { wch: 14 }, // نوع الصنف
      { wch: 25 }  // ملاحظات
    ];

    // اتجاه الورقة من اليمين لليسار (RTL)
    worksheet['!views'] = [{ rightToLeft: true }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'قائمة المنتجات');

    const todayStr = new Date().toISOString().slice(0, 10);
    const fileName = `منتجات_${storeName.replace(/\s+/g, '_')}_${todayStr}.xlsx`;

    XLSX.writeFile(workbook, fileName);
    return { success: true, count: rows.length, fileName };
  } catch (err) {
    console.error('Excel Export Error:', err);
    throw err;
  }
};

// توليد وتنزيل نموذج إكسيل فارغ مع بيانات إرشادية جاهزة للتعبئة
export const generateProductsExcelTemplate = (categories = [], storeName = 'بيت الورد') => {
  try {
    const defaultCatName = categories[0]?.name || 'زهور طبيعية';

    const sampleRows = [
      {
        'الباركود': '6281004928172',
        'باركود المصنع': '6901234567890',
        'اسم المنتج': 'باقة ورد جوري أحمر فاخرة',
        'القسم / التصنيف': defaultCatName,
        'الوحدة': 'باقة',
        'سعر التكلفة': 45.00,
        'سعر البيع': 120.00,
        'الكمية بالمخزون': 25,
        'حد التنبيه الأدنى': 5,
        'نوع الصنف': 'منتج عادي',
        'ملاحظات': 'عينة تجريبية يمكن تعديلها أو حذفها'
      },
      {
        'الباركود': '6281004928173',
        'باركود المصنع': '',
        'اسم المنتج': 'تغليف هدايا احترافي بشريطة ساتان',
        'القسم / التصنيف': 'تغليف وهدايا',
        'الوحدة': 'خدمة',
        'سعر التكلفة': 5.00,
        'سعر البيع': 25.00,
        'الكمية بالمخزون': 999,
        'حد التنبيه الأدنى': 0,
        'نوع الصنف': 'خدمة',
        'ملاحظات': 'خدمة غير مقيدة بكمية مخزون'
      },
      {
        'الباركود': '',
        'باركود المصنع': '8801234567891',
        'اسم المنتج': 'فازة زجاجية أسطوانية شفافة',
        'القسم / التصنيف': 'إكسسوارات وفازات',
        'الوحدة': 'حبة',
        'سعر التكلفة': 18.00,
        'سعر البيع': 45.00,
        'الكمية بالمخزون': 15,
        'حد التنبيه الأدنى': 3,
        'نوع الصنف': 'منتج عادي',
        'ملاحظات': 'إذا ترك الباركود فارغاً سيتم توليده تلقائياً'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows);

    worksheet['!cols'] = [
      { wch: 18 }, // الباركود
      { wch: 20 }, // باركود المصنع
      { wch: 35 }, // اسم المنتج
      { wch: 20 }, // القسم
      { wch: 12 }, // الوحدة
      { wch: 14 }, // التكلفة
      { wch: 14 }, // البيع
      { wch: 16 }, // المخزون
      { wch: 16 }, // حد التنبيه
      { wch: 14 }, // نوع الصنف
      { wch: 35 }  // ملاحظات
    ];

    worksheet['!views'] = [{ rightToLeft: true }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'نموذج إدخال المنتجات');

    const fileName = `نموذج_إدخال_المنتجات_${storeName.replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    return { success: true, fileName };
  } catch (err) {
    console.error('Excel Template Error:', err);
    throw err;
  }
};

// قراءة وتحليل ملف إكسيل والتعرف الذكي على الحقول والأعمدة
export const parseProductsExcelFile = async (file, existingCategories = [], existingProducts = []) => {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          if (!rawRows || rawRows.length === 0) {
            resolve({
              success: false,
              error: 'ملف الإكسيل فارغ ولا يحتوي على أي صفوف بيانات!'
            });
            return;
          }

          // الباركودات المولَّدة أثناء الاستيراد تُضاف لهذا المجمّع فوراً،
          // وإلا أخذ كل صف بلا باركود نفس الرقم التسلسلي (لأن المنتجات
          // المحفوظة لم تتغيّر بعد) فتتكرّر الباركودات داخل الدفعة نفسها.
          const barcodePool = Array.isArray(existingProducts) ? [...existingProducts] : [];

          // =============================================================
          //  حماية بناء الخرائط
          // =============================================================
          //  c.name.trim() كان ينهار بالكامل إذا وُجد تصنيف واحد بلا اسم
          //  (يحدث بعد استيراد سابق ناقص أو تصنيف حُذف اسمه) — فيفشل
          //  الاستيراد كله برسالة "تعذر قراءة الملف" والسبب ليس في الملف.
          //
          //  ومفتاح __proto__ لا يُخزَّن كخاصية عادية في كائن JS، فقراءته
          //  ترجع كائن النموذج الأولي (قيمة صادقة) — فيظن المستورد أن صنفاً
          //  باركوده "__proto__" موجود مسبقاً. نستبعده صراحةً.
          // =============================================================
          const isSafeKey = (k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype';

          const catNameMap = Object.create(null);
          (existingCategories || []).forEach(c => {
            const nm = String(c?.name ?? '').trim().toLowerCase();
            if (nm && isSafeKey(nm)) catNameMap[nm] = c.id;
          });

          const existingBarcodeMap = Object.create(null);
          (existingProducts || []).forEach(p => {
            if (!p) return;
            const b = String(p.barcode ?? '').trim();
            if (b && isSafeKey(b)) existingBarcodeMap[b] = p;
            const fb = String(p.factoryBarcode ?? '').trim();
            if (fb && isSafeKey(fb)) existingBarcodeMap[fb] = p;
          });

          const parsedItems = [];
          const newCategoryNames = new Set();

          const cleanNumber = (val, fallback = 0) => {
            if (typeof val === 'number') return isNaN(val) ? fallback : val;
            if (!val) return fallback;
            const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '').trim();
            const num = parseFloat(cleaned);
            return isNaN(num) ? fallback : num;
          };

          // =============================================================
          //  قيمة مالية صالحة: لا سالبة ولا خارج المعقول
          // =============================================================
          //  cleanNumber وحدها كانت تقبل "-50" فيُستورد صنف بسعر بيع سالب.
          //  أثره عند البيع: يُنقص إجمالي الفاتورة بدل أن يزيده، فيخرج
          //  العميل بمبلغ أقل مما يجب والدرج ينقص بلا سبب ظاهر — خلل
          //  مالي صامت لا يُعطي أي رسالة خطأ.
          //  MAX_MONEY حدّ عقلاني لمتجر تجزئة: يمنع خطأ إدخال مثل
          //  99999999999 من تسميم التقارير وحسابات الأرباح.
          // =============================================================
          const MAX_MONEY = 1000000;    // مليون ريال للصنف الواحد
          const MAX_STOCK = 1000000;    // مليون قطعة

          const cleanMoney = (val, fallback = 0) => {
            const n = cleanNumber(val, fallback);
            if (!Number.isFinite(n) || n < 0) return 0;
            return Math.min(n, MAX_MONEY);
          };

          const cleanQty = (val, fallback = 0) => {
            const n = cleanNumber(val, fallback);
            if (!Number.isFinite(n) || n < 0) return 0;
            return Math.min(n, MAX_STOCK);
          };

          rawRows.forEach((row, index) => {
            const getColVal = (keys) => {
              for (const k of keys) {
                const match = Object.keys(row).find(col => 
                  col.trim().toLowerCase() === k.toLowerCase() || 
                  col.trim().toLowerCase().includes(k.toLowerCase())
                );
                if (match && row[match] !== undefined && row[match] !== '') {
                  return row[match];
                }
              }
              return '';
            };

            const rawName = getColVal(['اسم المنتج', 'الاسم', 'name', 'product_name', 'الصنف', 'product', 'item_name', 'item']);
            if (!rawName) return;

            let rawBarcode = String(getColVal(['الباركود', 'باركود', 'barcode', 'كود', 'code', 'رمز', 'sku'])).trim();
            if (!rawBarcode || rawBarcode === 'undefined' || rawBarcode === 'null') {
              rawBarcode = generateSequentialBarcode(barcodePool);
              barcodePool.push({ barcode: rawBarcode });
            }

            let rawFactoryBarcode = String(getColVal(['باركود المصنع', 'باركود المورد', 'كود المصنع', 'factory_barcode', 'factoryBarcode', 'alt_barcode']) || '').trim();
            if (rawFactoryBarcode === 'undefined' || rawFactoryBarcode === 'null') rawFactoryBarcode = '';

            const rawCategory = String(getColVal(['القسم / التصنيف', 'القسم', 'التصنيف', 'category', 'cat', 'المجموعة']) || 'عام').trim();
            if (rawCategory && !catNameMap[rawCategory.toLowerCase()]) {
              newCategoryNames.add(rawCategory);
            }

            const rawUnit = String(getColVal(['الوحدة', 'وحدة', 'unit']) || 'حبة').trim();
            const rawCost = cleanMoney(getColVal(['سعر التكلفة', 'التكلفة', 'cost', 'cost_price', 'سعر الشراء']), 0);
            const rawPrice = cleanMoney(getColVal(['سعر البيع', 'السعر', 'price', 'selling_price', 'sale_price']), 0);
            const rawStock = cleanQty(getColVal(['الكمية بالمخزون', 'الكمية', 'المخزون', 'stock', 'qty', 'الرصيد', 'quantity']), 0);
            const rawMinStock = cleanQty(getColVal(['حد التنبيه الأدنى', 'الحد الأدنى', 'حد التنبيه', 'min_stock', 'minStock']), 3);
            
            const rawType = String(getColVal(['نوع الصنف', 'النوع', 'type', 'خدمة', 'is_service'])).trim().toLowerCase();
            const isService = rawType.includes('خدمة') || rawType === 'service' || rawType === 'true' || rawType === '1';
            const notes = String(getColVal(['ملاحظات', 'notes', 'وصف', 'description']) || '').trim();

            const isExisting = Boolean(existingBarcodeMap[rawBarcode] || (rawFactoryBarcode && existingBarcodeMap[rawFactoryBarcode]));

            parsedItems.push({
              rowIndex: index + 2,
              // حدّ الطول يمنع اسماً بآلاف الأحرف من تخريب عرض الجدول والطباعة
              name: String(rawName).trim().slice(0, 200),
              barcode: rawBarcode,
              factoryBarcode: rawFactoryBarcode,
              categoryName: rawCategory || 'عام',
              unit: rawUnit,
              costPrice: rawCost,
              sellingPrice: rawPrice,
              stock: isService ? 9999 : rawStock,
              minStock: rawMinStock,
              isService,
              notes,
              isExisting,
              existingProduct: existingBarcodeMap[rawBarcode] || (rawFactoryBarcode ? existingBarcodeMap[rawFactoryBarcode] : null) || null
            });
          });

          resolve({
            success: true,
            totalRows: rawRows.length,
            validItems: parsedItems,
            newCategories: Array.from(newCategoryNames),
            fileName: file.name
          });

        } catch (parseErr) {
          console.error('Error processing worksheet:', parseErr);
          resolve({
            success: false,
            error: 'تعذر قراءة محتوى ملف الإكسيل. تأكد من أن الملف سليم بصيغة .xlsx أو .xls أو .csv'
          });
        }
      };

      reader.onerror = () => {
        resolve({
          success: false,
          error: 'حدث خطأ أثناء قراءة الملف من الجهاز!'
        });
      };

      reader.readAsArrayBuffer(file);
    } catch (err) {
      reject(err);
    }
  });
};
