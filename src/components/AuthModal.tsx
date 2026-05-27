import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import AuthBrandPanel from './auth/AuthBrandPanel';
import AuthForm, { type AuthFormProps } from './auth/AuthForm';

interface AuthModalProps extends AuthFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose, ...formProps }: AuthModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-5"
        role="dialog"
        aria-modal="true"
      >
        <motion.div className="absolute inset-0 bg-[#030408]/92 backdrop-blur-2xl" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="relative w-full h-full sm:h-auto sm:max-h-[94vh] max-w-5xl overflow-hidden sm:rounded-[1.75rem] border border-[#1a1f2e]/90 bg-[#080a12] shadow-[0_0_80px_rgba(0,0,0,0.6)] grid lg:grid-cols-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#d4af37]/50 to-transparent z-20" />

          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 z-30 p-2.5 rounded-xl text-slate-500 hover:text-white bg-[#121520]/90 border border-[#1a1f2e] hover:border-[#2a3040] transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          <AuthBrandPanel variant="modal" />

          <div className="overflow-y-auto p-6 sm:p-8 lg:p-10 flex items-center">
            <div className="w-full max-w-md mx-auto">
              <AuthForm {...formProps} />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
