import React, { useState, useMemo } from 'react';
import { History, Clock, Printer, CheckCircle, Calendar, Search, User, FileText, X, Trash2, Eye, Lock, Handshake, MessageSquare } from 'lucide-react';
import { formatMoney, formatDate, resolveUserName, buildShiftWhatsAppMessage, getWhatsAppUrl, getEmailUrl } from '../../../utils/helpers';
import { printZReportHtml, buildZReportHtml, printShiftHandoverVoucherHtml } from '../../../utils/printHelper';
import { shareDocument, getPreferredShareFormat, getManagerPhone } from '../../../utils/shareHelper';
import { useApp } from '../../../context/AppContext';

import { ShiftHandoverModal } from '../ShiftHandoverModal';


export const ShiftsHistoryTab = ({ isAdmin }) => {
  const {
    shiftsHistory,
    deleteShiftRecord,
    currentUser,
    users,
    // activeShift و hasPermission كانا مستخدمين هنا بدون تعريف (يعطّلان سجل الورديات)
    activeShift,
    hasPermission,
    storeInfo
  } = useApp();

  const [selectedHistoryShift, setSelectedHistoryShift] = useState(null);
  const [handoverShiftTarget, setHandoverShiftTarget] = useState(null);
  const [isHandoverModalOpen, setIsHandoverModalOpen] = useState(false);

  // فلاتر سجل الورديات السابقة
  const [historyCashierFilter, setHistoryCashierFilter] = useState(() => (isAdmin ? 'all' : (currentUser?.id || 'all')));
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('all'); // all, today, yesterday, week, month

  const handleDeleteHistoryShift = (shiftId) => {
    if (!canDeleteShifts) {
      alert('⛔ عذراً، حذف تقارير الورديات السابقة مقتصر حصراً على مدير النظام!');
      return;
    }
    const shift = shiftsHistory.find(s => s.id === shiftId);
    const shiftName = resolveUserName(shift, users) || 'الوردية';
    if (window.confirm(`⚠️ تحذير إداري:\nهل أنت متأكد من حذف تقرير وردية (${shiftName}) نهائياً من الأرشيف؟\nلا يمكن التراجع عن هذا الإجراء.`)) {
      deleteShiftRecord(shiftId);
      if (selectedHistoryShift?.id === shiftId) setSelectedHistoryShift(null);
    }
  };

  const handlePrintZReportFromHistory = (shift) => {
    try {
      printZReportHtml(shift, storeInfo, users);
    } catch (err) {
      console.error('Print Z-Report Error:', err);
      window.print();
    }
  };

  // تصفية سجل الورديات السابقة بدقة مع عزل الكاشيرات
  const filteredHistoryShifts = useMemo(() => {
    if (!Array.isArray(shiftsHistory)) return [];
    
    return shiftsHistory.filter(shift => {
      const resolvedShiftUser = resolveUserName(shift, users);
      // 1. عزل الكاشيرات: إذا لم يكن المستخدم مديراً، لا يرى إلا وردياته هو فقط
      if (!isAdmin) {
        const isMyShift = shift.userId === currentUser?.id || shift.cashierName === currentUser?.name || resolvedShiftUser === currentUser?.name;
        if (!isMyShift) return false;
      } else if (historyCashierFilter !== 'all') {
        const matchUser = shift.userId === historyCashierFilter || shift.cashierName === historyCashierFilter || resolvedShiftUser === resolveUserName(historyCashierFilter, users);
        if (!matchUser) return false;
      }

      // 2. تصفية بالبحث (اسم الكاشير أو رقم الوردية أو الملاحظات)
      if (historySearchQuery.trim()) {
        const q = historySearchQuery.toLowerCase();
        const matchName = String(resolvedShiftUser || '').toLowerCase().includes(q) || String(shift.cashierName || '').toLowerCase().includes(q);
        const matchId = String(shift.id || '').toLowerCase().includes(q);
        const matchNotes = String(shift.notes || '').toLowerCase().includes(q);
        if (!matchName && !matchId && !matchNotes) return false;
      }

      // 3. تصفية بالتاريخ
      if (historyDateFilter !== 'all' && shift.closedAt) {
        const shiftDate = new Date(shift.closedAt);
        const now = new Date();
        if (historyDateFilter === 'today') {
          if (shiftDate.toDateString() !== now.toDateString()) return false;
        } else if (historyDateFilter === 'yesterday') {
          const yest = new Date();
          yest.setDate(yest.getDate() - 1);
          if (shiftDate.toDateString() !== yest.toDateString()) return false;
        } else if (historyDateFilter === 'week') {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          if (shiftDate < sevenDaysAgo) return false;
        } else if (historyDateFilter === 'month') {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          if (shiftDate < thirtyDaysAgo) return false;
        }
      }

      return true;
    });
  }, [shiftsHistory, isAdmin, currentUser, historyCashierFilter, historySearchQuery, historyDateFilter]);

  // إحصائيات السجل المصفى
  const historyStats = useMemo(() => {
    const count = filteredHistoryShifts.length;
    const totalSales = filteredHistoryShifts.reduce((s, sh) => s + (Number(sh.totalSales) || (Number(sh.cashSales || 0) + Number(sh.cardSales || 0) + Number(sh.creditSales || 0))), 0);
    const totalCash = filteredHistoryShifts.reduce((s, sh) => s + (Number(sh.actualCash) || 0), 0);
    const totalDiff = filteredHistoryShifts.reduce((s, sh) => s + (Number(sh.difference) || 0), 0);
    return { count, totalSales, totalCash, totalDiff };
  }, [filteredHistoryShifts]);

  // إرسال تقرير الوردية لرقم المدير المسجّل في الإعدادات — بالصيغة المختارة
  const handleSendWhatsAppToManager = async (shiftData) => {
    const shift = shiftData || selectedHistoryShift || activeShift;
    const managerPhone = getManagerPhone(storeInfo);
    if (!managerPhone) {
      alert('⚠️ لم يُسجَّل رقم جوال المدير في الإعدادات (الإعدادات ← الواتساب ← رقم المدير).');
      return;
    }
    const message = buildShiftWhatsAppMessage(shift, storeInfo, storeInfo.managerName || 'المدير العام');
    const format = getPreferredShareFormat(storeInfo);

    if (format === 'text') {
      window.open(getWhatsAppUrl(managerPhone, message), '_blank');
      return;
    }

    await shareDocument({
      format,
      phone: managerPhone,
      text: message,
      html: buildZReportHtml(shift, storeInfo, users),
      filename: `تقرير-وردية-${String(shift?.id || '').slice(-6)}`,
      width: 700
    });
  };

  const handleSendEmailToManager = (shiftData) => {
    const shift = shiftData || selectedHistoryShift || activeShift;
    const managerEmail = storeInfo.managerEmail || storeInfo.whatsappSettings?.managerEmail || storeInfo.email || '';
    const message = buildShiftWhatsAppMessage(shift, storeInfo, storeInfo.managerName || 'المدير العام');
    const url = getEmailUrl(managerEmail, `تقرير إغلاق الوردية Z-Report - ${storeInfo.name}`, message);
    window.open(url, '_blank');
  };


  const canDeleteShifts = isAdmin;

  return (
    <>
        <div className="space-y-4">
          
          {/* شريط الإحصائيات الشاملة لسجل الورديات */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-400 font-bold block">عدد الورديات الموثقة:</span>
              <strong className="text-sm font-black text-slate-900">{historyStats.count} وردية</strong>
            </div>
            <div className="p-3 bg-purple-50/70 rounded-2xl border border-purple-100 shadow-xs">
              <span className="text-[10px] text-purple-700 font-bold block">إجمالي مبيعات الورديات:</span>
              <strong className="text-sm font-black text-purple-950 font-mono">{formatMoney(historyStats.totalSales, storeInfo.currency)}</strong>
            </div>
            <div className="p-3 bg-emerald-50/70 rounded-2xl border border-emerald-100 shadow-xs">
              <span className="text-[10px] text-emerald-700 font-bold block">النقدية المحصاة (الكاش):</span>
              <strong className="text-sm font-black text-emerald-950 font-mono">{formatMoney(historyStats.totalCash, storeInfo.currency)}</strong>
            </div>
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-500 font-bold block">صافي الفروقات (عجز/فائض):</span>
              <strong className={`text-sm font-black font-mono ${
                historyStats.totalDiff === 0 ? 'text-slate-700' : historyStats.totalDiff > 0 ? 'text-blue-600' : 'text-rose-600'
              }`}>
                {historyStats.totalDiff > 0 ? '+' : ''}{formatMoney(historyStats.totalDiff, storeInfo.currency)}
              </strong>
            </div>
          </div>

          {/* شريط التصفية والبحث وعزل الكاشيرات */}
          <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs">
            
            {/* البحث بالاسم أو الرقم */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={historySearchQuery}
                onChange={e => setHistorySearchQuery(e.target.value)}
                placeholder="ابحث باسم الكاشير، رقم الوردية، أو الملاحظات..."
                className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs outline-none focus:bg-white focus:border-purple-500"
              />
              {historySearchQuery && (
                <button onClick={() => setHistorySearchQuery('')} className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600">✕</button>
              )}
            </div>

            {/* فلتر الكاشير للمدير */}
            {isAdmin ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <User className="w-4 h-4 text-purple-600 shrink-0" />
                <select
                  value={historyCashierFilter}
                  onChange={e => setHistoryCashierFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs outline-none focus:bg-white"
                >
                  <option value="all">👥 جميع الكاشيرات والمستخدمين</option>
                  {(users || []).map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.roleName || u.role})</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="px-3 py-1.5 bg-purple-50 text-purple-800 rounded-xl border border-purple-200 font-bold text-xs flex items-center gap-1.5 shrink-0">
                <Lock className="w-3.5 h-3.5 text-purple-600" />
                <span>وردياتك الخاصة: {currentUser?.name}</span>
              </div>
            )}

            {/* فلتر الفترة الزمنية */}
            <div className="flex items-center gap-1 shrink-0 bg-slate-50 p-1 rounded-xl border border-slate-200 text-[11px] font-bold">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'today', label: 'اليوم' },
                { id: 'yesterday', label: 'أمس' },
                { id: 'week', label: '7 أيام' },
                { id: 'month', label: 'هذا الشهر' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setHistoryDateFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    historyDateFilter === tab.id
                      ? 'bg-purple-900 text-white font-black shadow-xs'
                      : 'text-slate-600 hover:text-purple-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

          </div>

          {/* قائمة كروت الورديات الموثقة */}
          {filteredHistoryShifts.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center text-slate-400 border border-slate-200 space-y-2">
              <History className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
              <h4 className="font-bold text-sm text-slate-700">لا توجد ورديات تطابق خيارات البحث والتصفية</h4>
              <p className="text-xs text-slate-400">تأكد من اختيار الكاشير أو الفترة الزمنية الصحيحة</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredHistoryShifts.map(shift => (
                <div
                  key={shift.id}
                  className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between gap-3 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-xs text-purple-900 bg-purple-100/80 px-2.5 py-0.5 rounded-lg border border-purple-200">
                          👤 {resolveUserName(shift, users)}
                        </span>
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold">
                          {shift.cashierRole || 'كاشير مبيعات'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          #{shift.id?.slice(-6)}
                        </span>
                      </div>
                      
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-purple-700" />
                          <span>{shift.dayName ? `يوم ${shift.dayName}` : ''} • {shift.dateFormatted || formatDate(shift.closedAt)}</span>
                        </p>
                        <p className="text-[11px] text-slate-600 flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>التوقيت: {shift.openTimeFormatted || 'بدء'} ➔ {shift.closeTimeFormatted || 'إغلاق'}</span>
                          {shift.durationText && <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold font-sans">({shift.durationText})</span>}
                        </p>
                      </div>
                    </div>

                    <div className="text-left shrink-0">
                      <span className="text-[10px] text-slate-400 block font-bold">إجمالي المبيعات:</span>
                      <span className="text-sm font-black text-purple-950 font-mono block">
                        {formatMoney(shift.totalSales || (shift.cashSales + shift.cardSales + (shift.creditSales || 0)), storeInfo.currency)}
                      </span>
                      <span className={`text-[10px] font-bold block mt-0.5 ${
                        shift.difference === 0 ? 'text-emerald-600' : shift.difference > 0 ? 'text-blue-600' : 'text-rose-600'
                      }`}>
                        الفارق: {shift.difference > 0 ? '+' : ''}{formatMoney(shift.difference || 0, storeInfo.currency)}
                      </span>
                    </div>
                  </div>

                  {/* تفصيل مالي مصغر */}
                  <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-50/80 rounded-xl border border-slate-100 text-[10px] text-center">
                    <div>
                      <span className="text-slate-400 block">كاش:</span>
                      <strong className="text-slate-800 font-mono font-black">{formatMoney(shift.cashSales || 0, storeInfo.currency)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">شبكة:</span>
                      <strong className="text-slate-800 font-mono font-black">{formatMoney(shift.cardSales || 0, storeInfo.currency)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">العهدة:</span>
                      <strong className="text-slate-800 font-mono font-black">{formatMoney(shift.startCash || 0, storeInfo.currency)}</strong>
                    </div>
                  </div>

                  {/* حالة استلام النقدية وتبرئة الذمة من الإدارة */}
                  <div className={`p-2 rounded-xl flex items-center justify-between text-[11px] ${
                    shift.handoverStatus === 'received' 
                      ? 'bg-emerald-50/80 border border-emerald-200 text-emerald-900' 
                      : 'bg-amber-50/80 border border-amber-200 text-amber-900'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      {shift.handoverStatus === 'received' ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>
                            <strong>تم استلام الكاش:</strong> {shift.handoverReceivedBy || 'المدير'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>
                            <strong>بعهدة الكاشير:</strong> بانتظار استلام الإدارة
                          </span>
                        </>
                      )}
                    </div>

                    {shift.handoverStatus === 'received' ? (
                      <button
                        type="button"
                        onClick={() => printShiftHandoverVoucherHtml(shift, storeInfo, users)}
                        className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold rounded-lg text-[10px] flex items-center gap-1 transition"
                        title="طباعة سند الاستلام"
                      >
                        <Printer className="w-3 h-3" />
                        <span>سند الاستلام</span>
                      </button>
                    ) : (
                      (currentUser?.role === 'admin' || hasPermission('drawer_manage')) && (
                        <button
                          type="button"
                          onClick={() => {
                            setHandoverShiftTarget(shift);
                            setIsHandoverModalOpen(true);
                          }}
                          className="px-2.5 py-0.5 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 shadow-xs transition"
                        >
                          <Handshake className="w-3 h-3" />
                          <span>استلام الكاش 🤝</span>
                        </button>
                      )
                    )}
                  </div>

                  {/* شريط الإجراءات */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handlePrintZReportFromHistory(shift)}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-[11px] flex items-center gap-1 transition shadow-xs"
                        title="طباعة إيصال Z-Report حراري"
                      >
                        <Printer className="w-3 h-3" />
                        <span>طباعة Z</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendWhatsAppToManager(shift)}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold text-[11px] flex items-center gap-1 transition"
                        title="إرسال عبر الواتساب"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>واتساب</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedHistoryShift(shift)}
                        className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl font-bold text-[11px] flex items-center gap-1 transition"
                      >
                        <Eye className="w-3 h-3" />
                        <span>التفاصيل</span>
                      </button>

                      {/* زر الحذف حصري لمدير النظام فقط */}
                      {canDeleteShifts && (
                        <button
                          type="button"
                          onClick={() => handleDeleteHistoryShift(shift.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                          title="حذف تقرير الوردية (خاص بالمدير)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      {selectedHistoryShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-purple-200 animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="p-4 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-300" />
                <div>
                  <h3 className="font-black text-sm">تقرير إقفال الوردية (Z-Report)</h3>
                  <span className="text-[10px] text-purple-200 font-mono">#{selectedHistoryShift.id}</span>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedHistoryShift(null)} className="text-white/80 hover:text-white p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs overflow-y-auto flex-1">
              
              {/* بطاقة معلومات الكاشير والتوقيت */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">الكاشير المسؤول:</span>
                  <span className="font-black text-slate-900 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200">
                    👤 {resolveUserName(selectedHistoryShift, users)} ({selectedHistoryShift.cashierRole || 'كاشير'})
                  </span>
                </div>
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-500">وقت بدء الوردية:</span>
                  <span className="text-slate-700">{formatDate(selectedHistoryShift.openedAt)}</span>
                </div>
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-500">وقت إغلاق الوردية:</span>
                  <span className="text-slate-700">{formatDate(selectedHistoryShift.closedAt)}</span>
                </div>
              </div>

              {/* شبكة الأرقام والمبيعات */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="p-2.5 bg-purple-50/80 rounded-xl border border-purple-100">
                  <span className="text-[10px] text-purple-700 block font-bold">إجمالي المبيعات:</span>
                  <strong className="text-sm font-black text-purple-950 font-mono">
                    {formatMoney(selectedHistoryShift.totalSales || (selectedHistoryShift.cashSales + selectedHistoryShift.cardSales + (selectedHistoryShift.creditSales || 0)), storeInfo.currency)}
                  </strong>
                </div>
                <div className="p-2.5 bg-emerald-50/80 rounded-xl border border-emerald-100">
                  <span className="text-[10px] text-emerald-700 block font-bold">مبيعات الكاش:</span>
                  <strong className="text-sm font-black text-emerald-950 font-mono">
                    {formatMoney(selectedHistoryShift.cashSales || 0, storeInfo.currency)}
                  </strong>
                </div>
                <div className="p-2.5 bg-blue-50/80 rounded-xl border border-blue-100">
                  <span className="text-[10px] text-blue-700 block font-bold">مبيعات الشبكة:</span>
                  <strong className="text-sm font-black text-blue-950 font-mono">
                    {formatMoney(selectedHistoryShift.cardSales || 0, storeInfo.currency)}
                  </strong>
                </div>
                <div className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-100">
                  <span className="text-[10px] text-amber-800 block font-bold">العهدة الافتتاحية:</span>
                  <strong className="text-sm font-black text-amber-950 font-mono">
                    {formatMoney(selectedHistoryShift.startCash || 0, storeInfo.currency)}
                  </strong>
                </div>
                <div className="p-2.5 bg-slate-100/80 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-600 block font-bold">الكاش المتوقع بالدرج:</span>
                  <strong className="text-sm font-black text-slate-900 font-mono">
                    {formatMoney(selectedHistoryShift.expectedCash || 0, storeInfo.currency)}
                  </strong>
                </div>
                <div className="p-2.5 bg-emerald-100/70 rounded-xl border border-emerald-200">
                  <span className="text-[10px] text-emerald-800 block font-bold">الكاش الفعلي المحصى:</span>
                  <strong className="text-sm font-black text-emerald-950 font-mono">
                    {formatMoney(selectedHistoryShift.actualCash || 0, storeInfo.currency)}
                  </strong>
                </div>
              </div>

              {/* تفصيل مبيعات كافة وسائل الدفع المعرفة في الوردية */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                <span className="text-xs font-black text-slate-800 block mb-1">تفصيل مبيعات وسائل الدفع بالوردية:</span>
                {selectedHistoryShift.paymentMethodsBreakdown && typeof selectedHistoryShift.paymentMethodsBreakdown === 'object' ? (
                  Object.values(selectedHistoryShift.paymentMethodsBreakdown).filter(m => Number(m.amount) > 0).map(m => (
                    <div key={m.id} className="flex justify-between items-center text-xs py-0.5 border-b border-slate-100 last:border-0">
                      <span className="text-slate-700 font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-pink-500 inline-block"></span>
                        <span className="text-[10px] text-slate-500">
                          ({m.count || 1} {m.count === 1 ? 'حركة دفع' : 'حركات دفع'}{m.splitCount > 0 ? ` • منها ${m.splitCount} مجزأة` : ''})
                        </span>
                      </span>
                      <strong className="font-mono text-slate-900 font-black">
                        +{formatMoney(m.amount, storeInfo.currency)}
                      </strong>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">• نقدي (كاش):</span>
                      <strong className="font-mono text-emerald-700">+{formatMoney(selectedHistoryShift.cashSales || 0, storeInfo.currency)}</strong>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">• شبكة (مدى):</span>
                      <strong className="font-mono text-blue-700">+{formatMoney(selectedHistoryShift.cardSales || 0, storeInfo.currency)}</strong>
                    </div>
                    {Number(selectedHistoryShift.creditSales) > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600">• آجل:</span>
                        <strong className="font-mono text-amber-700">+{formatMoney(selectedHistoryShift.creditSales, storeInfo.currency)}</strong>
                      </div>
                    )}
                    {Number(selectedHistoryShift.bankSales || selectedHistoryShift.transferSales) > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600">• تحويل بنكي:</span>
                        <strong className="font-mono text-indigo-700">+{formatMoney(selectedHistoryShift.bankSales || selectedHistoryShift.transferSales, storeInfo.currency)}</strong>
                      </div>
                    )}
                    {Number(selectedHistoryShift.visaSales) > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600">• فيزا:</span>
                        <strong className="font-mono text-purple-700">+{formatMoney(selectedHistoryShift.visaSales, storeInfo.currency)}</strong>
                      </div>
                    )}
                    {Number(selectedHistoryShift.tamaraSales) > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600">• تمارا:</span>
                        <strong className="font-mono text-amber-700">+{formatMoney(selectedHistoryShift.tamaraSales, storeInfo.currency)}</strong>
                      </div>
                    )}
                    {Number(selectedHistoryShift.ninjaSales) > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600">• تطبيق نينجا:</span>
                        <strong className="font-mono text-rose-700">+{formatMoney(selectedHistoryShift.ninjaSales, storeInfo.currency)}</strong>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* الفارق والملاحظات */}
              <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                selectedHistoryShift.difference === 0 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                  : selectedHistoryShift.difference > 0 
                  ? 'bg-blue-50 border-blue-200 text-blue-900' 
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                <div>
                  <span className="font-bold block text-xs">مطابقة الصندوق (الفارق):</span>
                  <span className="text-[10px] opacity-80">
                    {selectedHistoryShift.difference === 0 ? 'مطابقة تامة وسليمة 100%' : selectedHistoryShift.difference > 0 ? 'يوجد فائض في الصندوق' : 'يوجد عجز في الصندوق'}
                  </span>
                </div>
                <strong className="text-base font-black font-mono">
                  {selectedHistoryShift.difference > 0 ? '+' : ''}{formatMoney(selectedHistoryShift.difference || 0, storeInfo.currency)}
                </strong>
              </div>

              {selectedHistoryShift.notes && (
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block">ملاحظات الإغلاق:</span>
                  <p className="text-xs text-slate-700 font-medium mt-0.5">{selectedHistoryShift.notes}</p>
                </div>
              )}

              {/* أزرار الإجراءات */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePrintZReportFromHistory(selectedHistoryShift)}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs flex items-center gap-1.5 shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>طباعة Z-Report حراري</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendWhatsAppToManager(selectedHistoryShift)}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow-sm"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>واتساب</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {canDeleteShifts && (
                    <button
                      type="button"
                      onClick={() => handleDeleteHistoryShift(selectedHistoryShift.id)}
                      className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-xs flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف الوردية</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedHistoryShift(null)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-black text-xs"
                  >
                    إغلاق
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
      {/* نافذة استلام عهدة الوردية — كانت مستوردة بدون عرض بعد تقسيم الشاشة */}
      <ShiftHandoverModal
        isOpen={isHandoverModalOpen}
        onClose={() => { setIsHandoverModalOpen(false); setHandoverShiftTarget(null); }}
        shift={handoverShiftTarget}
      />

    </>
  );
};
