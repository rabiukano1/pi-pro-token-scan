# PIPRO Payment QR — Web

Generates verified PIPRO token payment QR codes in the browser.
Works on any device with a browser: Android, iPhone, desktop.

No server, no database, no backend. Everything runs client-side, so it can be
hosted free as a static site forever.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app — UI + payment URL builder |
| `qrcode.js` | QR encoder, bundled locally (no CDN, works offline) |
| `pipro-logo.png` | Logo / favicon |

## The payment URL

Follows the [Solana Pay](https://docs.solanapay.com/spec) transfer-request spec
and is byte-identical to what the mobile app produces:

```
solana:<recipient>?spl-token=<PIPRO_MINT>&amount=<amount>&label=<name>
```

The token contract is hardcoded and never changes, so a QR from this page can
only ever transfer PIPRO — senders can't be pointed at a fake token.

## Deploy free (GitHub Pages)

1. Create a new **public** repo on GitHub (e.g. `pipro-qr`)
2. Push this folder:
   ```sh
   git remote add origin https://github.com/<you>/pipro-qr.git
   git push -u origin main
   ```
3. Repo **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)`
4. Live in ~1 minute at `https://<you>.github.io/pipro-qr/`

Cloudflare Pages and Netlify work the same way — point them at this folder,
no build command needed.

## Updating the QR library

```sh
npx esbuild node_modules/qrcode/lib/browser.js \
  --bundle --minify --format=iife --global-name=QRCode --outfile=web/qrcode.js
```
