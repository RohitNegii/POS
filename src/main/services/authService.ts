import { verifyPassword } from '../auth/password';
import { getPrismaClient } from '../database/prisma';

export interface AuthenticatedSession {
  adminId: string;
  companyId: string;
  role: string;
  adminName: string;
  email: string;
  companyName: string;
  companyCode: string;
  loginTime: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthSessionPayload {
  adminId: string;
  companyId: string;
  role: string;
  adminName: string;
  email: string;
  companyName: string;
  companyCode: string;
  loginTime: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Authentication Service — Phase 2 Company Admin Authentication & Isolation.
 *
 * Enforces company-scoped authentication and strict data isolation:
 * - Single source of truth for company context is the authenticated session in the Main Process.
 * - Passwords are verified exclusively in Main Process using scrypt.
 * - PasswordHash is NEVER stored in session or sent to renderer.
 * - Authenticated admin's companyId determines company context; renderer cannot specify or switch companies.
 */
export class AuthService {
  private activeSession: AuthenticatedSession | null = null;

  /**
   * Authenticates an admin user by email and password.
   * On success, establishes the in-memory session bound to the admin's companyId.
   */
  public async login(credentials: LoginCredentials): Promise<AuthSessionPayload> {
    if (!credentials || typeof credentials !== 'object') {
      throw new Error('Invalid email or password.');
    }

    const email = typeof credentials.email === 'string' ? credentials.email.trim().toLowerCase() : '';
    const password = typeof credentials.password === 'string' ? credentials.password : '';

    if (!email || !EMAIL_REGEX.test(email) || !password || password.length < 1 || password.length > 128) {
      // Return generic error without exposing specifics
      throw new Error('Invalid email or password.');
    }

    const prisma = getPrismaClient();

    // Query admin users by normalized email
    const candidates = await prisma.adminUser.findMany({
      where: { email },
      include: {
        company: true,
      },
    });

    if (candidates.length === 0) {
      // Do not reveal whether the email exists
      throw new Error('Invalid email or password.');
    }

    // Verify password against candidates
    let authenticatedUser: (typeof candidates)[0] | null = null;
    for (const candidate of candidates) {
      const isMatch = verifyPassword(password, candidate.passwordHash);
      if (isMatch) {
        authenticatedUser = candidate;
        break;
      }
    }

    if (!authenticatedUser) {
      throw new Error('Invalid email or password.');
    }

    // Check account status
    if (!authenticatedUser.isActive) {
      throw new Error('Account is inactive. Please contact support.');
    }

    if (!authenticatedUser.company) {
      throw new Error('Associated company not found. Please contact support.');
    }

    // Establish secure in-memory authenticated session in Main Process
    this.activeSession = {
      adminId: authenticatedUser.id,
      companyId: authenticatedUser.company.id,
      role: authenticatedUser.role,
      adminName: authenticatedUser.name,
      email: authenticatedUser.email,
      companyName: authenticatedUser.company.name,
      companyCode: authenticatedUser.company.code,
      loginTime: new Date().toISOString(),
    };

    return { ...this.activeSession };
  }

  /**
   * Terminates the current authenticated session.
   */
  public async logout(): Promise<void> {
    this.activeSession = null;
  }

  /**
   * Returns the current authenticated session or null if unauthenticated.
   */
  public getSession(): AuthSessionPayload | null {
    if (!this.activeSession) {
      return null;
    }
    return { ...this.activeSession };
  }

  /**
   * Guard method: returns the current session or throws an authorization error.
   */
  public requireSession(): AuthenticatedSession {
    if (!this.activeSession) {
      throw new Error('Unauthorized: No active authenticated session.');
    }
    return { ...this.activeSession };
  }

  /**
   * Returns the authenticated companyId from the session.
   * This is the single source of truth for all future company-scoped data queries.
   */
  public getAuthenticatedCompanyId(): string {
    return this.requireSession().companyId;
  }

  /**
   * Tests a protected operation to verify that:
   * 1. Unauthenticated calls are rejected.
   * 2. Authenticated calls receive data scoped exclusively to the session's companyId.
   */
  public async testProtectedOperation(): Promise<{
    message: string;
    companyId: string;
    companyName: string;
    adminName: string;
  }> {
    const session = this.requireSession();
    return {
      message: `Protected operation authorized for ${session.companyName}`,
      companyId: session.companyId,
      companyName: session.companyName,
      adminName: session.adminName,
    };
  }
}

export const authService = new AuthService();
