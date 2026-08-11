import { Alert } from 'react-native';

/** The picked PDF, ready to POST to /api/menu-pdf. `dataUri` is a
 * "data:application/pdf;base64,…" string, matching the shape the image uploads use. */
export type PickedPdf = { dataUri: string; fileName: string; sizeBytes: number };

/**
 * Native (Android/iOS) PDF picker. The app doesn't bundle a document-picker dependency
 * (only an image picker, react-native-image-crop-picker), so there's no file browser to
 * open here — uploading the menu PDF is a web-dashboard action. This resolves `null` after
 * telling the user where to do it, rather than pretending to pick something.
 *
 * The web build never loads this file — webpack resolves pdfPicker.web.ts instead, which has
 * the real `<input type="file">` implementation.
 */
export const pickPdfAsDataUri = (): Promise<PickedPdf | null> => {
  Alert.alert(
    'Upload from the web dashboard',
    'To add or change your menu PDF, open PrabandhOS in a browser and use the QR Ordering screen there.',
    [{ text: 'OK' }],
  );
  return Promise.resolve(null);
};
