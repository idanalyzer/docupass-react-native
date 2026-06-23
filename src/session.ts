import { addNativeStateListener, getNativeModule, readImageFileAsBase64 } from './native';
import type {
  DocuPassConfig,
  DocuPassKycSession,
  DocuPassKycState,
  DocuPassKycStateListener,
} from './types';

function emptyCommandError(): Error {
  return new Error('DocuPass session is not ready yet.');
}

function normalizeConfig(config: DocuPassConfig): DocuPassConfig {
  const reference = config.reference?.trim();
  if (!reference) {
    throw new Error('DocuPass reference is required.');
  }
  return {
    ...config,
    reference,
  };
}

export async function createDocuPassSession(config: DocuPassConfig): Promise<DocuPassKycSession> {
  const native = getNativeModule();
  const sessionId = await native.createSession(normalizeConfig(config));
  let currentState: DocuPassKycState | undefined;
  let closed = false;
  const listeners = new Set<DocuPassKycStateListener>();

  const removeNativeListener = addNativeStateListener((event) => {
    if (event.sessionId !== sessionId || closed) {
      return;
    }
    currentState = event.state;
    listeners.forEach((listener) => listener(event.state));
  });

  try {
    currentState = await native.currentState(sessionId);
  } catch {
    currentState = undefined;
  }

  const session: DocuPassKycSession = {
    id: sessionId,
    getState: () => currentState,
    subscribe(listener) {
      listeners.add(listener);
      if (currentState) {
        listener(currentState);
      }
      return () => listeners.delete(listener);
    },
    start: () => native.start(sessionId),
    refresh: () => native.refresh(sessionId),
    back: () => native.back(sessionId),
    clearError: () => native.clearError(sessionId),
    restart: () => native.restart(sessionId),
    sendPhoneCode: (number, type) => native.sendPhoneCode(sessionId, number ?? null, type),
    verifyPhoneCode: (number, code) => native.verifyPhoneCode(sessionId, number ?? null, code),
    saveCustomForm: (answers) => native.saveCustomForm(sessionId, answers),
    selectDocumentCountry: (countryCode) => native.selectDocumentCountry(sessionId, countryCode),
    selectDocumentType: (documentTypeCode) => native.selectDocumentType(sessionId, documentTypeCode),
    uploadDocument: (frontBase64, backBase64) =>
      native.uploadDocument(sessionId, frontBase64, backBase64 ?? null),
    uploadFace: (faceBase64List) => native.uploadFace(sessionId, faceBase64List),
    submitContract: (signatures) => native.submitContract(sessionId, signatures),
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      removeNativeListener();
      listeners.clear();
      await native.closeSession(sessionId);
    },
  };

  return session;
}

export function createPendingSessionCommands(session: DocuPassKycSession | undefined) {
  const run = <T>(operation: (active: DocuPassKycSession) => Promise<T>): Promise<T> => {
    if (!session) {
      return Promise.reject(emptyCommandError());
    }
    return operation(session);
  };

  return {
    start: () => run((active) => active.start()),
    refresh: () => run((active) => active.refresh()),
    back: () => run((active) => active.back()),
    clearError: () => run((active) => active.clearError()),
    restart: () => run((active) => active.restart()),
    sendPhoneCode: (number: string | undefined, type: 'sms' | 'call' | string) =>
      run((active) => active.sendPhoneCode(number, type)),
    verifyPhoneCode: (number: string | undefined, code: string) =>
      run((active) => active.verifyPhoneCode(number, code)),
    saveCustomForm: (answers: Record<string, string>) =>
      run((active) => active.saveCustomForm(answers)),
    selectDocumentCountry: (countryCode: string) =>
      run((active) => active.selectDocumentCountry(countryCode)),
    selectDocumentType: (documentTypeCode: string) =>
      run((active) => active.selectDocumentType(documentTypeCode)),
    uploadDocument: (frontBase64: string, backBase64?: string) =>
      run((active) => active.uploadDocument(frontBase64, backBase64)),
    uploadFace: (faceBase64List: string[]) =>
      run((active) => active.uploadFace(faceBase64List)),
    submitContract: (signatures: Record<string, string>) =>
      run((active) => active.submitContract(signatures)),
  };
}

export { readImageFileAsBase64 };
