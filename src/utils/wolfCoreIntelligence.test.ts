/**
 * Smoke tests for lens rules + similarity validator + analysis result builder.
 * Run: npx tsx --test src/utils/wolfCoreIntelligence.test.ts
 * (or vitest if configured — self-contained asserts below for node:test)
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lensRulesFor } from './wolfLensRules';
import { validateLensDifference } from './lensSimilarity';
import { buildAnalysisResult, evidenceToAnnotations } from './analysisResult';
import type { AnalysisLayer } from './wolfConsensus';
import type { WolfEvidenceItem } from './wolfEvidence';
import type { WolfSetupAnalysis } from './parseWolfSetupReply';

describe('lens rules differ by mode', () => {
  it('SMC and Price Action rules are distinct', () => {
    const smc = lensRulesFor('smc');
    const pa = lensRulesFor('price_action');
    assert.notEqual(smc, pa);
    assert.match(smc, /SMC|liquidity sweep|BOS/i);
    assert.match(pa, /PRICE ACTION|breakout/i);
    assert.doesNotMatch(pa, /order blocks/i);
  });

  it('Liquidity focuses on pools', () => {
    assert.match(lensRulesFor('liquidity'), /WHERE IS LIQUIDITY/i);
  });
});

describe('lens similarity validator', () => {
  const mkAnalysis = (story: string, entry: string): WolfSetupAnalysis => ({
    bias: 'LONG',
    setup: 'Test',
    status: 'WAITING',
    keyObservation: story,
    nextAction: 'Wait',
    entry,
    stopLoss: 'Below X',
    target: 'Next high',
    invalidation: 'Below X',
    evidenceScore: 50,
    why: [story],
    alternative: 'Fails if reclaim fails',
    assumptions: '',
    raw: '',
  });

  const ev = (type: WolfEvidenceItem['type'], title: string): WolfEvidenceItem => ({
    id: `${type}-${title}`,
    type,
    title,
    description: title,
    bbox: { x: 0.2, y: 0.3, width: 0.2, height: 0.1 },
    confidence: 'high',
  });

  it('flags near-identical layers', () => {
    const layer: AnalysisLayer = {
      id: 'l1',
      mode: 'smc',
      label: 'SMC',
      text: '',
      analysis: mkAnalysis('Price swept low and reclaimed', 'Retest OB'),
      evidenceIds: [],
      evidenceTypes: ['sweep', 'bos'],
      createdAt: 1,
      visible: true,
    };
    const report = validateLensDifference({
      currentMode: 'price_action',
      currentAnalysis: mkAnalysis('Price swept low and reclaimed', 'Retest OB'),
      currentEvidence: [ev('sweep', 'Sweep'), ev('bos', 'BOS')],
      layers: [layer],
    });
    assert.equal(report.warning, true);
    assert.equal(report.code, 'LENS_SIMILARITY_WARNING');
  });

  it('allows same bias with different entry logic', () => {
    const layer: AnalysisLayer = {
      id: 'l1',
      mode: 'smc',
      label: 'SMC',
      text: '',
      analysis: mkAnalysis('Liquidity sweep then BOS', 'Wait for OB retest'),
      evidenceIds: [],
      evidenceTypes: ['sweep', 'bos', 'order_block'],
      createdAt: 1,
      visible: true,
    };
    const report = validateLensDifference({
      currentMode: 'price_action',
      currentAnalysis: mkAnalysis('Bullish breakout from range', 'Candle confirmation above resistance'),
      currentEvidence: [ev('breakout', 'Break'), ev('confirmation', 'Close')],
      layers: [layer],
    });
    assert.equal(report.warning, false);
  });
});

describe('analysis result + annotations', () => {
  it('builds annotations from evidence bboxes', () => {
    const evidence: WolfEvidenceItem[] = [
      {
        id: 'a1',
        type: 'sweep',
        title: 'SSL sweep',
        description: 'Took lows',
        bbox: { x: 0.4, y: 0.7, width: 0.15, height: 0.1 },
        confidence: 'high',
      },
    ];
    const anns = evidenceToAnnotations(evidence, 'smc');
    assert.equal(anns.length, 1);
    assert.equal(anns[0].geometry.type, 'RECTANGLE');
    assert.equal(anns[0].geometry.x, 0.4);

    const result = buildAnalysisResult({
      text: 'Market Bias: WAIT\nKey Observation: Sweep then reclaim\nNext Action: Wait retest\n',
      lens: 'smc',
      evidence,
    });
    assert.equal(result.lens, 'smc');
    assert.ok(result.annotations.length >= 1);
  });
});
