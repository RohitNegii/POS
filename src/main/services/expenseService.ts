import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';
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
  ListExpensesFilter,
  UpdateExpenseCategoryRequest,
  UpdateExpenseRequest,
} from '../../shared/types/ipc';

export class ExpenseService {
  /**
   * Helper to ensure only Super Admin can access Expense Management.
   */
  private requireSuperAdmin() {
    const session = authService.requireSession();
    if (session.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin has access to Expense Management.');
    }
    return session;
  }

  /**
   * Format Expense Prisma record into ExpenseDto.
   */
  private formatExpenseDto(item: any): ExpenseDto {
    return {
      id: item.id,
      companyId: item.companyId,
      companyName: item.company?.name || undefined,
      companyCode: item.company?.code || undefined,
      categoryId: item.categoryId,
      categoryName: item.category?.name || undefined,
      employeeId: item.employeeId || null,
      employeeName: item.employeeName || item.employee?.name || null,
      amount: item.amount,
      paymentMethod: item.paymentMethod as 'CASH' | 'ONLINE',
      expenseDate: item.expenseDate,
      description: item.description || null,
      receiptPath: item.receiptPath || null,
      createdBy: item.createdBy,
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : String(item.updatedAt),
    };
  }

  /**
   * Formats ExpenseCategory record into ExpenseCategoryDto.
   */
  private formatCategoryDto(cat: any): ExpenseCategoryDto {
    return {
      id: cat.id,
      name: cat.name,
      description: cat.description || null,
      isDefault: Boolean(cat.isDefault),
      createdAt: cat.createdAt instanceof Date ? cat.createdAt.toISOString() : String(cat.createdAt),
      updatedAt: cat.updatedAt instanceof Date ? cat.updatedAt.toISOString() : String(cat.updatedAt),
      expenseCount: cat._count?.expenses ?? undefined,
    };
  }

  /**
   * Calculates the exact, real-time Cash and Online balances for a company
   * based on all operational transactions in the POS:
   * 1. Customer Sales Inflows (active Bills)
   * 2. Vendor Refund Inflows (Purchase Returns)
   * 3. Purchase Outflows (Purchase paid amounts)
   * 4. Expense Outflows (Expenses)
   */
  public async getCompanyBalances(
    txOrPrisma?: Prisma.TransactionClient,
    companyId?: string
  ): Promise<CompanyBalanceDto[]> {
    const prisma = txOrPrisma || getPrismaClient();

    const companies = await prisma.company.findMany({
      where: companyId ? { id: companyId } : undefined,
      orderBy: { code: 'asc' },
    });

    const results: CompanyBalanceDto[] = [];

    for (const comp of companies) {
      // 1. Sales from active bills for this company
      const billItems = await prisma.billItem.findMany({
        where: {
          companyId: comp.id,
          bill: {
            status: { not: 'CANCELLED' },
          },
        },
        select: {
          totalPrice: true,
          bill: {
            select: {
              paymentMethod: true,
            },
          },
        },
      });

      let totalSalesCash = 0;
      let totalSalesOnline = 0;
      for (const item of billItems) {
        const pm = (item.bill?.paymentMethod || '').toUpperCase();
        if (pm === 'CASH') {
          totalSalesCash += item.totalPrice || 0;
        } else if (pm === 'ONLINE' || pm === 'UPI' || pm === 'CARD') {
          totalSalesOnline += item.totalPrice || 0;
        }
      }

      // 2. Purchases paid amounts
      const purchases = await prisma.purchase.findMany({
        where: {
          companyId: comp.id,
        },
        select: {
          totalAmount: true,
          paidAmount: true,
          paymentStatus: true,
          paymentMethod: true,
        },
      });

      let totalPurchasePaymentsCash = 0;
      let totalPurchasePaymentsOnline = 0;
      for (const p of purchases) {
        if (p.paymentMethod === 'NO_PAYMENT' || p.paymentStatus === 'UNPAID') continue;
        let paid = 0;
        if (typeof p.paidAmount === 'number' && p.paidAmount > 0) {
          paid = p.paidAmount;
        } else if (p.paymentStatus === 'PAID') {
          paid = p.totalAmount || 0;
        }

        const pm = (p.paymentMethod || '').toUpperCase();
        if (pm === 'CASH') {
          totalPurchasePaymentsCash += paid;
        } else if (pm === 'ONLINE' || pm === 'UPI' || pm === 'BANK_TRANSFER' || pm === 'CARD') {
          totalPurchasePaymentsOnline += paid;
        }
      }

      // 3. Purchase Returns (Vendor Refunds)
      const returns = await prisma.purchaseReturn.findMany({
        where: {
          companyId: comp.id,
        },
        select: {
          refundType: true,
          refundAmount: true,
        },
      });

      let totalPurchaseReturnsCash = 0;
      let totalPurchaseReturnsOnline = 0;
      for (const r of returns) {
        if (r.refundType === 'CASH') {
          totalPurchaseReturnsCash += r.refundAmount || 0;
        } else if (r.refundType === 'ONLINE') {
          totalPurchaseReturnsOnline += r.refundAmount || 0;
        }
      }

      // 4. Expenses
      const expenses = await prisma.expense.findMany({
        where: {
          companyId: comp.id,
        },
        select: {
          amount: true,
          paymentMethod: true,
        },
      });

      let totalExpenseCash = 0;
      let totalExpenseOnline = 0;
      for (const e of expenses) {
        if (e.paymentMethod === 'CASH') {
          totalExpenseCash += e.amount || 0;
        } else if (e.paymentMethod === 'ONLINE') {
          totalExpenseOnline += e.amount || 0;
        }
      }

      const cashBalance = Math.round(
        (totalSalesCash + totalPurchaseReturnsCash - totalPurchasePaymentsCash - totalExpenseCash) * 100
      ) / 100;

      const onlineBalance = Math.round(
        (totalSalesOnline + totalPurchaseReturnsOnline - totalPurchasePaymentsOnline - totalExpenseOnline) * 100
      ) / 100;

      results.push({
        companyId: comp.id,
        companyName: comp.name,
        companyCode: comp.code,
        cashBalance,
        onlineBalance,
        totalSalesCash: Math.round(totalSalesCash * 100) / 100,
        totalSalesOnline: Math.round(totalSalesOnline * 100) / 100,
        totalPurchaseReturnsCash: Math.round(totalPurchaseReturnsCash * 100) / 100,
        totalPurchaseReturnsOnline: Math.round(totalPurchaseReturnsOnline * 100) / 100,
        totalPurchasePaymentsCash: Math.round(totalPurchasePaymentsCash * 100) / 100,
        totalPurchasePaymentsOnline: Math.round(totalPurchasePaymentsOnline * 100) / 100,
        totalExpenseCash: Math.round(totalExpenseCash * 100) / 100,
        totalExpenseOnline: Math.round(totalExpenseOnline * 100) / 100,
      });
    }

    return results;
  }

  /**
   * Aggregates total Cash and Online expenses for a company and optional date range.
   * Scoped to allow Customer Sales Bills to deduct company operational expenses from gross revenue.
   */
  public async getCompanyExpenseTotals(
    params?: GetCompanyExpenseTotalsParams
  ): Promise<CompanyExpenseTotalsDto> {
    const prisma = getPrismaClient();
    const where: Prisma.ExpenseWhereInput = {};

    if (params?.companyId && params.companyId !== 'ALL') {
      where.companyId = params.companyId;
    }

    if (params?.startDate || params?.endDate) {
      const dateCond: Prisma.StringFilter = {};
      if (params.startDate) {
        dateCond.gte = params.startDate.slice(0, 10);
      }
      if (params.endDate) {
        dateCond.lte = params.endDate.slice(0, 10);
      }
      where.expenseDate = dateCond;
    }

    const expenses = await prisma.expense.findMany({
      where,
      select: {
        amount: true,
        paymentMethod: true,
      },
    });

    let cashExpenses = 0;
    let onlineExpenses = 0;

    for (const e of expenses) {
      if (e.paymentMethod === 'CASH') {
        cashExpenses += e.amount || 0;
      } else if (e.paymentMethod === 'ONLINE') {
        onlineExpenses += e.amount || 0;
      }
    }

    cashExpenses = Math.round(cashExpenses * 100) / 100;
    onlineExpenses = Math.round(onlineExpenses * 100) / 100;
    const totalExpenses = Math.round((cashExpenses + onlineExpenses) * 100) / 100;

    return {
      cashExpenses,
      onlineExpenses,
      totalExpenses,
      count: expenses.length,
    };
  }

  // =========================================================================
  // EXPENSE CATEGORIES CRUD
  // =========================================================================

  public async listExpenseCategories(): Promise<ExpenseCategoryDto[]> {
    this.requireSuperAdmin();
    const prisma = getPrismaClient();

    const categories = await prisma.expenseCategory.findMany({
      include: {
        _count: {
          select: { expenses: true },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return categories.map((c) => this.formatCategoryDto(c));
  }

  public async createExpenseCategory(
    request: CreateExpenseCategoryRequest
  ): Promise<ExpenseCategoryDto> {
    this.requireSuperAdmin();
    const prisma = getPrismaClient();

    const name = (request?.name || '').trim();
    if (!name) {
      throw new Error('Expense category name is required.');
    }

    const existing = await prisma.expenseCategory.findUnique({
      where: { name },
    });
    if (existing) {
      throw new Error(`Expense category "${name}" already exists.`);
    }

    const created = await prisma.expenseCategory.create({
      data: {
        name,
        description: (request.description || '').trim() || null,
        isDefault: false,
      },
    });

    return this.formatCategoryDto(created);
  }

  public async updateExpenseCategory(
    request: UpdateExpenseCategoryRequest
  ): Promise<ExpenseCategoryDto> {
    this.requireSuperAdmin();
    const prisma = getPrismaClient();

    const id = request?.id?.trim();
    const name = (request?.name || '').trim();
    if (!id || !name) {
      throw new Error('Category ID and Name are required.');
    }

    const existing = await prisma.expenseCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Expense category not found.');
    }

    const conflict = await prisma.expenseCategory.findFirst({
      where: {
        name,
        id: { not: id },
      },
    });
    if (conflict) {
      throw new Error(`Another category named "${name}" already exists.`);
    }

    const updated = await prisma.expenseCategory.update({
      where: { id },
      data: {
        name,
        description: (request.description || '').trim() || null,
      },
    });

    return this.formatCategoryDto(updated);
  }

  public async deleteExpenseCategory(id: string): Promise<{ success: boolean; message: string }> {
    this.requireSuperAdmin();
    const prisma = getPrismaClient();

    if (!id) throw new Error('Category ID is required.');

    const category = await prisma.expenseCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { expenses: true },
        },
      },
    });

    if (!category) {
      throw new Error('Expense category not found.');
    }

    if (category.isDefault) {
      throw new Error(`System default category "${category.name}" cannot be deleted.`);
    }

    if (category._count.expenses > 0) {
      throw new Error(
        `Cannot delete category "${category.name}" because it is currently linked to ${category._count.expenses} expense record(s).`
      );
    }

    await prisma.expenseCategory.delete({ where: { id } });
    return { success: true, message: `Category "${category.name}" deleted successfully.` };
  }

  // =========================================================================
  // EMPLOYEES (SHARED BILLING USERS)
  // =========================================================================

  /**
   * Retrieves all registered billing users who serve as employees for salary payouts across companies.
   */
  public async listEmployees(): Promise<BillingUserDto[]> {
    this.requireSuperAdmin();
    const prisma = getPrismaClient();

    const users = await prisma.billingUser.findMany({
      orderBy: { name: 'asc' },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
      updatedAt: u.updatedAt instanceof Date ? u.updatedAt.toISOString() : String(u.updatedAt),
    }));
  }

  // =========================================================================
  // EXPENSES CRUD & FINANCIAL BALANCE ATOMIC TRANSACTIONS
  // =========================================================================

  /**
   * Creates an expense and atomically verifies & deducts the balance.
   */
  public async createExpense(request: CreateExpenseRequest): Promise<ExpenseDto> {
    const session = this.requireSuperAdmin();
    const prisma = getPrismaClient();

    // 1. Validation
    const companyId = request?.companyId?.trim();
    const categoryId = request?.categoryId?.trim();
    const amount = Number(request?.amount);
    const paymentMethod = request?.paymentMethod;
    const expenseDate = (request?.expenseDate || '').trim();

    if (!companyId) throw new Error('Company selection is required.');
    if (!categoryId) throw new Error('Expense Category is required.');
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Expense amount must be a positive number greater than 0.');
    }
    if (paymentMethod !== 'CASH' && paymentMethod !== 'ONLINE') {
      throw new Error('Payment method must be either CASH or ONLINE.');
    }
    if (!expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      throw new Error('Expense date must be a valid date in YYYY-MM-DD format.');
    }

    // 2. Atomic Transaction
    return await prisma.$transaction(async (tx) => {
      // Verify Company
      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) throw new Error('Selected company not found.');

      // Verify Category
      const category = await tx.expenseCategory.findUnique({ where: { id: categoryId } });
      if (!category) throw new Error('Selected expense category not found.');

      // Handle Employee logic (especially for Salary)
      let employeeName = request.employeeName?.trim() || null;
      let employeeId = request.employeeId?.trim() || null;

      if (category.name.toLowerCase() === 'salary') {
        if (!employeeId && !employeeName) {
          throw new Error('Employee selection is required for Salary expenses.');
        }
      }

      if (employeeId) {
        const billingUser = await tx.billingUser.findUnique({ where: { id: employeeId } });
        if (!billingUser) throw new Error('Selected employee (billing user) not found.');
        employeeName = billingUser.name;
      }

      // Check current balances
      const balances = await this.getCompanyBalances(tx, companyId);
      const companyBalance = balances.find((b) => b.companyId === companyId);
      if (!companyBalance) {
        throw new Error('Unable to retrieve company financial balance.');
      }

      const availableBalance =
        paymentMethod === 'CASH' ? companyBalance.cashBalance : companyBalance.onlineBalance;

      if (availableBalance < amount) {
        throw new Error(
          `Insufficient ${paymentMethod} balance for ${company.name}. Available: ₹${availableBalance.toLocaleString(
            'en-IN',
            { minimumFractionDigits: 2 }
          )}, Required: ₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
        );
      }

      // Create Expense
      const expense = await tx.expense.create({
        data: {
          companyId,
          categoryId,
          employeeId,
          employeeName,
          amount,
          paymentMethod,
          expenseDate,
          description: (request.description || '').trim() || null,
          receiptPath: (request.receiptPath || '').trim() || null,
          createdBy: session.adminName || 'Super Admin',
        },
        include: {
          company: true,
          category: true,
          employee: true,
        },
      });

      // Record Auditable Financial Transaction
      const balanceBefore = availableBalance;
      const balanceAfter = Math.round((balanceBefore - amount) * 100) / 100;

      await tx.financialTransaction.create({
        data: {
          companyId,
          type: 'EXPENSE_DEDUCTION',
          expenseId: expense.id,
          paymentMethod,
          amount,
          balanceBefore,
          balanceAfter,
          description: `Expense: ${category.name}${
            employeeName ? ` (${employeeName})` : ''
          } - ₹${amount} via ${paymentMethod}`,
        },
      });

      return this.formatExpenseDto(expense);
    });
  }

  /**
   * Updates an existing expense, reversing previous balance deduction and applying the new one.
   */
  public async updateExpense(request: UpdateExpenseRequest): Promise<ExpenseDto> {
    this.requireSuperAdmin();
    const prisma = getPrismaClient();

    const id = request?.id?.trim();
    if (!id) throw new Error('Expense ID is required for update.');

    const newCompanyId = request?.companyId?.trim();
    const newCategoryId = request?.categoryId?.trim();
    const newAmount = Number(request?.amount);
    const newPaymentMethod = request?.paymentMethod;
    const newExpenseDate = (request?.expenseDate || '').trim();

    if (!newCompanyId) throw new Error('Company selection is required.');
    if (!newCategoryId) throw new Error('Expense Category is required.');
    if (isNaN(newAmount) || newAmount <= 0) {
      throw new Error('Expense amount must be a positive number greater than 0.');
    }
    if (newPaymentMethod !== 'CASH' && newPaymentMethod !== 'ONLINE') {
      throw new Error('Payment method must be either CASH or ONLINE.');
    }
    if (!newExpenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(newExpenseDate)) {
      throw new Error('Expense date must be a valid date in YYYY-MM-DD format.');
    }

    return await prisma.$transaction(async (tx) => {
      const existing = await tx.expense.findUnique({
        where: { id },
        include: { category: true, company: true },
      });
      if (!existing) throw new Error('Expense not found.');

      // Verify new company & category
      const targetCompany = await tx.company.findUnique({ where: { id: newCompanyId } });
      if (!targetCompany) throw new Error('Selected target company not found.');

      const targetCategory = await tx.expenseCategory.findUnique({ where: { id: newCategoryId } });
      if (!targetCategory) throw new Error('Selected target category not found.');

      // Employee logic
      let employeeName = request.employeeName?.trim() || null;
      let employeeId = request.employeeId?.trim() || null;

      if (targetCategory.name.toLowerCase() === 'salary') {
        if (!employeeId && !employeeName) {
          throw new Error('Employee selection is required for Salary expenses.');
        }
      }

      if (employeeId) {
        const billingUser = await tx.billingUser.findUnique({ where: { id: employeeId } });
        if (!billingUser) throw new Error('Selected employee (billing user) not found.');
        employeeName = billingUser.name;
      }

      // Check balance availability:
      // Notice: `existing.amount` is currently deducted. If we reverse it, the available balance increases by `existing.amount` (if same company & payment method).
      const currentBalances = await this.getCompanyBalances(tx, newCompanyId);
      const companyBalance = currentBalances.find((b) => b.companyId === newCompanyId);
      if (!companyBalance) throw new Error('Unable to check company financial balance.');

      let availableBalance =
        newPaymentMethod === 'CASH' ? companyBalance.cashBalance : companyBalance.onlineBalance;

      // If updating the same company and same payment method, the previous amount is credited back
      if (existing.companyId === newCompanyId && existing.paymentMethod === newPaymentMethod) {
        availableBalance = Math.round((availableBalance + existing.amount) * 100) / 100;
      }

      if (availableBalance < newAmount) {
        throw new Error(
          `Insufficient ${newPaymentMethod} balance for ${targetCompany.name}. Available: ₹${availableBalance.toLocaleString(
            'en-IN',
            { minimumFractionDigits: 2 }
          )}, Required: ₹${newAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
        );
      }

      // Audit Reversal Record for the old deduction
      await tx.financialTransaction.create({
        data: {
          companyId: existing.companyId,
          type: 'EXPENSE_REVERSAL',
          expenseId: existing.id,
          paymentMethod: existing.paymentMethod,
          amount: existing.amount,
          balanceBefore:
            existing.paymentMethod === 'CASH'
              ? companyBalance.cashBalance
              : companyBalance.onlineBalance,
          balanceAfter:
            existing.paymentMethod === 'CASH'
              ? companyBalance.cashBalance + existing.amount
              : companyBalance.onlineBalance + existing.amount,
          description: `Adjustment Reversal for Expense #${existing.id} prior to update`,
        },
      });

      // Update Expense
      const updated = await tx.expense.update({
        where: { id },
        data: {
          companyId: newCompanyId,
          categoryId: newCategoryId,
          employeeId,
          employeeName,
          amount: newAmount,
          paymentMethod: newPaymentMethod,
          expenseDate: newExpenseDate,
          description: (request.description || '').trim() || null,
          receiptPath: (request.receiptPath || '').trim() || null,
        },
        include: {
          company: true,
          category: true,
          employee: true,
        },
      });

      // New Financial Transaction Deduction
      const newBalanceBefore = availableBalance;
      const newBalanceAfter = Math.round((newBalanceBefore - newAmount) * 100) / 100;

      await tx.financialTransaction.create({
        data: {
          companyId: newCompanyId,
          type: 'EXPENSE_DEDUCTION',
          expenseId: updated.id,
          paymentMethod: newPaymentMethod,
          amount: newAmount,
          balanceBefore: newBalanceBefore,
          balanceAfter: newBalanceAfter,
          description: `Updated Expense: ${targetCategory.name}${
            employeeName ? ` (${employeeName})` : ''
          } - ₹${newAmount} via ${newPaymentMethod}`,
        },
      });

      return this.formatExpenseDto(updated);
    });
  }

  /**
   * Deletes an expense, reversing the balance deduction and restoring funds to the company.
   */
  public async deleteExpense(id: string): Promise<{ success: boolean; message: string }> {
    this.requireSuperAdmin();
    const prisma = getPrismaClient();

    if (!id?.trim()) throw new Error('Expense ID is required.');

    return await prisma.$transaction(async (tx) => {
      const existing = await tx.expense.findUnique({
        where: { id },
        include: { company: true, category: true },
      });
      if (!existing) throw new Error('Expense not found.');

      // Check current balances
      const balances = await this.getCompanyBalances(tx, existing.companyId);
      const companyBalance = balances.find((b) => b.companyId === existing.companyId);

      const balanceBefore = companyBalance
        ? existing.paymentMethod === 'CASH'
          ? companyBalance.cashBalance
          : companyBalance.onlineBalance
        : 0;
      const balanceAfter = Math.round((balanceBefore + existing.amount) * 100) / 100;

      // Log reversal audit trail
      await tx.financialTransaction.create({
        data: {
          companyId: existing.companyId,
          type: 'EXPENSE_REVERSAL',
          expenseId: existing.id,
          paymentMethod: existing.paymentMethod,
          amount: existing.amount,
          balanceBefore,
          balanceAfter,
          description: `Full Reversal & Deletion of Expense #${existing.id} (${existing.category.name}) - Restored ₹${existing.amount} to ${existing.paymentMethod}`,
        },
      });

      // Delete the expense
      await tx.expense.delete({ where: { id } });

      return {
        success: true,
        message: `Expense deleted successfully and ₹${existing.amount.toLocaleString('en-IN', {
          minimumFractionDigits: 2,
        })} restored to ${existing.company.name} ${existing.paymentMethod} balance.`,
      };
    });
  }

  /**
   * Retrieves single expense by ID.
   */
  public async getExpenseById(id: string): Promise<ExpenseDto> {
    this.requireSuperAdmin();
    const prisma = getPrismaClient();

    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        company: true,
        category: true,
        employee: true,
      },
    });

    if (!expense) throw new Error('Expense record not found.');
    return this.formatExpenseDto(expense);
  }

  /**
   * Lists expenses with pagination, search, and comprehensive filters.
   */
  public async listExpenses(filter: ListExpensesFilter = {}): Promise<ExpensesListResponse> {
    this.requireSuperAdmin();
    const prisma = getPrismaClient();

    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.max(1, Math.min(500, Number(filter.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseWhereInput = {};

    if (filter.companyId) {
      where.companyId = filter.companyId;
    }

    if (filter.categoryId) {
      where.categoryId = filter.categoryId;
    }

    if (filter.employeeId) {
      where.employeeId = filter.employeeId;
    }

    if (filter.paymentMethod) {
      where.paymentMethod = filter.paymentMethod;
    }

    if (filter.startDate || filter.endDate) {
      where.expenseDate = {};
      if (filter.startDate) {
        where.expenseDate.gte = filter.startDate;
      }
      if (filter.endDate) {
        where.expenseDate.lte = filter.endDate;
      }
    }

    if (filter.search?.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { description: { contains: q } },
        { employeeName: { contains: q } },
        { category: { name: { contains: q } } },
        { company: { name: { contains: q } } },
      ];
    }

    let orderBy: Prisma.ExpenseOrderByWithRelationInput = { expenseDate: 'desc' };
    if (filter.sortBy === 'amount') {
      orderBy = { amount: filter.sortOrder === 'asc' ? 'asc' : 'desc' };
    } else if (filter.sortBy === 'createdAt') {
      orderBy = { createdAt: filter.sortOrder === 'asc' ? 'asc' : 'desc' };
    } else if (filter.sortBy === 'expenseDate') {
      orderBy = { expenseDate: filter.sortOrder === 'asc' ? 'asc' : 'desc' };
    }

    const [total, expenses] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        include: {
          company: true,
          category: true,
          employee: true,
        },
        orderBy: [orderBy, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      expenses: expenses.map((e) => this.formatExpenseDto(e)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Generates summary analytics and multi-dimensional breakdowns for reports & dashboard cards.
   */
  public async getExpenseSummary(filter: ListExpensesFilter = {}): Promise<ExpenseSummaryDto> {
    this.requireSuperAdmin();
    const prisma = getPrismaClient();

    const where: Prisma.ExpenseWhereInput = {};
    if (filter.companyId) where.companyId = filter.companyId;
    if (filter.categoryId) where.categoryId = filter.categoryId;
    if (filter.employeeId) where.employeeId = filter.employeeId;
    if (filter.paymentMethod) where.paymentMethod = filter.paymentMethod;

    if (filter.startDate || filter.endDate) {
      where.expenseDate = {};
      if (filter.startDate) where.expenseDate.gte = filter.startDate;
      if (filter.endDate) where.expenseDate.lte = filter.endDate;
    }

    if (filter.search?.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { description: { contains: q } },
        { employeeName: { contains: q } },
        { category: { name: { contains: q } } },
        { company: { name: { contains: q } } },
      ];
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        company: true,
        category: true,
        employee: true,
      },
      orderBy: { expenseDate: 'asc' },
    });

    let totalExpenses = 0;
    let totalCashExpenses = 0;
    let totalOnlineExpenses = 0;
    let totalSalaryExpenses = 0;

    const categoryMap = new Map<string, { categoryId: string; categoryName: string; totalAmount: number; count: number }>();
    const companyMap = new Map<string, { companyId: string; companyName: string; companyCode: string; totalAmount: number; cashAmount: number; onlineAmount: number }>();
    const employeeMap = new Map<string, { employeeId: string; employeeName: string; totalAmount: number; count: number }>();
    const dateMap = new Map<string, { date: string; totalAmount: number; cashAmount: number; onlineAmount: number }>();

    for (const exp of expenses) {
      const amt = exp.amount || 0;
      totalExpenses += amt;

      if (exp.paymentMethod === 'CASH') {
        totalCashExpenses += amt;
      } else if (exp.paymentMethod === 'ONLINE') {
        totalOnlineExpenses += amt;
      }

      if (exp.category?.name.toLowerCase() === 'salary') {
        totalSalaryExpenses += amt;
      }

      // Category breakdown
      const catId = exp.categoryId;
      const catName = exp.category?.name || 'Unknown';
      const existingCat = categoryMap.get(catId) || {
        categoryId: catId,
        categoryName: catName,
        totalAmount: 0,
        count: 0,
      };
      existingCat.totalAmount += amt;
      existingCat.count += 1;
      categoryMap.set(catId, existingCat);

      // Company breakdown
      const cId = exp.companyId;
      const cName = exp.company?.name || 'Unknown';
      const cCode = exp.company?.code || '';
      const existingComp = companyMap.get(cId) || {
        companyId: cId,
        companyName: cName,
        companyCode: cCode,
        totalAmount: 0,
        cashAmount: 0,
        onlineAmount: 0,
      };
      existingComp.totalAmount += amt;
      if (exp.paymentMethod === 'CASH') {
        existingComp.cashAmount += amt;
      } else {
        existingComp.onlineAmount += amt;
      }
      companyMap.set(cId, existingComp);

      // Employee breakdown (for salary or any employee tagged expense)
      if (exp.employeeName || exp.employeeId) {
        const empKey = exp.employeeId || exp.employeeName || 'unknown';
        const empName = exp.employeeName || exp.employee?.name || 'Unknown Employee';
        const existingEmp = employeeMap.get(empKey) || {
          employeeId: exp.employeeId || empKey,
          employeeName: empName,
          totalAmount: 0,
          count: 0,
        };
        existingEmp.totalAmount += amt;
        existingEmp.count += 1;
        employeeMap.set(empKey, existingEmp);
      }

      // Date breakdown
      const dt = exp.expenseDate;
      const existingDate = dateMap.get(dt) || {
        date: dt,
        totalAmount: 0,
        cashAmount: 0,
        onlineAmount: 0,
      };
      existingDate.totalAmount += amt;
      if (exp.paymentMethod === 'CASH') {
        existingDate.cashAmount += amt;
      } else {
        existingDate.onlineAmount += amt;
      }
      dateMap.set(dt, existingDate);
    }

    return {
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalCashExpenses: Math.round(totalCashExpenses * 100) / 100,
      totalOnlineExpenses: Math.round(totalOnlineExpenses * 100) / 100,
      totalSalaryExpenses: Math.round(totalSalaryExpenses * 100) / 100,
      count: expenses.length,
      categoryBreakdown: Array.from(categoryMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
      companyBreakdown: Array.from(companyMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
      employeeBreakdown: Array.from(employeeMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
      dateBreakdown: Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date)),
    };
  }
}

export const expenseService = new ExpenseService();
