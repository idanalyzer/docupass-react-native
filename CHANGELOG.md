# Changelog

## 0.1.1

- **Customization props** on `<DocuPassView>` — `brandColor`, `logoUrl`, and
  `labels` (override any user-facing label, in any language), forwarded to the
  native cores' `DocuPassTheme` / `DocuPassStrings`.
- Picks up the native cores' 0.1.1 audit fixes (e-signature `data-signature`
  field detection, phone country-code picker).

## 0.1.0

Initial DocuPass React Native bridge over the native Android + iOS cores.

- `<DocuPassView>` native component (legacy/Paper arch): props `reference`,
  `partyId`, `baseUrl`; `onResult` event.
- Android: `DocuPassViewManager` hosts the native Compose `DocuPassView` in an
  `AbstractComposeView`; `DocuPassPackage` for registration.
- iOS: `DocuPassRNView` hosts the SwiftUI `DocuPassView` via `UIHostingController`;
  `DocuPassViewManager` (+ ObjC bridge).
- TypeScript types for props + result event.

Wraps the native SDKs (no logic reimplemented). New-architecture (Fabric) support
is a follow-up.
