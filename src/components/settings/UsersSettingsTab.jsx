import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Users, UserCheck, Shield, Key, Plus, Edit2, Trash2, CheckCircle, X, Eye, EyeOff, CheckSquare, Square, ChevronDown, ChevronUp, BadgeCheck, CreditCard, Smartphone, Laptop, Clock, History, Search } from 'lucide-react';
import { PERMISSION_CATEGORIES, ALL_PERMISSION_KEYS, ROLE_PRESETS, FULL_ADMIN_PERMISSIONS } from '../../utils/permissions';
import { BonusRuleEditor } from './BonusRuleEditor';
import { DEFAULT_BONUS_RULE } from '../../utils/staffPerformance';
import { verifyPin, hashPin, hasNfcCard } from '../../utils/security';


export const UsersSettingsTab = () => {
  const {
    users,
    currentUser,
    storeInfo,
    updateStoreInfo,
    addUser,
    updateUser,
    deleteUser,
    switchUser,
    loginLogs = [],
    clearLoginLogs,
    confirmDialog
  } = useApp();

  // نمط العرض الفرعي: إما قائمة المستخدمين أو سجل الدخول والأجهزة
  const [subTab, setSubTab] = useState('users'); // 'users' or 'logs'
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logFilterUser, setLogFilterUser] = useState('all');
  const [logFilterDevice, setLogFilterDevice] = useState('all');

  // حالة النافذة المنبثقة (إضافة أو تعديل)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // حقول نموذج المستخدم
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [phone, setPhone] = useState('');
  const [nfcCardId, setNfcCardId] = useState('');
  const [role, setRole] = useState('cashier');
  const [isActive, setIsActive] = useState(true);
  const [permissions, setPermissions] = useState({});
  // قاعدة البونص: تُحفظ في user.bonusRule ويقرأها محرّك الأداء
  const [bonusRule, setBonusRule] = useState({ ...DEFAULT_BONUS_RULE });
  const [showPinInList, setShowPinInList] = useState({});
  const [isScanningNfc, setIsScanningNfc] = useState(false);
  const [nfcScanStatus, setNfcScanStatus] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({
    pos: true,
    invoices: true,
    products: true,
    customers_suppliers: true,
    drawer_expenses: true,
    reports: true,
    settings: true
  });

  // مسح بطاقة NFC
  const handleScanNfc = async () => {
    if ('NDEFReader' in window) {
      try {
        setIsScanningNfc(true);
        setNfcScanStatus('📲 قرّب بطاقة NFC الذكية من ظهر الجهاز الآن...');
        const ndef = new window.NDEFReader();
        await ndef.scan();
        ndef.onreading = (event) => {
          const serial = event.serialNumber || ('NFC-' + Date.now().toString().slice(-6));
          setNfcCardId(serial);
          setIsScanningNfc(false);
          setNfcScanStatus(`✅ تم ربط البطاقة بنجاح: ${serial}`);
        };
        ndef.onreadingerror = () => {
          setNfcScanStatus('⚠️ تعذر قراءة البطاقة، حاول مرة أخرى.');
          setIsScanningNfc(false);
        };
      } catch (err) {
        setIsScanningNfc(false);
        setNfcScanStatus('💡 يمكنك كتابة رقم البطاقة أو مسحها بقارئ RFID USB');
      }
    } else {
      setNfcScanStatus('💡 اكتب رقم بطاقة NFC أو قم بمسحها بقارئ البطاقات الموصل بالجهاز');
    }
  };

  // فتح نافذة مستخدم جديد
  const handleOpenAdd = () => {
    setEditingUser(null);
    setName('');
    setPin('');
    setPhone('');
    setNfcCardId('');
    setNfcScanStatus('');
    setRole('cashier');
    setIsActive(true);
    const preset = ROLE_PRESETS.find(r => r.id === 'cashier');
    setPermissions({ ...(preset?.permissions || {}) });
    setBonusRule({ ...DEFAULT_BONUS_RULE });   // موظف جديد يبدأ بلا بونص
    setModalOpen(true);
  };

  // فتح نافذة تعديل مستخدم موجود
  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setName(user.name || '');
    // الرمز مجزَّأ ولا يُسترجَع. يُترك فارغاً: الفراغ يعني "أبقِ الرمز الحالي".
    setPin('');
    setPhone(user.phone || '');
    // رقم البطاقة مجزَّأ ولا يُسترجَع. الفراغ يعني "أبقِ البطاقة الحالية".
    setNfcCardId('');
    setNfcScanStatus('');
    setRole(user.role || 'cashier');
    setIsActive(user.isActive !== false);
    setPermissions(user.permissions ? { ...user.permissions } : (user.role === 'admin' ? { ...FULL_ADMIN_PERMISSIONS } : { ...(ROLE_PRESETS.find(r => r.id === 'cashier')?.permissions || {}) }));
    setBonusRule({ ...DEFAULT_BONUS_RULE, ...(user.bonusRule || {}) });
    setModalOpen(true);
  };

  // تطبيق قالب دور محدد
  const handleApplyPreset = (presetId) => {
    setRole(presetId);
    const preset = ROLE_PRESETS.find(r => r.id === presetId);
    if (preset) {
      setPermissions({ ...preset.permissions });
    }
  };

  // تبديل حالة صلاحية مفردة
  const handleTogglePermission = (key) => {
    setPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // تحديد أو إلغاء تحديد كل صلاحيات قسم معين
  const handleToggleCategory = (cat) => {
    const allChecked = cat.permissions.every(p => permissions[p.key]);
    setPermissions(prev => {
      const next = { ...prev };
      cat.permissions.forEach(p => {
        next[p.key] = !allChecked;
      });
      return next;
    });
  };

  // تبديل توسيع القسم
  const toggleCategoryExpand = (catId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  // حفظ المستخدم
  const handleSaveUser = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('يرجى كتابة اسم المستخدم');
      return;
    }
    // =====================================================================
    //  الرمز عند التعديل: الفراغ يعني الإبقاء على الرمز الحالي
    // =====================================================================
    //  الرمز يُخزَّن مجزَّأً ولا يُسترجَع، فحقل الإدخال يُفتح فارغاً عند
    //  التعديل. إلزام إدخال رمز هنا كان يعني أن تغيير اسم موظف أو صلاحية
    //  يتطلب إعادة تعيين رمزه في كل مرة.
    // =====================================================================
    const pinProvided = Boolean(pin.trim());
    const isEditing = Boolean(editingUser);

    if (!isEditing && !pinProvided) {
      alert('يرجى إدخال رمز PIN للمستخدم الجديد');
      return;
    }

    if (pinProvided) {
      // بقرار المالك: لا يُمنع الرمز السهل ولا يظهر تنبيه قوة — أي رمز مقبول.
      // يبقى فحص الصيغة فقط: أربعة أرقام، لأن لوحة الإدخال تتحقق تلقائياً عند
      // الرقم الرابع، فرمز بطول مختلف لا يمكن إدخاله من الشاشة أصلاً.
      if (!/^\d{4}$/.test(pin.trim())) {
        alert('⛔ الرمز يجب أن يتكوّن من ٤ أرقام.');
        return;
      }

      // التحقق من تكرار الرمز لمستخدم آخر.
      // لا نذكر الرمز ولا اسم صاحبه في الرسالة: إظهارهما يكشف رمز زميل
      // لمن يقف أمام الشاشة.
      const existingPin = users.find(u => verifyPin(pin.trim(), u) && u.id !== editingUser?.id);
      if (existingPin) {
        alert('هذا الرمز مستخدم مسبقاً لمستخدم آخر، يرجى اختيار رمز مختلف.');
        return;
      }
    }

    const preset = ROLE_PRESETS.find(r => r.id === role);
    const roleName = preset?.name || (role === 'admin' ? '👑 مدير النظام' : '🌸 كاشير مبيعات');

    const userData = {
      name: name.trim(),
      // لا يُمرَّر الرمز صريحاً إطلاقاً — التجزئة وحدها تُحفظ.
      // وعند التعديل بلا رمز جديد لا نرسل pinHash فيبقى الرمز الحالي كما هو.
      ...(pinProvided ? { pinHash: hashPin(pin.trim()) } : {}),
      phone: phone.trim(),
      ...(nfcCardId.trim() ? { nfcCardId: nfcCardId.trim() } : {}),
      role,
      roleName,
      isActive,
      permissions,
      bonusRule
    };

    if (editingUser) {
      updateUser({ ...editingUser, ...userData });
    } else {
      addUser(userData);
    }

    setModalOpen(false);
  };

  // حذف المستخدم
  const handleDeleteUser = async (user) => {
    if (user.id === currentUser?.id) {
      alert('لا يمكنك حذف الحساب النشط حالياً!');
      return;
    }
    const ok = await confirmDialog({
      title: 'حذف مستخدم',
      message: `هل أنت متأكد من حذف المستخدم (${user.name}) نهائياً؟`,
      confirmText: 'حذف',
      tone: 'danger'
    });
    if (ok) {
      deleteUser(user.id);
    }
  };

  // تبديل إظهار الـ PIN في القائمة
  const toggleShowPin = (userId) => {
    setShowPinInList(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200 font-cairo">
      
      {/* بطاقة رأس قسم المستخدمين */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-pink-900 text-white p-5 rounded-3xl shadow-lg border border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-2xl border border-white/20 shadow-inner">
            👥
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black">إدارة المستخدمين وصلاحيات النظام الدقيقة 🌸</h3>
              <span className="bg-pink-500/30 text-pink-200 border border-pink-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {users.length} مستخدمين
              </span>
            </div>
            <p className="text-xs text-purple-200/80 mt-0.5">
              تخصيص الكاشيرات والمدراء، رمز الدخول السريع (PIN)، والتحكم بأدق تفاصيل الصلاحيات لكل موظف.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-gradient-to-r from-pink-500 via-rose-500 to-purple-600 hover:from-pink-400 text-white rounded-2xl text-xs font-black shadow-lg shadow-pink-500/30 transition active:scale-95 flex items-center gap-2 shrink-0 border border-pink-300/30"
        >
          <Plus className="w-4 h-4" />
          <span>➕ إضافة مستخدم جديد</span>
        </button>
      </div>

      {/* شريط التبديل الفرعي بين المستخدمين وسجل الدخول والأجهزة */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 bg-slate-100/90 rounded-2xl border border-pink-100/80 shadow-inner">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSubTab('users')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition active:scale-95 ${
              subTab === 'users'
                ? 'bg-gradient-to-r from-rose-600 via-pink-600 to-purple-700 text-white shadow-md shadow-pink-600/20'
                : 'text-slate-600 hover:text-slate-900 bg-white/70 border border-slate-200/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>المستخدمين والصلاحيات ({users.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('logs')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition active:scale-95 ${
              subTab === 'logs'
                ? 'bg-gradient-to-r from-rose-600 via-pink-600 to-purple-700 text-white shadow-md shadow-pink-600/20'
                : 'text-slate-600 hover:text-slate-900 bg-white/70 border border-slate-200/60'
            }`}
          >
            <History className="w-4 h-4" />
            <span>سجل الدخول والأجهزة ({loginLogs.length})</span>
          </button>
        </div>

        {subTab === 'logs' && loginLogs.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'تفريغ سجل الدخول',
                message: 'هل أنت متأكد من رغبتك في تفريغ سجل الدخول بالكامل؟\n\nملاحظة: المسح محلي على هذا الجهاز فقط — نسخة السحابة محفوظة بقاعدة لا تُحذف.',
                confirmText: 'تفريغ السجل',
                tone: 'danger'
              });
              if (ok) {
                clearLoginLogs();
              }
            }}
            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200 flex items-center gap-1.5 transition active:scale-95"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>تفريغ السجل</span>
          </button>
        )}
      </div>

      {subTab === 'users' ? (
        <>

      {/* المستخدم الحالي المسجل */}
      <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl border border-pink-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-600 to-purple-600 text-white flex items-center justify-center font-black text-sm shadow-md">
            🌸
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-800">أنت مسجل حالياً باسم:</span>
              <span className="text-xs font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-md border border-pink-200">
                {currentUser?.name || 'مستخدم غير معروف'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              الدور: {currentUser?.roleName || (currentUser?.role === 'admin' ? '👑 مدير النظام العام' : '🌸 كاشير')}
            </span>
          </div>
        </div>

        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>جلسة نشطة</span>
        </span>
      </div>

      {/* بطاقة إعداد مؤقت الخروج وقفل الشاشة عند عدم الحركة */}
      <div className="bg-gradient-to-r from-purple-50/90 via-pink-50/70 to-rose-50/90 p-4 rounded-3xl border border-pink-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 text-white flex items-center justify-center font-black shadow-md shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black text-slate-800">مؤقت الخروج وقفل الشاشة عند عدم الحركة</h4>
              <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-md border border-purple-200">
                أمان تلقائي 🔒
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium mt-0.5">
              يقفل النظام تلقائياً عند غياب الحركة • <strong>الوردية تبقى محفوظة على حالها (مفتوحة أو مغلقة)</strong> وتستأنف فور كتابة الرمز السري
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <label className="text-xs font-bold text-slate-700 whitespace-nowrap">المهلة:</label>
          <select
            value={storeInfo?.inactivityTimeoutMinutes ?? 15}
            onChange={(e) => {
              const val = Number(e.target.value);
              updateStoreInfo({
                ...storeInfo,
                inactivityTimeoutMinutes: val
              });
            }}
            className="px-3 py-1.5 bg-white border border-pink-300 rounded-xl text-xs font-bold text-slate-800 shadow-xs focus:ring-2 focus:ring-pink-500 focus:outline-hidden cursor-pointer"
          >
            <option value="1">دقيقة واحدة (تجربة سريعة ⚡)</option>
            <option value="2">دقيقتان (2 دقيقة)</option>
            <option value="5">5 دقائق</option>
            <option value="10">10 دقائق</option>
            <option value="15">15 دقيقة (افتراضي وموصى به)</option>
            <option value="30">30 دقيقة</option>
            <option value="60">ساعة واحدة (60 دقيقة)</option>
            <option value="0">معطل (بدون خروج تلقائي)</option>
          </select>
        </div>
      </div>

      {/* قائمة بطاقات المستخدمين */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {users.map(user => {
          const isCurrent = currentUser?.id === user.id;
          const isAdmin = user.role === 'admin';
          const isShown = showPinInList[user.id];
          const activePermsCount = user.permissions ? Object.values(user.permissions).filter(Boolean).length : (isAdmin ? ALL_PERMISSION_KEYS.length : 0);

          return (
            <div
              key={user.id}
              className={`p-4 rounded-3xl border transition-all duration-200 flex flex-col justify-between gap-3 relative bg-white shadow-sm ${
                isCurrent 
                  ? 'border-pink-300 ring-2 ring-pink-400/20 shadow-md shadow-pink-100' 
                  : 'border-slate-200/80 hover:border-pink-200'
              }`}
            >
              {/* الرأس: الاسم والدور والحالة */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg text-white shadow-md ${
                    isAdmin ? 'bg-gradient-to-tr from-purple-600 to-indigo-700' : 'bg-gradient-to-tr from-pink-600 to-rose-600'
                  }`}>
                    {isAdmin ? '👑' : '🌸'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-slate-800">{user.name}</h4>
                      {isCurrent && (
                        <span className="bg-pink-100 text-pink-700 text-[10px] font-black px-2 py-0.5 rounded-md border border-pink-200">
                          (حسابك الحالي)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                        isAdmin 
                          ? 'bg-purple-100 text-purple-800 border border-purple-200' 
                          : 'bg-pink-100 text-pink-800 border border-pink-200'
                      }`}>
                        {user.roleName || (isAdmin ? '👑 مدير النظام' : '🌸 كاشير')}
                      </span>
                      {user.isActive !== false ? (
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                          ● نشط
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-0.5">
                          ○ معطل
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* أزرار الإجراءات السريعة */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(user)}
                    title="تعديل المستخدم والصلاحيات"
                    className="p-2 text-slate-600 hover:text-pink-600 hover:bg-pink-50 rounded-xl transition border border-slate-100 hover:border-pink-200"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteUser(user)}
                    title="حذف المستخدم"
                    disabled={users.length <= 1 || isCurrent}
                    className={`p-2 rounded-xl transition border ${
                      users.length <= 1 || isCurrent
                        ? 'text-slate-300 border-slate-100 cursor-not-allowed'
                        : 'text-rose-500 hover:text-rose-700 hover:bg-rose-50 border-rose-100 hover:border-rose-200'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* تفاصيل الـ PIN والصلاحيات وبطاقة NFC */}
              <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-slate-100">
                  <span className="text-slate-500 font-bold text-[11px] flex items-center gap-1">
                    <Key className="w-3 h-3 text-pink-600" />
                    <span>رمز PIN:</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono font-black text-slate-800 text-[12px]">
                      {/* الرمز يُخزَّن مجزَّأً فقط ولا يمكن استرجاعه —
                          كان هذا السطر يعرض undefined بعد إلغاء التخزين الصريح.
                          نعرض حالة التعيين بدل قيمة لا وجود لها. */}
                      {user.pinHash ? 'معيَّن ●●●●' : 'غير معيَّن'}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleShowPin(user.id)}
                      className="text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      {isShown ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-slate-100">
                  <span className="text-slate-500 font-bold text-[11px] flex items-center gap-1">
                    <CreditCard className="w-3 h-3 text-indigo-600" />
                    <span>بطاقة NFC:</span>
                  </span>
                  {/* رقم البطاقة يُخزَّن مجزَّأً ولا يُسترجَع — نعرض حالة الربط فقط */}
                  <span className="font-mono font-bold text-indigo-800 text-[10px] truncate max-w-[75px]" title={hasNfcCard(user) ? 'بطاقة مربوطة' : 'غير مربوطة'}>
                    {hasNfcCard(user) ? '💳 مربوطة' : 'غير معينة'}
                  </span>
                </div>

                <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-slate-100 col-span-2 sm:col-span-1">
                  <span className="text-slate-500 font-bold text-[11px] flex items-center gap-1">
                    <Shield className="w-3 h-3 text-purple-600" />
                    <span>الصلاحيات:</span>
                  </span>
                  <span className="font-bold text-purple-700 text-[11px]">
                    {isAdmin ? 'كاملة (الكل)' : `${activePermsCount} من ${ALL_PERMISSION_KEYS.length}`}
                  </span>
                </div>
              </div>

              {/* زر التبديل السريع للمستخدم */}
              {!isCurrent && (
                <button
                  type="button"
                  onClick={() => {
                    switchUser(user.id);
                    alert(`تم التبديل بنجاح إلى المستخدم: ${user.name} 🌸`);
                  }}
                  className="w-full py-2 bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 text-purple-800 rounded-xl text-xs font-bold border border-purple-200/80 transition flex items-center justify-center gap-1.5 active:scale-98"
                >
                  <UserCheck className="w-3.5 h-3.5 text-purple-600" />
                  <span>تبديل الدخول إلى هذا الموظف 🌸</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
      </>
      ) : (
        /* ========================================================================= */
        /* تبويب سجل حركات تسجيل الدخول وتفاصيل الأجهزة الحية */
        /* ========================================================================= */
        <div className="space-y-4 animate-in fade-in">
          
          {/* إحصائيات سريعة لسجل الدخول */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white p-3.5 rounded-2xl border-2 border-slate-200/80 shadow-xs">
              <span className="text-[11px] text-slate-500 font-bold block">إجمالي جلسات الدخول</span>
              <span className="text-base sm:text-lg font-black text-slate-900 font-mono">{loginLogs.length}</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border-2 border-slate-200/80 shadow-xs">
              <span className="text-[11px] text-slate-500 font-bold block">💻 أجهزة الكمبيوتر</span>
              <span className="text-base sm:text-lg font-black text-blue-600 font-mono">
                {loginLogs.filter(l => l.device?.deviceType?.includes('كمبيوتر')).length}
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border-2 border-slate-200/80 shadow-xs">
              <span className="text-[11px] text-slate-500 font-bold block">📱 الهواتف والأجهزة الذكية</span>
              <span className="text-base sm:text-lg font-black text-purple-600 font-mono">
                {loginLogs.filter(l => l.device?.deviceType?.includes('هاتف') || l.device?.deviceType?.includes('لوحي')).length}
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border-2 border-slate-200/80 shadow-xs">
              <span className="text-[11px] text-slate-500 font-bold block">🪪 بطاقات NFC السريعة</span>
              <span className="text-base sm:text-lg font-black text-emerald-600 font-mono">
                {loginLogs.filter(l => l.loginMethod === 'nfc').length}
              </span>
            </div>
          </div>

          {/* شريط البحث والتصفية المتقدمة لسجل الدخول */}
          <div className="bg-white p-3 rounded-2xl border-2 border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              {/* حقل البحث بالاسم أو الجهاز */}
              <div className="relative min-w-[180px] flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  placeholder="بحث بالمستخدم أو الجهاز أو المتصفح..."
                  className="w-full pr-8 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-pink-500 focus:bg-white"
                />
              </div>

              {/* فلتر المستخدمين */}
              <select
                value={logFilterUser}
                onChange={(e) => setLogFilterUser(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-pink-500"
              >
                <option value="all">👥 جميع المستخدمين</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>

              {/* فلتر نوع الجهاز */}
              <select
                value={logFilterDevice}
                onChange={(e) => setLogFilterDevice(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-pink-500"
              >
                <option value="all">💻📱 كل أنواع الأجهزة</option>
                <option value="pc">💻 كمبيوتر مكتبي ولابتوب</option>
                <option value="mobile">📱 هواتف ذكية وتابلت</option>
              </select>
            </div>

            <span className="text-xs font-bold text-slate-500">
              عرض {
                loginLogs.filter(l => {
                  if (logFilterUser !== 'all' && l.userId !== logFilterUser) return false;
                  if (logFilterDevice === 'pc' && !l.device?.deviceType?.includes('كمبيوتر')) return false;
                  if (logFilterDevice === 'mobile' && !l.device?.deviceType?.includes('هاتف') && !l.device?.deviceType?.includes('لوحي')) return false;
                  if (logSearchQuery.trim()) {
                    const q = logSearchQuery.toLowerCase();
                    const u = (l.userName || '').toLowerCase();
                    const d = (l.device?.deviceType || '').toLowerCase();
                    const os = (l.device?.os || '').toLowerCase();
                    const b = (l.device?.browser || '').toLowerCase();
                    return u.includes(q) || d.includes(q) || os.includes(q) || b.includes(q);
                  }
                  return true;
                }).length
              } حركة
            </span>
          </div>

          {/* جدول سجل الدخول والأجهزة المفصل مع فواصل واضحة */}
          {loginLogs.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-200 space-y-2">
              <History className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
              <p className="text-xs font-bold text-slate-700">لا توجد حركات تسجيل دخول مسجلة بعد</p>
              <p className="text-[11px] text-slate-400">سيتم تسجيل كل حركة دخول تبدأ من هذه اللحظة تلقائياً وتوثيق مواصفات الجهاز</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border-2 border-slate-200/90 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-slate-300 text-[11px] font-black text-slate-700 select-none">
                      <th className="py-3 px-3">المستخدم</th>
                      <th className="py-3 px-3">صفة الدخول (الرتبة)</th>
                      <th className="py-3 px-3">طريقة الدخول</th>
                      <th className="py-3 px-3">نوع الجهاز والنظام</th>
                      <th className="py-3 px-3">المتصفح والأبعاد</th>
                      <th className="py-3 px-3 text-left">التاريخ والوقت</th>
                      <th className="py-3 px-3 text-center">حالة الأمان</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {loginLogs
                      .filter(log => {
                        if (logFilterUser !== 'all' && log.userId !== logFilterUser) return false;
                        if (logFilterDevice === 'pc' && !log.device?.deviceType?.includes('كمبيوتر')) return false;
                        if (logFilterDevice === 'mobile' && !log.device?.deviceType?.includes('هاتف') && !log.device?.deviceType?.includes('لوحي')) return false;
                        if (logSearchQuery.trim()) {
                          const q = logSearchQuery.toLowerCase();
                          const u = (log.userName || '').toLowerCase();
                          const d = (log.device?.deviceType || '').toLowerCase();
                          const os = (log.device?.os || '').toLowerCase();
                          const b = (log.device?.browser || '').toLowerCase();
                          return u.includes(q) || d.includes(q) || os.includes(q) || b.includes(q);
                        }
                        return true;
                      })
                      .map((log, index) => {
                        const isPc = log.device?.deviceType?.includes('كمبيوتر');
                        const isMobile = log.device?.deviceType?.includes('هاتف') || log.device?.deviceType?.includes('لوحي');
                        const isAdmin = log.userRole === 'admin';

                        return (
                          <tr
                            key={log.id || index}
                            className={`transition-colors duration-150 ${
                              index % 2 === 0 ? 'bg-white hover:bg-blue-50/50' : 'bg-slate-50/70 hover:bg-blue-50/60'
                            }`}
                          >
                            {/* المستخدم */}
                            <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black text-white ${
                                  isAdmin ? 'bg-purple-600' : 'bg-pink-600'
                                }`}>
                                  {isAdmin ? '👑' : '🌸'}
                                </span>
                                <div>
                                  <span className="block font-black text-slate-800">{log.userName}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">ID: {log.userId}</span>
                                </div>
                              </div>
                            </td>

                            {/* صفة الدخول */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className={`px-2.5 py-1 rounded-lg text-[10.5px] font-black border ${
                                isAdmin
                                  ? 'bg-purple-50 text-purple-800 border-purple-200'
                                  : 'bg-pink-50 text-pink-800 border-pink-200'
                              }`}>
                                {log.roleLabel || (isAdmin ? 'المدير العام 👑' : 'كاشير مبيعات 👤')}
                              </span>
                            </td>

                            {/* طريقة الدخول */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-lg text-[10.5px] font-bold border border-slate-200 inline-flex items-center gap-1">
                                {log.methodLabel || (
                                  log.loginMethod === 'nfc' ? 'بطاقة NFC ذكية 🪪' :
                                  log.loginMethod === 'switch' ? 'تبديل مستخدم 🔄' : 'رمز PIN السري 🔑'
                                )}
                              </span>
                            </td>

                            {/* الجهاز ونظام التشغيل */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-slate-100 rounded-lg text-slate-700">
                                  {isPc ? <Laptop className="w-4 h-4 text-blue-600" /> : <Smartphone className="w-4 h-4 text-purple-600" />}
                                </div>
                                <div>
                                  <span className="font-bold text-slate-800 block text-xs">{log.device?.deviceType || 'جهاز غير معروف'}</span>
                                  <span className="text-[10.5px] text-slate-500 font-medium">{log.device?.os || 'نظام غير محدد'}</span>
                                </div>
                              </div>
                            </td>

                            {/* المتصفح والأبعاد */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="text-xs">
                                <span className="font-bold text-slate-700 block">{log.device?.browser || 'Chrome'}</span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {log.device?.screenResolution} {log.device?.isTouchDevice ? '• شاشة لمس 👆' : '• ماوس 🖱️'}
                                </span>
                              </div>
                            </td>

                            {/* التاريخ والوقت بالثانية */}
                            <td className="py-3 px-3 text-left whitespace-nowrap">
                              <div className="text-xs text-slate-700 font-mono">
                                <span className="font-bold block">
                                  {new Date(log.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(log.timestamp).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                            </td>

                            {/* حالة الأمان */}
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full inline-flex items-center gap-1 border border-emerald-200">
                                <CheckCircle className="w-3 h-3" />
                                <span>جلسة معتمدة</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* النافذة المنبثقة: إضافة / تعديل المستخدم وتخصيص الصلاحيات */}
      {/* ========================================================================= */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-2xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-pink-200 animate-in zoom-in-95 duration-150">
            
            {/* رأس النافذة */}
            <div className="p-4 bg-gradient-to-r from-purple-900 via-indigo-900 to-pink-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-lg">
                  {editingUser ? '✏️' : '➕'}
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base">
                    {editingUser ? `تعديل بيانات وصلاحيات: ${editingUser.name}` : 'إضافة مستخدم جديد للنظام 🌸'}
                  </h3>
                  <p className="text-[11px] text-purple-200">حدد بيانات الدخول والدور وقائمة الصلاحيات المسموحة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* جسم النافذة القابل للتمرير */}
            <form onSubmit={handleSaveUser} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
              
              {/* البيانات الأساسية */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-b border-pink-100 pb-1.5">
                  <span className="text-pink-600">①</span>
                  <span>البيانات الشخصية ورمز الدخول:</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">اسم الموظف / الكاشير *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: أحمد عبد الله"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:border-pink-500 focus:ring-2 focus:ring-pink-200 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      رمز الدخول السريع (PIN) * <span className="text-[10px] text-slate-400">(4 أرقام)</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      pattern="[0-9]*"
                      placeholder="مثال: 1234"
                      value={pin}
                      onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono font-black focus:border-pink-500 focus:ring-2 focus:ring-pink-200 outline-none tracking-widest text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">رقم الجوال (اختياري)</label>
                    <input
                      type="tel"
                      placeholder="05XXXXXXXX"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:border-pink-500 focus:ring-2 focus:ring-pink-200 outline-none text-left"
                      dir="ltr"
                    />
                  </div>

                  <div className="sm:col-span-2 p-3 bg-purple-50/60 rounded-2xl border border-purple-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-purple-950 flex items-center gap-1.5">
                        <span>💳 بطاقة NFC الذكية / RFID Tag ID:</span>
                        <span className="text-[10px] text-purple-600 font-normal">(للدخول السريع بلمس البطاقة)</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleScanNfc}
                        disabled={isScanningNfc}
                        className={`px-3 py-1 text-white rounded-xl font-bold text-[10px] flex items-center gap-1 shadow-xs transition active:scale-95 ${
                          isScanningNfc ? 'bg-purple-400 animate-pulse' : 'bg-purple-700 hover:bg-purple-800'
                        }`}
                      >
                        <span>{isScanningNfc ? '📡 جاري الاستشعار...' : '📲 قراءة بطاقة NFC'}</span>
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="مرر البطاقة فوق القارئ أو اكتب الكود مثل: 04:A2:3B:C9"
                        value={nfcCardId}
                        onChange={e => setNfcCardId(e.target.value)}
                        className="flex-1 px-3.5 py-2 rounded-xl border border-purple-200 text-xs font-mono font-bold bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none text-left"
                        dir="ltr"
                      />
                      {nfcCardId && (
                        <button
                          type="button"
                          onClick={() => setNfcCardId('')}
                          className="px-2.5 py-2 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-xl text-[10px] font-bold transition"
                        >
                          مسح
                        </button>
                      )}
                    </div>

                    {nfcScanStatus && (
                      <p className="text-[10px] text-purple-800 font-bold bg-purple-100/70 p-1.5 rounded-lg">
                        {nfcScanStatus}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* اختيار الدور الوظيفي بنقرة واحدة */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-pink-100 pb-1.5">
                  <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <span className="text-pink-600">②</span>
                    <span>اختيار الدور الوظيفي (قوالب صلاحيات جاهزة):</span>
                  </h4>
                  <span className="text-[10px] text-pink-600 font-bold">نقرة واحدة لتطبيق الصلاحيات</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ROLE_PRESETS.map(preset => {
                    const isSelected = role === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyPreset(preset.id)}
                        className={`p-3 rounded-2xl border text-right transition flex flex-col justify-between gap-1.5 active:scale-95 ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50/80 ring-2 ring-purple-400/30 shadow-sm'
                            : 'border-slate-200 hover:border-pink-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-800">{preset.badge}</span>
                          {isSelected && <BadgeCheck className="w-4 h-4 text-purple-600" />}
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium leading-tight">
                          {preset.id === 'admin' ? 'كامل صلاحيات النظام' : preset.id === 'cashier' ? 'كاشير ومبيعات' : preset.id === 'accountant' ? 'فواتير ومصروفات وتقارير' : 'مخزون ومشتريات'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* بونص الموظف — قاعدة الحافز المتغيّر */}
              <BonusRuleEditor
                rule={bonusRule}
                onChange={setBonusRule}
                currency={storeInfo?.currency || 'ر.س'}
              />

              {/* الصلاحيات الدقيقة والمفصلة */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-pink-100 pb-1.5">
                  <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <span className="text-pink-600">③</span>
                    <span>تفاصيل الصلاحيات الفردية والمتقدمة:</span>
                  </h4>
                  <div className="flex items-center gap-2 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setPermissions({ ...FULL_ADMIN_PERMISSIONS })}
                      className="text-purple-700 hover:underline"
                    >
                      تحديد الكل ✅
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setPermissions({})}
                      className="text-slate-500 hover:underline"
                    >
                      إلغاء الكل ❌
                    </button>
                  </div>
                </div>

                {/* أقسام الصلاحيات الـ 7 */}
                <div className="space-y-2.5">
                  {PERMISSION_CATEGORIES.map(cat => {
                    const isExpanded = expandedCategories[cat.id];
                    const activeCount = cat.permissions.filter(p => permissions[p.key]).length;
                    const isAllChecked = activeCount === cat.permissions.length;

                    return (
                      <div
                        key={cat.id}
                        className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-sm"
                      >
                        {/* رأس القسم */}
                        <div className="p-3 bg-slate-50/90 flex items-center justify-between gap-2 border-b border-slate-100">
                          <div
                            onClick={() => toggleCategoryExpand(cat.id)}
                            className="flex items-center gap-2 cursor-pointer flex-1 select-none"
                          >
                            <div className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${cat.color} text-white flex items-center justify-center text-xs font-bold`}>
                              🌸
                            </div>
                            <div>
                              <span className="text-xs font-black text-slate-800">{cat.name}</span>
                              <span className="text-[10px] text-slate-500 mr-2">
                                ({activeCount} من {cat.permissions.length})
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleCategory(cat)}
                              className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition flex items-center gap-1 ${
                                isAllChecked 
                                  ? 'bg-purple-100 text-purple-800 border-purple-200' 
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-pink-50'
                              }`}
                            >
                              {isAllChecked ? <CheckSquare className="w-3 h-3 text-purple-700" /> : <Square className="w-3 h-3" />}
                              <span>{isAllChecked ? 'مفعل بالكامل' : 'تحديد القسم'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleCategoryExpand(cat.id)}
                              className="text-slate-400 hover:text-slate-600 p-1"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* قائمة الصلاحيات الفردية داخل القسم */}
                        {isExpanded && (
                          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white">
                            {cat.permissions.map(perm => {
                              const checked = !!permissions[perm.key];
                              return (
                                <label
                                  key={perm.key}
                                  className={`p-2.5 rounded-xl border transition cursor-pointer flex items-start gap-2.5 select-none ${
                                    checked 
                                      ? 'bg-pink-50/60 border-pink-300' 
                                      : 'bg-slate-50/50 border-slate-200/80 hover:bg-slate-100/50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => handleTogglePermission(perm.key)}
                                    className="mt-0.5 rounded text-pink-600 focus:ring-pink-500 w-4 h-4"
                                  />
                                  <div className="flex-1">
                                    <span className={`text-xs font-bold block leading-snug ${checked ? 'text-pink-950' : 'text-slate-700'}`}>
                                      {perm.label}
                                    </span>
                                    <span className="text-[10px] text-slate-400 block leading-tight mt-0.5">
                                      {perm.desc}
                                    </span>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* أزرار الحفظ والإلغاء */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 rounded-2xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 text-white rounded-2xl text-xs font-black shadow-lg shadow-pink-600/30 transition active:scale-95 flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{editingUser ? '💾 حفظ التعديلات' : '➕ إضافة المستخدم فوراً'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
