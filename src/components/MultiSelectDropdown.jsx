import { useEffect, useRef, useState } from 'react';

// options: [{ value, label }]
// selected: Set of values
// onChange: (newSet) => void
// placeholder: string shown when nothing selected
export default function MultiSelectDropdown({ options, selected, onChange, placeholder = 'Any' }) {
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
      : `${selected.size} selected`;

  return (
    <div className="ms-dropdown" ref={ref}>
      <button
        type="button"
        className="ms-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label}
        <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--steel)', fontSize: 12 }}>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="ms-panel" role="listbox" aria-multiselectable="true">
          {options.map((opt) => (
            <label key={opt.value} className="ms-option">
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
