/** Volume expansion / contraction relative to average. */
import type { Candle } from './radarTypes';
import { volumeRatio } from './TechnicalEngine';

export type VolumeState = 'EXPANDING' | 'CONTRACTING' | 'NORMAL' | 'UNUSUAL';

export type VolumeEvent = {
  state: VolumeState;
  ratio: number;
  note: string;
};

export function detectVolume(candles: Candle[]): VolumeEvent {
  const ratio = volumeRatio(candles, 20) ?? 1;
  if (ratio >= 2.2) {
    return { state: 'UNUSUAL', ratio, note: `Unusual volume ×${ratio.toFixed(2)} vs 20-bar avg` };
  }
  if (ratio >= 1.35) {
    return { state: 'EXPANDING', ratio, note: `Volume expanding ×${ratio.toFixed(2)}` };
  }
  if (ratio <= 0.65) {
    return { state: 'CONTRACTING', ratio, note: `Volume contracting ×${ratio.toFixed(2)}` };
  }
  return { state: 'NORMAL', ratio, note: `Volume near average ×${ratio.toFixed(2)}` };
}
