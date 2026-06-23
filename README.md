# DocuPass React Native SDK

Native ID Analyzer DocuPass KYC for React Native.

This package gives React Native apps two integration paths:

1. **Quick UI**: render `<KYCScreen />` and let the SDK run a complete React
   Native KYC screen.
2. **Custom UI**: use the headless event/session API and render every screen in
   your app.

The SDK does not use WebView for the KYC flow. The native module wraps the
published DocuPass iOS and Android SDK event engines. The quick React Native UI
renders screens in JavaScript and sends actions back to the native session.

## Security Model

Create DocuPass sessions on your backend. Your mobile app should receive only the
short-lived `reference`.

Do not put your ID Analyzer API key in React Native code. The callback from this
SDK is a UI signal only. Your backend webhook or server-side result lookup is the
source of truth for the final identity decision.

## Installation

### Event API Only

Use this path when you want to build every UI screen yourself.

```sh
npm install docupass-react-native
cd ios && pod install
```

### Quick KYCScreen

The quick screen uses VisionCamera for document capture and
`react-native-vision-camera-face-detector` for face actions.

```sh
npm install docupass-react-native \
  react-native-vision-camera \
  react-native-vision-camera-face-detector \
  react-native-nitro-modules \
  react-native-nitro-image

cd ios && pod install
```

Follow the VisionCamera and face-detector installation notes for your React
Native version.

### iOS

Add a camera usage string:

```xml
<key>NSCameraUsageDescription</key>
<string>Camera access is required for identity verification.</string>
```

The podspec depends on:

- `DocuPass ~> 0.2`
- `React-Core`

The pod is a static framework so it can integrate with the DocuPass iOS pod and
MediaPipe static XCFrameworks.

### Android

The Android module depends on:

- `com.idanalyzer:docupass:0.1.6`
- `com.facebook.react:react-android`

The quick screen requires camera permission at runtime through VisionCamera.

## Expo

Expo Go is not supported because this SDK contains native code. Use prebuild or
an EAS development build.

Add the config plugin:

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

Then run:

```sh
npx expo prebuild
```

For projects that already use `expo-build-properties`, keep iOS frameworks
static:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-build-properties",
        {
          "ios": {
            "useFrameworks": "static",
            "deploymentTarget": "15.0"
          },
          "android": {
            "minSdkVersion": 24
          }
        }
      ],
      "docupass-react-native"
    ]
  }
}
```

## Quick UI

```tsx
import React from 'react';
import { KYCScreen } from 'docupass-react-native';

export function VerifyScreen({ reference }: { reference: string }) {
  return (
    <KYCScreen
      reference={reference}
      onFinish={(event) => {
        if (event.status === 'completed') {
          // Update UI. Fetch verified data on your backend.
        }
        if (event.status === 'failed') {
          // Show retry or support UI.
        }
      }}
      onBackAtFirstStep={() => {
        // Close your screen.
      }}
    />
  );
}
```

The quick UI includes:

- Loading and error display
- Document country selection
- Document type selection
- Document capture through VisionCamera
- Face verification through `react-native-vision-camera-face-detector`
- Phone OTP
- Custom form fields
- Contract submission shell
- Completed and failed screens

You can replace specific steps while keeping the rest of the quick screen:

```tsx
<KYCScreen
  reference={reference}
  renderDocumentCapture={({ payload, uploadDocument }) => (
    <MyDocumentCamera
      payload={payload}
      onDone={(front, back) => uploadDocument(front, back)}
    />
  )}
  renderFaceVerification={({ payload, uploadFace }) => (
    <MyFaceScreen actions={payload.actions} onDone={uploadFace} />
  )}
/>
```

## Custom UI Event API

Use `useDocuPassKyc` when your app owns every screen.

```tsx
import React from 'react';
import { Button, Text, View } from 'react-native';
import { useDocuPassKyc } from 'docupass-react-native';

export function CustomKyc({ reference }: { reference: string }) {
  const model = useDocuPassKyc({ reference });
  const state = model.state;

  if (!state || state.event === 'loading') {
    return <Text>Loading</Text>;
  }

  switch (state.event) {
    case 'documentCountrySelection':
      return (
        <View>
          {state.documentCountrySelection?.countries.map((country) => (
            <Button
              key={country.code}
              title={country.name}
              onPress={() => model.selectDocumentCountry(country.code)}
            />
          ))}
        </View>
      );

    case 'documentSelection':
      return (
        <View>
          {state.documentSelection?.documentTypes.map((type) => (
            <Button
              key={type.apiTypeCode}
              title={type.label}
              onPress={() => model.selectDocumentType(type.apiTypeCode)}
            />
          ))}
        </View>
      );

    case 'documentCapture':
      return (
        <MyDocumentCamera
          payload={state.documentCapture}
          onDone={(frontBase64, backBase64) =>
            model.uploadDocument(frontBase64, backBase64)
          }
        />
      );

    case 'faceVerification':
      return (
        <MyFaceLiveness
          actions={state.face?.actions ?? []}
          onDone={(faceBase64List) => model.uploadFace(faceBase64List)}
        />
      );

    case 'phoneVerification':
      return (
        <MyPhoneOtp
          payload={state.phone}
          onSend={(number) => model.sendPhoneCode(number, 'sms')}
          onVerify={(number, code) => model.verifyPhoneCode(number, code)}
        />
      );

    case 'customForm':
      return (
        <MyCustomForm
          fields={state.customForm?.fields ?? []}
          onSubmit={(answers) => model.saveCustomForm(answers)}
        />
      );

    case 'contract':
      return (
        <MyContract
          html={state.contract?.html ?? ''}
          signatureFields={state.contract?.signatureFields ?? []}
          onSubmit={(signatures) => model.submitContract(signatures)}
        />
      );

    case 'partyPending':
      return <Button title="Refresh" onPress={() => model.refresh()} />;

    case 'completed':
      return <Text>Verification complete</Text>;

    case 'failed':
      return <Text>Verification failed</Text>;
  }
}
```

## Session Commands

`useDocuPassKyc` and `createDocuPassSession` expose the same commands:

| Command | Use |
| --- | --- |
| `start()` | Start loading the DocuPass task. Hooks auto-start by default. |
| `refresh()` | Resync the server task, especially on `partyPending`. |
| `back()` | Move to the previous event when `state.canGoBack` is true. |
| `clearError()` | Clear the current non-terminal error. |
| `restart()` | Reset local state and start again. |
| `sendPhoneCode(number, type)` | Send SMS or call OTP. |
| `verifyPhoneCode(number, code)` | Verify OTP. |
| `saveCustomForm(answers)` | Submit custom field answers. |
| `selectDocumentCountry(code)` | Choose emitted ISO-2 country. |
| `selectDocumentType(code)` | Choose emitted document type code. |
| `uploadDocument(frontBase64, backBase64)` | Submit raw JPEG base64 document images. |
| `uploadFace(faceBase64List)` | Submit raw JPEG base64 face images. |
| `submitContract(signatures)` | Submit PNG data URLs keyed by signature UID. |

Do not call step-specific commands before the matching event is emitted. Disable
controls while `state.isBusy` is true.

## State Shape

Every update has this shape:

```ts
type DocuPassKycState = {
  event:
    | 'loading'
    | 'phoneVerification'
    | 'customForm'
    | 'documentCountrySelection'
    | 'documentSelection'
    | 'documentCapture'
    | 'faceVerification'
    | 'contract'
    | 'partyPending'
    | 'completed'
    | 'failed';
  isBusy: boolean;
  canGoBack: boolean;
  errorMessage?: string;
  normalizedError?: DocuPassNormalizedError;
  result: DocuPassResult;
  phone?: DocuPassPhoneVerificationPayload;
  customForm?: DocuPassCustomFormPayload;
  documentCountrySelection?: DocuPassDocumentCountrySelectionPayload;
  documentSelection?: DocuPassDocumentSelectionPayload;
  documentCapture?: DocuPassDocumentCapturePayload;
  face?: DocuPassFaceVerificationPayload;
  contract?: DocuPassContractPayload;
  completed?: DocuPassCompletedPayload;
  failed?: DocuPassFailedPayload;
};
```

## Face Verification

The native DocuPass session emits:

```ts
state.face?.actions
```

The quick `KYCScreen` uses `react-native-vision-camera-face-detector` to detect
the required actions:

- `turnLeft`
- `turnRight`
- `turnUp`
- `mouthOpen`

After every action is held, the quick UI captures a JPEG frame, converts it to
raw base64 with the native helper, and calls `uploadFace(faceBase64List)`.

Custom UI can use the same package, another liveness UI, or its own native
camera implementation. The only requirement is to call `uploadFace` with a
non-empty array of raw JPEG base64 strings.

## Document Images

`uploadDocument(frontBase64, backBase64)` expects raw JPEG base64 strings without
`data:image/...` prefixes.

Use `readImageFileAsBase64(uri)` if your camera library returns a local file path
or `file://` URI.

## Publishing

This package publishes to npm through GitHub Actions trusted publishing.

Release steps:

```sh
npm version 0.2.0 --no-git-tag-version
npm run typecheck
npm run build
npm pack --dry-run
git add .
git commit -m "release: v0.2.0"
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

The publish workflow checks that `vX.Y.Z` matches `package.json` before running
`npm publish --provenance --access public`.

## License

[MIT](LICENSE) (c) ID Analyzer
