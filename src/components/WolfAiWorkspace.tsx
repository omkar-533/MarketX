import { useEffect, useState } from 'react';
import { Bot, Bookmark, BookMarked, Radar } from 'lucide-react';
import MasterAI from './MasterAI';
import WolfRadarPage from './masterai/radar/WolfRadarPage';
import MySetupsPanel from './masterai/radar/MySetupsPanel';
import WatchlistPanel from './masterai/radar/WatchlistPanel';
import {
  RADAR_OPEN_EVENT,
  type WolfAiDeskTab,
} from '../services/radar/radarBridge';

const TABS: { id: WolfAiDeskTab; label: string; icon: typeof Bot }[] = [
  { id: 'analyst', label: 'AI ANALYST', icon: Bot },
  { id: 'radar', label: 'WOLF RADAR', icon: Radar },
  { id: 'setups', label: 'MY SETUPS', icon: BookMarked },
  { id: 'watchlist', label: 'WATCHLIST', icon: Bookmark },
];

export default function WolfAiWorkspace() {
  const [desk, setDesk] = useState<WolfAiDeskTab>('analyst');

  useEffect(() => {
    const openRadar = () => setDesk('radar');
    window.addEventListener(RADAR_OPEN_EVENT, openRadar);
    return () => window.removeEventListener(RADAR_OPEN_EVENT, openRadar);
  }, []);

  return (
    <div className={`wolf-ai-workspace ${desk === 'analyst' ? 'is-analyst' : 'is-panel'}`}>
      <nav className="wolf-ai-workspace__nav" aria-label="Wolf AI modes">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const on = desk === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`wolf-ai-workspace__tab ${on ? 'is-on' : ''}`}
              onClick={() => setDesk(tab.id)}
              aria-current={on ? 'page' : undefined}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="wolf-ai-workspace__body">
        <div className={desk === 'analyst' ? 'wolf-ai-workspace__pane is-show' : 'wolf-ai-workspace__pane'}>
          <MasterAI />
        </div>
        {desk === 'radar' && <WolfRadarPage onAnalyze={() => setDesk('analyst')} />}
        {desk === 'setups' && <MySetupsPanel onScanSetup={() => setDesk('radar')} />}
        {desk === 'watchlist' && (
          <WatchlistPanel onAnalyze={() => setDesk('analyst')} onOpenRadar={() => setDesk('radar')} />
        )}
      </div>
    </div>
  );
}
