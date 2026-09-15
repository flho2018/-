import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { ShieldCheck, X, Delete, AlertCircle, CheckCircle2, Radio, KeyRound } from 'lucide-react';

export const UserSwitchModal = ({ isOpen, onClose, onSuccess }) => {
  const { 
    loginWithPin, 
    loginWithNfc, 
    currentUser,
    users 
  } = useApp();

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isScanningNfc, setIsScanningNfc] = useState(false);

  // إعادة التعيين عند فتح النافذة
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setSuccess('');
      startWebNfcListener();
    }
  }, [isOpen]);

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
        if (onSuccess) onSuccess(res.user);
        onClose();
      }, 400);
    } else {
      setError(res.message || 'بطاقة NFC غير مسجلة!');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleDigit = (digit) => {
    if (pin.length >= 6) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    setError('');

    // التحقق التلقائي عند إدخال 4 أرقام
    if (nextPin.length === 4) {
      verifyPin(nextPin);
    }
  };

  const verifyPin = (pinToVerify) => {
    const res = loginWithPin(pinToVerify, null);
    if (res.success) {
      setSuccess(`تم التحقق بنجاح! مرحباً بك: ${res.user?.name} 🌸`);
      setError('');
      setTimeout(() => {
        if (onSuccess) onSuccess(res.user);
        onClose();
      }, 400);
    } else {
      setError(res.message || 'الرمز السري غير صحيح ❌');
      setTimeout(() => {
        setPin('');
        setError('');
      }, 700);
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
    if (!isOpen) return;

    let rfidBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e) => {
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // التعامل مع لوحة الأرقام العادية
      if (/^[0-9]$/.test(e.key) && timeDiff > 60) {
        handleDigit(e.key);
        return;
      }

      if (e.key === 'Backspace') {
        handleDelete();
        return;
      }

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // قراءة RFID / ماسح البطاقات السريع
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
  }, [isOpen, pin, users]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-md animate-in fade-in select-none font-cairo">
      <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-[#1e0728] w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-pink-500/30 text-white space-y-4 animate-in zoom-in-95 relative overflow-hidden flex flex-col">
        
        {/* زر الإغلاق */}
        <div className="flex items-center justify-between z-10">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-950/70 border border-pink-500/30 text-[10px] text-pink-300 font-bold">
            <Radio className="w-3 h-3 text-pink-400 animate-pulse" />
            <span>جاهز للمسح أو PIN</span>
          </div>

          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 text-pink-300/70 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* الرأس: شعار والتحقق */}
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-600 via-rose-600 to-purple-600 flex items-center justify-center mx-auto mb-2 shadow-lg shadow-pink-600/30 border border-pink-400/40">
            <KeyRound className="w-6 h-6 text-white" />
          </div>
          <h2 className="font-extrabold text-base text-white">
            تبديل المستخدم والكاشير
          </h2>
          <p className="text-[11px] text-pink-200/80 mt-0.5 font-medium">
            أدخل الرمز السري (PIN) أو مرر بطاقة NFC للتبديل الفوري
          </p>
        </div>

        {/* المستخدم الحالي */}
        {currentUser && (
          <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">الحساب الحالي:</span>
            <strong className="text-pink-300 font-bold">{currentUser.name}</strong>
          </div>
        )}

        {/* مؤشر دوائر الـ PIN */}
        <div className="flex items-center justify-center gap-3.5 py-2">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                pin.length > idx 
                  ? 'bg-pink-500 border-pink-300 scale-110 shadow-lg shadow-pink-500/70' 
                  : 'border-pink-900 bg-pink-950/60'
              }`}
            />
          ))}
        </div>

        {/* رسائل النجاح والخطأ */}
        {error && (
          <div className="p-2 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs font-bold flex items-center justify-center gap-1.5 animate-shake">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-xs font-bold flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* لوحة المفاتيح الرقمية */}
        <div className="grid grid-cols-3 gap-2 text-sm font-black">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(String(num))}
              className="py-3 bg-white/10 hover:bg-white/20 active:bg-pink-600 rounded-2xl text-base font-bold text-white transition active:scale-95 shadow-sm border border-white/5"
            >
              {num}
            </button>
          ))}
          
          <button
            type="button"
            onClick={handleClear}
            className="py-3 bg-white/5 hover:bg-white/10 active:bg-rose-900/60 rounded-2xl text-xs font-bold text-pink-300 transition active:scale-95 border border-white/5"
          >
            مسح
          </button>

          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="py-3 bg-white/10 hover:bg-white/20 active:bg-pink-600 rounded-2xl text-base font-bold text-white transition active:scale-95 shadow-sm border border-white/5"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="py-3 bg-white/5 hover:bg-white/10 active:bg-pink-950 rounded-2xl text-pink-300 flex items-center justify-center transition active:scale-95 border border-white/5"
            title="حذف"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* تنبيه أمني أسفل النافذة */}
        <div className="text-center text-[10px] text-pink-300/60 flex items-center justify-center gap-1 pt-1 border-t border-white/5">
          <ShieldCheck className="w-3.5 h-3.5 text-pink-400" />
          <span>التبديل التلقائي المباشر مع عزل الوردية والحسابات</span>
        </div>

      </div>
    </div>
  );
};

