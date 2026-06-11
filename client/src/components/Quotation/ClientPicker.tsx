import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, UserPlus, Check } from 'lucide-react';
import { getClients } from '../../services/api';
import { Client } from '../../types';

interface ClientPickerProps {
  companyId: number;
  value: string;
  onChange: (name: string) => void;
  onSelect: (client: Client) => void;
  required?: boolean;
}

/**
 * A text input with an autocomplete dropdown of existing clients for the
 * currently-selected company. Picking an existing client fires `onSelect`
 * with the full record (so the parent can also fill address/email/phone +
 * lock the link via `client_id`). Typing a brand-new name just propagates
 * via `onChange` — the backend's `resolveClientId` helper will create the
 * client on save.
 */
const ClientPicker: React.FC<ClientPickerProps> = ({
  companyId,
  value,
  onChange,
  onSelect,
  required,
}) => {
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Load the full client list once per company. We filter client-side because
  // it's instant and there typically aren't enough clients to warrant a
  // server-side debounced search.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getClients(companyId)
      .then((data) => { if (!cancelled) setAllClients(data); })
      .catch(() => { if (!cancelled) setAllClients([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const matches = useMemo(() => {
    const term = value.trim().toLowerCase();
    if (!term) return allClients.slice(0, 8);
    return allClients
      .filter((c) =>
        [c.name, c.contact_person, c.email, c.phone].some((f) =>
          (f || '').toLowerCase().includes(term)
        )
      )
      .slice(0, 8);
  }, [allClients, value]);

  // Whether the typed name is an exact match of an existing client. If not,
  // the dropdown shows a "Save as new client" hint at the bottom.
  const exactMatch = useMemo(
    () => allClients.some((c) => c.name.trim().toLowerCase() === value.trim().toLowerCase()),
    [allClients, value]
  );

  // Keep the highlighted index in range when the list shrinks/grows.
  useEffect(() => {
    if (activeIndex >= matches.length) setActiveIndex(Math.max(0, matches.length - 1));
  }, [matches.length, activeIndex]);

  const handleSelect = (c: Client) => {
    onSelect(c);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (matches[activeIndex]) {
        e.preventDefault();
        handleSelect(matches[activeIndex]);
      }
    }
  };

  const renderHighlight = (text: string) => {
    const term = value.trim();
    if (!term) return text;
    const idx = text.toLowerCase().indexOf(term.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="font-semibold text-indigo-700 bg-indigo-50 rounded px-0.5">
          {text.slice(idx, idx + term.length)}
        </span>
        {text.slice(idx + term.length)}
      </>
    );
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Type to search existing clients, or type a new name..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          required={required}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
      </div>

      {open && (matches.length > 0 || (!exactMatch && value.trim())) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-30 max-h-80 overflow-y-auto">
          {loading && matches.length === 0 && (
            <div className="px-4 py-3 text-sm text-gray-500">Loading clients...</div>
          )}

          {matches.length > 0 && (
            <ul ref={listRef} role="listbox">
              {matches.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(c)}
                    onMouseEnter={() => setActiveIndex(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    className={`w-full px-4 py-2.5 text-left flex items-start space-x-3 transition-colors ${
                      i === activeIndex ? 'bg-indigo-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {renderHighlight(c.name)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {[c.contact_person, c.email, c.phone].filter(Boolean).join(' · ') || 'No contact info'}
                      </p>
                    </div>
                    {value.trim().toLowerCase() === c.name.trim().toLowerCase() && (
                      <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!exactMatch && value.trim() && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-amber-50 text-xs text-amber-800 flex items-center">
              <UserPlus className="h-3.5 w-3.5 mr-2 flex-shrink-0" />
              <span>
                <span className="font-medium">"{value.trim()}"</span> will be saved as a new client when you create this quotation.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientPicker;
