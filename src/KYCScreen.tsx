import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fetchDocupassCountries } from './countries';
import {
  displayNormalizedError,
  docupassConfigFromReference,
  injectContractSignatures,
  kycSettingsFromReference,
  parseCustomFieldOptions,
  requiresDocumentBackSide,
  stripHtml,
} from './helpers';
import { useDocupassKyc } from './useDocupassKyc';
import {
  DocupassApiConfig,
  DocupassCustomField,
  DocupassKycEvent,
  DocupassKycUiState,
  KYCAction,
  KYCResult,
  KYCSettings,
  KYCCountry,
  KYCDocumentType,
} from './types';

export { kycSettingsFromReference };

export interface KYCScreenProps {
  settings?: KYCSettings;
  apiConfig?: DocupassApiConfig;
  reference?: string;
  partyId?: string | null;
  geolocation?: string | null;
  enabled?: boolean;
  maskCircleRadius?: number;
  maskCircleY?: number;
  turnTimeSeconds?: number;
  onFinish?: (result: KYCResult) => void;
  onBackAtFirstStep?: () => void;
  captureDocumentSide?: KYCSettings['captureDocumentSide'];
  captureFace?: KYCSettings['captureFace'];
  renderFaceVerification?: (props: KYCFaceVerificationRenderProps) => ReactNode;
  collectContractSignature?: KYCSettings['collectContractSignature'];
  renderContractHtml?: (html: string) => ReactNode;
}

export interface KYCFaceVerificationRenderProps {
  actions: KYCAction[];
  settings: KYCSettings;
  isBusy: boolean;
  onComplete: (faces: string[]) => void | Promise<void>;
  onCancel: () => void;
}

type RunWithLoading = (operation: () => void | Promise<void>) => Promise<void>;

export function KYCScreen(props: KYCScreenProps): JSX.Element {
  const settings = useMemo(() => resolveSettings(props), [
    props.settings,
    props.apiConfig,
    props.reference,
    props.partyId,
    props.geolocation,
    props.enabled,
    props.maskCircleRadius,
    props.maskCircleY,
    props.turnTimeSeconds,
    props.onFinish,
    props.onBackAtFirstStep,
    props.captureDocumentSide,
    props.captureFace,
    props.collectContractSignature,
  ]);

  const uiState = useDocupassKyc({ config: settings.apiConfig });
  const [isActionLoading, setIsActionLoading] = useState(false);
  const actionLoadingRef = useRef(false);
  const runWithLoading = useCallback<RunWithLoading>(async (operation) => {
    if (actionLoadingRef.current) {
      return;
    }
    actionLoadingRef.current = true;
    setIsActionLoading(true);
    const startedAt = Date.now();
    try {
      await waitForNextPaint();
      await operation();
    } finally {
      await waitForMinimumDuration(Math.max(0, 700 - (Date.now() - startedAt)));
      actionLoadingRef.current = false;
      setIsActionLoading(false);
    }
  }, []);
  const isBusy = uiState.isBusy || isActionLoading;
  const isResultScreen = uiState.event.kind === 'completed' || uiState.event.kind === 'failed';
  const showBack = uiState.event.kind !== 'loading' && !isResultScreen;
  const isCustomFaceVerification =
    uiState.event.kind === 'faceVerification' && !!props.renderFaceVerification;

  const goBack = () => {
    if (uiState.canGoBack) {
      uiState.session.back();
    } else {
      settings.onBackAtFirstStep();
    }
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (uiState.error) {
        uiState.session.clearError();
        return true;
      }
      if (isResultScreen) return true;
      if (!isBusy) goBack();
      return true;
    });
    return () => subscription.remove();
  }, [isBusy, isResultScreen, uiState]);

  return (
    <View style={styles.root}>
      <EventContent
        event={uiState.event}
        state={uiState}
        settings={settings}
        isActionLoading={isActionLoading}
        runWithLoading={runWithLoading}
        renderFaceVerification={props.renderFaceVerification}
        renderContractHtml={props.renderContractHtml}
      />

      {isBusy && uiState.event.kind !== 'loading' ? <BusyOverlay /> : null}
      {showBack && !isCustomFaceVerification ? (
        <BackButton disabled={isBusy} onPress={goBack} />
      ) : null}
      {uiState.error ? (
        <ErrorOverlay error={uiState.error} onDismiss={() => uiState.session.clearError()} />
      ) : null}
    </View>
  );
}

function EventContent({
  event,
  state,
  settings,
  isActionLoading,
  runWithLoading,
  renderFaceVerification,
  renderContractHtml,
}: {
  event: DocupassKycEvent;
  state: DocupassKycUiState & ReturnType<typeof useDocupassKyc>;
  settings: KYCSettings;
  isActionLoading: boolean;
  runWithLoading: RunWithLoading;
  renderFaceVerification?: (props: KYCFaceVerificationRenderProps) => ReactNode;
  renderContractHtml?: (html: string) => ReactNode;
}): JSX.Element {
  const isBusy = state.isBusy || isActionLoading;

  switch (event.kind) {
    case 'loading':
      return <LoadingScreen />;
    case 'phoneVerification':
      return (
        <PhoneVerificationScreen
          event={event}
          isBusy={isBusy}
          onSend={(number, type) => runWithLoading(() => state.session.sendPhoneCode(number, type))}
          onVerify={(number, code) =>
            runWithLoading(() => state.session.verifyPhoneCode(number, code))
          }
        />
      );
    case 'customForm':
      return (
        <CustomFormScreen
          fields={event.fields}
          isBusy={isBusy}
          onSubmit={(answers) => runWithLoading(() => state.session.saveCustomForm(answers))}
        />
      );
    case 'documentCountrySelection':
      return (
        <CountryPickerScreen
          filterCodes={event.filterCodes}
          onSelected={(country) => state.session.selectDocumentCountry(country.code)}
        />
      );
    case 'documentSelection':
      return (
        <DocumentTypePickerScreen
          country={event.country}
          documentTypes={event.documentTypes}
          isBusy={isBusy}
          onSelected={(documentType) =>
            runWithLoading(() => state.session.selectDocumentType(documentType.apiTypeCode))
          }
        />
      );
    case 'documentCapture':
      return (
        <DocumentCaptureScreen
          event={event}
          isBusy={isBusy}
          captureDocumentSide={settings.captureDocumentSide}
          onCaptured={(front, back) =>
            runWithLoading(() => state.session.uploadDocument(front, back))
          }
        />
      );
    case 'faceVerification':
      if (renderFaceVerification) {
        return (
          <>
            {renderFaceVerification({
              actions: event.actions,
              settings,
              isBusy,
              onComplete: (faces) => runWithLoading(() => state.session.uploadFace(faces)),
              onCancel: () => {
                if (state.canGoBack) {
                  state.session.back();
                } else {
                  settings.onBackAtFirstStep();
                }
              },
            })}
          </>
        );
      }
      return (
        <BiometricScreen
          actions={event.actions}
          settings={settings}
          isBusy={isBusy}
          onComplete={(faces) => runWithLoading(() => state.session.uploadFace(faces))}
        />
      );
    case 'contract':
      return (
        <ContractScreen
          event={event}
          isBusy={isBusy}
          collectContractSignature={settings.collectContractSignature}
          renderContractHtml={renderContractHtml}
          onSubmit={(signatures) =>
            runWithLoading(() => state.session.submitContract(signatures))
          }
        />
      );
    case 'partyPending':
      return (
        <PartyPendingScreen
          isBusy={isBusy}
          onRefresh={() => runWithLoading(() => state.session.refresh())}
        />
      );
    case 'completed':
      return <ResultScreen success result={event.result} onFinish={() => settings.onFinish(event.result)} />;
    case 'failed':
      return (
        <ResultScreen
          success={false}
          result={event.result}
          error={event.error}
          onFinish={() => settings.onFinish(event.result)}
        />
      );
  }
}

function LoadingScreen(): JSX.Element {
  return (
    <Centered>
      <ActivityIndicator color={theme.accent} size="large" />
      <Text style={styles.loadingText}>INITIALIZING VERIFICATION</Text>
    </Centered>
  );
}

function PhoneVerificationScreen({
  event,
  isBusy,
  onSend,
  onVerify,
}: {
  event: Extract<DocupassKycEvent, { kind: 'phoneVerification' }>;
  isBusy: boolean;
  onSend: (number: string | null, type: string) => void;
  onVerify: (number: string | null, code: string) => void;
}): JSX.Element {
  const [dialCode, setDialCode] = useState(event.state.phoneCountryCodes[0]?.dialCode || '+1');
  const [number, setNumber] = useState('');
  const [otp, setOtp] = useState('');
  const presetPhone = event.state.userPhone || null;
  const builtNumber = presetPhone ? null : buildPhoneNumber(dialCode, number);
  const canSend = !isBusy && (!!presetPhone || !!builtNumber);

  return (
    <ScrollPanel>
      <StepLabel>STEP: PHONE VERIFICATION</StepLabel>
      <Text style={styles.muted}>Verify your phone number to continue.</Text>

      {presetPhone ? (
        <Panel>
          <Text style={styles.caption}>Phone number</Text>
          <Text style={styles.titleSmall}>{presetPhone}</Text>
        </Panel>
      ) : (
        <>
          {event.state.phoneCountryCodes.length > 0 ? (
            <View style={styles.optionBlock}>
              <Text style={styles.caption}>Country code</Text>
              <ScrollView style={styles.dialList} nestedScrollEnabled>
                {event.state.phoneCountryCodes.map((item) => (
                  <ChoiceButton
                    key={`${item.code}-${item.dialCode}`}
                    selected={dialCode === item.dialCode}
                    disabled={isBusy}
                    onPress={() => setDialCode(item.dialCode)}
                  >
                    {item.name} {item.dialCode}
                  </ChoiceButton>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <TextInput
            value={number}
            onChangeText={(value) => setNumber(value.replace(/\D/g, ''))}
            editable={!isBusy}
            keyboardType="phone-pad"
            placeholder="Phone number"
            placeholderTextColor={theme.muted}
            style={styles.input}
          />
        </>
      )}

      <View style={styles.row}>
        <ActionButton disabled={!canSend} onPress={() => onSend(builtNumber, 'sms')}>
          SEND SMS
        </ActionButton>
        <ActionButton variant="secondary" disabled={!canSend} onPress={() => onSend(builtNumber, 'call')}>
          CALL
        </ActionButton>
      </View>

      {event.codeSent ? (
        <>
          <TextInput
            value={otp}
            onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))}
            editable={!isBusy}
            keyboardType="number-pad"
            placeholder="6 digit code"
            placeholderTextColor={theme.muted}
            style={styles.input}
          />
          <ActionButton disabled={isBusy || otp.length !== 6} onPress={() => onVerify(event.currentNumber || null, otp)}>
            VERIFY CODE
          </ActionButton>
        </>
      ) : null}
    </ScrollPanel>
  );
}

function CustomFormScreen({
  fields,
  isBusy,
  onSubmit,
}: {
  fields: DocupassCustomField[];
  isBusy: boolean;
  onSubmit: (answers: Record<string, string>) => void;
}): JSX.Element {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const complete =
    fields.length > 0 &&
    fields.every((field) => (answers[fieldKey(field)] || '').trim().length > 0);

  const setAnswer = (field: DocupassCustomField, value: string) => {
    setAnswers((current) => ({ ...current, [fieldKey(field)]: value }));
  };

  return (
    <ScrollPanel>
      <StepLabel>STEP: CUSTOM FORM</StepLabel>
      {fields.map((field, index) => {
        const key = fieldKey(field);
        const options = parseCustomFieldOptions(field.fieldData);
        return (
          <View key={`${key}-${index}`} style={styles.formField}>
            <Text style={styles.fieldLabel}>{field.fieldLabel || key}</Text>
            {field.fieldDescription ? <Text style={styles.caption}>{field.fieldDescription}</Text> : null}
            {field.fieldType === 2 ? (
              options.map((option) => (
                <ChoiceButton
                  key={option.value}
                  selected={answers[key] === option.value}
                  disabled={isBusy}
                  onPress={() => setAnswer(field, option.value)}
                >
                  {option.label}
                </ChoiceButton>
              ))
            ) : (
              <TextInput
                value={answers[key] || ''}
                onChangeText={(value) => setAnswer(field, value)}
                editable={!isBusy}
                multiline={field.fieldType === 1}
                placeholderTextColor={theme.muted}
                style={[styles.input, field.fieldType === 1 && styles.textArea]}
              />
            )}
          </View>
        );
      })}
      <ActionButton disabled={isBusy || !complete} onPress={() => onSubmit(answers)}>
        SAVE FORM
      </ActionButton>
    </ScrollPanel>
  );
}

function CountryPickerScreen({
  filterCodes,
  onSelected,
}: {
  filterCodes?: string[] | null;
  onSelected: (country: KYCCountry) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [countries, setCountries] = useState<KYCCountry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const countryRequestRef = useRef(0);
  const filterKey = (filterCodes || []).join(',');

  const loadCountries = useCallback(async () => {
    const requestId = ++countryRequestRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const loadedCountries = await fetchDocupassCountries(filterCodes);
      if (countryRequestRef.current === requestId) {
        setCountries(loadedCountries);
      }
    } catch (error) {
      if (countryRequestRef.current === requestId) {
        setCountries([]);
        setLoadError(error instanceof Error ? error.message : 'Unable to load countries.');
      }
    } finally {
      if (countryRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [filterKey]);

  useEffect(() => {
    loadCountries();
    return () => {
      countryRequestRef.current += 1;
    };
  }, [loadCountries]);

  const filtered = countries.filter(
    (country) =>
      country.name.toLowerCase().includes(query.toLowerCase()) ||
      country.code.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <ScrollPanel>
      <StepLabel>STEP: SELECT COUNTRY</StepLabel>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search"
        placeholderTextColor={theme.muted}
        style={styles.input}
      />
      {isLoading ? (
        <View style={styles.countryLoading}>
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      ) : loadError ? (
        <View style={styles.countryLoading}>
          <Text style={styles.errorText}>{loadError}</Text>
          <ActionButton variant="secondary" onPress={loadCountries}>
            RETRY
          </ActionButton>
        </View>
      ) : (
        filtered.map((country) => (
          <Pressable key={country.code} onPress={() => onSelected(country)} style={styles.listItem}>
            <Text style={styles.listTitle}>{country.name}</Text>
            <Text style={styles.listMeta}>{country.code}</Text>
          </Pressable>
        ))
      )}
    </ScrollPanel>
  );
}

function DocumentTypePickerScreen({
  country,
  documentTypes,
  isBusy,
  onSelected,
}: {
  country: KYCCountry;
  documentTypes: KYCDocumentType[];
  isBusy: boolean;
  onSelected: (documentType: KYCDocumentType) => void;
}): JSX.Element {
  return (
    <ScrollPanel centered>
      <StepLabel>STEP: SELECT DOCUMENT</StepLabel>
      <Text style={styles.muted}>For {country.name}</Text>
      <View style={styles.documentTypeList}>
        {documentTypes.map((documentType) => (
          <ActionButton
            key={documentType.apiTypeCode}
            variant="secondary"
            disabled={isBusy}
            onPress={() => onSelected(documentType)}
          >
            {documentType.label}
          </ActionButton>
        ))}
      </View>
    </ScrollPanel>
  );
}

function DocumentCaptureScreen({
  event,
  isBusy,
  captureDocumentSide,
  onCaptured,
}: {
  event: Extract<DocupassKycEvent, { kind: 'documentCapture' }>;
  isBusy: boolean;
  captureDocumentSide?: KYCSettings['captureDocumentSide'];
  onCaptured: (frontBase64: string, backBase64: string | null) => void | Promise<void>;
}): JSX.Element {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const busy = isBusy || isUploading;
  const requiresBack = requiresDocumentBackSide(event.documentType, event.documentSide);
  const ready = front.trim().length > 0 && (!requiresBack || back.trim().length > 0);

  const capture = async (side: 'front' | 'back') => {
    if (!captureDocumentSide) return;
    setCaptureError(null);
    try {
      const base64 = await captureDocumentSide(side, {
        country: event.country,
        documentType: event.documentType,
        documentSide: event.documentSide,
      });
      side === 'front' ? setFront(base64) : setBack(base64);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : 'Unable to capture document image.');
    }
  };

  const upload = async () => {
    if (!ready || busy) {
      return;
    }
    setCaptureError(null);
    setIsUploading(true);
    try {
      await waitForNextPaint();
      await Promise.resolve(onCaptured(front.trim(), requiresBack ? back.trim() : null));
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : 'Unable to upload document.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <ScrollPanel>
        <StepLabel>STEP: DOCUMENT UPLOAD</StepLabel>
        <Text style={styles.muted}>
          Front: {front ? 'Done' : 'Pending'} | Back:{' '}
          {!requiresBack ? 'Not required' : back ? 'Done' : 'Pending'}
        </Text>
        <CapturePreview label="Front document" value={front} />
        {captureDocumentSide ? (
          <ActionButton disabled={busy} onPress={() => capture('front')}>
            CAPTURE DOCUMENT FRONT
          </ActionButton>
        ) : (
          <TextInput
            value={front}
            onChangeText={setFront}
            editable={!busy}
            multiline
            placeholder="Raw front JPEG base64"
            placeholderTextColor={theme.muted}
            style={[styles.input, styles.textArea]}
          />
        )}

        {requiresBack ? (
          <>
            <CapturePreview label="Back document" value={back} />
            {captureDocumentSide ? (
              <ActionButton variant="secondary" disabled={busy} onPress={() => capture('back')}>
                CAPTURE DOCUMENT BACK
              </ActionButton>
            ) : (
              <TextInput
                value={back}
                onChangeText={setBack}
                editable={!busy}
                multiline
                placeholder="Raw back JPEG base64"
                placeholderTextColor={theme.muted}
                style={[styles.input, styles.textArea]}
              />
            )}
          </>
        ) : (
          <Text style={styles.caption}>Back side is not required for passport.</Text>
        )}

        {captureError ? <Text style={styles.errorText}>{captureError}</Text> : null}
        <ActionButton disabled={busy || !ready} onPress={upload}>
          UPLOAD DOCUMENT
        </ActionButton>
        {isUploading && !isBusy ? <BusyOverlay /> : null}
    </ScrollPanel>
  );
}
function BiometricScreen({
  actions,
  settings,
  isBusy,
  onComplete,
}: {
  actions: KYCAction[];
  settings: KYCSettings;
  isBusy: boolean;
  onComplete: (faces: string[]) => void;
}): JSX.Element {
  const [manualFaces, setManualFaces] = useState('');
  const [captureError, setCaptureError] = useState<string | null>(null);

  const capture = async () => {
    if (!settings.captureFace || isBusy) return;
    setCaptureError(null);
    try {
      const faces = await settings.captureFace(actions, {
        turnTimeSeconds: settings.turnTimeSeconds,
        maskCircleRadius: settings.maskCircleRadius,
        maskCircleY: settings.maskCircleY,
      });
      onComplete(faces);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : 'Unable to capture face frames.');
    }
  };

  const manualList = manualFaces
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <ScrollPanel centered>
      <View style={styles.faceGuide}>
        <View style={styles.faceCircle} />
      </View>
      <StepLabel>STEP: FACE VERIFICATION</StepLabel>
      {actions.map((action) => (
        <Panel key={action.id}>
          <Text style={styles.actionInstruction}>{action.instruction}</Text>
        </Panel>
      ))}
      {settings.captureFace ? (
        <ActionButton disabled={isBusy} onPress={capture}>
          OPEN FACE CAMERA
        </ActionButton>
      ) : (
        <>
          <Text style={styles.caption}>
            Provide raw JPEG base64 face frames separated by line breaks or commas.
          </Text>
          <TextInput
            value={manualFaces}
            onChangeText={setManualFaces}
            editable={!isBusy}
            multiline
            placeholder="Face frame base64"
            placeholderTextColor={theme.muted}
            style={[styles.input, styles.textArea]}
          />
          <ActionButton disabled={isBusy || manualList.length === 0} onPress={() => onComplete(manualList)}>
            UPLOAD FACE
          </ActionButton>
        </>
      )}
      {captureError ? <Text style={styles.errorText}>{captureError}</Text> : null}
    </ScrollPanel>
  );
}

function ContractScreen({
  event,
  isBusy,
  collectContractSignature,
  renderContractHtml,
  onSubmit,
}: {
  event: Extract<DocupassKycEvent, { kind: 'contract' }>;
  isBusy: boolean;
  collectContractSignature?: KYCSettings['collectContractSignature'];
  renderContractHtml?: (html: string) => ReactNode;
  onSubmit: (signatures: Record<string, string>) => void;
}): JSX.Element {
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const complete = event.signatureFields.every((field) => !!signatures[field.uid]);
  const contractHtml = useMemo(
    () => injectContractSignatures(event.html, signatures),
    [event.html, signatures],
  );

  const collect = async (field: (typeof event.signatureFields)[number]) => {
    if (!collectContractSignature) return;
    setSignatureError(null);
    try {
      const dataUrl = await collectContractSignature(field, event.signatureFields);
      setSignatures((current) => ({ ...current, [field.uid]: dataUrl }));
    } catch (error) {
      setSignatureError(error instanceof Error ? error.message : 'Unable to collect signature.');
    }
  };

  return (
    <ScrollPanel>
      <StepLabel>STEP: REVIEW CONTRACT</StepLabel>
      <View style={styles.contractBox}>
        {renderContractHtml ? (
          renderContractHtml(contractHtml)
        ) : (
          <Text style={styles.contractText}>{stripHtml(contractHtml) || event.state.companyName || 'Contract'}</Text>
        )}
      </View>
      {event.signatureFields.length > 0 ? (
        <>
          <Text style={styles.caption}>{event.signatureFields.length} signature field(s) required</Text>
          {event.signatureFields.map((field) => (
            <View key={field.uid} style={styles.formField}>
              <Text style={styles.fieldLabel}>{field.label}</Text>
              {collectContractSignature ? (
                <ActionButton variant="secondary" disabled={isBusy} onPress={() => collect(field)}>
                  {signatures[field.uid] ? 'REPLACE SIGNATURE' : 'COLLECT SIGNATURE'}
                </ActionButton>
              ) : null}
              {signatures[field.uid] ? <Text style={styles.signatureStatus}>SIGNATURE ADDED</Text> : null}
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.caption}>No signature image is required for this contract.</Text>
      )}
      {signatureError ? <Text style={styles.errorText}>{signatureError}</Text> : null}
      <ActionButton disabled={isBusy || (event.signatureFields.length > 0 && !complete)} onPress={() => onSubmit(signatures)}>
        ACCEPT AND SUBMIT
      </ActionButton>
    </ScrollPanel>
  );
}

function PartyPendingScreen({
  isBusy,
  onRefresh,
}: {
  isBusy: boolean;
  onRefresh: () => void;
}): JSX.Element {
  return (
    <Centered>
      <Text style={styles.resultIcon}>...</Text>
      <Text style={styles.resultTitle}>VERIFICATION PENDING</Text>
      <Text style={styles.resultBody}>
        Another party or a manual review must finish before this session can continue.
      </Text>
      <ActionButton disabled={isBusy} onPress={onRefresh}>
        REFRESH
      </ActionButton>
    </Centered>
  );
}

function ResultScreen({
  success,
  error,
  onFinish,
}: {
  success: boolean;
  result: KYCResult;
  error?: KYCResult['terminalError'];
  onFinish: () => void;
}): JSX.Element {
  return (
    <Centered>
      <Text style={[styles.resultIcon, success ? styles.success : styles.failure]}>
        {success ? '✓' : 'X'}
      </Text>
      <Text style={styles.resultTitle}>
        {success ? 'VERIFICATION COMPLETE' : 'VERIFICATION FAILED'}
      </Text>
      {error ? <Text style={styles.resultBody}>{displayNormalizedError(error)}</Text> : null}
      <ActionButton variant={success ? 'primary' : 'secondary'} onPress={onFinish}>
        FINISH
      </ActionButton>
    </Centered>
  );
}

function BackButton({
  disabled,
  onPress,
}: {
  disabled: boolean;
  onPress: () => void;
}): JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      disabled={disabled}
      onPress={onPress}
      style={[styles.backButton, disabled && styles.disabled]}
    >
      <Text style={styles.backText}>{'<'}</Text>
    </Pressable>
  );
}

function BusyOverlay(): JSX.Element {
  return (
    <Modal
      animationType="none"
      hardwareAccelerated
      statusBarTranslucent
      transparent
      visible
    >
      <View pointerEvents="auto" style={styles.busyOverlay}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    </Modal>
  );
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function waitForMinimumDuration(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function ErrorOverlay({
  error,
  onDismiss,
}: {
  error: NonNullable<DocupassKycUiState['error']>;
  onDismiss: () => void;
}): JSX.Element {
  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={onDismiss}
      statusBarTranslucent
      transparent
      visible
    >
      <View style={styles.modalOverlay}>
        <View accessibilityRole="alert" style={styles.errorCard}>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.errorContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.errorTitle}>
              {error.normalized?.title || 'Verification error'}
            </Text>
            <Text style={styles.errorBody}>{error.message}</Text>
            {error.normalized?.suggestion ? (
              <Text style={styles.errorSuggestion}>{error.normalized.suggestion}</Text>
            ) : null}
          </ScrollView>
          <ActionButton variant="secondary" onPress={onDismiss}>
            DISMISS
          </ActionButton>
        </View>
      </View>
    </Modal>
  );
}

function ScrollPanel({
  children,
  centered,
}: {
  children: ReactNode;
  centered?: boolean;
}): JSX.Element {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.scrollContent, centered && styles.scrollCentered]}
    >
      {children}
    </ScrollView>
  );
}

function Centered({ children }: { children: ReactNode }): JSX.Element {
  return <View style={styles.centered}>{children}</View>;
}

function Panel({ children }: { children: ReactNode }): JSX.Element {
  return <View style={styles.panel}>{children}</View>;
}

function StepLabel({ children }: { children: ReactNode }): JSX.Element {
  return <Text style={styles.stepLabel}>{children}</Text>;
}

function ActionButton({
  children,
  onPress,
  disabled,
  variant = 'primary',
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}): JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        variant === 'secondary' ? styles.secondaryButton : styles.primaryButton,
        disabled && styles.disabled,
      ]}
    >
      <Text style={variant === 'secondary' ? styles.secondaryButtonText : styles.primaryButtonText}>
        {children}
      </Text>
    </Pressable>
  );
}

function ChoiceButton({
  children,
  selected,
  disabled,
  onPress,
}: {
  children: ReactNode;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}): JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected, disabled && styles.disabled]}
    >
      <Text style={selected ? styles.choiceSelectedText : styles.choiceText}>{children}</Text>
    </Pressable>
  );
}

function CapturePreview({ label, value }: { label: string; value: string }): JSX.Element {
  const source = value ? { uri: `data:image/jpeg;base64,${value}` } : null;

  return (
    <View style={styles.capturePreview}>
      {source ? (
        <Image source={source} resizeMode="contain" style={styles.captureImage} />
      ) : (
        <Text style={styles.caption}>No photo yet</Text>
      )}
      <View style={styles.captureLabel}>
        <Text style={styles.captureTitle}>{label}</Text>
      </View>
    </View>
  );
}

function resolveSettings(props: KYCScreenProps): KYCSettings {
  if (props.settings) {
    return {
      ...props.settings,
      onFinish: props.onFinish || props.settings.onFinish || (() => {}),
      onBackAtFirstStep:
        props.onBackAtFirstStep || props.settings.onBackAtFirstStep || (() => {}),
    };
  }

  const apiConfig =
    props.apiConfig ||
    docupassConfigFromReference(
      props.reference || '',
      props.partyId,
      props.geolocation,
      props.enabled ?? true,
    );

  return {
    apiConfig,
    maskCircleRadius: props.maskCircleRadius ?? 0.42,
    maskCircleY: props.maskCircleY ?? 0.45,
    turnTimeSeconds: props.turnTimeSeconds ?? 2,
    onFinish: props.onFinish || (() => {}),
    onBackAtFirstStep: props.onBackAtFirstStep || (() => {}),
    captureDocumentSide: props.captureDocumentSide,
    captureFace: props.captureFace,
    collectContractSignature: props.collectContractSignature,
  };
}

function buildPhoneNumber(dialCode: string, number: string): string | null {
  const digits = number.trim().replace(/^0+/, '');
  return digits ? `${dialCode}${digits}` : null;
}

function fieldKey(field: DocupassCustomField): string {
  return field.fieldId || field.fieldLabel;
}

const theme = {
  background: '#050A08',
  panel: 'rgba(255,255,255,0.08)',
  panelStrong: 'rgba(255,255,255,0.14)',
  border: 'rgba(255,255,255,0.2)',
  accent: '#00FFAB',
  accentText: '#00261A',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.62)',
  danger: '#FFA3A3',
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 92,
    paddingBottom: 32,
    gap: 14,
  },
  scrollCentered: {
    justifyContent: 'center',
  },
  countryLoading: {
    flex: 1,
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    marginTop: 14,
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
  },
  stepLabel: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  muted: {
    color: theme.muted,
    lineHeight: 21,
  },
  caption: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  titleSmall: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '800',
  },
  panel: {
    width: '100%',
    padding: 16,
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
  },
  optionBlock: {
    gap: 8,
  },
  dialList: {
    maxHeight: 156,
  },
  input: {
    width: '100%',
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: 'rgba(255,255,255,0.07)',
    color: theme.text,
    fontSize: 16,
  },
  textArea: {
    minHeight: 116,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  documentTypeList: {
    width: '100%',
    gap: 8,
  },
  button: {
    width: '100%',
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  primaryButton: {
    backgroundColor: theme.accent,
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  primaryButtonText: {
    color: theme.accentText,
    fontWeight: '900',
    textAlign: 'center',
  },
  secondaryButtonText: {
    color: theme.text,
    fontWeight: '800',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  choice: {
    width: '100%',
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 14,
    marginTop: 7,
    borderRadius: 6,
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  choiceSelected: {
    backgroundColor: theme.accent,
  },
  choiceText: {
    color: theme.text,
    fontWeight: '700',
  },
  choiceSelectedText: {
    color: theme.accentText,
    fontWeight: '900',
  },
  formField: {
    gap: 8,
    marginBottom: 8,
  },
  fieldLabel: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '800',
  },
  listItem: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: theme.panel,
  },
  listTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
  },
  listMeta: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  capturePreview: {
    height: 136,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.panel,
  },
  captureImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  captureLabel: {
    position: 'absolute',
    left: 10,
    top: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  captureTitle: {
    color: theme.text,
    fontWeight: '800',
    fontSize: 12,
  },
  faceGuide: {
    width: 220,
    height: 220,
    borderRadius: 110,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 3,
    borderColor: 'rgba(0,255,171,0.55)',
  },
  faceCircle: {
    width: 138,
    height: 138,
    borderRadius: 69,
    borderWidth: 2,
    borderColor: theme.accent,
  },
  actionInstruction: {
    color: theme.text,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '900',
  },
  contractBox: {
    minHeight: 180,
    padding: 14,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  contractText: {
    color: '#111111',
    lineHeight: 21,
  },
  signatureStatus: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  errorText: {
    color: theme.danger,
  },
  resultIcon: {
    fontSize: 58,
    fontWeight: '900',
    color: theme.accent,
    marginBottom: 12,
  },
  success: {
    color: theme.accent,
  },
  failure: {
    color: theme.danger,
  },
  resultTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  resultBody: {
    color: theme.muted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 18,
  },
  backButton: {
    position: 'absolute',
    top: 48,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.58)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  backText: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '900',
  },
  busyOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  errorCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '80%',
    gap: 12,
    padding: 20,
    borderRadius: 8,
    backgroundColor: '#121815',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  errorContent: {
    gap: 12,
  },
  errorTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '900',
  },
  errorBody: {
    color: theme.muted,
    lineHeight: 20,
  },
  errorSuggestion: {
    color: theme.text,
    lineHeight: 20,
  },
});
