#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(DocuPassViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(reference, NSString)
RCT_EXPORT_VIEW_PROPERTY(partyId, NSString)
RCT_EXPORT_VIEW_PROPERTY(baseUrl, NSString)
RCT_EXPORT_VIEW_PROPERTY(onResult, RCTDirectEventBlock)

@end
