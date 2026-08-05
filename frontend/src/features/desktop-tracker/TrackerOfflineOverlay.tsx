import { AnimatePresence, motion } from 'framer-motion';
import { WifiOff } from 'lucide-react';

type Props = {
  visible: boolean;
};

/**
 * Trackabi-style offline veil over dashboard content.
 * Timer controls stay usable above this layer.
 */
export function TrackerOfflineOverlay({ visible }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 z-30 flex items-center justify-center bg-[#0A0D14]/94 px-6 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
        >
          <div className="max-w-[280px] text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/12 text-rose-400 ring-1 ring-rose-500/20">
              <WifiOff className="h-8 w-8" strokeWidth={1.75} />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-white">You are offline</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Some features are available online only. While you are offline, you can still use the timer.
              Your data will be synchronized with the server once the connection is restored.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
