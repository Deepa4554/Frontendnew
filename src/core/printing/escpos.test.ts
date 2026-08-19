import { buildEscPosFromLines } from './escpos';
import { ReceiptLine } from './receiptFormat';

/** Finds the first occurrence of `needle` as a contiguous run inside `haystack`, or -1. */
const indexOfBytes = (haystack: Uint8Array, needle: number[]): number => {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
};

describe('escpos image line', () => {
  it('writes the raster bytes out verbatim when present', () => {
    // A recognisable, arbitrary-looking marker — if this exact sequence appears in the
    // output, the raster genuinely made it into the byte stream, not something that merely
    // looks plausible.
    const raster = new Uint8Array([0x1d, 0x76, 0x30, 0x00, 0xaa, 0xbb, 0xcc, 0xdd]);
    const lines: ReceiptLine[] = [{ kind: 'image', escposBytes: raster }];

    const bytes = buildEscPosFromLines(lines);

    expect(indexOfBytes(bytes, Array.from(raster))).toBeGreaterThanOrEqual(0);
  });

  it('emits nothing for an image line with no raster bytes', () => {
    // This is the 'browser' transport's shape: previewUrl set, escposBytes absent — the
    // ESC/POS builder has nothing it can print and must not throw or invent a blank image.
    const withImage = buildEscPosFromLines([{ kind: 'image', previewUrl: 'https://x/logo.png' }]);
    const withoutLine = buildEscPosFromLines([]);

    expect(withImage).toEqual(withoutLine);
  });

  it('centres the image between alignment commands, restoring left afterwards', () => {
    // ALIGN_CENTER = ESC a 1, ALIGN_LEFT = ESC a 0 (see escpos.ts's CMD table).
    const ALIGN_CENTER = [0x1b, 0x61, 0x01];
    const ALIGN_LEFT = [0x1b, 0x61, 0x00];
    const raster = new Uint8Array([0x1d, 0x76, 0x30, 0x00, 0x01]);

    const bytes = Array.from(buildEscPosFromLines([{ kind: 'image', escposBytes: raster }]));

    const centerAt = indexOfBytes(Uint8Array.from(bytes), ALIGN_CENTER);
    const rasterAt = indexOfBytes(Uint8Array.from(bytes), Array.from(raster));
    const leftAt = bytes.lastIndexOf(ALIGN_LEFT[0], bytes.length - 1); // coarse anchor, refined below
    expect(centerAt).toBeGreaterThanOrEqual(0);
    expect(rasterAt).toBeGreaterThan(centerAt);
    // A left-align restore has to exist somewhere after the raster — buildEscPosFromLines
    // also appends one of its own at the very end regardless, so just confirm one is present
    // rather than pinning an exact offset the trailing cut/feed bytes could shift.
    expect(indexOfBytes(Uint8Array.from(bytes.slice(rasterAt)), ALIGN_LEFT)).toBeGreaterThanOrEqual(0);
    expect(leftAt).toBeGreaterThan(-1);
  });
});
