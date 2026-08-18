import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inspectLogoBoxPixels, isLogoCanvasPadding } from './stockLogo';

function paint(
  w: number,
  h: number,
  fill: (x: number, y: number) => [number, number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return data;
}

describe('inspectLogoBoxPixels', () => {
  it('fills ALKEM-style blue square sitting on a white canvas, not the white padding', () => {
    const data = paint(32, 32, (x, y) => {
      if (x >= 6 && x <= 25 && y >= 6 && y <= 25) return [21, 67, 168, 255];
      return [255, 255, 255, 255];
    });
    const found = inspectLogoBoxPixels(data, 32, 32);
    assert.ok(found);
    assert.equal(found.fill, 'rgb(21, 67, 168)');
    assert.equal(found.box.x, 6);
    assert.equal(found.box.w, 20);
  });

  it('fills a full-bleed brand square', () => {
    const data = paint(16, 16, () => [255, 122, 0, 255]);
    const found = inspectLogoBoxPixels(data, 16, 16);
    assert.ok(found);
    assert.equal(found.fill, 'rgb(255, 122, 0)');
  });

  it('leaves round marks on transparent canvas alone', () => {
    const data = paint(32, 32, (x, y) => {
      const dx = x - 15.5;
      const dy = y - 15.5;
      if (dx * dx + dy * dy <= 12 * 12) return [255, 120, 40, 255];
      return [0, 0, 0, 0];
    });
    assert.equal(inspectLogoBoxPixels(data, 32, 32), null);
  });

  it('leaves irregular / multi-colour marks alone', () => {
    const data = paint(24, 24, (x, y) => {
      if (x < 12 && y < 12) return [200, 20, 20, 255];
      if (x >= 12 && y < 12) return [20, 200, 20, 255];
      if (x < 12) return [20, 20, 200, 255];
      return [200, 200, 20, 255];
    });
    assert.equal(inspectLogoBoxPixels(data, 24, 24), null);
  });

  it('fills a rounded square whose corners are transparent (NMDC-style)', () => {
    const data = paint(32, 32, (x, y) => {
      const inBox = x >= 6 && x <= 25 && y >= 6 && y <= 25;
      if (!inBox) return [255, 255, 255, 255];
      const nearTL = x < 8 && y < 8;
      const nearTR = x > 23 && y < 8;
      const nearBL = x < 8 && y > 23;
      const nearBR = x > 23 && y > 23;
      if (nearTL || nearTR || nearBL || nearBR) return [0, 0, 0, 0];
      return [12, 92, 64, 255];
    });
    const found = inspectLogoBoxPixels(data, 32, 32);
    assert.ok(found);
    assert.equal(found.fill, 'rgb(12, 92, 64)');
  });

  it('uses the square border colour when the centre mark is a different colour', () => {
    const data = paint(32, 32, (x, y) => {
      if (x >= 6 && x <= 25 && y >= 6 && y <= 25) {
        if (x >= 12 && x <= 19 && y >= 12 && y <= 19) return [240, 240, 240, 255];
        return [178, 34, 34, 255];
      }
      return [255, 255, 255, 255];
    });
    const found = inspectLogoBoxPixels(data, 32, 32);
    assert.ok(found);
    assert.equal(found.fill, 'rgb(178, 34, 34)');
  });

  it('does not treat a white canvas as a brand square', () => {
    const data = paint(16, 16, () => [255, 255, 255, 255]);
    assert.equal(inspectLogoBoxPixels(data, 16, 16), null);
    assert.equal(isLogoCanvasPadding([255, 255, 255, 255]), true);
  });
});
