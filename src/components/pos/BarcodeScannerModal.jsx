import React, { useState, useEffect, useRef } from 'react';
import { X, Barcode, Search, Camera, RefreshCw, Zap, ZapOff, CheckCircle2, AlertCircle, PackagePlus, ShoppingBag } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { playBarcodeBeep, playSuccessChime } from '../../utils/soundHelper';

export const BarcodeScannerModal = ({ isOpen, onClose, onScanned, onScanSuccess }) => {
  const { products, addProduct, updateProduct, categories } = useApp();
  const [manualCode, setManualCode] = useState('');
  const [notFoundMsg, setNotFoundMsg] = useState('');
  const [unregisteredCode, setUnregisteredCode] = useState('');
  const [quickProdName, setQuickProdName] = useState('');
  const [quickProdPrice, setQuickProdPrice] = useState('');
  const [isAddingQuick, setIsAddingQuick] = useState(false);
  const [isLinkingQuick, setIsLinkingQuick] = useState(false);
  const [linkTargetProdId, setLinkTargetProdId] = useState('');

  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('initializing'); // 'initializing', 'running', 'error'
  const [errorMessage, setErrorMessage] = useState('');

  const html5QrCodeRef = useRef(null);
  const productsRef = useRef(products);
  productsRef.current = products;

  // توحيد صيغة أرقام الباركود وإزالة الفراغات وتحويل الأرقام العربية
  const cleanBarcodeStr = (str) => {
    if (!str) return '';
    return String(str)
      .trim()
      .replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 1776)
      .replace(/[\u06F0-\u06F9]/g, d => d.charCodeAt(0) - 1776)
      .replace(/\s+/g, '');
  };

  // معالجة البحث عن المنتج عبر الباركود (الرئيسي أو باركود المصنع)
  const handleLookup = (codeToSearch) => {
    const rawTarget = codeToSearch || manualCode;
    const target = cleanBarcodeStr(rawTarget);
    if (!target) return;

    // مطابقة شاملة ومرنة لجميع احتمالات الباركود (شاملاً باركود المصنع)
    const matched = productsRef.current.find(p => {
      const pBar = cleanBarcodeStr(p.barcode);
      const pFactory = cleanBarcodeStr(p.factoryBarcode);
      const pId = cleanBarcodeStr(p.id);
      const pSku = cleanBarcodeStr(p.sku);
      const pCode = cleanBarcodeStr(p.code);

      return (
        pBar === target ||
        pFactory === target ||
        pId === target ||
        pSku === target ||
        pCode === target ||
        (target.length > 3 && (
          (pBar && (pBar.endsWith(target) || target.endsWith(pBar))) ||
          (pFactory && (pFactory.endsWith(target) || target.endsWith(pFactory)))
        ))
      );
    });

    if (matched) {
      try {
        playBarcodeBeep(0.25);
        if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
      } catch (e) {}

      if (onScanned) onScanned(matched);
      if (onScanSuccess) onScanSuccess(target);
      onClose();
    } else {
      // الباركود قُرئ بنجاح لكنه غير مسجل في المنتجات
      setUnregisteredCode(target);
      setNotFoundMsg(`تم مسح الباركود (${target}) بنجاح، لكنه غير مضاف بعد في قائمة المنتجات.`);
      setIsAddingQuick(false);
      setIsLinkingQuick(false);
      if (productsRef.current && productsRef.current.length > 0) {
        setLinkTargetProdId(productsRef.current[0].id);
      }
      try {
        playSuccessChime(0.18);
        if (navigator.vibrate) navigator.vibrate([50, 50]);
      } catch (e) {}
    }
  };

  // ربط الباركود غير المسجل بصنف موجود كباركود مصنع وحفظه
  const handleQuickLinkProduct = (e) => {
    e?.preventDefault();
    if (!linkTargetProdId || !unregisteredCode) return;
    const targetProd = (products || []).find(p => p.id === linkTargetProdId);
    if (!targetProd) return;

    try {
      const updated = {
        ...targetProd,
        factoryBarcode: unregisteredCode
      };
      updateProduct(targetProd.id, updated);
      playBarcodeBeep(0.3);

      if (onScanned) onScanned(updated);
      if (onScanSuccess) onScanSuccess(unregisteredCode);
      onClose();
    } catch (err) {
      console.error('Quick link product error:', err);
      alert('حدث خطأ أثناء ربط الباركود: ' + err.message);
    }
  };

  // إضافة منتج جديد وحفظه فوراً في النظام وإضافته للسلة
  const handleQuickAddProduct = (e) => {
    e?.preventDefault();
    if (!quickProdName.trim()) {
      alert('يرجى كتابة اسم المنتج');
      return;
    }
    const price = Number(quickProdPrice);
    if (isNaN(price) || price < 0) {
      alert('يرجى إدخال سعر بيع صحيح');
      return;
    }

    try {
      const newProd = {
        name: quickProdName.trim(),
        sellingPrice: price,
        costPrice: 0,
        barcode: unregisteredCode || cleanBarcodeStr(manualCode),
        categoryId: categories?.[0]?.id || 'cat-1',
        stock: 100,
        trackStock: true,
        unit: 'حبة',
        taxRate: 15,
        isActive: true
      };

      const created = addProduct(newProd);
      playBarcodeBeep(0.3);

      if (onScanned) onScanned(created || newProd);
      if (onScanSuccess) onScanSuccess(newProd.barcode);
      onClose();
    } catch (err) {
      console.error('Quick add product error:', err);
      alert('حدث خطأ أثناء حفظ المنتج: ' + err.message);
    }
  };

  // تهيئة وتشغيل الكاميرا الخلفية إجبارياً
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const scannerElementId = 'interactive-barcode-reader';

    const startScanner = async () => {
      try {
        setCameraStatus('initializing');
        setErrorMessage('');

        // 1. استكشاف الكاميرات المتاحة في الجهاز
        const devices = await Html5Qrcode.getCameras().catch(() => []);
        if (isMounted) setCameras(devices || []);

        // تحديد الكاميرا الخلفية تلقائياً من قائمة الأجهزة
        let preferredCameraConfig = { facingMode: "environment" }; // الافتراضي الأول هو الكاميرا الخلفية

        if (devices && devices.length > 0) {
          // البحث عن الكاميرا الخلفية بالاسم
          const rearCam = devices.find(d => {
            const label = (d.label || '').toLowerCase();
            return label.includes('back') || 
                   label.includes('rear') || 
                   label.includes('environment') || 
                   label.includes('خلفية') ||
                   label.includes('0');
          }) || devices[devices.length - 1]; // الكاميرا الأخيرة في معظم أجهزة أندرويد وآيفون تكون الخلفية

          if (rearCam && rearCam.id) {
            setSelectedCameraId(rearCam.id);
            preferredCameraConfig = rearCam.id;
          }
        }

        // إنشاء كائن الماسح المباشر
        const html5QrCode = new Html5Qrcode(scannerElementId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.QR_CODE
          ],
          verbose: false
        });

        html5QrCodeRef.current = html5QrCode;

        const scanConfig = {
          fps: 20,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            return {
              width: Math.floor(minEdge * 0.85),
              height: Math.floor(minEdge * 0.55)
            };
          },
          aspectRatio: 1.333333
        };

        // محاولة البدء بالكاميرا الخلفية المحددة أو عبر facingMode
        await html5QrCode.start(
          preferredCameraConfig,
          scanConfig,
          (decodedText) => {
            handleLookup(decodedText);
          },
          () => {} // تجاهل أخطاء الإطارات المتكررة
        );

        if (!isMounted) {
          html5QrCode.stop().catch(() => {});
          return;
        }

        setCameraStatus('running');

        // فحص دعم الفلاش للكاميرا
        try {
          const capabilities = html5QrCode.getRunningTrackCapabilities?.();
          if (capabilities && capabilities.torch) {
            setHasTorch(true);
          }
        } catch (e) {}

      } catch (err) {
        console.warn('First rear camera attempt failed, trying fallback mode:', err);
        // محاولة بديلة: فتح أي كاميرا متاحة
        try {
          if (html5QrCodeRef.current) {
            await html5QrCodeRef.current.start(
              { facingMode: "user" },
              { fps: 15, qrbox: { width: 250, height: 150 } },
              (decodedText) => handleLookup(decodedText),
              () => {}
            );
            if (isMounted) setCameraStatus('running');
          }
        } catch (fallbackErr) {
          console.error('Fatal Camera Start Error:', fallbackErr);
          if (isMounted) {
            setCameraStatus('error');
            setErrorMessage('يرجى منح إذن استخدام الكاميرا من إعدادات المتصفح لمسح الباركود.');
          }
        }
      }
    };

    const timer = setTimeout(startScanner, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            html5QrCodeRef.current.stop().then(() => {
              html5QrCodeRef.current.clear();
            }).catch(e => console.log('Cleanup error:', e));
          } else {
            html5QrCodeRef.current.clear();
          }
        } catch (e) {}
      }
    };
  }, [isOpen]);

  // تبديل الكاميرا (أمامية / خلفية / عدسات أخرى)
  const handleSwitchCamera = async () => {
    if (!html5QrCodeRef.current || cameras.length <= 1) return;

    try {
      setCameraStatus('initializing');
      if (html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
      }

      const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
      const nextIndex = (currentIndex + 1) % cameras.length;
      const nextCamera = cameras[nextIndex];
      setSelectedCameraId(nextCamera.id);

      await html5QrCodeRef.current.start(
        nextCamera.id,
        {
          fps: 20,
          qrbox: { width: 260, height: 160 }
        },
        (decodedText) => handleLookup(decodedText),
        () => {}
      );
      setCameraStatus('running');
    } catch (e) {
      console.error('Camera switch error:', e);
      setCameraStatus('running');
    }
  };

  // تشغيل / إطفاء الفلاش
  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !hasTorch) return;
    try {
      const nextState = !isTorchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState }]
      });
      setIsTorchOn(nextState);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        
        {/* رأس النافذة */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-sm">مسح الباركود بالكاميرا</h3>
              <p className="text-[10px] text-blue-200/80">الكاميرا الخلفية مفعلة تلقائياً 📷</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {cameras.length > 1 && (
              <button
                type="button"
                onClick={handleSwitchCamera}
                title="تبديل الكاميرا"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition active:scale-95 text-xs flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="text-[10px] hidden sm:inline">تبديل</span>
              </button>
            )}

            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                title={isTorchOn ? 'إطفاء الفلاش' : 'تشغيل الفلاش'}
                className={`p-2 rounded-xl transition active:scale-95 text-xs flex items-center gap-1 ${
                  isTorchOn ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                {isTorchOn ? <ZapOff className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
              </button>
            )}

            <button 
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-rose-600 text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto space-y-3.5 text-xs">
          
          {/* إطار عرض الكاميرا مع مؤشر الليزر البصري */}
          <div className="relative w-full bg-slate-950 rounded-2xl overflow-hidden border-2 border-slate-800 shadow-inner flex flex-col items-center justify-center min-h-[260px]">
            
            <div 
              id="interactive-barcode-reader" 
              className="w-full h-full rounded-2xl overflow-hidden"
            ></div>

            {cameraStatus === 'initializing' && (
              <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-white gap-2 p-4 text-center z-10">
                <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
                <span className="font-bold text-xs">جاري تشغيل الكاميرا الخلفية...</span>
                <span className="text-[10px] text-slate-400">يرجى توجيه الهاتف نحو باركود المنتج</span>
              </div>
            )}

            {cameraStatus === 'error' && (
              <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center text-rose-400 gap-2 p-4 text-center z-10">
                <AlertCircle className="w-8 h-8 text-rose-500" />
                <span className="font-bold text-xs">{errorMessage || 'تعذر الوصول للكاميرا'}</span>
                <span className="text-[10px] text-slate-300">تأكد من تفعيل إذن الكاميرا للمتصفح، أو استخدم الإدخال اليدوي أدناه.</span>
              </div>
            )}

            {/* خط ليزر المسح المتحرك */}
            {cameraStatus === 'running' && (
              <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 pointer-events-none z-20 flex flex-col items-center">
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-rose-500 to-transparent shadow-[0_0_12px_#f43f5e] animate-pulse"></div>
                <div className="w-full h-24 border-2 border-dashed border-white/60 rounded-xl mt-[-48px] shadow-sm"></div>
              </div>
            )}
          </div>

          <style>{`
            #interactive-barcode-reader { border: none !important; }
            #interactive-barcode-reader video { 
              border-radius: 1rem !important; 
              object-fit: cover !important; 
              width: 100% !important;
              max-height: 260px !important;
            }
            #interactive-barcode-reader__scan_region { border: none !important; }
            #interactive-barcode-reader__dashboard { display: none !important; }
          `}</style>

          {/* الباركودات السريعة للتجربة الفورية */}
          <div>
            <span className="text-[11px] font-bold text-slate-600 block mb-1.5">باركودات سريعة من المنتجات:</span>
            <div className="flex flex-wrap gap-1.5">
              {products.slice(0, 4).map(p => (
                <button
                  key={p.id}
                  onClick={() => handleLookup(p.barcode)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 rounded-lg text-[10.5px] font-mono text-slate-800 flex items-center gap-1 transition active:scale-95"
                >
                  <Barcode className="w-3 h-3 text-blue-600" />
                  <span>{p.barcode} ({p.name.slice(0, 10)})</span>
                </button>
              ))}
            </div>
          </div>

          {/* إدخال الباركود يدوياً */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-800 block">إدخال رقم الباركود يدوياً:</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => {
                  setManualCode(e.target.value);
                  setNotFoundMsg('');
                }}
                placeholder="أدخل رقم الباركود..."
                className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-900"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLookup();
                }}
              />
              <button
                onClick={() => handleLookup()}
                className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 active:scale-95 shadow-xs"
              >
                <Search className="w-3.5 h-3.5" />
                <span>إضافة</span>
              </button>
            </div>

            {/* بطاقة الباركود غير المسجل مع زر الإضافة السريعة */}
            {unregisteredCode && (
              <div className="p-3 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-300 rounded-2xl space-y-2.5 animate-in fade-in">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>تمت قراءة الباركود: <b className="font-mono text-slate-900 text-sm">{unregisteredCode}</b></span>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded text-2xs font-bold shrink-0">غير مسجل</span>
                </div>

                <p className="text-2xs text-amber-800">
                  هذا الصنف جديد وغير مضاف في قائمة منتجات المتجر بعد. هل ترغب في تسجيله وإضافته للسلة فوراً؟
                </p>

                {!isAddingQuick && !isLinkingQuick ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingQuick(true);
                        setIsLinkingQuick(false);
                      }}
                      className="py-2.5 px-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 text-white rounded-xl text-2xs font-black shadow transition active:scale-95 flex items-center justify-center gap-1"
                    >
                      <PackagePlus className="w-3.5 h-3.5" />
                      <span>➕ صنف جديد</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsLinkingQuick(true);
                        setIsAddingQuick(false);
                      }}
                      className="py-2.5 px-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white rounded-xl text-2xs font-black shadow transition active:scale-95 flex items-center justify-center gap-1"
                    >
                      <span>🏭🔗 ربطه كباركود مصنع</span>
                    </button>
                  </div>
                ) : isLinkingQuick ? (
                  <form onSubmit={handleQuickLinkProduct} className="space-y-2 pt-1 border-t border-amber-200">
                    <div>
                      <label className="block text-2xs font-bold text-slate-800 mb-0.5">اختر الصنف المراد ربط باركود المصنع به:</label>
                      <select
                        value={linkTargetProdId}
                        onChange={(e) => setLinkTargetProdId(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {products.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.barcode || 'بدون كود'}) - {p.sellingPrice} ر.س
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-2xs text-blue-700">
                      💡 سيتم حفظ باركود المصنع ({unregisteredCode}) لهذا الصنف، وسيتعرف عليه الكاشير فوراً في المرات القادمة.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="submit"
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow flex items-center justify-center gap-1 active:scale-95"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>تأكيد الربط وإضافة للسلة 🛒</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsLinkingQuick(false)}
                        className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold"
                      >
                        إلغاء
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleQuickAddProduct} className="space-y-2 pt-1 border-t border-amber-200">
                    <div>
                      <label className="block text-2xs font-bold text-slate-800 mb-0.5">اسم المنتج الجديد:</label>
                      <input
                        type="text"
                        required
                        autoFocus
                        value={quickProdName}
                        onChange={(e) => setQuickProdName(e.target.value)}
                        placeholder="مثال: باقة جوري / صنف جديد..."
                        className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-2xs font-bold text-slate-800 mb-0.5">سعر البيع (ر.س):</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={quickProdPrice}
                        onChange={(e) => setQuickProdPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="submit"
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow flex items-center justify-center gap-1 active:scale-95"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>حفظ وإضافة للسلة 🛒</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingQuick(false)}
                        className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold"
                      >
                        إلغاء
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {notFoundMsg && !unregisteredCode && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[11px] font-bold flex items-center gap-1.5 animate-in fade-in">
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>{notFoundMsg}</span>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
