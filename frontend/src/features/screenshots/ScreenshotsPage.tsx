import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Calendar, ZoomIn, Trash2, Download, RefreshCw, X, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui';
import { screenshotService } from '../../api/screenshotService';
import { monitoringService } from '../../api/monitoringService';
import { useAuthStore } from '../../store/authStore';
import { useState, useEffect } from 'react';

const ScreenshotsPage = () => {
  const { accessToken } = useAuthStore();
  const [screenshots, setScreenshots] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedScreenshot, setSelectedScreenshot] = useState<any | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureToast, setCaptureToast] = useState<string | null>(null);
  
  // Default to today
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const isDesktop = monitoringService.isDesktop;

  const fetchScreenshots = async () => {
    try {
      setIsLoading(true);
      const filters: any = {};
      if (selectedDate) {
        // Backend compares with captured_at, so include full day range
        filters.start_date = `${selectedDate} 00:00:00`;
        filters.end_date = `${selectedDate} 23:59:59`;
      }
      
      const response = await screenshotService.getAll(filters);
      setScreenshots(response.data);
    } catch (error) {
      console.error('Failed to fetch screenshots', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchScreenshots();
  }, [selectedDate]);

  const handleDelete = async (id: number) => {
    try {
      await screenshotService.delete(id);
      setScreenshots(screenshots.filter(s => s.id !== id));
    } catch (error) {
      console.error('Failed to delete screenshot', error);
    }
  };

  const handleCaptureNow = async () => {
    setIsCapturing(true);
    try {
      const result = await monitoringService.captureNow();
      if (result.success) {
        setCaptureToast('✅ Screenshot captured!');
        // Small delay to ensure DB is updated before fetch
        setTimeout(() => fetchScreenshots(), 2000); 
      } else {
        setCaptureToast(result.error || '❌ Capture failed. Start a timer first.');
      }
    } catch {
      setCaptureToast('❌ Capture failed.');
    } finally {
      setIsCapturing(false);
      setTimeout(() => setCaptureToast(null), 3000);
    }
  };

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-8">
      {/* Toast */}
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
          <p className="text-slate-400">Monitor work progress with periodic desktop captures.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
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
                  onChange={(e) => setSelectedDate(e.target.value)}
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
          
          {selectedDate !== new Date().toISOString().split('T')[0] && (
            <button 
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className="text-xs font-bold text-primary-400 hover:text-primary-300 hover:underline px-2"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {screenshots.length === 0 && !isLoading && (
        <div className="glass-card flex flex-col items-center justify-center py-20 text-center">
          <Camera className="w-16 h-16 text-slate-700 mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No screenshots found</h3>
          <p className="text-slate-400 max-w-sm mb-6">
            There are no screenshots for {selectedDate === new Date().toISOString().split('T')[0] ? 'today' : selectedDate}.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}>
            Go to Today
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {screenshots.map((item, index) => {
          const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';
          const imageUrl = `${baseUrl}/screenshots/view/${item.id}?token=${accessToken}`;
          const isBlurred = item.is_blurred === "1" || item.is_blurred === true;
          
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="glass-card group relative overflow-hidden p-0 border-white/5"
            >
              <div 
                className={`aspect-video w-full overflow-hidden cursor-pointer ${isBlurred ? 'blur-md grayscale' : ''}`}
                onClick={() => setSelectedScreenshot(item)}
              >
                <img 
                  src={imageUrl} 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                  alt="Workspace capture" 
                />
              </div>
              
              <div className="p-4 bg-surface-800/80 backdrop-blur-sm border-t border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center text-[10px] text-primary-400 font-bold uppercase">
                      ID
                    </div>
                    <span className="text-sm font-semibold text-white">Capture #{item.id}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">
                    {new Date(item.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${item.activity_level}%` }}
                        className={`h-full ${item.activity_level > 70 ? 'bg-green-500' : item.activity_level > 30 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500">{item.activity_level}% Activity</span>
                  </div>
                  
                  <div className="flex gap-1">
                    <button 
                      onClick={() => setSelectedScreenshot(item)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-primary-400 transition-all"
                    >
                      <ZoomIn size={14} />
                    </button>
                    <button 
                      onClick={() => {
                        if(confirm('Delete this screenshot?')) handleDelete(item.id);
                      }}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-accent transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
 
              {isBlurred && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="glass px-4 py-2 rounded-xl text-xs font-bold text-white uppercase tracking-widest border border-white/20">
                    Blurred Content
                  </div>
                </div>
              )}
              
              <motion.div 
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
                className="absolute top-4 right-4"
              >
                <a 
                  href={imageUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl glass text-white hover:bg-primary-500 transition-colors shadow-2xl inline-block"
                >
                  <Download size={16} />
                </a>
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      {/* Screenshot Preview Modal */}
      <AnimatePresence>
        {selectedScreenshot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-sm"
            onClick={() => setSelectedScreenshot(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl glass-card p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Image — shrinks to fit, no extra space */}
              <div className="bg-slate-950 overflow-hidden">
                <img 
                  src={`${import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1'}/screenshots/view/${selectedScreenshot.id}?token=${accessToken}`}
                  className="w-full max-h-[70vh] object-contain block"
                  alt="Full size capture"
                />
              </div>

              {/* Footer Info */}
              <div className="p-4 bg-surface-900 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 font-bold text-xs">
                    ID
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-sm">Screenshot #{selectedScreenshot.id}</h3>
                    <p className="text-slate-400 text-xs">
                      Captured at {new Date(selectedScreenshot.captured_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button 
                    variant="secondary" 
                    size="sm"
                    className="flex-1 sm:flex-none"
                    onClick={() => {
                        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';
                        window.open(`${baseUrl}/screenshots/view/${selectedScreenshot.id}?token=${accessToken}`, '_blank');
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <Button 
                    variant="primary"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    onClick={() => setSelectedScreenshot(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>

              <button 
                onClick={() => setSelectedScreenshot(null)}
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
