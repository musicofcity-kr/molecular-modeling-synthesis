import { describe, expect, it } from 'vitest';
import { detectAtomCandidates, type RgbaImageLike } from './atomDetection';

function createImage(width: number, height: number, background: readonly number[]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    data.set([...background, 255], offset);
  }

  return {
    image: { width, height, data } satisfies RgbaImageLike,
    circle(centerX: number, centerY: number, radius: number, rgb: readonly number[]) {
      for (let y = centerY - radius; y <= centerY + radius; y += 1) {
        for (let x = centerX - radius; x <= centerX + radius; x += 1) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          if ((x - centerX) ** 2 + (y - centerY) ** 2 > radius ** 2) continue;
          data.set([...rgb, 255], (y * width + x) * 4);
        }
      }
    },
    pixel(x: number, y: number, rgb: readonly number[]) {
      data.set([...rgb, 255], (y * width + x) * 4);
    },
  };
}

describe('detectAtomCandidates', () => {
  it('finds colored spheres and returns original-image normalized coordinates', () => {
    const fixture = createImage(100, 80, [102, 121, 139]);
    fixture.circle(25, 20, 7, [23, 26, 29]);
    fixture.circle(75, 60, 8, [210, 50, 50]);

    const candidates = detectAtomCandidates(fixture.image);

    expect(candidates.map(({ element }) => element)).toEqual(['C', 'O']);
    expect(candidates[0]).toMatchObject({
      id: 'atom-001',
      reviewStatus: 'unconfirmed',
    });
    expect(candidates[0].x).toBeCloseTo(0.255, 2);
    expect(candidates[0].y).toBeCloseTo(0.256, 2);
    expect(candidates[1].x).toBeCloseTo(0.755, 2);
    expect(candidates[1].y).toBeCloseTo(0.756, 2);
  });

  it('filters a matching background and isolated color noise', () => {
    const fixture = createImage(70, 60, [245, 245, 245]);
    fixture.pixel(20, 20, [210, 50, 50]);
    fixture.pixel(30, 30, [28, 30, 32]);

    expect(detectAtomCandidates(fixture.image)).toEqual([]);
  });

  it('returns stable ordering and ids for the same pixels', () => {
    const fixture = createImage(90, 70, [102, 121, 139]);
    fixture.circle(65, 45, 6, [245, 245, 245]);
    fixture.circle(20, 18, 7, [48, 76, 190]);

    const firstRun = detectAtomCandidates(fixture.image);
    expect(firstRun).toHaveLength(2);
    expect(firstRun).toEqual(detectAtomCandidates(fixture.image));
  });

  it('keeps weak color matches explicitly uncertain and supports the MVP palette', () => {
    const fixture = createImage(120, 90, [102, 121, 139]);
    fixture.circle(20, 20, 7, [210, 130, 50]);
    fixture.circle(60, 45, 7, [130, 210, 82]);
    fixture.circle(95, 70, 7, [126, 82, 164]);

    const candidates = detectAtomCandidates(fixture.image);

    expect(candidates.map(({ element }) => element)).toEqual(['O', 'F', 'Cl']);
    expect(candidates[0].confidenceScore).toBeLessThan(0.75);
    expect(candidates.every(({ reviewStatus }) => reviewStatus === 'unconfirmed')).toBe(true);
  });
});
