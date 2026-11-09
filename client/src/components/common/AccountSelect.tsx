import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/calculations';
import { getAccountOptions, AccountOption, AccountType } from '../../services/accountsApi';
import { Landmark, AlertTriangle } from 'lucide-react';

const GROUPS: [AccountType, string][] = [['bank', 'Bank accounts'], ['mobile', 'Mobile money'], ['cash', 'Cash']];

interface Props {
  companyId?: number | null;
  value: number | null;
  onChange: (id: number | null, option?: AccountOption) => void;
  /** 'in' = money received into the account, 'out' = paid from it. */
  direction: 'in' | 'out';
  /** Amount of this record, to warn an admin before an account goes below zero. */
  amount?: number;
  /** Editing: the record's saved account and the amount already counted on it. */
  savedAccountId?: number | null;
  savedAccountName?: string | null;
  savedAmount?: number;
  label?: string;
  /** Tells the parent whether there are accounts to choose from (then one is required). */
  onAvailable?: (available: boolean) => void;
  showError?: boolean;
  className?: string;
  selectClassName?: string;
}

/**
 * Picks the bank / mobile money / cash account money went into or came out
 * of. Only shown to people who handle payments; admins also see balances.
 */
const AccountSelect: React.FC<Props> = ({
  companyId, value, onChange, direction, amount = 0, savedAccountId = null, savedAccountName, savedAmount = 0,
  label, onAvailable, showError, className = '', selectClassName,
}) => {
  const { canHandlePayments, isAdmin } = useAuth();
  const [options, setOptions] = useState<AccountOption[] | null>(null);

  useEffect(() => {
    if (!canHandlePayments || !companyId) return;
    let alive = true;
    getAccountOptions(companyId)
      .then((o) => { if (alive) { setOptions(o); onAvailable?.(o.length > 0); } })
      .catch(() => { if (alive) { setOptions([]); onAvailable?.(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, canHandlePayments]);

  if (!canHandlePayments || !companyId || options === null) return null;

  const savedClosed = savedAccountId != null && !options.some((o) => o.id === savedAccountId);
  if (options.length === 0 && !savedClosed) {
    return isAdmin ? (
      <p className={`text-[11px] text-gray-500 dark:!text-gray-400 ${className}`}>
        <Landmark className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
        Add your bank, Airtel Money and cash accounts under <Link to="/accounts" className="font-semibold underline">Bank & Cash</Link> to track balances.
      </p>
    ) : null;
  }

  const selected = options.find((o) => o.id === value);
  let warning = '';
  if (direction === 'out' && selected && typeof selected.balance === 'number' && amount > 0) {
    const after = selected.balance + (selected.id === savedAccountId ? savedAmount : 0) - amount;
    if (after < -0.005) warning = `This takes ${selected.name} to ${formatCurrency(after)}.`;
  }

  const optionText = (o: AccountOption) =>
    `${o.name}${o.account_number && !o.name.includes(o.account_number) ? ` · ${o.account_number}` : ''}${typeof o.balance === 'number' ? `  (${formatCurrency(o.balance)})` : ''}`;

  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-gray-900 mb-1">
        {label || (direction === 'in' ? 'Received into' : 'Paid from')}
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => {
          const id = e.target.value ? Number(e.target.value) : null;
          onChange(id, options.find((o) => o.id === id));
        }}
        className={selectClassName || `w-full px-2.5 py-2 text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${showError && !value ? 'border-red-400' : 'border-gray-300'}`}
      >
        <option value="">Choose account…</option>
        {savedClosed && <option value={savedAccountId!}>{savedAccountName || 'Current account'} (closed)</option>}
        {GROUPS.map(([type, groupLabel]) => {
          const list = options.filter((o) => o.type === type);
          return list.length ? (
            <optgroup key={type} label={groupLabel}>
              {list.map((o) => <option key={o.id} value={o.id}>{optionText(o)}</option>)}
            </optgroup>
          ) : null;
        })}
      </select>
      {showError && !value && <p className="mt-1 text-[11px] text-red-600">Choose the account.</p>}
      {warning && (
        <p className="mt-1 text-[11px] text-amber-700 dark:!text-amber-300 flex items-start gap-1">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" /> {warning} You can still save.
        </p>
      )}
    </div>
  );
};

export default AccountSelect;
