import { useState } from 'react';
import { 
  BarChart3, 
  Layers, 
  Activity, 
  Target, 
  Calculator, 
  ScanLine, 
  TrendingUp,
  PieChart,
  Globe,
  Menu,
  X,
  Zap,
  Crown
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'optionchain', label: 'Option Chain', icon: Layers },
  { id: 'pcr', label: 'PCR Analysis', icon: Activity },
  { id: 'maxpain', label: 'Max Pain', icon: Target },
  { id: 'strategy', label: 'Strategy Builder', icon: Zap },
  { id: 'greeks', label: 'Greeks Calculator', icon: Calculator },
  { id: 'scanner', label: 'Stock Scanner', icon: ScanLine },
  { id: 'breadth', label: 'Market Breadth', icon: PieChart },
  { id: 'fiidii', label: 'FII/DII Data', icon: TrendingUp },
  { id: 'global', label: 'Global Markets', icon: Globe },
];

export default function Navbar({ activeTab, onTabChange }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="bg-[#0d1220] border-b border-[#1e293b] sticky top-0 z-50 shadow-lg shadow-black/20">
      <div className="max-w-[1600px] mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gold rounded-xl flex items-center justify-center shadow-lg shadow-[#d4af37]/20">
              <Crown className="w-5 h-5 text-[#0d1220]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gold tracking-wide">Master TradeX</h1>
              <p className="text-[10px] text-slate-500 -mt-0.5 font-medium tracking-wider uppercase">NSE Options Analytics</p>
            </div>
          </div>
          
          <div className="hidden xl:flex items-center gap-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive 
                      ? 'bg-gold-15 text-gold border border-gold-30' 
                      : 'text-slate-400 hover:text-gold-light hover:bg-gold-10'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gold-10 border border-gold-30 rounded-full">
              <div className="w-2 h-2 bg-gold rounded-full animate-pulse shadow-lg shadow-[#d4af37]/50" />
              <span className="text-xs font-semibold text-gold tracking-wider uppercase">LIVE</span>
            </div>
            <button 
              className="xl:hidden p-2 text-slate-400 hover:text-gold transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="xl:hidden border-t border-[#1e293b] bg-[#0d1220]/95 backdrop-blur">
          <div className="px-4 py-3 grid grid-cols-2 gap-2">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { onTabChange(tab.id); setMobileOpen(false); }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive 
                      ? 'bg-gold-15 text-gold border border-gold-30' 
                      : 'text-slate-400 hover:text-gold-light hover:bg-gold-10'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
