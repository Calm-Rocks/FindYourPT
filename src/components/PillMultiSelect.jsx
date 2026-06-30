import { useEffect, useRef, useState } from 'react';

// Same behavior as the original MultiSelectDropdown, restyled to match
// the filter bar's pill language so every control in the bar reads as
// one consistent system rather than three different widget styles.
export default function PillMultiSelect({ options, selected, onChange, placeholder = 'Any' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggle(value) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  const label = selected.size === 0
    ? placeholder
    : selected.size === 1
      ? options.find((o) => selected.has(o.value))?.label ?? placeholder
      : `${selected.size} goals`;

  return (
    <div className="filter-pill-dropdown" ref={ref}>
      <button
        type="button"
        className={`filter-pill${selected.size > 0 ? ' selected' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label} {open ? '▴' : '▾'}
      </button>

      {open && (
        <div className="filter-pill-panel" role="listbox" aria-multiselectable="true">
          {options.map((opt) => (
            <label key={opt.value} className="filter-pill-option">
              <input
                type="checkbox"
                checked={selected.has(opt.value)}
                onChange={() => toggle(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
