import {
  DOCUPASS_API_ENDPOINT_US,
  DocupassApiConfig,
  DocupassApiError,
  DocupassApiResult,
  DocupassCustomField,
  DocupassPhoneCountryCode,
  DocupassSessionState,
} from './types';
import { parseDocupassReference, resolveDocupassEndpoint } from './helpers';

declare const fetch: (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{ status: number; text(): Promise<string> }>;

export class DocupassApiClient {
  private runtimeSessionId?: string | null;

  constructor(private readonly config: DocupassApiConfig) {
    this.runtimeSessionId = config.sessionId || null;
  }

  getAction(): Promise<DocupassApiResult<DocupassSessionState>> {
    return this.requestSession('GET', 'get_action');
  }

  saveDocumentSelection(
    countryCode: string,
    documentType: string,
  ): Promise<DocupassApiResult<DocupassSessionState>> {
    return this.requestSession('POST', 'save_document_selection', {
      country: countryCode,
      type: documentType,
    });
  }

  uploadDocument(
    frontDocumentBase64: string,
    backDocumentBase64?: string | null,
  ): Promise<DocupassApiResult<DocupassSessionState>> {
    if (!frontDocumentBase64.trim()) {
      return Promise.resolve({
        ok: false,
        error: { message: 'Front document image is required.', code: 'LOCAL_VALIDATION' },
      });
    }

    const body: Record<string, unknown> = { document: frontDocumentBase64 };
    if (backDocumentBase64?.trim()) {
      body.documentBack = backDocumentBase64;
    }
    return this.requestSession('POST', 'upload_document', body);
  }

  uploadFace(faceBase64List: string[]): Promise<DocupassApiResult<DocupassSessionState>> {
    const faces = faceBase64List.map((face) => face.trim()).filter(Boolean);
    if (faces.length === 0) {
      return Promise.resolve({
        ok: false,
        error: { message: 'At least one face image is required.', code: 'LOCAL_VALIDATION' },
      });
    }
    return this.requestSession('POST', 'upload_face', { face: faces.join(',') });
  }

  createPhoneVerification(
    number: string | null | undefined,
    type: string,
  ): Promise<DocupassApiResult<void>> {
    return this.requestUnit('POST', 'create_phone_verification', {
      type,
      number: clean(number) || null,
    });
  }

  checkPhoneVerification(
    number: string | null | undefined,
    code: string,
  ): Promise<DocupassApiResult<DocupassSessionState>> {
    return this.requestSession('POST', 'check_phone_verification', {
      number: clean(number) || null,
      code: code.trim(),
    });
  }

  saveForm(answers: Record<string, string>): Promise<DocupassApiResult<DocupassSessionState>> {
    return this.requestSession('POST', 'save_form', answers);
  }

  submitContract(
    signatures: Record<string, string>,
  ): Promise<DocupassApiResult<DocupassSessionState>> {
    return this.requestSession('POST', 'submit_contract', signatures);
  }

  logAuditData(action: string, data: string[]): Promise<DocupassApiResult<void>> {
    return this.requestUnit('POST', 'audit', { action, data });
  }

  close(): void {
    // fetch on React Native has no persistent client handle to close.
  }

  resolveAuthorizationHeader(): string | null {
    const explicit = clean(this.config.authorization);
    if (explicit) return explicit;

    const sessionId = clean(this.runtimeSessionId);
    if (sessionId) return `DOCUPASS_SESSION ${sessionId}`;

    const configuredReference = clean(this.config.reference);
    if (!configuredReference) return null;

    const parsed = parseDocupassReference(configuredReference, this.config.partyId);
    return parsed.partyId
      ? `DOCUPASS ${parsed.reference} ${parsed.partyId}`
      : `DOCUPASS ${parsed.reference}`;
  }

  private async requestSession(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<DocupassApiResult<DocupassSessionState>> {
    const result = await this.requestJson(method, path, body);
    if (!result.ok) return result;

    const state = parseSession(result.data.json, result.data.raw);
    if (state.sessionId) {
      this.runtimeSessionId = state.sessionId;
    }
    return { ok: true, data: state };
  }

  private async requestUnit(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<DocupassApiResult<void>> {
    const result = await this.requestJson(method, path, body);
    return result.ok ? { ok: true, data: undefined } : result;
  }

  private async requestJson(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<DocupassApiResult<{ json: Record<string, unknown>; raw: string }>> {
    const endpoint = this.buildUrl(path);
    const headers = this.buildHeaders();
    const bodyText = method === 'POST' ? JSON.stringify(body || {}) : undefined;

    try {
      const response = await withTimeout(
        fetch(endpoint, { method, headers, body: bodyText }),
        this.timeoutMs(),
      );
      const raw = await response.text();
      const json = parseJsonObject(raw);

      if (response.status < 200 || response.status > 299 || hasApiError(json)) {
        const error = toApiError(
          json,
          response.status < 200 || response.status > 299
            ? `HTTP ${response.status}`
            : 'Docupass API returned error',
          response.status,
          raw,
        );
        return { ok: false, error };
      }

      return { ok: true, data: { json, raw } };
    } catch (caught) {
      const error: DocupassApiError = {
        message: caught instanceof Error ? caught.message : 'Network error',
        code: 'NETWORK_ERROR',
      };
      return { ok: false, error };
    }
  }

  private buildUrl(path: string): string {
    const base = this.resolveBaseUrl().trim().replace(/\/+$/g, '');
    const endpoint = path.trim().replace(/^\/+/g, '');
    return `${base}/${endpoint}`;
  }

  private resolveBaseUrl(): string {
    return (
      clean(this.config.baseUrl) ||
      clean(this.config.baseURL) ||
      (clean(this.config.reference) ? resolveDocupassEndpoint(this.config.reference) : DOCUPASS_API_ENDPOINT_US)
    );
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const authorization = this.resolveAuthorizationHeader();
    if (authorization) {
      headers.Authorization = authorization;
    }

    const geolocation = clean(this.config.geolocation);
    if (geolocation) {
      headers.Geolocation = geolocation;
    }

    return headers;
  }

  private timeoutMs(): number {
    if (typeof this.config.readTimeoutMs === 'number') return this.config.readTimeoutMs;
    if (typeof this.config.connectTimeoutMs === 'number') return this.config.connectTimeoutMs;
    if (typeof this.config.timeout === 'number') return this.config.timeout * 1000;
    return 20_000;
  }
}

export function parseSession(
  json: Record<string, unknown>,
  raw = JSON.stringify(json),
): DocupassSessionState {
  const customFields = arrayObjects(json.customField).map(
    (field): DocupassCustomField => ({
      fieldId: stringValue(field.fieldId) || '',
      fieldLabel: stringValue(field.fieldLabel) || '',
      fieldDescription: stringValue(field.fieldDescription) || '',
      fieldType: intValue(field.fieldType),
      fieldData: stringValue(field.fieldData) || '',
    }),
  );

  const phoneCountryCodes = arrayObjects(json.phoneCountryCode)
    .map((item): DocupassPhoneCountryCode | null => {
      const dialCode = stringValue(item.dial_code) || '';
      if (!dialCode) return null;
      return {
        name: stringValue(item.name) || '',
        dialCode,
        code: stringValue(item.code) || '',
      };
    })
    .filter((item): item is DocupassPhoneCountryCode => !!item);

  const logoUrl = stringValue(json.logoURL);
  return {
    success: boolValue(json.success),
    sessionId: stringValue(json.sessionId),
    task: stringValue(json.task),
    reference: stringValue(json.reference),
    acceptedDocumentCountry: stringValue(json.acceptedDocumentCountry),
    acceptedDocumentType: stringValue(json.acceptedDocumentType),
    selectedDocumentCountry: stringValue(json.selectedDocumentCountry),
    selectedDocumentType: stringValue(json.selectedDocumentType),
    allowFileUpload: boolValue(json.allowFileUpload),
    documentSide: intValue(json.documentSide),
    gps: boolValue(json.gps),
    reviewData: boolValue(json.reviewData),
    logoUrl,
    logoURL: logoUrl,
    companyName: stringValue(json.companyName),
    welcomeMessage: stringValue(json.welcomeMessage),
    language: stringValue(json.language),
    userPhone: stringValue(json.userPhone),
    hasFaceFile: boolValue(json.hasFaceFile),
    hasDocumentFile: boolValue(json.hasDocumentFile),
    verifyDocumentNo: stringValue(json.verifyDocumentNo),
    verifyName: stringValue(json.verifyName),
    verifyDob: stringValue(json.verifyDob),
    verifyAge: stringValue(json.verifyAge),
    verifyAddress: stringValue(json.verifyAddress),
    verifyPostcode: stringValue(json.verifyPostcode),
    preloadFaceLib: boolValue(json.preloadFaceLib),
    contractSource: stringValue(json.contractSource),
    customFields,
    phoneCountryCodes,
    rawJson: raw,
    rawJSON: raw,
  };
}

function parseJsonObject(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { raw };
  } catch {
    return { raw };
  }
}

function hasApiError(json: Record<string, unknown>): boolean {
  return isPlainObject(json.error) || boolValue(json.success, true) === false;
}

function toApiError(
  json: Record<string, unknown>,
  fallbackMessage: string,
  httpStatus: number,
  rawBody: string,
): DocupassApiError {
  const errorObject = isPlainObject(json.error) ? json.error : json;
  return {
    message:
      stringValue(errorObject.message) || stringValue(json.message) || fallbackMessage,
    code: stringValue(errorObject.code),
    httpStatus,
    rawBody,
  };
}

function clean(value?: string | null): string | null {
  const result = value?.trim();
  return result ? result : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function boolValue(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
  return fallback;
}

function intValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function arrayObjects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error('DocuPass request timed out.')), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}
