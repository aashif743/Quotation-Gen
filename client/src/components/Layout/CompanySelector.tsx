import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCompany } from '../../context/CompanyContext';
import { ChevronDown, Check, Building2 } from 'lucide-react';
import { Company } from '../../types';

interface CompanySelectorProps {
  collapsed?: boolean;
}

// Convert a #rrggbb hex to a `rgba(...)` string at the given alpha. Used a lot
// for tinting backgrounds, borders, etc. with the active company's color.
const hexToRgba = (hex: string, alpha: number): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!result) return `rgba(79, 70, 229, ${alpha})`;
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
};

// Resolves which logo URL to show in the thumbnail. The admin-uploaded one
// (logo_url) takes priority; the bundled brand logo (quote_logo_url) is the
// fallback so the thumbnail isn't empty when no thumbnail has been uploaded.
const pickThumbUrl = (company: Company): string | undefined =>
  company.logo_url || company.quote_logo_url || undefined;

/**
 * Banner-friendly company thumbnail: white card + `object-contain` so the
 * full logo is visible (no cropping). When no logo is set on the company we
 * fall back to a brand-colored initial bubble.
 *
 * Size presets:
 *   - sm: 32px tall, ~52px wide   (dropdown rows, sidebar avatar)
 *   - md: 40px tall, ~64px wide   (selected-company card on expanded sidebar)
 *   - lg: 48px tall, ~80px wide   (page header)
 */
const SIZES = {
  sm: { box: 'h-9 w-9', initials: 'text-sm', pad: 'p-0.5' },
  md: { box: 'h-11 w-11', initials: 'text-base', pad: 'p-1' },
  lg: { box: 'h-12 w-12', initials: 'text-lg', pad: 'p-1' },
} as const;

export const CompanyThumb: React.FC<{
  company: Company;
  size?: keyof typeof SIZES;
}> = ({ company, size = 'sm' }) => {
  const { box, initials, pad } = SIZES[size];
  const url = pickThumbUrl(company);
  const primary = company.primary_color || '#4f46e5';

  // Track image load errors so a 404 (or otherwise unreachable file) falls
  // back to the initials bubble instead of an empty white circle.
  const [failed, setFailed] = useState(false);
  // Reset failure state when the URL changes (e.g., admin uploads a new
  // thumbnail) so the next attempt isn't suppressed.
  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) {
    return (
      <div
        className={`${box} rounded-full flex items-center justify-center font-bold flex-shrink-0`}
        style={{ backgroundColor: hexToRgba(primary, 0.15), color: primary }}
      >
        <span className={initials}>{company.name.charAt(0).toUpperCase()}</span>
      </div>
    );
  }

  return (
    <div
      className={`${box} ${pad} rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden`}
    >
      <img
        src={url}
        alt={`${company.name} logo`}
        className="max-h-full max-w-full object-contain"
        loading="eager"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
      />
    </div>
  );
};

const CompanySelector: React.FC<CompanySelectorProps> = ({ collapsed = false }) => {
  const { companies, selectedCompany, setSelectedCompany } = useCompany();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Anchored position of the dropdown (used by the portal). We compute it
  // every time the dropdown opens, plus on window resize/scroll so it stays
  // glued to the trigger button.
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);

  // Preload every company logo as soon as the list is known. The browser
  // caches them, so by the time the user opens the dropdown the images are
  // already in memory — no flicker, no waiting.
  useEffect(() => {
    companies.forEach((c) => {
      const url = pickThumbUrl(c);
      if (!url) return;
      const img = new Image();
      img.src = url;
      // The other URL too, so switching companies later is instant.
      if (c.logo_url && c.quote_logo_url) {
        const other = new Image();
        other.src = c.logo_url === url ? c.quote_logo_url : c.logo_url;
      }
    });
  }, [companies]);

  // Close the dropdown on outside click and on Escape.
  // The dropdown is portalled to body, so "inside" also has to count the
  // dropdown's own DOM node — not just the trigger's wrapper.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const inTrigger = containerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inTrigger && !inDropdown) setIsOpen(false);
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

  // Keep the portalled dropdown glued to the trigger.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const computeAnchor = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    };
    computeAnchor();
    window.addEventListener('resize', computeAnchor);
    window.addEventListener('scroll', computeAnchor, true);
    return () => {
      window.removeEventListener('resize', computeAnchor);
      window.removeEventListener('scroll', computeAnchor, true);
    };
  }, [isOpen]);

  const handleCompanySelect = (company: Company) => {
    setSelectedCompany(company);
    setIsOpen(false);
  };

  if (!selectedCompany) {
    return collapsed ? (
      <div className="animate-pulse bg-gray-200 h-10 w-10 rounded-lg mx-auto" />
    ) : (
      <div className="animate-pulse bg-gray-200 h-16 rounded-lg" />
    );
  }

  const primaryColor = selectedCompany.primary_color || '#4f46e5';

  // -----------------------------------------------------------------------
  // Dropdown list (shared by collapsed and expanded modes)
  // -----------------------------------------------------------------------
  const DropdownList = (
    <div
      className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
      role="listbox"
    >
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
          Switch Company
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{companies.length} available</p>
      </div>

      <div className="py-1">
        {companies.map((company) => {
          const itemColor = company.primary_color || '#4f46e5';
          const isSelected = selectedCompany.id === company.id;
          return (
            <button
              key={company.id}
              onClick={() => handleCompanySelect(company)}
              role="option"
              aria-selected={isSelected}
              className="group w-full px-4 py-2.5 flex items-center space-x-3 text-left transition-colors hover:bg-gray-50 relative"
              style={isSelected ? { backgroundColor: hexToRgba(itemColor, 0.08) } : {}}
            >
              {isSelected && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2 left-0 w-1 rounded-r-full"
                  style={{ backgroundColor: itemColor }}
                />
              )}
              <CompanyThumb company={company} size="sm" />
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm leading-tight ${isSelected ? 'font-semibold' : 'font-medium text-gray-900'}`}
                  style={isSelected ? { color: itemColor } : undefined}
                >
                  {company.name}
                </p>
                {isSelected && (
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 mt-0.5">Active</p>
                )}
              </div>
              {isSelected && (
                <Check className="h-4 w-4 flex-shrink-0" style={{ color: itemColor }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // -----------------------------------------------------------------------
  // Collapsed sidebar — icon-only.
  // -----------------------------------------------------------------------
  if (collapsed) {
    return (
      <>
        <div ref={containerRef} className="relative flex justify-center">
          <button
            ref={triggerRef}
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-lg transition-all hover:shadow-sm"
            style={{ boxShadow: `0 0 0 2px ${hexToRgba(primaryColor, 0.35)}` }}
            title={`${selectedCompany.name} — click to switch`}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
          >
            <CompanyThumb company={selectedCompany} size="sm" />
          </button>
        </div>
        {isOpen && anchor &&
          createPortal(
            <div
              ref={dropdownRef}
              // Paranoid stacking: very high z-index, plus `isolation: isolate`
              // to force a fresh stacking context so no parent transform/
              // filter/contain can ever override our position.
              style={{
                position: 'fixed',
                top: anchor.top,
                left: anchor.left,
                width: 320,
                maxWidth: '80vw',
                zIndex: 2147483000,
                isolation: 'isolate',
                pointerEvents: 'auto',
              }}
            >
              {DropdownList}
            </div>,
            document.body
          )}
      </>
    );
  }

  // -----------------------------------------------------------------------
  // Expanded sidebar — main "active company" card + dropdown.
  // -----------------------------------------------------------------------
  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          ref={triggerRef}
          onClick={() => setIsOpen(!isOpen)}
          className="w-full p-3 rounded-xl border-2 bg-white transition-all hover:shadow-sm focus:outline-none"
          style={{ borderColor: hexToRgba(primaryColor, 0.35) }}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <div className="flex items-center space-x-3">
            <CompanyThumb company={selectedCompany} size="md" />
            <div className="flex-1 min-w-0 text-left">
              <p className="font-semibold text-sm truncate" style={{ color: primaryColor }}>
                {selectedCompany.name}
              </p>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 flex items-center mt-0.5">
                <Building2 className="h-3 w-3 mr-1" />
                Active Company
              </p>
            </div>
            <ChevronDown
              className={`h-5 w-5 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              style={{ color: primaryColor }}
            />
          </div>
        </button>
      </div>
      {isOpen && anchor &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: anchor.top,
              left: anchor.left,
              // At least as wide as the trigger; cap at 320 so long names fit.
              width: Math.max(anchor.width, 320),
              maxWidth: '90vw',
              // Paranoid stacking — see collapsed-mode comment.
              zIndex: 2147483000,
              isolation: 'isolate',
              pointerEvents: 'auto',
            }}
          >
            {DropdownList}
          </div>,
          document.body
        )}
    </>
  );
};

export default CompanySelector;
