import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Truck, Plus, Search, Phone, Edit2, Trash2, X, FilePlus, Package, CheckCircle, Receipt, MapPin, DollarSign, AlertCircle, Eye, Calendar } from 'lucide-react';
import { formatMoney, formatDate } from '../../utils/helpers';

export const SuppliersScreen = () => {
  const {
    suppliers,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    products,
    addPurchaseInvoice,
    deletePurchaseInvoice,
    addSupplierPayment,
    purchases,
    storeInfo,
    activeShift,
    hasPermission,
    confirmDialog
  } = useApp();

  const [activeTab, setActiveTab] = useState('suppliers'); // 'suppliers' or 'purchases'
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [isNewPurchaseOpen, setIsNewPurchaseOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [viewingPurchase, setViewingPurchase] = useState(null);
  const [selectedForPayment, setSelectedForPayment] = useState(null);
  const [paymentData, setPaymentData] = useState({
    supplierId: '',
    amount: '',
    method: 'cash',
    notes: ''
  });

  // نموذج المورد
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', address: '', balance: '0' });

  // نموذج فاتورة المشتريات
  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: suppliers[0]?.id || '',
    invoiceRef: '',
    paymentMethod: 'cash',
    paidAmount: '',
    items: [{ productId: products[0]?.id || '', qty: 1, costPrice: products[0]?.costPrice || 0 }]
  });

  const filteredSuppliers = suppliers.filter(s =>
    (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.phone || '').includes(searchQuery)
  );

  const filteredPurchases = purchases.filter(p =>
    (p.purchaseNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.supplierName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.invoiceRef || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalSupplierDebts = suppliers.reduce((s, sup) => s + (sup.balance || 0), 0);

  const handleOpenAddSupplier = () => {
    if (!hasPermission('suppliers_add')) {
      alert('⛔ ليس لديك صلاحية لإضافة مورد جديد!');
      return;
    }
    setEditingSupplier(null);
    setSupplierForm({ name: '', phone: '', address: '', balance: '0' });
    setIsAddSupplierOpen(true);
  };

  const handleOpenEditSupplier = (sup) => {
    if (!hasPermission('suppliers_manage')) {
      alert('⛔ ليس لديك صلاحية لتعديل بيانات الموردين!');
      return;
    }
    setEditingSupplier(sup);
    setSupplierForm({
      name: sup.name || '',
      phone: sup.phone || '',
      address: sup.address || '',
      balance: String(sup.balance || 0)
    });
    setIsAddSupplierOpen(true);
  };

  const handleDeleteSupplierClick = async (supId, supName) => {
    if (!hasPermission('suppliers_delete')) {
      alert('⛔ ليس لديك صلاحية لحذف الموردين!');
      return;
    }
    const ok = await confirmDialog({
      title: 'حذف مورد',
      message: `هل أنت متأكد من حذف المورد (${supName}) نهائياً من النظام؟`,
      confirmText: 'حذف',
      tone: 'danger'
    });
    if (ok) {
      deleteSupplier(supId);
    }
  };

  const handleOpenPayment = (sup = null) => {
    // =====================================================================
    //  كان يقبل suppliers_manage بديلاً عن صلاحية سند الصرف
    // =====================================================================
    //  الأثر: منع موظف من سندات الصرف مع إبقاء "إدارة الموردين" له لا
    //  يمنعه فعلياً من صرف النقد — فيظهر المفتاح مفعّلاً وهو متجاوَز.
    //  إدارة بيانات المورد (اسم، جوال) شيء، وإخراج نقد من الخزينة شيء آخر.
    // =====================================================================
    if (!hasPermission('suppliers_payment_voucher')) {
      alert('⛔ ليس لديك صلاحية لإنشاء سندات صرف للموردين!');
      return;
    }
    const targetSup = sup || suppliers[0] || null;
    setSelectedForPayment(targetSup);
    setPaymentData({
      supplierId: targetSup?.id || '',
      amount: String((targetSup?.balance || 0) > 0 ? targetSup.balance : ''),
      method: 'cash',
      notes: ''
    });
  };

  const handleSavePayment = (e) => {
    e.preventDefault();

    // الحارس الفعلي: هذه العملية تُخرج نقداً من الخزينة. حماية زر الفتح
    // وحدها لا تكفي — أي مسار فتح جديد لاحقاً سيتجاوزها.
    if (!hasPermission('suppliers_payment_voucher')) {
      alert('⛔ ليس لديك صلاحية صرف مبالغ للموردين وإصدار سندات الصرف.\nتُمنح من: الإعدادات ← المستخدمون ← الصلاحيات.');
      return;
    }

    const numAmt = Number(paymentData.amount);
    if (!numAmt || numAmt <= 0) {
      alert('يرجى إدخال مبلغ صحيح لسند الصرف');
      return;
    }
    const supId = selectedForPayment?.id || paymentData.supplierId;
    if (!supId) {
      alert('يرجى تحديد المورد');
      return;
    }

    addSupplierPayment({
      supplierId: supId,
      amount: numAmt,
      method: paymentData.method,
      notes: paymentData.notes
    });

    setSelectedForPayment(null);
  };

  const handleSaveSupplier = (e) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) return;

    if (editingSupplier) {
      // نفس سبب العملاء: لا نرسل الرصيد عند التعديل حتى لا يُمحى دين سُجّل بعد فتح النافذة،
      // ولأن قيمة الحقل نص فتتحول عملية الجمع إلى دمج نصوص (500 + 300 = "500300").
      const { balance, ...editableFields } = supplierForm;
      updateSupplier(editingSupplier.id, editableFields);
    } else {
      addSupplier({ ...supplierForm, balance: Number(supplierForm.balance) || 0 });
    }
    setIsAddSupplierOpen(false);
  };

  // فتح نافذة شراء جديدة
  const handleOpenNewPurchase = (defaultSupplierId = null) => {
    if (!hasPermission('purchases_add')) {
      alert('⛔ ليس لديك صلاحية لتسجيل فواتير المشتريات!');
      return;
    }
    setPurchaseForm({
      supplierId: defaultSupplierId || suppliers[0]?.id || '',
      invoiceRef: '',
      paymentMethod: 'cash',
      paidAmount: '',
      items: [{ productId: products[0]?.id || '', qty: 1, costPrice: products[0]?.costPrice || 0 }]
    });
    setIsNewPurchaseOpen(true);
  };

  const handleDeletePurchaseClick = async (purId, purNumber) => {
    if (!hasPermission('purchases_delete')) {
      alert('⛔ ليس لديك صلاحية لحذف فواتير المشتريات!');
      return;
    }
    const ok = await confirmDialog({
      title: 'حذف فاتورة مشتريات',
      message: `هل أنت متأكد من حذف فاتورة المشتريات رقم (${purNumber})؟\n\nسيتم خصم الكميات من المخزون وتعديل رصيد المورد.`,
      confirmText: 'حذف',
      tone: 'danger'
    });
    if (ok) {
      deletePurchaseInvoice(purId);
      if (viewingPurchase?.id === purId) setViewingPurchase(null);
    }
  };

  // إضافة عنصر لقائمة المشتريات
  const handleAddPurchaseRow = () => {
    setPurchaseForm(prev => ({
      ...prev,
      items: [...prev.items, { productId: products[0]?.id || '', qty: 1, costPrice: products[0]?.costPrice || 0 }]
    }));
  };

  const handleRemovePurchaseRow = (index) => {
    setPurchaseForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleUpdatePurchaseItem = (index, field, value) => {
    setPurchaseForm(prev => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'productId') {
        const prod = products.find(p => p.id === value);
        if (prod) updated[index].costPrice = prod.costPrice || 0;
      }
      return { ...prev, items: updated };
    });
  };

  const calculatePurchaseTotal = () => {
    return purchaseForm.items.reduce((sum, item) => sum + ((Number(item.qty) || 0) * (Number(item.costPrice) || 0)), 0);
  };

  const handleSavePurchase = (e) => {
    e.preventDefault();

    // فاتورة المشتريات تزيد المخزون وتزيد دين المورد — تُعامَل كعملية مالية.
    // الحماية كانت على زر الفتح وحده (سطر handleOpenPurchase) دون التنفيذ.
    if (!hasPermission('purchases_add')) {
      alert('⛔ ليس لديك صلاحية تسجيل فواتير المشتريات.\nتُمنح من: الإعدادات ← المستخدمون ← الصلاحيات.');
      return;
    }

    const purchaseTotal = calculatePurchaseTotal();
    if (purchaseTotal <= 0) {
      alert('يرجى إضافة أصناف وتحديد الكميات والتكلفة');
      return;
    }

    const sup = suppliers.find(s => s.id === purchaseForm.supplierId);

    const purchaseItems = purchaseForm.items.map(item => {
      const p = products.find(prod => prod.id === item.productId);
      return {
        product: p,
        productId: item.productId,
        qty: Number(item.qty) || 1,
        costPrice: Number(item.costPrice) || 0
      };
    });

    addPurchaseInvoice({
      supplierId: purchaseForm.supplierId,
      supplierName: sup?.name || 'مورد عام',
      items: purchaseItems,
      totalAmount: purchaseTotal,
      paidAmount: purchaseForm.paidAmount !== '' ? Number(purchaseForm.paidAmount) : purchaseTotal,
      paymentMethod: purchaseForm.paymentMethod,
      invoiceRef: purchaseForm.invoiceRef,
      notes: ''
    });

    alert('تم تسجيل فاتورة المشتريات وزيادة المخزون بنجاح! 🌸');
    setIsNewPurchaseOpen(false);
  };

  return (
    <div className="p-3 sm:p-5 lg:p-8 max-w-4xl lg:max-w-7xl mx-auto space-y-5 pb-28 font-cairo select-none animate-in fade-in">
      
      {/* رأس الصفحة مع التبديل والبحث */}
      <div className="bg-white/95 backdrop-blur-md p-4 rounded-3xl border border-pink-100 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-700 text-white flex items-center justify-center text-2xl shadow-md">
            🚚
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900">إدارة الموردين وفواتير المشتريات</h2>
            <p className="text-xs text-slate-500">متابعة حسابات الموردين، فواتير التوريد، وزيادة المخزون</p>
          </div>
        </div>

        {/* أزرار التبديل */}
        <div className="flex gap-1.5 p-1 bg-slate-100 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('suppliers')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
              activeTab === 'suppliers' ? 'bg-white text-purple-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-4 h-4 text-purple-600" />
            <span>الموردين ({suppliers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('purchases')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
              activeTab === 'purchases' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FilePlus className="w-4 h-4 text-indigo-600" />
            <span>فواتير الشراء ({purchases.length})</span>
          </button>
        </div>
      </div>

      {/* شريط البحث وزر الإضافة */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={activeTab === 'suppliers' ? 'بحث باسم المورد أو الهاتف...' : 'بحث برقم الفاتورة أو المورد...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-10 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {activeTab === 'suppliers' ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenPayment()}
                className="px-3.5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 text-white rounded-2xl text-xs font-black shadow-md transition active:scale-95 flex items-center gap-1.5"
                title="سند صرف دفعة لمورد"
              >
                <DollarSign className="w-4 h-4" />
                <span>💵 سند صرف لمورد</span>
              </button>
              <button
                type="button"
                onClick={handleOpenAddSupplier}
                className="px-3.5 py-2.5 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 text-white rounded-2xl text-xs font-black shadow-md transition active:scale-95 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>➕ إضافة مورد جديد</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleOpenNewPurchase()}
              className="px-4 py-2.5 bg-gradient-to-r from-indigo-700 to-purple-700 hover:from-indigo-600 text-white rounded-2xl text-xs font-black shadow-md transition active:scale-95 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>➕ تسجيل فاتورة مشتريات</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. تبويب الموردين */}
      {/* ========================================================================= */}
      {activeTab === 'suppliers' && (
        <div className="space-y-4">
          {/* بطاقات ملخص الموردين المستطيلة الزاهية */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* 1. إجمالي مستحقات الموردين */}
            <div className="p-3.5 bg-gradient-to-br from-purple-50 via-indigo-50 to-purple-100/70 rounded-2xl border-2 border-purple-300/90 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-purple-950 text-xs font-black block mb-0.5">مستحقات الموردين (التزامات)</span>
                <strong className="text-base sm:text-lg font-black text-purple-800 font-mono tracking-tight">{formatMoney(totalSupplierDebts, storeInfo.currency)}</strong>
              </div>
              <span className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black text-base shadow-md shadow-purple-500/25">📊</span>
            </div>

            {/* 2. عدد الموردين */}
            <div className="p-3.5 bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-50/70 rounded-2xl border-2 border-blue-300/90 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-blue-950 text-xs font-black block mb-0.5">عدد الموردين المسجلين</span>
                <strong className="text-base sm:text-lg font-black text-blue-700 font-mono tracking-tight">{suppliers.length} مورد</strong>
              </div>
              <span className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center font-black text-base shadow-md shadow-blue-500/25">🚚</span>
            </div>

            {/* 3. فواتير الشراء */}
            <div className="p-3.5 bg-gradient-to-br from-emerald-50 via-teal-50 to-green-50/70 rounded-2xl border-2 border-emerald-300/90 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-emerald-950 text-xs font-black block mb-0.5">إجمالي فواتير الشراء</span>
                <strong className="text-base sm:text-lg font-black text-emerald-700 font-mono tracking-tight">{purchases.length} فاتورة</strong>
              </div>
              <span className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black text-base shadow-md shadow-emerald-500/25">🧾</span>
            </div>
          </div>

          {/* قائمة كروت الموردين */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {filteredSuppliers.map(sup => (
              <div
                key={sup.id}
                className="bg-white/95 backdrop-blur-md rounded-3xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-800 flex items-center justify-center font-black text-sm shrink-0 border border-purple-200">
                      {sup.name?.slice(0, 2) || 'مو'}
                    </div>
                    <div>
                      <h4 className="font-black text-xs sm:text-sm text-slate-900">{sup.name}</h4>
                      {sup.phone && (
                        <p className="text-[11px] text-slate-500 flex items-center gap-1 font-mono mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{sup.phone}</span>
                        </p>
                      )}
                      {sup.address && (
                        <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{sup.address}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-left">
                    <span className="text-[10px] text-slate-400 block font-bold">الرصيد المستحق:</span>
                    <span className={`text-xs sm:text-sm font-black ${(sup.balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatMoney(sup.balance || 0, storeInfo.currency)}
                    </span>
                  </div>
                </div>

                {/* شريط الإجراءات: صرف دفعة • إضافة فاتورة شراء • تعديل • حذف */}
                <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenPayment(sup)}
                      className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold text-[11px] transition flex items-center gap-1 border border-emerald-200"
                      title="سند صرف دفعة من الحساب لهذا المورد"
                    >
                      <DollarSign className="w-3 h-3" />
                      <span>صرف دفعة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenNewPurchase(sup.id)}
                      className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl font-bold text-[11px] transition flex items-center gap-1 border border-purple-200"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ فاتورة شراء</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEditSupplier(sup)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-800 rounded-xl font-bold text-[11px] transition flex items-center gap-1"
                      title="تعديل بيانات المورد"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>تعديل</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteSupplierClick(sup.id, sup.name)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl transition"
                      title="حذف المورد"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. تبويب فواتير المشتريات */}
      {/* ========================================================================= */}
      {activeTab === 'purchases' && (
        <div className="space-y-3">
          {filteredPurchases.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center text-slate-400 border border-slate-200 space-y-2">
              <Package className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
              <h4 className="font-bold text-sm text-slate-700">لا توجد فواتير مشتريات مسجلة</h4>
              <p className="text-xs text-slate-400">انقر على زر "تسجيل فاتورة مشتريات" لتوثيق بضاعة واردة وزيادة المخزون</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredPurchases.map(pur => (
                <div
                  key={pur.id}
                  className="bg-white/95 backdrop-blur-md rounded-3xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
                          {pur.purchaseNumber}
                        </span>
                        {pur.invoiceRef && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            مرجع: {pur.invoiceRef}
                          </span>
                        )}
                      </div>
                      <h4 className="font-black text-xs sm:text-sm text-slate-900 mt-1">المورد: {pur.supplierName}</h4>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{formatDate(pur.date)}</span>
                      </p>
                    </div>

                    <div className="text-left">
                      <span className="text-[10px] text-slate-400 block font-bold">إجمالي الفاتورة:</span>
                      <span className="text-sm sm:text-base font-black text-slate-900">
                        {formatMoney(pur.totalAmount, storeInfo.currency)}
                      </span>
                      {pur.remainingDebt > 0 && (
                        <span className="text-[10px] text-rose-600 font-bold block">
                          متبقي: {formatMoney(pur.remainingDebt, storeInfo.currency)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* قائمة الأصناف المختصرة */}
                  {Array.isArray(pur.items) && pur.items.length > 0 && (
                    <div className="p-2.5 bg-slate-50 rounded-2xl text-[11px] text-slate-600 space-y-1">
                      {pur.items.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center">
                          <span>• {item.product?.name || item.name || 'صنف'}</span>
                          <span className="font-bold">{item.qty} × {formatMoney(item.costPrice, storeInfo.currency)}</span>
                        </div>
                      ))}
                      {pur.items.length > 3 && (
                        <span className="text-[10px] text-purple-600 font-bold block text-center">+ {pur.items.length - 3} أصناف أخرى</span>
                      )}
                    </div>
                  )}

                  {/* أزرار الفاتورة: معاينة وحذف */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[10px] text-slate-400 font-bold">
                      طريقة الدفع: {pur.paymentMethod === 'cash' ? '💵 نقداً' : '💳 شبكة / تحويل'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setViewingPurchase(pur)}
                        className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl font-bold text-[11px] transition flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>تفاصيل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePurchaseClick(pur.id, pur.purchaseNumber)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl transition"
                        title="حذف فاتورة الشراء"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* نافذة منبثقة: إضافة / تعديل مورد */}
      {/* ========================================================================= */}
      {isAddSupplierOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-purple-200 animate-in zoom-in-95">
            <div className="p-4 bg-gradient-to-r from-purple-900 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🚚</span>
                <h3 className="font-black text-sm">{editingSupplier ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}</h3>
              </div>
              <button type="button" onClick={() => setIsAddSupplierOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم المورد / الشركة *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: شركة مزارع الورد الهولندية"
                  value={supplierForm.name}
                  onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold focus:border-purple-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">رقم الهاتف / الجوال</label>
                <input
                  type="text"
                  placeholder="05xxxxxxxx"
                  value={supplierForm.phone}
                  onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-mono font-bold focus:border-purple-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">العنوان / المدينة</label>
                <input
                  type="text"
                  placeholder="الرياض - سوق الزهور بالجملة"
                  value={supplierForm.address}
                  onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold focus:border-purple-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">الرصيد الافتتاحي المستحق له (ديون سابقة)</label>
                <input
                  type="number"
                  step="any"
                  value={supplierForm.balance}
                  onChange={e => setSupplierForm({ ...supplierForm, balance: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-black text-slate-900 focus:border-purple-500 outline-none"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddSupplierOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-xl font-black shadow flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{editingSupplier ? 'حفظ التعديلات' : 'إضافة المورد فوراً'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* نافذة منبثقة: تسجيل فاتورة مشتريات جديدة */}
      {/* ========================================================================= */}
      {/* نافذة منبثقة: تسجيل فاتورة مشتريات جديدة */}
      {/* ========================================================================= */}
      {isNewPurchaseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-purple-200 animate-in zoom-in-95 max-h-[92vh] flex flex-col">
            <div className="p-4 bg-gradient-to-r from-purple-900 to-indigo-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-white/20 flex items-center justify-center text-xl shadow-inner">
                  📦
                </div>
                <div>
                  <h3 className="font-black text-sm">تسجيل فاتورة شراء وتوريد مخزون 🌸</h3>
                  <p className="text-[11px] text-purple-200">إدخال بضاعة جديدة وزيادة المخزون وتوثيق التكلفة وحساب المورد</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewPurchaseOpen(false)}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">المورد المعتمد *</label>
                  <select
                    value={purchaseForm.supplierId}
                    onChange={e => setPurchaseForm({ ...purchaseForm, supplierId: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold bg-slate-50 hover:bg-white focus:bg-white outline-none focus:ring-2 focus:ring-purple-400"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} (الرصيد: {s.balance || 0} ر.س)</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم الفاتورة الورقية / المرجع</label>
                  <input
                    type="text"
                    placeholder="مثال: INV-9982"
                    value={purchaseForm.invoiceRef}
                    onChange={e => setPurchaseForm({ ...purchaseForm, invoiceRef: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-mono font-bold outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              </div>

              {/* جدول الأصناف المشتراة الواضح بتنسيق جدول احترافي */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-purple-700" />
                    <span className="font-black text-slate-800 text-sm">الأصناف المشتراة والتكلفة:</span>
                    <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 rounded-full text-[10.5px] font-bold">
                      {purchaseForm.items.length} {purchaseForm.items.length === 1 ? 'صنف' : 'أصناف'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddPurchaseRow}
                    className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة صنف آخر</span>
                  </button>
                </div>

                {/* شريط عناوين الأعمدة التوضيحي الواضح */}
                <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl font-black text-[11px] border border-slate-200">
                  <div className="col-span-5">اسم الصنف / المنتج</div>
                  <div className="col-span-2 text-center">الكمية المشتراة</div>
                  <div className="col-span-2 text-center">سعر التكلفة للحبة</div>
                  <div className="col-span-2 text-center">إجمالي السطر</div>
                  <div className="col-span-1 text-center">إجراء</div>
                </div>

                {/* صفوف الأصناف بتفاصيل واضحة */}
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-0.5">
                  {purchaseForm.items.map((row, idx) => {
                    const currentProd = products.find(p => p.id === row.productId);
                    const rowQty = Number(row.qty) || 0;
                    const rowCost = Number(row.costPrice) || 0;
                    const rowTotal = rowQty * rowCost;

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-purple-50/30 hover:bg-purple-50/70 rounded-2xl border-2 border-purple-100/90 hover:border-purple-300 transition-all shadow-xs space-y-2 sm:space-y-0 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center"
                      >
                        {/* 1. اختيار المنتج */}
                        <div className="sm:col-span-5">
                          <label className="block sm:hidden text-[11px] font-bold text-slate-700 mb-1">
                            اسم الصنف / المنتج:
                          </label>
                          <select
                            value={row.productId}
                            onChange={e => handleUpdatePurchaseItem(idx, 'productId', e.target.value)}
                            className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-900 outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer"
                          >
                            {products.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} (المخزون الحالي: {p.stock || 0})
                              </option>
                            ))}
                          </select>
                          {currentProd && (
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 font-medium px-1">
                              <span>المخزون الحالي: <strong className="text-slate-800 font-bold">{currentProd.stock || 0}</strong></span>
                              <span>•</span>
                              <span>سعر البيع: <strong className="text-purple-700 font-bold">{formatMoney(currentProd.price || 0, storeInfo.currency)}</strong></span>
                            </div>
                          )}
                        </div>

                        {/* 2. الكمية المشتراة */}
                        <div className="sm:col-span-2">
                          <label className="block sm:hidden text-[11px] font-bold text-slate-700 mb-1">
                            الكمية المشتراة (حبة):
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="1"
                              placeholder="الكمية"
                              value={row.qty}
                              onChange={e => handleUpdatePurchaseItem(idx, 'qty', e.target.value)}
                              className="w-full px-2 py-2 pl-7 rounded-xl border border-slate-200 bg-white font-black text-center text-xs text-slate-900 outline-none focus:ring-2 focus:ring-purple-400"
                            />
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">
                              حبة
                            </span>
                          </div>
                        </div>

                        {/* 3. سعر التكلفة للقطعة */}
                        <div className="sm:col-span-2">
                          <label className="block sm:hidden text-[11px] font-bold text-slate-700 mb-1">
                            سعر التكلفة للحبة (ر.س):
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="التكلفة"
                              value={row.costPrice}
                              onChange={e => handleUpdatePurchaseItem(idx, 'costPrice', e.target.value)}
                              className="w-full px-2 py-2 pl-8 rounded-xl border border-slate-200 bg-white font-black text-center text-xs text-slate-900 outline-none focus:ring-2 focus:ring-purple-400"
                            />
                            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 pointer-events-none">
                              ر.س
                            </span>
                          </div>
                        </div>

                        {/* 4. إجمالي السطر */}
                        <div className="sm:col-span-2 flex sm:flex-col items-center justify-between sm:justify-center p-2 bg-white rounded-xl border border-purple-200/80 shadow-xs">
                          <span className="sm:hidden text-[10px] font-bold text-slate-500">إجمالي السطر:</span>
                          <span className="text-xs font-black text-purple-800 font-mono">
                            {formatMoney(rowTotal, storeInfo.currency)}
                          </span>
                        </div>

                        {/* 5. زر حذف الصنف */}
                        <div className="sm:col-span-1 flex items-center justify-end sm:justify-center">
                          {purchaseForm.items.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => handleRemovePurchaseRow(idx)}
                              title="حذف هذا الصنف من الفاتورة"
                              className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 flex items-center justify-center transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="text-slate-300 text-xs hidden sm:inline">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* إجمالي الحساب وتفاصيل الدفع والمتبقي */}
              {(() => {
                const totalPurchase = calculatePurchaseTotal();
                const paidVal = purchaseForm.paidAmount !== '' ? Number(purchaseForm.paidAmount) : totalPurchase;
                const remainingDebt = Math.max(0, totalPurchase - paidVal);

                return (
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-2.5 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-600">إجمالي كمية البضاعة:</span>
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded-lg font-black font-mono text-xs">
                          {purchaseForm.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)} حبة
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-800">إجمالي فاتورة الشراء:</span>
                        <span className="text-base font-black text-purple-800 font-mono">
                          {formatMoney(totalPurchase, storeInfo.currency)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">المبلغ المسدد للمورد الآن:</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            placeholder={totalPurchase > 0 ? totalPurchase.toString() : 'كامل المبلغ'}
                            value={purchaseForm.paidAmount}
                            onChange={e => setPurchaseForm({ ...purchaseForm, paidAmount: e.target.value })}
                            className="w-full px-3 py-2 pl-8 rounded-xl border border-slate-200 bg-white font-black text-center text-xs outline-none focus:ring-2 focus:ring-purple-400"
                          />
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">
                            ر.س
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">طريقة السداد:</label>
                        <select
                          value={purchaseForm.paymentMethod}
                          onChange={e => setPurchaseForm({ ...purchaseForm, paymentMethod: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-purple-400"
                        >
                          <option value="cash">💵 نقداً من الدرج (خصم من الصندوق)</option>
                          <option value="card">💳 شبكة / تحويل بنكي (خارج الدرج)</option>
                        </select>
                      </div>
                    </div>

                    {/* تنبيه حالة السداد أو الدين المتبقي */}
                    <div className="pt-1 flex items-center justify-between text-[11px] font-bold">
                      {remainingDebt > 0 ? (
                        <div className="flex items-center gap-1.5 text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 w-full">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>المتبقي كدين آجل للمورد: <strong className="font-mono font-black">{formatMoney(remainingDebt, storeInfo.currency)}</strong></span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 w-full">
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>الفاتورة مدفوعة بالكامل للمورد (لا يوجد دين مؤجل).</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewPurchaseOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white rounded-xl font-black shadow-md flex items-center gap-1.5 transition active:scale-95"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>تسجيل الفاتورة وزيادة المخزون</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* نافذة منبثقة: استعراض تفاصيل فاتورة المشتريات */}
      {/* ========================================================================= */}
      {viewingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-purple-200 animate-in zoom-in-95">
            <div className="p-4 bg-gradient-to-r from-purple-900 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5" />
                <h3 className="font-black text-sm">تفاصيل فاتورة المشتريات #{viewingPurchase.purchaseNumber}</h3>
              </div>
              <button type="button" onClick={() => setViewingPurchase(null)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-purple-50/50 rounded-2xl border border-purple-100">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">المورد:</span>
                  <span className="font-black text-slate-900">{viewingPurchase.supplierName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">التاريخ:</span>
                  <span className="font-bold text-slate-700">{formatDate(viewingPurchase.date)}</span>
                </div>
              </div>

              {/* قائمة الأصناف */}
              <div className="space-y-2">
                <span className="font-black text-slate-800 block">الأصناف المسجلة وتكلفتها:</span>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  {(viewingPurchase.items || []).map((item, idx) => {
                    const rowQty = Number(item.qty) || 1;
                    const rowCost = Number(item.costPrice) || 0;
                    const rowTotal = rowQty * rowCost;

                    return (
                      <div key={idx} className="p-3 bg-white flex justify-between items-center hover:bg-slate-50/70 transition">
                        <div>
                          <span className="font-bold text-slate-900 block text-xs">{item.product?.name || item.name || 'صنف'}</span>
                          <span className="text-[10.5px] text-slate-500 font-medium">
                            الكمية: <strong className="text-slate-800 font-bold">{rowQty} حبة</strong> × سعر التكلفة: <strong className="text-purple-700 font-bold">{formatMoney(rowCost, storeInfo.currency)}</strong>
                          </span>
                        </div>
                        <div className="text-left">
                          <span className="font-black text-purple-800 font-mono text-xs block">
                            {formatMoney(rowTotal, storeInfo.currency)}
                          </span>
                          <span className="text-[9.5px] text-slate-400 font-bold">إجمالي الصنف</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 bg-slate-900 text-white rounded-2xl flex justify-between items-center font-black">
                <span>إجمالي الفاتورة:</span>
                <span className="text-base text-pink-300">{formatMoney(viewingPurchase.totalAmount, storeInfo.currency)}</span>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleDeletePurchaseClick(viewingPurchase.id, viewingPurchase.purchaseNumber)}
                  className="px-3 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl font-bold text-xs flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف الفاتورة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewingPurchase(null)}
                  className="px-5 py-2 bg-purple-700 text-white rounded-xl font-black"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة سند صرف لمورد */}
      {selectedForPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 font-cairo">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl border border-emerald-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">سند صرف دفعة لمورد 💸</h3>
                  <p className="text-2xs text-slate-400">توثيق سداد نقدي أو بنكي للمورد وخصمه من الرصيد</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedForPayment(null)}
                className="p-1 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="space-y-3.5">
              {/* اختيار المورد */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">المورد:</label>
                <select
                  value={selectedForPayment.id}
                  onChange={(e) => {
                    const sup = suppliers.find(s => s.id === e.target.value);
                    if (sup) {
                      setSelectedForPayment(sup);
                      setPaymentData(prev => ({
                        ...prev,
                        supplierId: sup.id,
                        amount: String((sup.balance || 0) > 0 ? sup.balance : prev.amount)
                      }));
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (المستحق: {formatMoney(s.balance || 0, storeInfo.currency)})
                    </option>
                  ))}
                </select>
              </div>

              {/* بطاقة رصيد المورد الحالي */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-950">إجمالي الرصيد المستحق حالياً:</span>
                <span className="font-mono font-black text-sm text-rose-600">
                  {formatMoney(selectedForPayment.balance || 0, storeInfo.currency)}
                </span>
              </div>

              {/* المبلغ المصروف */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">المبلغ المدفوع ({storeInfo.currency}):</label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  autoFocus
                  placeholder="0.00"
                  value={paymentData.amount}
                  onChange={e => setPaymentData({ ...paymentData, amount: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black text-slate-900 text-center font-mono focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:outline-hidden"
                />
              </div>

              {/* طريقة الصرف */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">طريقة الدفع والصرف:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentData({ ...paymentData, method: 'cash' })}
                    className={`py-2 px-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition ${
                      paymentData.method === 'cash'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>💵 نقداً (كاش)</span>
                    <span className="text-[10px] opacity-80">{activeShift?.isOpen ? 'درج الوردية' : 'الخزينة'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentData({ ...paymentData, method: 'transfer' })}
                    className={`py-2 px-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition ${
                      paymentData.method === 'transfer'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>🏛️ تحويل بنكي</span>
                    <span className="text-[10px] opacity-80">حساب المؤسسة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentData({ ...paymentData, method: 'card' })}
                    className={`py-2 px-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition ${
                      paymentData.method === 'card'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>💳 بطاقة / شبكة</span>
                    <span className="text-[10px] opacity-80">مدى / فيزا</span>
                  </button>
                </div>
              </div>

              {/* ملاحظات */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">بيان / ملاحظات السند:</label>
                <input
                  type="text"
                  placeholder="مثال: دفعة من حساب فاتورة توريد زهور..."
                  value={paymentData.notes}
                  onChange={e => setPaymentData({ ...paymentData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              {/* أزرار الإجراءات */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedForPayment(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 text-white text-xs font-black rounded-xl shadow-md transition active:scale-95 flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>اعتماد وصرف السند ✅</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
