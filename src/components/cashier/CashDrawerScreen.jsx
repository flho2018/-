import React, { useState, useMemo } from 'react';
import {
  Layers,
  History,
  Landmark,
  User
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { checkUserPermission } from '../../utils/permissions';
import { CurrentShiftDrawerTab } from './tabs/CurrentShiftDrawerTab';
import { ShiftsHistoryTab } from './tabs/ShiftsHistoryTab';
import { ManagerTreasuryTab } from './tabs/ManagerTreasuryTab';

export const CashDrawerScreen = () => {
  const {
    storeInfo,
    currentUser,
    shiftsHistory,
    treasuryLedger,
    userShifts,
    invoices,
    expenses,
    customers,
    paymentReceipts,
    getTreasurySummary
  } = useApp();

  const [activeTab, setActiveTab] = useState('current'); // 'current', 'history', or 'treasury'
  const isAdmin = currentUser?.role === 'admin';

  // صلاحيتا عرض سجل الورديات وخزينة الإدارة
  const canViewShiftsHistory = checkUserPermission(currentUser, 'drawer_view_shifts_history');
  const canViewTreasury      = checkUserPermission(currentUser, 'treasury_manage');

  // إن كان التبويب الحالي ممنوعاً نُرجع المستخدم للوردية الحالية
  if ((activeTab === 'history' && !canViewShiftsHistory) || (activeTab === 'treasury' && !canViewTreasury)) {
    setTimeout(() => setActiveTab('current'), 0);
  }

  // ملخص تدفق الخزينة والإيداعات البنكية المباشر
  const treasurySummary = useMemo(() => {
    if (typeof getTreasurySummary === 'function') {
      return getTreasurySummary();
    }
    return {
      pendingShifts: [],
      pendingHandoversTotal: 0,
      openShiftsCashTotal: 0,
      cashierTotalCash: 0,
      totalActiveCashiersCount: 0,
      activeOpenShiftsList: [],
      totalReceivedHandovers: 0,
      totalManagerExpenses: 0,
      totalBankDeposits: 0,
      managerVaultCash: 0,
      netManagerVaultCash: 0,
      posGrossSales: 0,
      posPendingGross: 0,
      posSettledGross: 0,
      posSettledCommissions: 0,
      posSettledNet: 0,
      posEstimatedCommission: 0,
      posEstimatedNet: 0,
      appsGrossSales: 0,
      appsPendingGross: 0,
      appsSettledGross: 0,
      appsSettledCommissions: 0,
      appsSettledNet: 0,
      appsEstimatedCommission: 0,
      appsEstimatedNet: 0,
      totalCustomerDebt: 0,
      directBankTransfers: 0,
      bankExpensesTotal: 0,
      netBankBalance: 0,
      totalExpectedBank: 0,
      ledger: []
    };
  }, [shiftsHistory, treasuryLedger, userShifts, invoices, expenses, customers, paymentReceipts, getTreasurySummary]);


  return (
    <div className="p-3 sm:p-5 max-w-7xl mx-auto space-y-4 font-cairo text-slate-800 pb-24">
      {/* رأس الشاشة وأزرار التبديل */}
      <div className="bg-white/95 backdrop-blur-md p-4 rounded-3xl border border-pink-100 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 to-pink-600 text-white flex items-center justify-center text-2xl shadow-md">
            💵
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900">حركة الخزينة والورديات</h2>
              <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <User className="w-3 h-3" />
                <span>{currentUser?.name || 'كاشير'}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500">إدارة الصندوق، السحب والإيداع، وعزل حسابات وورديات المستخدمين</p>
          </div>
        </div>

        {/* أزرار التبديل */}
        <div className="flex gap-1.5 p-1 bg-slate-100 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('current')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
              activeTab === 'current' ? 'bg-white text-purple-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4 text-purple-600" />
            <span>الوردية الحالية</span>
          </button>

          {canViewShiftsHistory && (
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
              activeTab === 'history' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4 text-indigo-600" />
            <span>سجل الورديات ({shiftsHistory?.length || 0})</span>
          </button>
          )}

          {canViewTreasury && (
          <button
            type="button"
            onClick={() => setActiveTab('treasury')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
              activeTab === 'treasury' ? 'bg-white text-emerald-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Landmark className="w-4 h-4 text-emerald-600" />
            <span>خزينة الإدارة والبنك</span>
            {treasurySummary.pendingShifts.length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full animate-pulse">
                {treasurySummary.pendingShifts.length}
              </span>
            )}
          </button>
          )}
        </div>
      </div>


      {/* 1. تبويب الوردية الحالية */}
      {activeTab === 'current' && (
        <CurrentShiftDrawerTab
          treasurySummary={treasurySummary}
          isAdmin={isAdmin}
          setActiveTab={setActiveTab}
        />
      )}

      {/* 2. تبويب سجل الورديات السابقة */}
      {activeTab === 'history' && canViewShiftsHistory && (
        <ShiftsHistoryTab
          isAdmin={isAdmin}
        />
      )}

      {/* 3. تبويب خزينة الإدارة والبنك */}
      {activeTab === 'treasury' && canViewTreasury && (
        <ManagerTreasuryTab
          treasurySummary={treasurySummary}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
};