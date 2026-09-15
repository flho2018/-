import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { DollarSign, Plus, ArrowDownRight, ArrowUpRight, Calendar, Trash2, X, Search, CheckCircle, User } from 'lucide-react';
import { formatMoney, formatDate } from '../../utils/helpers';

export const ExpensesScreen = () => {
  const { expenses, addExpense, deleteExpense, storeInfo, hasPermission, currentUser, userShifts, activeShift } = useApp();

  // درج مَن بالضبط؟ نعرض اسم صاحب الشاشة وحالة ورديته، لأن "الوردية النشطة"
  // غامضة حين تكون هناك أكثر من وردية مفتوحة في المتجر.
  const isOpenShift = (sh) => Boolean(
    sh && sh.isOpen === true && !sh.closedAt && sh.status !== 'closed'
  );
  const myDrawerShift =
    (userShifts && currentUser?.id && userShifts[currentUser.id]) ||
    (activeShift?.userId === currentUser?.id ? activeShift : null);
  const myDrawerOpen = isOpenShift(myDrawerShift);

  // من عنده وردية مفتوحة الآن غيري؟ نعرض الأسماء صراحةً بدل ترك المستخدم
  // يخمّن لماذا يُمنع من الصرف بينما زميله لا يُمنع.
  const otherOpenShiftNames = Object.values(userShifts || {})
    .filter(sh => isOpenShift(sh) && sh.userId !== currentUser?.id)
    .map(sh => sh.cashierName || 'كاشير');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'drawer' | 'bank' | 'manager_vault'
  
  const [formData, setFormData] = useState({
    category: 'نثريات ومشتريات يومية',
    amount: '',
    paymentMethod: 'cash',
    paymentSource: 'drawer', // 'drawer' | 'manager_vault' | 'bank'
    notes: '',
    isIncome: false
  });

  const categories = [
    'إيجار المحل',
    'كهرباء ومياه وانترنت',
    'رواتب وعمالة',
    'نثريات ومشتريات يومية',
    'صيانة وتجهيزات',
    'دعاية وتسويق',
    'تغليف وكراتين وزهور',
    'ضيافة ونظافة',
    'إيراد آخر / متنوع'
  ];

  const totalExpenses = expenses.filter(e => !e.isIncome).reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalOtherIncomes = expenses.filter(e => e.isIncome).reduce((sum, e) => sum + (e.amount || 0), 0);
  const drawerExpenses = expenses.filter(e => !e.isIncome && (e.paymentSource === 'drawer' || (!e.paymentSource && e.paymentMethod === 'cash'))).reduce((sum, e) => sum + (e.amount || 0), 0);
  const bankExpenses = expenses.filter(e => !e.isIncome && (e.paymentSource === 'bank' || e.paymentMethod === 'bank' || e.paymentMethod === 'transfer' || e.paymentMethod === 'card')).reduce((sum, e) => sum + (e.amount || 0), 0);
  const vaultExpenses = expenses.filter(e => !e.isIncome && e.paymentSource === 'manager_vault').reduce((sum, e) => sum + (e.amount || 0), 0);

  const filteredExpenses = expenses.filter(e => {
    if (sourceFilter === 'drawer') {
      if (e.paymentSource !== 'drawer' && (e.paymentSource || e.paymentMethod !== 'cash')) return false;
    } else if (sourceFilter === 'bank') {
      if (e.paymentSource !== 'bank' && e.paymentMethod !== 'bank' && e.paymentMethod !== 'transfer' && e.paymentMethod !== 'card') return false;
    } else if (sourceFilter === 'manager_vault') {
      if (e.paymentSource !== 'manager_vault') return false;
    }

    return (e.category || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.notes || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.user || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleOpenAdd = () => {
    if (!hasPermission('expenses_add')) {
      alert('⛔ ليس لديك صلاحية لتسجيل المصروفات والنثريات!');
      return;
    }
    setFormData({
      category: 'نثريات ومشتريات يومية',
      amount: '',
      paymentMethod: 'cash',
      paymentSource: 'drawer',
      notes: '',
      isIncome: false
    });
    setIsAddOpen(true);
  };

  const handleDeleteExpenseClick = (expId, category, amount) => {
    if (!hasPermission('expenses_delete')) {
      alert('⛔ ليس لديك صلاحية لحذف سندات المصروفات!');
      return;
    }
    if (confirm(`هل أنت متأكد من حذف سند المصروف (${category} - ${formatMoney(amount, storeInfo.currency)})؟`)) {
      deleteExpense(expId);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    const amt = Number(formData.amount) || 0;
    if (amt <= 0) {
      alert('يرجى إدخال مبلغ صحيح');
      return;
    }

    if (formData.isIncome && !String(formData.notes || '').trim()) {
      alert('⚠️ اكتب مصدر الإيراد: من أين جاء هذا المبلغ؟\nمثال: استرداد من مورد / بيع كراتين فارغة / إيداع من المالك.');
      return;
    }

    if (formData.isIncome && formData.paymentSource === 'drawer') {
      alert('⛔ لا يمكن زيادة درج الكاشير من هنا.\nزيادة الدرج تتم من: الخزينة ← بطاقة عهدة الكاشير ← "تغذية درج"، لأنها تحتاج مصدراً ومقابلاً محاسبياً (خزينة المدير أو البنك).');
      return;
    }

    addExpense({
      ...formData,
      amount: amt
    });

    setIsAddOpen(false);
  };

  return (
    <div className="p-3 sm:p-5 lg:p-8 max-w-4xl lg:max-w-7xl mx-auto space-y-5 pb-28 font-cairo select-none animate-in fade-in">
      
      {/* رأس الصفحة */}
      <div className="bg-white/95 backdrop-blur-md p-4 rounded-3xl border border-pink-100 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-600 to-pink-600 text-white flex items-center justify-center text-2xl shadow-md">
            💸
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900">سجل المصروفات والنثريات والعهد</h2>
            <p className="text-xs text-slate-500">توثيق مصاريف المتجر، الإيجار، الرواتب، وتكاليف التشغيل</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 text-white rounded-2xl text-xs font-black shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>➕ تسجيل سند مصروفات</span>
        </button>
      </div>

      {/* بطاقات ملخص المصروفات موزعة بدقة حسب مصدر الصرف والمسؤولية المالية */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. إجمالي المصروفات */}
        <div className="bg-gradient-to-br from-rose-900 via-pink-900 to-purple-950 rounded-2xl p-4 text-white shadow-lg border-2 border-rose-400/50 flex flex-col justify-between space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-rose-200 font-black block">إجمالي المصروفات</span>
            <span className="px-2 py-0.5 rounded-md bg-rose-500/30 text-rose-200 text-[10px] font-bold">كافة المصادر</span>
          </div>
          <h3 className="text-base sm:text-xl font-black mt-1 font-mono tracking-tight">{formatMoney(totalExpenses, storeInfo.currency)}</h3>
          <span className="text-[10px] text-rose-300/80 font-bold block mt-0.5">المصاريف التشغيلية الإجمالية</span>
        </div>

        {/* 2. مصروفات درج الكاشير */}
        <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100/70 rounded-2xl p-4 border-2 border-amber-300 shadow-sm flex flex-col justify-between space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-950 font-black block">💵 نقدية درج الوردية</span>
            <span className="px-2 py-0.5 rounded-md bg-amber-200/60 text-amber-900 text-[10px] font-bold">كاش الدرج</span>
          </div>
          <h3 className="text-base sm:text-xl font-black text-amber-900 mt-1 font-mono tracking-tight">{formatMoney(drawerExpenses, storeInfo.currency)}</h3>
          <span className="text-[10px] text-amber-800/80 font-bold block mt-0.5">خصمت مباشرة من درج الكاشير</span>
        </div>

        {/* 3. مصروفات الحساب البنكي */}
        <div className="bg-gradient-to-br from-blue-50 via-sky-50 to-blue-100/70 rounded-2xl p-4 border-2 border-blue-300 shadow-sm flex flex-col justify-between space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-blue-950 font-black block">💳 الحساب البنكي / شبكة</span>
            <span className="px-2 py-0.5 rounded-md bg-blue-200/60 text-blue-900 text-[10px] font-bold">سداد إلكتروني</span>
          </div>
          <h3 className="text-base sm:text-xl font-black text-blue-900 mt-1 font-mono tracking-tight">{formatMoney(bankExpenses, storeInfo.currency)}</h3>
          <span className="text-[10px] text-blue-800/80 font-bold block mt-0.5">سددت عبر البنك (لا تمس الكاش)</span>
        </div>

        {/* 4. مصروفات خزينة الإدارة */}
        <div className="bg-gradient-to-br from-purple-50 via-fuchsia-50 to-purple-100/70 rounded-2xl p-4 border-2 border-purple-300 shadow-sm flex flex-col justify-between space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-950 font-black block">💼 خزينة كاش الإدارة</span>
            <span className="px-2 py-0.5 rounded-md bg-purple-200/60 text-purple-900 text-[10px] font-bold">عهدة المدير</span>
          </div>
          <h3 className="text-base sm:text-xl font-black text-purple-900 mt-1 font-mono tracking-tight">{formatMoney(vaultExpenses, storeInfo.currency)}</h3>
          <span className="text-[10px] text-purple-800/80 font-bold block mt-0.5">من عهدة ونقدية الإدارة</span>
        </div>
      </div>

      {/* فلاتر تصنيف مصدر الصرف والبحث */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        {/* أزرار الفلترة حسب المصدر */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
          {[
            { id: 'all', label: 'الكل', count: expenses.length },
            { id: 'drawer', label: '💵 درج الوردية', count: expenses.filter(e => !e.isIncome && (e.paymentSource === 'drawer' || (!e.paymentSource && e.paymentMethod === 'cash'))).length },
            { id: 'bank', label: '💳 الحساب البنكي', count: expenses.filter(e => !e.isIncome && (e.paymentSource === 'bank' || e.paymentMethod === 'bank' || e.paymentMethod === 'transfer' || e.paymentMethod === 'card')).length },
            { id: 'manager_vault', label: '💼 خزينة الإدارة', count: expenses.filter(e => !e.isIncome && e.paymentSource === 'manager_vault').length }
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSourceFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition active:scale-95 text-xs flex items-center gap-1.5 ${
                sourceFilter === f.id
                  ? 'bg-rose-600 text-white shadow-sm font-black'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>{f.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${sourceFilter === f.id ? 'bg-white/20 text-white' : 'bg-white text-slate-600'}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* شريط البحث */}
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="بحث في المصروفات..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-9 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
      </div>

      {/* قائمة المصروفات المسجلة */}
      <div className="space-y-2.5">
        <div className="flex justify-between items-center px-1 text-xs">
          <span className="font-black text-slate-800">العمليات المسجلة ({filteredExpenses.length}):</span>
          <span className="text-[11px] text-slate-400">مرتبة من الأحدث للأقدم</span>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center text-slate-400 border border-slate-200 space-y-2">
            <DollarSign className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
            <h4 className="font-bold text-sm text-slate-700">لا توجد سندات مصروفات مسجلة</h4>
            <p className="text-xs text-slate-400">انقر على زر "تسجيل سند مصروفات" لإضافة مصروف أو إيراد جديد</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredExpenses.map(exp => (
              <div
                key={exp.id}
                className="bg-white/95 backdrop-blur-md rounded-3xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-lg shrink-0 ${
                    exp.isIncome ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {exp.isIncome ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
                  </div>

                  <div>
                    <h5 className="font-black text-xs sm:text-sm text-slate-900">{exp.category}</h5>
                    {exp.notes && <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">{exp.notes}</p>}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{formatDate(exp.date)}</span>
                      </span>
                      {exp.user && (
                        <span className="flex items-center gap-0.5 text-purple-700 font-bold bg-purple-50 px-1.5 py-0.2 rounded">
                          <User className="w-2.5 h-2.5" />
                          <span>{exp.user}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-left shrink-0 flex flex-col items-end gap-1">
                  <span className={`font-black text-xs sm:text-sm ${exp.isIncome ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {exp.isIncome ? '+' : '-'}{formatMoney(exp.amount, storeInfo.currency)}
                  </span>
                  
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg block ${
                    exp.paymentSource === 'manager_vault'
                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                      : exp.paymentSource === 'bank' || exp.paymentMethod === 'card'
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}>
                    {exp.paymentSource === 'manager_vault' && '💼 خزينة المدير'}
                    {exp.paymentSource === 'drawer' && '💵 درج الكاشير'}
                    {(exp.paymentSource === 'bank' || (!exp.paymentSource && exp.paymentMethod === 'card')) && '💳 بنك / شبكة'}
                    {!exp.paymentSource && exp.paymentMethod === 'cash' && '💵 درج الكاشير'}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleDeleteExpenseClick(exp.id, exp.category, exp.amount)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition mt-1"
                    title="حذف سند المصروف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* نافذة تسجيل مصروف / إيراد جديد */}
      {/* ========================================================================= */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-rose-200 animate-in zoom-in-95">
            <div className="p-4 bg-gradient-to-r from-rose-900 to-pink-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">💸</span>
                <h3 className="font-black text-sm">تسجيل سند مصروفات / إيراد جديد 🌸</h3>
              </div>
              <button type="button" onClick={() => setIsAddOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-3.5 text-xs">
              {/* نوع العملية */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isIncome: false })}
                  className={`py-2.5 rounded-2xl font-black border transition ${
                    !formData.isIncome ? 'bg-rose-50 border-rose-600 text-rose-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  📉 مصروف ونثريات (خصم)
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({
                    ...formData,
                    isIncome: true,
                    // الإيراد الإضافي لا يُزاد من الدرج: زيادة الدرج لها بابها
                    // الوحيد (تغذية درج الكاشير من الخزينة أو البنك بقيد مزدوج)
                    paymentSource: formData.paymentSource === 'drawer' ? 'manager_vault' : formData.paymentSource,
                    paymentMethod: formData.paymentSource === 'drawer' ? 'cash' : formData.paymentMethod
                  })}
                  className={`py-2.5 rounded-2xl font-black border transition ${
                    formData.isIncome ? 'bg-emerald-50 border-emerald-600 text-emerald-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  📈 إيراد إضافي (زيادة)
                </button>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">المبلغ *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-black text-slate-900 text-base text-center outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">التصنيف</label>
                <select
                  value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 font-bold outline-none"
                >
                  {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* من أين خرج المال؟ — المصدر أولاً، ثم الطريقة إن لزمت */}
              <div>
                <label className="block font-black text-slate-700 mb-1">
                  {formData.isIncome ? 'إلى أين دخل المال؟ *' : 'من أين خرج المال؟ *'}
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    disabled={formData.isIncome}
                    title={formData.isIncome ? 'زيادة الدرج تتم من: الخزينة ← تغذية درج كاشير' : ''}
                    onClick={() => setFormData({ ...formData, paymentMethod: 'cash', paymentSource: 'drawer' })}
                    className={`p-2 rounded-xl font-bold text-[11px] border transition flex flex-col items-center gap-1 text-center ${
                      formData.isIncome
                        ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                        : formData.paymentSource === 'drawer'
                          ? 'bg-amber-50 border-amber-600 text-amber-900 shadow-xs ring-1 ring-amber-400'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base">💵</span>
                    <span className="leading-tight">درجي أنا</span>
                    <span className={`text-[9px] ${formData.isIncome ? 'text-slate-400 font-black' : myDrawerOpen ? 'text-amber-700/80' : 'text-rose-600 font-black'}`}>
                      {formData.isIncome
                        ? '(غير متاح للإيراد)'
                        : myDrawerOpen
                          ? `(درج ${currentUser?.name || 'المستخدم الحالي'})`
                          : '(لا توجد وردية مفتوحة باسمك)'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, paymentMethod: 'cash', paymentSource: 'manager_vault' })}
                    className={`p-2 rounded-xl font-bold text-[11px] border transition flex flex-col items-center gap-1 text-center ${
                      formData.paymentSource === 'manager_vault'
                        ? 'bg-purple-50 border-purple-600 text-purple-900 shadow-xs ring-1 ring-purple-400'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base">💼</span>
                    <span className="leading-tight">خزينة المدير</span>
                    <span className="text-[9px] text-purple-700/80">(نقداً)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, paymentMethod: 'card', paymentSource: 'bank' })}
                    className={`p-2 rounded-xl font-bold text-[11px] border transition flex flex-col items-center gap-1 text-center ${
                      formData.paymentSource === 'bank'
                        ? 'bg-blue-50 border-blue-600 text-blue-900 shadow-xs ring-1 ring-blue-400'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base">🏛️</span>
                    <span className="leading-tight">الحساب البنكي</span>
                    <span className="text-[9px] text-blue-700/80">(شبكة أو تحويل)</span>
                  </button>
                </div>
              </div>

              {/* طريقة الدفع البنكية — تظهر فقط حين يكون المصدر هو البنك */}
              {formData.paymentSource === 'bank' && (
                <div>
                  <label className="block font-black text-slate-700 mb-1">طريقة الدفع من البنك *</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, paymentMethod: 'card' })}
                      className={`p-2 rounded-xl font-bold text-[11px] border transition flex items-center justify-center gap-1.5 ${
                        formData.paymentMethod === 'card'
                          ? 'bg-blue-50 border-blue-600 text-blue-900 ring-1 ring-blue-400'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span>💳</span><span>شبكة / بطاقة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, paymentMethod: 'transfer' })}
                      className={`p-2 rounded-xl font-bold text-[11px] border transition flex items-center justify-center gap-1.5 ${
                        formData.paymentMethod === 'transfer'
                          ? 'bg-cyan-50 border-cyan-600 text-cyan-900 ring-1 ring-cyan-400'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span>🏦</span><span>تحويل بنكي</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ماذا سيحدث بالضبط عند الحفظ — بلا مفاجآت */}
              <div className={`p-2.5 rounded-2xl border text-[11px] font-bold leading-relaxed ${
                formData.isIncome
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                {formData.paymentSource === 'drawer' && (
                  myDrawerOpen
                    ? <>سيُخصم <b>{formatMoney(Number(formData.amount) || 0, storeInfo.currency)}</b> من درج ({currentUser?.name || 'المستخدم الحالي'})، وتظهر حركة بالمبلغ في سجل حركات الدرج.</>
                    : <>
                        لا توجد وردية مفتوحة باسم ({currentUser?.name || 'المستخدم الحالي'})، فلا يمكن الصرف من الدرج.
                        افتح وردية أو اختر مصدراً آخر.
                        {otherOpenShiftNames.length > 0 && (
                          <span className="block mt-1 font-black">
                            الورديات المفتوحة الآن: {otherOpenShiftNames.join('، ')} — ولا يُصرف من درج غيرك.
                          </span>
                        )}
                      </>
                )}
                {formData.paymentSource === 'manager_vault' && (
                  <>{formData.isIncome ? 'سيُضاف' : 'سيُخصم'} <b>{formatMoney(Number(formData.amount) || 0, storeInfo.currency)}</b> {formData.isIncome ? 'إلى' : 'من'} كاش خزينة المدير، ويُقيَّد في دفتر الخزينة.</>
                )}
                {formData.paymentSource === 'bank' && (
                  <>{formData.isIncome ? 'سيُضاف' : 'سيُخصم'} <b>{formatMoney(Number(formData.amount) || 0, storeInfo.currency)}</b> {formData.isIncome ? 'إلى' : 'من'} رصيد الحساب البنكي ({formData.paymentMethod === 'transfer' ? 'تحويل بنكي' : 'شبكة / بطاقة'})، ويُقيَّد في دفتر الخزينة.</>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {formData.isIncome ? 'مصدر الإيراد — من أين جاء المال؟ *' : 'البيان / ملاحظات توضيحية'}
                </label>
                <input
                  type="text"
                  required={formData.isIncome}
                  placeholder={formData.isIncome
                    ? 'مثال: استرداد من مورد / بيع كراتين فارغة / إيداع من المالك'
                    : 'مثال: شراء شريط تغليف وكراتين فاخرة'}
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className={`w-full px-3 py-2.5 border rounded-xl font-bold outline-none ${
                    formData.isIncome
                      ? 'border-emerald-300 bg-emerald-50/40 focus:border-emerald-600'
                      : 'border-slate-200 focus:border-rose-500'
                  }`}
                />
                {formData.isIncome && (
                  <p className="mt-1 text-[10px] text-emerald-800/90 font-bold leading-relaxed">
                    الإيراد يزيد نقدية المتجر بلا فاتورة مقابلة، فلا بد من سبب مكتوب يُراجَع لاحقاً في سجل التدقيق.
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-rose-600 to-pink-600 text-white rounded-xl font-black shadow flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>حفظ السند فوراً</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
