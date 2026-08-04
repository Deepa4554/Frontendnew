window.addEventListener('error', function (e) {
  console.log('GLOBAL_ERROR: ' + e.message + ' @ ' + e.filename + ':' + e.lineno + ':' + e.colno + '\nSTACK: ' + (e.error && e.error.stack));
});
window.addEventListener('unhandledrejection', function (e) {
  console.log('UNHANDLED_REJECTION: ' + e.reason + '\nSTACK: ' + (e.reason && e.reason.stack));
});
