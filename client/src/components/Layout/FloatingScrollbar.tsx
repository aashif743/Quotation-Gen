import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A horizontal scrollbar pinned to the bottom of the screen for wide tables.
 *
 * Lists (quotation history, invoices, clients…) sit in `overflow-x-auto`
 * boxes. On a narrow screen their own scrollbar is at the very bottom of the
 * table, so reaching the action buttons meant scrolling all the way down
 * first. This finds the wide table that is on screen but whose own scrollbar
 * is below the fold, and shows a copy of that scrollbar fixed at the bottom
 * of the window, kept in sync both ways. Works for every page automatically.
 */
type Target = { el: HTMLElement; left: number; width: number; scrollWidth: number };

const SELECTOR = 'main .overflow-x-auto, main .overflow-auto, main .overflow-x-scroll';

const FloatingScrollbar: React.FC = () => {
  const [target, setTarget] = useState<Target | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const syncing = useRef<'bar' | 'el' | null>(null);
  const frame = useRef(0);

  const measure = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const vh = window.innerHeight;
      let found: Target | null = null;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))) {
        if (el.scrollWidth <= el.clientWidth + 1) continue; // nothing to scroll sideways
        if (!el.querySelector('table')) continue; // only lists / tables
        if (el.closest('[role="dialog"], .fixed')) continue; // not inside pop-ups
        const r = el.getBoundingClientRect();
        // On screen, but its own scrollbar (bottom edge) is below the window.
        if (r.top < vh - 60 && r.bottom > vh && r.width > 0) {
          found = { el, left: r.left + el.clientLeft, width: el.clientWidth, scrollWidth: el.scrollWidth };
          break;
        }
      }
      const next = found as Target | null;
      setTarget((prev) => {
        if (!next && !prev) return prev;
        if (next && prev && prev.el === next.el && prev.left === next.left && prev.width === next.width && prev.scrollWidth === next.scrollWidth) return prev;
        return next;
      });
    });
  }, []);

  // Re-check on scroll (any element), resize and DOM changes (lists loading, filters).
  useEffect(() => {
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    const mo = new MutationObserver(measure);
    mo.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(measure, 1500); // fonts / images settling
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      mo.disconnect();
      window.clearInterval(timer);
      cancelAnimationFrame(frame.current);
    };
  }, [measure]);

  // Keep the table and the floating bar scrolled to the same place.
  useEffect(() => {
    const el = target?.el;
    const bar = barRef.current;
    if (!el || !bar) return;
    bar.scrollLeft = el.scrollLeft;
    const fromEl = () => {
      if (syncing.current === 'bar') { syncing.current = null; return; }
      syncing.current = 'el';
      bar.scrollLeft = el.scrollLeft;
    };
    const fromBar = () => {
      if (syncing.current === 'el') { syncing.current = null; return; }
      syncing.current = 'bar';
      el.scrollLeft = bar.scrollLeft;
    };
    el.addEventListener('scroll', fromEl);
    bar.addEventListener('scroll', fromBar);
    return () => {
      el.removeEventListener('scroll', fromEl);
      bar.removeEventListener('scroll', fromBar);
    };
  }, [target]);

  if (!target) return null;
  return (
    <div
      ref={barRef}
      className="floating-scrollbar no-print"
      style={{ left: target.left, width: target.width }}
      aria-hidden="true"
    >
      <div style={{ width: target.scrollWidth, height: 1 }} />
    </div>
  );
};

export default FloatingScrollbar;
