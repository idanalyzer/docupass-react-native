import Foundation
import DocuPass

private final class DocupassSessionBox {
    let session: DocupassKycSession
    var subscription: DocupassSubscription?

    init(session: DocupassKycSession) {
        self.session = session
    }
}

@objc(DocupassNativeKycEngine)
final class DocupassNativeKycEngine: NSObject {
    @objc var onStateChanged: ((NSDictionary) -> Void)?
    private var sessions: [String: DocupassSessionBox] = [:]

    @objc(createSession:resolve:reject:)
    func createSession(_ config: NSDictionary, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        Task { @MainActor in
            guard let reference = string(config, "reference"), !reference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                reject("docupass_invalid_reference", "DocuPass reference is required.")
                return
            }

            let sessionId = UUID().uuidString
            let apiConfig = makeApiConfig(config, reference: reference)
            let session = DocupassKycSession(config: apiConfig)
            let box = DocupassSessionBox(session: session)
            box.subscription = session.subscribe { [weak self] state in
                self?.emitState(sessionId: sessionId, state: state)
            }
            sessions[sessionId] = box
            resolve(sessionId)
            emitState(sessionId: sessionId, state: session.currentState)
        }
    }

    @objc(currentState:resolve:reject:)
    func currentState(_ sessionId: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        Task { @MainActor in
            guard let box = sessions[sessionId] else {
                reject("docupass_session_not_found", "DocuPass session not found.")
                return
            }
            resolve(mapState(box.session.currentState))
        }
    }

    @objc(start:resolve:reject:)
    func start(_ sessionId: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        withSession(sessionId, resolve: resolve, reject: reject) { $0.session.start() }
    }

    @objc(refresh:resolve:reject:)
    func refresh(_ sessionId: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        withSession(sessionId, resolve: resolve, reject: reject) { $0.session.refresh() }
    }

    @objc(back:resolve:reject:)
    func back(_ sessionId: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        withSession(sessionId, resolve: resolve, reject: reject) { $0.session.back() }
    }

    @objc(clearError:resolve:reject:)
    func clearError(_ sessionId: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        withSession(sessionId, resolve: resolve, reject: reject) { $0.session.clearError() }
    }

    @objc(restart:resolve:reject:)
    func restart(_ sessionId: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        withSession(sessionId, resolve: resolve, reject: reject) { $0.session.restart() }
    }

    @objc(sendPhoneCode:number:type:resolve:reject:)
    func sendPhoneCode(_ sessionId: String, number: String?, type: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        withSession(sessionId, resolve: resolve, reject: reject) { $0.session.sendPhoneCode(number: number, type: type) }
    }

    @objc(verifyPhoneCode:number:code:resolve:reject:)
    func verifyPhoneCode(_ sessionId: String, number: String?, code: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        withSession(sessionId, resolve: resolve, reject: reject) { $0.session.verifyPhoneCode(number: number, code: code) }
    }

    @objc(saveCustomForm:answers:resolve:reject:)
    func saveCustomForm(_ sessionId: String, answers: NSDictionary, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        withSession(sessionId, resolve: resolve, reject: reject) { $0.session.saveCustomForm(answers: stringMap(answers)) }
    }

    @objc(selectDocumentCountry:countryCode:resolve:reject:)
    func selectDocumentCountry(_ sessionId: String, countryCode: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        withSession(sessionId, resolve: resolve, reject: reject) { $0.session.selectDocumentCountry(countryCode) }
    }

    @objc(selectDocumentType:documentTypeCode:resolve:reject:)
    func selectDocumentType(_ sessionId: String, documentTypeCode: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        withSession(sessionId, resolve: resolve, reject: reject) { $0.session.selectDocumentType(documentTypeCode) }
    }

    @objc(uploadDocument:frontBase64:backBase64:resolve:reject:)
    func uploadDocument(_ sessionId: String, frontBase64: String, backBase64: String?, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        withSession(sessionId, resolve: resolve, reject: reject) { $0.session.uploadDocument(frontBase64: frontBase64, backBase64: backBase64) }
    }

    @objc(uploadFace:faceBase64List:resolve:reject:)
    func uploadFace(_ sessionId: String, faceBase64List: [String], resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        withSession(sessionId, resolve: resolve, reject: reject) { $0.session.uploadFace(faceBase64List) }
    }

    @objc(submitContract:signatures:resolve:reject:)
    func submitContract(_ sessionId: String, signatures: NSDictionary, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        withSession(sessionId, resolve: resolve, reject: reject) { $0.session.submitContract(stringMap(signatures)) }
    }

    @objc(closeSession:resolve:reject:)
    func closeSession(_ sessionId: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        Task { @MainActor in
            if let box = sessions.removeValue(forKey: sessionId) {
                box.subscription?.close()
                box.session.close()
            }
            resolve(NSNull())
        }
    }

    @objc(readFileAsBase64:resolve:reject:)
    func readFileAsBase64(_ uri: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        do {
            let url: URL
            if uri.hasPrefix("file://"), let parsed = URL(string: uri) {
                url = parsed
            } else {
                url = URL(fileURLWithPath: uri)
            }
            let data = try Data(contentsOf: url)
            resolve(data.base64EncodedString())
        } catch {
            reject("docupass_file_read_failed", "Unable to read image file as base64.")
        }
    }

    private func withSession(_ sessionId: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void, block: @escaping @MainActor (DocupassSessionBox) -> Void) {
        Task { @MainActor in
            guard let box = sessions[sessionId] else {
                reject("docupass_session_not_found", "DocuPass session not found.")
                return
            }
            block(box)
            resolve(NSNull())
        }
    }

    private func emitState(sessionId: String, state: DocupassKycUiState) {
        onStateChanged?([
            "sessionId": sessionId,
            "state": mapState(state)
        ] as NSDictionary)
    }
}

private func makeApiConfig(_ config: NSDictionary, reference: String) -> DocupassApiConfig {
    let baseURL = string(config, "baseUrl") ?? string(config, "baseURL") ?? resolveDocupassEndpoint(reference)
    let timeout = double(config, "timeout") ?? 20
    return DocupassApiConfig(
        enabled: bool(config, "enabled") ?? true,
        baseURL: baseURL,
        reference: reference,
        partyId: string(config, "partyId"),
        sessionId: string(config, "sessionId"),
        authorization: string(config, "authorization"),
        geolocation: string(config, "geolocation"),
        disableSSLValidation: bool(config, "disableSSLValidation") ?? bool(config, "disableSslValidation") ?? false,
        timeout: timeout
    )
}

private func string(_ dict: NSDictionary, _ key: String) -> String? {
    let value = dict[key]
    if let string = value as? String, !string.isEmpty {
        return string
    }
    return nil
}

private func bool(_ dict: NSDictionary, _ key: String) -> Bool? {
    if let value = dict[key] as? Bool {
        return value
    }
    if let value = dict[key] as? NSNumber {
        return value.boolValue
    }
    return nil
}

private func double(_ dict: NSDictionary, _ key: String) -> Double? {
    if let value = dict[key] as? Double {
        return value
    }
    if let value = dict[key] as? NSNumber {
        return value.doubleValue
    }
    return nil
}

private func stringMap(_ dict: NSDictionary) -> [String: String] {
    var result: [String: String] = [:]
    dict.forEach { key, value in
        if let key = key as? String, let value = value as? String {
            result[key] = value
        }
    }
    return result
}

private func mapState(_ state: DocupassKycUiState) -> [String: Any] {
    var body: [String: Any] = [
        "isBusy": state.isBusy,
        "canGoBack": state.canGoBack,
        "result": mapResult(state.result)
    ]

    if let error = state.error {
        body["errorMessage"] = error.message
        if let normalized = error.normalized {
            body["normalizedError"] = mapError(normalized)
        }
    }

    switch state.event {
    case .loading:
        body["event"] = "loading"
    case let .phoneVerification(sessionState, codeSent, currentNumber):
        body["event"] = "phoneVerification"
        body["phone"] = compact([
            "state": mapSessionState(sessionState),
            "codeSent": codeSent,
            "currentNumber": currentNumber
        ])
    case let .customForm(fields):
        body["event"] = "customForm"
        body["customForm"] = ["fields": fields.map(mapCustomField)]
    case let .documentCountrySelection(countries, selectedCountry):
        body["event"] = "documentCountrySelection"
        body["documentCountrySelection"] = compact([
            "countries": countries.map(mapCountry),
            "selectedCountry": selectedCountry.map(mapCountry)
        ])
    case let .documentSelection(country, documentTypes, selectedDocumentType):
        body["event"] = "documentSelection"
        body["documentSelection"] = compact([
            "country": mapCountry(country),
            "documentTypes": documentTypes.map(mapDocumentType),
            "selectedDocumentType": selectedDocumentType.map(mapDocumentType)
        ])
    case let .documentCapture(country, documentType, documentSide, allowFileUpload):
        body["event"] = "documentCapture"
        body["documentCapture"] = compact([
            "country": country.map(mapCountry),
            "documentType": documentType.map(mapDocumentType),
            "documentSide": documentSide,
            "allowFileUpload": allowFileUpload
        ])
    case let .faceVerification(actions):
        body["event"] = "faceVerification"
        body["face"] = ["actions": actions.map { $0.rawValue }]
    case let .contract(sessionState, html, signatureFields):
        body["event"] = "contract"
        body["contract"] = [
            "state": mapSessionState(sessionState),
            "html": html,
            "signatureFields": signatureFields.map(mapSignatureField)
        ]
    case .partyPending:
        body["event"] = "partyPending"
    case let .completed(result):
        body["event"] = "completed"
        body["completed"] = ["result": mapResult(result)]
    case let .failed(result, error):
        body["event"] = "failed"
        body["failed"] = compact([
            "result": mapResult(result),
            "error": error.map(mapError)
        ])
    }

    return body
}

private func mapResult(_ result: KYCResult) -> [String: Any] {
    compact([
        "country": result.country.map(mapCountry),
        "documentType": result.documentType.map(mapDocumentType),
        "documentFrontBase64": result.documentFrontBase64,
        "documentBackBase64": result.documentBackBase64,
        "faceBase64List": result.faceBase64List,
        "isFaceVerified": result.isFaceVerified,
        "serverTask": result.serverTask,
        "sessionId": result.sessionId,
        "sessionState": result.sessionState.map(mapSessionState),
        "terminalError": result.terminalError.map(mapError)
    ])
}

private func mapSessionState(_ state: DocupassSessionState) -> [String: Any] {
    compact([
        "success": state.success,
        "sessionId": state.sessionId,
        "task": state.task,
        "reference": state.reference,
        "acceptedDocumentCountry": state.acceptedDocumentCountry,
        "acceptedDocumentType": state.acceptedDocumentType,
        "selectedDocumentCountry": state.selectedDocumentCountry,
        "selectedDocumentType": state.selectedDocumentType,
        "allowFileUpload": state.allowFileUpload,
        "documentSide": state.documentSide,
        "gps": state.gps,
        "reviewData": state.reviewData,
        "logoUrl": state.logoURL,
        "companyName": state.companyName,
        "welcomeMessage": state.welcomeMessage,
        "language": state.language,
        "userPhone": state.userPhone,
        "hasFaceFile": state.hasFaceFile,
        "hasDocumentFile": state.hasDocumentFile,
        "verifyDocumentNo": state.verifyDocumentNo,
        "verifyName": state.verifyName,
        "verifyDob": state.verifyDob,
        "verifyAge": state.verifyAge,
        "verifyAddress": state.verifyAddress,
        "verifyPostcode": state.verifyPostcode,
        "preloadFaceLib": state.preloadFaceLib,
        "contractSource": state.contractSource,
        "customFields": state.customFields.map(mapCustomField),
        "phoneCountryCodes": state.phoneCountryCodes.map(mapPhoneCountryCode),
        "rawJson": state.rawJSON
    ])
}

private func mapCountry(_ country: KYCCountry) -> [String: Any] {
    compact([
        "code": country.code,
        "name": country.name,
        "flag": country.flag
    ])
}

private func mapDocumentType(_ type: KYCDocumentType) -> [String: Any] {
    [
        "code": type.rawValue,
        "apiTypeCode": type.apiTypeCode,
        "label": type.label,
        "requiresBackSide": type.requiresBackSide
    ]
}

private func mapCustomField(_ field: DocupassCustomField) -> [String: Any] {
    [
        "fieldId": field.fieldId,
        "fieldLabel": field.fieldLabel,
        "fieldDescription": field.fieldDescription,
        "fieldType": field.fieldType,
        "fieldData": field.fieldData
    ]
}

private func mapPhoneCountryCode(_ code: DocupassPhoneCountryCode) -> [String: Any] {
    [
        "name": code.name,
        "dialCode": code.dialCode,
        "code": code.code
    ]
}

private func mapSignatureField(_ field: DocupassContractSignatureField) -> [String: Any] {
    compact([
        "uid": field.uid,
        "label": field.label,
        "party": field.party
    ])
}

private func mapError(_ error: DocupassNormalizedError) -> [String: Any] {
    compact([
        "code": error.code,
        "subCode": error.subCode,
        "title": error.title,
        "detail": error.detail,
        "suggestion": error.suggestion,
        "action": error.action.rawValue,
        "warningCodes": error.warningCodes,
        "httpStatus": error.httpStatus,
        "rawMessage": error.rawMessage,
        "rawBody": error.rawBody,
        "displayMessage": error.displayMessage()
    ])
}

private func compact(_ values: [String: Any?]) -> [String: Any] {
    var result: [String: Any] = [:]
    values.forEach { key, value in
        if let value {
            result[key] = value
        }
    }
    return result
}
