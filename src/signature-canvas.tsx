import React, { ReactNode, useCallback, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import SignatureCanvas, {
  type SignatureViewRef,
} from 'react-native-signature-canvas';
import { KYCScreenProps } from './KYCScreen';
import { DocupassContractSignatureField } from './types';

export interface SignatureCaptureModalProps {
  visible: boolean;
  field?: DocupassContractSignatureField | null;
  onCancel: () => void;
  onSignature: (dataUrl: string) => void;
  onError?: (error: Error) => void;
}

export function SignatureCaptureModal({
  visible,
  field,
  onCancel,
  onSignature,
  onError,
}: SignatureCaptureModalProps): JSX.Element {
  const signatureRef = useRef<SignatureViewRef | null>(null);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={signatureStyles.root}>
        <View style={signatureStyles.header}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={signatureStyles.headerButton}>
            <Text style={signatureStyles.headerButtonText}>CANCEL</Text>
          </Pressable>
          <Text style={signatureStyles.title}>{field?.label || 'Signature'}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => signatureRef.current?.readSignature()}
            style={signatureStyles.headerButton}
          >
            <Text style={signatureStyles.headerButtonText}>DONE</Text>
          </Pressable>
        </View>

        <View style={signatureStyles.pad}>
          <SignatureCanvas
            ref={signatureRef}
            autoClear={false}
            backgroundColor="#FFFFFF"
            penColor="#111111"
            imageType="image/png"
            trimWhitespace
            onOK={onSignature}
            onEmpty={() => onError?.(new Error('Please sign before continuing.'))}
            onError={(error) => onError?.(error)}
            webStyle={signatureWebStyle}
          />
        </View>

        <View style={signatureStyles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => signatureRef.current?.clearSignature()}
            style={signatureStyles.secondaryButton}
          >
            <Text style={signatureStyles.secondaryButtonText}>CLEAR</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => signatureRef.current?.undo()}
            style={signatureStyles.secondaryButton}
          >
            <Text style={signatureStyles.secondaryButtonText}>UNDO</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function useSignatureCaptureAdapter(options: {
  onSignatureError?: (error: Error) => void;
} = {}): {
  collectContractSignature: NonNullable<KYCScreenProps['collectContractSignature']>;
  signatureModal: ReactNode;
} {
  const [request, setRequest] = useState<{
    field: DocupassContractSignatureField;
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  } | null>(null);

  const collectContractSignature = useCallback<NonNullable<KYCScreenProps['collectContractSignature']>>(
    (field) =>
      new Promise((resolve, reject) => {
        setRequest({ field, resolve, reject });
      }),
    [],
  );

  const signatureModal = (
    <SignatureCaptureModal
      visible={!!request}
      field={request?.field}
      onCancel={() => {
        request?.reject(new Error('Signature capture cancelled.'));
        setRequest(null);
      }}
      onSignature={(dataUrl) => {
        request?.resolve(dataUrl);
        setRequest(null);
      }}
      onError={(error) => {
        options.onSignatureError?.(error);
      }}
    />
  );

  return { collectContractSignature, signatureModal };
}

const signatureWebStyle = `
  .m-signature-pad {
    box-shadow: none;
    border: none;
  }
  .m-signature-pad--body {
    border: none;
  }
  .m-signature-pad--footer {
    display: none;
  }
  body, html {
    background: #ffffff;
  }
`;

const signatureStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050A08',
  },
  header: {
    height: 94,
    paddingTop: 42,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.18)',
  },
  title: {
    flex: 1,
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '900',
  },
  headerButton: {
    width: 86,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: {
    color: '#00FFAB',
    fontSize: 12,
    fontWeight: '900',
  },
  pad: {
    flex: 1,
    margin: 16,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});
