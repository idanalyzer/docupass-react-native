import Foundation
import React

@objc(DocuPassViewManager)
class DocuPassViewManager: RCTViewManager {
    override func view() -> UIView! {
        DocuPassRNView()
    }

    override static func requiresMainQueueSetup() -> Bool {
        true
    }
}
