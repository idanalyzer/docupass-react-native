#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

#if __has_include("DocupassReactNative-Swift.h")
#import "DocupassReactNative-Swift.h"
#else
#import <DocupassReactNative/DocupassReactNative-Swift.h>
#endif

@interface DocupassReactNativeModule : RCTEventEmitter
@property (nonatomic, strong) DocupassNativeKycEngine *engine;
@property (nonatomic, assign) BOOL hasListeners;
@end

@implementation DocupassReactNativeModule

RCT_EXPORT_MODULE(DocupassReactNative)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  if ((self = [super init])) {
    _engine = [DocupassNativeKycEngine new];
    __weak typeof(self) weakSelf = self;
    _engine.onStateChanged = ^(NSDictionary *event) {
      __strong typeof(weakSelf) strongSelf = weakSelf;
      if (strongSelf && strongSelf.hasListeners) {
        [strongSelf sendEventWithName:@"DocuPassKycStateChanged" body:event];
      }
    };
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"DocuPassKycStateChanged"];
}

- (void)startObserving
{
  self.hasListeners = YES;
}

- (void)stopObserving
{
  self.hasListeners = NO;
}

RCT_EXPORT_METHOD(createSession:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine createSession:config resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(currentState:(NSString *)sessionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine currentState:sessionId resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(start:(NSString *)sessionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine start:sessionId resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(refresh:(NSString *)sessionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine refresh:sessionId resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(back:(NSString *)sessionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine back:sessionId resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(clearError:(NSString *)sessionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine clearError:sessionId resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(restart:(NSString *)sessionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine restart:sessionId resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(sendPhoneCode:(NSString *)sessionId
                  number:(NSString *)number
                  type:(NSString *)type
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine sendPhoneCode:sessionId number:number type:type resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(verifyPhoneCode:(NSString *)sessionId
                  number:(NSString *)number
                  code:(NSString *)code
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine verifyPhoneCode:sessionId number:number code:code resolve:resolve reject:^(NSString *errorCode, NSString *message) {
    reject(errorCode, message, nil);
  }];
}

RCT_EXPORT_METHOD(saveCustomForm:(NSString *)sessionId
                  answers:(NSDictionary *)answers
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine saveCustomForm:sessionId answers:answers resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(selectDocumentCountry:(NSString *)sessionId
                  countryCode:(NSString *)countryCode
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine selectDocumentCountry:sessionId countryCode:countryCode resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(selectDocumentType:(NSString *)sessionId
                  documentTypeCode:(NSString *)documentTypeCode
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine selectDocumentType:sessionId documentTypeCode:documentTypeCode resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(uploadDocument:(NSString *)sessionId
                  frontBase64:(NSString *)frontBase64
                  backBase64:(NSString *)backBase64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine uploadDocument:sessionId frontBase64:frontBase64 backBase64:backBase64 resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(uploadFace:(NSString *)sessionId
                  faceBase64List:(NSArray<NSString *> *)faceBase64List
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine uploadFace:sessionId faceBase64List:faceBase64List resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(submitContract:(NSString *)sessionId
                  signatures:(NSDictionary *)signatures
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine submitContract:sessionId signatures:signatures resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(closeSession:(NSString *)sessionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine closeSession:sessionId resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

RCT_EXPORT_METHOD(readFileAsBase64:(NSString *)uri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.engine readFileAsBase64:uri resolve:resolve reject:^(NSString *code, NSString *message) {
    reject(code, message, nil);
  }];
}

@end
