import { Alert } from 'react-native';

// Sanity ceiling only (see imagePicker.web.ts for the matching web-side
// comment) — compression below is what actually keeps real output sizes
// small; this just guards against something going wrong.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Native (Android/iOS) camera-or-gallery picker, with cropping enabled by
 * default so the user can pan/zoom/crop before it's uploaded. The web build
 * never bundles this file — see imagePicker.web.ts, which webpack resolves
 * instead (and mirrors this same `crop` option/default).
 *
 * @param opts.crop Defaults to `true`. Pass `{ crop: false }` for flows that
 * need the *whole* photo uncropped, e.g. the menu photo-import OCR reader,
 * where a forced square crop would cut off items on a landscape/portrait
 * menu page.
 *
 * Resolves to `null` if the user cancels without picking anything.
 */
export const pickImageAsDataUri = (opts?: { crop?: boolean }): Promise<string | null> => {
  const crop = opts?.crop !== false;
  return new Promise((resolve, reject) => {
    const ImagePicker = require('react-native-image-crop-picker').default;

    const openWith = (opener: 'openCamera' | 'openPicker') => {
      ImagePicker[opener]({
        // Matches MAX_DIMENSION in imagePicker.web.ts — same target output
        // size on both platforms, landing around 50-150KB after compression
        // instead of the multi-MB a phone camera produces natively.
        width: 900,
        height: 900,
        cropping: crop,
        compressImageQuality: 0.6,
        includeBase64: true,
        mediaType: 'photo',
      })
        .then((image: any) => {
          if (!image?.data) {
            resolve(null);
            return;
          }
          if (typeof image.size === 'number' && image.size > MAX_FILE_BYTES) {
            reject(new Error('That image is unusually large — please choose a different one.'));
            return;
          }
          resolve(`data:${image.mime};base64,${image.data}`);
        })
        .catch((err: any) => {
          if (err?.code === 'E_PICKER_CANCELLED') {
            resolve(null);
            return;
          }
          reject(new Error(err?.message ?? 'Could not access the camera or photo library.'));
        });
    };

    Alert.alert(
      'Add a Photo',
      undefined,
      [
        { text: 'Take Photo', onPress: () => openWith('openCamera') },
        { text: 'Choose from Gallery', onPress: () => openWith('openPicker') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
};
