package com.idanalyzer.docupass.rn

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class DocuPassViewManager : SimpleViewManager<DocuPassHostView>() {

    override fun getName() = "DocuPassView"

    override fun createViewInstance(reactContext: ThemedReactContext) = DocuPassHostView(reactContext)

    @ReactProp(name = "reference")
    fun setReference(view: DocuPassHostView, value: String?) {
        view.reference = value
        view.applyProps()
    }

    @ReactProp(name = "partyId")
    fun setPartyId(view: DocuPassHostView, value: String?) {
        view.partyId = value
        view.applyProps()
    }

    @ReactProp(name = "baseUrl")
    fun setBaseUrl(view: DocuPassHostView, value: String?) {
        view.baseUrl = value
        view.applyProps()
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
        mapOf("onResult" to mapOf("registrationName" to "onResult"))
}
