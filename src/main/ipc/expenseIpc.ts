import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type {
  BillingUserDto,
  CompanyBalanceDto,
  CompanyExpenseTotalsDto,
  CreateExpenseCategoryRequest,
  CreateExpenseRequest,
  ExpenseCategoryDto,
  ExpenseDto,
  ExpensesListResponse,
  ExpenseSummaryDto,
  GetCompanyExpenseTotalsParams,
  IpcResult,
  ListExpensesFilter,
  UpdateExpenseCategoryRequest,
  UpdateExpenseRequest,
} from '../../shared/types/ipc';
import { expenseService } from '../services/expenseService';

/**
 * Registers IPC handlers for Expense Management, Categories, Employees, and Financial Balances.
 */
export function registerExpenseIpcHandlers(): void {
  // 1. List Expenses
  ipcMain.removeHandler(IPC_CHANNELS.EXPENSE_LIST);
  ipcMain.handle(
    IPC_CHANNELS.EXPENSE_LIST,
    async (_event, filter?: ListExpensesFilter): Promise<IpcResult<ExpensesListResponse>> => {
      try {
        const result = await expenseService.listExpenses(filter);
        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list expenses.';
        return { success: false, error: message };
      }
    }
  );

  // 2. Get Expense by ID
  ipcMain.removeHandler(IPC_CHANNELS.EXPENSE_GET_BY_ID);
  ipcMain.handle(
    IPC_CHANNELS.EXPENSE_GET_BY_ID,
    async (_event, id: string): Promise<IpcResult<ExpenseDto>> => {
      try {
        const expense = await expenseService.getExpenseById(id);
        return { success: true, data: expense };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get expense.';
        return { success: false, error: message };
      }
    }
  );

  // 3. Create Expense (With atomic balance deduction)
  ipcMain.removeHandler(IPC_CHANNELS.EXPENSE_CREATE);
  ipcMain.handle(
    IPC_CHANNELS.EXPENSE_CREATE,
    async (_event, request: CreateExpenseRequest): Promise<IpcResult<ExpenseDto>> => {
      try {
        const created = await expenseService.createExpense(request);
        return { success: true, data: created };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create expense.';
        return { success: false, error: message };
      }
    }
  );

  // 4. Update Expense (With balance reversal & adjustment)
  ipcMain.removeHandler(IPC_CHANNELS.EXPENSE_UPDATE);
  ipcMain.handle(
    IPC_CHANNELS.EXPENSE_UPDATE,
    async (_event, request: UpdateExpenseRequest): Promise<IpcResult<ExpenseDto>> => {
      try {
        const updated = await expenseService.updateExpense(request);
        return { success: true, data: updated };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update expense.';
        return { success: false, error: message };
      }
    }
  );

  // 5. Delete Expense (With balance restoration)
  ipcMain.removeHandler(IPC_CHANNELS.EXPENSE_DELETE);
  ipcMain.handle(
    IPC_CHANNELS.EXPENSE_DELETE,
    async (_event, id: string): Promise<IpcResult<{ message: string }>> => {
      try {
        const result = await expenseService.deleteExpense(id);
        return { success: true, data: { message: result.message } };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete expense.';
        return { success: false, error: message };
      }
    }
  );

  // 6. Get Expense Summary & Reports
  ipcMain.removeHandler(IPC_CHANNELS.EXPENSE_GET_SUMMARY);
  ipcMain.handle(
    IPC_CHANNELS.EXPENSE_GET_SUMMARY,
    async (_event, filter?: ListExpensesFilter): Promise<IpcResult<ExpenseSummaryDto>> => {
      try {
        const summary = await expenseService.getExpenseSummary(filter);
        return { success: true, data: summary };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get expense summary.';
        return { success: false, error: message };
      }
    }
  );

  // 7. Get Company Balances
  ipcMain.removeHandler(IPC_CHANNELS.EXPENSE_GET_COMPANY_BALANCES);
  ipcMain.handle(
    IPC_CHANNELS.EXPENSE_GET_COMPANY_BALANCES,
    async (_event, companyId?: string): Promise<IpcResult<CompanyBalanceDto[]>> => {
      try {
        const balances = await expenseService.getCompanyBalances(undefined, companyId);
        return { success: true, data: balances };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get company balances.';
        return { success: false, error: message };
      }
    }
  );

  // 7b. Get Company Expense Totals (Used by Customer Sales Bills & Reconciliation)
  ipcMain.removeHandler(IPC_CHANNELS.EXPENSE_GET_COMPANY_TOTALS);
  ipcMain.handle(
    IPC_CHANNELS.EXPENSE_GET_COMPANY_TOTALS,
    async (
      _event,
      params?: GetCompanyExpenseTotalsParams
    ): Promise<IpcResult<CompanyExpenseTotalsDto>> => {
      try {
        const totals = await expenseService.getCompanyExpenseTotals(params);
        return { success: true, data: totals };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to get company expense totals.';
        return { success: false, error: message };
      }
    }
  );

  // 8. List Expense Categories
  ipcMain.removeHandler(IPC_CHANNELS.EXPENSE_CATEGORY_LIST);
  ipcMain.handle(
    IPC_CHANNELS.EXPENSE_CATEGORY_LIST,
    async (): Promise<IpcResult<ExpenseCategoryDto[]>> => {
      try {
        const categories = await expenseService.listExpenseCategories();
        return { success: true, data: categories };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list expense categories.';
        return { success: false, error: message };
      }
    }
  );

  // 9. Create Expense Category
  ipcMain.removeHandler(IPC_CHANNELS.EXPENSE_CATEGORY_CREATE);
  ipcMain.handle(
    IPC_CHANNELS.EXPENSE_CATEGORY_CREATE,
    async (_event, request: CreateExpenseCategoryRequest): Promise<IpcResult<ExpenseCategoryDto>> => {
      try {
        const created = await expenseService.createExpenseCategory(request);
        return { success: true, data: created };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create expense category.';
        return { success: false, error: message };
      }
    }
  );

  // 10. Update Expense Category
  ipcMain.removeHandler(IPC_CHANNELS.EXPENSE_CATEGORY_UPDATE);
  ipcMain.handle(
    IPC_CHANNELS.EXPENSE_CATEGORY_UPDATE,
    async (_event, request: UpdateExpenseCategoryRequest): Promise<IpcResult<ExpenseCategoryDto>> => {
      try {
        const updated = await expenseService.updateExpenseCategory(request);
        return { success: true, data: updated };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update expense category.';
        return { success: false, error: message };
      }
    }
  );

  // 11. Delete Expense Category
  ipcMain.removeHandler(IPC_CHANNELS.EXPENSE_CATEGORY_DELETE);
  ipcMain.handle(
    IPC_CHANNELS.EXPENSE_CATEGORY_DELETE,
    async (_event, id: string): Promise<IpcResult<{ message: string }>> => {
      try {
        const result = await expenseService.deleteExpenseCategory(id);
        return { success: true, data: { message: result.message } };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete expense category.';
        return { success: false, error: message };
      }
    }
  );

  // 12. List Employees (Shared Billing Users)
  ipcMain.removeHandler(IPC_CHANNELS.EMPLOYEE_LIST);
  ipcMain.handle(
    IPC_CHANNELS.EMPLOYEE_LIST,
    async (): Promise<IpcResult<BillingUserDto[]>> => {
      try {
        const employees = await expenseService.listEmployees();
        return { success: true, data: employees };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list employees.';
        return { success: false, error: message };
      }
    }
  );
}
