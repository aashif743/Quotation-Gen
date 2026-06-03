import React, { useEffect, useRef, useState } from 'react';
import { useCompany } from '../../context/CompanyContext';
import { ChevronDown, Check } from 'lucide-react';
import { Company } from '../../types';

interface CompanySelectorProps {
  collapsed?: boolean;
}

const CompanySelector: React.FC<CompanySelectorProps> = ({ collapsed = false }) => {
  const { companies, selectedCompany, setSelectedCompany } = useCompany();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click (mouse or touch) and on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const handleCompanySelect = (company: Company) => {
    setSelectedCompany(company);
    setIsOpen(false);
  };

  // Helper to convert hex to rgba for backgrounds
  const hexToRgba = (hex: string, alpha: number): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(79, 70, 229, ${alpha})`;
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
  };

  const getCompanyStyle = (company: Company) => {
    const primaryColor = company.primary_color || '#4f46e5';
    return {
      backgroundColor: hexToRgba(primaryColor, 0.1),
      borderColor: hexToRgba(primaryColor, 0.3),
      color: primaryColor,
    };
  };

  if (!selectedCompany) {
    return collapsed ? (
      <div className="animate-pulse bg-gray-200 h-10 w-10 rounded-full mx-auto"></div>
    ) : (
      <div className="animate-pulse bg-gray-200 h-16 rounded-lg"></div>
    );
  }

  const primaryColor = selectedCompany.primary_color || '#4f46e5';

  const companyAvatar = (company: Company, size = 'h-8 w-8') =>
    company.logo_url ? (
      <div className={`${size} rounded-full overflow-hidden bg-white flex-shrink-0`}>
        <img
          src={`${company.logo_url}`}
          alt={`${company.name} logo`}
          className="h-full w-full object-cover"
        />
      </div>
    ) : (
      <div
        className={`${size} rounded-full flex items-center justify-center flex-shrink-0`}
        style={{ backgroundColor: hexToRgba(company.primary_color || '#4f46e5', 0.2) }}
      >
        <span className="text-sm font-bold" style={{ color: company.primary_color || '#4f46e5' }}>
          {company.name.charAt(0)}
        </span>
      </div>
    );

  // Compact, icon-only selector for the collapsed sidebar.
  if (collapsed) {
    return (
      <div ref={containerRef} className="relative flex justify-center">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 rounded-full ring-2 transition-colors"
          style={{ borderColor: primaryColor, boxShadow: `0 0 0 2px ${hexToRgba(primaryColor, 0.3)}` }}
          title={selectedCompany.name}
        >
          {companyAvatar(selectedCompany, 'h-10 w-10')}
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
            {companies.map((company) => {
              const isSelected = selectedCompany.id === company.id;
              return (
                <button
                  key={company.id}
                  onClick={() => handleCompanySelect(company)}
                  className="w-full p-3 text-left transition-colors border-b border-gray-100 last:border-b-0 hover:bg-gray-50 flex items-center space-x-3"
                  style={isSelected ? { backgroundColor: hexToRgba(company.primary_color || '#4f46e5', 0.1) } : {}}
                >
                  {companyAvatar(company)}
                  <span className="font-medium text-gray-900 truncate">{company.name}</span>
                  {isSelected && <Check className="h-4 w-4 ml-auto flex-shrink-0" style={{ color: company.primary_color || '#4f46e5' }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 rounded-lg border-2 transition-colors"
        style={getCompanyStyle(selectedCompany)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {selectedCompany.logo_url ? (
              <div className="h-8 w-8 rounded-full overflow-hidden bg-white">
                <img
                  src={`${selectedCompany.logo_url}`}
                  alt={`${selectedCompany.name} logo`}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: hexToRgba(primaryColor, 0.2) }}
              >
                <span className="text-sm font-bold" style={{ color: primaryColor }}>
                  {selectedCompany.name.charAt(0)}
                </span>
              </div>
            )}
            <div className="text-left">
              <p className="font-semibold text-sm" style={{ color: primaryColor }}>{selectedCompany.name}</p>
              <p className="text-xs text-gray-600">Active Company</p>
            </div>
          </div>
          <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} style={{ color: primaryColor }} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          {companies.map((company) => {
            const companyPrimaryColor = company.primary_color || '#4f46e5';
            const isSelected = selectedCompany.id === company.id;

            return (
              <button
                key={company.id}
                onClick={() => handleCompanySelect(company)}
                className="w-full p-4 text-left transition-colors border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                style={isSelected ? { backgroundColor: hexToRgba(companyPrimaryColor, 0.1) } : {}}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {company.logo_url ? (
                      <div className="h-8 w-8 rounded-full overflow-hidden bg-gray-100">
                        <img
                          src={`${company.logo_url}`}
                          alt={`${company.name} logo`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: hexToRgba(companyPrimaryColor, 0.2) }}
                      >
                        <span className="text-sm font-bold" style={{ color: companyPrimaryColor }}>
                          {company.name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{company.name}</p>
                      <p className="text-xs text-gray-600">{company.address}</p>
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="h-5 w-5" style={{ color: companyPrimaryColor }} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CompanySelector;