// Web fallback for react-native-html-to-pdf. Nothing here should ever run: web builds
// PDFs through the browser's own print-to-PDF instead (see core/utils/fileExport.ts).
// The named `generatePDF` export still has to exist so the bundler can resolve the
// import — without it the binding is undefined and the call site dies with a TypeError.
Object.defineProperty(exports, '__esModule', { value: true });

const unavailable = () => Promise.reject(new Error('PDF export is not available on web.'));

exports.generatePDF = unavailable;
exports.default = { convert: unavailable };
