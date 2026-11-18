import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

interface Props {
  children: React.ReactNode;
  /** Classes for the block (font size, weight, colour…); the size here is the largest used. */
  className?: string;
  title?: string;
  style?: React.CSSProperties;
  /** Smallest size allowed, as a fraction of the normal size, before the text wraps instead. */
  min?: number;
}

/**
 * One line of text (usually an amount in a summary card) that is always shown
 * in full: when it doesn't fit the card it gets smaller, and if it would get
 * too small it wraps onto a second line. Never cut off with "…".
 * Re-fits when the card is resized or the value changes. `contain: inline-size`
 * stops a long value from stretching the card or its grid column.
 */
const FitText: React.FC<Props> = ({ children, className = '', title, style, min = 0.6 }) => {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);

  const fit = useCallback(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    i.style.fontSize = '';
    i.style.whiteSpace = 'nowrap';
    i.style.overflowWrap = 'normal';
    const avail = o.clientWidth;
    const need = i.scrollWidth;
    if (!avail || need <= avail) return;
    const base = parseFloat(getComputedStyle(i).fontSize) || 16;
    const size = Math.max(base * min, Math.floor(base * (avail / need) * 100) / 100 - 0.25);
    i.style.fontSize = `${size}px`;
    if (i.scrollWidth <= avail) return;
    // Still too long: put "MK" and the amount on separate lines, and shrink the
    // amount further if it alone is still too wide…
    i.style.whiteSpace = 'normal';
    if (i.scrollWidth > avail) {
      i.style.fontSize = `${Math.max(base * 0.4, Math.floor(size * (avail / i.scrollWidth) * 100) / 100 - 0.25)}px`;
    }
    // …and only break inside the number as a very last resort.
    if (i.scrollWidth > avail) i.style.overflowWrap = 'anywhere';
  }, [min]);

  useLayoutEffect(fit, [fit, children]);

  useEffect(() => {
    const o = outer.current;
    if (!o || !('ResizeObserver' in window)) return;
    let w = o.clientWidth;
    let raf = 0;
    // Fit on the next frame, not inside the observer callback (avoids the
    // browser's "ResizeObserver loop" warning).
    const ro = new ResizeObserver(() => {
      if (o.clientWidth === w) return;
      w = o.clientWidth;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    });
    ro.observe(o);
    // Web fonts arriving change the text width.
    (document as any).fonts?.ready?.then(fit).catch(() => {});
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [fit]);

  return (
    <div ref={outer} className={`min-w-0 ${className}`} title={title} style={{ contain: 'inline-size', ...style }}>
      <span ref={inner} className="inline-block max-w-full leading-tight">{children}</span>
    </div>
  );
};

export default FitText;
