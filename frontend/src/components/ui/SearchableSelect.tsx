import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Loader2 } from 'lucide-react';

export interface SearchableSelectOption {
  value: string | number;
  label: string;
}

interface SearchableSelectProps {
  value: string | number;
  onChange: (value: string | number) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  onSearchChange?: (query: string) => void;
  isLoading?: boolean;
  className?: string;
}

const triggerClass =
  'w-full h-12 rounded-xl px-4 outline-none transition-all bg-[#12141C] border border-white/10 text-white flex items-center justify-between gap-2 hover:border-white/20 focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed';

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  disabled = false,
  emptyMessage = 'No results found',
  onSearchChange,
  isLoading = false,
  className = '',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => String(o.value) === String(value));

  const filtered = useMemo(() => {
    if (onSearchChange) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, onSearchChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
        if (onSearchChange) onSearchChange('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onSearchChange]);

  const handleSearch = (q: string) => {
    setQuery(q);
    onSearchChange?.(q);
  };

  const handleSelect = (val: string | number) => {
    onChange(val);
    setOpen(false);
    setQuery('');
    onSearchChange?.('');
  };

  const toggleOpen = () => {
    if (disabled) return;
    setOpen((v) => {
      if (v) {
        setQuery('');
        onSearchChange?.('');
      }
      return !v;
    });
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button type="button" disabled={disabled} onClick={toggleOpen} className={triggerClass}>
        <span className={`truncate ${selected ? 'text-white' : 'text-slate-500'}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="dropdown-panel absolute z-50 mt-1 w-full p-2 shadow-xl">
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto space-y-0.5">
            {isLoading ? (
              <li className="flex justify-center py-4">
                <Loader2 className="animate-spin text-primary-400" size={18} />
              </li>
            ) : filtered.length === 0 ? (
              <li className="text-xs text-slate-500 px-3 py-3 text-center">{emptyMessage}</li>
            ) : (
              filtered.map((opt) => (
                <li key={String(opt.value)}>
                  <button
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      String(opt.value) === String(value)
                        ? 'bg-primary-500/15 text-primary-400 font-medium'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
