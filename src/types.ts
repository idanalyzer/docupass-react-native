export const DocupassKycEventKind = {
  LOADING: 'loading',
  PHONE_VERIFICATION: 'phoneVerification',
  CUSTOM_FORM: 'customForm',
  DOCUMENT_COUNTRY_SELECTION: 'documentCountrySelection',
  DOCUMENT_SELECTION: 'documentSelection',
  DOCUMENT_CAPTURE: 'documentCapture',
  FACE_VERIFICATION: 'faceVerification',
  CONTRACT: 'contract',
  PARTY_PENDING: 'partyPending',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type DocupassKycEventKind =
  (typeof DocupassKycEventKind)[keyof typeof DocupassKycEventKind];

export const DOCUPASS_API_ENDPOINT_US = 'https://api2.idanalyzer.com/docupassappv3';
export const DOCUPASS_API_ENDPOINT_EU = 'https://api2-eu.idanalyzer.com/docupassappv3';

export interface DocupassApiConfig {
  enabled?: boolean;
  baseUrl?: string | null;
  baseURL?: string | null;
  reference?: string | null;
  partyId?: string | null;
  sessionId?: string | null;
  authorization?: string | null;
  geolocation?: string | null;
  disableSslValidation?: boolean;
  disableSSLValidation?: boolean;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
  timeout?: number;
}

export interface DocupassCustomField {
  fieldId: string;
  fieldLabel: string;
  fieldDescription: string;
  fieldType: number;
  fieldData: string;
}

export interface DocupassPhoneCountryCode {
  name: string;
  dialCode: string;
  code: string;
}

export interface DocupassSessionState {
  success: boolean;
  sessionId?: string | null;
  task?: string | null;
  reference?: string | null;
  acceptedDocumentCountry?: string | null;
  acceptedDocumentType?: string | null;
  selectedDocumentCountry?: string | null;
  selectedDocumentType?: string | null;
  allowFileUpload: boolean;
  documentSide: number;
  gps: boolean;
  reviewData: boolean;
  logoUrl?: string | null;
  logoURL?: string | null;
  companyName?: string | null;
  welcomeMessage?: string | null;
  language?: string | null;
  userPhone?: string | null;
  hasFaceFile: boolean;
  hasDocumentFile: boolean;
  verifyDocumentNo?: string | null;
  verifyName?: string | null;
  verifyDob?: string | null;
  verifyAge?: string | null;
  verifyAddress?: string | null;
  verifyPostcode?: string | null;
  preloadFaceLib: boolean;
  contractSource?: string | null;
  customFields: DocupassCustomField[];
  phoneCountryCodes: DocupassPhoneCountryCode[];
  rawJson: string;
  rawJSON: string;
}

export interface DocupassApiError {
  message: string;
  code?: string | null;
  httpStatus?: number | null;
  rawBody?: string | null;
}

export type DocupassApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DocupassApiError };

export const DocupassErrorAction = {
  SHOW_COMPLETED: 'showCompleted',
  SHOW_FAILED: 'showFailed',
  RESYNC_SESSION: 'resyncSession',
  REQUEST_LOCATION: 'requestLocation',
  RETRY: 'retry',
  RETAKE_DOCUMENT: 'retakeDocument',
  RETAKE_FACE: 'retakeFace',
  EDIT_INPUT: 'editInput',
  FIX_SIGNATURE: 'fixSignature',
  FATAL: 'fatal',
  CONTACT_SUPPORT: 'contactSupport',
} as const;

export type DocupassErrorAction =
  (typeof DocupassErrorAction)[keyof typeof DocupassErrorAction];

export interface DocupassNormalizedError {
  code?: string | null;
  subCode?: string | null;
  title: string;
  detail: string;
  suggestion: string;
  action: DocupassErrorAction;
  warningCodes: string[];
  httpStatus?: number | null;
  rawMessage?: string | null;
  rawBody?: string | null;
}

export type KYCDocumentTypeCode = 'P' | 'D' | 'I';

export interface KYCDocumentType {
  key: 'passport' | 'driverLicense' | 'identityCard';
  label: string;
  apiTypeCode: KYCDocumentTypeCode;
  requiresBackSide: boolean;
}

export interface KYCCountry {
  code: string;
  name: string;
  flag: string;
}

export type KYCActionValue = 'front' | 'turnLeft' | 'turnRight' | 'turnUp' | 'mouthOpen';

export interface KYCAction {
  id: KYCActionValue;
  instruction: string;
}

export interface DocupassContractSignatureField {
  uid: string;
  label: string;
  party?: string | null;
}

export interface KYCResult {
  country?: KYCCountry | null;
  documentType?: KYCDocumentType | null;
  documentFrontBase64?: string | null;
  documentBackBase64?: string | null;
  faceBase64List: string[];
  isFaceVerified: boolean;
  serverTask?: string | null;
  sessionId?: string | null;
  sessionState?: DocupassSessionState | null;
  terminalError?: DocupassNormalizedError | null;
}

export type KYCStep =
  | { kind: 'phoneVerification'; state: DocupassSessionState }
  | { kind: 'customForm'; fields: DocupassCustomField[] }
  | { kind: 'selectCountry'; filterCodes?: string[] | null }
  | { kind: 'selectDocument' }
  | { kind: 'captureDocument' }
  | { kind: 'faceVerification'; actions: KYCAction[] }
  | { kind: 'contract'; state: DocupassSessionState }
  | { kind: 'partyPending' }
  | { kind: 'success' }
  | { kind: 'failed'; error?: DocupassNormalizedError | null };

export type DocupassKycEvent =
  | { kind: 'loading' }
  | {
      kind: 'phoneVerification';
      state: DocupassSessionState;
      codeSent: boolean;
      currentNumber?: string | null;
    }
  | { kind: 'customForm'; fields: DocupassCustomField[] }
  | {
      kind: 'documentCountrySelection';
      countries: KYCCountry[];
      filterCodes?: string[] | null;
      selectedCountry?: KYCCountry | null;
    }
  | {
      kind: 'documentSelection';
      country: KYCCountry;
      documentTypes: KYCDocumentType[];
      selectedDocumentType?: KYCDocumentType | null;
    }
  | {
      kind: 'documentCapture';
      country?: KYCCountry | null;
      documentType?: KYCDocumentType | null;
      documentSide?: number | null;
      allowFileUpload: boolean;
    }
  | { kind: 'faceVerification'; actions: KYCAction[] }
  | {
      kind: 'contract';
      state: DocupassSessionState;
      html: string;
      signatureFields: DocupassContractSignatureField[];
    }
  | { kind: 'partyPending' }
  | { kind: 'completed'; result: KYCResult }
  | { kind: 'failed'; result: KYCResult; error?: DocupassNormalizedError | null };

export interface DocupassKycErrorEvent {
  message: string;
  normalized?: DocupassNormalizedError | null;
}

export interface DocupassKycUiState {
  event: DocupassKycEvent;
  result: KYCResult;
  isBusy: boolean;
  canGoBack: boolean;
  error?: DocupassKycErrorEvent | null;
  errorMessage?: string | null;
  normalizedError?: DocupassNormalizedError | null;
}

export interface DocupassSubscription {
  close(): void;
}

export type DocupassKycListener = (state: DocupassKycUiState) => void;

export type PhoneVerificationType = 'sms' | 'call' | string;

export interface KYCSettings {
  apiConfig: DocupassApiConfig;
  maskCircleRadius: number;
  maskCircleY: number;
  turnTimeSeconds: number;
  onFinish: (result: KYCResult) => void;
  onBackAtFirstStep: () => void;
  captureDocumentSide?: (
    side: 'front' | 'back',
    context: {
      documentType?: KYCDocumentType | null;
      documentSide?: number | null;
      country?: KYCCountry | null;
    },
  ) => Promise<string> | string;
  captureFace?: (
    actions: KYCAction[],
    context: { turnTimeSeconds: number; maskCircleRadius: number; maskCircleY: number },
  ) => Promise<string[]> | string[];
  collectContractSignature?: (
    field: DocupassContractSignatureField,
    fields: DocupassContractSignatureField[],
  ) => Promise<string> | string;
}
