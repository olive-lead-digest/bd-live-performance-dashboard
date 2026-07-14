'use client';

import { useEffect, useRef } from 'react';

// P2-3 — shared accessible-dialog behaviour for overlays / drill-downs.
// Attach the returned ref to the dialog container (give it tabIndex={-1},
// role="dialog", aria-modal, aria-labelledby). When `enabled` is true it:
//   • moves focus into the dialog on open (first focusable, else the container),
//   • traps Tab / Shift+Tab within the dialog,
//   • closes on Escape,
//   • restores focus to the previously-focused trigger on close.
// `onClose` is read through a ref so the effect only re-runs when `enabled`
// flips — passing an inline arrow is safe and won't re-trap focus each render.
export function useDialog<T extends HTMLElement>(onClose: () => void, enabled: boolean = true) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    const prevFocused = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;

    const focusable = (): HTMLElement[] =>
      node
        ? Array.from(
            node.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null || el === document.activeElement)
        : [];

    // Move focus into the dialog.
    const first = focusable()[0];
    (first || node)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab') {
        const f = focusable();
        if (f.length === 0) {
          e.preventDefault();
          node?.focus();
          return;
        }
        const firstEl = f[0];
        const lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Restore focus to whatever opened the dialog.
      if (prevFocused && typeof prevFocused.focus === 'function') prevFocused.focus();
    };
  }, [enabled]);

  return ref;
}
