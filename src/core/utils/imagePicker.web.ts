// Any phone photo is fair game as input (modern cameras routinely produce
// 5-15MB files) — this is a sanity ceiling against pathological files timing
// out the browser during compression, not a "your photo is too big" wall for
// the user. The real, user-facing cap now comes from compression below.
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
// Longest side after resize/crop — plenty for how these ever get displayed (menu
// cards, avatars, logos), and this is what actually drives the output size
// down into the tens-of-KB range, not the JPEG quality knob alone.
const MAX_DIMENSION = 900;
const JPEG_QUALITY = 0.7;
// On-screen crop window (css px) — the visible square the user pans/zooms the
// photo behind. Independent of MAX_DIMENSION (the exported pixel size).
const CROP_VIEWPORT = 300;

/** Resizes + re-encodes as JPEG via an offscreen canvas — runs entirely in the
 * browser before upload, so a 10MB phone photo becomes a ~50-150KB file
 * without the user doing anything extra. Used for the uncropped path only
 * (see pickImageAsDataUri's `crop` option) — preserves the original aspect
 * ratio, just downscales it. */
const compressDataUri = (dataUri: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const win: any = (globalThis as any).window;
    const img = new win.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width >= height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }
      const canvas = win.document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUri); // canvas unsupported for some reason — fall back to the original rather than fail the upload
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => reject(new Error('Could not process that image.'));
    img.src = dataUri;
  });
};

/**
 * Full-screen pan/zoom crop overlay, built with plain DOM (this file has no
 * React tree of its own to render into — see pickImageAsDataUri below, which
 * is the same "raw <input> outside React" approach). Always crops to a square
 * (matches native's `cropping: true` — see imagePicker.ts — so the two
 * platforms produce the same shape image for the same menu-item/photo fields).
 *
 * Resolves the cropped, exported JPEG data URI, or `null` if the user cancels.
 */
const openCropModal = (rawDataUri: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const win: any = (globalThis as any).window;
    const doc: any = win.document;

    const img = new win.Image();
    img.onload = () => {
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;
      // "Cover" scale — the smaller source dimension exactly fills the crop
      // viewport, so there's never an empty gap behind the image. Never lets
      // the user zoom out past this, only in.
      const minScale = Math.max(CROP_VIEWPORT / naturalW, CROP_VIEWPORT / naturalH);
      const maxScale = minScale * 4;
      let scale = minScale;
      let offsetX = (CROP_VIEWPORT - naturalW * scale) / 2;
      let offsetY = (CROP_VIEWPORT - naturalH * scale) / 2;

      const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
      const clampOffsets = () => {
        const dispW = naturalW * scale;
        const dispH = naturalH * scale;
        offsetX = clamp(offsetX, CROP_VIEWPORT - dispW, 0);
        offsetY = clamp(offsetY, CROP_VIEWPORT - dispH, 0);
      };
      clampOffsets();

      // ---------- DOM ----------
      const backdrop = doc.createElement('div');
      backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;';

      const card = doc.createElement('div');
      card.style.cssText = 'background:#FFFFFF;border-radius:14px;padding:18px;max-width:92vw;box-shadow:0 12px 40px rgba(0,0,0,0.35);display:flex;flex-direction:column;align-items:stretch;gap:12px;font-family:inherit;';

      const title = doc.createElement('div');
      title.textContent = 'Crop photo';
      title.style.cssText = 'font-size:15px;font-weight:700;color:#2B1810;';

      const hint = doc.createElement('div');
      hint.textContent = 'Drag to reposition, scroll or use the slider to zoom.';
      hint.style.cssText = 'font-size:12px;color:#8A7364;margin-top:-8px;';

      const viewport = doc.createElement('div');
      viewport.style.cssText = `position:relative;width:${CROP_VIEWPORT}px;height:${CROP_VIEWPORT}px;max-width:100%;overflow:hidden;border-radius:10px;background:#111;touch-action:none;cursor:grab;align-self:center;`;

      const imgEl = doc.createElement('img');
      imgEl.src = rawDataUri;
      imgEl.draggable = false;
      imgEl.style.cssText = 'position:absolute;left:0;top:0;user-select:none;';

      const render = () => {
        imgEl.style.width = `${naturalW * scale}px`;
        imgEl.style.height = `${naturalH * scale}px`;
        imgEl.style.left = `${offsetX}px`;
        imgEl.style.top = `${offsetY}px`;
      };
      render();
      viewport.appendChild(imgEl);

      const slider = doc.createElement('input');
      slider.type = 'range';
      slider.min = String(minScale);
      slider.max = String(maxScale);
      slider.step = String((maxScale - minScale) / 200 || 0.001);
      slider.value = String(scale);
      slider.style.cssText = 'width:100%;';

      // Zooming keeps whatever's currently at the viewport's center fixed in
      // place, rather than zooming from the image's top-left corner — much
      // less disorienting when the user has already panned somewhere.
      const setScale = (nextScale: number) => {
        nextScale = clamp(nextScale, minScale, maxScale);
        const cx = CROP_VIEWPORT / 2;
        const cy = CROP_VIEWPORT / 2;
        const ratio = nextScale / scale;
        offsetX = cx - (cx - offsetX) * ratio;
        offsetY = cy - (cy - offsetY) * ratio;
        scale = nextScale;
        clampOffsets();
        render();
        slider.value = String(scale);
      };
      slider.oninput = () => setScale(parseFloat(slider.value));

      // ---------- Drag to pan (mouse + touch) ----------
      let dragging = false;
      let startPX = 0;
      let startPY = 0;
      let startOffX = 0;
      let startOffY = 0;

      const pointerPos = (e: any) => (e.touches?.[0] ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY });

      const onMove = (e: any) => {
        if (!dragging) return;
        e.preventDefault();
        const p = pointerPos(e);
        offsetX = startOffX + (p.x - startPX);
        offsetY = startOffY + (p.y - startPY);
        clampOffsets();
        render();
      };
      const onUp = () => {
        dragging = false;
        viewport.style.cursor = 'grab';
        win.removeEventListener('mousemove', onMove);
        win.removeEventListener('mouseup', onUp);
        win.removeEventListener('touchmove', onMove);
        win.removeEventListener('touchend', onUp);
      };
      const onDown = (e: any) => {
        dragging = true;
        viewport.style.cursor = 'grabbing';
        const p = pointerPos(e);
        startPX = p.x;
        startPY = p.y;
        startOffX = offsetX;
        startOffY = offsetY;
        win.addEventListener('mousemove', onMove, { passive: false });
        win.addEventListener('mouseup', onUp);
        win.addEventListener('touchmove', onMove, { passive: false });
        win.addEventListener('touchend', onUp);
      };
      viewport.addEventListener('mousedown', onDown);
      viewport.addEventListener('touchstart', onDown, { passive: true });
      viewport.addEventListener('wheel', (e: any) => {
        e.preventDefault();
        setScale(scale * (e.deltaY < 0 ? 1.08 : 0.92));
      }, { passive: false });

      // ---------- Buttons ----------
      const btnRow = doc.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:10px;';

      const cancelBtn = doc.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'flex:1;padding:10px 0;border-radius:8px;border:none;background:#EFE6DE;color:#2B1810;font-weight:700;font-size:14px;cursor:pointer;';

      const confirmBtn = doc.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.textContent = 'Use Photo';
      confirmBtn.style.cssText = 'flex:1;padding:10px 0;border-radius:8px;border:none;background:#C5652E;color:#FFFFFF;font-weight:700;font-size:14px;cursor:pointer;';

      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(confirmBtn);

      card.appendChild(title);
      card.appendChild(hint);
      card.appendChild(viewport);
      card.appendChild(slider);
      card.appendChild(btnRow);
      backdrop.appendChild(card);
      doc.body.appendChild(backdrop);

      const onKeyDown = (e: any) => {
        if (e.key === 'Escape') { cleanup(); resolve(null); }
      };
      win.addEventListener('keydown', onKeyDown);

      function cleanup() {
        onUp(); // detach any lingering drag listeners
        win.removeEventListener('keydown', onKeyDown);
        doc.body.removeChild(backdrop);
      }

      cancelBtn.onclick = () => { cleanup(); resolve(null); };
      confirmBtn.onclick = () => {
        const canvas = doc.createElement('canvas');
        canvas.width = MAX_DIMENSION;
        canvas.height = MAX_DIMENSION;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          resolve(rawDataUri); // canvas unsupported — fall back to the uncropped original rather than fail the upload
          return;
        }
        // The visible viewport, translated back into the image's own source-pixel
        // coordinates (undoing the pan offset and the display scale).
        const sx = -offsetX / scale;
        const sy = -offsetY / scale;
        const sSize = CROP_VIEWPORT / scale;
        ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, MAX_DIMENSION, MAX_DIMENSION);
        const out = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        cleanup();
        resolve(out);
      };
    };
    img.onerror = () => resolve(null); // unreadable image — treat like a cancel rather than surface a crop-specific error
    img.src = rawDataUri;
  });
};

/**
 * Picks an image file (web only — same no-native-dependency approach as
 * pickAndParseCsv), optionally crops it (pan/zoom to a square, see
 * openCropModal), compresses it client-side, and resolves it as a base64
 * data URI ready to send to the backend (which uploads it to real image
 * storage — see ImageStorageService.cs — rather than storing this data URI
 * directly).
 *
 * Webpack resolves this `.web.ts` file instead of the native `imagePicker.ts`
 * for the web build — keeps react-native-image-crop-picker (native-only, not
 * web-buildable) out of the web bundle entirely instead of just branching on
 * Platform.OS at runtime.
 *
 * @param opts.crop Defaults to `true` (matches native's own default — see
 * imagePicker.ts). Pass `{ crop: false }` for flows that need the *whole*
 * photo uncropped, e.g. the menu photo-import OCR reader, where a forced
 * square crop would cut off items on a landscape/portrait menu page.
 *
 * Resolves to `null` if the user closes the file dialog, or the crop step,
 * without picking anything.
 */
export const pickImageAsDataUri = (opts?: { crop?: boolean }): Promise<string | null> => {
  const crop = opts?.crop !== false;
  return new Promise((resolve, reject) => {
    const win: any = (globalThis as any).window;
    const doc: any = win.document;
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    let settled = false;
    let cancelTimer: ReturnType<typeof setTimeout> | null = null;
    const finishWith = (fn: () => void) => {
      if (settled) return;
      settled = true;
      win.removeEventListener('focus', onWindowFocus);
      if (cancelTimer !== null) clearTimeout(cancelTimer);
      fn();
    };

    input.onchange = () => {
      // A real change event means a file was genuinely picked — cancel the
      // focus-based cancel-detection fallback right away. Window focus returns
      // the instant the OS dialog closes, well before the file is done being
      // read/cropped, so `onWindowFocus` below has *already fired* and armed its
      // 500ms timer by this point ({ once: true } means the listener is already
      // gone, so removeEventListener here is a no-op on its own) — without also
      // clearing that timer, it fires 500ms later regardless of what this handler
      // does, resolves the picker with null, and silently discards whatever this
      // handler resolves with afterwards (FileReader read, and especially the
      // crop step, both routinely take longer than 500ms).
      win.removeEventListener('focus', onWindowFocus);
      if (cancelTimer !== null) clearTimeout(cancelTimer);

      const file = input.files?.[0];
      if (!file) {
        finishWith(() => resolve(null));
        return;
      }
      if (file.size > MAX_INPUT_BYTES) {
        finishWith(() => reject(new Error('That image is unusually large — please choose a different one.')));
        return;
      }
      const reader: any = new win.FileReader();
      reader.onload = (e: any) => {
        const raw = e.target?.result;
        if (!raw) {
          finishWith(() => resolve(null));
          return;
        }
        const next = crop ? openCropModal(raw) : compressDataUri(raw);
        next
          .then((result) => finishWith(() => resolve(result)))
          .catch((err) => finishWith(() => reject(err)));
      };
      reader.onerror = () => finishWith(() => reject(reader.error ?? new Error('Could not read that image.')));
      reader.readAsDataURL(file);
    };
    input.oncancel = () => finishWith(() => resolve(null));

    const onWindowFocus = () => {
      cancelTimer = setTimeout(() => finishWith(() => resolve(null)), 500);
    };
    win.addEventListener('focus', onWindowFocus, { once: true });

    input.click();
  });
};
