# PIPRO QR Scanner App — Full Development Plan

**Project:** PIPRO Card Scanner (Pi Pro Arewa Association)
**Purpose:** Let anyone scan a PIPRO member card — from camera OR from a saved image — verify it is a real PIPRO card, and open their Solana wallet with the payment ready. No fakes, no wrong addresses.

---

## 1. Problem & Solution

**Problem:** Solana wallets (Phantom, Solflare) only scan QR codes with the camera. Members share their cards as images on WhatsApp/Telegram, and there is no way to scan a saved image.

**Solution:** A small companion app that:
1. Reads the QR from a gallery image or the camera
2. Checks it is a genuine PIPRO card (correct token mint)
3. Shows the member name for confirmation
4. Opens the wallet with recipient + PIPRO token pre-filled via Solana Pay deep link

The app never touches private keys and never sends transactions itself. The wallet does the sending. This keeps the app simple and safe.

---

## 2. Scope

### In scope
- Scan QR from gallery image
- Scan QR from live camera
- Validate Solana Pay URI and PIPRO mint address
- Show member name + wallet address preview
- Open wallet via deep link
- Copy address fallback if no wallet installed
- Local scan history (on device only)
- Hausa + English text (simple two-language support)

### Out of scope (for now)
- Sending transactions inside the app
- Generating member cards (can be Phase 2 / part of the Hub)
- Online member registry check (later, via Convex when the Hub backend is live)
- iOS release (build Android first; iOS after)

---

## 3. Tech Stack

| Part | Choice |
|---|---|
| Framework | React Native CLI + Hermes (matches your existing stack) |
| Language | TypeScript |
| Camera scan | `react-native-vision-camera` (built-in code scanner) |
| Image decode | `@react-native-ml-kit/barcode-scanning` (Google ML Kit, works offline) |
| Image picker | `react-native-image-picker` |
| Storage (history) | `@react-native-async-storage/async-storage` |
| Clipboard | `@react-native-clipboard/clipboard` |
| Deep link | React Native `Linking` (opens `solana:` URIs) |

Everything works fully offline. No backend needed for v1.

---

## 4. The QR / Solana Pay Format

Every valid PIPRO card QR contains a Solana Pay transfer request URI:

```
solana:<MEMBER_WALLET_ADDRESS>?spl-token=<PIPRO_MINT>&label=<MEMBER%20NAME>
```

**Fixed constant in the app:**

```
PIPRO_MINT = 7hU4hrLtr2dxGDBy56HQo6NF2u19FA1k4rM8nJQ5ceFk
```

**Validation rules (all must pass):**
1. URI starts with `solana:`
2. Recipient part is a valid base58 Solana address (32–44 chars, decodes to 32 bytes)
3. `spl-token` parameter exists AND equals `PIPRO_MINT` exactly
4. `label` exists → decode with `decodeURIComponent` and show as member name
5. Anything that fails → show "Not an official PIPRO card" warning, do NOT open wallet

---

## 5. Screens

### 5.1 Home
- PIPRO logo + Association name + motto
- Two big buttons: **Scan with Camera** / **Scan from Image**
- Small link: Scan History

### 5.2 Camera Scan
- Full-screen camera with QR frame overlay
- Auto-detects QR → goes straight to Result screen
- Flashlight toggle
- Button to switch to gallery pick

### 5.3 Gallery Scan
- Opens the phone image picker
- Decodes QR from the chosen image
- If no QR found → friendly error + "Try another image"

### 5.4 Result (the confirmation screen)
- Big green check: "✓ Verified PIPRO Card"
- Member name (from label), large
- Wallet address, shortened (`BDd6...8vyX`) with copy button
- Primary button: **Open Wallet & Send PIPRO**
- Secondary: **Copy Address**
- If validation failed: red warning screen instead — "⚠ This is NOT an official PIPRO card" with reason

### 5.5 History
- List of past scans: member name, short address, date
- Tap any entry → Result screen again (can re-send without rescanning)
- Clear history button
- Stored only on the device

---

## 6. Core Flows

### Flow A — Gallery image
1. User taps **Scan from Image**
2. Picks image → ML Kit decodes → validate → Result screen
3. Taps **Open Wallet** → `Linking.openURL(solanaUri)`
4. Phantom/Solflare opens with recipient + PIPRO token set
5. Scan saved to history

### Flow B — Camera
Same, but detection happens live from `react-native-vision-camera` code scanner.

### Flow C — No wallet installed
1. `Linking.openURL` fails (or `canOpenURL` returns false)
2. Show sheet: "No Solana wallet found"
   - Copy address button
   - Links to install Phantom / Solflare (Play Store)

---

## 7. Permissions & Manifest

### Android (`AndroidManifest.xml`)
```xml
<uses-permission android:name="android.permission.CAMERA" />

<queries>
  <intent>
    <action android:name="android.intent.action.VIEW" />
    <data android:scheme="solana" />
  </intent>
</queries>
```
- Image picker on Android 13+ uses the photo picker — no storage permission needed
- Ask camera permission only when the user opens Camera Scan (not at startup)

### iOS (`Info.plist`) — for later
- `NSCameraUsageDescription`
- `LSApplicationQueriesSchemes`: `solana`, `phantom`, `solflare`

---

## 8. Error Handling & Edge Cases

| Case | Behavior |
|---|---|
| Image has no QR | "No QR code found in this image" |
| Image has multiple QRs | Use the first one that starts with `solana:`; if none, error |
| QR is a URL / WiFi / other type | "Not a PIPRO card" |
| `solana:` URI but wrong mint | Red fake-card warning, block wallet open |
| `solana:` URI, no `spl-token` at all | Block — plain SOL request is not a PIPRO card |
| Missing label | Show "PIPRO Member" as name, still allow |
| Blurry/small image | ML Kit usually handles it; if fail → "Try a clearer image" |
| Screenshot of card (compressed) | Works — QR has high error correction; test this specifically |
| Camera permission denied | Explain + button to open app settings |
| No wallet installed | Flow C fallback |
| Airplane mode | Everything still works (decode + validate are offline) |
| User taps Open Wallet twice fast | Debounce the button |

---

## 9. Project Structure

```
pipro-scanner/
├── src/
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── CameraScanScreen.tsx
│   │   ├── ResultScreen.tsx
│   │   └── HistoryScreen.tsx
│   ├── lib/
│   │   ├── solanaPay.ts      // parse + validate URI (pure functions)
│   │   ├── decodeImage.ts    // ML Kit wrapper
│   │   ├── wallet.ts         // openWallet(), canOpenWallet()
│   │   └── history.ts        // AsyncStorage read/write
│   ├── components/
│   │   ├── BigButton.tsx
│   │   ├── VerifiedBadge.tsx
│   │   └── AddressRow.tsx
│   ├── i18n/
│   │   ├── en.ts
│   │   └── ha.ts             // Hausa
│   └── theme.ts              // dark + gold (match the card design)
├── App.tsx
└── ...
```

Keep `solanaPay.ts` as pure functions with zero React imports — easy to unit test.

---

## 10. Milestones (no timelines — each unlocks the next)

### Milestone 1 — Core engine
- Project setup (RN CLI, TypeScript, navigation)
- `solanaPay.ts`: parse + validate with unit tests
- Gallery pick → ML Kit decode → console log result
- **Done when:** the exact card image decodes and validates correctly

### Milestone 2 — Result & wallet handoff
- Result screen (verified + fake states)
- Deep link open, no-wallet fallback, copy address
- **Done when:** tapping Open Wallet lands in Phantom with PIPRO pre-selected

### Milestone 3 — Camera scan
- vision-camera integration, permission flow, overlay, torch
- **Done when:** printed card scans live in under 2 seconds

### Milestone 4 — Polish
- History screen
- Hausa + English strings
- Dark/gold theme matching the card
- App icon + splash (PIPRO coin logo)

### Milestone 5 — Release (Android)
- Signing key (keep backup — losing it means losing update ability)
- Test on 2–3 real devices (one low-end Android)
- Release APK for direct community sharing + AAB for Play Store
- Play Store listing: screenshots, description, privacy policy page (simple static page — app collects nothing)

---

## 11. Testing Checklist

- [ ] Original card PNG from gallery → verified
- [ ] WhatsApp-compressed version of the card → verified
- [ ] Screenshot of the card → verified
- [ ] Photo of a printed card (camera) → verified
- [ ] QR with wrong mint → blocked with fake warning
- [ ] Random QR (website link) → "not a PIPRO card"
- [ ] Image with no QR → clean error
- [ ] Wallet handoff on device with Phantom
- [ ] Wallet handoff on device with Solflare
- [ ] Device with no wallet → fallback sheet
- [ ] Airplane mode → scan + validate still work
- [ ] History persists after app restart
- [ ] Camera permission deny → recover path works

---

## 12. Future (v2, ties into the Hub)

- Verify member against the Association registry (Convex backend) — badge shows "Registered Member ✓"
- Generate cards inside the app (name + wallet → styled card image, replaces manual creation)
- Share sheet integration: open a card image directly from WhatsApp with "Scan with PIPRO"
- iOS release
- Show PIPRO token balance of the scanned member (read-only RPC call)
