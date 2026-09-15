import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Lock, Delete, AlertCircle, Radio, CheckCircle2, LogOut } from 'lucide-react';
import { checkPinAttempt, recordFailedPin, clearPinAttempts } from '../../utils/security';

export const PinLockModal = ({ onLoginSuccess }) => {
  const { isLocked, isInactivityLock, loginWithPin, loginWithNfc, storeInfo, users, currentUser, firebaseUser, logoutFirebase } = useApp();
  // البوابة مفتوحة أيضاً حين لا يوجد موظف محدد بعد (مباشرة بعد دخول البريد)
  const gateOpen = isLocked || !currentUser;
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isScanningNfc, setIsScanningNfc] = useState(false);

  useEffect(() => {
    if (gateOpen) {
      setPin('');
      setError('');
      setSuccess('');
      startWebNfcListener();
    }
  }, [gateOpen]);

  const startWebNfcListener = async () => {
    if ('NDEFReader' in window) {
      try {
        setIsScanningNfc(true);
        const ndef = new window.NDEFReader();
        await ndef.scan();
        ndef.onreading = (event) => {
          const serial = event.serialNumber || '';
          if (serial) {
            handleNfcVerification(serial);
          }
        };
      } catch (err) {
        setIsScanningNfc(false);
      }
    }
  };

  const handleNfcVerification = (cardId) => {
    if (!cardId) return;
    const res = loginWithNfc(cardId);
    if (res.success) {
      setSuccess(res.message);
      setError('');
      setTimeout(() => {
        setPin('');
        if (onLoginSuccess) onLoginSuccess(res.user);
      }, 400);
    } else {
      setError(res.message || 'بطاقة NFC غير مسجلة!');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleDigit = (digit) => {
    if (pin.length >= 6) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError('');

    // تحقق تلقائي عند إدخال 4 أرقام
    if (newPin.length === 4) {
      verifyPin(newPin);
    }
  };

  const verifyPin = (pinToVerify) => {
    // بوابة الحد من المحاولات — تُفحص قبل أي محاولة تحقق فعلية
    const gate = checkPinAttempt('global');
    if (!gate.allowed) {
      setError(gate.message);
      setTimeout(() => { setPin(''); setError(''); }, 1200);
      return;
    }

    const res = loginWithPin(pinToVerify);
    if (res.success) {
      clearPinAttempts('global');
      setSuccess(`تم التحقق بنجاح! مرحباً بك: ${res.user?.name} 🌸`);
      setError('');
      setTimeout(() => {
        setPin('');
        if (onLoginSuccess) onLoginSuccess(res.user);
      }, 400);
    } else {
      recordFailedPin('global');
      setError(res.message || 'الرمز السري غير صحيح ❌');
      setTimeout(() => {
        setPin('');
        setError('');
      }, 600);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  // دعم الكتابة عبر لوحة المفاتيح وقارئ الباركود/RFID
  useEffect(() => {
    if (!gateOpen) return;

    let rfidBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e) => {
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      if (/^[0-9]$/.test(e.key) && timeDiff > 60) {
        handleDigit(e.key);
        return;
      }

      if (e.key === 'Backspace') {
        handleDelete();
        return;
      }

      if (e.key === 'Enter') {
        const scanned = rfidBuffer.trim();
        if (scanned.length >= 3) {
          handleNfcVerification(scanned);
          rfidBuffer = '';
          return;
        }
        if (pin.length >= 3) {
          verifyPin(pin);
        }
        rfidBuffer = '';
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey) {
        rfidBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gateOpen, pin, users]);

  if (!gateOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-slate-950 via-[#260533] to-slate-950 flex flex-col items-center justify-center p-4 text-white select-none font-cairo">
      
      {/* شعار المتجر الملكي واسم البرنامج */}
      <div className="text-center mb-4 flex flex-col items-center">
        <div className="w-20 h-20 rounded-3xl bg-black flex items-center justify-center mx-auto mb-2 shadow-2xl shadow-purple-950/80 border-2 border-pink-500/50 relative overflow-hidden p-1">
          <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-xl font-black text-white">
          {storeInfo?.appName || storeInfo?.name || 'بيت الورد'}
        </h1>
        <p className="text-xs text-pink-300/80 mt-0.5 font-medium">أدخل رمزك السري الشخصي لتحديد من يعمل على الجهاز 🌸</p>
      </div>

      {/* الحساب المسجّل حالياً + مخرج للتبديل إلى حساب بريد آخر */}
      {firebaseUser?.email && (
        <div className="mb-3 w-full max-w-[300px] px-3 py-2 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
          <div className="flex flex-col text-right min-w-0">
            <span className="text-[10px] text-pink-300/70 font-bold">الحساب المسجّل</span>
            <span className="text-[11px] text-white font-bold truncate" dir="ltr">{firebaseUser.email}</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (window.confirm('تسجيل الخروج من هذا البريد والعودة لشاشة الدخول؟')) {
                await logoutFirebase();
              }
            }}
            className="shrink-0 px-2.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 border border-rose-400/30 text-rose-200 text-[10px] font-black transition active:scale-95 flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      )}

      {/* تنبيه القفل التلقائي لعدم النشاط مع طمأنة الكاشير بحفظ حالة الوردية */}
      {isInactivityLock && (
        <div className="mb-3 max-w-sm px-3.5 py-2 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-bold text-center shadow-lg shadow-amber-950/40 flex items-center justify-center gap-2 animate-in zoom-in-95">
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>تم قفل الشاشة تلقائياً لعدم النشاط • الوردية محفوظة كما هي وستستأنف فور الدخول 🌸</span>
        </div>
      )}

      {/* بطاقة قارئ NFC التفاعلية */}
      <div 
        onClick={() => {
          const code = prompt('أدخل رقم بطاقة NFC أو امسحها بقارئ RFID:');
          if (code) handleNfcVerification(code);
        }}
        className="w-full max-w-[280px] mb-3.5 p-2.5 rounded-2xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center gap-2 cursor-pointer hover:bg-purple-900/70 transition active:scale-98 shadow-sm"
        title="انقر لمسح بطاقة NFC"
      >
        <Radio className="w-4 h-4 text-purple-300 animate-pulse" />
        <span className="text-xs font-bold text-purple-200">
          {isScanningNfc ? '📲 قرّب بطاقة NFC الآن...' : '💳 قارئ NFC / RFID جاهز للمسح'}
        </span>
      </div>

      {/* دوائر عرض الـ PIN */}
      <div className="flex items-center justify-center gap-4 mb-3.5">
        {[0, 1, 2, 3].map((idx) => (
          <div
            key={idx}
            className={`w-4.5 h-4.5 rounded-full border-2 transition-all duration-200 ${
              pin.length > idx 
                ? 'bg-pink-500 border-pink-300 scale-110 shadow-lg shadow-pink-500/70' 
                : 'border-pink-900 bg-pink-950/80'
            }`}
          />
        ))}
      </div>

      {/* رسالة الخطأ أو النجاح */}
      {error && (
        <div className="mb-3 text-xs text-rose-300 flex items-center gap-1.5 bg-rose-500/20 px-3 py-1.5 rounded-xl border border-rose-500/30 animate-shake">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-3 text-xs text-emerald-300 flex items-center gap-1.5 bg-emerald-500/20 px-3 py-1.5 rounded-xl border border-emerald-500/30">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* لوحة الأرقام (Keypad) */}
      <div className="grid grid-cols-3 gap-2.5 w-full max-w-[280px]">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <button
            key={digit}
            onClick={() => handleDigit(String(digit))}
            className="h-13 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-pink-600 text-white text-xl font-bold border border-white/10 shadow transition active:scale-95 flex items-center justify-center"
          >
            {digit}
          </button>
        ))}
        
        <button
          onClick={handleClear}
          className="h-13 rounded-2xl bg-white/5 hover:bg-white/10 text-pink-300 hover:text-white text-xs font-semibold border border-white/5 transition active:scale-95 flex items-center justify-center"
        >
          مسح
        </button>

        <button
          onClick={() => handleDigit('0')}
          className="h-13 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-pink-600 text-white text-xl font-bold border border-white/10 shadow transition active:scale-95 flex items-center justify-center"
        >
          0
        </button>

        <button
          onClick={handleDelete}
          className="h-13 rounded-2xl bg-white/5 hover:bg-white/10 text-pink-300 hover:text-white border border-white/5 transition active:scale-95 flex items-center justify-center"
        >
          <Delete className="w-5 h-5" />
        </button>
      </div>

    </div>
  );
};
