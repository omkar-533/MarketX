import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Command, ArrowRight } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

const commands = [
  { id: 'dashboard', label: 'Go to Dashboard', shortcut: 'D' },
  { id: 'ltpcalc', label: 'LPT Master', shortcut: 'L' },
  { id: 'tradingjournal', label: 'Open Trading Journal', shortcut: 'J' },
  { id: 'optionchain', label: 'Open Option Chain', shortcut: 'O' },
  { id: 'optionsimulator', label: 'Open Option Simulator', shortcut: 'V' },
  { id: 'strategy', label: 'Strategy Builder', shortcut: 'S' },
  { id: 'oiintelligence', label: 'OI Intelligence', shortcut: 'I' },
  { id: 'papertrading', label: 'Paper Trading Terminal', shortcut: 'P' },
  { id: 'futures', label: 'Futures Analytics', shortcut: 'F' },
  { id: 'heatmap', label: 'Market Heatmap', shortcut: 'H' },
];

export default function CommandPalette({ isOpen, onClose, onNavigate }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = commands.filter(c => c.label.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') setSelectedIndex(prev => (prev + 1) % filtered.length);
      if (e.key === 'ArrowUp') setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
      if (e.key === 'Enter' && filtered[selectedIndex]) {
        onNavigate(filtered[selectedIndex].id);
        onClose();
      }
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onNavigate, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-lg bg-[#0b0e17] border border-[#1a1f2e] rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-[#1a1f2e]">
          <Search className="w-5 h-5 text-slate-500" />
          <input 
            autoFocus
            type="text" 
            placeholder="Type a command or search..." 
            className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-slate-600"
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedIndex(0); }}
          />
          <div className="flex items-center gap-1 text-[10px] text-slate-600 bg-[#121520] px-2 py-1 rounded border border-[#1a1f2e]">
            <Command className="w-3 h-3" /> K
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2">
          {filtered.map((cmd, idx) => (
            <button
              key={cmd.id}
              onClick={() => { onNavigate(cmd.id); onClose(); }}
              className={`w-full flex items-center justify-between p-3 rounded-lg text-sm transition-colors ${idx === selectedIndex ? 'bg-[#d4af37]/10 text-[#d4af37]' : 'text-slate-400 hover:bg-[#121520]'}`}
            >
              <span>{cmd.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-[#1a1f2e] px-1.5 py-0.5 rounded text-slate-500">{cmd.shortcut}</span>
                {idx === selectedIndex && <ArrowRight className="w-4 h-4" />}
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div className="p-4 text-center text-xs text-slate-600">No results found</div>}
        </div>
      </motion.div>
    </div>
  );
}