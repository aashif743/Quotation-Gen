import { QuotationItem } from '../types';

export const calculateSubtotal = (items: QuotationItem[]): number => {
  return items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
};

export const calculateVAT = (subtotal: number, vatRate: number): number => {
  return subtotal * vatRate;
};

export const calculatePPDA = (subtotal: number, ppdaRate: number): number => {
  return subtotal * ppdaRate;
};

export const calculateGrandTotal = (
  subtotal: number, 
  vatAmount: number, 
  ppdaAmount: number
): number => {
  return subtotal + vatAmount + ppdaAmount;
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-MW', {
    style: 'currency',
    currency: 'MWK',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatNumber = (num: number, decimals: number = 2): string => {
  return new Intl.NumberFormat('en-MW', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};