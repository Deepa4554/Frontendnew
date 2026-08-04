import { menuApi, CreateMenuItemRequest } from '../api/menuApi';
import { extractMenuItemsViaOcr, runOcrToText } from './menuPhotoOcrFallback';

/**
 * Three-tier menu-photo parse, each tier only reached if the one before it comes back with
 * nothing at all — not merely because a result looks sparse, since even a rough AI parse
 * beats the next tier down:
 *   1. Server-side Claude (see MenuPhotoAiService.cs) — reads the image directly, best
 *      accuracy, but paid (runs on trial credit).
 *   2. On-device Tesseract.js OCR (free, no server round trip for the OCR step itself) ->
 *      raw text sent to the server, categorized by Groq. Doesn't need Google Cloud billing
 *      the way the backend's own Vision+Groq fallback inside tier 1 does, so this is the
 *      tier that actually works today without any billing setup.
 *   3. Fully offline: the same on-device OCR text run through the local regex/heuristic
 *      parser instead of an LLM — menuPhotoOcrFallback.ts's own extractMenuItemsViaOcr.
 *      Last resort if the backend itself is unreachable (no network, backend down).
 */
export const extractMenuItemsFromPhoto = async (dataUri: string): Promise<CreateMenuItemRequest[]> => {
  try {
    const items = await menuApi.importPhotoAi(dataUri);
    if (items.length > 0) return items;
  } catch (err) {
    console.warn('Claude menu photo import failed', err);
  }

  try {
    const ocrText = await runOcrToText(dataUri);
    if (ocrText.trim()) {
      const items = await menuApi.categorizeMenuText(ocrText);
      if (items.length > 0) return items;
    }
  } catch (err) {
    console.warn('On-device OCR + Groq categorization failed', err);
  }

  return extractMenuItemsViaOcr(dataUri);
};
