import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compactAnnotLabel,
  normalizeAnnotGeometry,
  toProfessionalAnnotations,
  isRenderableAnnot,
} from './annotationEngine';
import type { WolfEvidenceItem } from './wolfEvidence';

const mk = (
  partial: Partial<WolfEvidenceItem> & Pick<WolfEvidenceItem, 'id' | 'type'>,
): WolfEvidenceItem => ({
  title: 'Untitled',
  description: '',
  confidence: 'high',
  bbox: { x: 0.1, y: 0.2, width: 0.8, height: 0.4 },
  ...partial,
});

describe('annotation engine V3', () => {
  it('rejects giant full-chart boxes', () => {
    assert.equal(
      isRenderableAnnot(
        mk({
          id: 'bad',
          type: 'resistance',
          bbox: { x: 0.02, y: 0.02, width: 0.95, height: 0.9 },
        }),
      ),
      false,
    );
  });

  it('shrinks tall resistance into thin hline geometry', () => {
    const item = mk({
      id: 'r1',
      type: 'resistance',
      title: 'R1 · 24610',
      bbox: { x: 0.05, y: 0.2, width: 0.9, height: 0.35 },
    });
    const g = normalizeAnnotGeometry(item, 'hline');
    assert.ok(g.height <= 0.02);
    assert.ok(g.width >= 0.8);
  });

  it('keeps entry as narrow zone', () => {
    const item = mk({
      id: 'e1',
      type: 'entry',
      title: 'ENTRY · 24585–24595',
      bbox: { x: 0.2, y: 0.5, width: 0.5, height: 0.25 },
    });
    const g = normalizeAnnotGeometry(item, 'zone_narrow');
    assert.ok(g.height <= 0.085);
    assert.ok(g.width <= 0.42);
  });

  it('compacts bare titles', () => {
    assert.match(
      compactAnnotLabel(mk({ id: '1', type: 'target', title: 'TARGET' })),
      /TP1/,
    );
    assert.equal(
      compactAnnotLabel(mk({ id: '2', type: 'resistance', title: 'R1 · 24,610' })),
      'R1 · 24,610',
    );
  });

  it('omits entry when allowEntry false', () => {
    const anns = toProfessionalAnnotations(
      [
        mk({ id: 'r', type: 'resistance', title: 'R1 · 100', bbox: { x: 0.1, y: 0.3, width: 0.8, height: 0.05 } }),
        mk({ id: 'e', type: 'entry', title: 'ENTRY · 90', bbox: { x: 0.2, y: 0.5, width: 0.3, height: 0.06 } }),
      ],
      { allowEntry: false },
    );
    assert.equal(anns.some((a) => a.type === 'ENTRY'), false);
    assert.equal(anns.some((a) => a.type === 'RESISTANCE'), true);
  });
});
