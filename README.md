# DocuPass React Native SDK — in-app ID verification & KYC

[![npm](https://img.shields.io/badge/npm-%40idanalyzer%2Fdocupass--react--native-blue)](https://www.npmjs.com/package/@idanalyzer/docupass-react-native)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Embed [ID Analyzer **DocuPass**](https://www.idanalyzer.com/products/docupass.html)
identity verification **inside your React Native app** — document scanning, face
match, and on-device active liveness — with **no external browser and no WebView**.

This package is a thin bridge over the native [Android](https://github.com/idanalyzer/docupass-android)
and [iOS](https://github.com/idanalyzer/docupass-ios) DocuPass SDKs (CameraX /
AVFoundation + MediaPipe liveness) — so you get true native capture, not a wrapped
web page.

## Install

```sh
npm install @idanalyzer/docupass-react-native
# iOS
cd ios && pod install
```

Native dependencies are pulled in automatically:
- **iOS**: the `DocuPass` pod (which depends on `MediaPipeTasksVision`).
- **Android**: `com.idanalyzer:docupass` (autolinked). Register the package in
  your `MainApplication` (`DocuPassPackage()`), or rely on autolinking.

Add camera usage strings:
- **iOS** `Info.plist`: `NSCameraUsageDescription`.
- **Android**: the `CAMERA` permission is declared by the native core.

## Usage

```tsx
import { DocuPassView } from '@idanalyzer/docupass-react-native';

export function Verify() {
  return (
    <DocuPassView
      reference="US…"            // create server-side via POST /docupass
      style={{ flex: 1 }}
      onResult={(r) => {
        // r.status: 'completed' | 'failed' | 'cancelled' | 'error'
        // r.reference, r.code?, r.message?, r.redirectUrl?
      }}
    />
  );
}
```

The verification *data* lives server-side — fetch it with `GET /docupass/{reference}`
using your API key. The device only ever holds the `reference`.

## API

`<DocuPassView />` props:

| Prop | Type | Notes |
|---|---|---|
| `reference` | `string` | **required** — the DocuPass reference |
| `partyId` | `string?` | party sign-token (multi-party contract flows) |
| `baseUrl` | `string?` | base URL override (on-prem ID Fort) |
| `onResult` | `(e: DocuPassResultEvent) => void` | terminal callback |

## Links

- DocuPass: https://www.idanalyzer.com/products/docupass.html
- Developer docs: https://developer.idanalyzer.com/help

## License

[MIT](LICENSE) © ID Analyzer
