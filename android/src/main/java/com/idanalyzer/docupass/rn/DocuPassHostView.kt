package com.idanalyzer.docupass.rn

import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.AbstractComposeView
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.idanalyzer.docupass.DocuPassConfig
import com.idanalyzer.docupass.DocuPassResult
import com.idanalyzer.docupass.ui.DocuPassStrings
import com.idanalyzer.docupass.ui.DocuPassTheme
import com.idanalyzer.docupass.ui.DocuPassView
import com.idanalyzer.docupass.ui.withOverrides

/**
 * Hosts the native Compose [DocuPassView] inside a React Native view and emits
 * `onResult` back to JS. Props are applied via [DocuPassViewManager]; the flow
 * starts once a non-blank `reference` is set.
 */
class DocuPassHostView(private val reactContext: ThemedReactContext) : AbstractComposeView(reactContext) {

    var reference: String? = null
    var partyId: String? = null
    var baseUrl: String? = null
    var brandColor: String? = null
    var logoUrl: String? = null
    var labels: Map<String, String> = emptyMap()

    private var config by mutableStateOf<DocuPassConfig?>(null)
    private var strings by mutableStateOf(DocuPassStrings())
    private var theme by mutableStateOf(DocuPassTheme())

    /** Build/refresh config + customization from the current props (call after props change). */
    fun applyProps() {
        val ref = reference?.takeIf { it.isNotBlank() } ?: return
        config = DocuPassConfig(reference = ref, partyId = partyId, baseUrlOverride = baseUrl)
        strings = DocuPassStrings().withOverrides(labels)
        theme = DocuPassTheme(
            primaryColor = brandColor?.takeIf { it.isNotBlank() }
                ?.let { runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull() },
            logoUrl = logoUrl?.takeIf { it.isNotBlank() },
        )
    }

    @Composable
    override fun Content() {
        val cfg = config ?: return
        DocuPassView(config = cfg, strings = strings, theme = theme, onResult = ::emitResult)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        // Compose hosted outside an Activity content view needs the ViewTree owners.
        (reactContext.currentActivity as? ComponentActivity)?.let { activity ->
            setViewTreeLifecycleOwner(activity)
            setViewTreeViewModelStoreOwner(activity)
            setViewTreeSavedStateRegistryOwner(activity)
        }
    }

    private fun emitResult(result: DocuPassResult) {
        val map: WritableMap = Arguments.createMap()
        when (result) {
            is DocuPassResult.Completed -> {
                map.putString("status", "completed")
                map.putString("reference", result.reference)
                result.code?.let { map.putString("code", it) }
                result.redirectUrl?.let { map.putString("redirectUrl", it) }
            }
            is DocuPassResult.Failed -> {
                map.putString("status", "failed")
                map.putString("reference", result.reference)
                result.code?.let { map.putString("code", it) }
                result.message?.let { map.putString("message", it) }
                result.redirectUrl?.let { map.putString("redirectUrl", it) }
            }
            is DocuPassResult.Cancelled -> {
                map.putString("status", "cancelled")
                map.putString("reference", result.reference)
            }
            is DocuPassResult.Error -> {
                map.putString("status", "error")
                map.putString("reference", result.reference)
                result.error.code?.let { map.putString("code", it) }
                result.error.message?.let { map.putString("message", it) }
            }
        }
        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, "onResult", map)
    }
}
