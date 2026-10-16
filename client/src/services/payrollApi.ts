import { api } from './api';
import {
  PayrollSettings, PayeBand, PayrollEmployee, EmployeeSalaryUpdate, PayslipList, Payslip,
  PayslipUpdate, PayrollSummary,
} from '../types/payroll';

// Payroll API (admin only). Mounted at /api/payroll on the server.

export const getPayrollSettings = async (companyId: number): Promise<PayrollSettings> =>
  (await api.get('/payroll/settings', { params: { company_id: companyId } })).data;

export const updatePayrollSettings = async (data: {
  company_id: number; paye_bands: PayeBand[]; pension_employee_percent: number; pension_employer_percent: number;
}): Promise<PayrollSettings> => (await api.put('/payroll/settings', data)).data;

export const getPayrollEmployees = async (companyId: number): Promise<PayrollEmployee[]> =>
  (await api.get('/payroll/employees', { params: { company_id: companyId } })).data;

export const updatePayrollEmployee = async (id: number, data: EmployeeSalaryUpdate): Promise<PayrollEmployee> =>
  (await api.put(`/payroll/employees/${id}`, data)).data;

export const getPayslips = async (companyId: number, period: string): Promise<PayslipList> =>
  (await api.get('/payroll/payslips', { params: { company_id: companyId, period } })).data;

export const generatePayslips = async (companyId: number, period: string):
  Promise<{ created: number; skipped: number; working_days?: number; message?: string }> =>
  (await api.post('/payroll/payslips/generate', { company_id: companyId, period })).data;

export const getPayslip = async (id: number): Promise<Payslip> =>
  (await api.get(`/payroll/payslips/${id}`)).data;

export const updatePayslip = async (id: number, data: PayslipUpdate): Promise<Payslip> =>
  (await api.put(`/payroll/payslips/${id}`, data)).data;

export const setPayslipStatus = async (
  id: number, data: { status: 'paid' | 'draft'; payment_date?: string; payment_method?: string },
): Promise<Payslip> => (await api.patch(`/payroll/payslips/${id}/status`, data)).data;

export const deletePayslip = async (id: number): Promise<void> => { await api.delete(`/payroll/payslips/${id}`); };

export const getPayrollSummary = async (companyId: number, period: string): Promise<PayrollSummary> =>
  (await api.get('/payroll/summary', { params: { company_id: companyId, period } })).data;
