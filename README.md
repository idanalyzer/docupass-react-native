# DocuPass React Native SDK

Pure JavaScript React Native SDK for running an ID Analyzer DocuPass verification
flow inside an app.

The package includes:

- A ready-to-use React Native `KYCScreen`
- A headless event/session API for custom UI
- DocuPass API transport, authorization handling, and task routing
- Phone, custom form, document, face, contract, pending-party, completed, and
  failed flow handling
- Optional adapter hooks for app-owned camera, liveness, and signature capture

Create DocuPass sessions on your backend. The mobile app should receive only the
short-lived `reference`; never ship an ID Analyzer API key in React Native code.
The finish callback is a UI signal only. Your backend webhook or server-side
result lookup remains the source of truth.

## Install

```sh
npm install docupass-react-native
```

This package is pure JS and does not autolink native modules. If your app uses
the quick UI's camera/liveness/signature adapter hooks, install and configure the
camera or drawing library you choose in the host app.

For the bundled VisionCamera document/face capture and signature canvas adapter:

```sh
npm install docupass-react-native \
  react-native-vision-camera \
  react-native-vision-camera-face-detector \
  react-native-nitro-modules \
  react-native-nitro-image \
  react-native-signature-canvas \
  react-native-webview
```

Then render the native-capture wrapper from the SDK subpath:

```tsx
import { DocupassNativeCaptureScreen } from 'docupass-react-native/native-capture';

export function VerifyScreen({ reference }: { reference: string }) {
  return <DocupassNativeCaptureScreen reference={reference} />;
}
```

Document capture uses `react-native-vision-camera`; face actions use
`react-native-vision-camera-face-detector`; signature capture uses
`react-native-signature-canvas`. MediaPipe is not used by this package.

For Expo prebuild projects, the included config plugin can add camera permission
strings:

```json
{
  "expo": {
    "plugins": [
      [
        "docupass-react-native",
        {
          "cameraPermission": "Camera access is required for identity verification."
        }
      ]
    ]
  }
}
```

## Quick UI

```tsx
import { KYCScreen } from 'docupass-react-native';

export function VerifyScreen({ reference }: { reference: string }) {
  return (
    <KYCScreen
      reference={reference}
      onFinish={(result) => {
        console.log(result.sessionId);
      }}
      onBackAtFirstStep={() => {
        // Close this screen in your navigator.
      }}
    />
  );
}
```

`KYCScreen` handles loading, server task routing, country and document type
selection, phone OTP, custom forms, document upload, face upload, contract
signatures, pending-party refresh, back navigation, and terminal screens.

Because this SDK is pure JS, capture is adapter-based:

```tsx
<KYCScreen
  reference={reference}
  captureDocumentSide={async (side, context) => {
    // Open your app's camera and return raw JPEG base64 without a data URL prefix.
    return captureDocumentWithYourCamera(side, context);
  }}
  captureFace={async (actions) => {
    // Run your liveness UI and return raw JPEG base64 frames.
    return captureFaceFrames(actions);
  }}
  collectContractSignature={async (field) => {
    // Return data:image/png;base64,...
    return openSignaturePad(field);
  }}
/>
```

If an adapter is not supplied, the quick UI shows manual base64/data URL fields.
That keeps the SDK buildable and testable in apps that want to provide capture
later or build fully custom screens.

## Event API

```tsx
import { DocupassKycSession, docupassConfigFromReference } from 'docupass-react-native';

const session = new DocupassKycSession(docupassConfigFromReference(reference));

const subscription = session.subscribe((state) => {
  switch (state.event.kind) {
    case 'documentCountrySelection':
      console.log(state.event.countries);
      break;
    case 'completed':
      console.log(state.event.result.sessionId);
      break;
  }
});

session.start();

// When the owner unmounts:
subscription.close();
session.close();
```

Session methods match the native SDK flow:

- `start()`, `refresh()`, `back()`, `clearError()`, `restart()`, `close()`
- `sendPhoneCode(number, type)`, `verifyPhoneCode(number, code)`
- `saveCustomForm(answers)`
- `selectDocumentCountry(countryCode)`, `selectDocumentType(documentTypeCode)`
- `uploadDocument(frontBase64, backBase64)`
- `uploadFace(faceBase64List)`
- `submitContract(signatures)`

Do not call step-specific methods before the matching event is emitted. While
`state.isBusy` is true, keep UI controls disabled.

## Configuration

```ts
import { docupassConfigFromReference } from 'docupass-react-native';

const geolocation = 'latitude,longitude,accuracy';
const config = docupassConfigFromReference(
  reference,
  partyId,
  geolocation,
);
```

`EU` references use `https://api2-eu.idanalyzer.com/docupassappv3`; all other
references use the US endpoint.

Authorization is generated automatically:

```text
DOCUPASS <reference>
DOCUPASS <reference> <partyId>
DOCUPASS_SESSION <sessionId>
```

After `get_action` returns a `sessionId`, later requests use `DOCUPASS_SESSION`.

## Local Demo Mode

Set `enabled={false}` or `apiConfig.enabled = false` to run the local fallback
workflow without calling the DocuPass API. This is useful for demo apps and CI
build checks.
