import React from 'react';
import { useApp } from '../../context/AppContext';
import { canAccessModule } from '../../utils/permissions';
import {
  ShoppingCart,
  Receipt,
  Package,
  BarChart3,
  Settings,
  Menu
} from 'lucide-react';


export const BottomNav = ({ currentTab, setCurrentTab, toggleSidebar, setIsCartOpen }) => {
  const { cart, heldBills, storeInfo, currentUser } = useApp();
  const cartItemCount = cart.reduce((s, i) => s + i.qty, 0);

  const tabs = [
    { 
      id: 'pos', 
      label: 'الكاشير', 
      icon: ShoppingCart, 
      badge: cartItemCount > 0 ? cartItemCount : null,
      badgeColor: 'bg-gradient-to-r from-purple-600 to-pink-500'
    },
    { id: 'products', label: 'المخزون', icon: Package },
    { 
      id: 'invoices', 
      label: 'الفواتير', 
      icon: Receipt,
      badge: heldBills.length > 0 ? heldBills.length : null,
      badgeColor: 'bg-amber-500'
    },
    { id: 'reports', label: 'التقارير', icon: BarChart3 },
    { id: 'settings', label: 'الإعدادات', icon: Settings },
  ]
  // شريط الجوال كان يعرض كل الشاشات بلا استثناء — الآن يحترم
  // إخفاء الشاشات من الإعدادات وصلاحيات المستخدم، تماماً كالشريط العلوي.
  .filter(t => {
    if (t.id === 'pos') return true;
    if ((storeInfo?.visibleModules || {})[t.id] === false) return false;
    return canAccessModule(currentUser, t.id);
  });

  return (
    <div className="lg:hidden z-30 bg-white/95 backdrop-blur-md border-t border-pink-100 py-1.5 px-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] shrink-0 no-print">
      <div className="flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setCurrentTab(tab.id);
                if (tab.id === 'pos' && isActive) {
                  // إذا ضغط على نقطة البيع وهو فيها، يفتح السلة
                  setIsCartOpen(true);
                }
              }}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition active:scale-95 relative ${
                isActive ? 'text-purple-700 font-black' : 'text-slate-500 hover:text-purple-800'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5] text-purple-700' : 'stroke-2'}`} />
                {tab.badge && (
                  <span className={`absolute -top-1.5 -right-2 text-[10px] font-black text-white px-1.5 py-0.2 rounded-full shadow-sm ${tab.badgeColor}`}>
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5">{tab.label}</span>
            </button>
          );
        })}

        {/* زر القائمة والمزيد */}
        <button
          onClick={toggleSidebar}
          className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-slate-500 hover:text-slate-800 transition active:scale-95"
        >
          <Menu className="w-5 h-5 stroke-2" />
          <span className="text-[10px] mt-0.5">المزيد</span>
        </button>
      </div>
    </div>
  );
};
