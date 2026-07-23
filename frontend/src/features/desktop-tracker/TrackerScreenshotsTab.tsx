import { useCallback, useEffect, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Loader2, ZoomIn, X } from 'lucide-react';
import { screenshotService } from '../../api/screenshotService';
import { useAuthStore } from '../../store/authStore';
import { areOwnScreenshotsHidden } from '../../utils/access';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError } from '../../store/toastStore';

const PER_PAGE = 9;

interface Props {
  selectedDate: string;
  refreshToken?: number;
}

export function TrackerScreenshotsTab({ selectedDate, refreshToken = 0 }: Props) {
  const user = useAuthStore((s) => s.user);
  const ownHidden = areOwnScreenshotsHidden(user);

  const [screenshots, setScreenshots] = useState<any[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    current_page: 1,
    per_page: PER_PAGE,
    total: 0,
    total_pages: 1,
  });

  const revokeUrls = useCallback((urls: Record<number, string>) => {
    Object.values(urls).forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  }, []);

  const fetchScreenshots = useCallback(async () => {
    if (ownHidden) {
      setScreenshots([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const resp = await screenshotService.getAll({
        start_date: `${selectedDate} 00:00:00`,
        end_date: `${selectedDate} 23:59:59`,
        page,
        per_page: PER_PAGE,
      });
      const list = resp.data ?? [];
      setScreenshots(list);
      setPagination(resp.pagination ?? {
        current_page: page,
        per_page: PER_PAGE,
        total: list.length,
        total_pages: 1,
      });

      setThumbUrls((prev) => {
        revokeUrls(prev);
        return {};
      });

      const thumbs: Record<number, string> = {};
      await Promise.all(
        list.map(async (item: { id: number }) => {
          try {
            thumbs[item.id] = await screenshotService.getThumbnailBlobUrl(item.id);
          } catch {
            // skip
          }
        }),
      );
      setThumbUrls(thumbs);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Failed to load screenshots'));
      setScreenshots([]);
    } finally {
      setLoading(false);
    }
  }, [ownHidden, page, revokeUrls, selectedDate]);

  useEffect(() => {
    setPage(1);
  }, [selectedDate]);

  useEffect(() => {
    void fetchScreenshots();
  }, [fetchScreenshots, refreshToken]);

  useEffect(() => () => revokeUrls(thumbUrls), [revokeUrls, thumbUrls]);

  const openFull = async (shot: any) => {
    setSelected(shot);
    setFullUrl(null);
    try {
      const url = await screenshotService.getImageBlobUrl(shot.id);
      setFullUrl(url);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Failed to load image'));
    }
  };

  const closeFull = () => {
    if (fullUrl) URL.revokeObjectURL(fullUrl);
    setFullUrl(null);
    setSelected(null);
  };

  if (ownHidden) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        Screenshot viewing is disabled for your account.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      ) : screenshots.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          No screenshots for this day. Captures appear automatically while the timer runs.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {screenshots.map((shot) => (
              <button
                key={shot.id}
                type="button"
                onClick={() => void openFull(shot)}
                className="group relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black/40"
              >
                {thumbUrls[shot.id] ? (
                  <img src={thumbUrls[shot.id]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-600">
                    <Camera className="h-5 w-5" />
                  </div>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <ZoomIn className="h-5 w-5 text-white" />
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-slate-500">
              {pagination.total} capture{pagination.total === 1 ? '' : 's'}
              {pagination.total_pages > 1 && ` · Page ${pagination.current_page} of ${pagination.total_pages}`}
            </p>
            {pagination.total_pages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:text-white disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs tabular-nums text-slate-400">
                  {pagination.current_page} / {pagination.total_pages}
                </span>
                <button
                  type="button"
                  disabled={page >= pagination.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:text-white disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={closeFull}>
          <div className="relative max-h-[85vh] max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={closeFull}
              className="absolute -right-2 -top-2 rounded-full bg-slate-800 p-1.5 text-white hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
            {fullUrl ? (
              <img src={fullUrl} alt="Screenshot" className="max-h-[85vh] rounded-xl border border-white/10" />
            ) : (
              <div className="flex h-48 w-72 items-center justify-center rounded-xl bg-slate-900">
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
