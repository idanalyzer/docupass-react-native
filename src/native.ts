import { NativeEventEmitter, NativeModules } from 'react-native';
import type {
  DocuPassConfig,
  DocuPassKycState,
  DocuPassKycStateChangedEvent,
} from './types';

export const DOCUPASS_STATE_EVENT = 'DocuPassKycStateChanged';

export interface DocupassReactNativeModule {
  createSession(config: DocuPassConfig): Promise<string>;
  currentState(sessionId: string): Promise<DocuPassKycState>;
  start(sessionId: string): Promise<void>;
  refresh(sessionId: string): Promise<void>;
  back(sessionId: string): Promise<void>;
  clearError(sessionId: string): Promise<void>;
  restart(sessionId: string): Promise<void>;
  sendPhoneCode(sessionId: string, number: string | null, type: string): Promise<void>;
  verifyPhoneCode(sessionId: string, number: string | null, code: string): Promise<void>;
  saveCustomForm(sessionId: string, answers: Record<string, string>): Promise<void>;
  selectDocumentCountry(sessionId: string, countryCode: string): Promise<void>;
  selectDocumentType(sessionId: string, documentTypeCode: string): Promise<void>;
  uploadDocument(sessionId: string, frontBase64: string, backBase64: string | null): Promise<void>;
  uploadFace(sessionId: string, faceBase64List: string[]): Promise<void>;
  submitContract(sessionId: string, signatures: Record<string, string>): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  readFileAsBase64(uri: string): Promise<string>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const LINKING_ERROR =
  "The native module 'DocupassReactNative' is not linked. Make sure you rebuilt the app after installing docupass-react-native and installed pods on iOS.";

const NativeDocupassReactNative =
  NativeModules.DocupassReactNative as DocupassReactNativeModule | undefined;

export function getNativeModule(): DocupassReactNativeModule {
  if (!NativeDocupassReactNative) {
    throw new Error(LINKING_ERROR);
  }
  return NativeDocupassReactNative;
}

export const docupassEventEmitter = NativeDocupassReactNative
  ? new NativeEventEmitter(NativeDocupassReactNative as any)
  : undefined;

export type NativeStateListener = (event: DocuPassKycStateChangedEvent) => void;

export function addNativeStateListener(listener: NativeStateListener): () => void {
  if (!docupassEventEmitter) {
    throw new Error(LINKING_ERROR);
  }
  const subscription = docupassEventEmitter.addListener(DOCUPASS_STATE_EVENT, listener);
  return () => subscription.remove();
}

export async function readImageFileAsBase64(uri: string): Promise<string> {
  return getNativeModule().readFileAsBase64(uri);
}
