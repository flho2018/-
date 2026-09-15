import React, { useState, useMemo } from 'react';
import { Trash2, Edit2, RotateCcw, X, MessageSquare } from 'lucide-react';
// resolveUserName و buildShiftWhatsAppMessage و getWhatsAppUrls كانت مستخدمة هنا بدون
// استيراد بعد تقسيم شاشة التقارير إلى ملفات — وهذا يعطّل سجل الورديات عند فتحه.
import { formatMoney, formatDate, resolveUserName, buildShiftWhatsAppMessage, getWhatsAppUrls } from '../../../utils/helpers';
import { shareDocument, getPreferredShareFormat, getManagerPhone } from '../../../utils/shareHelper';
import { buildZReportHtml } from '../../../utils/printHelper';

export const ShiftsHistoryLog = ({ 
  shiftsHistory, 
  deleteShiftRecord, 
  updateShiftRecord,
  resetShiftsHistory,
  currentUser, 
  users, 
  storeInfo, 
  hasPermission, 
  formatMoney, 
  formatDate 
}) => {
  const [searchUser, setSearchUser] = useState('all');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [searchPeriod, setSearchPeriod] = useState('all');
  const [expandedShiftId, setExpandedShiftId] = useState(null);

  // حالة نافذة التعديل
  const [editingShift, setEditingShift] = useState(null);
  const [editActualCash, setEditActualCash] = useState('');
  const [editOpeningCash, setEditOpeningCash] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const isAdmin = currentUser?.role === 'admin';
  const currency = storeInfo?.currency || 'ر.س';

  // الحصول على قائمة المستخدمين الفريدة من سجل الورديات
  const uniqueUsers = useMemo(() => {
    const map = new Map();
    (shiftsHistory || []).forEach(s => {
      const resolvedName = resolveUserName(s, users);
      const key = s.userId || s.cashierId || (s.role === 'admin' ? 'admin' : resolvedName);
      if (key && !map.has(key)) {
        map.set(key, { id: key, name: resolvedName });
      }
    });
    return Array.from(map.values());
  }, [shiftsHistory, users]);

  // فلترة الورديات
  const filteredShifts = useMemo(() => {
    let list = [...(shiftsHistory || [])];

    // فلتر المستخدم
    if (searchUser !== 'all') {
      list = list.filter(s => {
        const resolved = resolveUserName(s, users);
        return s.userId === searchUser || 
               s.cashierId === searchUser || 
               resolved === searchUser || 
               (searchUser === 'admin' && (s.userId === 'admin' || s.role === 'admin'));
      });
    }

    // فلتر المستخدم العادي: يرى ورديات نفسه فقط
    if (!isAdmin) {
      const uid = currentUser?.id;
      const uname = currentUser?.name;
      list = list.filter(s => 
        s.userId === uid || s.cashierId === uid || resolveUserName(s, users) === uname
      );
    }

    // فلتر الفترة الزمنية السريعة
    const now = new Date();
    if (searchPeriod === 'today') {
      list = list.filter(s => s.closedAt && new Date(s.closedAt).toDateString() === now.toDateString());
    } else if (searchPeriod === 'week') {
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      list = list.filter(s => s.closedAt && new Date(s.closedAt) >= weekAgo);
    } else if (searchPeriod === 'month') {
      list = list.filter(s => s.closedAt && new Date(s.closedAt).getMonth() === now.getMonth() && new Date(s.closedAt).getFullYear() === now.getFullYear());
    }

    // فلتر التاريخ المحدد
    if (searchDateFrom) {
      const fromDate = new Date(searchDateFrom);
      fromDate.setHours(0, 0, 0, 0);
      list = list.filter(s => s.closedAt && new Date(s.closedAt) >= fromDate);
    }
    if (searchDateTo) {
      const toDate = new Date(searchDateTo);
      toDate.setHours(23, 59, 59, 999);
      list = list.filter(s => s.closedAt && new Date(s.closedAt) <= toDate);
    }

    // ترتيب من الأحدث للأقدم
    list.sort((a, b) => new Date(b.closedAt || b.openedAt) - new Date(a.closedAt || a.openedAt));
    return list;
  }, [shiftsHistory, searchUser, searchPeriod, searchDateFrom, searchDateTo, isAdmin, currentUser]);

  // فتح نافذة التعديل لوردية معينة
  const handleOpenEdit = (shift) => {
    if (!isAdmin) {
      alert('⛔ تعديل أرقام الورديات المغلقة متاح للمدير وحده.');
      return;
    }
    setEditingShift(shift);
    setEditActualCash(String(shift.actualCash ?? 0));
    setEditOpeningCash(String(shift.openingCash ?? shift.startCash ?? 0));
    setEditNotes(shift.notes || '');
  };

  // حفظ التعديلات
  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editingShift) return;

    // =====================================================================
    //  تعديل أرقام وردية مغلقة = تغطية عجز بأثر رجعي
    // =====================================================================
    //  كانت الحماية إخفاء الزر عن غير المدير فقط، ولا حارس في التنفيذ.
    //  قواعد Firestore ترفض العملية فعلياً على الخادم، لكن الواجهة كانت
    //  تُظهر نجاحاً وتُعدّل الحالة المحلية — فتتباعد أرقام هذا الجهاز عن
    //  السحابة حتى إعادة التحميل، وهو أسوأ من الرفض الصريح.
    // =====================================================================
    if (!isAdmin) {
      alert('⛔ تعديل أرقام الورديات المغلقة متاح للمدير وحده.');
      return;
    }

    const newStartCash = Number(editOpeningCash) || 0;
    const newActualCash = Number(editActualCash) || 0;

    // إعادة احتساب النقدية المتوقعة مع الرصيد الافتتاحي الجديد
    const cashSales = Number(editingShift.cashSales) || 0;
    const cashIn = Number(editingShift.cashIn) || 0;
    const cashOut = Number(editingShift.cashOut) || 0;
    const expenses = Number(editingShift.totalExpenses) || 0;
    const purchases = Number(editingShift.totalPurchases) || 0;

    const newExpectedCash = newStartCash + cashSales + cashIn - cashOut - expenses - purchases;
    const newDifference = newActualCash - newExpectedCash;

    updateShiftRecord(editingShift.id, {
      startCash: newStartCash,
      openingCash: newStartCash,
      actualCash: newActualCash,
      expectedCash: newExpectedCash,
      netCashInDrawer: newExpectedCash,
      difference: newDifference,
      notes: editNotes
    });

    setEditingShift(null);
  };

  // حذف وردية (مدير فقط)
  const handleDeleteShift = (shiftId) => {
    if (!isAdmin) {
      alert('⛔ فقط المدير يمكنه حذف سجلات الورديات!');
      return;
    }
    if (confirm('⚠️ هل تريد حذف هذه الوردية من السجل التاريخي؟ لا يمكن التراجع.')) {
      deleteShiftRecord(shiftId);
    }
  };

  // تصفير سجل الورديات بالكامل (مدير فقط)
  const handleResetAllShifts = () => {
    if (!isAdmin) {
      alert('⛔ فقط المدير يمكنه تصفير سجل الورديات!');
      return;
    }
    if (confirm(`⚠️ تحذير أمني: هل تريد بالتأكيد مسح وتصفير كافة سجلات الورديات السابقة (${(shiftsHistory || []).length} وردية)؟\n\nلا يمكن التراجع عن هذه الخطوة!`)) {
      resetShiftsHistory();
    }
  };

  // إرسال وردية للمدير بالصيغة المحفوظة في الإعدادات (صورة / PDF / نص)
  const handleShareShiftWhatsApp = async (shift) => {
    const targetPhone = getManagerPhone(storeInfo);
    const msg = buildShiftWhatsAppMessage(shift, storeInfo);
    if (!targetPhone) {
      alert('⚠️ لا يوجد رقم مدير محفوظ. أضِفه من: الإعدادات ← واتساب ← رقم المدير.');
      return;
    }
    const format = getPreferredShareFormat(storeInfo);
    if (format === 'text') {
      const urls = getWhatsAppUrls(targetPhone, msg);
      window.open(urls.universalUrl, '_blank');
      return;
    }
    const caption =
      `🌸 تقرير وردية${shift?.id ? ' #' + shift.id : ''} — ${storeInfo?.name || 'بيت الورد'}\n` +
      `📅 ${formatDate(shift?.closedAt || shift?.date || new Date())}\n` +
      `(التقرير مرفق ${format === 'pdf' ? 'كملف PDF 📄' : 'كصورة 🖼️'})`;
    try {
      await shareDocument({
        format,
        phone: targetPhone,
        text: caption,
        html: buildZReportHtml(shift, storeInfo, users),
        filename: `تقرير_وردية_${shift?.id || Date.now()}`,
        width: 820
      });
    } catch (err) {
      console.error('Share shift error:', err);
      const urls = getWhatsAppUrls(targetPhone, msg);
      window.open(urls.universalUrl, '_blank');
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 border border-pink-100 shadow-sm space-y-4 animate-in fade-in text-xs">
      {/* رأس الصفحة مع زر التصفير */}
      <div className="pb-3 border-b border-pink-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
            <span>📋 سجل الورديات التاريخي</span>
          </h3>
          <p className="text-[11px] text-slate-500">استعراض وبحث وتعديل وحذف كل الورديات المغلقة مع فلترة متقدمة</p>
        </div>

        {isAdmin && (shiftsHistory || []).length > 0 && (
          <button
            type="button"
            onClick={handleResetAllShifts}
            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-black text-xs flex items-center gap-1.5 transition active:scale-95 shadow-xs shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
            <span>تصفير سجل الورديات بالكامل 🔄</span>
          </button>
        )}
      </div>

      {/* أدوات البحث والفلترة */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-50 rounded-2xl border border-slate-200">
        {/* فلتر الفترة السريعة */}
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1">⏱️ الفترة الزمنية</label>
          <select
            value={searchPeriod}
            onChange={e => setSearchPeriod(e.target.value)}
            className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-pink-300 outline-none"
          >
            <option value="all">الكل</option>
            <option value="today">اليوم فقط</option>
            <option value="week">آخر 7 أيام</option>
            <option value="month">هذا الشهر</option>
          </select>
        </div>

        {/* فلتر المستخدم (مدير فقط) */}
        {isAdmin && (
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">👤 المستخدم/الكاشير</label>
            <select
              value={searchUser}
              onChange={e => setSearchUser(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-pink-300 outline-none"
            >
              <option value="all">جميع الكاشيرات</option>
              {uniqueUsers.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* من تاريخ */}
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1">📅 من تاريخ</label>
          <input
            type="date"
            value={searchDateFrom}
            onChange={e => setSearchDateFrom(e.target.value)}
            className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-pink-300 outline-none"
          />
        </div>

        {/* إلى تاريخ */}
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1">📅 إلى تاريخ</label>
          <input
            type="date"
            value={searchDateTo}
            onChange={e => setSearchDateTo(e.target.value)}
            className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-pink-300 outline-none"
          />
        </div>
      </div>

      {/* عداد النتائج */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold text-slate-500">
          عدد الورديات: <strong className="text-pink-700">{filteredShifts.length}</strong> وردية
        </span>
        {(searchDateFrom || searchDateTo || searchUser !== 'all' || searchPeriod !== 'all') && (
          <button
            onClick={() => { setSearchUser('all'); setSearchDateFrom(''); setSearchDateTo(''); setSearchPeriod('all'); }}
            className="text-[10px] text-rose-600 font-bold hover:underline"
          >
            ✕ مسح الفلاتر
          </button>
        )}
      </div>

      {/* قائمة الورديات */}
      {filteredShifts.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <div className="text-4xl mb-2">📋</div>
          <p className="font-bold text-sm">لا توجد ورديات مطابقة للبحث</p>
          <p className="text-[10px] mt-1">جرّب تغيير معايير البحث أو الفلترة</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {filteredShifts.map((shift, idx) => {
            const isExpanded = expandedShiftId === shift.id;
            const diffColor = (shift.difference || 0) === 0 ? 'text-emerald-600' : (shift.difference || 0) > 0 ? 'text-blue-600' : 'text-rose-600';
            const diffText = (shift.difference || 0) === 0 ? 'مطابق ✅' : (shift.difference || 0) > 0 ? `فائض +${formatMoney(shift.difference, currency)}` : `عجز ${formatMoney(shift.difference, currency)}`;

            return (
              <div key={shift.id || idx} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-md transition">
                {/* رأس الوردية - قابل للنقر للتوسع */}
                <div
                  onClick={() => setExpandedShiftId(isExpanded ? null : shift.id)}
                  className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-600 to-purple-700 flex items-center justify-center text-white font-black text-sm shrink-0">
                      {(resolveUserName(shift, users) || 'ك')?.charAt(0) || '📋'}
                    </div>
                    <div>
                      <div className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                        <span>{resolveUserName(shift, users) || 'كاشير'}</span>
                        {shift.isAdjusted && (
                          <span
                            className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-black"
                            title={(shift.adjustments || []).map(a => `${a.byName}: ${a.reason}`).join(' • ')}
                          >
                            ✏️ عُدِّلت بعد الإغلاق
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {shift.closedAt ? formatDate(shift.closedAt) : formatDate(shift.openedAt)} 
                        {shift.durationText ? ` • ${shift.durationText}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="text-left">
                    <div className="font-black text-pink-700 text-xs font-mono">{formatMoney(shift.totalSales || 0, currency)}</div>
                    <div className={`text-[10px] font-bold ${diffColor}`}>{diffText}</div>
                  </div>
                </div>

                {/* تفاصيل الوردية الموسعة */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2.5 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div className="p-2 bg-slate-50 rounded-xl">
                        <span className="text-[10px] text-slate-500 block">العهدة الافتتاحية</span>
                        <span className="font-bold font-mono text-xs">{formatMoney(shift.openingCash || shift.startCash || 0, currency)}</span>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-xl">
                        <span className="text-[10px] text-slate-500 block">عدد الفواتير</span>
                        <span className="font-bold text-xs">{shift.totalOrders || shift.invoicesCount || 0} فاتورة</span>
                      </div>
                      {shift.paymentMethodsBreakdown && typeof shift.paymentMethodsBreakdown === 'object' ? (
                        Object.values(shift.paymentMethodsBreakdown).filter(m => Number(m.amount) > 0).map(m => (
                          <div key={m.id} className="p-2 bg-indigo-50/70 rounded-xl border border-indigo-100/50">
                            <span className="text-[10px] text-indigo-700 block font-bold">{m.name}</span>
                            <span className="font-bold font-mono text-xs text-indigo-950">+{formatMoney(m.amount, currency)}</span>
                          </div>
                        ))
                      ) : (
                        <>
                          <div className="p-2 bg-emerald-50 rounded-xl">
                            <span className="text-[10px] text-emerald-600 block">مبيعات نقدية</span>
                            <span className="font-bold font-mono text-xs text-emerald-700">{formatMoney(shift.cashSales || 0, currency)}</span>
                          </div>
                          <div className="p-2 bg-blue-50 rounded-xl">
                            <span className="text-[10px] text-blue-600 block">مبيعات شبكة</span>
                            <span className="font-bold font-mono text-xs text-blue-700">{formatMoney(shift.cardSales || 0, currency)}</span>
                          </div>
                          {(shift.creditSales || 0) > 0 && (
                            <div className="p-2 bg-amber-50 rounded-xl">
                              <span className="text-[10px] text-amber-600 block">مبيعات آجل</span>
                              <span className="font-bold font-mono text-xs text-amber-700">{formatMoney(shift.creditSales, currency)}</span>
                            </div>
                          )}
                          {(shift.bankSales || shift.transferSales || 0) > 0 && (
                            <div className="p-2 bg-indigo-50 rounded-xl">
                              <span className="text-[10px] text-indigo-600 block">مبيعات تحويل</span>
                              <span className="font-bold font-mono text-xs text-indigo-700">{formatMoney(shift.bankSales || shift.transferSales, currency)}</span>
                            </div>
                          )}
                          {(shift.visaSales || 0) > 0 && (
                            <div className="p-2 bg-purple-50 rounded-xl">
                              <span className="text-[10px] text-purple-600 block">مبيعات فيزا</span>
                              <span className="font-bold font-mono text-xs text-purple-700">{formatMoney(shift.visaSales, currency)}</span>
                            </div>
                          )}
                          {(shift.tamaraSales || 0) > 0 && (
                            <div className="p-2 bg-amber-50 rounded-xl">
                              <span className="text-[10px] text-amber-600 block">مبيعات تمارا</span>
                              <span className="font-bold font-mono text-xs text-amber-700">{formatMoney(shift.tamaraSales, currency)}</span>
                            </div>
                          )}
                          {(shift.ninjaSales || 0) > 0 && (
                            <div className="p-2 bg-rose-50 rounded-xl">
                              <span className="text-[10px] text-rose-600 block">مبيعات نينجا</span>
                              <span className="font-bold font-mono text-xs text-rose-700">{formatMoney(shift.ninjaSales, currency)}</span>
                            </div>
                          )}
                        </>
                      )}
                      {(shift.totalExpenses || 0) > 0 && (
                        <div className="p-2 bg-rose-50 rounded-xl">
                          <span className="text-[10px] text-rose-600 block">مصروفات</span>
                          <span className="font-bold font-mono text-xs text-rose-700">-{formatMoney(shift.totalExpenses, currency)}</span>
                        </div>
                      )}
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-600">المتوقع بالدرج:</span>
                        <span className="font-bold font-mono">{formatMoney(shift.expectedCash || 0, currency)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-600">الفعلي المحصى:</span>
                        <span className="font-black font-mono">{formatMoney(shift.actualCash || 0, currency)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] pt-1 border-t border-slate-200">
                        <span className="font-bold">الفارق:</span>
                        <span className={`font-black font-mono ${diffColor}`}>{diffText}</span>
                      </div>
                    </div>

                    {shift.notes && (
                      <p className="text-[10px] text-slate-600 p-2 bg-amber-50 rounded-xl">
                        <strong>📝 ملاحظات:</strong> {shift.notes}
                      </p>
                    )}

                    {/* أزرار الإجراءات: واتساب، تعديل، حذف */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleShareShiftWhatsApp(shift)}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[10px] flex items-center justify-center gap-1 transition active:scale-95"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>إرسال واتساب 💬</span>
                      </button>

                      {isAdmin && (
                        <>
                          <button
                            onClick={() => handleOpenEdit(shift)}
                            className="py-2 px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl font-bold text-[10px] flex items-center gap-1 transition active:scale-95 border border-purple-200"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>

                          <button
                            onClick={() => handleDeleteShift(shift.id)}
                            className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-[10px] flex items-center gap-1 transition active:scale-95 border border-rose-200"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* نافذة تعديل الوردية */}
      {editingShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/75 backdrop-blur-sm animate-in fade-in select-none">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-pink-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-black text-slate-800 text-xs">تعديل تقرير الوردية</h4>
                  <span className="text-[10px] text-slate-500 font-mono">الكاشير: {resolveUserName(editingShift, users)}</span>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setEditingShift(null)} 
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">العهدة الافتتاحية ({currency}):</label>
                <input
                  type="number"
                  step="any"
                  value={editOpeningCash}
                  onChange={e => setEditOpeningCash(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-purple-300 outline-none"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">النقدية الفعلية المحصاة ({currency}):</label>
                <input
                  type="number"
                  step="any"
                  value={editActualCash}
                  onChange={e => setEditActualCash(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-purple-300 outline-none"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">الملاحظات:</label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-purple-300 outline-none"
                  placeholder="أدخل أي ملاحظات تصحيحية..."
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 text-white rounded-xl font-black transition active:scale-95 shadow-md text-xs"
                >
                  حفظ التعديلات ✅
                </button>
                <button
                  type="button"
                  onClick={() => setEditingShift(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition text-xs"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
