// Where the app asks for OTA updates. This is the Cloudflare Worker that
// `npx hot-updater init --provider cloudflare` deploys — its URL is printed at
// the end of init, and also shown in the Cloudflare dashboard under
// Workers & Pages.
//
// This is a public endpoint, not a secret: it only ever serves update
// manifests. The credentials that publish updates live in .env.hotupdater,
// which is gitignored and never shipped in the app.
//
// Until this points at the real Worker, update checks fail silently and the
// app keeps running its built-in bundle — which is the correct behaviour, but
// it does mean OTA is simply inert.
export const OTA_BASE_URL = 'https://REPLACE-ME.workers.dev';
