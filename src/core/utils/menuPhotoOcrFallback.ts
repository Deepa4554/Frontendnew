import { createWorker } from 'tesseract.js';
import type Tesseract from 'tesseract.js';
import { CreateMenuItemRequest } from '../api/menuApi';

/**
 * Powers "Import from Photo" — runs OCR entirely in the browser via Tesseract.js (WASM),
 * then parses the recognized text with layout-aware heuristics. No server call, no API
 * key, no quota — just on-device image processing + text recognition, so results should
 * always be reviewed before saving.
 */

// A line that ends in a price: "Filter Coffee ... Rs. 60", "Cold Coffee 90.00", "Chai ₹40"
const PRICE_LINE = /^(.*?)[\s.,-]*(?:rs\.?|inr|₹)?\s*(\d{1,5}(?:\.\d{1,2})?)\s*(?:\/-)?$/i;

// Reject lines that are clearly not item names even though they end in digits
// (phone numbers, "Table 4", opening-hours-style "9 AM - 11 PM", etc.)
const LOOKS_LIKE_NOISE = /^\s*$|phone|contact|address|hours?|open|closed|table|www\.|@|\d{6,}/i;

// Real menu section headings ("Beverages", "COLD BREW") capitalize every word; a
// stray subtitle line picked up by OCR ("South Indian style") reads as a phrase —
// only the first word capitalized. Used as one signal (alongside font size, see
// isLikelyHeadingLine below) rather than the sole one, since OCR noise routinely
// breaks a heading's exact casing even when it's still visually a heading.
const isTitleCaseOrUpper = (line: string) =>
  line.split(/\s+/).every((word) => /^[A-Z0-9][A-Za-z0-9()&'-]*$/.test(word));

const isPlausibleHeadingText = (line: string) =>
  line.length > 0 && line.length <= 28 && !PRICE_LINE.test(line) && !LOOKS_LIKE_NOISE.test(line);

/** Plain-text fallback parser — used when Tesseract couldn't return structured
 * block/line data (see extractMenuItemsViaOcr). Category detection here relies
 * solely on text casing, since there's no bounding-box/font-size info to lean on. */
export const parseMenuTextToItems = (rawText: string): CreateMenuItemRequest[] => {
  const items: CreateMenuItemRequest[] = [];
  let currentCategory = 'Food';

  for (const rawLine of rawText.split('\n')) {
    const line = rawLine.trim();
    if (!line || LOOKS_LIKE_NOISE.test(line)) continue;

    const match = line.match(PRICE_LINE);
    if (match) {
      const name = match[1].replace(/[\s.,-]+$/, '').trim();
      const price = parseFloat(match[2]);
      if (name.length >= 2 && !Number.isNaN(price) && price > 0) {
        items.push({ name, category: currentCategory, price });
      }
      continue;
    }

    if (isPlausibleHeadingText(line) && isTitleCaseOrUpper(line)) {
      currentCategory = line.replace(/[:\-–—]+$/, '').trim();
    }
    // Lines that are neither a priced item nor a plausible heading (the cafe's own
    // name/tagline at the top, decorative text, etc.) are simply skipped.
  }

  return items;
};

// ---------------------------------------------------------------------------
// Image preprocessing — the single biggest accuracy lever for a *photographed*
// (not scanned) menu. Tesseract's models expect fairly high-resolution, evenly
// lit, dark-text-on-light-background input; real phone photos of printed or
// chalkboard menus are none of those things by default.
// ---------------------------------------------------------------------------

// Long-side cap for OCR input — deliberately much higher than the ~900px used
// for avatars/menu-item photos elsewhere (imagePicker.*), which are sized for
// how small they're ever displayed, not for legibility of dense printed text.
const OCR_MAX_DIMENSION = 2000;

// How strongly local contrast gets boosted during illumination correction below.
const LOCAL_CONTRAST_GAIN = 1.8;

interface CorrectedImage {
  canvas: any; // HTMLCanvasElement — typed loosely since this file has no DOM lib dependency
  width: number;
  height: number;
}

/** Resizes to OCR_MAX_DIMENSION, then: grayscale -> contrast stretch -> polarity
 * fix (chalkboard-style light-text-on-dark-background photos are inverted first,
 * since Tesseract's LSTM engine was trained on dark-text-on-light-background
 * images) -> local illumination correction (via an integral image), which
 * flattens uneven lighting/shadows/glare without ever fully binarizing.
 *
 * Deliberately stops short of turning the image into pure black/white (e.g.
 * Otsu/Bradley thresholding): this worker runs OEM 1 (LSTM_ONLY, see
 * extractMenuItemsViaOcr below), and Tesseract's LSTM model was trained on
 * antialiased grayscale text — hard-binarizing throws away exactly the
 * antialiasing/stroke-thickness detail it uses, which especially hurts
 * thinner decorative/chalkboard-style menu fonts. Keeping the output as
 * contrast-enhanced grayscale plays to what the model actually expects.
 *
 * Returns the corrected canvas (not a data URI) — extractMenuItemsViaOcr crops
 * per-column sub-images directly out of it (see findColumnGutters) without an
 * extra PNG encode/decode round trip. */
const correctImage = (dataUri: string): Promise<CorrectedImage> => {
  return new Promise((resolve, reject) => {
    const win: any = (globalThis as any).window;
    const img = new win.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > OCR_MAX_DIMENSION || height > OCR_MAX_DIMENSION) {
        if (width >= height) {
          height = Math.round((height * OCR_MAX_DIMENSION) / width);
          width = OCR_MAX_DIMENSION;
        } else {
          width = Math.round((width * OCR_MAX_DIMENSION) / height);
          height = OCR_MAX_DIMENSION;
        }
      }

      const canvas = win.document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // canvas unsupported for some reason — draw the original at its native size
        // unmodified rather than fail the upload.
        canvas.width = img.width;
        canvas.height = img.height;
        resolve({ canvas, width: img.width, height: img.height });
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      const n = width * height;
      const imageData = ctx.getImageData(0, 0, width, height);
      const px = imageData.data; // RGBA, 4 bytes/pixel

      // Pass 1: grayscale (luminosity) + track min/max (contrast) and sum (polarity).
      const gray = new Float32Array(n);
      let min = 255;
      let max = 0;
      let sum = 0;
      for (let i = 0, p = 0; i < n; i++, p += 4) {
        const g = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
        gray[i] = g;
        if (g < min) min = g;
        if (g > max) max = g;
        sum += g;
      }
      const mean = sum / n;
      // More of the page is dark than light -> this is a light-text-on-dark-background
      // photo (chalkboard/blackboard menu boards are the common case) -> invert so ink
      // ends up dark-on-light, which is what Tesseract's LSTM models expect.
      const invert = mean < 128;

      // Pass 2: contrast-stretch (recovers detail from flat/glared phone photos) and
      // apply the polarity fix, in one pass.
      const range = Math.max(1, max - min);
      const norm = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const stretched = ((gray[i] - min) / range) * 255;
        norm[i] = invert ? 255 - stretched : stretched;
      }

      // Pass 3: integral image of norm, for O(1) windowed-average lookups below.
      const stride = width + 1;
      const integral = new Float64Array(stride * (height + 1));
      for (let y = 0; y < height; y++) {
        let rowSum = 0;
        const row = y * width;
        const outRow = (y + 1) * stride;
        const prevOutRow = y * stride;
        for (let x = 0; x < width; x++) {
          rowSum += norm[row + x];
          integral[outRow + x + 1] = integral[prevOutRow + x + 1] + rowSum;
        }
      }

      // Pass 4: illumination correction — pull each pixel's value relative to the
      // *local* average brightness around it (via the integral image) rather than
      // one fixed cutoff for the whole page, so uneven lighting/shadows/glare get
      // flattened out. Unlike a threshold, this stays continuous/grayscale.
      const windowSize = Math.max(15, Math.round(Math.min(width, height) / 8));
      const half = Math.floor(windowSize / 2);
      const corrected = new Float32Array(n);
      let outMin = 255;
      let outMax = 0;
      for (let y = 0; y < height; y++) {
        const y1 = Math.max(0, y - half);
        const y2 = Math.min(height - 1, y + half);
        for (let x = 0; x < width; x++) {
          const x1 = Math.max(0, x - half);
          const x2 = Math.min(width - 1, x + half);
          const count = (x2 - x1 + 1) * (y2 - y1 + 1);
          const windowSum =
            integral[(y2 + 1) * stride + (x2 + 1)] -
            integral[y1 * stride + (x2 + 1)] -
            integral[(y2 + 1) * stride + x1] +
            integral[y1 * stride + x1];
          const localMean = windowSum / count;
          const i = y * width + x;
          const v = Math.min(255, Math.max(0, 128 + (norm[i] - localMean) * LOCAL_CONTRAST_GAIN));
          corrected[i] = v;
          if (v < outMin) outMin = v;
          if (v > outMax) outMax = v;
        }
      }

      // Pass 5: final global stretch, so the corrected image uses the full 0-255
      // range regardless of how much pass 4's gain compressed it.
      const outRange = Math.max(1, outMax - outMin);
      for (let i = 0, p = 0; i < n; i++, p += 4) {
        const v = Math.round(((corrected[i] - outMin) / outRange) * 255);
        px[p] = v;
        px[p + 1] = v;
        px[p + 2] = v;
        px[p + 3] = 255;
      }

      ctx.putImageData(imageData, 0, 0);
      resolve({ canvas, width, height });
    };
    img.onerror = () => reject(new Error('Could not process that image.'));
    img.src = dataUri;
  });
};

/** Public wrapper around correctImage for inspection/testing — the real OCR
 * path (extractMenuItemsViaOcr) uses correctImage directly to avoid an extra
 * PNG encode/decode round trip. */
export const preprocessForOcr = async (dataUri: string): Promise<string> => {
  const { canvas } = await correctImage(dataUri);
  // PNG, not JPEG — avoids reintroducing compression noise right after cleaning it up.
  return canvas.toDataURL('image/png');
};

// ---------------------------------------------------------------------------
// Column splitting — printed/chalkboard menus routinely lay sections out
// side by side (e.g. "Sandwich"/"Fries" at the same height). Left uncorrected,
// Tesseract's own line segmentation often merges same-height text across
// columns into a single garbled line *before* any text-based reordering could
// ever fix it — e.g. "Veg Grill 60 ... Salted Fries" as one "line". Splitting
// the image into per-column images before OCR ever runs is the only way to
// reliably prevent that: each column is then a wholly separate recognition
// pass with no opportunity to bleed into its neighbor.
// ---------------------------------------------------------------------------

// A vertical strip of pixels counts as part of a gutter (not text) when less
// than this fraction of it, top to bottom, is ink.
const GUTTER_INK_RATIO_MAX = 0.02;
// A gutter run must span at least this fraction of the image width to count
// as a real column break, not just the natural gap around a short word.
const GUTTER_MIN_WIDTH_FRACTION = 0.03;
// Ignore gutters too close to the very edges — that's margin, not a column split.
const GUTTER_EDGE_MARGIN_FRACTION = 0.05;
// A pixel this dark or darker counts as "ink" for the column-gutter scan. Well
// below the 0-255 midpoint deliberately: correctImage's illumination correction
// is local-mean-relative (see LOCAL_CONTRAST_GAIN above), so flat background
// regions land around 128 (not white) while real ink gets pushed hard toward 0 —
// a threshold near 170 would misclassify plain background as "ink" everywhere.
const INK_VALUE_THRESHOLD = 100;

/** Scans the corrected (grayscale) image for vertical bands with essentially
 * no ink running most of the page's height — real column gutters on a
 * multi-column menu — and returns their x-centers, left to right. */
const findColumnGutters = (canvas: any, width: number, height: number): number[] => {
  const ctx = canvas.getContext('2d');
  const px = ctx.getImageData(0, 0, width, height).data;

  const inkCountPerX = new Int32Array(width);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (px[(row + x) * 4] < INK_VALUE_THRESHOLD) inkCountPerX[x]++;
    }
  }

  const minGutterPx = Math.max(1, Math.round(width * GUTTER_MIN_WIDTH_FRACTION));
  const marginPx = Math.round(width * GUTTER_EDGE_MARGIN_FRACTION);

  const gutters: number[] = [];
  let gapStart = -1;
  for (let x = 0; x < width; x++) {
    const isGutterColumn = inkCountPerX[x] / height < GUTTER_INK_RATIO_MAX;
    if (isGutterColumn) {
      if (gapStart === -1) gapStart = x;
      continue;
    }
    if (gapStart !== -1) {
      const gapWidth = x - gapStart;
      const gapCenter = Math.round((gapStart + x) / 2);
      if (gapWidth >= minGutterPx && gapCenter > marginPx && gapCenter < width - marginPx) {
        gutters.push(gapCenter);
      }
      gapStart = -1;
    }
  }
  return gutters;
};

/** Crops [x0, x1) out of the corrected canvas into its own same-height image. */
const cropColumn = (canvas: any, x0: number, x1: number, height: number): string => {
  const win: any = (globalThis as any).window;
  const colCanvas = win.document.createElement('canvas');
  colCanvas.width = x1 - x0;
  colCanvas.height = height;
  const ctx = colCanvas.getContext('2d');
  ctx.drawImage(canvas, x0, 0, x1 - x0, height, 0, 0, x1 - x0, height);
  return colCanvas.toDataURL('image/png');
};

// ---------------------------------------------------------------------------
// Line-level parsing — turns Tesseract's structured block/paragraph/line
// output into menu items, using line height to spot section headings that
// OCR noise would otherwise make unrecognizable by text pattern alone.
// ---------------------------------------------------------------------------

interface FlatLine {
  text: string;
  bbox: Tesseract.Bbox;
  confidence: number;
  height: number;
}

// Below this Tesseract confidence (0-100), a line is more likely noise than a
// real menu line — safer to silently drop it than to import a garbled name.
// Kept deliberately low: decorative/chalkboard-style menu fonts routinely score
// lower confidence even when Tesseract read them correctly, and dropping a real
// item is worse than showing one extra line for the user to review/delete.
const MIN_LINE_CONFIDENCE = 25;

// A gap between text must span at least this fraction of the page width to
// count as a real column gutter, not just normal spacing within one column.
// (Used only by the single-pass fallback below — see findColumnGutters above
// for the primary, pre-OCR pixel-based column split.)
const MIN_GUTTER_FRACTION = 0.035;
const GAP_BUCKETS = 200;

const flattenLines = (blocks: Tesseract.Block[] | null | undefined): FlatLine[] => {
  const lines: FlatLine[] = [];
  for (const block of blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        const text = line.text.trim();
        if (!text || line.confidence < MIN_LINE_CONFIDENCE) continue;
        lines.push({ text, bbox: line.bbox, confidence: line.confidence, height: line.bbox.y1 - line.bbox.y0 });
      }
    }
  }
  return lines;
};

/** Finds x-positions of gaps wide enough to be column gutters, by bucketing the
 * page width and looking for runs of buckets no line's bounding box touches.
 * Fallback-only heuristic — see the module doc above for why the primary
 * defense is pixel-based column splitting *before* OCR runs. */
const detectColumnBoundaries = (lines: FlatLine[]): number[] => {
  if (lines.length === 0) return [];
  const minX = Math.min(...lines.map((l) => l.bbox.x0));
  const maxX = Math.max(...lines.map((l) => l.bbox.x1));
  const pageWidth = maxX - minX;
  if (pageWidth <= 0) return [];

  const bucketWidth = pageWidth / GAP_BUCKETS;
  const covered = new Array(GAP_BUCKETS).fill(false);
  for (const line of lines) {
    const startB = Math.max(0, Math.floor((line.bbox.x0 - minX) / bucketWidth));
    const endB = Math.min(GAP_BUCKETS - 1, Math.ceil((line.bbox.x1 - minX) / bucketWidth));
    for (let b = startB; b <= endB; b++) covered[b] = true;
  }

  const minGapBuckets = Math.max(1, Math.round(GAP_BUCKETS * MIN_GUTTER_FRACTION));
  const boundaries: number[] = [];
  let gapStart = -1;
  for (let b = 0; b < GAP_BUCKETS; b++) {
    if (!covered[b]) {
      if (gapStart === -1) gapStart = b;
      continue;
    }
    if (gapStart !== -1) {
      if (b - gapStart >= minGapBuckets) boundaries.push(minX + ((gapStart + b) / 2) * bucketWidth);
      gapStart = -1;
    }
  }
  return boundaries;
};

/** Buckets lines into columns by their gutter boundaries, then reads each
 * column top-to-bottom, left column to right. Fallback-only — see module doc. */
const reorderLinesByColumn = (lines: FlatLine[]): FlatLine[] => {
  const boundaries = detectColumnBoundaries(lines);
  if (boundaries.length === 0) {
    return [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  }
  const columns: FlatLine[][] = Array.from({ length: boundaries.length + 1 }, () => []);
  for (const line of lines) {
    const cx = (line.bbox.x0 + line.bbox.x1) / 2;
    let col = 0;
    while (col < boundaries.length && cx > boundaries[col]) col++;
    columns[col].push(line);
  }
  const ordered: FlatLine[] = [];
  for (const col of columns) {
    col.sort((a, b) => a.bbox.y0 - b.bbox.y0);
    ordered.push(...col);
  }
  return ordered;
};

const median = (nums: number[]): number => {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** A section heading on a printed menu is almost always visually bigger/bolder
 * than the item lines under it — a far more reliable signal than text casing
 * alone, since OCR noise routinely breaks a heading's exact capitalization
 * without changing how tall its bounding box is. */
const isLikelyHeadingLine = (line: string, height: number, medianHeight: number) =>
  isPlausibleHeadingText(line) && (height >= medianHeight * 1.2 || isTitleCaseOrUpper(line));

/** Walks an already-ordered list of lines (top-to-bottom within a column,
 * columns concatenated left to right) and turns them into menu items,
 * tracking the current section heading as it goes. */
const walkLinesToItems = (lines: FlatLine[]): CreateMenuItemRequest[] => {
  const medianHeight = median(lines.map((l) => l.height)) || 1;
  const items: CreateMenuItemRequest[] = [];
  let currentCategory = 'Food';

  for (const { text: rawLine, height } of lines) {
    const line = rawLine.trim();
    if (!line || LOOKS_LIKE_NOISE.test(line)) continue;

    const match = line.match(PRICE_LINE);
    if (match) {
      const name = match[1].replace(/[\s.,-]+$/, '').trim();
      const price = parseFloat(match[2]);
      if (name.length >= 2 && !Number.isNaN(price) && price > 0) {
        items.push({ name, category: currentCategory, price });
      }
      continue;
    }

    if (isLikelyHeadingLine(line, height, medianHeight)) {
      currentCategory = line.replace(/[:\-–—]+$/, '').trim();
    }
  }

  return items;
};

/** Single-image structured parser — used when no column split was possible
 * (findColumnGutters found nothing, e.g. a single-column menu) or as a
 * last-resort fallback. Reconstructs reading order from line bounding boxes
 * alone, which is weaker than a real pre-OCR column split (see module doc)
 * but still better than trusting Tesseract's raw block order outright. */
export const parseMenuBlocksToItems = (blocks: Tesseract.Block[] | null | undefined): CreateMenuItemRequest[] => {
  const lines = flattenLines(blocks);
  if (lines.length === 0) return [];
  return walkLinesToItems(reorderLinesByColumn(lines));
};

/** Runs OCR on a picked image (data URI) and returns extracted menu items.
 * Loads the Tesseract WASM engine + English trained data from same-origin files
 * (see public/tesseract, copied into the build by webpack.config.js) rather than
 * Tesseract.js's default CDN — the app's CSP has no CDN in script-src/connect-src,
 * and self-hosting also means this keeps working with no internet connection.
 * No server involvement, no API key, no request quota to manage. */
export const extractMenuItemsViaOcr = async (imageDataUri: string): Promise<CreateMenuItemRequest[]> => {
  const { canvas, width, height } = await correctImage(imageDataUri);
  const gutters = findColumnGutters(canvas, width, height);

  const worker = await createWorker('eng', 1, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/tesseract-core-simd-lstm.wasm.js',
    langPath: '/tesseract',
    workerBlobURL: false,
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: '1' });

    if (gutters.length > 0) {
      // OCR each column as its own image — see the "Column splitting" module
      // doc above for why this has to happen before recognition, not after.
      const bounds = [0, ...gutters, width];
      const columnLines: FlatLine[] = [];
      for (let i = 0; i < bounds.length - 1; i++) {
        const colDataUri = cropColumn(canvas, bounds[i], bounds[i + 1], height);
        const { data } = await worker.recognize(colDataUri, {}, { blocks: true, text: true });
        const lines = flattenLines(data.blocks).sort((a, b) => a.bbox.y0 - b.bbox.y0);
        columnLines.push(...lines);
      }
      const items = walkLinesToItems(columnLines);
      if (items.length > 0) return items;
      // Column split produced nothing usable (e.g. a false-positive gutter down
      // the middle of a single-column menu) — fall through to a plain whole-image pass.
    }

    const { data } = await worker.recognize(canvas.toDataURL('image/png'), {}, { text: true, blocks: true });
    const structured = parseMenuBlocksToItems(data.blocks);
    if (structured.length > 0) return structured;

    // Last resort: no usable block/line data at all — fall back to the plain
    // recognized text.
    return parseMenuTextToItems(data.text ?? '');
  } finally {
    await worker.terminate();
  }
};

/** Runs OCR and returns just the raw recognized text, with none of the local
 * name/price/category parsing above — used to hand off to an LLM (see
 * menuPhotoImport.ts's Groq tier, MenuController.CategorizeText) which makes sense of
 * jumbled multi-column text far better than the regex/bounding-box heuristics this file
 * otherwise relies on, so this skips the column-split pass extractMenuItemsViaOcr needs
 * for its own parsing and just does one whole-image recognition pass. */
export const runOcrToText = async (imageDataUri: string): Promise<string> => {
  const { canvas } = await correctImage(imageDataUri);

  const worker = await createWorker('eng', 1, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/tesseract-core-simd-lstm.wasm.js',
    langPath: '/tesseract',
    workerBlobURL: false,
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(canvas.toDataURL('image/png'), {}, { text: true });
    return data.text ?? '';
  } finally {
    await worker.terminate();
  }
};
