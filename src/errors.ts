import {
  DocupassApiError,
  DocupassErrorAction,
  DocupassNormalizedError,
} from './types';

interface ErrorTemplate {
  title: string;
  detail: string;
  suggestion: string;
  action: DocupassErrorAction;
}

export const DocupassErrorNormalizer = {
  normalize(errorOrCode: DocupassApiError | string | null | undefined, message?: string | null) {
    if (typeof errorOrCode === 'object' && errorOrCode !== null) {
      return normalizeDocupassError(errorOrCode);
    }
    return normalizeDocupassError({
      code: errorOrCode,
      message: message || '',
    });
  },
};

export function normalizeDocupassError(error: DocupassApiError): DocupassNormalizedError {
  const code = normalizedKey(error.code);
  const rawMessage = error.message?.trim() || '';

  switch (code) {
    case 'DOCUPASS_COMPLETED':
      return completed(rawMessage, error.httpStatus, error.rawBody);
    case 'DOCUPASS_FAILED':
      return failed(rawMessage, error.httpStatus, error.rawBody);
    case 'DOCUPASS_INVALID_ACTION':
      return fromTemplate(code, null, mainCodeTemplates.DOCUPASS_INVALID_ACTION, error, rawMessage);
    case 'DOCUPASS_FATAL_ERROR':
      return fromSubCode(
        code,
        rawMessage,
        fatalSubCodeTemplates,
        {
          title: 'Fatal DocuPass session error',
          detail:
            'The session cannot continue because the server rejected the reference, session, or required context.',
          suggestion:
            'Restart from a valid DocuPass link. If this repeats, ask the link issuer to create a new link.',
          action: DocupassErrorAction.FATAL,
        },
        error,
      );
    case 'DOCUPASS_GENERIC_ERROR':
      return fromSubCode(
        code,
        rawMessage,
        genericSubCodeTemplates,
        {
          title: 'DocuPass input error',
          detail: 'The server rejected the current input.',
          suggestion: 'Review the entered data and try again.',
          action: DocupassErrorAction.EDIT_INPUT,
        },
        error,
      );
    case 'DOCUPASS_DOCUMENT_REJECTED':
      return rejected(
        code,
        rawMessage,
        documentWarningTemplates,
        {
          title: 'Document rejected',
          detail: 'The document verification was rejected by the server.',
          suggestion:
            'Retake the document photo with the full document visible, focused, and free of glare.',
          action: DocupassErrorAction.RETAKE_DOCUMENT,
        },
        error,
      );
    case 'DOCUPASS_FACE_REJECTED':
      return rejected(
        code,
        rawMessage,
        faceWarningTemplates,
        {
          title: 'Face verification failed',
          detail: 'The face verification was rejected by the server.',
          suggestion: 'Retake the selfie in good lighting and follow the liveness instructions.',
          action: DocupassErrorAction.RETAKE_FACE,
        },
        error,
      );
    case 'ERROR_INVALID_VALUE':
      return invalidValue(rawMessage, error);
    case 'ERROR_OPERATION_FAILED':
      return operationFailed(rawMessage, error);
    case 'ERROR_INTERNAL_ERROR':
      return internalError(rawMessage, error);
    default: {
      const template =
        (code && mainCodeTemplates[code]) ||
        (code && commonCodeTemplates[code]) ||
        (code && localCodeTemplates[code]);
      if (template) {
        return fromTemplate(code, null, template, error, rawMessage);
      }
      return unknown(code, rawMessage, error);
    }
  }
}

export function formatApiErrorMessage(error: DocupassApiError): string {
  const message = error.message.trim();
  if (message.length > 0 && !isDiagnosticTokenList(message)) {
    return message;
  }

  const normalized = normalizeDocupassError(error);
  return normalized.detail || normalized.title;
}

function fromSubCode(
  code: string,
  message: string,
  templates: Record<string, ErrorTemplate>,
  fallback: ErrorTemplate,
  error: DocupassApiError,
): DocupassNormalizedError {
  const subCode = normalizedKey(message);
  return fromTemplate(code, subCode, (subCode && templates[subCode]) || fallback, error, message);
}

function rejected(
  code: string,
  message: string,
  templates: Record<string, ErrorTemplate>,
  fallback: ErrorTemplate,
  error: DocupassApiError,
): DocupassNormalizedError {
  const warningCodes = message
    .split(',')
    .map((item) => normalizedKey(item))
    .filter((item): item is string => !!item);
  const subCode = warningCodes[0] || null;
  return fromTemplate(code, subCode, (subCode && templates[subCode]) || fallback, error, message, warningCodes);
}

function completed(
  message: string,
  httpStatus?: number | null,
  rawBody?: string | null,
): DocupassNormalizedError {
  const hasRedirect = isLikelyUrl(message);
  return {
    code: 'DOCUPASS_COMPLETED',
    subCode: null,
    title: 'Verification completed',
    detail: 'The DocuPass verification has already been completed successfully.',
    suggestion: hasRedirect
      ? 'Show the completed state and continue to the returned redirect URL.'
      : 'Show the completed state and stop submitting more verification data.',
    action: DocupassErrorAction.SHOW_COMPLETED,
    warningCodes: [],
    httpStatus,
    rawMessage: message,
    rawBody,
  };
}

function failed(
  message: string,
  httpStatus?: number | null,
  rawBody?: string | null,
): DocupassNormalizedError {
  const hasRedirect = isLikelyUrl(message);
  return {
    code: 'DOCUPASS_FAILED',
    subCode: null,
    title: 'Verification failed',
    detail: 'The DocuPass verification has reached a failed or rejected final state.',
    suggestion: hasRedirect
      ? 'Show the failed state and continue to the returned redirect URL.'
      : 'Show the failed state. Do not retry the same completed session.',
    action: DocupassErrorAction.SHOW_FAILED,
    warningCodes: [],
    httpStatus,
    rawMessage: message,
    rawBody,
  };
}

function invalidValue(message: string, error: DocupassApiError): DocupassNormalizedError {
  const field = message.trim();
  const template =
    field === 'document'
      ? {
          title: 'Document image missing',
          detail: 'The request did not include a valid front document image.',
          suggestion: 'Retake or reselect the front document image before uploading.',
          action: DocupassErrorAction.RETAKE_DOCUMENT,
        }
      : field === 'face'
        ? {
            title: 'Face image missing',
            detail: 'The request did not include a valid face image or face video.',
            suggestion: 'Restart face capture and submit at least one valid face frame.',
            action: DocupassErrorAction.RETAKE_FACE,
          }
        : field === 'profile'
          ? inputTemplate(
              'Invalid profile',
              'The DocuPass link creation request is missing a valid profile id.',
              'Use an existing profile id when creating the DocuPass link.',
            )
          : field === 'profileOverride'
            ? inputTemplate(
                'Invalid profile override',
                'The profileOverride value is not valid JSON.',
                'Fix the JSON body before creating the DocuPass link.',
              )
            : inputTemplate(
                'Invalid request value',
                field
                  ? `Parameter '${field}' is missing or contains an invalid value.`
                  : 'A required parameter is missing or invalid.',
                'Fix the request payload and try again.',
              );

  return fromTemplate('ERROR_INVALID_VALUE', field || null, template, error, message);
}

function operationFailed(message: string, error: DocupassApiError): DocupassNormalizedError {
  const template =
    operationFailedTemplates[message] ||
    inputTemplate(
      'Operation failed',
      message || 'The server rejected the requested operation.',
      'Review the request settings and try again.',
    );
  return fromTemplate('ERROR_OPERATION_FAILED', message || null, template, error, message);
}

function internalError(message: string, error: DocupassApiError): DocupassNormalizedError {
  return {
    code: 'ERROR_INTERNAL_ERROR',
    subCode: null,
    title: 'Technical error',
    detail:
      message && message !== 'Internal server error.'
        ? `The server returned an internal error: ${message}`
        : 'The server hit an internal error while processing the request.',
    suggestion:
      'Retry once. If the same error repeats, contact support with the reference and request step.',
    action: DocupassErrorAction.CONTACT_SUPPORT,
    warningCodes: [],
    httpStatus: error.httpStatus,
    rawMessage: message,
    rawBody: error.rawBody,
  };
}

function unknown(
  code: string | null,
  message: string,
  error: DocupassApiError,
): DocupassNormalizedError {
  return {
    code,
    subCode: null,
    title: 'Unexpected DocuPass error',
    detail: message || 'The server returned an unmapped error.',
    suggestion: 'Show this message and keep the raw error for debugging.',
    action: DocupassErrorAction.CONTACT_SUPPORT,
    warningCodes: [],
    httpStatus: error.httpStatus,
    rawMessage: message,
    rawBody: error.rawBody,
  };
}

function fromTemplate(
  code: string | null,
  subCode: string | null,
  template: ErrorTemplate,
  error: DocupassApiError,
  rawMessage: string,
  warningCodes: string[] = [],
): DocupassNormalizedError {
  return {
    code,
    subCode,
    title: template.title,
    detail: template.detail,
    suggestion: template.suggestion,
    action: template.action,
    warningCodes,
    httpStatus: error.httpStatus,
    rawMessage,
    rawBody: error.rawBody,
  };
}

function normalizedKey(value?: string | null): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function isLikelyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function isDiagnosticTokenList(value: string): boolean {
  const parts = value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => /^[A-Z][A-Z0-9_ -]{2,}$/.test(part));
}

const mainCodeTemplates: Record<string, ErrorTemplate> = {
  DOCUPASS_INVALID_ACTION: {
    title: 'Session is out of sync',
    detail:
      'The action no longer matches the current server task. This can happen if the task was completed on another device or the profile changed.',
    suggestion: 'Call get_action again and route the user to the latest returned task.',
    action: DocupassErrorAction.RESYNC_SESSION,
  },
  DOCUPASS_REDIRECT: {
    title: 'Redirect required',
    detail: 'The server returned a DocuPass redirect state.',
    suggestion: 'If the message is a URL, continue to it or return it through the SDK callback.',
    action: DocupassErrorAction.SHOW_COMPLETED,
  },
  DOCUPASS_ACCEPTED: {
    title: 'Verification accepted',
    detail: 'The DocuPass verification has been accepted.',
    suggestion: 'Show the completed state and stop submitting more data.',
    action: DocupassErrorAction.SHOW_COMPLETED,
  },
  DOCUPASS_UNDER_REVIEW: {
    title: 'Verification under review',
    detail: 'The DocuPass verification has completed and is waiting for review.',
    suggestion: 'Show a completed or review-pending state.',
    action: DocupassErrorAction.SHOW_COMPLETED,
  },
  DOCUPASS_CUSTOM_URL_ERROR: {
    title: 'Custom DocuPass URL unavailable',
    detail:
      'The link requested a custom DocuPass URL that is not allowed by the current plan or account settings.',
    suggestion:
      'Remove the custom URL setting or ask the account administrator to enable the required plan.',
    action: DocupassErrorAction.EDIT_INPUT,
  },
};

const fatalSubCodeTemplates: Record<string, ErrorTemplate> = {
  REFERENCE_NOT_FOUND: {
    title: 'DocuPass link not found',
    detail: 'The reference in the Authorization header does not exist or the link is broken.',
    suggestion: 'Stop the flow and ask the issuer to provide a new DocuPass link.',
    action: DocupassErrorAction.FATAL,
  },
  SESSION_NOT_FOUND: {
    title: 'Session not found',
    detail: 'The DOCUPASS_SESSION token is invalid, expired, or no longer available.',
    suggestion:
      'If the original reference is available, restart from the reference. Otherwise ask for a new link.',
    action: DocupassErrorAction.FATAL,
  },
  LOCATION_HEADER_MISSING: {
    title: 'Location permission required',
    detail: 'This profile requires GPS tracking, but the Geolocation header was missing or invalid.',
    suggestion: 'Request device location permission, then retry get_action with Geolocation: lat,lng,accuracy.',
    action: DocupassErrorAction.REQUEST_LOCATION,
  },
};

const genericSubCodeTemplates: Record<string, ErrorTemplate> = {
  INVALID_PHONE_NUMBER: inputTemplate(
    'Invalid phone number',
    'The phone number could not be parsed by the server.',
    'Enter the number in E.164 format, for example +886912345678.',
  ),
  'PHONE NUMBER NOT IN ACCEPTED COUNTRY': inputTemplate(
    'Phone country not accepted',
    "The phone number country code is outside the profile's accepted country list.",
    'Select one of the allowed country codes and enter a matching phone number.',
  ),
  SMS_LIMIT_REACHED: retryTemplate(
    'SMS resend limit reached',
    'An SMS verification was requested too recently from this IP address.',
    'Wait at least 60 seconds before sending another SMS.',
  ),
  CALL_LIMIT_REACHED: retryTemplate(
    'Call retry limit reached',
    'A call verification was requested too recently from this IP address.',
    'Wait at least 5 minutes before requesting another call.',
  ),
  PHONE_VERIFICATION_LIMIT_REACHED: fatalTemplate(
    'Phone verification limit reached',
    'Too many phone verification attempts were made for this DocuPass reference.',
    'Stop retrying for now. Try again later or ask the issuer for help.',
  ),
  NUMBER_NOT_SUPPORTED: inputTemplate(
    'Phone number not supported',
    'The phone verification provider rejected this phone number or channel.',
    'Try another number or switch between SMS and call.',
  ),
  INVALID_PHONE_VERIFICATION_CODE: inputTemplate(
    'Invalid verification code',
    'The phone verification code is not valid or was rejected.',
    'Clear the code field and ask the user to enter the latest 6 digit code.',
  ),
  PHONE_VERIFICATION_EXPIRED: retryTemplate(
    'Verification code expired',
    'The server could not find a matching active phone verification record.',
    'Send a new SMS or call verification code.',
  ),
  CUSTOM_FIELD_EMPTY: inputTemplate(
    'Required answer missing',
    'A required custom form field is empty.',
    'Highlight the missing field and ask the user to answer it.',
  ),
  INVALID_SIGNATURE_IMAGE: signatureTemplate(
    'Invalid signature image',
    'The signature value is not a valid image.',
    'Open the signature pad again and collect a new signature image.',
  ),
  SIGNATURE_MISSING: signatureTemplate(
    'Signature missing',
    'At least one required signature field is missing.',
    'Highlight the unsigned fields and require all signatures before submitting.',
  ),
};

const documentWarningTemplates: Record<string, ErrorTemplate> = {
  UNRECOGNIZED_DOCUMENT: retakeDocument(
    'Document not recognized',
    'The server could not recognize the front document image as a supported official document.',
    'Retake the full document with clear focus and no cropping.',
  ),
  UNRECOGNIZED_BACK_DOCUMENT: retakeDocument(
    'Back document not recognized',
    'The back side image could not be recognized.',
    'Retake the back side clearly, including the full card.',
  ),
  UNRECOGNIZED_BACK_BARCODE: retakeDocument(
    'Back barcode unreadable',
    'The server could not read the barcode from the back side.',
    'Retake the back side with the barcode in focus and without glare.',
  ),
  INVALID_BACK_DOCUMENT: retakeDocument(
    'Invalid back document',
    'The uploaded back image is not a valid back side for this document.',
    'Upload the correct reverse side of the same document.',
  ),
  DOCUPASS_BACK_DOCUMENT_NOT_UPLOADED: retakeDocument(
    'Back document required',
    'This document type requires a back side image, but it was not uploaded.',
    'Ask the user to capture the reverse side.',
  ),
  DOCUPASS_BACK_DOCUMENT_MISMATCH: retakeDocument(
    'Back document mismatch',
    'The uploaded back side does not match the expected document back side.',
    'Retake the correct back side of the selected document.',
  ),
  DOCUPASS_DOCUMENT_MISSING_FACE: retakeDocument(
    'Document photo missing',
    "The uploaded document does not contain a detectable face photo required for face verification.",
    "Upload a document page or side that includes the holder's portrait.",
  ),
  DOCUMENT_FACE_NOT_FOUND: retakeDocument(
    'Document face not found',
    'The server could not detect the face photo on the document.',
    'Retake the document with the portrait area clear and in focus.',
  ),
  DOCUMENT_FACE_LANDMARK_ERR: retakeDocument(
    'Document face too unclear',
    'The document portrait was too blurry or unclear for face landmark detection.',
    'Retake the document with better focus and lighting.',
  ),
  DOCUPASS_DOCUMENT_TYPE_MISMATCH: retakeDocument(
    'Document type mismatch',
    'The selected document type does not match the uploaded document.',
    'Let the user reselect the document type or upload the matching document.',
  ),
  DOCUPASS_DOCUMENT_COUNTRY_MISMATCH: retakeDocument(
    'Document country mismatch',
    'The selected issuing country does not match the uploaded document.',
    'Let the user reselect the issuing country or upload the matching document.',
  ),
  DOCUPASS_NOT_FROM_CAMERA: retakeDocument(
    'Document not taken from camera',
    'The document image does not appear to be a live camera capture.',
    'Use the phone camera to capture the physical document directly.',
  ),
  TYPE_NOT_ACCEPTED: inputTemplate(
    'Document type not accepted',
    'The uploaded document type is not allowed by the profile.',
    'Choose one of the allowed document types.',
  ),
  COUNTRY_NOT_ACCEPTED: inputTemplate(
    'Document country not accepted',
    'The document issuing country is not allowed by the profile.',
    'Choose a document from one of the allowed countries.',
  ),
  STATE_NOT_ACCEPTED: inputTemplate(
    'Document state not accepted',
    'The document issuing state is not allowed by the profile.',
    'Use a document from an accepted state or region.',
  ),
  UNDER_18: ageTemplate('18'),
  UNDER_19: ageTemplate('19'),
  UNDER_20: ageTemplate('20'),
  UNDER_21: ageTemplate('21'),
  NAME_VERIFICATION_FAILED: infoMismatchTemplate('name'),
  DOB_VERIFICATION_FAILED: infoMismatchTemplate('date of birth'),
  AGE_VERIFICATION_FAILED: infoMismatchTemplate('age'),
  ID_NUMBER_VERIFICATION_FAILED: infoMismatchTemplate('document number'),
  ADDRESS_VERIFICATION_FAILED: infoMismatchTemplate('address'),
  POSTCODE_VERIFICATION_FAILED: infoMismatchTemplate('postcode'),
  LOW_TEXT_CONFIDENCE: blurryTemplate('The OCR confidence is too low.'),
  MISSING_EXPIRY_DATE: blurryTemplate('The expiry date is missing or unreadable.'),
  MISSING_ISSUE_DATE: blurryTemplate('The issue date is missing or unreadable.'),
  MISSING_BIRTH_DATE: blurryTemplate('The date of birth is missing or unreadable.'),
  MISSING_DOCUMENT_NUMBER: blurryTemplate('The document number is missing or unreadable.'),
  MISSING_PERSONAL_NUMBER: blurryTemplate('The personal number is missing or unreadable.'),
  MISSING_ADDRESS: blurryTemplate('The address is missing or unreadable.'),
  MISSING_POSTCODE: blurryTemplate('The postcode is missing or unreadable.'),
  MISSING_NAME: blurryTemplate('The name is missing or unreadable.'),
  MISSING_LOCAL_NAME: blurryTemplate('The local name is missing or unreadable.'),
  MISSING_GENDER: blurryTemplate('The gender field is missing or unreadable.'),
  MISSING_HEIGHT: blurryTemplate('The height field is missing or unreadable.'),
  MISSING_WEIGHT: blurryTemplate('The weight field is missing or unreadable.'),
  MISSING_HAIR_COLOR: blurryTemplate('The hair color field is missing or unreadable.'),
  MISSING_EYE_COLOR: blurryTemplate('The eye color field is missing or unreadable.'),
  MISSING_RESTRICTIONS: blurryTemplate('The restrictions field is missing or unreadable.'),
  IMAGE_TOO_SMALL: retakeDocument(
    'Document image too small',
    'The image resolution is too low for reliable verification.',
    'Retake the document at a higher resolution.',
  ),
  IMAGE_TOO_BLURRY: blurryTemplate('The document image is too blurry.'),
  GLARE_DETECTED: retakeDocument(
    'Glare detected',
    'The document image contains glare or reflection.',
    'Change the angle or lighting and retake the document.',
  ),
  BLACK_WHITE_DOCUMENT: screenOrCopyTemplate('The document appears to be a black and white copy.'),
  RECAPTURED_DOCUMENT: screenOrCopyTemplate(
    'The document may have been recaptured from another screen or print.',
  ),
  SCREEN_DETECTED: screenOrCopyTemplate('A screen or monitor was detected in the document image.'),
  DOCUMENT_EXPIRED: inputTemplate(
    'Document expired',
    'The uploaded document is no longer valid.',
    'Use a valid, non-expired document.',
  ),
  IMAGE_FORGERY: securityRejectTemplate('The document image may contain forged elements.'),
  IMAGE_EDITED: securityRejectTemplate('The document image metadata suggests editing.'),
  TEXT_FORGERY: securityRejectTemplate('The document text may have been artificially modified.'),
  FEATURE_VERIFICATION_FAILED: securityRejectTemplate(
    'The document security features do not match the expected template.',
  ),
  FAKE_ID: securityRejectTemplate('The document matches a known fake or sample document.'),
  ARTIFICIAL_IMAGE: securityRejectTemplate('The document image appears artificially generated.'),
  ARTIFICIAL_TEXT: securityRejectTemplate('The document text appears artificially generated.'),
  DOCUPASS_TOO_MANY_ATTEMPTS: showFailedTemplate(
    'Too many attempts',
    'The user has failed document or face verification too many times.',
    'Stop the current session and ask the issuer for a new link if appropriate.',
  ),
  DOCUPASS_EXPIRED: showFailedTemplate(
    'DocuPass link expired',
    'The link expired before all required tasks were completed.',
    'Ask the issuer to create a new DocuPass link.',
  ),
};

const faceWarningTemplates: Record<string, ErrorTemplate> = {
  SELFIE_FACE_NOT_FOUND: retakeFace(
    'Face not found',
    'The selfie image does not contain a detectable face.',
    'Center the face in the frame and retake the selfie.',
  ),
  SELFIE_MULTIPLE_FACES: retakeFace(
    'Multiple faces detected',
    'The selfie image contains more than one face.',
    'Make sure only the user is visible in the camera frame.',
  ),
  SELFIE_FACE_LANDMARK_ERR: retakeFace(
    'Face image unclear',
    'The selfie is too blurry or unclear for face landmark detection.',
    'Improve lighting, keep still, and retake the selfie.',
  ),
  FACE_MISMATCH: retakeFace(
    'Face mismatch',
    'The selfie does not match the face on the document.',
    'Retake the selfie with the document holder. If it still fails, verification should fail.',
  ),
  FACE_IDENTICAL: retakeFace(
    'Selfie appears identical',
    'The selfie appears to be the same image as the document portrait.',
    'Use a live camera selfie, not a document photo or uploaded portrait.',
  ),
  FACE_LIVENESS_ERR: retakeFace(
    'Liveness failed',
    'The selfie failed liveness verification.',
    'Retake the face capture and follow the liveness instructions carefully.',
  ),
  RECAPTURED_FACE: retakeFace(
    'Recaptured face detected',
    'The selfie may have been captured from a screen or photo.',
    'Use the live front camera and keep the actual user in frame.',
  ),
  DOCUPASS_TOO_MANY_ATTEMPTS: showFailedTemplate(
    'Too many attempts',
    'The user has failed document or face verification too many times.',
    'Stop the current session and ask the issuer for a new link if appropriate.',
  ),
};

const commonCodeTemplates: Record<string, ErrorTemplate> = {
  ERROR_INVALID_LICENSE: contactTemplate(
    'Service license unavailable',
    'The server license is invalid, expired, or over quota.',
    'Stop the flow and ask the issuer or administrator to check the service license.',
  ),
  SERVICE_UNAVAILABLE: retryTemplate(
    'Service busy',
    'The server is busy or has reached its concurrent processing limit.',
    'Wait briefly and retry with backoff.',
  ),
  ERROR_MAX_EXECUTION_TIME_EXCEEDED: retryTemplate(
    'Request timed out',
    'The document or face verification took longer than the server limit.',
    'Retry the request. If it repeats, reduce image size or try again later.',
  ),
  ERROR_REQUEST_TOO_LARGE: {
    title: 'Upload too large',
    detail: 'The request body exceeded the server upload size limit.',
    suggestion: 'Compress the image or lower the camera resolution before uploading.',
    action: DocupassErrorAction.RETAKE_DOCUMENT,
  },
  ERROR_INVALID_JSON: contactTemplate(
    'Invalid request JSON',
    'The POST body is not valid JSON.',
    'Fix the SDK request builder before retrying.',
  ),
  ERROR_UNAUTHORIZED: fatalTemplate(
    'Unauthorized',
    'The server could not authenticate the DocuPass user or credentials.',
    'Stop the flow and ask the issuer for a valid link.',
  ),
  ERROR_USER_BANNED: fatalTemplate(
    'User account unavailable',
    'The DocuPass link owner account is banned or disabled.',
    'Stop the flow and ask the issuer to contact support.',
  ),
  ERROR_QUOTA_EXCEEDED: fatalTemplate(
    'Quota exceeded',
    'The DocuPass link owner does not have enough quota for this operation.',
    'Stop the flow and ask the issuer to add quota.',
  ),
  ERROR_EXECUTION_CANCEL: retryTemplate(
    'Execution cancelled',
    'The server cancelled the verification request.',
    'Retry the current step.',
  ),
  ERROR_INVALID_ENCODING: {
    title: 'Invalid base64 image',
    detail: 'The uploaded image could not be decoded from base64.',
    suggestion: 'Regenerate the image base64 and retry the upload.',
    action: DocupassErrorAction.RETAKE_DOCUMENT,
  },
  ERROR_REMOTE_IMAGE_FAILED: retryTemplate(
    'Remote image failed',
    'The server could not load the image from a URL or cached reference.',
    'Upload the image directly instead of using a remote URL, or retry with a valid reference.',
  ),
  ERROR_IMAGE_CORRUPTED: {
    title: 'Image unsupported or corrupted',
    detail: 'The image format is unsupported or the file is corrupted.',
    suggestion: 'Retake or reselect a clear JPG, PNG, or supported PDF file.',
    action: DocupassErrorAction.RETAKE_DOCUMENT,
  },
};

const localCodeTemplates: Record<string, ErrorTemplate> = {
  LOCAL_VALIDATION: inputTemplate(
    'Missing local input',
    'The SDK blocked the request before sending it because required local data is missing.',
    'Complete the current capture step before submitting.',
  ),
  NETWORK_ERROR: retryTemplate(
    'Network error',
    'The SDK could not reach the DocuPass API.',
    'Check connectivity and retry.',
  ),
  UNEXPECTED_ERROR: contactTemplate(
    'Unexpected SDK error',
    'The SDK hit an unexpected error while handling the request.',
    'Retry once. If it repeats, collect logs and contact support.',
  ),
};

const operationFailedTemplates: Record<string, ErrorTemplate> = {
  'Invalid DocuPass mode.': inputTemplate(
    'Invalid DocuPass mode',
    'The requested DocuPass mode is outside the supported range.',
    'Use mode 0, 1, 2, or 3 when creating the link.',
  ),
  'Cannot set both reference document and reference face.': inputTemplate(
    'Conflicting reference images',
    'The link creation request includes both reference document and reference face.',
    'Provide only one reference source for this mode.',
  ),
  'Cannot set reference face for document only verification.': inputTemplate(
    'Reference face not allowed',
    'Document-only mode cannot use a reference face.',
    'Remove referenceFace or use a different mode.',
  ),
  'Cannot set reference document for document only verification.': inputTemplate(
    'Reference document not allowed',
    'Document-only mode does not accept a reference document in this server implementation.',
    'Remove referenceDocument from the link creation request.',
  ),
  'Cannot set reference document for face only verification.': inputTemplate(
    'Reference document not allowed',
    'Face-only mode requires a reference face, not a reference document.',
    'Provide referenceFace instead of referenceDocument.',
  ),
  'Reference face image missing for face verification.': inputTemplate(
    'Reference face missing',
    'Face-only verification needs a reference face image.',
    'Provide referenceFace when creating a face-only link.',
  ),
  'Cannot set reference face for e-Signature mode.': inputTemplate(
    'Reference face not allowed',
    'e-Signature mode cannot use a reference face.',
    'Remove referenceFace from the request.',
  ),
  'Cannot set reference document for e-Signature mode.': inputTemplate(
    'Reference document not allowed',
    'e-Signature mode cannot use a reference document.',
    'Remove referenceDocument from the request.',
  ),
  'contractSign template id value required when using e-Signature mode.': inputTemplate(
    'Contract template missing',
    'e-Signature mode requires a contractSign template id.',
    'Set contractSign to a valid template id.',
  ),
  'Reusable link is deprecated in DocuPass v3': inputTemplate(
    'Reusable link not supported',
    'DocuPass v3 no longer supports reusable links.',
    'Create a one-time v3 link instead.',
  ),
  'contractSign contains invalid template ID.': inputTemplate(
    'Invalid contract template',
    'The contractSign template id does not exist or is not accessible.',
    'Use a valid contract template id.',
  ),
  'Template signatures contain multiple parties which is only supported in e-Signature only mode.':
    inputTemplate(
      'Multiparty signature not allowed',
      'The selected template has multiple parties, but the link is not e-Signature-only mode.',
      'Use mode 3 or choose a single-party template.',
    ),
};

function inputTemplate(title: string, detail: string, suggestion: string): ErrorTemplate {
  return { title, detail, suggestion, action: DocupassErrorAction.EDIT_INPUT };
}

function retryTemplate(title: string, detail: string, suggestion: string): ErrorTemplate {
  return { title, detail, suggestion, action: DocupassErrorAction.RETRY };
}

function fatalTemplate(title: string, detail: string, suggestion: string): ErrorTemplate {
  return { title, detail, suggestion, action: DocupassErrorAction.FATAL };
}

function signatureTemplate(title: string, detail: string, suggestion: string): ErrorTemplate {
  return { title, detail, suggestion, action: DocupassErrorAction.FIX_SIGNATURE };
}

function contactTemplate(title: string, detail: string, suggestion: string): ErrorTemplate {
  return { title, detail, suggestion, action: DocupassErrorAction.CONTACT_SUPPORT };
}

function retakeDocument(title: string, detail: string, suggestion: string): ErrorTemplate {
  return { title, detail, suggestion, action: DocupassErrorAction.RETAKE_DOCUMENT };
}

function retakeFace(title: string, detail: string, suggestion: string): ErrorTemplate {
  return { title, detail, suggestion, action: DocupassErrorAction.RETAKE_FACE };
}

function ageTemplate(age: string): ErrorTemplate {
  return {
    title: 'Age requirement failed',
    detail: `The document holder is under ${age}.`,
    suggestion: 'Show the age restriction failure and stop or return to the issuer flow.',
    action: DocupassErrorAction.SHOW_FAILED,
  };
}

function infoMismatchTemplate(field: string): ErrorTemplate {
  return {
    title: 'Information mismatch',
    detail: `The document ${field} does not match the expected verification data.`,
    suggestion: 'Show the mismatch result. If the user selected the wrong document, allow a retry.',
    action: DocupassErrorAction.RETAKE_DOCUMENT,
  };
}

function blurryTemplate(detail: string): ErrorTemplate {
  return {
    title: 'Document image unclear',
    detail,
    suggestion: 'Retake a clear, focused image with all text visible.',
    action: DocupassErrorAction.RETAKE_DOCUMENT,
  };
}

function screenOrCopyTemplate(detail: string): ErrorTemplate {
  return {
    title: 'Physical document required',
    detail,
    suggestion: 'Capture the original physical document directly with the camera.',
    action: DocupassErrorAction.RETAKE_DOCUMENT,
  };
}

function securityRejectTemplate(detail: string): ErrorTemplate {
  return {
    title: 'Document security check failed',
    detail,
    suggestion:
      'Do not continue automatically. Show verification failed or route to manual review if your product supports it.',
    action: DocupassErrorAction.SHOW_FAILED,
  };
}

function showFailedTemplate(title: string, detail: string, suggestion: string): ErrorTemplate {
  return { title, detail, suggestion, action: DocupassErrorAction.SHOW_FAILED };
}

