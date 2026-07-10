import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface Props {
  page: number;
  totalPages?: number;
  total?: number;
  hasMore?: boolean;
  loading?: boolean;
  onPrev: () => void;
  onNext: () => void;
  label?: string;
}

const ListPagination = ({
  page,
  totalPages,
  total,
  hasMore = false,
  loading = false,
  onPrev,
  onNext,
  label = 'Page',
}: Props) => {
  const canPrev = page > 1;
  const canNext = totalPages ? page < totalPages : hasMore;

  if (!canPrev && !canNext && page === 1) return null;

  return (
    <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-t border-white/5 bg-white/[0.02]">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev || loading}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none"
      >
        <ChevronLeft size={14} /> Prev
      </button>
      <span className="text-[11px] text-slate-500 text-center">
        {label} {page}
        {totalPages ? ` of ${totalPages}` : ''}
        {total !== undefined ? ` · ${total} total` : ''}
        {loading && <Loader2 size={12} className="inline ml-1 animate-spin" />}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext || loading}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none"
      >
        Next <ChevronRight size={14} />
      </button>
    </div>
  );
};

export default ListPagination;
