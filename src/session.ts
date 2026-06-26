import { DocupassApiClient } from './api';
import { formatApiErrorMessage, normalizeDocupassError } from './errors';
import {
  commaSeparatedValues,
  countriesForFilter,
  countryFromCode,
  createEmptyResult,
  defaultWorkflow,
  documentTypeFromCode,
  documentTypesForFilter,
  extractContractSignatureFields,
  firstFaceActions,
  isResultEvent,
  isSameEvent,
  normalizeWorkflow,
  randomizedFaceActions,
} from './helpers';
import {
  DocupassApiConfig,
  DocupassApiError,
  DocupassKycErrorEvent,
  DocupassKycEvent,
  DocupassKycListener,
  DocupassKycUiState,
  DocupassSubscription,
  KYCAction,
  KYCResult,
  KYCStep,
  PhoneVerificationType,
} from './types';

export class DocupassKycSession {
  private readonly workflow: KYCStep[];
  private readonly faceActionCandidates: KYCAction[];
  private readonly apiClient: DocupassApiClient;
  private readonly listeners = new Set<DocupassKycListener>();
  private stateValue: DocupassKycUiState = initialState();
  private currentStepIndex = 0;
  private result: KYCResult = createEmptyResult();
  private phoneCodeSent = false;
  private currentPhoneNumber: string | null = null;
  private eventBackStack: DocupassKycEvent[] = [];
  private closed = false;

  constructor(
    private readonly config: DocupassApiConfig,
    workflow: KYCStep[] = defaultWorkflow(),
    apiClient?: DocupassApiClient,
  ) {
    this.workflow = normalizeWorkflow(workflow);
    this.faceActionCandidates = firstFaceActions(this.workflow);
    this.apiClient = apiClient || new DocupassApiClient(config);
  }

  subscribe(listener: DocupassKycListener): DocupassSubscription {
    this.listeners.add(listener);
    listener(this.currentState());
    return {
      close: () => {
        this.listeners.delete(listener);
      },
    };
  }

  currentState(): DocupassKycUiState {
    return this.stateValue;
  }

  start(): Promise<void> {
    return this.runStart();
  }

  refresh(): Promise<void> {
    return this.refreshFromServer();
  }

  back(): void {
    this.goBack();
  }

  clearError(): void {
    this.update((state) => ({
      ...state,
      error: null,
      errorMessage: null,
      normalizedError: null,
    }));
  }

  async restart(): Promise<void> {
    this.resetLocalState();
    await this.runStart();
  }

  async sendPhoneCode(number?: string | null, type: PhoneVerificationType = 'sms'): Promise<void> {
    await this.withBusy(async () => {
      this.clearError();
      const response = await this.apiClient.createPhoneVerification(number, type);
      if (response.ok) {
        this.phoneCodeSent = true;
        this.currentPhoneNumber = number || null;
        this.republishPhoneEvent();
      } else {
        await this.handleApiError(response.error);
      }
    });
  }

  async verifyPhoneCode(number: string | null | undefined, code: string): Promise<void> {
    await this.withBusy(async () => {
      this.clearError();
      const response = await this.apiClient.checkPhoneVerification(number, code);
      response.ok ? this.applySessionState(response.data) : await this.handleApiError(response.error);
    });
  }

  async saveCustomForm(answers: Record<string, string>): Promise<void> {
    await this.withBusy(async () => {
      this.clearError();
      const response = await this.apiClient.saveForm(answers);
      response.ok ? this.applySessionState(response.data) : await this.handleApiError(response.error);
    });
  }

  selectDocumentCountry(countryCode: string): void {
    const country = countryFromCode(countryCode);
    this.result = { ...this.result, country };
    this.setEvent(
      {
        kind: 'documentSelection',
        country,
        documentTypes: documentTypesForFilter(
          commaSeparatedValues(this.result.sessionState?.acceptedDocumentType),
        ),
        selectedDocumentType: this.result.documentType,
      },
      true,
    );
  }

  async selectDocumentType(documentTypeCode: string): Promise<void> {
    const country = this.result.country;
    if (!country) {
      this.showLocalError('Please select country first.');
      return;
    }

    const documentType = documentTypeFromCode(documentTypeCode);
    if (!documentType) {
      this.showLocalError('Unsupported document type.');
      return;
    }

    this.result = { ...this.result, documentType };
    this.update((state) => ({ ...state, result: this.result, error: null }));

    if (!this.isEnabled()) {
      this.publishEventForStep({ kind: 'captureDocument' });
      return;
    }

    await this.withBusy(async () => {
      const response = await this.apiClient.saveDocumentSelection(
        country.code,
        documentType.apiTypeCode,
      );
      response.ok ? this.applySessionState(response.data) : await this.handleApiError(response.error);
    });
  }

  async uploadDocument(frontBase64: string, backBase64?: string | null): Promise<void> {
    this.result = {
      ...this.result,
      documentFrontBase64: frontBase64,
      documentBackBase64: backBase64 || null,
    };

    if (!this.isEnabled()) {
      this.currentStepIndex = this.nextWorkflowIndexAfter((step) => step.kind === 'captureDocument');
      this.publishLocalStep();
      return;
    }

    await this.withBusy(async () => {
      this.clearError();
      const response = await this.apiClient.uploadDocument(frontBase64, backBase64);
      response.ok ? this.applySessionState(response.data) : await this.handleApiError(response.error);
    });
  }

  async uploadFace(faceBase64List: string[]): Promise<void> {
    this.result = {
      ...this.result,
      faceBase64List,
      isFaceVerified: true,
    };

    if (!this.isEnabled()) {
      this.currentStepIndex = this.nextWorkflowIndexAfter((step) => step.kind === 'faceVerification');
      this.publishLocalStep();
      return;
    }

    await this.withBusy(async () => {
      this.clearError();
      const response = await this.apiClient.uploadFace(faceBase64List);
      response.ok ? this.applySessionState(response.data) : await this.handleApiError(response.error);
    });
  }

  async submitContract(signatures: Record<string, string>): Promise<void> {
    await this.withBusy(async () => {
      this.clearError();
      const response = await this.apiClient.submitContract(signatures);
      response.ok ? this.applySessionState(response.data) : await this.handleApiError(response.error);
    });
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
    this.apiClient.close();
  }

  private async runStart(): Promise<void> {
    this.update((state) => ({
      ...state,
      event: { kind: 'loading' },
      isBusy: this.isEnabled(),
      error: null,
      errorMessage: null,
      normalizedError: null,
    }));

    if (!this.isEnabled()) {
      this.publishLocalStep();
      return;
    }

    await this.refreshFromServer();
  }

  private async refreshFromServer(): Promise<void> {
    if (!this.isEnabled()) {
      this.publishLocalStep();
      return;
    }

    await this.withBusy(async () => {
      const response = await this.apiClient.getAction();
      response.ok ? this.applySessionState(response.data) : await this.handleApiError(response.error);
    });
  }

  private async withBusy(operation: () => Promise<void>): Promise<void> {
    if (this.closed) return;
    this.setBusy(true);
    await waitForUi();
    try {
      await operation();
    } finally {
      this.setBusy(false);
    }
  }

  private applySessionState(session: NonNullable<KYCResult['sessionState']>): void {
    const selectedCountry = session.selectedDocumentCountry
      ? this.result.country?.code.toUpperCase() === session.selectedDocumentCountry.toUpperCase()
        ? this.result.country
        : countryFromCode(session.selectedDocumentCountry)
      : null;
    const selectedDocumentType = documentTypeFromCode(session.selectedDocumentType);
    this.result = {
      ...this.result,
      country: selectedCountry || this.result.country,
      documentType: selectedDocumentType || this.result.documentType,
      serverTask: session.task,
      sessionId: session.sessionId,
      sessionState: session,
      terminalError: null,
    };
    this.phoneCodeSent = false;
    this.currentPhoneNumber = null;
    this.setEvent(this.eventForSessionState(session), true);
  }

  private async handleApiError(error: DocupassApiError): Promise<void> {
    const normalized = normalizeDocupassError(error);
    this.result = { ...this.result, terminalError: normalized };

    switch (normalized.action) {
      case 'showCompleted':
        this.setEvent({ kind: 'completed', result: this.result }, true);
        return;
      case 'showFailed':
        this.setEvent({ kind: 'failed', result: this.result, error: normalized }, true);
        return;
      case 'resyncSession':
        await this.refreshFromServer();
        return;
      default:
        this.setError({
          message: formatApiErrorMessage(error),
          normalized,
        });
    }
  }

  private eventForSessionState(session: NonNullable<KYCResult['sessionState']>): DocupassKycEvent {
    switch (session.task?.trim().toLowerCase()) {
      case 'phone':
        return {
          kind: 'phoneVerification',
          state: session,
          codeSent: this.phoneCodeSent,
          currentNumber: this.currentPhoneNumber,
        };
      case 'customform':
        return { kind: 'customForm', fields: session.customFields };
      case 'document':
        return this.eventForDocumentSession(session);
      case 'face':
        return {
          kind: 'faceVerification',
          actions: randomizedFaceActions(this.faceActionCandidates),
        };
      case 'contract':
        return {
          kind: 'contract',
          state: session,
          html: session.contractSource || '',
          signatureFields: extractContractSignatureFields(session.contractSource || ''),
        };
      case 'party_pending':
        return { kind: 'partyPending' };
      default:
        return { kind: 'completed', result: this.result };
    }
  }

  private eventForDocumentSession(session: NonNullable<KYCResult['sessionState']>): DocupassKycEvent {
    const selectedCountry = session.selectedDocumentCountry || this.result.country?.code;
    const selectedType = session.selectedDocumentType || this.result.documentType?.apiTypeCode;

    if (!selectedCountry) {
      const acceptedCountries = commaSeparatedValues(session.acceptedDocumentCountry);
      return {
        kind: 'documentCountrySelection',
        countries: countriesForFilter(acceptedCountries.length > 0 ? acceptedCountries : null),
        filterCodes: acceptedCountries.length > 0 ? acceptedCountries : null,
        selectedCountry: this.result.country,
      };
    }

    if (!selectedType) {
      const country =
        this.result.country?.code.toUpperCase() === selectedCountry.toUpperCase()
          ? this.result.country
          : countryFromCode(selectedCountry);
      this.result = { ...this.result, country };
      return {
        kind: 'documentSelection',
        country,
        documentTypes: documentTypesForFilter(commaSeparatedValues(session.acceptedDocumentType)),
        selectedDocumentType: this.result.documentType,
      };
    }

    return {
      kind: 'documentCapture',
      country: this.result.country,
      documentType: this.result.documentType,
      documentSide: session.documentSide,
      allowFileUpload: session.allowFileUpload,
    };
  }

  private publishLocalStep(): void {
    this.publishEventForStep(this.workflow[this.currentStepIndex] || { kind: 'success' });
  }

  private publishEventForStep(step: KYCStep): void {
    let event: DocupassKycEvent;
    switch (step.kind) {
      case 'phoneVerification':
        event = {
          kind: 'phoneVerification',
          state: step.state,
          codeSent: this.phoneCodeSent,
          currentNumber: this.currentPhoneNumber,
        };
        break;
      case 'customForm':
        event = { kind: 'customForm', fields: step.fields };
        break;
      case 'selectCountry':
        event = {
          kind: 'documentCountrySelection',
          countries: countriesForFilter(step.filterCodes),
          filterCodes: step.filterCodes || null,
          selectedCountry: this.result.country,
        };
        break;
      case 'selectDocument':
        event = this.result.country
          ? {
              kind: 'documentSelection',
              country: this.result.country,
              documentTypes: documentTypesForFilter(null),
              selectedDocumentType: this.result.documentType,
            }
          : {
              kind: 'documentCountrySelection',
              countries: countriesForFilter(null),
              filterCodes: null,
              selectedCountry: null,
            };
        break;
      case 'captureDocument':
        event = {
          kind: 'documentCapture',
          country: this.result.country,
          documentType: this.result.documentType,
          documentSide: null,
          allowFileUpload: false,
        };
        break;
      case 'faceVerification':
        event = { kind: 'faceVerification', actions: randomizedFaceActions(step.actions) };
        break;
      case 'contract':
        event = {
          kind: 'contract',
          state: step.state,
          html: step.state.contractSource || '',
          signatureFields: extractContractSignatureFields(step.state.contractSource || ''),
        };
        break;
      case 'partyPending':
        event = { kind: 'partyPending' };
        break;
      case 'success':
        event = { kind: 'completed', result: this.result };
        break;
      case 'failed':
        event = { kind: 'failed', result: this.result, error: step.error };
        break;
    }

    this.setEvent(event, true);
    this.setBusy(false);
  }

  private republishPhoneEvent(): void {
    const current = this.stateValue.event;
    if (current.kind !== 'phoneVerification') return;
    this.setEvent({
      ...current,
      codeSent: this.phoneCodeSent,
      currentNumber: this.currentPhoneNumber,
    });
  }

  private nextWorkflowIndexAfter(predicate: (step: KYCStep) => boolean): number {
    const current = this.workflow.findIndex(predicate);
    return Math.min((current >= 0 ? current : this.currentStepIndex) + 1, this.workflow.length);
  }

  private resetLocalState(): void {
    this.currentStepIndex = 0;
    this.result = createEmptyResult();
    this.phoneCodeSent = false;
    this.currentPhoneNumber = null;
    this.eventBackStack = [];
    this.stateValue = initialState();
    this.emit();
  }

  private goBack(): void {
    if (this.stateValue.isBusy) return;
    const previous = this.eventBackStack.pop();
    if (!previous) return;
    this.update((state) => ({
      ...state,
      event: previous,
      error: null,
      errorMessage: null,
      normalizedError: null,
    }));
  }

  private setEvent(event: DocupassKycEvent, recordHistory = false): void {
    const previous = this.stateValue.event;
    if (
      recordHistory &&
      !isSameEvent(previous, event) &&
      previous.kind !== 'loading' &&
      !isResultEvent(previous)
    ) {
      this.eventBackStack.push(previous);
    }

    if (isResultEvent(event)) {
      this.eventBackStack = [];
    }

    this.update((state) => ({
      ...state,
      event,
      result: this.result,
      error: null,
      errorMessage: null,
      normalizedError: null,
    }));
  }

  private setBusy(isBusy: boolean): void {
    this.update((state) => ({ ...state, isBusy }));
  }

  private setError(error: DocupassKycErrorEvent): void {
    this.update((state) => ({
      ...state,
      result: this.result,
      error,
      errorMessage: error.message,
      normalizedError: error.normalized || null,
    }));
  }

  private showLocalError(message: string): void {
    this.setError({ message, normalized: null });
  }

  private update(mutator: (state: DocupassKycUiState) => DocupassKycUiState): void {
    if (this.closed) return;
    const next = mutator(this.stateValue);
    this.stateValue = {
      ...next,
      canGoBack: this.eventBackStack.length > 0 && !isResultEvent(next.event),
    };
    this.emit();
  }

  private emit(): void {
    if (this.closed) return;
    for (const listener of this.listeners) {
      listener(this.stateValue);
    }
  }

  private isEnabled(): boolean {
    return this.config.enabled !== false;
  }
}

function waitForUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 32);
  });
}

export function initialState(): DocupassKycUiState {
  return {
    event: { kind: 'loading' },
    result: createEmptyResult(),
    isBusy: false,
    canGoBack: false,
    error: null,
    errorMessage: null,
    normalizedError: null,
  };
}
