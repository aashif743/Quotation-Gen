import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import * as api from '../services/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  canManageAttendance: boolean;
  /** Staff salaries & pay slips (admins not restricted from payroll). */
  canAccessPayroll: boolean;
  /** Audit log (super-admins, and users granted it e.g. MD / Co-MD). */
  canViewAudit: boolean;
  actingOrganization: { id: number; name: string } | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Sign in to the public read-only demo. */
  loginDemo: () => Promise<void>;
  /** Signed in to the public demo (read-only). */
  isDemo: boolean;
  /** Record / edit / delete invoice and vendor payments. */
  canHandlePayments: boolean;
  /** Delivery notes. */
  canUseDeliveryNotes: boolean;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  /** Replace the cached user after the user edits their own profile. */
  setCurrentUser: (u: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const status = await api.checkAuthStatus();
      setIsAuthenticated(status.isAuthenticated);
      setUser(status.user);
    } catch (error) {
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const userData = await api.login(email, password);
    setUser(userData);
    setIsAuthenticated(true);
  };

  const loginDemo = async () => {
    const userData = await api.demoLogin();
    setUser(userData);
    setIsAuthenticated(true);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isAdmin: user?.role === 'admin',
        isSuperAdmin: !!user?.is_super_admin,
        // Admins always have attendance access; staff only if explicitly granted.
        canManageAttendance: user?.role === 'admin' || !!user?.can_manage_attendance,
        // Older servers don't send the flag: fall back to "admins can".
        canAccessPayroll: user?.role === 'admin' && user?.can_access_payroll !== false,
        canViewAudit: !!user?.is_super_admin || !!user?.can_view_audit,
        actingOrganization: user?.acting_organization || null,
        isLoading,
        login,
        loginDemo,
        isDemo: !!user?.is_demo,
        canHandlePayments: user?.can_handle_payments !== false,
        canUseDeliveryNotes: user?.can_use_delivery_notes !== false,
        logout,
        checkAuth,
        setCurrentUser: setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
