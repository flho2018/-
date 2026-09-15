// =========================================================================
// سجل التدقيق — من فعل ماذا ومتى
// سجل إضافة فقط: لا يمكن تعديله ولا حذف بنوده من داخل البرنامج.
// يظهر للمدير فقط (يُتحكم بعرضه من ReportsScreen).
// =========================================================================
import React, { useState, useMemo, useEffect } from 'react';
import { ShieldCheck, Search, AlertTriangle, User, Clock, RefreshCw } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { formatMoney, formatDate } from '../../../utils/helpers';
import { syncEngine } from '../../../utils/syncEngine';

export const AuditLogTab = () => {
  const { auditLogs, storeInfo, users } = useApp();
  const [query, setQuery] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');

  // ===================================================================
  //  جلب السجل من السحابة عند فتح الشاشة
  // ===================================================================
  //  السجل كان يُكتب في السحابة ولا يُقرأ منها، فيرى المدير عمليات
  //  جهازه فقط — بينما الغرض أن يرى ما فعله الكاشيرون على أجهزتهم.
  const [cloudLogs, setCloudLogs] = useState(null);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [cloudError, setCloudError] = useState('');

  const loadFromCloud = async () => {
    setIsLoadingCloud(true);
    setCloudError('');
    try {
      const res = await syncEngine.fetchAuditLogs(1000);
      if (res.success) setCloudLogs(res.rows);
      else setCloudError('تعذّر جلب السجل من السحابة — تُقرأ بحساب المدير فقط.');
    } finally {
      setIsLoadingCloud(false);
    }
  };

  useEffect(() => { loadFromCloud(); }, []);

  // دمج سجل السحابة (كل الأجهزة) مع السجل المحلي (قيود لم تُرفع بعد)
  const logs = useMemo(() => {
    const local = Array.isArray(auditLogs) ? auditLogs : [];
    if (!Array.isArray(cloudLogs)) return local;
    const map = new Map();
    cloudLogs.forEach(l => { if (l?.id) map.set(l.id, l); });
    local.forEach(l => { if (l?.id && !map.has(l.id)) map.set(l.id, l); });
    return Array.from(map.values()).sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  }, [auditLogs, cloudLogs]);

  const userOptions = useMemo(() => {
    const map = new Map();
    logs.forEach(l => {
      if (l?.userId && !map.has(l.userId)) map.set(l.userId, l.userName || l.userId);
    });
    (users || []).forEach(u => { if (u?.id && !map.has(u.id)) map.set(u.id, u.name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [logs, users]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return logs.filter(l => {
      if (!l) return false;
      if (userFilter !== 'all' && l.userId !== userFilter) return false;
      if (severityFilter !== 'all' && (l.severity || 'normal') !== severityFilter) return false;
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      if (!q) return true;
      const hay = `${l.action || ''} ${l.target || ''} ${l.details || ''} ${l.userName || ''}`;
      return hay.includes(q);
    });
  }, [logs, query, userFilter, severityFilter, actionFilter]);

  const highCount = logs.filter(l => l?.severity === 'high').length;
  // صافي أثر تسويات المخزون: مجموع الفروقات (موجب = زيادة، سالب = نقص)
  const stockNet = logs
    .filter(l => l?.action === 'تسوية مخزون')
    .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const stockCount = logs.filter(l => l?.action === 'تسوية مخزون').length;

  return (
    <div className="bg-white rounded-3xl p-5 border border-pink-100 shadow-sm space-y-4 animate-in fade-in text-xs">

      {/* الترويسة */}
      <div className="pb-3 border-b border-pink-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-800 to-slate-600 text-white flex items-center justify-center shadow">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 text-sm">سجل التدقيق</h3>
            <p className="text-[11px] text-slate-500">
              من فعل ماذا ومتى — {logs.length} عملية مسجّلة، منها {highCount} عملية حسّاسة
            </p>
            {stockCount > 0 && (
              <p className="text-[11px] font-bold mt-0.5">
                <span className="text-slate-500">تسويات المخزون: {stockCount} تسوية • صافي الأثر: </span>
                <span className={stockNet < 0 ? 'text-rose-600 font-black' : 'text-emerald-700 font-black'}>
                  {stockNet > 0 ? '+' : ''}{stockNet} وحدة
                </span>
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={loadFromCloud}
          disabled={isLoadingCloud}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 shadow transition active:scale-95 disabled:opacity-50 shrink-0"
          title="جلب عمليات كل الأجهزة من السحابة"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCloud ? 'animate-spin' : ''}`} />
          <span>{isLoadingCloud ? 'جاري الجلب...' : 'تحديث من كل الأجهزة'}</span>
        </button>
      </div>

      {cloudError && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-[11px] font-bold">
          {cloudError}
        </div>
      )}

      {/* الفلاتر */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث في العمليات..."
            className="w-full pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>

        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-pink-200"
        >
          <option value="all">كل المستخدمين</option>
          {userOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-pink-200"
        >
          <option value="all">كل العمليات</option>
          <option value="high">العمليات الحسّاسة فقط ⚠️</option>
          <option value="normal">العمليات العادية</option>
        </select>

        {/* فلتر نوع العملية — يسهّل مراجعة تسويات المخزون وحدها */}
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-pink-200"
        >
          <option value="all">كل الأنواع</option>
          <option value="تسوية مخزون">تسوية مخزون 📦</option>
          <option value="تعديل أسعار منتج">تعديل أسعار</option>
          <option value="مرتجع فاتورة">مرتجعات</option>
          <option value="مصروف">مصروفات</option>
          <option value="إغلاق وردية">إغلاق ورديات</option>
          <option value="تعديل وردية مغلقة">تعديل وردية مغلقة</option>
          <option value="استلام عهدة وردية وتبرئة الذمة">استلام عهدة</option>
          <option value="تسوية شبكة/بطاقة">تسويات الشبكة</option>
          <option value="أرشفة منتج">أرشفة منتجات</option>
        </select>
      </div>

      {/* القائمة */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <ShieldCheck className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="font-bold text-xs">
            {logs.length === 0
              ? 'لم تُسجَّل أي عملية بعد. السجل يبدأ من أول عملية حسّاسة (مرتجع، تعديل سعر، إغلاق وردية...).'
              : 'لا توجد نتائج مطابقة للبحث.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[65vh] overflow-y-auto">
          {filtered.map(l => {
            const isHigh = l.severity === 'high';
            return (
              <div
                key={l.id}
                className={`rounded-xl border p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  isHigh ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isHigh && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                    <span className={`font-black text-xs ${isHigh ? 'text-amber-900' : 'text-slate-800'}`}>
                      {l.action}
                    </span>
                    {l.target && (
                      <span className="text-[11px] text-slate-600 font-bold">— {l.target}</span>
                    )}
                  </div>
                  {l.details && (
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed break-words">{l.details}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400 font-bold">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />{l.userName || 'غير معروف'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />{formatDate(l.at)}
                    </span>
                    {l.device && <span>{l.device}</span>}
                  </div>
                </div>

                {l.amount !== null && l.amount !== undefined && (
                  <div className="shrink-0 text-left">
                    <span className={`font-black font-mono text-xs ${isHigh ? 'text-amber-800' : 'text-slate-700'}`}>
                      {formatMoney(l.amount, storeInfo?.currency)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-slate-400 text-center pt-2 border-t border-slate-100 leading-relaxed">
        السجل يجمع عمليات كل الأجهزة من السحابة (آخر ١٠٠٠ عملية). قواعد الأمان تمنع تعديل أي قيد أو حذفه — ولا المدير نفسه.
      </p>
    </div>
  );
};
