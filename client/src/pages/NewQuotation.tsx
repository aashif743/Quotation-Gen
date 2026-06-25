import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { QuotationItem, Quotation, Client } from '../types';
import { createQuotation, getNextQuoteNumber, getClient } from '../services/api';
import {
  calculateSubtotal,
  calculateVAT,
  calculatePPDA,
  calculateGrandTotal,
} from '../utils/calculations';
import QuotationForm from '../components/Quotation/QuotationForm';
import QuotationPreview from '../components/Quotation/QuotationPreview';
import { brandColorFor } from '../utils/colors';
import { useTheme } from '../context/ThemeContext';
import { Save, Eye, EyeOff, Trash2 } from 'lucide-react';

const blankForm = (): Partial<Quotation> => ({
  client_name: '',
  client_address: '',
  client_email: '',
  client_phone: '',
  date: new Date().toISOString().split('T')[0],
  expiry_days: 30,
  notes: '',
  terms_conditions: '',
  vat_rate: 0.165,
  ppda_rate: 0.01,
  items: [],
});

const draftKey = (userId: number, companyId: number) =>
  `quotationDraft:${userId}:${companyId}`;

const NewQuotation: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const [showPreview, setShowPreview] = useState(true);
  const [loading, setLoading] = useState(false);
  const [quotationData, setQuotationData] = useState<Partial<Quotation>>(blankForm);
  // Suppress the auto-save effect until after the initial draft/defaults
  // restore has completed for the currently selected company.
  const draftReady = useRef(false);

  // (Re-)initialize the form whenever the selected company changes — either
  // by restoring a saved draft for that company, or by setting up fresh
  // defaults from the company itself + the next quote number from the API.
  useEffect(() => {
    if (!selectedCompany || !user?.id) return;
    draftReady.current = false;

    const key = draftKey(user.id, selectedCompany.id);

    let cancelled = false;
    (async () => {
      // 1) Restore saved draft if present. Fields the user can't directly
      //    edit on the form (terms, VAT, PPDA) are refreshed from the
      //    company's current settings if the draft has them empty — that way
      //    Settings changes propagate to in-progress drafts.
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const draft = JSON.parse(stored) as Partial<Quotation>;
          if (!draft.terms_conditions && selectedCompany.default_terms_conditions) {
            draft.terms_conditions = selectedCompany.default_terms_conditions;
          }
          if (draft.vat_rate == null) draft.vat_rate = selectedCompany.vat_rate ?? 0.165;
          if (draft.ppda_rate == null) draft.ppda_rate = selectedCompany.ppda_rate ?? 0.01;
          if (!cancelled) {
            setQuotationData(draft);
            draftReady.current = true;
          }
          return;
        }
      } catch {
        /* corrupt draft — fall through to defaults */
      }

      // 2) No draft — build defaults from the company.
      const defaults: Partial<Quotation> = {
        ...blankForm(),
        company_id: selectedCompany.id,
        vat_rate: selectedCompany.vat_rate ?? 0.165,
        ppda_rate: selectedCompany.ppda_rate ?? 0.01,
        terms_conditions: selectedCompany.default_terms_conditions || '',
      };
      try {
        const { quoteNumber } = await getNextQuoteNumber(selectedCompany.id);
        defaults.quote_number = quoteNumber;
      } catch (e) {
        console.error('Error loading quote number:', e);
      }

      if (!cancelled) {
        setQuotationData(defaults);
        draftReady.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCompany, user?.id]);

  // Auto-save the in-progress form to localStorage so the user can navigate
  // away and come back without losing their work. Keyed by company_id stored
  // *inside* quotationData so we never write the previous company's draft
  // into the new company's slot when the user switches companies.
  useEffect(() => {
    if (!draftReady.current || !user?.id || !quotationData.company_id) return;
    try {
      localStorage.setItem(
        draftKey(user.id, quotationData.company_id),
        JSON.stringify(quotationData)
      );
    } catch {
      /* quota exceeded, etc. — ignore */
    }
  }, [quotationData, user?.id]);

  // When the user picks an existing client from the ClientPicker autocomplete,
  // we batch-update name + contact fields + the client_id link in one setState
  // so the form doesn't re-render four times.
  const handleClientSelected = (client: Client) => {
    setQuotationData((prev) => ({
      ...prev,
      client_id: client.id,
      client_name: client.name,
      client_address: client.address || prev.client_address || '',
      client_email: client.email || prev.client_email || '',
      client_phone: client.phone || prev.client_phone || '',
    }));
  };

  // "New Quotation for this client" coming from the Client detail page is a
  // navigation to `/new-quotation?clientId=123`. Resolve it once on mount and
  // apply, then strip the query param so a refresh doesn't keep re-applying.
  useEffect(() => {
    const clientIdParam = searchParams.get('clientId');
    if (!clientIdParam) return;
    (async () => {
      try {
        const client = await getClient(parseInt(clientIdParam, 10));
        handleClientSelected(client);
        searchParams.delete('clientId');
        setSearchParams(searchParams, { replace: true });
      } catch {
        /* invalid id — silently ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (field: string, value: any) => {
    setQuotationData((prev) => {
      const next = { ...prev, [field]: value };

      // Recompute totals if a tax rate changed and we already have items.
      if ((field === 'vat_rate' || field === 'ppda_rate') && next.items?.length) {
        const subtotal = calculateSubtotal(next.items);
        const vat = calculateVAT(subtotal, next.vat_rate ?? 0);
        const ppda = calculatePPDA(subtotal, next.ppda_rate ?? 0);
        next.subtotal = subtotal;
        next.vat_amount = vat;
        next.ppda_amount = ppda;
        next.grand_total = calculateGrandTotal(subtotal, vat, ppda);
      }

      return next;
    });
  };

  const handleItemsChange = (items: QuotationItem[]) => {
    if (!selectedCompany) return;

    const updatedItems = items.map((item) => ({
      ...item,
      total: item.quantity * item.unit_price,
    }));

    setQuotationData((prev) => {
      const vatRate = prev.vat_rate ?? 0;
      const ppdaRate = prev.ppda_rate ?? 0;
      const subtotal = calculateSubtotal(updatedItems);
      const vat = calculateVAT(subtotal, vatRate);
      const ppda = calculatePPDA(subtotal, ppdaRate);
      return {
        ...prev,
        items: updatedItems,
        subtotal,
        vat_amount: vat,
        ppda_amount: ppda,
        grand_total: calculateGrandTotal(subtotal, vat, ppda),
      };
    });
  };

  const handleClearDraft = () => {
    if (!selectedCompany || !user?.id) return;
    if (!window.confirm('Discard the in-progress quotation and start over?')) return;

    try {
      localStorage.removeItem(draftKey(user.id, selectedCompany.id));
    } catch {}

    draftReady.current = false;
    (async () => {
      const defaults: Partial<Quotation> = {
        ...blankForm(),
        company_id: selectedCompany.id,
        vat_rate: selectedCompany.vat_rate ?? 0.165,
        ppda_rate: selectedCompany.ppda_rate ?? 0.01,
        terms_conditions: selectedCompany.default_terms_conditions || '',
      };
      try {
        const { quoteNumber } = await getNextQuoteNumber(selectedCompany.id);
        defaults.quote_number = quoteNumber;
      } catch {}
      setQuotationData(defaults);
      draftReady.current = true;
    })();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !quotationData.items || quotationData.items.length === 0) return;

    if (!quotationData.quote_number?.trim()) {
      alert('Please enter a quote number.');
      return;
    }

    setLoading(true);
    try {
      const quotation = await createQuotation(quotationData as Omit<Quotation, 'id'>);
      // Clear the saved draft so the next visit starts fresh.
      if (user?.id) {
        try {
          localStorage.removeItem(draftKey(user.id, selectedCompany.id));
        } catch {}
      }
      navigate(`/quotation/${quotation.id}`);
    } catch (error: any) {
      console.error('Error creating quotation:', error);
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        'Failed to create quotation. Please try again.';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedCompany) {
    return <div className="text-center">Please select a company</div>;
  }

  // Get the primary color from the selected company
  // Brightened in dark mode so dark company palettes still pop on the
  // dark surface. Document preview keeps the raw color via QuotationPreview.
  const { theme } = useTheme();
  const primaryColor = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');
  const getButtonStyle = (): React.CSSProperties => ({ backgroundColor: primaryColor });

  // The preview uses the form's current tax rates so the live VAT/PPDA labels
  // and totals reflect what the user is actually about to save.
  const previewCompany = {
    ...selectedCompany,
    vat_rate: quotationData.vat_rate ?? selectedCompany.vat_rate,
    ppda_rate: quotationData.ppda_rate ?? selectedCompany.ppda_rate,
  };

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Quotation</h1>
          <p className="text-gray-600 mt-2">
            Create a new quotation for {selectedCompany.name}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleClearDraft}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-gray-600 bg-white hover:bg-gray-50"
            title="Discard the in-progress quotation"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </button>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            {showPreview ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !quotationData.items?.length}
            className="inline-flex items-center px-6 py-3 border border-transparent rounded-lg shadow-sm text-base font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            style={getButtonStyle()}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Creating...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Create Quotation
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[4fr_8fr] gap-8">
        <div className="space-y-6">
          <QuotationForm
            quotationData={quotationData}
            onInputChange={handleInputChange}
            onItemsChange={handleItemsChange}
            onClientSelected={handleClientSelected}
          />
        </div>

        {showPreview && (
          <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh_-_3rem)] xl:overflow-y-auto">
            <QuotationPreview
              quotationData={quotationData}
              company={previewCompany}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default NewQuotation;
