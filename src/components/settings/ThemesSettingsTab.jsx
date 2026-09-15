import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Sparkles, CheckCircle, Save, Check, Layers } from 'lucide-react';
import { THEME_PRESETS, ARABIC_FONTS } from '../../utils/themes';

export const ThemesSettingsTab = () => {
  const { storeInfo, updateStoreInfo } = useApp();

  const [selectedThemeId, setSelectedThemeId] = useState(storeInfo.themeId || 'pink_classic');
  const [selectedFont, setSelectedFont] = useState(storeInfo.fontFamily || 'Cairo');
  const [selectedFontSize, setSelectedFontSize] = useState(storeInfo.fontSize || 'normal');
  const [showBubbles, setShowBubbles] = useState(storeInfo.showFloatingBubbles !== false);
  const [cardGlass, setCardGlass] = useState(storeInfo.cardGlassEffect !== false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const currentTheme = THEME_PRESETS.find(t => t.id === selectedThemeId) || THEME_PRESETS[0];

  const handleApplyAndSave = (themeId = selectedThemeId, font = selectedFont, fontSize = selectedFontSize, bubbles = showBubbles, glass = cardGlass) => {
    const chosenTheme = THEME_PRESETS.find(t => t.id === themeId) || THEME_PRESETS[0];
    
    const updated = {
      ...storeInfo,
      themeId: themeId,
      themeName: chosenTheme.name,
      primaryColor: chosenTheme.primaryColor,
      primaryGradient: chosenTheme.primaryGradient,
      secondaryGradient: chosenTheme.secondaryGradient,
      headerGradient: chosenTheme.headerGradient,
      headerBorder: chosenTheme.headerBorder,
      bgClass: chosenTheme.bgClass,
      darkTheme: chosenTheme.dark,
      cardBg: chosenTheme.cardBg,
      borderColor: chosenTheme.borderColor,
      textColor: chosenTheme.textColor,
      buttonColor: chosenTheme.buttonColor,
      fontFamily: font,
      fontSize: fontSize,
      showFloatingBubbles: bubbles,
      cardGlassEffect: glass
    };

    updateStoreInfo(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200 font-cairo">
      
      {/* إشعار الحفظ الناجح */}
      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-950 text-xs font-bold flex items-center justify-between shadow-sm animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <span>تم تطبيق وحفظ الثيم والمظهر بنجاح! 🌸</span>
          </div>
          <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2.5 py-1 rounded-lg">منعكس على كامل النظام ✅</span>
        </div>
      )}

      {/* رأس القسم */}
      <div className="bg-gradient-to-r from-[#2A0845] via-[#6B0F3B] to-[#1E1B4B] text-white p-5 rounded-3xl shadow-xl border border-pink-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-2xl border border-white/20 shadow-inner">
            🎨
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black">مركز الثيمات والمظهر والألوان الفاخرة 🌸</h3>
              <span className="bg-pink-500/30 text-pink-200 border border-pink-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {THEME_PRESETS.length} ثيمات ملكية
              </span>
            </div>
            <p className="text-xs text-pink-200/80 mt-0.5">
              تخصيص ثيم وألوان التطبيق، ثيمات ليلية داكنة فخمة، مظهر طفولي كيوت بلوري وفقاعات، والخطوط بنقرة واحدة.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleApplyAndSave()}
          className="px-5 py-2.5 bg-gradient-to-r from-pink-500 via-rose-500 to-purple-600 hover:from-pink-400 text-white rounded-2xl text-xs font-black shadow-lg shadow-pink-500/30 transition active:scale-95 flex items-center gap-2 shrink-0 border border-pink-300/30"
        >
          <Save className="w-4 h-4" />
          <span>💾 حفظ وتطبيق الثيم</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. قائمة الثيمات الملكية الجاهزة */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-pink-100 pb-2">
          <h4 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-pink-100 text-pink-700 flex items-center justify-center text-xs font-bold">①</span>
            <span>اختر الثيم اللوني المفضل للمتجر:</span>
          </h4>
          <span className="text-[11px] text-pink-600 font-bold">تطبيق فوري ومعاينة حية</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
          {THEME_PRESETS.map(theme => {
            const isSelected = selectedThemeId === theme.id;
            const isDark = theme.dark;
            const isCute = theme.id === 'cute_kawaii';

            return (
              <div
                key={theme.id}
                onClick={() => {
                  setSelectedThemeId(theme.id);
                  handleApplyAndSave(theme.id, selectedFont, selectedFontSize, showBubbles, cardGlass);
                }}
                className={`p-4 rounded-3xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 relative shadow-sm hover:shadow-md active:scale-98 ${
                  isSelected
                    ? isDark
                      ? 'border-purple-400 ring-2 ring-purple-400/40 bg-slate-900 text-white shadow-purple-950/50'
                      : isCute
                      ? 'border-pink-400 ring-2 ring-pink-300/60 bg-gradient-to-br from-pink-50 via-purple-50 to-sky-50 shadow-pink-200'
                      : 'border-pink-500 ring-2 ring-pink-400/30 bg-pink-50/40 shadow-pink-100'
                    : isDark
                    ? 'border-slate-800 bg-slate-900/90 text-slate-200 hover:border-slate-700'
                    : isCute
                    ? 'border-pink-200 bg-gradient-to-br from-white via-pink-50/30 to-sky-50/20 hover:border-pink-300 text-slate-800'
                    : 'border-slate-200/80 bg-white hover:border-pink-200 text-slate-800'
                }`}
              >
                {/* الرأس: الاسم والشارة */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h5 className={`text-xs sm:text-sm font-black leading-snug ${isDark ? 'text-white' : 'text-slate-800'}`}>
                      {theme.name}
                    </h5>
                    {isSelected && (
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-sm text-white ${
                        isDark ? 'bg-purple-500' : isCute ? 'bg-pink-500' : 'bg-pink-600'
                      }`}>
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <p className={`text-[10px] mt-1 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {theme.desc}
                  </p>
                </div>

                {/* لوحة تدرج الألوان للشريط والأزرار */}
                <div className={`space-y-2 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                  {/* شريط محاكاة الهيدر */}
                  <div className={`h-6 rounded-xl bg-gradient-to-r ${theme.headerGradient} p-1 flex items-center justify-between px-2 text-white shadow-inner`}>
                    <span className="text-[9px] font-bold">{isCute ? '🫧 بيت الورد' : isDark ? '🌙 بيت الورد' : '🌸 بيت الورد'}</span>
                    <span className="text-[8px] opacity-80">9:41 AM</span>
                  </div>

                  {/* دوائر درجات الألوان */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {theme.previewColors.map((col, idx) => (
                        <span
                          key={idx}
                          className="w-4 h-4 rounded-full border border-black/15 shadow-sm"
                          style={{ backgroundColor: col }}
                        />
                      ))}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      isSelected
                        ? isDark
                          ? 'bg-purple-500 text-white'
                          : isCute
                          ? 'bg-gradient-to-r from-pink-500 to-sky-500 text-white shadow-xs'
                          : 'bg-pink-600 text-white'
                        : isDark
                        ? 'bg-slate-800 text-slate-300'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {theme.badge}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. اختيار نوع الخط العربي وحجمه */}
      {/* ========================================================================= */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between border-b border-pink-100 pb-2">
          <h4 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">②</span>
            <span>الخط العربي وحجم النصوص:</span>
          </h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {ARABIC_FONTS.map(font => {
            const isSelected = selectedFont === font.id;
            return (
              <button
                key={font.id}
                type="button"
                onClick={() => {
                  setSelectedFont(font.id);
                  handleApplyAndSave(selectedThemeId, font.id, selectedFontSize, showBubbles, cardGlass);
                }}
                className={`p-3.5 rounded-2xl border text-right transition flex flex-col justify-between gap-1.5 active:scale-95 ${
                  isSelected
                    ? 'border-purple-600 bg-purple-50 ring-2 ring-purple-400/20 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-pink-200'
                }`}
                style={{ fontFamily: font.id }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800">{font.name}</span>
                  {isSelected && <Check className="w-4 h-4 text-purple-600" />}
                </div>
                <p className="text-[10px] text-slate-500 font-medium leading-tight">{font.desc}</p>
                <span className="text-[11px] text-pink-600 font-bold mt-1">تجربة النص: 125.00 ر.س</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. المؤثرات البصرية وتجربة العرض */}
      {/* ========================================================================= */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between border-b border-pink-100 pb-2">
          <h4 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-pink-100 text-pink-700 flex items-center justify-center text-xs font-bold">③</span>
            <span>المؤثرات البصرية وحركات الخلفية:</span>
          </h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          
          {/* تبديل فقاعات الورد المتحركة */}
          <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-pink-500" />
              <div>
                <span className="text-xs font-black text-slate-800 block">فقاعات الكرستال والصابون البلورية العائمة 🫧✨</span>
                <span className="text-[10px] text-slate-500">حركة فقاعات كرستالية ساحرة تطفو بنعومة في خلفية النظام</span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showBubbles}
                onChange={e => {
                  setShowBubbles(e.target.checked);
                  handleApplyAndSave(selectedThemeId, selectedFont, selectedFontSize, e.target.checked, cardGlass);
                }}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600"></div>
            </label>
          </div>

          {/* تبديل النمط الزجاجي البلوري */}
          <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <Layers className="w-5 h-5 text-purple-500" />
              <div>
                <span className="text-xs font-black text-slate-800 block">النمط الزجاجي البلوري (Glassmorphism)</span>
                <span className="text-[10px] text-slate-500">خلفيات شبه شفافة وضبابية أنيقة للكروت والأشرطة</span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={cardGlass}
                onChange={e => {
                  setCardGlass(e.target.checked);
                  handleApplyAndSave(selectedThemeId, selectedFont, selectedFontSize, showBubbles, e.target.checked);
                }}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

        </div>
      </div>

    </div>
  );
};
