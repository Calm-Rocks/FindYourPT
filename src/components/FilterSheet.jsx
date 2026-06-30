import { useEffect } from 'react';

// Bottom-sheet pattern for mobile filters — slides up from the bottom on
// trigger, dismisses via backdrop tap, X button, or "Show results". This
// is the standard mobile convention for glance-and-confirm filter sets
// (as opposed to a side drawer, which reads more like persistent nav).
// Desktop never renders this — the filter bar stays inline there.
export default function FilterSheet({ open, onClose, children, resultCount }) {
  // Prevent the page behind the sheet from scrolling while it's open —
  // otherwise touch-scrolling the sheet's content can drag the page
  // underneath on some mobile browsers.
  useEffect(() => {
    if (open) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prevOverflow; };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="filter-sheet-backdrop" onClick={onClose}>
      <div className="filter-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="filter-sheet-handle" />
        <div className="filter-sheet-header">
          <h3>Filters</h3>
          <button className="filter-sheet-close" onClick={onClose} aria-label="Close filters">✕</button>
        </div>
        <div className="filter-sheet-body">
          {children}
        </div>
        <div className="filter-sheet-footer">
          <button className="btn-primary" onClick={onClose} style={{ width: '100%' }}>
            Show {resultCount !== null ? `${resultCount} ` : ''}{resultCount === 1 ? 'trainer' : 'trainers'}
          </button>
        </div>
      </div>
    </div>
  );
}
