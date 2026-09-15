import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Mail,
  KeyRound,
  Store,
  LogIn,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2
} from 'lucide-react';

export const LoginScreen = () => {
  const { storeInfo, loginWithEmail } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const submitLogin = async () => {
    if (loading) return;

    if (!email.trim()) {
      setError('يرجى إدخال البريد الإلكتروني');
      return;
    }
    if (!password) {
      setError('يرجى إدخال كلمة المرور');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await loginWithEmail(email, password);
      if (res.success) {
        setSuccess(res.needsPin
          ? 'تم التحقق من الحساب ✅ — أدخل رمزك السري الشخصي الآن 🌸'
          : `أهلاً وسهلاً ${res.user?.name || ''} 🌸`);
      } else {
        setError(res.message || 'تعذر تسجيل الدخول');
        setPassword('');
      }
    } catch (err) {
      setError('حدث خطأ غير متوقع، أعد المحاولة');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') submitLogin();
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-[#1A0314] via-[#2A0845] to-[#120210] flex flex-col items-center justify-center p-4 text-white select-none overflow-y-auto font-cairo">

      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-pink-500/30 shadow-2xl shadow-purple-950/80 flex flex-col items-center animate-in zoom-in-95 duration-200">

        {/* رأس الصفحة */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-pink-600 via-rose-600 to-purple-600 flex items-center justify-center mx-auto mb-3 shadow-xl shadow-pink-600/40 border border-pink-300/40">
            {storeInfo?.logo ? (
              <img src={storeInfo.logo} alt="Logo" className="w-full h-full object-cover rounded-2xl" />
            ) : (
              <Store className="w-8 h-8 text-white" />
            )}
          </div>

          <h1 className="text-lg sm:text-xl font-black text-white flex items-center justify-center gap-1.5">
            <span>{storeInfo?.name || 'بيت الورد للزهور والهدايا'}</span>
            <span className="text-pink-400">🌸</span>
          </h1>
          <p className="text-xs text-pink-200/80 mt-1 font-medium">
            نظام نقاط البيع وإدارة المبيعات السحابي
          </p>
        </div>

        {/* البريد الإلكتروني */}
        <div className="w-full mb-3">
          <label className="block text-xs font-bold text-pink-200/90 mb-1.5 text-right">
            البريد الإلكتروني
          </label>
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pink-400/70 pointer-events-none" />
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              dir="ltr"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="name@flower-house.com"
              className="w-full bg-pink-950/40 border border-pink-500/20 rounded-2xl py-3 pr-10 pl-3 text-sm text-white placeholder-pink-300/30 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-500/30 transition disabled:opacity-50"
            />
          </div>
        </div>

        {/* كلمة المرور */}
        <div className="w-full mb-4">
          <label className="block text-xs font-bold text-pink-200/90 mb-1.5 text-right">
            كلمة المرور
          </label>
          <div className="relative">
            <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pink-400/70 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="••••••••"
              className="w-full bg-pink-950/40 border border-pink-500/20 rounded-2xl py-3 pr-10 pl-11 text-sm text-white placeholder-pink-300/30 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-500/30 transition disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              tabIndex={-1}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-300/70 hover:text-pink-200 transition"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* رسائل الخطأ والنجاح */}
        {error && (
          <div className="w-full mb-3.5 text-xs text-rose-300 flex items-center gap-1.5 bg-rose-500/20 px-3.5 py-2.5 rounded-xl border border-rose-500/40">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-bold">{error}</span>
          </div>
        )}

        {success && (
          <div className="w-full mb-3.5 text-xs text-emerald-300 flex items-center gap-1.5 bg-emerald-500/20 px-3.5 py-2.5 rounded-xl border border-emerald-500/40">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-bold">{success}</span>
          </div>
        )}

        {/* زر الدخول */}
        <button
          type="button"
          onClick={submitLogin}
          disabled={loading}
          className="w-full py-3.5 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 text-white rounded-2xl text-sm font-black shadow-lg shadow-pink-600/40 transition active:scale-95 flex items-center justify-center gap-2 border border-pink-400/30 disabled:opacity-60 disabled:active:scale-100"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري التحقق...</span>
            </>
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              <span>دخول للنظام 🌸</span>
            </>
          )}
        </button>

        <p className="mt-5 text-center text-[10px] text-pink-300/50 leading-relaxed">
          الدخول عبر حساب Firebase الخاص بك.
          <br />
          للحصول على حساب أو استعادة كلمة المرور، راجع مدير النظام.
        </p>

      </div>

    </div>
  );
};
