import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, HelpCircle, Trash2, Check, X } from 'lucide-react';

// =========================================================================
//  نوافذ التأكيد والإدخال داخل التطبيق — بديل window.confirm / window.prompt
// =========================================================================
//  المشكلة الحقيقية التي يحلّها هذا الملف:
//  نوافذ المتصفّح (confirm / prompt) توقف **خيط الجافاسكربت كله** حتى
//  يضغط المستخدم. وأثرها في متجر يعمل فعلاً ثلاثة أضرار لا واحد:
//
//  ١) المزامنة تتجمّد معها: مؤقّتات الإرسال لا تعمل ولقطات Firestore
//     الواردة لا تُعالَج ما دامت النافذة مفتوحة. فنافذة تُركت مفتوحة على
//     جهاز كاشير (سأل زميله، انشغل بعميل) تعني جهازاً خارج المزامنة تماماً.
//  ٢) شكلها ليس من التطبيق: نصّها إنجليزي الأزرار، لا تحترم RTL، ولا
//     تعمل معها لوحة المفاتيح الافتراضية للشاشات اللمسية — فجهاز لمس بلا
//     كيبورد لا يستطيع كتابة سبب المرتجع في `prompt` إطلاقاً.
//  ٣) لا يمكن اختبارها ولا رؤيتها من أي لوحة تحكّم آلية — اللوحة تُلغيها
//     تلقائياً، فكل مسار خلفها يصير غير قابل للفحص.
//
//  البديل هنا نافذة React عادية تُرجع **وعداً** (Promise) بنفس دلالة
//  دوال المتصفّح تماماً كي يبقى منطق المستدعي كما هو:
//    confirmDialog → true / false        (مثل confirm)
//    promptDialog  → نصّ / null عند الإلغاء (مثل prompt)
//
//  ولماذا `role="dialog"` و `fixed inset-0`؟
//  لأن مستمعي الماسح الضوئي (PosRegister و App) يتجاهلان ضغطات المفاتيح
//  حين يجدان عنصراً بهذه السمات — فوجودها هنا يمنع ذهاب ما يُكتب في حقل
//  السبب إلى مخزن الباركود وإضافة صنف للسلة أثناء كتابة المستخدم.
// =========================================================================

const TONES = {
  default: {
    ring: 'border-sky-200',
    head: 'from-sky-600 to-cyan-500',
    confirmBtn: 'bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-700 hover:to-cyan-600',
    Icon: HelpCircle
  },
  warning: {
    ring: 'border-amber-200',
    head: 'from-amber-500 to-orange-500',
    confirmBtn: 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600',
    Icon: AlertTriangle
  },
  danger: {
    ring: 'border-rose-200',
    head: 'from-rose-600 to-red-500',
    confirmBtn: 'bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-700 hover:to-red-600',
    Icon: Trash2
  }
};

const DialogCard = ({ request, onResolve }) => {
  const {
    id,
    kind = 'confirm',
    title,
    message = '',
    confirmText,
    cancelText = 'إلغاء',
    tone = 'default',
    defaultValue = '',
    placeholder = '',
    inputMode = 'text',
    multiline = false,
    required = false,
    maxLength
  } = request || {};

  const [value, setValue] = useState(String(defaultValue ?? ''));
  const inputRef = useRef(null);
  const cancelRef = useRef(null);

  const isPrompt = kind === 'prompt';
  const theme = TONES[tone] || TONES.default;
  const Icon = theme.Icon;
  const okLabel = confirmText || (isPrompt ? 'حفظ' : 'موافق');

  // الإدخال المطلوب إلزامياً: لا يُفعَّل زر الحفظ قبل كتابة شيء.
  // (هذا ما كان يفعله المستدعي يدوياً بعد prompt، فجُمع هنا مرة واحدة.)
  const trimmed = String(value || '').trim();
  const canSubmit = !isPrompt || !required || trimmed.length > 0;

  useEffect(() => {
    // التركيز: حقل الإدخال في نافذة الإدخال، وزر **الإلغاء** في نوافذ
    // الحذف والتصفير — كي لا تُنفَّذ عملية مدمّرة بضغطة مسافة عابرة.
    const timer = setTimeout(() => {
      if (isPrompt && inputRef.current) {
        inputRef.current.focus();
        try { inputRef.current.select(); } catch (e) { /* حقول لا تدعم التحديد */ }
      } else if (cancelRef.current) {
        cancelRef.current.focus();
      }
    }, 40);
    return () => clearTimeout(timer);
  }, [isPrompt, id]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onResolve(id, isPrompt ? null : false);
        return;
      }
      if (e.key === 'Enter') {
        // ⛔ لا تأكيد بـ Enter في النوافذ المدمّرة (حذف/تصفير).
        // السبب واقعي لا نظري: قارئ الباركود يُرسل Enter بعد كل قراءة.
        // فمسحة عابرة على صنف بينما نافذة حذف مفتوحة كانت ستؤكّد الحذف
        // بلا أن يلمس أحد الشاشة.
        if (tone === 'danger') return;
        if (multiline && !e.ctrlKey) return;   // نصّ متعدد الأسطر: Enter سطر جديد
        if (!canSubmit) return;
        e.preventDefault();
        e.stopPropagation();
        onResolve(id, isPrompt ? String(value ?? '') : true);
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [id, isPrompt, tone, multiline, canSubmit, value, onResolve]);

  const submit = () => {
    if (!canSubmit) return;
    onResolve(id, isPrompt ? String(value ?? '') : true);
  };

  const cancel = () => onResolve(id, isPrompt ? null : false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-app-dialog="true"
      dir="rtl"
      className="fixed inset-0 z-[10000] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 font-cairo"
      onMouseDown={(e) => {
        // النقر على الخلفية = إلغاء. ولا يُقبل في النوافذ المدمّرة كي لا
        // يُغلق المستخدم نافذة حذف بنقرة خاطئة ويظنّ أنه حذف فعلاً.
        if (e.target === e.currentTarget && tone !== 'danger') cancel();
      }}
    >
      <div className={'w-full max-w-md bg-white rounded-3xl border shadow-2xl overflow-hidden ' + theme.ring}>

        <div className={'flex items-center gap-2 px-4 py-3 text-white bg-gradient-to-l ' + theme.head}>
          <Icon className="w-5 h-5 shrink-0" />
          <h3 className="font-black text-sm flex-1">{title || (isPrompt ? 'إدخال مطلوب' : 'تأكيد العملية')}</h3>
          <button
            type="button"
            onClick={cancel}
            title="إغلاق"
            className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 max-h-[55vh] overflow-y-auto">
          {message ? (
            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line break-words">{message}</p>
          ) : null}

          {isPrompt ? (
            multiline ? (
              <textarea
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                maxLength={maxLength}
                rows={3}
                className="mt-3 w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 focus:border-sky-400 focus:outline-none text-sm text-slate-800 resize-none"
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                inputMode={inputMode}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                maxLength={maxLength}
                className="mt-3 w-full h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-sky-400 focus:outline-none text-sm text-slate-800"
              />
            )
          ) : null}

          {isPrompt && required && !canSubmit ? (
            <p className="mt-2 text-xs text-rose-600 font-bold">هذا الحقل إلزامي.</p>
          ) : null}
        </div>

        {/* ارتفاع الأزرار ٤٨ بكسل: حدّ اللمس على شاشة الكاشير، لا مقاس زينة */}
        <div className="px-5 pb-5 pt-1 flex gap-2">
          <button
            type="button"
            ref={cancelRef}
            onClick={cancel}
            className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm border border-slate-200 transition active:scale-95"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={
              'flex-1 h-12 rounded-xl text-white font-black text-sm shadow transition active:scale-95 flex items-center justify-center gap-1.5 ' +
              (canSubmit ? theme.confirmBtn : 'bg-slate-300 cursor-not-allowed')
            }
          >
            <Check className="w-4 h-4" />
            <span>{okLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// تُعرض آخر نافذة في الطابور فقط. والطابور موجود لأن نافذتين قد تُطلبان
// في نفس اللحظة (تأكيد داخل تأكيد)، وضياع إحداهما يعني وعداً لا يُحسم
// أبداً — أي دالة تنتظر للأبد وشاشة تبدو معلّقة بلا سبب ظاهر.
export const AppDialogHost = ({ queue = [], onResolve }) => {
  if (!queue.length) return null;
  const current = queue[queue.length - 1];
  return <DialogCard key={current.id} request={current} onResolve={onResolve} />;
};

export default AppDialogHost;
