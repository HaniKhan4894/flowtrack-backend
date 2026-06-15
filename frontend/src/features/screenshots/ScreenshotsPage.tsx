import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Calendar, ZoomIn, Trash2, Download, RefreshCw, X, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui';
import { screenshotService } from '../../api/screenshotService';
import { monitoringService } from '../../api/monitoringService';
import { TeamMemberFilter } from '../../components/TeamMemberFilter';
import { useAuthStore } from '../../store/authStore';
import { canViewMemberTracking, hasPermission } from '../../utils/access';
import { Link } from 'react-router-dom';

const PER_PAGE = 12;

const ScreenshotsPage = () => {
  const { user } = useAuthStore();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [viewingMemberName, setViewingMemberName] = useState('');
  const [screenshots, setScreenshots] = useState<any[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({});
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFull, setIsLoadingFull] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState<any | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureToast, setCaptureToast] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ current_page: 1, per_page: PER_PAGE, total: 0, total_pages: 1 });

  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const isDesktop = monitoringService.isDesktop;
  const canDeleteScreenshots = hasPermission(user, 'screenshots.delete');

  const revokeUrls = useCallback((urls: Record<number, string>) => {
    Object.values(urls).forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  }, []);

  const fetchScreenshots = useCallback(async () => {
    try {
      setIsLoading(true);
      const filters: Record<string, string | number> = {
        page,
        per_page: PER_PAGE,
      };
      if (selectedDate) {
        filters.start_date = `${selectedDate} 00:00:00`;
        filters.end_date = `${selectedDate} 23:59:59`;
      }
      if (canViewMemberTracking(user) && selectedUserId) {
        filters.user_id = selectedUserId;
      }

      const response = await screenshotService.getAll(filters);
      const nextScreenshots = response.data ?? [];
      setScreenshots(nextScreenshots);
      setPagination(response.pagination ?? { current_page: page, per_page: PER_PAGE, total: nextScreenshots.length, total_pages: 1 });

      setThumbUrls((prev) => {
        revokeUrls(prev);
        return {};
      });

      const entries = await Promise.all(
        nextScreenshots.map(async (item: any) => {
          try {
            const blobUrl = await screenshotService.getThumbnailBlobUrl(item.id);
            return [item.id, blobUrl] as const;
          } catch {
            return [item.id, ''] as const;
          }
        })
      );
      setThumbUrls(Object.fromEntries(entries));
    } catch (error) {
      console.error('Failed to fetch screenshots', error);
      setScreenshots([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, selectedDate, selectedUserId, user, revokeUrls]);

  useEffect(() => {
    fetchScreenshots();
  }, [fetchScreenshots]);

  useEffect(() => {
    return () => {
      revokeUrls(thumbUrls);
      if (fullImageUrl) URL.revokeObjectURL(fullImageUrl);
    };
  }, [thumbUrls, fullImageUrl, revokeUrls]);

  const openScreenshot = async (item: any) => {
    setSelectedScreenshot(item);
    setIsLoadingFull(true);
    if (fullImageUrl) {
      URL.revokeObjectURL(fullImageUrl);
      setFullImageUrl(null);
    }
    try {
      const url = await screenshotService.getImageBlobUrl(item.id);
      setFullImageUrl(url);
    } catch (error) {
      console.error('Failed to load full screenshot', error);
    } finally {
      setIsLoadingFull(false);
    }
  };

  const closeScreenshot = () => {
    setSelectedScreenshot(null);
    if (fullImageUrl) {
      URL.revokeObjectURL(fullImageUrl);
      setFullImageUrl(null);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await screenshotService.delete(id);
      if (screenshots.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        fetchScreenshots();
      }
    } catch (error) {
      console.error('Failed to delete screenshot', error);
    }
  };

  const handleCaptureNow = async () => {
    setIsCapturing(true);
    try {
      const result = await monitoringService.captureNow();
      if (result.success) {
        const count = result.capturedScreens ?? 1;
        setCaptureToast(`Screenshot captured from ${count} screen${count > 1 ? 's' : ''}!`);
        setTimeout(() => fetchScreenshots(), 2000);
      } else {
        setCaptureToast(result.error || 'Capture failed. Start a timer first.');
      }
    } catch {
      setCaptureToast('Capture failed.');
    } finally {
      setIsCapturing(false);
      setTimeout(() => setCaptureToast(null), 3000);
    }
  };

  const changeDate = (days: number) => {
    const d = new Date(`${selectedDate}T12:00:00`);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
    setPage(1);
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-8">
      {user?.features?.screenshots === false && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-amber-200">Screenshots are not available on the Free plan — time tracking only.</p>
          <Link to="/billing" className="text-xs font-bold text-amber-300 hover:underline whitespace-nowrap">Upgrade plan</Link>
        </div>
      )}

      {captureToast && (
        <div className="fixed top-6 right-6 z-50 bg-surface-700 border border-white/10 text-white px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold">
          {captureToast}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
            <Camera className="text-primary-400" />
            Screenshots
          </h1>
          <p className="text-slate-400">
            {viewingMemberName && canViewMemberTracking(user)
              ? `Screenshots for ${viewingMemberName}.`
              : 'Monitor work progress with periodic desktop captures.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <TeamMemberFilter
            selectedUserId={selectedUserId}
            onChange={(id, member) => {
              setSelectedUserId(id);
              setViewingMemberName(member ? `${member.first_name} ${member.last_name}` : '');
              setPage(1);
            }}
          />
          {isDesktop && (
            <Button variant="primary" size="sm" onClick={handleCaptureNow} isLoading={isCapturing}>
              <Zap className="w-4 h-4 mr-2" />
              Capture Now
            </Button>
          )}

          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 h-[38px]">
            <button onClick={() => changeDate(-1)} className="p-1 hover:bg-white/10 rounded-lg text-slate-400">
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-2 px-1">
              <Calendar size={14} className="text-primary-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent border-0 text-xs font-bold text-white p-0 focus:ring-0 w-28 uppercase"
              />
            </div>
            <button onClick={() => changeDate(1)} className="p-1 hover:bg-white/10 rounded-lg text-slate-400">
              <ChevronRight size={16} />
            </button>
          </div>

          <Button variant="secondary" size="sm" onClick={fetchScreenshots} isLoading={isLoading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>

          {selectedDate !== today && (
            <button
              onClick={() => {
                setSelectedDate(today);
                setPage(1);
              }}
              className="text-xs font-bold text-primary-400 hover:text-primary-300 hover:underline px-2"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      ) : screenshots.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-20 text-center">
          <Camera className="w-16 h-16 text-slate-700 mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No screenshots found</h3>
          <p className="text-slate-400 max-w-sm mb-6">
            There are no screenshots for {selectedDate === today ? 'today' : selectedDate}.
          </p>
          <Button variant="secondary" size="sm" onClick={() => { setSelectedDate(today); setPage(1); }}>
            Go to Today
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {screenshots.map((item, index) => {
              const imageUrl = thumbUrls[item.id] || '';
              const isBlurred = item.is_blurred === '1' || item.is_blurred === true;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="glass-card group relative overflow-hidden p-0 border-white/5"
                >
                  <div
                    className={`aspect-video w-full overflow-hidden cursor-pointer bg-slate-900 ${isBlurred ? 'blur-md grayscale' : ''}`}
                    onClick={() => openScreenshot(item)}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        alt="Workspace capture"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                        Loading preview...
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-surface-800/80 backdrop-blur-sm border-t border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-white">#{item.id}</span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">
                        {new Date(item.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden shrink-0">
                          <div
                            style={{ width: `${item.activity_level}%` }}
                            className={`h-full ${item.activity_level > 70 ? 'bg-green-500' : item.activity_level > 30 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 truncate">{item.activity_level}%</span>
                      </div>

                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => openScreenshot(item)}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-primary-400 transition-all"
                        >
                          <ZoomIn size={14} />
                        </button>
                        {canDeleteScreenshots && (
                          <button
                            onClick={() => {
                              if (confirm('Delete this screenshot?')) handleDelete(item.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-accent transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {isBlurred && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="glass px-4 py-2 rounded-xl text-xs font-bold text-white uppercase tracking-widest border border-white/20">
                        Blurred
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-slate-400">
                Page {pagination.current_page} of {pagination.total_pages}
                <span className="text-slate-600 ml-2">({pagination.total} total)</span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= pagination.total_pages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {selectedScreenshot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
            onClick={closeScreenshot}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl max-h-[90vh] flex flex-col glass-card p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-center bg-slate-950 min-h-[200px] max-h-[calc(90vh-88px)] overflow-auto p-2">
                {isLoadingFull ? (
                  <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
                ) : fullImageUrl ? (
                  <img
                    src={fullImageUrl}
                    className="max-w-full max-h-[calc(90vh-100px)] w-auto h-auto object-contain mx-auto block"
                    alt="Full size capture"
                  />
                ) : (
                  <p className="text-slate-500 text-sm">Failed to load image</p>
                )}
              </div>

              <div className="p-4 bg-surface-900 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div>
                  <h3 className="text-white font-bold text-sm">Screenshot #{selectedScreenshot.id}</h3>
                  <p className="text-slate-400 text-xs">
                    {new Date(selectedScreenshot.captured_at).toLocaleString()} · {selectedScreenshot.activity_level}% activity
                  </p>
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    disabled={!fullImageUrl}
                    onClick={() => fullImageUrl && window.open(fullImageUrl, '_blank')}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <Button variant="primary" size="sm" className="flex-1 sm:flex-none" onClick={closeScreenshot}>
                    Close
                  </Button>
                </div>
              </div>

              <button
                onClick={closeScreenshot}
                className="absolute top-3 right-3 p-1.5 rounded-xl glass text-white hover:bg-white/10 transition-colors z-10"
              >
                <X size={18} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ScreenshotsPage;
