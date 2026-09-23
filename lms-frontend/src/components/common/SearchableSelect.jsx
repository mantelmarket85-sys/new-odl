import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, Check, X } from "lucide-react";

/* =========================================================================
 * SearchableSelect — accessible, real-time filterable dropdown.
 *
 * A lightweight combobox used where a long list of records (e.g. teachers
 * fetched live from the database) must be searchable. Renders the option's
 * actual label text; never shows placeholder/dummy values.
 *
 * Props:
 *   - options: [{ value, label, hint? }]
 *   - value:   currently selected value
 *   - onChange(value)
 *   - placeholder, searchPlaceholder
 *   - disabled, loading
 *   - emptyText: shown when no options match the query
 * ======================================================================= */
const SearchableSelect = ({
  options = [],
  value = "",
  onChange,
  placeholder = "— Select —",
  searchPlaceholder = "Search…",
  disabled = false,
  loading = false,
  emptyText = "No matches found",
  id,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        String(o.label || "").toLowerCase().includes(q) ||
        String(o.hint || "").toLowerCase().includes(q)
    );
  }, [options, query]);

  // Close on outside click.
  useEffect(() => {
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Focus the search field whenever the menu opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(-1);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const choose = (opt) => {
    onChange?.(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && filtered[activeIndex]) choose(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`input-base py-2 text-sm w-full flex items-center justify-between gap-2 text-left ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`truncate ${selected ? "text-app" : "text-muted-app"}`}>
          {loading ? "Loading…" : selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={15} className={`text-muted-app shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-app surface shadow-xl overflow-hidden">
          <div className="p-2 border-b border-app sticky top-0 surface">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-app" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                className="input-base pl-8 pr-7 py-1.5 text-sm w-full"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-app hover:text-app">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-xs text-muted-app italic text-center">{emptyText}</li>
            ) : (
              filtered.map((o, idx) => {
                const isSel = String(o.value) === String(value);
                return (
                  <li
                    key={o.value}
                    role="option"
                    aria-selected={isSel}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => choose(o)}
                    className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between gap-2 ${
                      idx === activeIndex ? "bg-primary-50 dark:bg-primary-500/10" : ""
                    } ${isSel ? "font-semibold text-primary-700 dark:text-primary-300" : "text-app"}`}
                  >
                    <span className="min-w-0">
                      <span className="truncate block">{o.label}</span>
                      {o.hint && <span className="text-[11px] text-muted-app">{o.hint}</span>}
                    </span>
                    {isSel && <Check size={14} className="text-primary-600 shrink-0" />}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
