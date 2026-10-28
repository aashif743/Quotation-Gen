import React, { useId } from 'react';

/**
 * QuoteFlow product mark: a "Q" whose tail flows forward into an arrow
 * (quote → flow) on an indigo-to-cyan badge. Same artwork as
 * public/logo.svg; inline so it renders crisply at any size.
 */
export const QuoteFlowMark: React.FC<{ size?: number; className?: string }> = ({ size = 36, className = '' }) => {
  const id = `qf-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={`flex-shrink-0 ${className}`} role="img" aria-label="QuoteFlow">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${id})`} />
      <g fill="none" stroke="#FFFFFF" strokeLinecap="round">
        <path d="M298.0 331.0 A112 112 0 1 1 348.5 268.6" strokeWidth="50" />
        <path d="M262 264 C 300 292, 326 338, 382 356" strokeWidth="50" />
        <path d="M373.8 312.6 L402.9 362.7 L350.0 386.5" strokeWidth="36" strokeLinejoin="round" />
      </g>
    </svg>
  );
};

/** Mark + "QuoteFlow" wordmark. `tone="light"` is for dark backgrounds. */
export const QuoteFlowLogo: React.FC<{ size?: number; tone?: 'dark' | 'light'; className?: string; textClassName?: string }> = ({
  size = 36,
  tone = 'dark',
  className = '',
  textClassName = 'text-xl',
}) => (
  <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
    <QuoteFlowMark size={size} />
    <span className={`font-bold tracking-tight leading-none ${textClassName} ${tone === 'light' ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
      Quote
      <span className={tone === 'light' ? 'text-cyan-300' : 'bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent dark:from-indigo-400 dark:to-cyan-300'}>
        Flow
      </span>
    </span>
  </div>
);

export default QuoteFlowLogo;
