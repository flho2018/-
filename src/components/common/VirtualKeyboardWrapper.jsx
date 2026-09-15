import React, { useState, useEffect, useRef } from 'react';
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';
import { X, Globe, Keyboard as KeyboardIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const VirtualKeyboardWrapper = () => {
  const { storeInfo } = useApp();
  const [inputElement, setInputElement] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [layoutName, setLayoutName] = useState('default');
  const [currentLang, setCurrentLang] = useState('arabic');
  const keyboardRef = useRef();
  
  const [isShift, setIsShift] = useState(false);
  const [isCaps, setIsCaps] = useState(false);

  // =========================================================================
  //  لوحة عائمة: تُسحب ويتغيّر حجمها
  // =========================================================================
  //  كانت مثبّتة أسفل الشاشة بعرض كامل فتغطّي نحو ثلث الواجهة وتحجب السلة
  //  وأزرار الدفع. الآن: تُسحب من شريطها العلوي إلى أي مكان، ولها ثلاثة
  //  أحجام، ويُحفظ الموضع والحجم فلا يُعاد ضبطها كل مرة.
  // =========================================================================
  const SIZES = { sm: { key: 34, width: 520, font: 14 }, md: { key: 46, width: 820, font: 17 }, lg: { key: 58, width: 1080, font: 20 } };

  const [sizeMode, setSizeMode] = useState(() => {
    try { return localStorage.getItem('bw_kb_size') || 'sm'; } catch (e) { return 'sm'; }
  });
  // null = مرسوّة أسفل الشاشة (الوضع الافتراضي)
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem('bw_kb_pos');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  });
  const dragRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem('bw_kb_size', sizeMode); } catch (e) {}
  }, [sizeMode]);

  useEffect(() => {
    try {
      if (pos) localStorage.setItem('bw_kb_pos', JSON.stringify(pos));
      else localStorage.removeItem('bw_kb_pos');
    } catch (e) {}
  }, [pos]);

  // =========================================================================
  //  الرسو التلقائي — الأهم: ألّا تغطّي اللوحة الحقل الذي يكتب فيه المستخدم
  // =========================================================================
  //  السحب اليدوي وحده لا يكفي: الكاشير لا يجب أن يسحب اللوحة في كل مرة.
  //  فعند تركيز أي حقل نقيس موضعه: إن لم تتّسع المساحة تحته نرسو أعلى
  //  الشاشة بدل أسفلها. ولو حرّكها المستخدم يدوياً احترمنا اختياره ولم نتدخّل.
  // =========================================================================
  const [dock, setDock] = useState('bottom');

  const panelHeightFor = (mode) => (mode === 'sm' ? 250 : mode === 'md' ? 330 : 410);

  // مرجع متجدّد حتى تستدعيه معالِجات التركيز بلا إعادة تسجيلها
  const autoPlaceRef = useRef(() => {});
  autoPlaceRef.current = (target) => {
    if (pos) return; // حرّكها المستخدم يدوياً — لا نغيّر مكانه
    if (!target || typeof target.getBoundingClientRect !== 'function') return;
    const r = target.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    setDock(spaceBelow < panelHeightFor(sizeMode) + 24 ? 'top' : 'bottom');
  };

  // =========================================================================
  //  السحب — بأحداث المؤشّر مع التقاطه (setPointerCapture)
  // =========================================================================
  //  النسخة السابقة استعملت mousemove على window ولم تكن تستجيب: أي عنصر
  //  يبتلع الحدث أو يعيد التركيز أثناء السحب كان يقطعه. التقاط المؤشّر يضمن
  //  وصول كل الحركات إلى الشريط نفسه حتى لو خرج المؤشّر عن حدوده.
  // =========================================================================
  //  ⚠️ اللمس: أحداث المؤشّر وحدها لا تكفي على شاشات اللمس — المتصفح يُلغي
  //  التسلسل (pointercancel) فور اعتباره الإيماءة تمريراً للصفحة، فيتوقف
  //  السحب. لذلك نفصل حساب السحب عن نوع الحدث، ونربطه بأحداث اللمس صراحةً
  //  إضافةً إلى المؤشّر، مع touch-action: none على الشريط والحاوية.
  const beginDragAt = (clientX, clientY, target) => {
    const panel = target.closest('.virtual-keyboard-container');
    if (!panel) return false;
    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
      width: rect.width
    };
    // أول سحبة تفكّ الرسو فتصبح عائمة من مكانها الحالي
    if (!pos) setPos({ x: rect.left, y: rect.top });
    return true;
  };

  const moveDragTo = (clientX, clientY) => {
    const d = dragRef.current;
    if (!d) return;
    const maxX = Math.max(0, window.innerWidth - d.width);
    const maxY = Math.max(0, window.innerHeight - 60);
    setPos({
      x: Math.min(maxX, Math.max(0, clientX - d.offsetX)),
      y: Math.min(maxY, Math.max(0, clientY - d.offsetY))
    });
  };

  const startDrag = (e) => {
    if (!beginDragAt(e.clientX, e.clientY, e.currentTarget)) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault(); // يمنع انتقال التركيز بعيداً عن حقل الكتابة
  };

  const onDragMove = (e) => {
    if (!dragRef.current) return;
    moveDragTo(e.clientX, e.clientY);
    e.preventDefault();
  };

  const endDrag = (e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) {}
  };

  // مسار اللمس الصريح (يعمل حتى لو أُلغيت أحداث المؤشّر)
  const startTouchDrag = (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    beginDragAt(t.clientX, t.clientY, e.currentTarget);
  };

  const onTouchDragMove = (e) => {
    const t = e.touches && e.touches[0];
    if (!t || !dragRef.current) return;
    moveDragTo(t.clientX, t.clientY);
    if (e.cancelable) e.preventDefault(); // يمنع تمرير الصفحة أثناء السحب
  };

  const endTouchDrag = () => { dragRef.current = null; };

  const cycleSize = () => {
    setSizeMode(prev => (prev === 'sm' ? 'md' : prev === 'md' ? 'lg' : 'sm'));
  };

  const arabicLayout = {
    default: [
      "ض ص ث ق ف غ ع ه خ ح ج د",
      "ش س ي ب ل ا ت ن م ك ط",
      "ئ ء ؤ ر لا ى ة و ز ظ",
      "{space} {bksp}"
    ]
  };

  const englishLayout = {
    default: [
      "q w e r t y u i o p",
      "a s d f g h j k l",
      "{shift} z x c v b n m",
      "{space} {bksp}"
    ],
    shift: [
      "Q W E R T Y U I O P",
      "A S D F G H J K L",
      "{shift} Z X C V B N M",
      "{space} {bksp}"
    ]
  };
  
  const numberLayout = {
    default: [
      "1 2 3",
      "4 5 6",
      "7 8 9",
      "0 . {bksp}"
    ]
  };

  const isDesktop = !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isEnabledInSettings = storeInfo?.enableVirtualKeyboard !== false;

  useEffect(() => {
    if (!isDesktop || !isEnabledInSettings) return;

    const handleFocus = (event) => {
      const target = event.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        if (['checkbox', 'radio', 'file', 'color', 'date', 'time', 'hidden', 'range'].includes(target.type)) return;
        
        // بعد كل ضغطة مفتاح نعيد التركيز إلى الحقل نفسه، فيُطلق focusin من جديد.
        // لولا هذا الشرط لأعادت القاعدة أدناه اللغة إلى العربية بعد كل رقم.
        const isSameField = inputElement === target;
        setInputElement(target);

        // اللغة تتغيّر فقط عند الانتقال لحقل آخر
        if (!isSameField) {
          if (target.type === 'number' || target.type === 'tel') {
              setCurrentLang('numbers');
          } else if (currentLang === 'numbers') {
              setCurrentLang('arabic');
          }
        }

        if (keyboardRef.current) {
          keyboardRef.current.setInput(target.value);
        }
        autoPlaceRef.current(target);
        setIsVisible(true);
      }
    };

    const handleClick = (e) => {
        const target = e.target;
        
        // Show if clicking on an input (even if already focused)
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            if (!['checkbox', 'radio', 'file', 'color', 'date', 'time', 'hidden', 'range'].includes(target.type)) {
                const isSameField = inputElement === target;
                setInputElement(target);
                // اللغة تتغيّر فقط عند الانتقال لحقل آخر
                if (!isSameField) {
                    if (target.type === 'number' || target.type === 'tel') {
                        setCurrentLang('numbers');
                    } else if (currentLang === 'numbers') {
                        setCurrentLang('arabic');
                    }
                }
                if (keyboardRef.current) keyboardRef.current.setInput(target.value);
                autoPlaceRef.current(target);
                setIsVisible(true);
            }
            return;
        }

        if (!isVisible) return;
        
        if (e.target.closest('.hg-theme-default') || e.target.closest('.virtual-keyboard-container')) {
            if (inputElement) {
                setTimeout(() => {
                    inputElement.focus();
                }, 10);
            }
            return;
        }

        setIsVisible(false);
        setInputElement(null);
    };

    document.addEventListener('focusin', handleFocus);
    document.addEventListener('pointerdown', handleClick);

    return () => {
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('pointerdown', handleClick);
    };
  }, [isDesktop, isEnabledInSettings, currentLang, isVisible, inputElement]);

  const onChange = (input) => {
    if (inputElement) {
      inputElement.value = input;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(inputElement, input);
        const ev = new Event('input', { bubbles: true });
        inputElement.dispatchEvent(ev);
      }
    }
  };

  const onKeyPress = (button) => {
    if (button === "{shift}") {
      setIsShift(!isShift);
      setLayoutName((!isShift || isCaps) ? "shift" : "default");
    } else if (button === "{lock}") {
      setIsCaps(!isCaps);
      setLayoutName((isShift || !isCaps) ? "shift" : "default");
    } else {
        if (isShift) {
            setIsShift(false);
            setLayoutName(isCaps ? "shift" : "default");
        }
    }
  };

  const toggleLang = () => {
    if (currentLang === 'arabic') setCurrentLang('english');
    else if (currentLang === 'english') setCurrentLang('numbers');
    else setCurrentLang('arabic');
    
    setIsShift(false);
    setLayoutName(isCaps && currentLang === 'arabic' ? "shift" : "default");
  };

  if (!isDesktop || !isEnabledInSettings || !isVisible) return null;

  const currentLayout = currentLang === 'arabic' ? arabicLayout : currentLang === 'english' ? englishLayout : numberLayout;

  return (
    <div
      className="virtual-keyboard-container fixed z-[99999] bg-slate-50 border-2 border-indigo-200 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.25)] p-2 transition-[width] select-none"
      style={{
        touchAction: 'none',
        ...(pos
          ? { left: pos.x, top: pos.y, width: SIZES[sizeMode].width, maxWidth: '98vw' }
          : dock === 'top'
            ? { left: '50%', top: 8, transform: 'translateX(-50%)', width: SIZES[sizeMode].width, maxWidth: '98vw' }
            : { left: '50%', bottom: 8, transform: 'translateX(-50%)', width: SIZES[sizeMode].width, maxWidth: '98vw' })
      }}
    >
      <div className="flex flex-col gap-2">
        <div
          onPointerDown={startDrag}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onTouchStart={startTouchDrag}
          onTouchMove={onTouchDragMove}
          onTouchEnd={endTouchDrag}
          onTouchCancel={endTouchDrag}
          style={{ touchAction: 'none', WebkitUserSelect: 'none' }}
          title="اسحب لتحريك اللوحة (يعمل باللمس أيضاً)"
          className="flex justify-between items-center bg-white rounded-xl px-3 py-1.5 border border-slate-200 shadow-sm cursor-move gap-2"
        >
            <div className="font-bold text-slate-700 flex items-center gap-2 min-w-0">
                <KeyboardIcon className="text-indigo-600 shrink-0" size={16} />
                <span className="text-xs truncate">لوحة المفاتيح الذكية</span>
                <span className="text-[10px] text-slate-400 shrink-0">⠿ اسحب</span>
            </div>
            {/*
              أزرار التحكّم داخل شريط السحب. كان إيقاف mousedown وحده لا يكفي:
              startDrag مربوط بـ onPointerDown ويستدعي preventDefault، وهذا يُلغي
              أحداث الفأرة التالية ومنها click — فلا يعمل أي زر هنا (اللغة والحجم).
              لذلك نوقف انتشار pointerdown و touchstart أيضاً عند الأزرار.
            */}
            <div
              className="flex gap-1.5 shrink-0"
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
                <button
                    onClick={cycleSize}
                    title="تغيير حجم اللوحة (صغيرة / متوسطة / كبيرة)"
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-black transition-colors border border-slate-200"
                >
                    {sizeMode === 'sm' ? 'صغيرة' : sizeMode === 'md' ? 'متوسطة' : 'كبيرة'}
                </button>
                {pos && (
                  <button
                      onClick={() => setPos(null)}
                      title="إرجاعها لأسفل الشاشة"
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-black transition-colors border border-slate-200"
                  >
                      ↓ رسو
                  </button>
                )}
                <button
                    onClick={toggleLang}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                    <Globe size={14} />
                    {currentLang === 'arabic' ? 'عربي' : currentLang === 'english' ? 'English' : 'أرقام'}
                </button>
                <button
                    onClick={() => setIsVisible(false)}
                    className="bg-rose-100 hover:bg-rose-200 text-rose-700 px-2 py-1 rounded-lg transition-colors font-bold text-xs shadow-sm"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
        
        <div className="bg-white p-2 rounded-b-xl shadow-inner border border-slate-200" dir="ltr">
            <style dangerouslySetInnerHTML={{__html: `
                .hg-theme-default { font-family: 'Cairo', sans-serif !important; background-color: transparent !important; }
                .hg-button { height: ${SIZES[sizeMode].key}px !important; border-radius: 8px !important; box-shadow: 0 2px 0 rgba(0,0,0,0.1) !important; font-size: ${SIZES[sizeMode].font}px !important; font-weight: bold !important; color: #334155 !important; background: #ffffff !important; border: 1px solid #e2e8f0 !important; }
                .hg-button:active { transform: translateY(2px) !important; box-shadow: none !important; background: #f8fafc !important; }
                .hg-button-space { width: 40% !important; }
                .hg-button-bksp { background: #fee2e2 !important; color: #ef4444 !important; border-color: #fecaca !important; }
                .hg-button-shift { background: #e0e7ff !important; color: #4f46e5 !important; border-color: #c7d2fe !important; }
            `}} />
            <Keyboard
            keyboardRef={r => (keyboardRef.current = r)}
            layoutName={layoutName}
            onChange={onChange}
            onKeyPress={onKeyPress}
            layout={currentLayout}
            display={{
                '{bksp}': 'مسح ⌫',
                '{enter}': 'إدخال ↵',
                '{shift}': 'Shift ⇧',
                '{space}': 'مسافة ␣',
                '{tab}': 'Tab ⇥',
                '{lock}': 'Caps ⇪'
            }}
            theme="hg-theme-default hg-layout-default myTheme"
            />
        </div>
      </div>
    </div>
  );
};
