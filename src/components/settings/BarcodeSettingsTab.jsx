import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Barcode, Printer, Save, CheckCircle, RotateCcw, Eye, QrCode, Tag, FileText } from 'lucide-react';

import { printThermalBarcodeLabels } from '../../utils/printHelper';
import JsBarcode from 'jsbarcode';

// مكون المعاينة الحية للباركود الدقيق
const LiveBarcodeSvg = ({ code, symbology, barcodeHeight, barcodeTextSize, showBarcodeText }) => {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !code) return;
    try {
      let fmt = symbology || 'CODE128';
      if (fmt === 'EAN13' && (code.length !== 13 || !/^\d+$/.test(code))) fmt = 'CODE128';
      if (fmt === 'UPCA' && (code.length !== 12 || !/^\d+$/.test(code))) fmt = 'CODE128';
      if (fmt === 'CODE39') fmt = 'CODE39';

      JsBarcode(svgRef.current, String(code).trim(), {
        format: fmt,
        width: 1.6,
        height: Math.max(16, (Number(barcodeHeight) || 12) * 2.2),
        displayValue: Boolean(showBarcodeText),
        font: 'monospace',
        fontSize: Number(barcodeTextSize) || 9,
        textMargin: 1,
        margin: 0,
        background: 'transparent',
        lineColor: '#000000'
      });
    } catch (e) {
      console.warn('Live Barcode Preview Warning:', e);
    }
  }, [code, symbology, barcodeHeight, barcodeTextSize, showBarcodeText]);

  return <svg ref={svgRef} className="max-w-[95%] h-auto mx-auto" />;
};

export const BarcodeSettingsTab = () => {
  const { storeInfo, updateStoreInfo, products, confirmDialog } = useApp();

  const defaultSettings = {
    labelSize: '50x25',
    customWidth: 50,
    customHeight: 25,
    marginTop: 2,
    marginBottom: 2,
    marginLeft: 2,
    marginRight: 2,
    gap: 2,
    borderRadius: 4,
    symbology: 'CODE128',
    barcodeHeight: 12,
    barcodeWidth: 1.5,
    showBarcodeText: true,
    barcodeTextSize: 9,
    showStoreName: true,
    storeNameSize: 10,
    showProductName: true,
    productNameLines: 1,
    productNameSize: 11,
    showProductEnglishName: false,
    showPrice: true,
    priceSize: 13,
    priceBold: true,
    showTaxIndicator: true,
    showCurrency: true,
    showOriginalPrice: false,
    showQrCode: false,
    qrSize: 18,
    showExpiryDate: false,
    showCustomFooter: true,
    customFooterText: 'بيت الورد - جودة وأناقة 🌸',
    fontFamily: 'tahoma',
    orientation: 'portrait',
    dpi: '203',
    paperType: 'single_roll',
    a4Columns: 3,
    a4Rows: 8,
    // TSPL معطّل افتراضياً: يحتاج QZ Tray مثبَّتاً وطابعة ملصقات تفهم
    // اللغة، ولا يدعم الحروف العربية. تشغيله قرار واعٍ لا افتراض.
    useTspl: false
  };

  const [settings, setSettings] = useState({
    ...defaultSettings,
    ...(storeInfo.barcodeLabelSettings || {})
  });

  const [saveSuccess, setSaveSuccess] = useState(false);

  const sampleProduct = products[0] || {
    name: 'باقة ورد جوري أحمر فاخرة',
    nameEn: 'Luxury Red Rose Bouquet',
    barcode: '6281004928172',
    sellingPrice: 150,
    costPrice: 90,
    stock: 25
  };

  const handleUpdate = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleApplyPreset = (preset) => {
    setSettings(prev => ({
      ...prev,
      labelSize: preset.size,
      customWidth: preset.width,
      customHeight: preset.height,
      barcodeHeight: preset.barcodeHeight,
      productNameSize: preset.nameSize,
      priceSize: preset.priceSize
    }));
  };

  const handleSave = () => {
    updateStoreInfo({
      ...storeInfo,
      barcodeLabelSettings: settings
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleReset = async () => {
    const ok = await confirmDialog({
      title: 'استعادة إعدادات الباركود',
      message: 'هل أنت متأكد من استعادة الإعدادات الافتراضية لملصقات الباركود؟',
      confirmText: 'استعادة',
      tone: 'warning'
    });
    if (ok) {
      setSettings(defaultSettings);
      updateStoreInfo({
        ...storeInfo,
        barcodeLabelSettings: defaultSettings
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handlePrintTest = async () => {
    const sampleProduct = products && products.length > 0 
      ? products[0] 
      : {
          name: 'باقة جوري أحمر ملكي 🌹',
          sellingPrice: 150,
          barcode: '628100123456'
        };

    // `await` ضروري بعد أن صارت الدالة غير متزامنة (مسار TSPL): try/catch
    // حول استدعاء بلا await لا يلتقط رفض الوعد. و `barcodeLabelSettings`
    // تُمرَّر من `settings` المحلية لا من المحفوظ، لأن هذه طباعة اختبارية
    // لإعدادات قيد التعديل — ومنها مفتاح TSPL نفسه.
    try {
      await printThermalBarcodeLabels({
        product: sampleProduct,
        copies: 1,
        size: settings.preset || settings.labelSize || '50x25',
        storeInfo: {
          ...storeInfo,
          barcodeLabelSettings: settings
        }
      });
    } catch (err) {
      console.error('Test Print Error:', err);
      alert('تعذّرت الطباعة التجريبية: ' + (err?.message || 'خطأ غير معروف'));
    }
  };

  const presets = [
    { size: '50x25', label: '50 × 25 مم (قياسي حراري)', width: 50, height: 25, barcodeHeight: 11, nameSize: 10, priceSize: 12 },
    { size: '40x30', label: '40 × 30 مم (مربع متوازن)', width: 40, height: 30, barcodeHeight: 13, nameSize: 10, priceSize: 13 },
    { size: '38x25', label: '38 × 25 مم (مدمج صغير)', width: 38, height: 25, barcodeHeight: 10, nameSize: 9, priceSize: 11 },
    { size: '60x40', label: '60 × 40 مم (كبير وشامل)', width: 60, height: 40, barcodeHeight: 16, nameSize: 12, priceSize: 15 },
    { size: '70x35', label: '70 × 35 مم (فازات وهدايا)', width: 70, height: 35, barcodeHeight: 14, nameSize: 11, priceSize: 14 },
    { size: '80x50', label: '80 × 50 مم (كبير جداً للشحنات)', width: 80, height: 50, barcodeHeight: 20, nameSize: 13, priceSize: 16 },
    { size: 'a4_3x8', label: 'ورق A4 لاصق (3 أعمدة × 8 صفوف)', width: 63.5, height: 38.1, barcodeHeight: 14, nameSize: 11, priceSize: 13 }
  ];

  return (
    <div className="space-y-5 animate-in fade-in text-xs font-cairo">
      
      {/* رأس الصفحة */}
      <div className="bg-gradient-to-r from-indigo-900 via-purple-900 to-pink-900 text-white p-5 rounded-3xl shadow-lg border border-indigo-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-2xl border border-white/20 shadow-inner">
            🏷️
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black flex items-center gap-2">
              <span>إعدادات طباعة ملصقات الباركود المتقدمة الشاملة</span>
              <span className="text-pink-400">🌸</span>
            </h3>
            <p className="text-xs text-indigo-200/80 mt-0.5">
              تخصيص أبعاد الملصق بالمليمتر، نوع التشفير، الحقول المطبوعة، الدقة، والمعاينة الحية المباشرة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition flex items-center gap-1.5 border border-white/20"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الافتراضي</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-400 text-white rounded-xl font-black shadow-md transition flex items-center gap-1.5 active:scale-95 border border-pink-300/30"
          >
            <Save className="w-4 h-4" />
            <span>حفظ الإعدادات 💾</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 font-bold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>تم حفظ إعدادات طباعة ملصقات الباركود وتطبيقها بنجاح! 🌸</span>
          </div>
          <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-lg">جاهز للطباعة 🏷️</span>
        </div>
      )}

      {/* قسم الإعدادات والمعاينة الحية */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* العمود الأيمن: لوحة التحكم الدقيقة بالإعدادات */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* 1. المقاسات والقوالب الجاهزة */}
          <div className="p-4 bg-white rounded-3xl border border-pink-100 shadow-xs space-y-3">
            <h4 className="font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <Tag className="w-4 h-4 text-pink-600" />
              <span>1. مقاس وقالب ملصق الباركود:</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {presets.map(p => (
                <button
                  key={p.size}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className={'p-2.5 rounded-2xl border text-right transition active:scale-95 ' + (
                    settings.labelSize === p.size
                      ? 'bg-gradient-to-tr from-indigo-50 to-pink-50 border-indigo-600 ring-2 ring-indigo-400/30 shadow-xs font-black'
                      : 'bg-slate-50 border-slate-200 hover:border-pink-300 text-slate-700'
                  )}
                >
                  <span className="font-bold block text-slate-900 text-xs">{p.label}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{p.width} × {p.height} مم</span>
                </button>
              ))}
            </div>

            {/* الأبعاد المخصصة بالمليمتر */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">العرض (Width mm):</label>
                <input
                  type="number"
                  step="1"
                  value={settings.customWidth}
                  onChange={e => handleUpdate('customWidth', Number(e.target.value) || 50)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-center"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-bold mb-1">الارتفاع (Height mm):</label>
                <input
                  type="number"
                  step="1"
                  value={settings.customHeight}
                  onChange={e => handleUpdate('customHeight', Number(e.target.value) || 25)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-center"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-bold mb-1">الهوامش (Margins mm):</label>
                <input
                  type="number"
                  step="0.5"
                  value={settings.marginTop}
                  onChange={e => {
                    const val = Number(e.target.value) || 2;
                    setSettings(p => ({ ...p, marginTop: val, marginBottom: val, marginLeft: val, marginRight: val }));
                  }}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-center"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-bold mb-1">انحناء الزوايا (Radius):</label>
                <input
                  type="number"
                  step="1"
                  value={settings.borderRadius}
                  onChange={e => handleUpdate('borderRadius', Number(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-center"
                />
              </div>
            </div>
          </div>

          {/* 2. نوع وتنسيق الباركود والـ QR */}
          <div className="p-4 bg-white rounded-3xl border border-pink-100 shadow-xs space-y-3">
            <h4 className="font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <Barcode className="w-4 h-4 text-indigo-600" />
              <span>2. نوع التشفير والشفرة (Symbology):</span>
            </h4>

            {/* =============================================================
                 مفتاح TSPL — الطباعة الخام بلغة الطابعة
                 =============================================================
                 HTML يطبع «صفحة» لا «ملصقاً»: هوامش يفرضها المتصفّح، وتحجيم
                 يختلف بين جهاز وآخر، وباركود يُرسم صورةً فتتغيّر سماكة خطوطه
                 مع الدقّة فيصعب مسحه. TSPL يعطي الطابعة المقاس بالملّيمتر
                 ويولّد الباركود بخطوطها — ملصق يُمسح دائماً بمقاس مضبوط.
                 ============================================================= */}
            <div className={`rounded-2xl border p-3 space-y-2 ${settings.useTspl ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(settings.useTspl)}
                  onChange={e => handleUpdate('useTspl', e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0"
                />
                <span>
                  <span className="font-black text-slate-900 block">
                    🖨️ طباعة خام بلغة الطابعة (TSPL) — للمقاس المضبوط بالملّيمتر
                  </span>
                  <span className="text-[11px] text-slate-600 leading-relaxed block mt-1">
                    يُرسل الملصق أوامرَ مباشرةً لطابعة الملصقات بدل صفحة HTML، فيخرج
                    بالمقاس المكتوب أعلاه بالضبط ويُمسح الباركود دائماً.
                  </span>
                </span>
              </label>

              <div className="text-[11px] leading-relaxed bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-amber-900 font-bold">
                ⚠️ يتطلّب: <b>QZ Tray مثبَّتاً ومفعَّلاً</b> من تبويب الطابعات، وطابعة ملصقات
                تفهم TSPL (TSC / Xprinter / Godex وما يوافقها).
                <br />
                ⛔ <b>لا يدعم الحروف العربية</b> — خطوط الطابعة الداخلية بلا محارف عربية.
                فاسم المتجر واسم المنتج يُطبعان فقط إن كانا بحروف لاتينية، وإلا يُحذفان من
                الملصق (بدل طباعة رموز مشوّهة). الباركود والسعر يُطبعان دائماً.
                <br />
                ✅ إن تعذّر TSPL لأي سبب يرجع البرنامج للطباعة العادية تلقائياً ولا يتعطّل.
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">نوع الشفرة:</label>
                <select
                  value={settings.symbology}
                  onChange={e => handleUpdate('symbology', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="CODE128">Code 128 (عالمي قياسي - موصى به)</option>
                  <option value="EAN13">EAN-13 (13 رقم تجاري عالمي)</option>
                  <option value="QR">QR Code (رمز استجابة سريع ثنائي الأبعاد)</option>
                  <option value="CODE39">Code 39 (صناعي)</option>
                  <option value="UPCA">UPC-A (أمريكي قياسي)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">ارتفاع الخطوط (مم):</label>
                <input
                  type="number"
                  step="1"
                  value={settings.barcodeHeight}
                  onChange={e => handleUpdate('barcodeHeight', Number(e.target.value) || 12)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-center"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">دقة الطابعة (DPI):</label>
                <select
                  value={settings.dpi}
                  onChange={e => handleUpdate('dpi', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="203">203 DPI (طابعات Xprinter / Zebra العادية)</option>
                  <option value="300">300 DPI (طابعات عالية الدقة)</option>
                  <option value="600">600 DPI (دقة احترافية فائقة)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">نوع الخط العربي (Font):</label>
                <select
                  value={settings.fontFamily || 'tahoma'}
                  onChange={e => handleUpdate('fontFamily', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="tahoma">الخط الأساسي الواضح (Tahoma / Cairo - موصى به) ✨</option>
                  <option value="cairo">خط كايرو الهندسي (Cairo)</option>
                  <option value="arial">خط آريال القياسي (Arial)</option>
                  <option value="simplified">الخط العربي المبسط (Simplified Arabic)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">اتجاه الطباعة:</label>
                <select
                  value={settings.orientation}
                  onChange={e => handleUpdate('orientation', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="portrait">عمودي (Portrait 0°)</option>
                  <option value="landscape">أفقي (Landscape 90°)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.showBarcodeText}
                  onChange={e => handleUpdate('showBarcodeText', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <span>إظهار أرقام الباركود نصياً أسفل الشفرة</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.showQrCode}
                  onChange={e => handleUpdate('showQrCode', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <span>تضمين رمز QR جانبي</span>
              </label>
            </div>
          </div>

          {/* 3. الحقول والبيانات المطبوعة على الملصق */}
          <div className="p-4 bg-white rounded-3xl border border-pink-100 shadow-xs space-y-3">
            <h4 className="font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <FileText className="w-4 h-4 text-purple-600" />
              <span>3. الحقول والنصوص المطبوعة على الملصق:</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              
              {/* اسم المتجر */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={settings.showStoreName}
                      onChange={e => handleUpdate('showStoreName', e.target.checked)}
                      className="w-4 h-4 text-pink-600 rounded"
                    />
                    <span>اسم المتجر (الترويسة)</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">حجم الخط: {settings.storeNameSize}px</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={settings.customStoreName !== undefined ? settings.customStoreName : (storeInfo.name || 'بيت الورد')}
                    onChange={e => handleUpdate('customStoreName', e.target.value)}
                    placeholder="نص اسم المتجر المطبوع على الملصق..."
                    disabled={!settings.showStoreName}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-bold text-xs"
                  />
                  <input
                    type="range"
                    min="8"
                    max="18"
                    value={settings.storeNameSize}
                    onChange={e => handleUpdate('storeNameSize', Number(e.target.value))}
                    disabled={!settings.showStoreName}
                    className="w-full accent-pink-600"
                  />
                </div>
              </div>

              {/* اسم الصنف */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={settings.showProductName}
                      onChange={e => handleUpdate('showProductName', e.target.checked)}
                      className="w-4 h-4 text-pink-600 rounded"
                    />
                    <span>اسم الصنف / المنتج</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">حجم الخط: {settings.productNameSize}px</span>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="range"
                    min="8"
                    max="18"
                    value={settings.productNameSize}
                    onChange={e => handleUpdate('productNameSize', Number(e.target.value))}
                    disabled={!settings.showProductName}
                    className="w-full accent-pink-600"
                  />
                  <select
                    value={settings.productNameLines}
                    onChange={e => handleUpdate('productNameLines', Number(e.target.value))}
                    className="text-[10px] font-bold p-1 bg-white border border-slate-200 rounded-lg shrink-0"
                  >
                    <option value={1}>سطر 1</option>
                    <option value={2}>سطران</option>
                  </select>
                </div>
              </div>

              {/* أرقام الباركود */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={settings.showBarcodeText}
                      onChange={e => handleUpdate('showBarcodeText', e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span>أرقام الباركود نصياً</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">حجم الخط: {settings.barcodeTextSize}px</span>
                </div>
                <input
                  type="range"
                  min="7"
                  max="14"
                  value={settings.barcodeTextSize}
                  onChange={e => handleUpdate('barcodeTextSize', Number(e.target.value))}
                  disabled={!settings.showBarcodeText}
                  className="w-full accent-indigo-600"
                />
              </div>

              {/* السعر والضريبة */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={settings.showPrice}
                      onChange={e => handleUpdate('showPrice', e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span>سعر البيع البارز</span>
                  </label>

                  <div className="flex items-center gap-3">
                    {storeInfo.taxEnabled !== false && Number(storeInfo.taxRate || 0) > 0 ? (
                      <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.showTaxIndicator}
                          onChange={e => handleUpdate('showTaxIndicator', e.target.checked)}
                          className="w-3.5 h-3.5 text-emerald-600 rounded"
                        />
                        <span>عبارة (شامل الضريبة)</span>
                      </label>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-md">
                        الضريبة معفاة 0%
                      </span>
                    )}

                    <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.showCurrency}
                        onChange={e => handleUpdate('showCurrency', e.target.checked)}
                        className="w-3.5 h-3.5 text-emerald-600 rounded"
                      />
                      <span>رمز العملة (ر.س)</span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="10"
                    max="22"
                    value={settings.priceSize}
                    onChange={e => handleUpdate('priceSize', Number(e.target.value))}
                    disabled={!settings.showPrice}
                    className="w-full accent-emerald-600"
                  />
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">{settings.priceSize}px</span>
                </div>
              </div>

              {/* ملاحظة التذييل المخصصة */}
              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-bold mb-1">ملاحظة التذييل المطبوعة أسفل الملصق:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settings.customFooterText}
                    onChange={e => handleUpdate('customFooterText', e.target.value)}
                    placeholder="مثال: بيت الورد - جودة وأناقة 🌸"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                  <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 rounded-xl font-bold cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.showCustomFooter}
                      onChange={e => handleUpdate('showCustomFooter', e.target.checked)}
                      className="w-4 h-4 text-purple-600 rounded"
                    />
                    <span>إظهار التذييل</span>
                  </label>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* العمود الأيسر: المعاينة الحية المباشرة */}
        <div className="lg:col-span-4 space-y-4">
          <div className="sticky top-4 bg-slate-900 text-white p-5 rounded-3xl shadow-xl border border-indigo-500/40 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-pink-400" />
                <span className="font-black text-xs text-white">معاينة حية للملصق الحراري</span>
              </div>
              <span className="text-[10px] font-mono bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded-lg border border-indigo-800">
                {settings.customWidth}×{settings.customHeight} mm
              </span>
            </div>

            {/* مجسم ملصق الباركود التفاعلي بالمليمتر */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-center min-h-[220px] overflow-hidden">
              <div
                style={{
                  width: Math.min(260, settings.customWidth * 4.5) + 'px',
                  minHeight: Math.min(180, settings.customHeight * 4.5) + 'px',
                  paddingTop: (settings.marginTop * 2) + 'px',
                  paddingBottom: (settings.marginBottom * 2) + 'px',
                  paddingLeft: (settings.marginLeft * 2) + 'px',
                  paddingRight: (settings.marginRight * 2) + 'px',
                  borderRadius: settings.borderRadius + 'px',
                  fontFamily: settings.fontFamily === 'cairo'
                    ? "'Cairo', 'Tahoma', sans-serif"
                    : settings.fontFamily === 'arial'
                    ? "Arial, 'Simplified Arabic', sans-serif"
                    : settings.fontFamily === 'simplified'
                    ? "'Simplified Arabic', 'Tahoma', sans-serif"
                    : "'Tahoma', 'Segoe UI', 'Cairo', Arial, sans-serif"
                }}
                className="bg-white text-slate-950 shadow-2xl flex flex-col justify-between text-center select-none border border-slate-300 transition-all duration-200"
              >
                {/* اسم المتجر */}
                {settings.showStoreName && (
                  <div
                    style={{ fontSize: settings.storeNameSize + 'px' }}
                    className="font-black text-slate-900 border-b border-dashed border-slate-200 pb-0.5 truncate"
                  >
                    {settings.customStoreName || storeInfo.name || 'بيت الورد للزهور'} 🌸
                  </div>
                )}

                {/* اسم الصنف */}
                {settings.showProductName && (
                  <div
                    style={{ fontSize: settings.productNameSize + 'px' }}
                    className={'font-black text-slate-900 leading-tight my-0.5 ' + (settings.productNameLines === 1 ? 'truncate' : 'line-clamp-2')}
                  >
                    {sampleProduct.name}
                  </div>
                )}

                {/* شفرة الباركود الحقيقية الدقيقة SVG */}
                <div className="py-1 flex flex-col items-center justify-center w-full">
                  {settings.symbology === 'QR' ? (
                    <div className="w-16 h-16 bg-slate-900 p-1 rounded-lg flex items-center justify-center text-white mx-auto">
                      <QrCode className="w-12 h-12 text-white" />
                    </div>
                  ) : (
                    <LiveBarcodeSvg
                      code={sampleProduct.barcode}
                      symbology={settings.symbology}
                      barcodeHeight={settings.barcodeHeight}
                      barcodeTextSize={settings.barcodeTextSize}
                      showBarcodeText={settings.showBarcodeText}
                    />
                  )}
                </div>

                {/* السعر والضريبة */}
                {settings.showPrice && (
                  <div className="flex items-center justify-center gap-1 border-t border-dashed border-slate-200 pt-0.5">
                    <span
                      style={{ fontSize: settings.priceSize + 'px' }}
                      className="font-black text-slate-950 font-mono"
                    >
                      {sampleProduct.sellingPrice} {settings.showCurrency ? (storeInfo.currency || 'ر.س') : ''}
                    </span>
                    {settings.showTaxIndicator && (
                      <span className="text-[8px] bg-slate-100 text-slate-600 font-bold px-1 rounded">
                        {storeInfo.taxInclusive !== false ? 'شامل الضريبة' : '+ ضريبة'}
                      </span>
                    )}
                  </div>
                )}

                {/* التذييل المخصص */}
                {settings.showCustomFooter && settings.customFooterText && (
                  <div className="text-[8px] text-slate-400 font-bold truncate mt-0.5">
                    {settings.customFooterText}
                  </div>
                )}
              </div>
            </div>

            {/* أزرار الإجراء السريع */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handlePrintTest}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 text-white rounded-xl font-black text-xs shadow flex items-center justify-center gap-2 transition active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>🖨️ طباعة ملصق تجريبي الآن</span>
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
