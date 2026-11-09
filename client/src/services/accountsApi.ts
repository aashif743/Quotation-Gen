import { api } from './api';

export type AccountType = 'bank' | 'mobile' | 'cash' | 'petty_cash';

export interface MoneyAccount {
  id: number;
  company_id: number;
  name: string;
  type: AccountType;
  type_name: string;
  bank_name?: string | null;
  branch?: string | null;
  account_number?: string | null;
  opening_balance: number;
  opening_date?: string | null;
  is_active: number;
  notes?: string | null;
  total_in: number;
  total_out: number;
  balance: number;
}

/** An account offered in a picker. `balance` is only sent to admins. */
export interface AccountOption {
  id: number;
  name: string;
  type: AccountType;
  type_name: string;
  bank_name?: string | null;
  account_number?: string | null;
  method: string | null;
  balance?: number;
}

export interface LedgerLine {
  date: string;
  dir: 'in' | 'out';
  amount: number;
  source: 'payment' | 'vendor_payment' | 'expense' | 'donation' | 'payroll' | 'transaction' | 'petty_cash';
  source_id: number | null;
  number: string | null;
  description: string;
  reference: string | null;
  balance: number;
}

export interface AccountLedger {
  account: MoneyAccount;
  company: any;
  from: string | null;
  to: string | null;
  balance: number;
  opening: number;
  total_in: number;
  total_out: number;
  closing: number;
  lines: LedgerLine[];
}

export type AccountTxnKind = 'transfer' | 'deposit' | 'withdrawal';

export interface AccountTxnInput {
  company_id: number;
  kind: AccountTxnKind;
  from_account_id?: number | null;
  to_account_id?: number | null;
  amount: number;
  date: string;
  category?: string;
  reference?: string;
  notes?: string;
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  bank: 'Bank account',
  mobile: 'Mobile money',
  cash: 'Cash',
  petty_cash: 'Petty cash',
};

export const getAccountOptions = async (companyId: number, includePetty = false): Promise<AccountOption[]> =>
  (await api.get('/accounts/options', { params: { company_id: companyId, ...(includePetty ? { include_petty: 1 } : {}) } })).data;

export const getAccounts = async (companyId: number): Promise<MoneyAccount[]> =>
  (await api.get('/accounts', { params: { company_id: companyId } })).data;

export const createAccount = async (data: Partial<MoneyAccount> & { company_id: number }): Promise<MoneyAccount> =>
  (await api.post('/accounts', data)).data;

export const updateAccount = async (id: number, data: Partial<MoneyAccount>): Promise<MoneyAccount> =>
  (await api.put(`/accounts/${id}`, data)).data;

export const deleteAccount = async (id: number): Promise<void> => {
  await api.delete(`/accounts/${id}`);
};

export const getAccountLedger = async (id: number, params: { from?: string; to?: string } = {}): Promise<AccountLedger> =>
  (await api.get(`/accounts/${id}/ledger`, { params })).data;

export const createAccountTxn = async (data: AccountTxnInput) =>
  (await api.post('/account-transactions', data)).data;

export const getAccountTxn = async (id: number) =>
  (await api.get(`/account-transactions/${id}`)).data;

export const updateAccountTxn = async (id: number, data: AccountTxnInput) =>
  (await api.put(`/account-transactions/${id}`, data)).data;

export const deleteAccountTxn = async (id: number): Promise<void> => {
  await api.delete(`/account-transactions/${id}`);
};
