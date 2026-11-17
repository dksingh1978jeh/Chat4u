import React from 'react';
import { motion } from 'motion/react';
import { Lock } from 'lucide-react';

export const SplashScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between py-12 px-6 bg-slate-50 dark:bg-[#0B141A] text-slate-900 dark:text-slate-100">
      <div />
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center gap-5"
      >
        <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg shadow-emerald-950/15 ring-1 ring-emerald-500/20">
          <img
            src="/src/assets/images/smartconnect_brand_mark_1794902759940.jpg"
            alt="SmartConnect Logo"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            SmartConnect
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time messaging, voice &amp; HD video
          </p>
        </div>
      </motion.div>

      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
        <span>End-to-end encrypted</span>
      </div>
    </div>
  );
};
