declare const require: (name: string) => any;

let visionCameraModule: any;
let faceDetectorModule: any;

export function loadVisionCamera(): any {
  if (!visionCameraModule) {
    try {
      visionCameraModule = require('react-native-vision-camera');
    } catch (error) {
      throw new Error(
        'DocuPass KYCScreen requires react-native-vision-camera. Install it before rendering KYCScreen.'
      );
    }
  }
  return visionCameraModule;
}

export function loadFaceDetector(): any {
  if (!faceDetectorModule) {
    try {
      faceDetectorModule = require('react-native-vision-camera-face-detector');
    } catch (error) {
      throw new Error(
        'DocuPass KYCScreen face verification requires react-native-vision-camera-face-detector.'
      );
    }
  }
  return faceDetectorModule;
}
