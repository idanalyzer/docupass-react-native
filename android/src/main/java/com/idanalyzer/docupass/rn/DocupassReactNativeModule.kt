package com.idanalyzer.docupass.rn

import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.idanalyzer.docupass.DocupassApiConfig
import com.idanalyzer.docupass.DocupassContractPayload
import com.idanalyzer.docupass.DocupassContractSignatureField
import com.idanalyzer.docupass.DocupassCustomField
import com.idanalyzer.docupass.DocupassDocumentCapturePayload
import com.idanalyzer.docupass.DocupassDocumentCountrySelectionPayload
import com.idanalyzer.docupass.DocupassDocumentSelectionPayload
import com.idanalyzer.docupass.DocupassFaceVerificationPayload
import com.idanalyzer.docupass.DocupassFailedPayload
import com.idanalyzer.docupass.DocupassKycEventKind
import com.idanalyzer.docupass.DocupassKycListener
import com.idanalyzer.docupass.DocupassKycNativeState
import com.idanalyzer.docupass.DocupassKycSession
import com.idanalyzer.docupass.DocupassNormalizedError
import com.idanalyzer.docupass.DocupassPhoneCountryCode
import com.idanalyzer.docupass.DocupassPhoneVerificationPayload
import com.idanalyzer.docupass.DocupassSessionState
import com.idanalyzer.docupass.DocupassSubscription
import com.idanalyzer.docupass.KYCAction
import com.idanalyzer.docupass.KYCCountry
import com.idanalyzer.docupass.KYCDocumentType
import com.idanalyzer.docupass.KYCResult
import com.idanalyzer.docupass.resolveDocupassEndpoint
import java.io.FileInputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

private data class SessionBox(
    val session: DocupassKycSession,
    var subscription: DocupassSubscription? = null
)

class DocupassReactNativeModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
    private val sessions = ConcurrentHashMap<String, SessionBox>()

    override fun getName(): String = "DocupassReactNative"

    @ReactMethod
    fun addListener(eventName: String) {
        // Required by NativeEventEmitter.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required by NativeEventEmitter.
    }

    @ReactMethod
    fun createSession(config: ReadableMap, promise: Promise) {
        val reference = config.getOptionalString("reference")?.trim()
        if (reference.isNullOrBlank()) {
            promise.reject("docupass_invalid_reference", "DocuPass reference is required.")
            return
        }

        val id = UUID.randomUUID().toString()
        val session = DocupassKycSession(makeApiConfig(config, reference))
        val box = SessionBox(session)
        box.subscription = session.subscribe(object : DocupassKycListener {
            override fun onStateChanged(state: DocupassKycNativeState) {
                emitState(id, state)
            }
        })
        sessions[id] = box
        promise.resolve(id)
        emitState(id, session.currentState())
    }

    @ReactMethod
    fun currentState(sessionId: String, promise: Promise) {
        val box = sessions[sessionId]
        if (box == null) {
            promise.reject("docupass_session_not_found", "DocuPass session not found.")
            return
        }
        promise.resolve(mapState(box.session.currentState()))
    }

    @ReactMethod
    fun start(sessionId: String, promise: Promise) = withSession(sessionId, promise) { it.start() }

    @ReactMethod
    fun refresh(sessionId: String, promise: Promise) = withSession(sessionId, promise) { it.refresh() }

    @ReactMethod
    fun back(sessionId: String, promise: Promise) = withSession(sessionId, promise) { it.back() }

    @ReactMethod
    fun clearError(sessionId: String, promise: Promise) = withSession(sessionId, promise) { it.clearError() }

    @ReactMethod
    fun restart(sessionId: String, promise: Promise) = withSession(sessionId, promise) { it.restart() }

    @ReactMethod
    fun sendPhoneCode(sessionId: String, number: String?, type: String, promise: Promise) {
        withSession(sessionId, promise) { it.sendPhoneCode(number, type) }
    }

    @ReactMethod
    fun verifyPhoneCode(sessionId: String, number: String?, code: String, promise: Promise) {
        withSession(sessionId, promise) { it.verifyPhoneCode(number, code) }
    }

    @ReactMethod
    fun saveCustomForm(sessionId: String, answers: ReadableMap, promise: Promise) {
        withSession(sessionId, promise) { it.saveCustomForm(answers.toStringMap()) }
    }

    @ReactMethod
    fun selectDocumentCountry(sessionId: String, countryCode: String, promise: Promise) {
        withSession(sessionId, promise) { it.selectDocumentCountry(countryCode) }
    }

    @ReactMethod
    fun selectDocumentType(sessionId: String, documentTypeCode: String, promise: Promise) {
        withSession(sessionId, promise) { it.selectDocumentType(documentTypeCode) }
    }

    @ReactMethod
    fun uploadDocument(sessionId: String, frontBase64: String, backBase64: String?, promise: Promise) {
        withSession(sessionId, promise) { it.uploadDocument(frontBase64, backBase64) }
    }

    @ReactMethod
    fun uploadFace(sessionId: String, faceBase64List: ReadableArray, promise: Promise) {
        withSession(sessionId, promise) { it.uploadFace(faceBase64List.toStringList()) }
    }

    @ReactMethod
    fun submitContract(sessionId: String, signatures: ReadableMap, promise: Promise) {
        withSession(sessionId, promise) { it.submitContract(signatures.toStringMap()) }
    }

    @ReactMethod
    fun closeSession(sessionId: String, promise: Promise) {
        val box = sessions.remove(sessionId)
        box?.subscription?.close()
        box?.session?.close()
        promise.resolve(null)
    }

    @ReactMethod
    fun readFileAsBase64(uri: String, promise: Promise) {
        try {
            val bytes = if (uri.startsWith("content://")) {
                reactContext.contentResolver.openInputStream(Uri.parse(uri))?.use { it.readBytes() }
                    ?: throw IllegalArgumentException("Unable to open content URI.")
            } else {
                val path = if (uri.startsWith("file://")) Uri.parse(uri).path.orEmpty() else uri
                FileInputStream(path).use { it.readBytes() }
            }
            promise.resolve(Base64.encodeToString(bytes, Base64.NO_WRAP))
        } catch (error: Throwable) {
            promise.reject("docupass_file_read_failed", "Unable to read image file as base64.", error)
        }
    }

    private fun withSession(sessionId: String, promise: Promise, block: (DocupassKycSession) -> Unit) {
        val box = sessions[sessionId]
        if (box == null) {
            promise.reject("docupass_session_not_found", "DocuPass session not found.")
            return
        }
        block(box.session)
        promise.resolve(null)
    }

    private fun emitState(sessionId: String, state: DocupassKycNativeState) {
        val event = Arguments.createMap()
        event.putString("sessionId", sessionId)
        event.putMap("state", mapState(state))
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("DocuPassKycStateChanged", event)
    }
}

private fun makeApiConfig(config: ReadableMap, reference: String): DocupassApiConfig {
    val timeoutMs = config.getOptionalInt("connectTimeoutMs")
        ?: config.getOptionalDouble("timeout")?.let { (it * 1000).toInt() }
        ?: 20_000
    val readTimeoutMs = config.getOptionalInt("readTimeoutMs")
        ?: config.getOptionalDouble("timeout")?.let { (it * 1000).toInt() }
        ?: 20_000

    return DocupassApiConfig(
        enabled = config.getOptionalBoolean("enabled") ?: true,
        baseUrl = config.getOptionalString("baseUrl") ?: resolveDocupassEndpoint(reference),
        reference = reference,
        partyId = config.getOptionalString("partyId"),
        sessionId = config.getOptionalString("sessionId"),
        authorization = config.getOptionalString("authorization"),
        geolocation = config.getOptionalString("geolocation"),
        disableSslValidation = config.getOptionalBoolean("disableSslValidation")
            ?: config.getOptionalBoolean("disableSSLValidation")
            ?: false,
        connectTimeoutMs = timeoutMs,
        readTimeoutMs = readTimeoutMs
    )
}

private fun mapState(state: DocupassKycNativeState): WritableMap {
    val map = Arguments.createMap()
    map.putString("event", state.event.toEventName())
    map.putBoolean("isBusy", state.isBusy)
    map.putBoolean("canGoBack", state.canGoBack)
    map.putMap("result", mapResult(state.result))
    state.errorMessage?.let { map.putString("errorMessage", it) }
    state.normalizedError?.let { map.putMap("normalizedError", mapError(it)) }
    state.phone?.let { map.putMap("phone", mapPhone(it)) }
    state.customForm?.let { payload ->
        val customForm = Arguments.createMap()
        customForm.putArray("fields", payload.fields.toWritableArray(::mapCustomField))
        map.putMap("customForm", customForm)
    }
    state.documentCountrySelection?.let { map.putMap("documentCountrySelection", mapDocumentCountrySelection(it)) }
    state.documentSelection?.let { map.putMap("documentSelection", mapDocumentSelection(it)) }
    state.documentCapture?.let { map.putMap("documentCapture", mapDocumentCapture(it)) }
    state.face?.let { map.putMap("face", mapFace(it)) }
    state.contract?.let { map.putMap("contract", mapContract(it)) }
    state.completed?.let {
        val completed = Arguments.createMap()
        completed.putMap("result", mapResult(it.result))
        map.putMap("completed", completed)
    }
    state.failed?.let { map.putMap("failed", mapFailed(it)) }
    return map
}

private fun mapPhone(payload: DocupassPhoneVerificationPayload): WritableMap {
    val map = Arguments.createMap()
    map.putMap("state", mapSessionState(payload.state))
    map.putBoolean("codeSent", payload.codeSent)
    payload.currentNumber?.let { map.putString("currentNumber", it) }
    return map
}

private fun mapDocumentCountrySelection(payload: DocupassDocumentCountrySelectionPayload): WritableMap {
    val map = Arguments.createMap()
    map.putArray("countries", payload.countries.toWritableArray(::mapCountry))
    payload.selectedCountry?.let { map.putMap("selectedCountry", mapCountry(it)) }
    return map
}

private fun mapDocumentSelection(payload: DocupassDocumentSelectionPayload): WritableMap {
    val map = Arguments.createMap()
    map.putMap("country", mapCountry(payload.country))
    map.putArray("documentTypes", payload.documentTypes.toWritableArray(::mapDocumentType))
    payload.selectedDocumentType?.let { map.putMap("selectedDocumentType", mapDocumentType(it)) }
    return map
}

private fun mapDocumentCapture(payload: DocupassDocumentCapturePayload): WritableMap {
    val map = Arguments.createMap()
    payload.country?.let { map.putMap("country", mapCountry(it)) }
    payload.documentType?.let { map.putMap("documentType", mapDocumentType(it)) }
    payload.documentSide?.let { map.putInt("documentSide", it) }
    map.putBoolean("allowFileUpload", payload.allowFileUpload)
    return map
}

private fun mapFace(payload: DocupassFaceVerificationPayload): WritableMap {
    val map = Arguments.createMap()
    val actions = Arguments.createArray()
    payload.actions.forEach { actions.pushString(it.toActionName()) }
    map.putArray("actions", actions)
    return map
}

private fun mapContract(payload: DocupassContractPayload): WritableMap {
    val map = Arguments.createMap()
    map.putMap("state", mapSessionState(payload.state))
    map.putString("html", payload.html)
    map.putArray("signatureFields", payload.signatureFields.toWritableArray(::mapSignatureField))
    return map
}

private fun mapFailed(payload: DocupassFailedPayload): WritableMap {
    val map = Arguments.createMap()
    map.putMap("result", mapResult(payload.result))
    payload.error?.let { map.putMap("error", mapError(it)) }
    return map
}

private fun mapResult(result: KYCResult): WritableMap {
    val map = Arguments.createMap()
    result.country?.let { map.putMap("country", mapCountry(it)) }
    result.documentType?.let { map.putMap("documentType", mapDocumentType(it)) }
    result.documentFrontBase64?.let { map.putString("documentFrontBase64", it) }
    result.documentBackBase64?.let { map.putString("documentBackBase64", it) }
    val faces = Arguments.createArray()
    result.faceBase64List.forEach { faces.pushString(it) }
    map.putArray("faceBase64List", faces)
    map.putBoolean("isFaceVerified", result.isFaceVerified)
    result.serverTask?.let { map.putString("serverTask", it) }
    result.sessionId?.let { map.putString("sessionId", it) }
    result.sessionState?.let { map.putMap("sessionState", mapSessionState(it)) }
    result.terminalError?.let { map.putMap("terminalError", mapError(it)) }
    return map
}

private fun mapSessionState(state: DocupassSessionState): WritableMap {
    val map = Arguments.createMap()
    map.putBoolean("success", state.success)
    state.sessionId?.let { map.putString("sessionId", it) }
    state.task?.let { map.putString("task", it) }
    state.reference?.let { map.putString("reference", it) }
    state.acceptedDocumentCountry?.let { map.putString("acceptedDocumentCountry", it) }
    state.acceptedDocumentType?.let { map.putString("acceptedDocumentType", it) }
    state.selectedDocumentCountry?.let { map.putString("selectedDocumentCountry", it) }
    state.selectedDocumentType?.let { map.putString("selectedDocumentType", it) }
    map.putBoolean("allowFileUpload", state.allowFileUpload)
    map.putInt("documentSide", state.documentSide)
    map.putBoolean("gps", state.gps)
    map.putBoolean("reviewData", state.reviewData)
    state.logoUrl?.let { map.putString("logoUrl", it) }
    state.companyName?.let { map.putString("companyName", it) }
    state.welcomeMessage?.let { map.putString("welcomeMessage", it) }
    state.language?.let { map.putString("language", it) }
    state.userPhone?.let { map.putString("userPhone", it) }
    map.putBoolean("hasFaceFile", state.hasFaceFile)
    map.putBoolean("hasDocumentFile", state.hasDocumentFile)
    state.verifyDocumentNo?.let { map.putString("verifyDocumentNo", it) }
    state.verifyName?.let { map.putString("verifyName", it) }
    state.verifyDob?.let { map.putString("verifyDob", it) }
    state.verifyAge?.let { map.putString("verifyAge", it) }
    state.verifyAddress?.let { map.putString("verifyAddress", it) }
    state.verifyPostcode?.let { map.putString("verifyPostcode", it) }
    map.putBoolean("preloadFaceLib", state.preloadFaceLib)
    state.contractSource?.let { map.putString("contractSource", it) }
    map.putArray("customFields", state.customFields.toWritableArray(::mapCustomField))
    map.putArray("phoneCountryCodes", state.phoneCountryCodes.toWritableArray(::mapPhoneCountryCode))
    map.putString("rawJson", state.rawJson)
    return map
}

private fun mapCountry(country: KYCCountry): WritableMap {
    val map = Arguments.createMap()
    map.putString("code", country.code)
    map.putString("name", country.name)
    map.putString("flag", country.flag)
    return map
}

private fun mapDocumentType(type: KYCDocumentType): WritableMap {
    val map = Arguments.createMap()
    map.putString("code", type.apiTypeCode)
    map.putString("apiTypeCode", type.apiTypeCode)
    map.putString("label", type.label)
    map.putBoolean("requiresBackSide", type.requiresBackSide)
    return map
}

private fun mapCustomField(field: DocupassCustomField): WritableMap {
    val map = Arguments.createMap()
    map.putString("fieldId", field.fieldId)
    map.putString("fieldLabel", field.fieldLabel)
    map.putString("fieldDescription", field.fieldDescription)
    map.putInt("fieldType", field.fieldType)
    map.putString("fieldData", field.fieldData)
    return map
}

private fun mapPhoneCountryCode(code: DocupassPhoneCountryCode): WritableMap {
    val map = Arguments.createMap()
    map.putString("name", code.name)
    map.putString("dialCode", code.dialCode)
    map.putString("code", code.code)
    return map
}

private fun mapSignatureField(field: DocupassContractSignatureField): WritableMap {
    val map = Arguments.createMap()
    map.putString("uid", field.uid)
    map.putString("label", field.label)
    field.party?.let { map.putString("party", it) }
    return map
}

private fun mapError(error: DocupassNormalizedError): WritableMap {
    val map = Arguments.createMap()
    error.code?.let { map.putString("code", it) }
    error.subCode?.let { map.putString("subCode", it) }
    map.putString("title", error.title)
    map.putString("detail", error.detail)
    map.putString("suggestion", error.suggestion)
    map.putString("action", error.action.name.toLowerCamel())
    map.putArray("warningCodes", error.warningCodes.toWritableStringArray())
    error.httpStatus?.let { map.putInt("httpStatus", it) }
    error.rawMessage?.let { map.putString("rawMessage", it) }
    error.rawBody?.let { map.putString("rawBody", it) }
    map.putString("displayMessage", error.toDisplayMessage())
    return map
}

private fun DocupassKycEventKind.toEventName(): String = when (this) {
    DocupassKycEventKind.LOADING -> "loading"
    DocupassKycEventKind.PHONE_VERIFICATION -> "phoneVerification"
    DocupassKycEventKind.CUSTOM_FORM -> "customForm"
    DocupassKycEventKind.DOCUMENT_COUNTRY_SELECTION -> "documentCountrySelection"
    DocupassKycEventKind.DOCUMENT_SELECTION -> "documentSelection"
    DocupassKycEventKind.DOCUMENT_CAPTURE -> "documentCapture"
    DocupassKycEventKind.FACE_VERIFICATION -> "faceVerification"
    DocupassKycEventKind.CONTRACT -> "contract"
    DocupassKycEventKind.PARTY_PENDING -> "partyPending"
    DocupassKycEventKind.COMPLETED -> "completed"
    DocupassKycEventKind.FAILED -> "failed"
}

private fun KYCAction.toActionName(): String = when (this) {
    KYCAction.TURN_LEFT -> "turnLeft"
    KYCAction.TURN_RIGHT -> "turnRight"
    KYCAction.TURN_UP -> "turnUp"
    KYCAction.MOUTH_OPEN -> "mouthOpen"
}

private fun String.toLowerCamel(): String {
    val parts = lowercase().split("_")
    return parts.first() + parts.drop(1).joinToString("") { part ->
        part.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
    }
}

private fun ReadableMap.getOptionalString(key: String): String? =
    if (hasKey(key) && !isNull(key)) getString(key) else null

private fun ReadableMap.getOptionalBoolean(key: String): Boolean? =
    if (hasKey(key) && !isNull(key)) getBoolean(key) else null

private fun ReadableMap.getOptionalDouble(key: String): Double? =
    if (hasKey(key) && !isNull(key)) getDouble(key) else null

private fun ReadableMap.getOptionalInt(key: String): Int? =
    if (hasKey(key) && !isNull(key)) getInt(key) else null

private fun ReadableMap.toStringMap(): Map<String, String> {
    val result = mutableMapOf<String, String>()
    val iterator = keySetIterator()
    while (iterator.hasNextKey()) {
        val key = iterator.nextKey()
        if (!isNull(key)) {
            getString(key)?.let { result[key] = it }
        }
    }
    return result
}

private fun ReadableArray.toStringList(): List<String> {
    val result = mutableListOf<String>()
    for (index in 0 until size()) {
        getString(index)?.let { result += it }
    }
    return result
}

private fun <T> List<T>.toWritableArray(mapper: (T) -> WritableMap): WritableArray {
    val array = Arguments.createArray()
    forEach { array.pushMap(mapper(it)) }
    return array
}

private fun List<String>.toWritableStringArray(): WritableArray {
    val array = Arguments.createArray()
    forEach { array.pushString(it) }
    return array
}
