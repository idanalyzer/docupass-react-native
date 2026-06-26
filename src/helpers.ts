import {
  DOCUPASS_API_ENDPOINT_EU,
  DOCUPASS_API_ENDPOINT_US,
  DocupassApiConfig,
  DocupassContractSignatureField,
  DocupassKycEvent,
  DocupassNormalizedError,
  KYCAction,
  KYCResult,
  KYCSettings,
  KYCStep,
  KYCCountry,
  KYCDocumentType,
} from './types';

export const DOCUMENT_TYPES: KYCDocumentType[] = [
  { key: 'passport', label: 'Passport', apiTypeCode: 'P', requiresBackSide: false },
  { key: 'driverLicense', label: 'Driver License', apiTypeCode: 'D', requiresBackSide: true },
  { key: 'identityCard', label: 'Identity Card', apiTypeCode: 'I', requiresBackSide: true },
];

export const KYC_ACTIONS: KYCAction[] = [
  { id: 'turnLeft', instruction: 'TURN HEAD LEFT' },
  { id: 'turnRight', instruction: 'TURN HEAD RIGHT' },
  { id: 'turnUp', instruction: 'TURN HEAD UP' },
  { id: 'mouthOpen', instruction: 'OPEN MOUTH O-SHAPE' },
];

export const KYC_FRONT_ACTION: KYCAction = { id: 'front', instruction: 'LOOK STRAIGHT AT CAMERA' };

export const ALL_COUNTRIES: KYCCountry[] = [
  { code: 'TW', name: 'Taiwan', flag: '' },
  { code: 'US', name: 'United States', flag: '' },
  { code: 'JP', name: 'Japan', flag: '' },
  { code: 'KR', name: 'South Korea', flag: '' },
  { code: 'HK', name: 'Hong Kong', flag: '' },
  { code: 'SG', name: 'Singapore', flag: '' },
  { code: 'GB', name: 'United Kingdom', flag: '' },
  { code: 'AU', name: 'Australia', flag: '' },
  { code: 'CA', name: 'Canada', flag: '' },
  { code: 'DE', name: 'Germany', flag: '' },
  { code: 'FR', name: 'France', flag: '' },
  { code: 'TH', name: 'Thailand', flag: '' },
].sort((left, right) => left.name.localeCompare(right.name));

export function resolveDocupassEndpoint(reference?: string | null): string {
  return reference?.trim().toLowerCase().startsWith('eu')
    ? DOCUPASS_API_ENDPOINT_EU
    : DOCUPASS_API_ENDPOINT_US;
}

export function parseDocupassReference(
  value: string,
  partyId?: string | null,
): { reference: string; partyId: string | null } {
  const reference = value.trim();
  const explicitPartyId = partyId?.trim();
  if (explicitPartyId) {
    return { reference, partyId: explicitPartyId };
  }

  const separatorIndex = reference.indexOf('/');
  if (separatorIndex <= 0 || separatorIndex === reference.length - 1) {
    return { reference, partyId: null };
  }

  return {
    reference: reference.slice(0, separatorIndex).trim(),
    partyId: reference.slice(separatorIndex + 1).trim() || null,
  };
}

export function docupassConfigFromReference(
  reference: string,
  partyId?: string | null,
  geolocation?: string | null,
  enabled = true,
): DocupassApiConfig {
  const parsed = parseDocupassReference(reference, partyId);
  return {
    enabled,
    baseUrl: resolveDocupassEndpoint(parsed.reference),
    reference: parsed.reference,
    partyId: parsed.partyId,
    geolocation,
  };
}

export const DocupassConfigFactory = {
  fromReference: docupassConfigFromReference,
};

export function createEmptyResult(): KYCResult {
  return {
    country: null,
    documentType: null,
    documentFrontBase64: null,
    documentBackBase64: null,
    faceBase64List: [],
    isFaceVerified: false,
    serverTask: null,
    sessionId: null,
    sessionState: null,
    terminalError: null,
  };
}

export function defaultWorkflow(): KYCStep[] {
  return [
    { kind: 'selectCountry' },
    { kind: 'selectDocument' },
    { kind: 'captureDocument' },
    { kind: 'faceVerification', actions: KYC_ACTIONS },
  ];
}

export const DocupassWorkflow = {
  defaultWorkflow,
};

export function normalizeWorkflow(input: KYCStep[]): KYCStep[] {
  if (input.some((step) => step.kind === 'captureDocument')) {
    return input;
  }

  return input.flatMap((step) =>
    step.kind === 'selectDocument' ? [step, { kind: 'captureDocument' } as KYCStep] : [step],
  );
}

export function firstFaceActions(workflow: KYCStep[]): KYCAction[] {
  const step = workflow.find((item) => item.kind === 'faceVerification');
  if (step?.kind === 'faceVerification' && step.actions.length > 0) {
    return step.actions;
  }
  return KYC_ACTIONS;
}

export function randomizedFaceActions(candidates: KYCAction[], minimumCount = 2): KYCAction[] {
  const unique = candidates.filter(
    (candidate, index, list) =>
      candidate.id !== 'front' && list.findIndex((item) => item.id === candidate.id) === index,
  );
  const source = unique.length > 0 ? unique : KYC_ACTIONS;
  const selected = shuffle(source);
  const desired = Math.min(Math.max(minimumCount, 1), KYC_ACTIONS.length);
  if (selected.length < desired) {
    selected.push(...shuffle(KYC_ACTIONS.filter((action) => !selected.some((item) => item.id === action.id))));
  }
  return [KYC_FRONT_ACTION, ...selected.slice(0, desired)];
}

export function countriesForFilter(filterCodes?: string[] | null): KYCCountry[] {
  if (!filterCodes || filterCodes.length === 0) {
    return ALL_COUNTRIES;
  }

  const known = new Map(ALL_COUNTRIES.map((country) => [country.code.toUpperCase(), country]));
  const seen = new Set<string>();
  return filterCodes
    .map((code) => code.trim().toUpperCase())
    .filter((code) => {
      if (!code || seen.has(code)) return false;
      seen.add(code);
      return true;
    })
    .map((code) => known.get(code) || { code, name: code, flag: '' })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function countryFromCode(code: string): KYCCountry {
  const normalized = code.trim().toUpperCase();
  return ALL_COUNTRIES.find((country) => country.code.toUpperCase() === normalized) || {
    code: normalized,
    name: normalized,
    flag: '',
  };
}

export function documentTypeFromCode(code?: string | null): KYCDocumentType | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return DOCUMENT_TYPES.find((type) => type.apiTypeCode === normalized) || null;
}

export function documentTypesForFilter(acceptedTypes?: string[] | null): KYCDocumentType[] {
  const accepted = new Set((acceptedTypes || []).map((type) => type.toUpperCase()));
  return accepted.size === 0
    ? DOCUMENT_TYPES
    : DOCUMENT_TYPES.filter((type) => accepted.has(type.apiTypeCode));
}

export function commaSeparatedValues(value?: string | null): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function extractContractSignatureFields(source: string): DocupassContractSignatureField[] {
  const tagRegex = /<(?:img|div)\b[^>]*data-signature[^>]*>/gi;
  const seen = new Set<string>();
  const fields: DocupassContractSignatureField[] = [];
  for (const match of source.matchAll(tagRegex)) {
    const tag = match[0];
    const uid = htmlAttribute(tag, 'data-uid');
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    fields.push({
      uid,
      label: htmlAttribute(tag, 'data-label') || 'Signature',
      party: htmlAttribute(tag, 'data-party'),
    });
  }
  return fields;
}

export function cleanContractHtml(source: string): string {
  const cleaned = source.replace(/%\{[0-9A-Za-z_.-]+\}/g, '');
  if (/<html/i.test(cleaned)) {
    return cleaned;
  }
  return [
    "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'>",
    '<style>body{font-family:-apple-system,Roboto,sans-serif;color:#111;padding:12px;line-height:1.45}',
    'img[data-signature],div[data-signature]{display:none}</style></head><body>',
    cleaned,
    '</body></html>',
  ].join('');
}

export function injectContractSignatures(
  source: string,
  signatures: Record<string, string>,
): string {
  if (Object.keys(signatures).length === 0) return source;

  return source.replace(/<(?:img|div)\b[^>]*data-signature[^>]*>/gi, (tag) => {
    const uid = htmlAttribute(tag, 'data-uid');
    const signature = uid ? signatures[uid]?.trim() : '';
    if (!signature) return tag;

    if (/^<img\b/i.test(tag)) {
      return setHtmlAttribute(
        setHtmlAttribute(tag, 'src', signature),
        'style',
        mergeHtmlStyle(htmlAttribute(tag, 'style') || '', 'display:block;object-fit:contain'),
      );
    }

    return `${setHtmlAttribute(
      tag,
      'style',
      mergeHtmlStyle(htmlAttribute(tag, 'style') || '', 'display:block'),
    )}<img src="${signature}" alt="Signature" style="display:block;max-width:100%;height:auto;object-fit:contain" />`;
  });
}

export function stripHtml(source: string): string {
  return source
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface CustomFormOption {
  label: string;
  value: string;
}

export function parseCustomFieldOptions(raw: string): CustomFormOption[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = [';', '\t', '|'].find((item) => line.includes(item));
      if (!separator) {
        return { label: line, value: line };
      }
      const [labelRaw, ...rest] = line.split(separator);
      const label = (labelRaw || line).trim();
      const value = rest.join(separator).trim() || label;
      return { label, value };
    });
}

export function isResultEvent(event: DocupassKycEvent): boolean {
  return event.kind === 'completed' || event.kind === 'failed';
}

export function isSameEvent(left: DocupassKycEvent, right: DocupassKycEvent): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function displayNormalizedError(error: DocupassNormalizedError, includeCode = true): string {
  const codes = [error.code, error.subCode].filter((item): item is string => !!item && item.length > 0);
  const codeLine = includeCode && codes.length > 0 ? `\nCode: ${codes.join(' / ')}` : '';
  const warningLine =
    error.warningCodes.length > 0 ? `\nWarnings: ${error.warningCodes.join(', ')}` : '';
  return `${error.title}\n${error.detail}\n${error.suggestion}${warningLine}${codeLine}`;
}

export function requiresDocumentBackSide(
  documentType?: KYCDocumentType | null,
  documentSide?: number | null,
): boolean {
  if (documentSide === 1) return false;
  if (documentSide === 2) return documentType?.apiTypeCode !== 'P';
  return documentType?.requiresBackSide === true;
}

export function kycSettingsFromReference(
  reference: string,
  partyId?: string | null,
  geolocation?: string | null,
  enabled = true,
  onFinish: (result: KYCResult) => void = () => {},
  onBackAtFirstStep: () => void = () => {},
): KYCSettings {
  return {
    apiConfig: docupassConfigFromReference(reference, partyId, geolocation, enabled),
    maskCircleRadius: 0.42,
    maskCircleY: 0.45,
    turnTimeSeconds: 2,
    onFinish,
    onBackAtFirstStep,
  };
}

function htmlAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*["']([^"']*)["']`, 'i');
  const match = pattern.exec(tag);
  return match?.[1] ? htmlUnescape(match[1]) : null;
}

function htmlUnescape(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function setHtmlAttribute(tag: string, name: string, value: string): string {
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const expression = new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'i');
  if (expression.test(tag)) {
    return tag.replace(expression, ` ${name}="${escaped}"`);
  }
  return tag.replace(/\s*\/?>$/, (ending) => ` ${name}="${escaped}"${ending}`);
}

function mergeHtmlStyle(current: string, addition: string): string {
  const trimmed = current.trim();
  const base = trimmed ? trimmed.replace(/;?$/, ';') : '';
  return `${base}${addition}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
