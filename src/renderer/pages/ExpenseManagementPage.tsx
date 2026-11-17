import React, { useMemo, useState } from 'react';
import type {
  AuthSessionPayload,
  CreateExpenseRequest,
  ExpenseCategoryDto,
  ExpenseDto,
  UpdateExpenseRequest,
} from '../../shared/types/ipc';
import { useToast } from '../context/ToastContext';
import { useExpenses } from '../hooks/useExpenses';

interface ExpenseManagementPageProps {
  session: AuthSessionPayload;
}

type ExpenseTab = 'dashboard' | 'list' | 'categories';

export const ExpenseManagementPage: React.FC<ExpenseManagementPageProps> = ({ session: _session }) => {
  const { showSuccess, showError } = useToast();
  const {
    expenses,
    totalCount,
    page,
    totalPages,
    loading,
    categories,
    employees,
    balances,
    summary,
    filter,
    setFilter,
    createExpense,
    updateExpense,
    deleteExpense,
    createCategory,
    updateCategory,
    deleteCategory,
    refreshExpenses,
    refreshBalances,
  } = useExpenses();

  const [activeTab, setActiveTab] = useState<ExpenseTab>('dashboard');

  // Add / Edit Expense Modal State
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isEditingExpense, setIsEditingExpense] = useState(false);
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Form State for Adding / Editing Expense
  const [expenseForm, setExpenseForm] = useState<{
    id?: string;
    companyId: string;
    categoryId: string;
    employeeId: string;
    amount: string;
    paymentMethod: 'CASH' | 'ONLINE';
    expenseDate: string;
    description: string;
    receiptPath: string;
  }>({
    companyId: '',
    categoryId: '',
    employeeId: '',
    amount: '',
    paymentMethod: 'CASH',
    expenseDate: new Date().toISOString().slice(0, 10),
    description: '',
    receiptPath: '',
  });

  // Details & Delete Modals
  const [viewingExpense, setViewingExpense] = useState<ExpenseDto | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<ExpenseDto | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // Category Modal State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategoryDto | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });
  const [submittingCategory, setSubmittingCategory] = useState(false);

  // Selected company balance helper
  const selectedCompanyBalance = useMemo(() => {
    if (!expenseForm.companyId) return null;
    return balances.find((b) => b.companyId === expenseForm.companyId) || null;
  }, [balances, expenseForm.companyId]);

  const availableCurrentBalance = useMemo(() => {
    if (!selectedCompanyBalance) return 0;
    return expenseForm.paymentMethod === 'CASH'
      ? selectedCompanyBalance.cashBalance
      : selectedCompanyBalance.onlineBalance;
  }, [selectedCompanyBalance, expenseForm.paymentMethod]);

  const parsedAmount = parseFloat(expenseForm.amount) || 0;
  const isInsufficientBalance = parsedAmount > 0 && parsedAmount > availableCurrentBalance;

  // Selected category helper
  const selectedCategory = useMemo(() => {
    return categories.find((c) => c.id === expenseForm.categoryId) || null;
  }, [categories, expenseForm.categoryId]);

  const isSalaryCategory = selectedCategory?.name.toLowerCase() === 'salary';

  // Filter category helper for conditional employee filter in All Expenses
  const selectedFilterCategory = useMemo(() => {
    return categories.find((c) => c.id === filter.categoryId) || null;
  }, [categories, filter.categoryId]);

  const isFilterSalaryCategory = selectedFilterCategory?.name.toLowerCase() === 'salary';

  // Set default company when balances load
  React.useEffect(() => {
    if (balances.length > 0 && !expenseForm.companyId) {
      setExpenseForm((prev) => ({
        ...prev,
        companyId: balances[0].companyId,
      }));
    }
  }, [balances]);

  // Open Add Expense Modal
  const handleOpenAddModal = () => {
    setIsEditingExpense(false);
    setExpenseForm({
      companyId: balances[0]?.companyId || '',
      categoryId: categories[0]?.id || '',
      employeeId: '',
      amount: '',
      paymentMethod: 'CASH',
      expenseDate: new Date().toISOString().slice(0, 10),
      description: '',
      receiptPath: '',
    });
    setIsExpenseModalOpen(true);
  };

  // Open Edit Expense Modal
  const handleOpenEditModal = (exp: ExpenseDto) => {
    setIsEditingExpense(true);
    setExpenseForm({
      id: exp.id,
      companyId: exp.companyId,
      categoryId: exp.categoryId,
      employeeId: exp.employeeId || '',
      amount: String(exp.amount),
      paymentMethod: exp.paymentMethod,
      expenseDate: exp.expenseDate,
      description: exp.description || '',
      receiptPath: exp.receiptPath || '',
    });
    setIsExpenseModalOpen(true);
  };

  // Validate form and prompt confirmation
  const handleExpenseFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.companyId) {
      showError('Please select a company.');
      return;
    }
    if (!expenseForm.categoryId) {
      showError('Please select an expense category.');
      return;
    }
    if (isSalaryCategory && !expenseForm.employeeId) {
      showError('Please select an employee (billing user) for Salary expense.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showError('Please enter a valid expense amount greater than 0.');
      return;
    }

    if (!isEditingExpense && isInsufficientBalance) {
      showError(
        `Insufficient ${expenseForm.paymentMethod} balance. Available: ₹${availableCurrentBalance.toLocaleString(
          'en-IN'
        )}, Required: ₹${parsedAmount.toLocaleString('en-IN')}`
      );
      return;
    }

    // Immediately close the Record New Expense modal and present the confirmation step
    setIsExpenseModalOpen(false);
    setShowConfirmModal(true);
  };

  // Process Confirm Submit (Atomic Transaction)
  const handleConfirmSaveExpense = async () => {
    setSubmittingExpense(true);
    try {
      const selectedEmp = employees.find((e) => e.id === expenseForm.employeeId);

      if (isEditingExpense && expenseForm.id) {
        const payload: UpdateExpenseRequest = {
          id: expenseForm.id,
          companyId: expenseForm.companyId,
          categoryId: expenseForm.categoryId,
          employeeId: expenseForm.employeeId || undefined,
          employeeName: selectedEmp?.name || undefined,
          amount: parsedAmount,
          paymentMethod: expenseForm.paymentMethod,
          expenseDate: expenseForm.expenseDate,
          description: expenseForm.description.trim() || undefined,
          receiptPath: expenseForm.receiptPath.trim() || undefined,
        };
        const res = await updateExpense(payload);
        if (res.success) {
          showSuccess('Expense updated and balances adjusted successfully.');
          setShowConfirmModal(false);
          setIsExpenseModalOpen(false);
        } else {
          showError(res.error || 'Failed to update expense.');
          setShowConfirmModal(false);
          setIsExpenseModalOpen(true);
        }
      } else {
        const payload: CreateExpenseRequest = {
          companyId: expenseForm.companyId,
          categoryId: expenseForm.categoryId,
          employeeId: expenseForm.employeeId || undefined,
          employeeName: selectedEmp?.name || undefined,
          amount: parsedAmount,
          paymentMethod: expenseForm.paymentMethod,
          expenseDate: expenseForm.expenseDate,
          description: expenseForm.description.trim() || undefined,
          receiptPath: expenseForm.receiptPath.trim() || undefined,
        };
        const res = await createExpense(payload);
        if (res.success) {
          showSuccess(
            `Expense of ₹${parsedAmount.toLocaleString('en-IN')} recorded & deducted from ${
              expenseForm.paymentMethod
            } balance.`
          );
          setShowConfirmModal(false);
          setIsExpenseModalOpen(false);
          // Reset form to defaults
          setExpenseForm({
            companyId: balances[0]?.companyId || '',
            categoryId: categories[0]?.id || '',
            employeeId: '',
            amount: '',
            paymentMethod: 'CASH',
            expenseDate: new Date().toISOString().slice(0, 10),
            description: '',
            receiptPath: '',
          });
        } else {
          showError(res.error || 'Failed to record expense.');
          setShowConfirmModal(false);
          setIsExpenseModalOpen(true);
        }
      }
    } catch {
      showError('Unexpected error saving expense.');
      setShowConfirmModal(false);
      setIsExpenseModalOpen(true);
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Process Delete Expense
  const handleConfirmDeleteExpense = async () => {
    if (!deletingExpense) return;
    setSubmittingDelete(true);
    try {
      const res = await deleteExpense(deletingExpense.id);
      if (res.success) {
        showSuccess(res.data.message || 'Expense deleted & balance restored successfully.');
        setDeletingExpense(null);
      } else {
        showError(res.error || 'Failed to delete expense.');
      }
    } catch {
      showError('Error deleting expense.');
    } finally {
      setSubmittingDelete(false);
    }
  };

  // Category Save
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = categoryForm.name.trim();
    if (!name) {
      showError('Please enter category name.');
      return;
    }
    setSubmittingCategory(true);
    try {
      if (editingCategory) {
        const res = await updateCategory({
          id: editingCategory.id,
          name,
          description: categoryForm.description.trim() || undefined,
        });
        if (res.success) {
          showSuccess(`Category "${res.data.name}" updated successfully.`);
          setShowCategoryModal(false);
        } else {
          showError(res.error || 'Failed to update category.');
        }
      } else {
        const res = await createCategory({
          name,
          description: categoryForm.description.trim() || undefined,
        });
        if (res.success) {
          showSuccess(`Category "${res.data.name}" created successfully.`);
          setShowCategoryModal(false);
        } else {
          showError(res.error || 'Failed to create category.');
        }
      }
    } catch {
      showError('Error saving category.');
    } finally {
      setSubmittingCategory(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-cream-50 text-stone-900">
      {/* ========================================================================= */}
      {/* TOP BANNER & HEADER */}
      {/* ========================================================================= */}
      <div className="border-b border-cream-300 bg-white/80 px-6 py-4 shadow-sm shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-white shadow-md shadow-purple-600/20">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-stone-900">Expense Management</h1>
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                  Super Admin
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Company-isolated financial expenses • Atomic Cash & Online balance deduction
              </p>
            </div>
          </div>

          {/* Quick Real-Time Company Balances Pill Badges & Record Expense CTA */}
          <div className="flex flex-wrap items-center gap-3">
            {balances.map((b) => (
              <div
                key={b.companyId}
                className="flex items-center gap-2 rounded-2xl border border-cream-300 bg-cream-50/90 px-3.5 py-1.5 shadow-sm"
              >
                <div>
                  <div className="text-[10px] font-bold text-stone-700 uppercase tracking-wider">
                    {b.companyName}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                    <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[11px]">
                      Cash: ₹{b.cashBalance.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                    <span className="font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-[11px]">
                      Online: ₹{b.onlineBalance.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={() => {
                void refreshBalances();
                void refreshExpenses();
              }}
              title="Refresh Real-Time Balances"
              className="p-2 rounded-xl border border-cream-300 hover:bg-cream-200 text-stone-600 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>

            {/* Primary Action Button: Opens Add Expense Modal */}
            <button
              onClick={handleOpenAddModal}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-600/20 transition flex items-center gap-2 active:scale-95"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>Record Expense</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation Menu (Clean 3-Tab Bar) */}
        <div className="flex items-center gap-2 mt-4 border-t border-cream-200/80 pt-3">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition flex items-center gap-2 ${
              activeTab === 'dashboard'
                ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/20'
                : 'text-stone-600 hover:bg-cream-200/70 hover:text-stone-900'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
            Expense Dashboard
          </button>

          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition flex items-center gap-2 ${
              activeTab === 'list'
                ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/20'
                : 'text-stone-600 hover:bg-cream-200/70 hover:text-stone-900'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            All Expenses ({totalCount})
          </button>

          <button
            onClick={() => setActiveTab('categories')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition flex items-center gap-2 ${
              activeTab === 'categories'
                ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/20'
                : 'text-stone-600 hover:bg-cream-200/70 hover:text-stone-900'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
              />
            </svg>
            Expense Categories ({categories.length})
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MAIN VIEW CONTENT */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        {/* ========================================================================= */}
        {/* TAB 1: DASHBOARD */}
        {/* ========================================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Expenses */}
              <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Total Expenses</span>
                  <div className="h-9 w-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                    ₹
                  </div>
                </div>
                <div className="mt-3 text-2xl font-extrabold text-stone-900">
                  ₹{summary?.totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
                </div>
                <div className="mt-1 text-xs text-stone-500">{summary?.count || 0} recorded transaction(s)</div>
              </div>

              {/* Cash Expenses */}
              <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Cash Outflow</span>
                  <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                  </div>
                </div>
                <div className="mt-3 text-2xl font-extrabold text-emerald-700">
                  ₹{summary?.totalCashExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
                </div>
                <div className="mt-1 text-xs text-emerald-600 font-medium">Deducted from Cash Register</div>
              </div>

              {/* Online Expenses */}
              <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Online / Bank Outflow</span>
                  <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                      />
                    </svg>
                  </div>
                </div>
                <div className="mt-3 text-2xl font-extrabold text-blue-700">
                  ₹{summary?.totalOnlineExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
                </div>
                <div className="mt-1 text-xs text-blue-600 font-medium">Deducted from Bank / UPI</div>
              </div>

              {/* Salary Expenses */}
              <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Salary Compensation</span>
                  <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                </div>
                <div className="mt-3 text-2xl font-extrabold text-amber-700">
                  ₹{summary?.totalSalaryExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
                </div>
                <div className="mt-1 text-xs text-stone-500">Staff / Billing Users Payout</div>
              </div>
            </div>

            {/* Recent Expenses Quick Table */}
            <div className="rounded-2xl border border-cream-300 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-stone-900">Recent Expense Deductions</h2>
                  <p className="text-xs text-stone-500">Latest company outflows with balance impact</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleOpenAddModal}
                    className="text-xs font-bold text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-200 transition"
                  >
                    + Record Expense
                  </button>
                  <button
                    onClick={() => setActiveTab('list')}
                    className="text-xs font-semibold text-stone-600 hover:text-stone-900"
                  >
                    View All →
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-cream-200 text-stone-500 font-bold uppercase tracking-wider text-[11px]">
                      <th className="pb-3">Date</th>
                      <th className="pb-3">Company</th>
                      <th className="pb-3">Category</th>
                      <th className="pb-3">Staff / Payee</th>
                      <th className="pb-3">Payment</th>
                      <th className="pb-3 text-right">Amount</th>
                      <th className="pb-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-100">
                    {expenses.slice(0, 5).map((exp) => (
                      <tr key={exp.id} className="hover:bg-cream-50/80 transition">
                        <td className="py-3 font-medium text-stone-900 whitespace-nowrap">{exp.expenseDate}</td>
                        <td className="py-3">
                          <span className="font-semibold text-stone-800">{exp.companyName}</span>
                        </td>
                        <td className="py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            {exp.categoryName}
                          </span>
                        </td>
                        <td className="py-3 text-stone-600">{exp.employeeName || '—'}</td>
                        <td className="py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              exp.paymentMethod === 'CASH'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {exp.paymentMethod}
                          </span>
                        </td>
                        <td className="py-3 text-right font-bold text-stone-900 whitespace-nowrap">
                          ₹{exp.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 text-center">
                          <button
                            onClick={() => setViewingExpense(exp)}
                            className="text-xs font-semibold text-purple-600 hover:text-purple-800"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                    {expenses.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-stone-400">
                          No expense records found. Click <strong>Record Expense</strong> to get started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ALL EXPENSES TABLE */}
        {/* ========================================================================= */}
        {activeTab === 'list' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Filter Bar */}
            <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3 border-b border-cream-200 pb-3">
                <div className="text-xs font-bold uppercase tracking-wider text-stone-700">
                  Search & Filters
                </div>
                <button
                  onClick={handleOpenAddModal}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Record Expense</span>
                </button>
              </div>

              <div
                className={`grid gap-3 min-w-0 ${
                  isFilterSalaryCategory
                    ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6'
                    : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
                }`}
              >
                {/* 1. Company Filter */}
                <div className="min-w-0">
                  <label className="block text-[11px] font-bold uppercase text-stone-500 mb-1">Company</label>
                  <select
                    value={filter.companyId || ''}
                    onChange={(e) =>
                      setFilter((prev) => ({
                        ...prev,
                        companyId: e.target.value || undefined,
                        page: 1,
                      }))
                    }
                    className="w-full rounded-xl border border-cream-300 px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  >
                    <option value="">All Companies</option>
                    {balances.map((c) => (
                      <option key={c.companyId} value={c.companyId}>
                        {c.companyName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Category Filter */}
                <div className="min-w-0">
                  <label className="block text-[11px] font-bold uppercase text-stone-500 mb-1">Category</label>
                  <select
                    value={filter.categoryId || ''}
                    onChange={(e) => {
                      const newCatId = e.target.value;
                      const cat = categories.find((c) => c.id === newCatId);
                      const isSalary = cat?.name.toLowerCase() === 'salary';
                      setFilter((prev) => ({
                        ...prev,
                        categoryId: newCatId || undefined,
                        employeeId: isSalary ? prev.employeeId : undefined,
                        page: 1,
                      }));
                    }}
                    className="w-full rounded-xl border border-cream-300 px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  >
                    <option value="">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Employee / Staff Filter (Visible ONLY when Salary category is selected) */}
                {isFilterSalaryCategory && (
                  <div className="min-w-0 animate-in fade-in duration-150">
                    <label className="block text-[11px] font-bold uppercase text-stone-500 mb-1">
                      Billing User / Staff
                    </label>
                    <select
                      value={filter.employeeId || ''}
                      onChange={(e) =>
                        setFilter((prev) => ({
                          ...prev,
                          employeeId: e.target.value || undefined,
                          page: 1,
                        }))
                      }
                      className="w-full rounded-xl border border-amber-300 bg-amber-50/40 px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 font-medium"
                    >
                      <option value="">All Staff Members</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 4. Payment Method Filter */}
                <div className="min-w-0">
                  <label className="block text-[11px] font-bold uppercase text-stone-500 mb-1">Payment Method</label>
                  <select
                    value={filter.paymentMethod || ''}
                    onChange={(e) =>
                      setFilter((prev) => ({
                        ...prev,
                        paymentMethod: (e.target.value as any) || undefined,
                        page: 1,
                      }))
                    }
                    className="w-full rounded-xl border border-cream-300 px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  >
                    <option value="">All Methods</option>
                    <option value="CASH">CASH</option>
                    <option value="ONLINE">ONLINE</option>
                  </select>
                </div>

                {/* 5. From Date */}
                <div className="min-w-0">
                  <label className="block text-[11px] font-bold uppercase text-stone-500 mb-1">From Date</label>
                  <input
                    type="date"
                    value={filter.startDate || ''}
                    onChange={(e) =>
                      setFilter((prev) => ({ ...prev, startDate: e.target.value || undefined, page: 1 }))
                    }
                    className="w-full rounded-xl border border-cream-300 px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>

                {/* 6. To Date */}
                <div className="min-w-0">
                  <label className="block text-[11px] font-bold uppercase text-stone-500 mb-1">To Date</label>
                  <input
                    type="date"
                    value={filter.endDate || ''}
                    onChange={(e) =>
                      setFilter((prev) => ({ ...prev, endDate: e.target.value || undefined, page: 1 }))
                    }
                    className="w-full rounded-xl border border-cream-300 px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
              </div>

              {/* Clear filters & Count */}
              <div className="mt-3 pt-3 border-t border-cream-200/80 flex items-center justify-between text-xs">
                <span className="text-stone-500 font-medium">
                  Showing <strong>{expenses.length}</strong> of <strong>{totalCount}</strong> records
                </span>
                <button
                  onClick={() =>
                    setFilter({
                      page: 1,
                      limit: 20,
                      sortBy: 'expenseDate',
                      sortOrder: 'desc',
                    })
                  }
                  className="text-stone-500 hover:text-stone-800 font-semibold"
                >
                  Reset All Filters
                </button>
              </div>
            </div>

            {/* Expenses Data Table */}
            <div className="rounded-2xl border border-cream-300 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-cream-100/60 border-b border-cream-200 text-stone-600 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-5 py-3.5">ID</th>
                      <th className="px-5 py-3.5">Company</th>
                      <th className="px-5 py-3.5">Date</th>
                      <th className="px-5 py-3.5">Category</th>
                      <th className="px-5 py-3.5">Employee / Payee</th>
                      <th className="px-5 py-3.5">Payment</th>
                      <th className="px-5 py-3.5 text-right">Amount</th>
                      <th className="px-5 py-3.5">Description</th>
                      <th className="px-5 py-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-100">
                    {expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-cream-50/70 transition">
                        <td className="px-5 py-3.5 font-mono text-[11px] text-stone-500">
                          #{exp.id.slice(-6).toUpperCase()}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-stone-900">{exp.companyName}</div>
                          <div className="text-[10px] text-stone-400">{exp.companyCode}</div>
                        </td>
                        <td className="px-5 py-3.5 font-medium text-stone-800 whitespace-nowrap">
                          {exp.expenseDate}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            {exp.categoryName}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-medium text-stone-800">
                          {exp.employeeName ? (
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-amber-500" />
                              <span>{exp.employeeName}</span>
                            </div>
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${
                              exp.paymentMethod === 'CASH'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {exp.paymentMethod}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-extrabold text-stone-900 text-sm whitespace-nowrap">
                          ₹{exp.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-5 py-3.5 text-stone-600 max-w-xs truncate" title={exp.description || ''}>
                          {exp.description || <span className="text-stone-300">None</span>}
                        </td>
                        <td className="px-5 py-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* View */}
                            <button
                              onClick={() => setViewingExpense(exp)}
                              title="View Expense Details"
                              className="p-1.5 rounded-lg border border-cream-200 hover:bg-cream-100 text-stone-600 transition"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            {/* Edit (Opens Modal) */}
                            <button
                              onClick={() => handleOpenEditModal(exp)}
                              title="Edit Expense"
                              className="p-1.5 rounded-lg border border-cream-200 hover:bg-cream-100 text-purple-600 transition"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            {/* Delete */}
                            <button
                              onClick={() => setDeletingExpense(exp)}
                              title="Delete & Restore Balance"
                              className="p-1.5 rounded-lg border border-cream-200 hover:bg-red-50 text-red-600 transition"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {expenses.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-stone-400">
                          {loading ? 'Loading expenses...' : 'No expenses match the specified filters.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-cream-200 px-6 py-4 bg-cream-50/50">
                  <div className="text-xs text-stone-500">
                    Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setFilter((prev) => ({ ...prev, page: Math.max(1, (prev.page || 1) - 1) }))}
                      className="px-3 py-1.5 rounded-lg border border-cream-300 text-xs font-semibold text-stone-700 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() =>
                        setFilter((prev) => ({ ...prev, page: Math.min(totalPages, (prev.page || 1) + 1) }))
                      }
                      className="px-3 py-1.5 rounded-lg border border-cream-300 text-xs font-semibold text-stone-700 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: EXPENSE CATEGORIES */}
        {/* ========================================================================= */}
        {activeTab === 'categories' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-900">Expense Categories Master</h2>
                <p className="text-xs text-stone-500">
                  Default and custom expense classifications for company financial tracking.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingCategory(null);
                  setCategoryForm({ name: '', description: '' });
                  setShowCategoryModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold text-xs shadow-sm shadow-purple-600/20 hover:bg-purple-700 transition flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Category
              </button>
            </div>

            <div className="rounded-2xl border border-cream-300 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-cream-100/60 border-b border-cream-200 text-stone-600 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-6 py-4">Category Name</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Linked Expenses</th>
                    <th className="px-6 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {categories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-cream-50/70 transition">
                      <td className="px-6 py-4 font-bold text-stone-900">{cat.name}</td>
                      <td className="px-6 py-4 text-stone-600">{cat.description || '—'}</td>
                      <td className="px-6 py-4">
                        {cat.isDefault ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-stone-100 text-stone-700 border border-stone-200">
                            System Default
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            Custom
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-semibold text-stone-700">
                        {cat.expenseCount ?? 0} transaction(s)
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setEditingCategory(cat);
                              setCategoryForm({ name: cat.name, description: cat.description || '' });
                              setShowCategoryModal(true);
                            }}
                            className="p-1.5 rounded-lg border border-cream-200 hover:bg-cream-100 text-purple-600"
                            title="Edit Category"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          {!cat.isDefault && (
                            <button
                              onClick={async () => {
                                if (
                                  confirm(
                                    `Are you sure you want to delete custom category "${cat.name}"?`
                                  )
                                ) {
                                  const res = await deleteCategory(cat.id);
                                  if (res.success) {
                                    showSuccess(`Category "${cat.name}" deleted.`);
                                  } else {
                                    showError(res.error || 'Failed to delete category.');
                                  }
                                }
                              }}
                              className="p-1.5 rounded-lg border border-cream-200 hover:bg-red-50 text-red-600"
                              title="Delete Category"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT EXPENSE (NEW MODAL DIALOG) */}
      {/* ========================================================================= */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-cream-300 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4 bg-cream-50/50">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-stone-900">
                    {isEditingExpense ? 'Edit Expense Record' : 'Record New Expense'}
                  </h2>
                  <p className="text-[11px] text-stone-500">
                    Amount will automatically be deducted from the selected company's balance.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-cream-200/60 transition"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body / Scrollable Form */}
            <form onSubmit={handleExpenseFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* 1. Company Selection */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                  1. Select Company <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {balances.map((comp) => {
                    const isSelected = expenseForm.companyId === comp.companyId;
                    return (
                      <div
                        key={comp.companyId}
                        onClick={() =>
                          setExpenseForm((prev) => ({
                            ...prev,
                            companyId: comp.companyId,
                          }))
                        }
                        className={`cursor-pointer rounded-xl border p-3.5 transition ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-600/20'
                            : 'border-cream-300 bg-white hover:border-purple-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-stone-900">{comp.companyName}</span>
                          <span className="text-[10px] font-bold uppercase bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded">
                            {comp.companyCode}
                          </span>
                        </div>
                        <div className="mt-2 pt-2 border-t border-cream-200/80 flex items-center justify-between text-[11px]">
                          <span className="text-stone-600">
                            Cash: <strong className="text-emerald-700">₹{comp.cashBalance.toLocaleString('en-IN')}</strong>
                          </span>
                          <span className="text-stone-600">
                            Online: <strong className="text-blue-700">₹{comp.onlineBalance.toLocaleString('en-IN')}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Expense Category */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-700">
                    2. Expense Category <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory(null);
                      setCategoryForm({ name: '', description: '' });
                      setShowCategoryModal(true);
                    }}
                    className="text-xs font-semibold text-purple-600 hover:text-purple-800"
                  >
                    + Custom Category
                  </button>
                </div>
                <select
                  value={expenseForm.categoryId}
                  onChange={(e) =>
                    setExpenseForm((prev) => ({
                      ...prev,
                      categoryId: e.target.value,
                      employeeId: '',
                    }))
                  }
                  required
                  className="w-full rounded-xl border border-cream-300 bg-white px-3.5 py-2.5 text-sm font-medium text-stone-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                >
                  <option value="" disabled>
                    Select an expense category
                  </option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} {cat.isDefault ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Employee Selection (Using Billing Users, Shared Across Both Companies) */}
              {isSalaryCategory && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-amber-900">
                      Staff / Employee Selection (Billing User) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-amber-800 font-medium">
                      Shared across both companies
                    </span>
                  </div>
                  <select
                    value={expenseForm.employeeId}
                    onChange={(e) => setExpenseForm((prev) => ({ ...prev, employeeId: e.target.value }))}
                    required={isSalaryCategory}
                    className="w-full rounded-xl border border-amber-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  >
                    <option value="">Select billing user / employee...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-stone-500">
                    Staff members are managed under <strong>Administration → Billing Users</strong>.
                  </p>
                </div>
              )}

              {/* 4. Payment Method & Live Available Balance */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-700">
                  3. Payment Method & Source Drawer <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExpenseForm((prev) => ({ ...prev, paymentMethod: 'CASH' }))}
                    className={`flex flex-col items-center justify-center rounded-xl border p-3 transition ${
                      expenseForm.paymentMethod === 'CASH'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-600/20'
                        : 'border-cream-300 bg-white text-stone-600 hover:border-emerald-300'
                    }`}
                  >
                    <span className="text-xs font-bold uppercase">CASH PAYMENT</span>
                    <span className="text-xs mt-0.5 text-emerald-700 font-bold">
                      Available: ₹{selectedCompanyBalance?.cashBalance.toLocaleString('en-IN') || '0.00'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExpenseForm((prev) => ({ ...prev, paymentMethod: 'ONLINE' }))}
                    className={`flex flex-col items-center justify-center rounded-xl border p-3 transition ${
                      expenseForm.paymentMethod === 'ONLINE'
                        ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-600/20'
                        : 'border-cream-300 bg-white text-stone-600 hover:border-blue-300'
                    }`}
                  >
                    <span className="text-xs font-bold uppercase">ONLINE / UPI / BANK</span>
                    <span className="text-xs mt-0.5 text-blue-700 font-bold">
                      Available: ₹{selectedCompanyBalance?.onlineBalance.toLocaleString('en-IN') || '0.00'}
                    </span>
                  </button>
                </div>
              </div>

              {/* 5. Expense Amount */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-700">
                    4. Expense Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <span className="text-xs font-medium text-stone-500">
                    Available {expenseForm.paymentMethod}:{' '}
                    <strong className="text-stone-800">
                      ₹{availableCurrentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </strong>
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-base">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                    required
                    className={`w-full rounded-xl border pl-8 pr-4 py-2.5 text-base font-bold text-stone-900 focus:outline-none focus:ring-2 ${
                      isInsufficientBalance && !isEditingExpense
                        ? 'border-red-400 bg-red-50/50 focus:ring-red-500/20'
                        : 'border-cream-300 bg-white focus:border-purple-500 focus:ring-purple-500/20'
                    }`}
                  />
                </div>

                {/* Insufficient Balance Alert */}
                {isInsufficientBalance && !isEditingExpense && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                    <svg className="h-4 w-4 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>
                      <strong>Insufficient Funds:</strong> Required ₹{parsedAmount.toLocaleString('en-IN')} exceeds available{' '}
                      {expenseForm.paymentMethod} balance of ₹{availableCurrentBalance.toLocaleString('en-IN')}.
                    </span>
                  </div>
                )}
              </div>

              {/* 6. Date & Receipt No */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                    Expense Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={expenseForm.expenseDate}
                    onChange={(e) => setExpenseForm((prev) => ({ ...prev, expenseDate: e.target.value }))}
                    required
                    className="w-full rounded-xl border border-cream-300 bg-white px-3.5 py-2 text-xs font-medium text-stone-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                    Receipt / Bill Ref (Optional)
                  </label>
                  <input
                    type="text"
                    value={expenseForm.receiptPath}
                    onChange={(e) => setExpenseForm((prev) => ({ ...prev, receiptPath: e.target.value }))}
                    placeholder="e.g. EB-2026-9901 or Voucher #12"
                    className="w-full rounded-xl border border-cream-300 bg-white px-3.5 py-2 text-xs text-stone-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
              </div>

              {/* 7. Description / Remarks */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                  Remarks / Description
                </label>
                <textarea
                  rows={2}
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter operational reason or notes for this expense..."
                  className="w-full rounded-xl border border-cream-300 bg-white p-3 text-xs text-stone-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              {/* Modal Footer Controls */}
              <div className="pt-4 border-t border-cream-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-cream-300 text-xs font-semibold text-stone-600 hover:bg-cream-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isInsufficientBalance && !isEditingExpense}
                  className={`px-6 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition flex items-center gap-2 ${
                    isInsufficientBalance && !isEditingExpense
                      ? 'bg-stone-300 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20'
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {isEditingExpense ? 'Review & Update Expense' : 'Review & Deduct Balance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONFIRMATION MODAL BEFORE SAVING / DEDUCTING EXPENSE */}
      {/* ========================================================================= */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-cream-300 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-purple-700 mb-4">
              <div className="h-10 w-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  {isEditingExpense ? 'Confirm Financial Adjustment' : 'Confirm Expense Deduction'}
                </h3>
                <p className="text-xs text-stone-500">
                  Please review the balance impact before proceeding.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-cream-200 bg-cream-50 p-4 space-y-2 text-xs mb-5">
              <div className="flex justify-between">
                <span className="text-stone-500">Target Company:</span>
                <span className="font-bold text-stone-900">{selectedCompanyBalance?.companyName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Category:</span>
                <span className="font-bold text-stone-900">{selectedCategory?.name}</span>
              </div>
              {isSalaryCategory && (
                <div className="flex justify-between">
                  <span className="text-stone-500">Staff / Employee:</span>
                  <span className="font-bold text-amber-700">
                    {employees.find((e) => e.id === expenseForm.employeeId)?.name}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-stone-500">Payment Channel:</span>
                <span className="font-bold text-stone-900">{expenseForm.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Expense Amount:</span>
                <span className="font-extrabold text-red-600 text-sm">
                  - ₹{parsedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="pt-2 border-t border-cream-200 flex justify-between font-bold">
                <span className="text-stone-700">Current Balance:</span>
                <span className="text-stone-900">
                  ₹{availableCurrentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-stone-700">Projected Balance:</span>
                <span className="text-emerald-700">
                  ₹{Math.max(0, availableCurrentBalance - parsedAmount).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  setIsExpenseModalOpen(false);
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-500 hover:text-stone-800 hover:bg-cream-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  setIsExpenseModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl border border-cream-300 text-xs font-semibold text-stone-700 hover:bg-cream-100 transition"
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={handleConfirmSaveExpense}
                disabled={submittingExpense}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-600/20 transition flex items-center gap-2"
              >
                {submittingExpense && (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                {isEditingExpense ? 'Confirm & Adjust' : 'Confirm & Deduct Balance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DELETE CONFIRMATION MODAL (WITH BALANCE RESTORATION NOTICE) */}
      {/* ========================================================================= */}
      {deletingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-red-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">Delete Expense & Restore Balance</h3>
                <p className="text-xs text-stone-500">Reversal of financial transaction</p>
              </div>
            </div>

            <p className="text-xs text-stone-600 mb-4">
              Are you sure you want to delete Expense #{deletingExpense.id.slice(-6).toUpperCase()} (
              <strong>{deletingExpense.categoryName}</strong>)?
            </p>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-1.5 text-xs mb-5">
              <div className="font-bold text-emerald-800">Automatic Balance Restoration:</div>
              <div className="text-emerald-700">
                ₹{deletingExpense.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} will be credited
                back to <strong>{deletingExpense.companyName}</strong> {deletingExpense.paymentMethod} balance.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingExpense(null)}
                className="px-4 py-2 rounded-xl border border-cream-300 text-xs font-semibold text-stone-600 hover:bg-cream-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteExpense}
                disabled={submittingDelete}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-600/20 transition flex items-center gap-2"
              >
                {submittingDelete && (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                Delete & Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW EXPENSE DETAILS MODAL */}
      {/* ========================================================================= */}
      {viewingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-cream-300">
            <div className="flex items-center justify-between border-b border-cream-200 pb-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Expense Details #{viewingExpense.id.slice(-8).toUpperCase()}
                </h3>
                <p className="text-xs text-stone-500">Audited Financial Record</p>
              </div>
              <button
                onClick={() => setViewingExpense(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-cream-50 border border-cream-200">
                <div>
                  <span className="text-stone-500">Company:</span>
                  <div className="font-bold text-stone-900 text-sm">{viewingExpense.companyName}</div>
                </div>
                <div>
                  <span className="text-stone-500">Expense Date:</span>
                  <div className="font-bold text-stone-900 text-sm">{viewingExpense.expenseDate}</div>
                </div>
                <div>
                  <span className="text-stone-500">Category:</span>
                  <div className="font-bold text-purple-700 text-sm">{viewingExpense.categoryName}</div>
                </div>
                <div>
                  <span className="text-stone-500">Payment Method:</span>
                  <div className="font-bold text-stone-900 text-sm">{viewingExpense.paymentMethod}</div>
                </div>
              </div>

              {viewingExpense.employeeName && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="text-amber-800 font-semibold">Attributed Employee / Staff:</span>
                  <div className="font-bold text-stone-900 text-sm mt-0.5">{viewingExpense.employeeName}</div>
                </div>
              )}

              <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 flex justify-between items-center">
                <span className="font-bold text-purple-900">Deducted Amount:</span>
                <span className="text-xl font-extrabold text-purple-900">
                  ₹{viewingExpense.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {viewingExpense.description && (
                <div>
                  <span className="text-stone-500 font-semibold">Remarks & Description:</span>
                  <div className="mt-1 p-3 rounded-xl bg-cream-50 border border-cream-200 text-stone-800">
                    {viewingExpense.description}
                  </div>
                </div>
              )}

              {viewingExpense.receiptPath && (
                <div>
                  <span className="text-stone-500 font-semibold">Receipt / Reference Voucher:</span>
                  <div className="mt-1 font-mono text-stone-800">{viewingExpense.receiptPath}</div>
                </div>
              )}

              <div className="pt-2 border-t border-cream-200 text-[11px] text-stone-400 flex justify-between">
                <span>Created by: {viewingExpense.createdBy}</span>
                <span>Recorded: {new Date(viewingExpense.createdAt).toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setViewingExpense(null)}
                className="px-5 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CATEGORY ADD / EDIT MODAL */}
      {/* ========================================================================= */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-cream-300">
            <h3 className="text-base font-bold text-stone-900 mb-1">
              {editingCategory ? 'Edit Expense Category' : 'Create Custom Expense Category'}
            </h3>
            <p className="text-xs text-stone-500 mb-4">
              Organize expense records across companies with custom classifications.
            </p>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-stone-700 mb-1">
                  Category Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                  placeholder="e.g. Legal Fees, Marketing"
                  className="w-full rounded-xl border border-cream-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-stone-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional details..."
                  className="w-full rounded-xl border border-cream-300 p-2.5 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-cream-200">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 rounded-xl border border-cream-300 text-xs font-semibold text-stone-600 hover:bg-cream-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCategory}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-600/20"
                >
                  {submittingCategory ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
