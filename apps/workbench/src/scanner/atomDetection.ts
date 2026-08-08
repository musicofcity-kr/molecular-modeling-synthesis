export const SUPPORTED_ELEMENTS = ['H', 'C', 'N', 'O', 'F', 'Cl'] as const;

export type SupportedElement = (typeof SUPPORTED_ELEMENTS)[number];

export interface RgbaImageLike {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

export interface AtomCandidate {
  id: string;
  element: SupportedElement;
  /** Horizontal position normalized to the original image width. */
  x: number;
  /** Vertical position normalized to the original image height. */
  y: number;
  /** Approximate radius normalized to the shorter original image side. */
  radius: number;
  confidenceScore: number;
  evidence: readonly string[];
  reviewStatus: 'unconfirmed';
}

interface PaletteEntry {
  element: SupportedElement;
  rgb: readonly [number, number, number];
  tolerance: number;
}

const PALETTE: readonly PaletteEntry[] = [
  { element: 'H', rgb: [245, 245, 245], tolerance: 34 },
  { element: 'C', rgb: [28, 30, 32], tolerance: 58 },
  { element: 'N', rgb: [48, 76, 190], tolerance: 82 },
  { element: 'O', rgb: [210, 50, 50], tolerance: 82 },
  { element: 'F', rgb: [130, 210, 82], tolerance: 76 },
  { element: 'Cl', rgb: [126, 82, 164], tolerance: 76 },
];

const distance = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function estimateBackground(image: RgbaImageLike): [number, number, number] {
  const { width, height, data } = image;
  const sampleSize = Math.max(1, Math.min(6, Math.floor(Math.min(width, height) / 5)));
  const corners = [
    [0, 0],
    [Math.max(0, width - sampleSize), 0],
    [0, Math.max(0, height - sampleSize)],
    [Math.max(0, width - sampleSize), Math.max(0, height - sampleSize)],
  ] as const;
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (const [startX, startY] of corners) {
    for (let y = startY; y < Math.min(height, startY + sampleSize); y += 1) {
      for (let x = startX; x < Math.min(width, startX + sampleSize); x += 1) {
        const offset = (y * width + x) * 4;
        if ((data[offset + 3] ?? 0) < 32) continue;
        red += data[offset] ?? 0;
        green += data[offset + 1] ?? 0;
        blue += data[offset + 2] ?? 0;
        count += 1;
      }
    }
  }

  return count === 0
    ? [255, 255, 255]
    : [red / count, green / count, blue / count];
}

function classifyPixel(
  rgb: readonly [number, number, number],
  background: readonly [number, number, number],
): { index: number; colorScore: number } {
  if (distance(rgb, background) < 30) return { index: -1, colorScore: 0 };

  let bestIndex = -1;
  let bestRatio = Number.POSITIVE_INFINITY;
  for (let index = 0; index < PALETTE.length; index += 1) {
    const palette = PALETTE[index];
    const ratio = distance(rgb, palette.rgb) / palette.tolerance;
    if (ratio <= 1 && ratio < bestRatio) {
      bestIndex = index;
      bestRatio = ratio;
    }
  }
  return {
    index: bestIndex,
    colorScore: bestIndex < 0 ? 0 : Math.max(0, 1 - bestRatio),
  };
}

/**
 * Deterministic, local-only color segmentation for classroom ball-and-stick
 * photographs. Results are candidates, never confirmed chemistry facts.
 */
export function detectAtomCandidates(image: RgbaImageLike): AtomCandidate[] {
  const { width, height, data } = image;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    data.length < width * height * 4
  ) {
    return [];
  }

  const background = estimateBackground(image);
  const classes = new Int8Array(width * height);
  const colorScores = new Uint8Array(width * height);
  classes.fill(-1);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    if ((data[offset + 3] ?? 0) < 32) continue;
    const classification = classifyPixel(
      [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0],
      background,
    );
    classes[pixel] = classification.index;
    colorScores[pixel] = Math.round(classification.colorScore * 255);
  }

  const visited = new Uint8Array(width * height);
  const minimumArea = Math.max(12, Math.floor(width * height * 0.00008));
  const maximumArea = width * height * 0.3;
  const rawCandidates: Array<Omit<AtomCandidate, 'id'>> = [];
  const neighborOffsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ] as const;

  for (let start = 0; start < classes.length; start += 1) {
    const classIndex = classes[start];
    if (classIndex < 0 || visited[start]) continue;

    const queue = [start];
    visited[start] = 1;
    let cursor = 0;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let sumColorScore = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    while (cursor < queue.length) {
      const pixel = queue[cursor];
      cursor += 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      area += 1;
      sumX += x;
      sumY += y;
      sumColorScore += colorScores[pixel] / 255;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      for (const [deltaX, deltaY] of neighborOffsets) {
        const nextX = x + deltaX;
        const nextY = y + deltaY;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
          continue;
        }
        const next = nextY * width + nextX;
        if (!visited[next] && classes[next] === classIndex) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const aspectRatio = Math.min(boxWidth, boxHeight) / Math.max(boxWidth, boxHeight);
    const fillRatio = area / (boxWidth * boxHeight);
    if (
      area < minimumArea ||
      area > maximumArea ||
      aspectRatio < 0.62 ||
      fillRatio < 0.48
    ) {
      continue;
    }

    const circularity = Math.min(1, fillRatio / (Math.PI / 4));
    const meanColorScore = sumColorScore / area;
    const confidenceScore = Math.max(
      0.45,
      Math.min(0.98, 0.35 + circularity * 0.2 + aspectRatio * 0.15 + meanColorScore * 0.3),
    );
    const element = PALETTE[classIndex].element;
    rawCandidates.push({
      element,
      x: (sumX / area + 0.5) / width,
      y: (sumY / area + 0.5) / height,
      radius: Math.sqrt(area / Math.PI) / Math.min(width, height),
      confidenceScore: Number(confidenceScore.toFixed(3)),
      evidence: [
        `${element} 색상 범위`,
        `색상 일치도 ${Math.round(meanColorScore * 100)}%`,
        `원형 채움률 ${Math.round(fillRatio * 100)}%`,
      ],
      reviewStatus: 'unconfirmed',
    });
  }

  rawCandidates.sort((a, b) => a.y - b.y || a.x - b.x || a.element.localeCompare(b.element));
  return rawCandidates.map((candidate, index) => ({
    ...candidate,
    id: `atom-${String(index + 1).padStart(3, '0')}`,
  }));
}
