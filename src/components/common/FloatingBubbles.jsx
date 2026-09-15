import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';

export const FloatingBubbles = () => {
  const { storeInfo } = useApp();
  const isCuteTheme = storeInfo?.themeId === 'cute_kawaii';

  // تشكيلة خفيفة وذكية من فقاعات الورد والكريستال بأداء عالي جداً واستهلاك شبه معدوم للمعالج
  const bubbles = useMemo(() => [
    { id: 1, size: 48, left: 8, duration: 18, delay: 0, swayDuration: 4 },
    { id: 2, size: 32, left: 24, duration: 15, delay: 4, swayDuration: 3.5 },
    { id: 3, size: 56, left: 45, duration: 20, delay: 2, swayDuration: 5 },
    { id: 4, size: 36, left: 65, duration: 16, delay: 7, swayDuration: 4 },
    { id: 5, size: 50, left: 82, duration: 19, delay: 3, swayDuration: 4.5 },
    { id: 6, size: 28, left: 93, duration: 14, delay: 8, swayDuration: 3.2 },
  ], []);

  // عناصر لطيفة وكيوت إضافية تطفو فقط عند تفعيل الثيم الطفولي الكيوت البلوري 🫧🎀
  const cuteFloatingElements = useMemo(() => [
    { id: 'c1', emoji: '🫧', size: 'text-xl', left: 14, duration: 18, delay: 1 },
    { id: 'c2', emoji: '🎀', size: 'text-lg', left: 38, duration: 20, delay: 6 },
    { id: 'c3', emoji: '🌸', size: 'text-lg', left: 72, duration: 19, delay: 3 },
  ], []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none">
      
      {/* توهج بلوري خفيف وسريع في الزوايا دون إجهاد كرت الشاشة */}
      <div className={`absolute -top-16 -right-16 w-64 h-64 rounded-full blur-2xl opacity-40 transition-opacity duration-700 pointer-events-none ${
        isCuteTheme ? 'bg-pink-400/20' : 'bg-pink-500/10'
      }`} />
      <div className={`absolute -bottom-16 -left-16 w-64 h-64 rounded-full blur-2xl opacity-40 transition-opacity duration-700 pointer-events-none ${
        isCuteTheme ? 'bg-sky-400/20' : 'bg-purple-600/10'
      }`} />

      {/* فقاعات الصابون والكرستال الحية العائمة */}
      {bubbles.map(b => (
        <div
          key={b.id}
          className="crystal-bubble"
          style={{
            width: `${b.size}px`,
            height: `${b.size}px`,
            left: `${b.left}%`,
            '--rise-duration': `${b.duration}s`,
            '--rise-delay': `${b.delay}s`,
            animation: `crystalBubbleRise ${b.duration}s linear infinite`,
            animationDelay: `${b.delay}s`
          }}
        />
      ))}

      {/* لمسات طفولية كيوت متحركة إضافية مخصصة للثيم الطفولي */}
      {isCuteTheme && cuteFloatingElements.map(el => (
        <div
          key={el.id}
          className={`absolute select-none pointer-events-none opacity-85 ${el.size}`}
          style={{
            left: `${el.left}%`,
            animation: `crystalBubbleRise ${el.duration}s linear infinite, crystalBubbleSway 4s ease-in-out infinite`,
            animationDelay: `${el.delay}s`
          }}
        >
          {el.emoji}
        </div>
      ))}

    </div>
  );
};

