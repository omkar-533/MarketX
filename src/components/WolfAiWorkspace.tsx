/**
 * Wolf AI is retired from the product. Any leftover wolf-ai route
 * must open LIVE WOLF — never the chart-upload chat desk.
 */
import { useEffect } from 'react';
import LiveWolfRoute from './masterai/live/LiveWolfRoute';
import { LIVE_WOLF_OPEN_EVENT } from '../services/live/liveBridge';

export default function WolfAiWorkspace() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(LIVE_WOLF_OPEN_EVENT));
  }, []);

  return <LiveWolfRoute />;
}
