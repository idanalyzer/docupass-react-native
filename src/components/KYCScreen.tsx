import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { useDocuPassKyc } from '../useDocuPassKyc';
import type {
  DocuPassConfig,
  DocuPassCustomField,
  DocuPassDocumentCapturePayload,
  DocuPassFaceVerificationPayload,
  DocuPassKycState,
  KYCScreenFinishEvent,
} from '../types';
import { DocumentCaptureScreen } from './DocumentCaptureScreen';
import { FaceVerificationScreen } from './FaceVerificationScreen';

export interface KYCScreenProps {
  reference?: string;
  config?: DocuPassConfig;
  style?: ViewStyle;
  onFinish?: (event: KYCScreenFinishEvent) => void;
  onBackAtFirstStep?: () => void;
  renderDocumentCapture?: (props: {
    payload: DocuPassDocumentCapturePayload;
    state: DocuPassKycState;
    uploadDocument(frontBase64: string, backBase64?: string): Promise<void>;
  }) => React.ReactNode;
  renderFaceVerification?: (props: {
    payload: DocuPassFaceVerificationPayload;
    state: DocuPassKycState;
    uploadFace(faceBase64List: string[]): Promise<void>;
  }) => React.ReactNode;
}

function fieldKey(field: DocuPassCustomField): string {
  return field.fieldId || field.fieldLabel;
}

function optionRows(fieldData: string): Array<{ label: string; value: string }> {
  return fieldData
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const parts = row.split(/;|\t|\|/);
      const label = parts[0]?.trim() || row;
      const value = parts[1]?.trim() || label;
      return { label, value };
    });
}

export function KYCScreen({
  reference,
  config,
  style,
  onFinish,
  onBackAtFirstStep,
  renderDocumentCapture,
  renderFaceVerification,
}: KYCScreenProps) {
  const effectiveConfig = useMemo<DocuPassConfig>(
    () => config ?? { reference: reference ?? '' },
    [config, reference]
  );
  const kyc = useDocuPassKyc(effectiveConfig);
  const finishedRef = useRef(false);

  useEffect(() => {
    const state = kyc.state;
    if (!state || finishedRef.current) {
      return;
    }
    if (state.event === 'completed') {
      finishedRef.current = true;
      onFinish?.({ status: 'completed', state, result: state.completed?.result ?? state.result });
    }
    if (state.event === 'failed') {
      finishedRef.current = true;
      onFinish?.({ status: 'failed', state, result: state.failed?.result ?? state.result });
    }
  }, [kyc.state, onFinish]);

  const onBack = () => {
    if (kyc.state?.canGoBack && !kyc.state.isBusy) {
      void kyc.back();
    } else {
      onBackAtFirstStep?.();
    }
  };

  if (!effectiveConfig.reference) {
    return (
      <SafeAreaView style={[styles.root, styles.center, style]}>
        <Text style={styles.title}>Reference required</Text>
        <Text style={styles.body}>Pass a DocuPass reference or config to KYCScreen.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, style]}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" style={styles.iconButton} onPress={onBack}>
          <Text style={styles.iconButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>DocuPass</Text>
        <View style={styles.iconButton} />
      </View>

      <View style={styles.content}>
        {kyc.error ? (
          <Message title="SDK error" detail={kyc.error.message} tone="error" />
        ) : kyc.state ? (
          renderEvent({
            state: kyc.state,
            isBusy: kyc.state.isBusy,
            commands: kyc,
            renderDocumentCapture,
            renderFaceVerification,
          })
        ) : (
          <LoadingScreen />
        )}
      </View>

      {kyc.state?.errorMessage ? (
        <View style={styles.errorBanner}>
          <View style={styles.errorTextWrap}>
            <Text style={styles.errorTitle}>{kyc.state.normalizedError?.title ?? 'Verification error'}</Text>
            <Text style={styles.errorDetail}>{kyc.state.errorMessage}</Text>
          </View>
          <Pressable accessibilityRole="button" style={styles.bannerButton} onPress={() => void kyc.clearError()}>
            <Text style={styles.bannerButtonText}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}

      {kyc.state?.isBusy ? (
        <View style={styles.busyOverlay} pointerEvents="none">
          <ActivityIndicator color="#57d68d" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function renderEvent({
  state,
  isBusy,
  commands,
  renderDocumentCapture,
  renderFaceVerification,
}: {
  state: DocuPassKycState;
  isBusy: boolean;
  commands: ReturnType<typeof useDocuPassKyc>;
  renderDocumentCapture?: KYCScreenProps['renderDocumentCapture'];
  renderFaceVerification?: KYCScreenProps['renderFaceVerification'];
}) {
  switch (state.event) {
    case 'loading':
      return <LoadingScreen />;
    case 'documentCountrySelection':
      return (
        <ScrollView contentContainerStyle={styles.listContent}>
          <Text style={styles.title}>Select issuing country</Text>
          {state.documentCountrySelection?.countries.map((country) => (
            <RowButton
              key={country.code}
              title={country.name}
              subtitle={country.code}
              disabled={isBusy}
              onPress={() => void commands.selectDocumentCountry(country.code)}
            />
          ))}
        </ScrollView>
      );
    case 'documentSelection':
      return (
        <ScrollView contentContainerStyle={styles.listContent}>
          <Text style={styles.title}>{state.documentSelection?.country.name ?? 'Select document'}</Text>
          {state.documentSelection?.documentTypes.map((type) => (
            <RowButton
              key={type.apiTypeCode}
              title={type.label}
              subtitle={type.requiresBackSide ? 'Front and back' : 'Front only'}
              disabled={isBusy}
              onPress={() => void commands.selectDocumentType(type.apiTypeCode)}
            />
          ))}
        </ScrollView>
      );
    case 'documentCapture': {
      const payload = state.documentCapture;
      if (!payload) {
        return <Message title="Document capture unavailable" detail="The SDK did not provide document capture data." />;
      }
      if (renderDocumentCapture) {
        return renderDocumentCapture({
          payload,
          state,
          uploadDocument: commands.uploadDocument,
        });
      }
      return (
        <DocumentCaptureScreen
          payload={payload}
          disabled={isBusy}
          onSubmit={(front, back) => commands.uploadDocument(front, back)}
        />
      );
    }
    case 'faceVerification': {
      const payload = state.face;
      if (!payload) {
        return <Message title="Face verification unavailable" detail="The SDK did not provide face actions." />;
      }
      if (renderFaceVerification) {
        return renderFaceVerification({
          payload,
          state,
          uploadFace: commands.uploadFace,
        });
      }
      return (
        <FaceVerificationScreen
          actions={payload.actions}
          disabled={isBusy}
          onComplete={(frames) => commands.uploadFace(frames)}
        />
      );
    }
    case 'phoneVerification':
      return <PhoneScreen state={state} isBusy={isBusy} commands={commands} />;
    case 'customForm':
      return <CustomFormScreen state={state} isBusy={isBusy} commands={commands} />;
    case 'contract':
      return <ContractScreen state={state} isBusy={isBusy} commands={commands} />;
    case 'partyPending':
      return (
        <View style={styles.panel}>
          <Text style={styles.title}>Waiting for another party</Text>
          <Text style={styles.body}>This signing session needs another party before it can continue.</Text>
          <PrimaryButton title="Refresh" disabled={isBusy} onPress={() => void commands.refresh()} />
        </View>
      );
    case 'completed':
      return (
        <View style={styles.panel}>
          <Text style={styles.successTitle}>Verification complete</Text>
          <Text style={styles.body}>Your verification flow has finished.</Text>
        </View>
      );
    case 'failed':
      return (
        <View style={styles.panel}>
          <Text style={styles.failureTitle}>Verification failed</Text>
          <Text style={styles.body}>
            {state.failed?.error?.displayMessage ?? state.failed?.error?.detail ?? 'The verification was not accepted.'}
          </Text>
        </View>
      );
    default:
      return <Message title="Unsupported event" detail={`Unhandled state: ${state.event}`} />;
  }
}

function PhoneScreen({
  state,
  isBusy,
  commands,
}: {
  state: DocuPassKycState;
  isBusy: boolean;
  commands: ReturnType<typeof useDocuPassKyc>;
}) {
  const phone = state.phone;
  const presetPhone = phone?.state.userPhone;
  const [number, setNumber] = useState(presetPhone ?? phone?.currentNumber ?? '');
  const [code, setCode] = useState('');

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Verify phone</Text>
      <Text style={styles.body}>{phone?.codeSent ? 'Enter the verification code.' : 'Send a code to continue.'}</Text>
      {!presetPhone ? (
        <TextInput
          style={styles.input}
          value={number}
          keyboardType="phone-pad"
          placeholder="+15551234567"
          placeholderTextColor="#7d8c83"
          onChangeText={setNumber}
        />
      ) : (
        <Text style={styles.valueText}>{presetPhone}</Text>
      )}
      {phone?.codeSent ? (
        <TextInput
          style={styles.input}
          value={code}
          keyboardType="number-pad"
          placeholder="Verification code"
          placeholderTextColor="#7d8c83"
          onChangeText={setCode}
        />
      ) : null}
      <PrimaryButton
        title={phone?.codeSent ? 'Verify code' : 'Send SMS'}
        disabled={isBusy || (!presetPhone && !number.trim()) || (phone?.codeSent && !code.trim())}
        onPress={() =>
          phone?.codeSent
            ? void commands.verifyPhoneCode(presetPhone ? undefined : number, code)
            : void commands.sendPhoneCode(presetPhone ? undefined : number, 'sms')
        }
      />
    </View>
  );
}

function CustomFormScreen({
  state,
  isBusy,
  commands,
}: {
  state: DocuPassKycState;
  isBusy: boolean;
  commands: ReturnType<typeof useDocuPassKyc>;
}) {
  const fields = state.customForm?.fields ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});

  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <Text style={styles.title}>Additional information</Text>
      {fields.map((field) => {
        const key = fieldKey(field);
        const options = field.fieldType === 2 ? optionRows(field.fieldData) : [];
        return (
          <View key={key} style={styles.fieldBlock}>
            <Text style={styles.label}>{field.fieldLabel || key}</Text>
            {field.fieldDescription ? <Text style={styles.caption}>{field.fieldDescription}</Text> : null}
            {options.length ? (
              options.map((option) => (
                <RowButton
                  key={option.value}
                  title={option.label}
                  subtitle={answers[key] === option.value ? 'Selected' : undefined}
                  disabled={isBusy}
                  onPress={() => setAnswers((current) => ({ ...current, [key]: option.value }))}
                />
              ))
            ) : (
              <TextInput
                style={[styles.input, field.fieldType === 1 && styles.multilineInput]}
                value={answers[key] ?? ''}
                multiline={field.fieldType === 1}
                placeholder={field.fieldLabel || key}
                placeholderTextColor="#7d8c83"
                onChangeText={(value) => setAnswers((current) => ({ ...current, [key]: value }))}
              />
            )}
          </View>
        );
      })}
      <PrimaryButton title="Continue" disabled={isBusy} onPress={() => void commands.saveCustomForm(answers)} />
    </ScrollView>
  );
}

function ContractScreen({
  state,
  isBusy,
  commands,
}: {
  state: DocuPassKycState;
  isBusy: boolean;
  commands: ReturnType<typeof useDocuPassKyc>;
}) {
  const signatureFields = state.contract?.signatureFields ?? [];
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const canSubmit = signatureFields.length === 0 || signatureDataUrl.startsWith('data:image/');

  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <Text style={styles.title}>{state.contract?.state.companyName ?? 'Review contract'}</Text>
      <Text style={styles.body}>
        {state.contract?.html
          ? state.contract.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          : 'Review and sign the contract to continue.'}
      </Text>
      {signatureFields.length ? (
        <>
          <Text style={styles.label}>Signature image data URL</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={signatureDataUrl}
            multiline
            placeholder="data:image/png;base64,..."
            placeholderTextColor="#7d8c83"
            onChangeText={setSignatureDataUrl}
          />
          <Text style={styles.caption}>
            Required signatures: {signatureFields.map((field) => field.label || field.uid).join(', ')}
          </Text>
        </>
      ) : null}
      <PrimaryButton
        title="Submit contract"
        disabled={isBusy || !canSubmit}
        onPress={() => {
          const signatures = Object.fromEntries(
            signatureFields.map((field) => [field.uid, signatureDataUrl])
          );
          void commands.submitContract(signatures);
        }}
      />
    </ScrollView>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color="#57d68d" />
      <Text style={styles.body}>Loading verification</Text>
    </View>
  );
}

function Message({
  title,
  detail,
  tone,
}: {
  title: string;
  detail: string;
  tone?: 'error';
}) {
  return (
    <View style={styles.panel}>
      <Text style={tone === 'error' ? styles.failureTitle : styles.title}>{title}</Text>
      <Text style={styles.body}>{detail}</Text>
    </View>
  );
}

function RowButton({
  title,
  subtitle,
  disabled,
  onPress,
}: {
  title: string;
  subtitle?: string;
  disabled?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [styles.row, (pressed || disabled) && styles.rowPressed]}
      onPress={onPress}
    >
      <Text style={styles.rowTitle}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </Pressable>
  );
}

function PrimaryButton({
  title,
  disabled,
  onPress,
}: {
  title: string;
  disabled?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [styles.primaryButton, (pressed || disabled) && styles.primaryButtonMuted]}
      onPress={onPress}
    >
      <Text style={styles.primaryButtonText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#071510',
  },
  topBar: {
    height: 54,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  topTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  iconButton: {
    minWidth: 64,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    color: '#d7e4dc',
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  panel: {
    flex: 1,
    padding: 22,
    justifyContent: 'center',
    gap: 14,
  },
  listContent: {
    padding: 20,
    gap: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  successTitle: {
    color: '#57d68d',
    fontSize: 26,
    fontWeight: '900',
  },
  failureTitle: {
    color: '#ffb4ab',
    fontSize: 24,
    fontWeight: '800',
  },
  body: {
    color: '#d7e4dc',
    fontSize: 15,
    lineHeight: 22,
  },
  caption: {
    color: '#9bad9f',
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  row: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#12251a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  rowPressed: {
    opacity: 0.72,
  },
  rowTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  rowSubtitle: {
    color: '#9bad9f',
    marginTop: 4,
    fontSize: 13,
  },
  input: {
    minHeight: 50,
    borderRadius: 8,
    paddingHorizontal: 14,
    color: '#ffffff',
    backgroundColor: '#12251a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  multilineInput: {
    minHeight: 110,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  valueText: {
    color: '#ffffff',
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#12251a',
  },
  fieldBlock: {
    gap: 8,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#57d68d',
  },
  primaryButtonMuted: {
    opacity: 0.62,
  },
  primaryButtonText: {
    color: '#071510',
    fontWeight: '900',
    fontSize: 16,
  },
  errorBanner: {
    margin: 14,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#3a1716',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  errorTextWrap: {
    flex: 1,
  },
  errorTitle: {
    color: '#ffdad6',
    fontWeight: '800',
  },
  errorDetail: {
    color: '#ffdad6',
    marginTop: 4,
    fontSize: 13,
  },
  bannerButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#ffdad6',
  },
  bannerButtonText: {
    color: '#3a1716',
    fontWeight: '800',
  },
  busyOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    justifyContent: 'center',
  },
});
