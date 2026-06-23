export type DocuPassKycEventName =
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

export type DocuPassKycAction =
  | 'turnLeft'
  | 'turnRight'
  | 'turnUp'
  | 'mouthOpen';

export interface DocuPassConfig {
  reference: string;
  partyId?: string;
  baseUrl?: string;
  sessionId?: string;
  authorization?: string;
  geolocation?: string;
  enabled?: boolean;
  disableSSLValidation?: boolean;
  disableSslValidation?: boolean;
  timeout?: number;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
}

export interface DocuPassNormalizedError {
  code?: string;
  subCode?: string;
  title: string;
  detail: string;
  suggestion: string;
  action: string;
  warningCodes: string[];
  httpStatus?: number;
  rawMessage?: string;
  rawBody?: string;
  displayMessage?: string;
}

export interface DocuPassCountry {
  code: string;
  name: string;
  flag?: string;
}

export interface DocuPassDocumentType {
  code: string;
  apiTypeCode: string;
  label: string;
  requiresBackSide: boolean;
}

export interface DocuPassPhoneCountryCode {
  name: string;
  dialCode: string;
  code: string;
}

export interface DocuPassCustomField {
  fieldId: string;
  fieldLabel: string;
  fieldDescription: string;
  fieldType: number;
  fieldData: string;
}

export interface DocuPassSessionState {
  success: boolean;
  sessionId?: string;
  task?: string;
  reference?: string;
  acceptedDocumentCountry?: string;
  acceptedDocumentType?: string;
  selectedDocumentCountry?: string;
  selectedDocumentType?: string;
  allowFileUpload: boolean;
  documentSide: number;
  gps: boolean;
  reviewData: boolean;
  logoUrl?: string;
  companyName?: string;
  welcomeMessage?: string;
  language?: string;
  userPhone?: string;
  hasFaceFile: boolean;
  hasDocumentFile: boolean;
  verifyDocumentNo?: string;
  verifyName?: string;
  verifyDob?: string;
  verifyAge?: string;
  verifyAddress?: string;
  verifyPostcode?: string;
  preloadFaceLib: boolean;
  contractSource?: string;
  customFields: DocuPassCustomField[];
  phoneCountryCodes: DocuPassPhoneCountryCode[];
  rawJson?: string;
}

export interface DocuPassContractSignatureField {
  uid: string;
  label: string;
  party?: string;
}

export interface DocuPassResult {
  country?: DocuPassCountry;
  documentType?: DocuPassDocumentType;
  documentFrontBase64?: string;
  documentBackBase64?: string;
  faceBase64List: string[];
  isFaceVerified: boolean;
  serverTask?: string;
  sessionId?: string;
  sessionState?: DocuPassSessionState;
  terminalError?: DocuPassNormalizedError;
}

export interface DocuPassPhoneVerificationPayload {
  state: DocuPassSessionState;
  codeSent: boolean;
  currentNumber?: string;
}

export interface DocuPassCustomFormPayload {
  fields: DocuPassCustomField[];
}

export interface DocuPassDocumentCountrySelectionPayload {
  countries: DocuPassCountry[];
  selectedCountry?: DocuPassCountry;
}

export interface DocuPassDocumentSelectionPayload {
  country: DocuPassCountry;
  documentTypes: DocuPassDocumentType[];
  selectedDocumentType?: DocuPassDocumentType;
}

export interface DocuPassDocumentCapturePayload {
  country?: DocuPassCountry;
  documentType?: DocuPassDocumentType;
  documentSide?: number;
  allowFileUpload: boolean;
}

export interface DocuPassFaceVerificationPayload {
  actions: DocuPassKycAction[];
}

export interface DocuPassContractPayload {
  state: DocuPassSessionState;
  html: string;
  signatureFields: DocuPassContractSignatureField[];
}

export interface DocuPassCompletedPayload {
  result: DocuPassResult;
}

export interface DocuPassFailedPayload {
  result: DocuPassResult;
  error?: DocuPassNormalizedError;
}

export interface DocuPassKycState {
  event: DocuPassKycEventName;
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
}

export interface DocuPassKycStateChangedEvent {
  sessionId: string;
  state: DocuPassKycState;
}

export type DocuPassKycStateListener = (state: DocuPassKycState) => void;

export interface DocuPassKycSession {
  readonly id: string;
  getState(): DocuPassKycState | undefined;
  subscribe(listener: DocuPassKycStateListener): () => void;
  start(): Promise<void>;
  refresh(): Promise<void>;
  back(): Promise<void>;
  clearError(): Promise<void>;
  restart(): Promise<void>;
  sendPhoneCode(number: string | undefined, type: 'sms' | 'call' | string): Promise<void>;
  verifyPhoneCode(number: string | undefined, code: string): Promise<void>;
  saveCustomForm(answers: Record<string, string>): Promise<void>;
  selectDocumentCountry(countryCode: string): Promise<void>;
  selectDocumentType(documentTypeCode: string): Promise<void>;
  uploadDocument(frontBase64: string, backBase64?: string): Promise<void>;
  uploadFace(faceBase64List: string[]): Promise<void>;
  submitContract(signatures: Record<string, string>): Promise<void>;
  close(): Promise<void>;
}

export interface UseDocuPassKycOptions {
  autoStart?: boolean;
  onStateChange?: DocuPassKycStateListener;
}

export interface UseDocuPassKycResult {
  session?: DocuPassKycSession;
  state?: DocuPassKycState;
  isReady: boolean;
  error?: Error;
  start(): Promise<void>;
  refresh(): Promise<void>;
  back(): Promise<void>;
  clearError(): Promise<void>;
  restart(): Promise<void>;
  sendPhoneCode(number: string | undefined, type: 'sms' | 'call' | string): Promise<void>;
  verifyPhoneCode(number: string | undefined, code: string): Promise<void>;
  saveCustomForm(answers: Record<string, string>): Promise<void>;
  selectDocumentCountry(countryCode: string): Promise<void>;
  selectDocumentType(documentTypeCode: string): Promise<void>;
  uploadDocument(frontBase64: string, backBase64?: string): Promise<void>;
  uploadFace(faceBase64List: string[]): Promise<void>;
  submitContract(signatures: Record<string, string>): Promise<void>;
}

export interface KYCScreenFinishEvent {
  status: 'completed' | 'failed';
  state: DocuPassKycState;
  result: DocuPassResult;
}
