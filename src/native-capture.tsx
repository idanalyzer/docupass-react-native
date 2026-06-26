import React from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  DocupassVisionCameraScreen,
  type DocupassVisionCameraScreenProps,
} from './vision-camera';
import { cleanContractHtml } from './helpers';
import { useSignatureCaptureAdapter } from './signature-canvas';

export interface DocupassNativeCaptureScreenProps
  extends Omit<DocupassVisionCameraScreenProps, 'collectContractSignature'> {
  collectContractSignature?: DocupassVisionCameraScreenProps['collectContractSignature'];
  onSignatureError?: (error: Error) => void;
}

export function DocupassNativeCaptureScreen({
  collectContractSignature,
  onSignatureError,
  renderContractHtml,
  ...props
}: DocupassNativeCaptureScreenProps): JSX.Element {
  const signature = useSignatureCaptureAdapter({ onSignatureError });

  return (
    <>
      <DocupassVisionCameraScreen
        {...props}
        collectContractSignature={collectContractSignature || signature.collectContractSignature}
        renderContractHtml={
          renderContractHtml ||
          ((html) => (
            <WebView
              javaScriptEnabled={false}
              originWhitelist={['*']}
              source={{ html: cleanContractHtml(html) }}
              style={styles.contractWebView}
            />
          ))
        }
      />
      {signature.signatureModal}
    </>
  );
}

export * from './vision-camera';
export * from './signature-canvas';

const styles = StyleSheet.create({
  contractWebView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
