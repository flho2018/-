import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Database, Save, CheckCircle, Download, Upload, Clock, RotateCcw, Cloud, Zap, Trash2, AlertTriangle, FileUp, Check, X, RefreshCw } from 'lucide-react';
import { formatDate } from '../../utils/helpers';
import { verifyPin } from '../../utils/security';
import { idbGet, idbSet, safeLocalStorageSet, getStorageUsageEstimate } from '../../utils/idbStorage';
import { syncEngine } from '../../utils/syncEngine';

// =========================================================================
//  لوحة النسخ الاحتياطية السحابية
// =========================================================================
//  الغياب الذي تعالجه: `runAutoCloudBackup` كان يرفع نسخة يومية إلى
//  `pos_backups` فعلاً، لكن `listBackups` و `getBackup` و `deleteBackup`
//  **لم يستدعها أي مكوّن في البرنامج**. أي أن النسخ كانت تُكتب ولا تُقرأ:
//  لا تُعرض، ولا تُسترجع، ولا تُحذف. ونسخةٌ لا تُستعاد ليست نسخة احتياطية،
//  هي مجرد تكلفة تخزين تُطمئن صاحبها بلا سبب.
// =========================================================================
export const CloudBackupsPanel = ({ onRestore, restoreArmed }) => {
  const [rows, setRows] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  const load = async () => {
    setBusy(true); setMsg(null);
    const res = await syncEngine.listBackups();
    setBusy(false);
    if (!res.success) { setMsg({ t: 'err', m: 'تعذّر جلب القائمة: ' + (res.error?.message || '') }); return; }
    setRows(res.rows || []);
  };

  React.useEffect(() => { load(); }, []);

  const handleRestore = async (row) => {
    if (!restoreArmed) {
      setMsg({ t: 'err', m: 'أدخل رمز المدير أعلاه أولاً — الاسترجاع يستبدل بيانات المتجر الحية.' });
      return;
    }
    if (!window.confirm(
      `استرجاع النسخة المؤرخة ${new Date(row.date).toLocaleString('ar-SA')}؟\n\n` +
      `سيُستبدل كل ما في المتجر الآن بمحتوى هذه النسخة.`
    )) return;

    setBusy(true); setMsg(null);
    const res = await syncEngine.getBackup(row.id);
    setBusy(false);
    if (!res.success) {
      // نسخة ناقصة القطع أخطر من غائبة: استرجاعها يكتب بيانات مبتورة
      setMsg({ t: 'err', m: res.incomplete
        ? 'هذه النسخة ناقصة القطع ولا يصحّ استرجاعها — اختر نسخة أخرى.'
        : 'تعذّر جلب بيانات النسخة: ' + (res.error?.message || '') });
      return;
    }
    onRestore(res.data);
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`حذف النسخة المؤرخة ${new Date(row.date).toLocaleString('ar-SA')} نهائياً؟`)) return;
    setBusy(true);
    const res = await syncEngine.deleteBackup(row.id);
    setBusy(false);
    if (res.success) { setMsg({ t: 'ok', m: 'حُذفت النسخة.' }); load(); }
    else setMsg({ t: 'err', m: 'تعذّر الحذف: ' + (res.error?.message || '') });
  };

  return (
    <div className="bg-white/95 p-4 rounded-3xl border border-cyan-200 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-cyan-600" />
            <span>النسخ الاحتياطية السحابية</span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            تُرفع تلقائياً مرة كل ٢٤ ساعة من جهاز المدير، وتراها كل الأجهزة.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="px-3 py-1.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-800 text-[11px] font-black transition active:scale-95 disabled:opacity-50"
        >
          {busy ? 'جارٍ…' : 'تحديث القائمة 🔄'}
        </button>
      </div>

      {msg && (
        <div className={`text-[11px] font-bold px-3 py-2 rounded-xl border ${
          msg.t === 'ok'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>{msg.m}</div>
      )}

      {rows === null && <div className="text-[11px] text-slate-400 py-3 text-center">جارٍ التحميل…</div>}

      {rows !== null && rows.length === 0 && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-bold">
          ⚠️ لا توجد أي نسخة سحابية بعد. النسخة التلقائية ترفع من جهاز المدير مرة كل ٢٤ ساعة.
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {rows.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 flex-wrap">
              <div className="min-w-0">
                <div className="text-[11px] font-black text-slate-900">
                  {r.date ? new Date(r.date).toLocaleString('ar-SA') : r.id}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {r.size || '—'} · {r.invoicesCount ?? '—'} فاتورة · {r.productsCount ?? '—'} صنف
                  {r.source === 'auto' ? ' · تلقائية' : r.source ? ` · ${r.source}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleRestore(r)}
                  disabled={busy}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black transition active:scale-95 disabled:opacity-50"
                >
                  استرجاع
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(r)}
                  disabled={busy}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[10px] font-black transition active:scale-95 disabled:opacity-50"
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const BackupSettingsTab = () => {
  const { 
    storeInfo, 
    updateStoreInfo,
    products,
    categories,
    customers,
    suppliers,
    invoices,
    purchases,
    expenses,
    drawerTransactions,
    shiftsHistory,
    users,
    importBackup,
    pushAllToCloud,
    syncStatus,
    lastSyncTime,
    currentUser
  } = useApp();

  // رمز تأكيد الاستعادة — الاستعادة تستبدل بيانات المتجر الحية وترفعها
  // للسحابة، فتُعامَل بنفس صرامة مركز التصفير الذي يطلب رمز المدير.
  const [importPin, setImportPin] = useState('');
  // تسليح الاسترجاع السحابي بنفس بوابة رمز المدير المستعملة للاستيراد من ملف:
  // الاسترجاع من السحابة يستبدل بيانات المتجر في كل الأجهزة تماماً كالاستيراد،
  // فلا يصحّ أن يكون أحدهما محميّاً والآخر مفتوحاً.
  const [cloudRestorePin, setCloudRestorePin] = useState('');
  const isAdminForCloud = currentUser?.role === 'admin' || currentUser?.isAdmin;
  const cloudRestoreArmed = isAdminForCloud && verifyPin(String(cloudRestorePin || '').trim(), currentUser);

  const handleCloudRestore = async (jsonStr) => {
    try {
      takeSnapshot('pre_cloud_restore_safety');
      const res = importBackup(jsonStr, { mode: 'replace' });
      if (res?.success) {
        await pushAllToCloud();
        showToast('🎉 ' + (res.message || 'تم استرجاع النسخة السحابية'));
      } else {
        alert(res?.message || 'تعذّر تطبيق النسخة المسترجعة');
      }
    } catch (e) {
      alert('خطأ أثناء الاسترجاع: ' + (e?.message || e));
    }
  };

  const [importPinError, setImportPinError] = useState('');

  // إعدادات الجدولة
  const [backupSchedule, setBackupSchedule] = useState(storeInfo.backupSchedule || 'realtime');
  const [backupTime, setBackupTime] = useState(storeInfo.backupTime || '23:59');
  const [backupDayOfWeek, setBackupDayOfWeek] = useState(storeInfo.backupDayOfWeek || '5'); // 5 = الجمعة
  const [autoDownloadJson, setAutoDownloadJson] = useState(storeInfo.autoDownloadJson || false);
  const [autoCloudSync, setAutoCloudSync] = useState(storeInfo.autoCloudSync !== false);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [actionToast, setActionToast] = useState(null);

  // حالة استيراد النسخة الاحتياطية
  const [importFileContent, setImportFileContent] = useState(null);
  const [importFileName, setImportFileName] = useState('');
  const [importStats, setImportStats] = useState(null);
  const [importMode, setImportMode] = useState('replace'); // replace | merge
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // سجل لقطات النسخ الاحتياطية المحلية
  const [localBackups, setLocalBackups] = useState(() => {
    try {
      const saved = localStorage.getItem('naif_local_backups_list');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // استرجاع سجل اللقطات الكامل وسعة التخزين من IndexedDB
  const [storageEstimate, setStorageEstimate] = useState(null);
  useEffect(() => {
    idbGet('naif_local_backups_list').then(idbList => {
      if (Array.isArray(idbList) && idbList.length > 0) {
        setLocalBackups(idbList);
      }
    });
    getStorageUsageEstimate().then(est => setStorageEstimate(est));
  }, [invoices.length, products.length]);

  // عداد الوقت التنازلي للنسخ التلقائي القادم
  const [secondsUntilNextBackup, setSecondsUntilNextBackup] = useState(null);
  const lastBackupTimestampRef = useRef(Date.now());

  // دالة توليد كائن النسخة الاحتياطية الشامل
  const generateFullBackupObject = () => {
    return {
      version: '3.5.0',
      appName: 'Bayt Alward POS',
      generatedAt: new Date().toISOString(),
      storeInfo,
      products,
      categories,
      customers,
      suppliers,
      invoices,
      purchases,
      expenses,
      drawerTransactions,
      shiftsHistory,
      users
    };
  };

  // أخذ لقطة سريعة وحفظها بالسجل وفي IndexedDB بسعة غير محدودة
  const takeSnapshot = (source = 'manual') => {
    const backupObj = generateFullBackupObject();
    const strData = JSON.stringify(backupObj);
    const sizeKb = (strData.length / 1024).toFixed(1) + ' KB';

    const newRecord = {
      id: 'bkp-' + Date.now(),
      date: new Date().toISOString(),
      source,
      size: sizeKb,
      invoicesCount: invoices.length,
      productsCount: products.length,
      customersCount: customers.length,
      data: strData
    };

    const updated = [newRecord, ...localBackups.slice(0, 14)];
    setLocalBackups(updated);

    // 1. حفظ النسخة الاحتياطية كاملة في IndexedDB دون خطر تجاوز الحصة
    idbSet('naif_latest_snapshot_data', strData);
    idbSet('naif_local_backups_list', updated);

    // 2. حفظ ملخص السجل في LocalStorage مع حماية من أخطاء الامتلاء
    const summaryList = updated.map(u => ({
      id: u.id,
      date: u.date,
      source: u.source,
      size: u.size,
      invoicesCount: u.invoicesCount,
      productsCount: u.productsCount,
      customersCount: u.customersCount
    }));
    safeLocalStorageSet('naif_local_backups_list', summaryList);

    lastBackupTimestampRef.current = Date.now();
    return backupObj;
  };

  // تنزيل ملف النسخة الاحتياطية JSON
  const handleDownloadBackup = () => {
    const backupObj = takeSnapshot('download');
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", `baytalward-backup-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-4)}.json`);
    dl.click();

    showToast('✅ تم تنزيل النسخة الاحتياطية الشاملة بصيغة JSON بنجاح!');
  };

  // تنفيذ النسخ اللحظي الفوري والمزامنة السحابية الآن
  const handleTriggerRealtimeBackup = async () => {
    takeSnapshot('realtime_trigger');
    try {
      await pushAllToCloud();
      showToast('⚡ تم تنفيذ النسخ الاحتياطي والمزامنة السحابية اللحظية بنجاح!');
    } catch (e) {
      showToast('⚠️ تم حفظ النسخة محلياً مع تنبيه أثناء المزامنة');
    }
  };

  // معالجة اختيار ملف الاستيراد
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        const parsed = JSON.parse(content);
        
        // حساب إحصائيات الملف
        setImportStats({
          version: parsed.version || 'غير محدد',
          date: parsed.generatedAt || parsed.exportedAt || null,
          productsCount: Array.isArray(parsed.products) ? parsed.products.length : 0,
          categoriesCount: Array.isArray(parsed.categories) ? parsed.categories.length : 0,
          invoicesCount: Array.isArray(parsed.invoices) ? parsed.invoices.length : 0,
          customersCount: Array.isArray(parsed.customers) ? parsed.customers.length : 0,
          suppliersCount: Array.isArray(parsed.suppliers) ? parsed.suppliers.length : 0,
          expensesCount: Array.isArray(parsed.expenses) ? parsed.expenses.length : 0,
          storeName: parsed.storeInfo?.name || 'متجر'
        });

        setImportFileContent(content);
        setIsImportModalOpen(true);
      } catch (err) {
        alert('❌ الملف المختار ليس ملف JSON صالح للنسخ الاحتياطي!');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // تأكيد وتنفيذ الاستيراد
  const handleConfirmImport = async () => {
    if (!importFileContent) return;

    // =====================================================================
    //  استعادة نسخة = استبدال بيانات المتجر كلها في السحابة
    // =====================================================================
    //  هذا الملف كان بلا أي فحص صلاحية أو رمز على الإطلاق، بينما نفس
    //  العملية في تبويب "التصفير" تطلب رمز المدير. والتبويب يُفتح لكل من
    //  يملك settings_cloud_sync_backup — وهي ممنوحة للمحاسب في القوالب.
    //  فكان المحاسب يستبدل بيانات المتجر كاملة بلا رمز، والمدير نفسه
    //  يُطالَب برمزه لفعل الشيء ذاته من تبويب آخر. توحيد الحماية:
    // =====================================================================
    const isAdminUser = currentUser?.role === 'admin' || currentUser?.isAdmin;
    if (!isAdminUser) {
      setImportPinError('الاستعادة متاحة للمدير وحده — هذه العملية تستبدل بيانات المتجر في كل الأجهزة.');
      return;
    }
    if (!verifyPin(String(importPin || '').trim(), currentUser)) {
      setImportPinError('رمز المدير غير صحيح. أدخل الرمز الصحيح لتأكيد الاستعادة.');
      return;
    }
    setImportPinError('');

    setIsImporting(true);
    try {
      // 1. أخذ لقطة أمان احتياطية قبل الاستيراد
      takeSnapshot('pre_import_safety');

      // 2. تطبيق الاستيراد
      const res = importBackup(importFileContent, { mode: importMode });
      
      if (res.success) {
        // 3. مزامنة فورية مع السحابة
        await pushAllToCloud();
        setIsImportModalOpen(false);
        setImportFileContent(null);
        showToast(`🎉 ${res.message}`);
      } else {
        alert(res.message || 'حدث خطأ أثناء الاستيراد');
      }
    } catch (e) {
      console.error(e);
      alert('حدث خطأ غير متوقع أثناء استيراد البيانات: ' + e.message);
    } finally {
      setIsImporting(false);
    }
  };

  // استعادة لقطة من السجل
  const handleRestoreSnapshot = async (bkp) => {
    if (!confirm(`هل أنت متأكد من استعادة النسخة المؤرخة في (${formatDate(bkp.date)})؟`)) {
      return;
    }

    try {
      let dataToRestore = bkp.data;
      if (!dataToRestore) {
        dataToRestore = await idbGet('naif_latest_snapshot_data');
      }
      if (!dataToRestore) {
        dataToRestore = localStorage.getItem('naif_latest_snapshot_data');
      }
      if (!dataToRestore) {
        alert('بيانات هذه النسخة قديمة ولم تعد مخزنة محلياً، يرجى استيراد ملف JSON.');
        return;
      }

      takeSnapshot('pre_restore_safety');
      const res = importBackup(dataToRestore, { mode: 'replace' });
      if (res.success) {
        await pushAllToCloud();
        showToast('✅ تمت استعادة النسخة المحددة بنجاح وتحديث النظام بالكامل!');
      }
    } catch (e) {
      alert('خطأ أثناء الاستعادة: ' + e.message);
    }
  };

  // حذف لقطة من السجل
  const handleDeleteSnapshot = (id) => {
    const updated = localBackups.filter(b => b.id !== id);
    setLocalBackups(updated);
    idbSet('naif_local_backups_list', updated);
    const summaryList = updated.map(u => ({
      id: u.id, date: u.date, source: u.source, size: u.size,
      invoicesCount: u.invoicesCount, productsCount: u.productsCount, customersCount: u.customersCount
    }));
    safeLocalStorageSet('naif_local_backups_list', summaryList);
  };

  // حفظ الجدولة
  const handleSaveSchedule = () => {
    updateStoreInfo({
      ...storeInfo,
      backupSchedule,
      backupTime,
      backupDayOfWeek,
      autoDownloadJson,
      autoCloudSync
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // إظهار إشعار Toast
  const showToast = (msg) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 4000);
  };

  // محرك إدارة المؤقت والعد التنازلي للنسخ التلقائي
  useEffect(() => {
    let intervalMinutes = 0;
    if (backupSchedule === '15min') intervalMinutes = 15;
    else if (backupSchedule === '30min') intervalMinutes = 30;
    else if (backupSchedule === 'hourly') intervalMinutes = 60;
    else if (backupSchedule === '6hours') intervalMinutes = 360;

    const timer = setInterval(() => {
      const now = new Date();
      
      // الجدولة بالدقائق
      if (intervalMinutes > 0) {
        const elapsedSec = Math.floor((Date.now() - lastBackupTimestampRef.current) / 1000);
        const totalIntervalSec = intervalMinutes * 60;
        const remaining = Math.max(0, totalIntervalSec - elapsedSec);
        setSecondsUntilNextBackup(remaining);

        if (remaining <= 0) {
          takeSnapshot(`auto_${backupSchedule}`);
          if (autoCloudSync) pushAllToCloud();
          if (autoDownloadJson) handleDownloadBackup();
        }
      } 
      // الجدولة اليومية في وقت محدد
      else if (backupSchedule === 'daily') {
        const [targetHour, targetMinute] = backupTime.split(':').map(Number);
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentSec = now.getSeconds();

        let targetTimeToday = new Date();
        targetTimeToday.setHours(targetHour || 23, targetMinute || 59, 0, 0);

        if (targetTimeToday.getTime() <= now.getTime()) {
          targetTimeToday.setDate(targetTimeToday.getDate() + 1);
        }

        const diffSec = Math.floor((targetTimeToday.getTime() - now.getTime()) / 1000);
        setSecondsUntilNextBackup(diffSec);

        if (currentHour === targetHour && currentMinute === targetMinute && currentSec < 2) {
          takeSnapshot('auto_daily');
          if (autoCloudSync) pushAllToCloud();
        }
      } else {
        setSecondsUntilNextBackup(null);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [backupSchedule, backupTime, autoCloudSync, autoDownloadJson]);

  // تنسيق الثواني إلى دقيقة:ثانية
  const formatCountdown = (totalSeconds) => {
    if (totalSeconds === null || isNaN(totalSeconds)) return '--:--';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours} ساعة و ${minutes} د`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const scheduleOptions = [
    { id: 'realtime', label: '⚡ فوري ولحظي (Real-time)', desc: 'مزامنة ونسخ فوري مع كل عملية بيع أو تعديل', badge: 'موصى به 🔥' },
    { id: '15min', label: '⏱️ كل 15 دقيقة (15 Mins)', desc: 'أخذ لقطة سريعة كل ربع ساعة بدقة' },
    { id: '30min', label: '⏰ كل 30 دقيقة (30 Mins)', desc: 'حفظ نسخة مصغرة كل نصف ساعة' },
    { id: 'hourly', label: '🕐 كل ساعة (Hourly)', desc: 'حفظ نسخة تلقائية كل 60 دقيقة' },
    { id: '6hours', label: '🕒 كل 6 ساعات (6 Hours)', desc: 'أخذ 4 لقطات على مدار اليوم' },
    { id: 'daily', label: '📅 يومياً في وقت محدد (Daily)', desc: 'نسخ يومي عند إغلاق الحسابات أو وقت محدد' },
    { id: 'weekly', label: '🗓️ أسبوعياً (Weekly)', desc: 'أخذ نسخة شاملة في يوم محدد من كل أسبوع' },
    { id: 'shift_close', label: '🔒 عند إغلاق كل وردية (Shift Close)', desc: 'حفظ لقطة مع كل تقرير Z-Report للكاشير' },
    { id: 'manual', label: '✋ يدوي فقط (Manual Only)', desc: 'النسخ فقط عند طلب المستخدم يدوياً' }
  ];

  return (
    <div className="space-y-5 animate-in fade-in text-xs font-cairo">

      {/* =================================================================
           النسخ السحابية — عرض واسترجاع وحذف
           =================================================================
           كانت هذه النسخ تُرفع يومياً ولا يراها أحد ولا يستطيع استرجاعها:
           دوال المحرّك الثلاث لم تكن مستدعاة من أي مكوّن. القسم هنا هو
           الطريق الوحيد لاستعمالها فعلاً.
           ================================================================= */}
      <div className="space-y-2">
        {isAdminForCloud && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-[11px] font-black text-amber-900 shrink-0">
              رمز المدير لتفعيل الاسترجاع:
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={cloudRestorePin}
              onChange={(e) => setCloudRestorePin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="px-3 py-1.5 rounded-xl border border-amber-300 bg-white text-center tracking-[0.4em] font-black text-sm w-28 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
              dir="ltr"
            />
            <span className={`text-[10px] font-black ${cloudRestoreArmed ? 'text-emerald-700' : 'text-amber-700'}`}>
              {cloudRestoreArmed ? '✅ الاسترجاع مُفعّل' : 'الاسترجاع مقفل حتى يُدخل الرمز'}
            </span>
          </div>
        )}
        <CloudBackupsPanel onRestore={handleCloudRestore} restoreArmed={cloudRestoreArmed} />
      </div>

      {/* رأس الصفحة مع أزرار الإجراء السريع */}
      <div className="bg-gradient-to-r from-slate-950 via-[#1e1b4b] to-[#31103f] text-white p-5 sm:p-6 rounded-3xl shadow-xl border border-indigo-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-3xl border border-white/20 shadow-lg shadow-indigo-500/30">
            💾
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black flex items-center gap-2">
              <span>النسخ الاحتياطي الشامل والاستيراد المباشر</span>
              <span className="text-pink-400">🌸</span>
            </h3>
            <p className="text-xs text-indigo-200/80 mt-0.5">
              استيراد وتصدير قواعد البيانات، والنسخ اللحظي والمجدول بدقة متناهية لحماية كافة الفواتير والمنتجات
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* زر الاستيراد */}
          <label className="flex-1 md:flex-none px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white rounded-2xl font-black shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 border border-blue-400/30">
            <Upload className="w-4 h-4" />
            <span>📥 استيراد نسخة احتياطية</span>
            <input type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
          </label>

          {/* زر التنزيل */}
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="flex-1 md:flex-none px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white rounded-2xl font-black shadow-md transition flex items-center justify-center gap-1.5 active:scale-95 border border-emerald-400/30"
          >
            <Download className="w-4 h-4" />
            <span>تنزيل JSON 📤</span>
          </button>

          {/* زر النسخ اللحظي الفوري */}
          <button
            type="button"
            onClick={handleTriggerRealtimeBackup}
            className="flex-1 md:flex-none px-4 py-2.5 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 text-white rounded-2xl font-black shadow-md transition flex items-center justify-center gap-1.5 active:scale-95 border border-pink-400/30 animate-pulse"
            title="حفظ لقطة فورية ومزامنة سحابية لحظية"
          >
            <Zap className="w-4 h-4" />
            <span>نسخ لحظي الآن ⚡</span>
          </button>
        </div>
      </div>

      {/* تنبيهات الإجراء والنجاح */}
      {actionToast && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-950 font-bold flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionToast}</span>
          </div>
          <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-lg">سحابي ومحلي ✅</span>
        </div>
      )}

      {saveSuccess && (
        <div className="p-3 bg-blue-50 border border-blue-300 rounded-2xl text-blue-900 font-bold flex items-center gap-2 shadow-xs animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-blue-600" />
          <span>تم حفظ وتفعيل خيارات الجدولة الدقيقة بنجاح! 🌸</span>
        </div>
      )}

      {/* بطاقة حالة النسخ والمؤقت اللحظي والتخزين عالي السعة */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-white rounded-3xl border border-pink-100 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-pink-50 text-pink-700 flex items-center justify-center font-black">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-bold">حالة المزامنة السحابية:</span>
            <span className="font-black text-slate-900 flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
              <span>{syncStatus === 'synced' ? 'متزامن لحظياً بالسحابة' : 'جاري المزامنة...'}</span>
            </span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-pink-100 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-bold">النسخ المجدول القادم:</span>
            <span className="font-black text-indigo-900 font-mono">
              {secondsUntilNextBackup !== null ? `بعد ${formatCountdown(secondsUntilNextBackup)} ⏳` : 'حسب العمليات (لحظي ⚡)'}
            </span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-pink-100 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-bold">إجمالي السجلات المحمية:</span>
            <span className="font-black text-slate-900">
              {products.length} صنف • {invoices.length} فاتورة
            </span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-3xl border border-pink-100 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center font-black">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-bold">التخزين المحلي (IndexedDB):</span>
            <span className="font-black text-purple-900 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>سعة غير محدودة ✅</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono block">
              {storageEstimate?.usageMB ? `مستخدم: ${storageEstimate.usageMB} MB` : 'مساحة وفيرة'}
            </span>
          </div>
        </div>
      </div>

      {/* نافذة معاينة وتأكيد الاستيراد (Import Modal) */}
      {isImportModalOpen && importStats && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-5 border border-indigo-100 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black">
                  <FileUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">معاينة واستيراد النسخة الاحتياطية 📥</h3>
                  <span className="text-[10px] text-slate-500 font-mono block">{importFileName}</span>
                </div>
              </div>
              <button onClick={() => setIsImportModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* تفاصيل وإحصائيات ملف النسخة الاحتياطية */}
            <div className="p-3.5 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">اسم المتجر في الملف:</span>
                <span className="font-black text-indigo-900">{importStats.storeName}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">تاريخ إنشاء النسخة:</span>
                <span className="font-mono text-slate-600">{importStats.date ? formatDate(importStats.date) : 'غير مسجل'}</span>
              </div>
            </div>

            {/* شبكة محتويات الملف */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] text-slate-500 block">الأصناف:</span>
                <span className="font-black text-slate-900 text-sm">{importStats.productsCount} صنف</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] text-slate-500 block">الفواتير:</span>
                <span className="font-black text-slate-900 text-sm">{importStats.invoicesCount} فاتورة</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] text-slate-500 block">العملاء:</span>
                <span className="font-black text-slate-900 text-sm">{importStats.customersCount} عميل</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] text-slate-500 block">الموردين:</span>
                <span className="font-black text-slate-900 text-sm">{importStats.suppliersCount} مورد</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] text-slate-500 block">الأقسام:</span>
                <span className="font-black text-slate-900 text-sm">{importStats.categoriesCount} قسم</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] text-slate-500 block">المصروفات:</span>
                <span className="font-black text-slate-900 text-sm">{importStats.expensesCount} مصروف</span>
              </div>
            </div>

            {/* تحديد طريقة الاستيراد */}
            <div className="space-y-2 pt-1">
              <label className="font-bold text-slate-800 block text-xs">اختر طريقة الاستيراد والتطبيق:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setImportMode('replace')}
                  className={`p-3 rounded-2xl border text-right transition ${
                    importMode === 'replace'
                      ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-400/30 font-black text-rose-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-xs">🔄 استبدال شامل (Full Restore)</span>
                    {importMode === 'replace' && <Check className="w-4 h-4 text-rose-600" />}
                  </div>
                  <span className="text-[10px] text-slate-500 block">استبدال كامل البيانات الحالية بما في الملف (تفريغ واستعادة كاملة)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMode('merge')}
                  className={`p-3 rounded-2xl border text-right transition ${
                    importMode === 'merge'
                      ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400/30 font-black text-emerald-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-xs">➕ دمج ذكي (Smart Merge)</span>
                    {importMode === 'merge' && <Check className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <span className="text-[10px] text-slate-500 block">إضافة الأصناف والعملاء الجدد مع الحفاظ على البيانات السابقة</span>
                </button>
              </div>
            </div>

            {/* تنبيه الأمان */}
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-950 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>تنبيه أمان:</strong> سيقوم النظام تلقائياً بأخذ لقطة أمان احتياطية لقاعدتك الحالية قبل تطبيق الاستيراد لتتمكن من الرجوع إليها إن أردت.
              </span>
            </div>

            {/* رمز تأكيد المدير — الاستعادة تستبدل بيانات كل الأجهزة */}
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-slate-800">
                أدخل رمز الدخول السريع (PIN) للمدير لتأكيد الاستعادة:
              </label>
              <input
                type="password"
                maxLength={6}
                value={importPin}
                onChange={e => { setImportPin(e.target.value); setImportPinError(''); }}
                placeholder="••••"
                className="w-full text-center text-xl tracking-widest font-black py-2 px-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-indigo-500 focus:bg-white focus:outline-none transition"
              />
              {importPinError && (
                <p className="text-xs font-bold text-rose-600 bg-rose-50 p-2 rounded-xl border border-rose-200">
                  {importPinError}
                </p>
              )}
            </div>

            {/* أزرار الإجراء */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="flex-1 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 text-white rounded-2xl font-black text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري استعادة ومزامنة البيانات...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>تأكيد وتنفيذ الاستيراد الآن 🌸</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                disabled={isImporting}
                className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* خيارات الجدولة التلقائية بدقة متناهية */}
      <div className="p-5 bg-white rounded-3xl border border-pink-100 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            <div>
              <h4 className="font-black text-slate-900 text-sm">خيارات وتوقيت النسخ الاحتياطي التلقائي:</h4>
              <p className="text-[11px] text-slate-500">اختر التوقيت أو الفترة الزمنية التي تناسب طبيعة عمل المحل</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveSchedule}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs shadow-xs transition active:scale-95 flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>حفظ الجدولة 💾</span>
          </button>
        </div>

        {/* شبكة خيارات الجدولة */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {scheduleOptions.map(opt => {
            const isSelected = backupSchedule === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setBackupSchedule(opt.id)}
                className={`p-3.5 rounded-2xl border text-right transition active:scale-95 relative ${
                  isSelected
                    ? 'bg-indigo-50/80 border-indigo-600 ring-2 ring-indigo-400/30 shadow-xs font-black'
                    : 'bg-slate-50/60 border-slate-200 hover:border-indigo-200 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black block text-slate-900 text-xs">{opt.label}</span>
                  {opt.badge && (
                    <span className="text-[9px] bg-pink-100 text-pink-700 font-bold px-1.5 py-0.5 rounded">
                      {opt.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 leading-tight block">{opt.desc}</span>
              </button>
            );
          })}
        </div>

        {/* إعدادات إضافية حسب نوع الجدولة المحددة */}
        {backupSchedule === 'daily' && (
          <div className="p-3.5 bg-indigo-50/40 rounded-2xl border border-indigo-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div>
              <span className="font-black text-indigo-950 block">توقيت النسخ اليومي الدقيق:</span>
              <span className="text-[10px] text-indigo-800/80">سيتم أخذ النسخة الاحتياطية يومياً في هذا الوقت المحدد بالساعة والدقيقة</span>
            </div>
            <input
              type="time"
              value={backupTime}
              onChange={e => setBackupTime(e.target.value)}
              className="px-3 py-1.5 bg-white border border-indigo-300 rounded-xl font-mono font-black text-slate-900 text-sm shadow-xs"
            />
          </div>
        )}

        {backupSchedule === 'weekly' && (
          <div className="p-3.5 bg-indigo-50/40 rounded-2xl border border-indigo-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div>
              <span className="font-black text-indigo-950 block">اليوم والتوقيت الأسبوعي:</span>
              <span className="text-[10px] text-indigo-800/80">تحديد اليوم المفضل لأخذ النسخة الأسبوعية الشاملة</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={backupDayOfWeek}
                onChange={e => setBackupDayOfWeek(e.target.value)}
                className="px-3 py-1.5 bg-white border border-indigo-300 rounded-xl font-bold text-slate-900"
              >
                <option value="5">كل يوم جمعة 🕌</option>
                <option value="6">كل يوم سبت 🌸</option>
                <option value="0">كل يوم أحد 🌿</option>
                <option value="4">كل يوم خميس 📦</option>
              </select>
              <input
                type="time"
                value={backupTime}
                onChange={e => setBackupTime(e.target.value)}
                className="px-3 py-1.5 bg-white border border-indigo-300 rounded-xl font-mono font-black text-slate-900"
              />
            </div>
          </div>
        )}

        {/* خيارات إضافية للنسخ */}
        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-100">
            <input
              type="checkbox"
              checked={autoCloudSync}
              onChange={e => setAutoCloudSync(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            <div>
              <span className="font-bold text-slate-900 block">مزامنة سحابية تلقائية مع Firebase</span>
              <span className="text-[10px] text-slate-500">رفع كافة البيانات فورياً لقاعدة Firestore السحابية</span>
            </div>
          </label>

          <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-100">
            <input
              type="checkbox"
              checked={autoDownloadJson}
              onChange={e => setAutoDownloadJson(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            <div>
              <span className="font-bold text-slate-900 block">تنزيل تلقائي لملف JSON في التنزيلات</span>
              <span className="text-[10px] text-slate-500">حفظ نسخة مادية على القرص الصلب للجهاز</span>
            </div>
          </label>
        </div>
      </div>

      {/* سجل النسخ الاحتياطية الموثقة مع إمكانية الاستعادة الفورية */}
      <div className="p-5 bg-white rounded-3xl border border-pink-100 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-600" />
            <div>
              <h4 className="font-black text-slate-900 text-sm">سجل لقطات النسخ الاحتياطي السابقة:</h4>
              <p className="text-[10px] text-slate-500">يمكنك استعادة أي لقطة سابقة أو تنزيلها بضغطة زر</p>
            </div>
          </div>
          <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full">
            {localBackups.length} لقطة مسجلة
          </span>
        </div>

        {localBackups.length > 0 ? (
          <div className="space-y-2">
            {localBackups.map(bkp => (
              <div key={bkp.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 hover:border-slate-300 transition">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-900 text-xs">لقطة احتياطية موثقة 📁</span>
                    <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded">
                      {bkp.source === 'download' ? 'تنزيل يدوي' : bkp.source === 'realtime_trigger' ? 'لحظي ⚡' : bkp.source?.startsWith('auto') ? 'تلقائي ⏰' : 'أمان'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono block">
                    {formatDate(bkp.date)} • الحجم: {bkp.size} • {bkp.invoicesCount || 0} فاتورة • {bkp.productsCount || 0} صنف
                  </span>
                </div>

                <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => handleRestoreSnapshot(bkp)}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl font-bold text-[11px] flex items-center gap-1 border border-emerald-200 transition active:scale-95"
                    title="استعادة هذه اللقطة فورياً لقاعدة البيانات"
                  >
                    <RotateCcw className="w-3 h-3 text-emerald-600" />
                    <span>استعادة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(bkp.data || localStorage.getItem('naif_latest_snapshot_data') || '{}');
                      const dl = document.createElement('a');
                      dl.setAttribute("href", dataStr);
                      dl.setAttribute("download", `snapshot-${bkp.id}.json`);
                      dl.click();
                    }}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[11px] flex items-center gap-1 border border-slate-200 transition active:scale-95"
                    title="تنزيل اللقطة كملف JSON"
                  >
                    <Download className="w-3 h-3" />
                    <span>JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteSnapshot(bkp.id)}
                    className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl border border-rose-200 transition"
                    title="حذف هذه النسخة من السجل"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl">
            لا توجد لقطات سابقة مسجلة حتى الآن. انقر على "نسخ لحظي الآن ⚡" لإنشاء أول لقطة فورية.
          </div>
        )}
      </div>

    </div>
  );
};
