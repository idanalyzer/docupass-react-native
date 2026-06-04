import UIKit
import SwiftUI
import React
import DocuPass

/// Hosts the native SwiftUI `DocuPassView` inside a React Native view and emits
/// `onResult` back to JS. The flow starts once a non-blank `reference` is set.
@objc(DocuPassRNView)
class DocuPassRNView: UIView {

    @objc var reference: NSString? { didSet { rebuild() } }
    @objc var partyId: NSString?
    @objc var baseUrl: NSString?
    @objc var brandColor: NSString? { didSet { rebuild() } }
    @objc var logoUrl: NSString? { didSet { rebuild() } }
    @objc var labels: NSDictionary? { didSet { rebuild() } }
    @objc var onResult: RCTDirectEventBlock?

    private var hosting: UIHostingController<AnyView>?

    private func rebuild() {
        guard let ref = reference as String?, !ref.isEmpty else { return }
        let config = DocuPassConfig(
            reference: ref,
            partyId: partyId as String?,
            baseURLOverride: baseUrl as String?
        )
        let theme = DocuPassTheme(
            primaryColor: (brandColor as String?).flatMap { Color(hex: $0) },
            logoURL: (logoUrl as String?).flatMap { $0.isEmpty ? nil : $0 }
        )
        let overrides = (labels as? [String: String]) ?? [:]
        let strings = DocuPassStrings().applying(overrides)
        let root = DocuPassView(config: config, strings: strings, theme: theme) { [weak self] result in self?.emit(result) }

        hosting?.view.removeFromSuperview()
        hosting?.removeFromParent()

        let hc = UIHostingController(rootView: AnyView(root))
        hosting = hc
        hc.view.frame = bounds
        hc.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(hc.view)
        if let parentVC = reactViewController() {
            parentVC.addChild(hc)
            hc.didMove(toParent: parentVC)
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        hosting?.view.frame = bounds
    }

    private func emit(_ result: DocuPassResult) {
        guard let onResult else { return }
        var body: [String: Any] = ["reference": result.reference]
        switch result {
        case let .completed(_, url, code):
            body["status"] = "completed"
            if let code { body["code"] = code }
            if let url { body["redirectUrl"] = url }
        case let .failed(_, code, msg, url):
            body["status"] = "failed"
            if let code { body["code"] = code }
            if let msg { body["message"] = msg }
            if let url { body["redirectUrl"] = url }
        case .cancelled:
            body["status"] = "cancelled"
        case let .error(_, err):
            body["status"] = "error"
            if let c = err.code { body["code"] = c }
            if let m = err.message { body["message"] = m }
        }
        onResult(body)
    }
}
