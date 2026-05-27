import { CHARTINK_SCAN_PRESETS } from './chartinkScreenerEngine';
import {
  findTradeFinderPreset,
  TRADEFINDER_CATEGORIES,
  TRADEFINDER_SCAN_PRESETS,
  type TradeFinderScanPreset,
} from './tradefinderScans';
import type { FilterGroup } from '../types/screener';

export type ScanPresetBundle = {
  label: string;
  description: string;
  groups: FilterGroup[];
  source: 'chartink' | 'tradefinder';
  slug?: string;
  category?: string;
};

export function getAllScanPresets(): ScanPresetBundle[] {
  const chartink = CHARTINK_SCAN_PRESETS.map((p) => ({
    label: p.label,
    description: p.description,
    groups: p.groups,
    source: 'chartink' as const,
    slug: p.label.toLowerCase().replace(/\s+/g, '-'),
  }));
  const tradefinder = TRADEFINDER_SCAN_PRESETS.map((p) => ({
    label: p.label,
    description: p.description,
    groups: p.groups,
    source: 'tradefinder' as const,
    slug: p.slug,
    category: p.category,
  }));
  return [...tradefinder, ...chartink];
}

export function findScanPresetByQuery(query: string): ScanPresetBundle | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;

  const tf = findTradeFinderPreset(q);
  if (tf) {
    return {
      label: tf.label,
      description: tf.description,
      groups: tf.groups,
      source: 'tradefinder',
      slug: tf.slug,
      category: tf.category,
    };
  }

  const chartink = CHARTINK_SCAN_PRESETS.find(
    (p) =>
      p.label.toLowerCase() === q ||
      p.label.toLowerCase().replace(/\s+/g, '-') === q ||
      q.includes(p.label.toLowerCase()),
  );
  if (chartink) {
    return {
      label: chartink.label,
      description: chartink.description,
      groups: chartink.groups,
      source: 'chartink',
    };
  }

  return undefined;
}

export { TRADEFINDER_SCAN_PRESETS, TRADEFINDER_CATEGORIES, findTradeFinderPreset };
export type { TradeFinderScanPreset };
