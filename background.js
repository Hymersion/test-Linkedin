// Minimal MV3 service worker bootstrap.
// Keep this file syntax-simple to avoid registration failures at manifest background.service_worker.
try {
  importScripts('background-main.js');
} catch (error) {
  const message = error && error.message ? error.message : String(error);
  console.error('Failed to load background-main.js:', message);
}
