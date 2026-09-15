import React, { useState, useEffect } from 'react';
import { Printer, Wifi, RefreshCw, CheckCircle2, AlertTriangle, Download, Tag, FileText } from 'lucide-react';
import {
  connectQz, listPrinters, testPrint, getQzStatus, describeTarget, getPrinterTarget
} from '../../utils/qzPrint';

// =========================================================================
//  إعدادات توجيه الطابعات
// =========================================================================
//  قبل هذه الشاشة كان في الإعدادات حقلان نصّيان لاسم طابعة الفواتير واسم
//  طابعة الباركود — يُحفظان ولا يُقرآن في أي مكان، فيظن المتجر أنه ربط
//  طابعتين وهو لم يربط شيئاً. هنا صار الاسم يُختار من الطابعات المكتشفة
//  فعلاً على الجهاز، ولكل وجهة زر اختبار يثبت وصول الورق قبل أن يعتمد
//  عليها الكاشير في يوم عمل.
// =========================================================================

const PURPOSES = [
  { key: 'invoice', label: 'طابعة الفواتير', icon: Printer, hint: 'فواتير البيع والإيصالات الحرارية' },
  { key: 'report', label: 'طابعة التقارير والسندات', icon: FileText, hint: 'تقرير Z، سندات القبض والإيداع، كشوف الحساب' },
  { key: 'barcode', label: 'طابعة ملصقات الباركود', icon: Tag, hint: 'ملصقات الأصناف بمقاساتها' }
];

export const PrintersSettingsPanel = ({ formData, setFormData, storeInfo }) => {
  const printers = formData.printers || {};
  const [discovered, setDiscovered] = useState([]);
  const [systemDefault, setSystemDefault] = useState('');
  const [status, setStatus] = useState(getQzStatus());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const setPrinters = (patch) =>
    setFormData(p => ({ ...p, printers: { ...(p.printers || {}), ...patch } }));

  const setTarget = (purpose, patch) =>
    setFormData(p => ({
      ...p,
      printers: {
        ...(p.printers || {}),
        [purpose]: { ...((p.printers || {})[purpose] || {}), ...patch }
      }
    }));

  const refresh = async () => {
    setBusy(true);
    setMsg(null);
    const res = await listPrinters();
    setStatus(getQzStatus());
    if (res.success) {
      setDiscovered(res.printers || []);
      setSystemDefault(res.defaultPrinter || '');
      setMsg({ ok: true, text: `تم العثور على ${(res.printers || []).length} طابعة على هذا الجهاز` });
    } else {
      setDiscovered([]);
      setMsg({ ok: false, text: 'تعذّر الاتصال بـ QZ Tray — تأكّد أنه مثبَّت ويعمل على هذا الجهاز' });
    }
    setBusy(false);
  };

  // فحص صامت عند فتح الشاشة: لا نزعج المستخدم برسالة إن لم يكن مثبّتاً
  useEffect(() => {
    let alive = true;
    connectQz().then(async (c) => {
      if (!alive) return;
      setStatus(getQzStatus());
      if (c.success) {
        const res = await listPrinters();
        if (!alive) return;
        if (res.success) {
          setDiscovered(res.printers || []);
          setSystemDefault(res.defaultPrinter || '');
        }
      }
    });
    return () => { alive = false; };
  }, []);

  const runTest = async (purpose) => {
    setBusy(true);
    setMsg(null);
    // نختبر بالإعدادات المعروضة الآن لا المحفوظة، فيرى أثر تعديله فوراً
    const res = await testPrint(purpose, { ...storeInfo, printers: formData.printers });
    setMsg({ ok: res.success, text: res.message });
    setBusy(false);
  };

  return (
    <div className="bg-white border-2 border-indigo-100 rounded-2xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-black text-slate-800 flex items-center gap-2 text-base">
            <Printer size={18} className="text-indigo-600" />
            توجيه الطابعات (فصل طابعة الفواتير عن طابعة الملصقات)
          </h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            المتصفّح وحده لا يستطيع اختيار طابعة بعينها — يطبع على الافتراضية فقط.
            برنامج <b>QZ Tray</b> يُثبَّت مرة واحدة على جهاز الكاشير فيسمح بتوجيه كل نوع
            طباعة إلى طابعته، وبالإرسال المباشر لطابعة شبكة بلا تعريف مثبّت.
          </p>
        </div>
        <div className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 border ${
          status.connected
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          {status.connected ? '🟢 QZ متصل' : '🟡 QZ غير متصل'}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer">
          <input
            type="checkbox"
            checked={printers.useQz === true}
            onChange={(e) => setPrinters({ useQz: e.target.checked })}
            className="w-4 h-4 text-indigo-600 rounded"
          />
          <span className="font-bold text-slate-700 text-sm">تفعيل التوجيه عبر QZ Tray</span>
        </label>

        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-2 rounded-xl text-sm font-bold"
        >
          <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
          اكتشاف الطابعات المثبَّتة
        </button>

        <a
          href="https://qz.io/download/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-sm font-bold border border-slate-200"
        >
          <Download size={15} />
          تحميل QZ Tray
        </a>
      </div>

      {systemDefault && (
        <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          الطابعة الافتراضية في هذا الجهاز: <b className="text-slate-800">{systemDefault}</b>
        </div>
      )}

      {msg && (
        <div className={`flex items-start gap-2 text-sm font-bold rounded-xl px-3 py-2 border ${
          msg.ok
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {msg.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {!printers.useQz && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed">
          التوجيه غير مفعّل: كل الطباعة ستذهب إلى الطابعة الافتراضية للنظام كما هو الحال الآن —
          بما فيها ملصقات الباركود.
        </div>
      )}

      <div className="space-y-3">
        {PURPOSES.map(({ key, label, icon: Icon, hint }) => {
          const t = { mode: 'default', name: '', host: '', port: 9100, ...(printers[key] || {}) };
          const effective = getPrinterTarget(key, { printers });
          return (
            <div key={key} className="border border-slate-200 rounded-xl p-3 bg-slate-50/60">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <div className="flex items-center gap-2 font-black text-slate-800 text-sm">
                  <Icon size={16} className="text-indigo-600" />
                  {label}
                </div>
                <button
                  type="button"
                  onClick={() => runTest(key)}
                  disabled={busy || !printers.useQz}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                >
                  🖨️ اختبار طباعة
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-2">{hint}</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={t.mode}
                  onChange={(e) => setTarget(key, { mode: e.target.value })}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-sm"
                >
                  <option value="default">الطابعة الافتراضية للنظام</option>
                  {key === 'report' && <option value="follow_invoice">نفس طابعة الفواتير</option>}
                  <option value="name">طابعة مثبَّتة (بالاسم)</option>
                  <option value="network">طابعة شبكة (IP ومنفذ)</option>
                </select>

                {t.mode === 'name' && (
                  discovered.length > 0 ? (
                    <select
                      value={t.name || ''}
                      onChange={(e) => setTarget(key, { name: e.target.value })}
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-sm sm:col-span-2"
                    >
                      <option value="">— اختر طابعة —</option>
                      {discovered.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={t.name || ''}
                      onChange={(e) => setTarget(key, { name: e.target.value })}
                      placeholder="اضغط «اكتشاف الطابعات» لاختيارها من قائمة"
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-sm sm:col-span-2"
                    />
                  )
                )}

                {t.mode === 'network' && (
                  <>
                    <input
                      type="text"
                      value={t.host || ''}
                      onChange={(e) => setTarget(key, { host: e.target.value })}
                      placeholder="192.168.1.50"
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-sm"
                    />
                    <input
                      type="number"
                      value={t.port || 9100}
                      onChange={(e) => setTarget(key, { port: Number(e.target.value) || 9100 })}
                      placeholder="9100"
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-sm"
                    />
                  </>
                )}
              </div>

              <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5">
                <Wifi size={12} />
                الوجهة الفعلية: <b className="text-slate-700">{describeTarget(effective)}</b>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PrintersSettingsPanel;
