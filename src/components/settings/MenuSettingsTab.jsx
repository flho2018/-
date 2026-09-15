import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Eye, EyeOff, ArrowUp, ArrowDown, Save, CheckCircle, RotateCcw, LayoutDashboard, ShoppingCart, Receipt, Package, Users, Truck, DollarSign, PieChart, Settings } from 'lucide-react';

export const MenuSettingsTab = () => {
  const { storeInfo, updateStoreInfo } = useApp();

  const allModulesDef = {
    dashboard: { id: 'dashboard', label: 'الرئيسية / لوحة التحكم', icon: LayoutDashboard, desc: 'إحصائيات المبيعات والوردية' },
    pos: { id: 'pos', label: 'نقطة البيع (الكاشير)', icon: ShoppingCart, desc: 'تسجيل الفواتير السريعة' },
    invoices: { id: 'invoices', label: 'سجل الفواتير والمعلقة', icon: Receipt, desc: 'إدارة الفواتير والاسترجاع' },
    products: { id: 'products', label: 'المنتجات والمخزون', icon: Package, desc: 'الأصناف والتصنيفات والجرد' },
    customers: { id: 'customers', label: 'العملاء والديون والآجل', icon: Users, desc: 'كشف الحساب وسندات القبض' },
    suppliers: { id: 'suppliers', label: 'الموردين والمشتريات', icon: Truck, desc: 'فواتير المشتريات وسندات الصرف' },
    expenses: { id: 'expenses', label: 'المصروفات والإيرادات', icon: DollarSign, desc: 'النثريات والمصاريف التشغيلية' },
    cashDrawer: { id: 'cashDrawer', label: 'حركة الخزينة والوردية', icon: LayoutDashboard, desc: 'فتح وإغلاق الوردية Z-Report' },
    reports: { id: 'reports', label: 'التقارير والإحصائيات', icon: PieChart, desc: 'الأرباح والإقرار الضريبي ZATCA' },
    userReports: { id: 'userReports', label: 'تحليلات الكاشيرات وفريق العمل 👥', icon: Users, desc: 'ساعات العمل، المبيعات، ومعدل الإنجاز' },
    settings: { id: 'settings', label: 'إعدادات النظام والتهيئة', icon: Settings, desc: 'تخصيص النظام والطابعة والواتساب' },
  };

  const defaultOrder = ['dashboard', 'pos', 'invoices', 'products', 'customers', 'suppliers', 'expenses', 'cashDrawer', 'reports', 'userReports', 'settings'];

  const [order, setOrder] = useState(() => {
    const saved = storeInfo.menuItemsOrder || defaultOrder;
    return saved.includes('userReports') ? saved : [...saved.filter(k => k !== 'settings'), 'userReports', 'settings'];
  });
  const [visibility, setVisibility] = useState(() => storeInfo.visibleModules || {});
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const newOrder = [...order];
    const temp = newOrder[index];
    newOrder[index] = newOrder[index - 1];
    newOrder[index - 1] = temp;
    setOrder(newOrder);
  };

  const handleMoveDown = (index) => {
    if (index === order.length - 1) return;
    const newOrder = [...order];
    const temp = newOrder[index];
    newOrder[index] = newOrder[index + 1];
    newOrder[index + 1] = temp;
    setOrder(newOrder);
  };

  const handleToggleVisible = (modKey) => {
    if (modKey === 'settings' || modKey === 'pos') {
      alert('لا يمكن إخفاء شاشة نقطة البيع أو شاشة الإعدادات لضمان استقرار البرنامج');
      return;
    }
    setVisibility(prev => ({
      ...prev,
      [modKey]: prev[modKey] === false ? true : false
    }));
  };

  const handleSave = () => {
    updateStoreInfo({
      ...storeInfo,
      menuItemsOrder: order,
      visibleModules: visibility
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleReset = () => {
    if (confirm('هل أنت متأكد من استعادة الترتيب الافتراضي وإظهار جميع القوائم؟')) {
      setOrder(defaultOrder);
      setVisibility({});
      updateStoreInfo({
        ...storeInfo,
        menuItemsOrder: defaultOrder,
        visibleModules: {}
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in text-xs font-cairo">
      
      {/* رأس الصفحة */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-pink-900 text-white p-5 rounded-3xl shadow-lg border border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-2xl border border-white/20 shadow-inner">
            📋
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black flex items-center gap-2">
              <span>ترتيب القائمة الرئيسية وإظهار وإخفاء الشاشات</span>
              <span className="text-pink-400">🌸</span>
            </h3>
            <p className="text-xs text-purple-200/80 mt-0.5">
              تحكم بترتيب ظهور أقسام البرنامج بالقائمة الجانبية مع إمكانية إخفاء أي قسم لا تحتاجه
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition flex items-center gap-1.5 border border-white/20"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الترتيب الأصلي</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-400 text-white rounded-xl font-black shadow-md transition flex items-center gap-1.5 active:scale-95 border border-pink-300/30"
          >
            <Save className="w-4 h-4" />
            <span>حفظ ترتيب القوائم 💾</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 font-bold flex items-center gap-2 shadow-xs animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>تم حفظ ترتيب القوائم وإظهارها وتطبيقها بنجاح في القائمة الجانبية! 🌸</span>
        </div>
      )}

      {/* قائمة الشاشات القابلة لإعادة الترتيب والإظهار والإخفاء */}
      <div className="p-4 bg-white rounded-3xl border border-pink-100 shadow-xs space-y-2.5">
        {order.map((modKey, idx) => {
          const item = allModulesDef[modKey];
          if (!item) return null;
          const Icon = item.icon;
          const isVisible = visibility[modKey] !== false;

          return (
            <div
              key={modKey}
              className={'p-3 rounded-2xl border transition flex items-center justify-between gap-3 ' + (
                isVisible ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-100/50 border-dashed border-slate-300 opacity-60'
              )}
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-lg bg-white border border-slate-200 text-slate-700 font-black text-xs flex items-center justify-center font-mono">
                  {idx + 1}
                </span>

                <div className="w-9 h-9 rounded-xl bg-pink-100 text-pink-700 flex items-center justify-center font-bold">
                  <Icon className="w-4 h-4" />
                </div>

                <div>
                  <h5 className="font-black text-slate-900 text-xs flex items-center gap-2">
                    <span>{item.label}</span>
                    {!isVisible && <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 rounded font-bold">مخفي</span>}
                  </h5>
                  <p className="text-[10px] text-slate-500">{item.desc}</p>
                </div>
              </div>

              {/* أزرار الإجراءات: تقديم، تأخير، إظهار/إخفاء */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => handleMoveUp(idx)}
                  className="p-1.5 rounded-xl bg-white hover:bg-slate-200 text-slate-700 disabled:opacity-30 border border-slate-200 transition active:scale-95"
                  title="تحريك للأعلى"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  disabled={idx === order.length - 1}
                  onClick={() => handleMoveDown(idx)}
                  className="p-1.5 rounded-xl bg-white hover:bg-slate-200 text-slate-700 disabled:opacity-30 border border-slate-200 transition active:scale-95"
                  title="تحريك للأسفل"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleVisible(modKey)}
                  className={'px-3 py-1.5 rounded-xl font-bold text-[11px] transition flex items-center gap-1 active:scale-95 border ' + (
                    isVisible
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200'
                      : 'bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200'
                  )}
                  title={isVisible ? 'إخفاء من القائمة' : 'إظهار في القائمة'}
                >
                  {isVisible ? (
                    <>
                      <Eye className="w-3.5 h-3.5 text-emerald-700" />
                      <span>ظاهر</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-rose-700" />
                      <span>مخفي</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
