import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Company } from '../types';
import * as api from '../services/api';

interface CompanyContextType {
  companies: Company[];
  selectedCompany: Company | null;
  setSelectedCompany: (company: Company) => void;
  loadCompanies: () => Promise<void>;
  updateCompany: (id: number, data: Partial<Company>, logo?: File) => Promise<Company>;
  createCompany: (name: string) => Promise<Company>;
  deleteCompany: (id: number) => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};

interface CompanyProviderProps {
  children: ReactNode;
}

export const CompanyProvider: React.FC<CompanyProviderProps> = ({ children }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const loadCompanies = async () => {
    try {
      const companiesData = await api.getCompanies();
      setCompanies(companiesData);
      if (companiesData.length > 0 && !selectedCompany) {
        setSelectedCompany(companiesData[0]);
      } else if (companiesData.length === 0) {
        setSelectedCompany(null);
      }
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const createCompany = async (name: string) => {
    try {
      const newCompany = await api.createCompany(name);
      await loadCompanies();
      return newCompany;
    } catch (error) {
      console.error('Error creating company:', error);
      throw error;
    }
  };

  const deleteCompany = async (id: number) => {
    try {
      await api.deleteCompany(id);
      if (selectedCompany?.id === id) {
        const remainingCompanies = companies.filter(c => c.id !== id);
        setSelectedCompany(remainingCompanies.length > 0 ? remainingCompanies[0] : null);
      }
      await loadCompanies();
    } catch (error) {
      console.error('Error deleting company:', error);
      throw error;
    }
  };

  const updateCompany = async (id: number, data: Partial<Company>, logo?: File): Promise<Company> => {
    try {
      const updatedCompany = await api.updateCompany(id, data, logo);
      setCompanies(companies.map(company => 
        company.id === id ? updatedCompany : company
      ));
      if (selectedCompany?.id === id) {
        setSelectedCompany(updatedCompany);
      }
      return updatedCompany;
    } catch (error) {
      console.error('Error updating company:', error);
      throw error;
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  return (
    <CompanyContext.Provider
      value={{
        companies,
        selectedCompany,
        setSelectedCompany,
        loadCompanies,
        updateCompany,
        createCompany,
        deleteCompany
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};