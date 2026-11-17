import { useCallback, useEffect, useState } from 'react';
import type {
  BillingUserDto,
  CompanyBalanceDto,
  CreateExpenseCategoryRequest,
  CreateExpenseRequest,
  ExpenseCategoryDto,
  ExpenseDto,
  ExpenseSummaryDto,
  ListExpensesFilter,
  UpdateExpenseCategoryRequest,
  UpdateExpenseRequest,
} from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';

export function useExpenses() {
  const [expenses, setExpenses] = useState<ExpenseDto[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<ExpenseCategoryDto[]>([]);
  const [employees, setEmployees] = useState<BillingUserDto[]>([]);
  const [balances, setBalances] = useState<CompanyBalanceDto[]>([]);
  const [summary, setSummary] = useState<ExpenseSummaryDto | null>(null);

  const [filter, setFilter] = useState<ListExpensesFilter>({
    page: 1,
    limit: 20,
    sortBy: 'expenseDate',
    sortOrder: 'desc',
  });

  const fetchBalances = useCallback(async () => {
    try {
      const res = await ipcClient.getCompanyBalances();
      if (res.success) {
        setBalances(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch company balances:', err);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await ipcClient.listExpenseCategories();
      if (res.success) {
        setCategories(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch expense categories:', err);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await ipcClient.listBillingUsers();
      if (res.success) {
        setEmployees(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch billing users / employees:', err);
    }
  }, []);

  const fetchExpenses = useCallback(
    async (currentFilter: ListExpensesFilter = filter) => {
      setLoading(true);
      setError(null);
      try {
        const [listRes, summaryRes] = await Promise.all([
          ipcClient.listExpenses(currentFilter),
          ipcClient.getExpenseSummary(currentFilter),
        ]);

        if (listRes.success) {
          setExpenses(listRes.data.expenses);
          setTotalCount(listRes.data.total);
          setPage(listRes.data.page);
          setLimit(listRes.data.limit);
          setTotalPages(listRes.data.totalPages);
        } else {
          setError(listRes.error);
        }

        if (summaryRes.success) {
          setSummary(summaryRes.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error fetching expense records.');
      } finally {
        setLoading(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    void fetchBalances();
    void fetchCategories();
    void fetchEmployees();
  }, [fetchBalances, fetchCategories, fetchEmployees]);

  useEffect(() => {
    void fetchExpenses(filter);
  }, [filter, fetchExpenses]);

  const createExpense = async (request: CreateExpenseRequest) => {
    const res = await ipcClient.createExpense(request);
    if (res.success) {
      await Promise.all([fetchExpenses(filter), fetchBalances(), fetchCategories()]);
    }
    return res;
  };

  const updateExpense = async (request: UpdateExpenseRequest) => {
    const res = await ipcClient.updateExpense(request);
    if (res.success) {
      await Promise.all([fetchExpenses(filter), fetchBalances(), fetchCategories()]);
    }
    return res;
  };

  const deleteExpense = async (id: string) => {
    const res = await ipcClient.deleteExpense(id);
    if (res.success) {
      await Promise.all([fetchExpenses(filter), fetchBalances(), fetchCategories()]);
    }
    return res;
  };

  const createCategory = async (request: CreateExpenseCategoryRequest) => {
    const res = await ipcClient.createExpenseCategory(request);
    if (res.success) {
      await fetchCategories();
    }
    return res;
  };

  const updateCategory = async (request: UpdateExpenseCategoryRequest) => {
    const res = await ipcClient.updateExpenseCategory(request);
    if (res.success) {
      await fetchCategories();
    }
    return res;
  };

  const deleteCategory = async (id: string) => {
    const res = await ipcClient.deleteExpenseCategory(id);
    if (res.success) {
      await fetchCategories();
    }
    return res;
  };

  return {
    expenses,
    totalCount,
    page,
    limit,
    totalPages,
    loading,
    error,
    categories,
    employees,
    balances,
    summary,
    filter,
    setFilter,
    refreshExpenses: () => fetchExpenses(filter),
    refreshBalances: fetchBalances,
    refreshCategories: fetchCategories,
    refreshEmployees: fetchEmployees,
    createExpense,
    updateExpense,
    deleteExpense,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
