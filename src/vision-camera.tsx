import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  InteractionManager,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
  type CameraOutput,
  type Photo,
} from 'react-native-vision-camera';
import {
  createFaceDetectorOutput,
  type Face,
} from 'react-native-vision-camera-face-detector';
import { arrayBufferToBase64 } from './base64';
import { KYCScreen, type KYCScreenProps } from './KYCScreen';
import { KYCAction, KYCCountry, KYCDocumentType } from './types';

export interface VisionDocumentCaptureContext {
  side: 'front' | 'back';
  documentType?: KYCDocumentType | null;
  documentSide?: number | null;
  country?: KYCCountry | null;
}

export interface VisionDocumentCaptureModalProps {
  visible: boolean;
  context?: VisionDocumentCaptureContext | null;
  onCancel: () => void;
  onCaptured: (base64: string) => void;
  onError?: (error: Error) => void;
}

export interface VisionFaceCaptureOptions {
  turnTimeSeconds?: number;
  yawThreshold?: number;
  pitchThreshold?: number;
  mouthOpenRatio?: number;
  maskCircleRadius?: number;
  maskCircleY?: number;
}

export interface VisionFaceCaptureModalProps extends VisionFaceCaptureOptions {
  visible: boolean;
  actions: KYCAction[];
  onCancel: () => void;
  onComplete: (faceBase64List: string[]) => void | Promise<void>;
  onError?: (error: Error) => void;
}

export interface VisionFaceCaptureViewProps extends VisionFaceCaptureOptions {
  active: boolean;
  actions: KYCAction[];
  isBusy?: boolean;
  onCancel: () => void;
  onComplete: (faceBase64List: string[]) => void | Promise<void>;
  onError?: (error: Error) => void;
}

export interface UseVisionCameraCaptureAdaptersOptions extends VisionFaceCaptureOptions {
  onCaptureError?: (error: Error) => void;
}

type Deferred<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

type DocumentRequest = {
  context: VisionDocumentCaptureContext;
  deferred: Deferred<string>;
};

type FaceRequest = {
  actions: KYCAction[];
  context: Required<Pick<VisionFaceCaptureOptions, 'turnTimeSeconds' | 'maskCircleRadius' | 'maskCircleY'>>;
  deferred: Deferred<string[]>;
};

type NitroCameraImage = Awaited<ReturnType<Photo['toImageAsync']>>;

export function useVisionCameraCaptureAdapters(
  options: UseVisionCameraCaptureAdaptersOptions = {},
): {
  captureDocumentSide: NonNullable<KYCScreenProps['captureDocumentSide']>;
  captureFace: NonNullable<KYCScreenProps['captureFace']>;
  captureModals: ReactNode;
} {
  const [documentRequest, setDocumentRequest] = useState<DocumentRequest | null>(null);
  const [faceRequest, setFaceRequest] = useState<FaceRequest | null>(null);

  const captureDocumentSide = useCallback<NonNullable<KYCScreenProps['captureDocumentSide']>>(
    (side, context) =>
      new Promise((resolve, reject) => {
        setDocumentRequest({
          context: { ...context, side },
          deferred: { resolve, reject },
        });
      }),
    [],
  );

  const captureFace = useCallback<NonNullable<KYCScreenProps['captureFace']>>(
    (actions, context) =>
      new Promise((resolve, reject) => {
        setFaceRequest({
          actions,
          context: {
            turnTimeSeconds: context.turnTimeSeconds,
            maskCircleRadius: context.maskCircleRadius,
            maskCircleY: context.maskCircleY,
          },
          deferred: { resolve, reject },
        });
      }),
    [],
  );

  const rejectDocument = useCallback(() => {
    documentRequest?.deferred.reject(new Error('Document capture cancelled.'));
    setDocumentRequest(null);
  }, [documentRequest]);

  const rejectFace = useCallback(() => {
    faceRequest?.deferred.reject(new Error('Face capture cancelled.'));
    setFaceRequest(null);
  }, [faceRequest]);

  const captureModals = (
    <>
      <VisionDocumentCaptureModal
        visible={!!documentRequest}
        context={documentRequest?.context}
        onCancel={rejectDocument}
        onCaptured={(base64) => {
          documentRequest?.deferred.resolve(base64);
          setDocumentRequest(null);
        }}
        onError={(error) => {
          options.onCaptureError?.(error);
          documentRequest?.deferred.reject(error);
          setDocumentRequest(null);
        }}
      />
      <VisionFaceCaptureModal
        visible={!!faceRequest}
        actions={faceRequest?.actions || []}
        turnTimeSeconds={faceRequest?.context.turnTimeSeconds ?? options.turnTimeSeconds}
        maskCircleRadius={faceRequest?.context.maskCircleRadius ?? options.maskCircleRadius}
        maskCircleY={faceRequest?.context.maskCircleY ?? options.maskCircleY}
        yawThreshold={options.yawThreshold}
        pitchThreshold={options.pitchThreshold}
        mouthOpenRatio={options.mouthOpenRatio}
        onCancel={rejectFace}
        onComplete={(faces) => {
          faceRequest?.deferred.resolve(faces);
          setFaceRequest(null);
        }}
        onError={(error) => {
          options.onCaptureError?.(error);
          faceRequest?.deferred.reject(error);
          setFaceRequest(null);
        }}
      />
    </>
  );

  return { captureDocumentSide, captureFace, captureModals };
}

export function VisionDocumentCaptureModal({
  visible,
  context,
  onCancel,
  onCaptured,
  onError,
}: VisionDocumentCaptureModalProps): JSX.Element {
  const device = useCameraDevice('back');
  const permission = useCameraPermission();
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.FHD_4_3,
    containerFormat: 'jpeg',
    quality: 0.88,
    qualityPrioritization: 'balanced',
  });
  const [isCapturing, setIsCapturing] = useState(false);
  const window = useWindowDimensions();
  const navigationInset = getAndroidNavigationInset(window.height);
  const isPhonePortrait = window.height >= window.width;
  const previewAspect = isPhonePortrait ? 9 / 16 : 16 / 9;
  const previewWidth = isPhonePortrait ? window.width : window.width * 0.9;
  const previewHeight = previewWidth / previewAspect;
  const [cardMaskType, setCardMaskType] = useState<KYCDocumentType | null>(null);
  const [isClosingCapture, setIsClosingCapture] = useState(false);
  const canToggleCardMask =
    context?.documentType?.key === 'driverLicense' || context?.documentType?.key === 'identityCard';
  const effectiveDocumentType = canToggleCardMask
    ? cardMaskType || context?.documentType || null
    : context?.documentType || null;
  const maskSpec = resolveDocumentMaskSpec(effectiveDocumentType, isPhonePortrait);
  const maskFrame = calculateDocumentMaskFrame(
    previewWidth,
    previewHeight,
    maskSpec,
    isPhonePortrait,
  );

  useEffect(() => {
    if (!visible) {
      setIsClosingCapture(false);
    }
    if (visible && !permission.hasPermission && permission.canRequestPermission) {
      permission.requestPermission();
    }
  }, [permission, visible]);

  useEffect(() => {
    if (!visible) return;
    if (context?.documentType?.key === 'driverLicense') {
      setCardMaskType(context.documentType);
    } else if (context?.documentType?.key === 'identityCard') {
      setCardMaskType(context.documentType);
    } else {
      setCardMaskType(null);
    }
  }, [context?.documentType, visible]);

  const capture = async () => {
    if (isCapturing || isClosingCapture) {
      return;
    }
    setIsCapturing(true);
    let photo: Photo | null = null;
    let capturedBase64: string | null = null;
    try {
      photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      );
      capturedBase64 = await cropDocumentPhotoToMaskBase64(
        photo,
        { width: previewWidth, height: previewHeight },
        maskFrame,
        maskSpec,
      );
    } catch (error) {
      onError?.(asError(error, 'Unable to capture document photo.'));
    } finally {
      try {
        photo?.dispose();
      } catch (error) {
        void error;
      }
      setIsCapturing(false);
    }

    if (capturedBase64) {
      setIsClosingCapture(true);
      await wait(Platform.OS === 'ios' ? 350 : 0);
      onCaptured(capturedBase64);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <View style={cameraStyles.documentRoot}>
        <View
          style={[
            cameraStyles.documentPreview,
            { width: previewWidth, aspectRatio: previewAspect },
          ]}
        >
          {permission.hasPermission && device ? (
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={visible && !isClosingCapture}
              outputs={[photoOutput]}
              resizeMode="cover"
              enableNativeTapToFocusGesture
              onError={(error) => onError?.(asError(error, 'Camera failed.'))}
            />
          ) : (
            <CameraPlaceholder>
              {!permission.hasPermission ? 'Camera permission is required.' : 'No back camera available.'}
            </CameraPlaceholder>
          )}

          <DocumentMaskOverlay frame={maskFrame} lowerHalfOnly={maskSpec.lowerHalfOnly} />
        </View>

        <View style={cameraStyles.documentSpacer} />

        <View style={[cameraStyles.documentShutterBox, { paddingBottom: 8 + navigationInset }]}>
          <DocumentShutterButton
            disabled={!permission.hasPermission || !device || isCapturing || isClosingCapture}
            isLoading={isCapturing || isClosingCapture}
            onPress={capture}
          />
          {canToggleCardMask ? (
            <Pressable
              accessibilityRole="button"
              disabled={isCapturing || isClosingCapture}
              onPress={() => {
                setCardMaskType((current) =>
                  current?.key === 'driverLicense'
                    ? { key: 'identityCard', label: 'Identity Card', apiTypeCode: 'I', requiresBackSide: true }
                    : { key: 'driverLicense', label: 'Driver License', apiTypeCode: 'D', requiresBackSide: true },
                );
              }}
              style={[cameraStyles.maskToggle, (isCapturing || isClosingCapture) && cameraStyles.disabled]}
            >
              <Text style={cameraStyles.maskToggleText}>
                {effectiveDocumentType?.key === 'driverLicense' ? 'VERT' : 'LAND'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

interface DocumentMaskSpec {
  aspectRatio: number;
  widthRatioPortrait: number;
  widthRatioLandscape: number;
  centerYRatio: number;
  lowerHalfOnly: boolean;
}

interface DocumentMaskFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

function DocumentMaskOverlay({
  frame,
  lowerHalfOnly,
}: {
  frame: DocumentMaskFrame;
  lowerHalfOnly: boolean;
}): JSX.Element {
  const halfHeight = frame.height / 2;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[cameraStyles.maskShade, { top: 0, left: 0, right: 0, height: frame.top }]} />
      <View
        style={[
          cameraStyles.maskShade,
          { top: frame.top, left: 0, width: frame.left, height: frame.height },
        ]}
      />
      <View
        style={[
          cameraStyles.maskShade,
          {
            top: frame.top,
            left: frame.left + frame.width,
            right: 0,
            height: frame.height,
          },
        ]}
      />
      <View
        style={[
          cameraStyles.maskShade,
          { top: frame.top + frame.height, left: 0, right: 0, bottom: 0 },
        ]}
      />
      <View
        style={[
          cameraStyles.documentFrame,
          {
            left: frame.left,
            top: frame.top,
            width: frame.width,
            height: frame.height,
          },
        ]}
      />
      {lowerHalfOnly ? (
        <>
          <View
            style={[
              cameraStyles.lowerHalfShade,
              {
                left: frame.left,
                top: frame.top,
                width: frame.width,
                height: halfHeight,
              },
            ]}
          />
          <View
            style={[
              cameraStyles.documentHalfLine,
              {
                left: frame.left,
                top: frame.top + halfHeight,
                width: frame.width,
              },
            ]}
          />
        </>
      ) : null}
    </View>
  );
}

function calculateDocumentMaskFrame(
  containerWidth: number,
  containerHeight: number,
  spec: DocumentMaskSpec,
  isPhonePortrait: boolean,
): DocumentMaskFrame {
  const frameWidthRatio = isPhonePortrait ? spec.widthRatioPortrait : spec.widthRatioLandscape;
  let frameWidth = containerWidth * frameWidthRatio;
  let frameHeight = frameWidth / spec.aspectRatio;
  const maxFrameHeight = containerHeight * (isPhonePortrait ? 0.94 : 0.86);

  if (frameHeight > maxFrameHeight) {
    frameHeight = maxFrameHeight;
    frameWidth = frameHeight * spec.aspectRatio;
  }

  const centerX = containerWidth * 0.5;
  const centerY = containerHeight * spec.centerYRatio;
  return {
    left: centerX - frameWidth * 0.5,
    top: centerY - frameHeight * 0.5,
    width: frameWidth,
    height: frameHeight,
  };
}

async function cropDocumentPhotoToMaskBase64(
  photo: Photo,
  previewSize: { width: number; height: number },
  frame: DocumentMaskFrame,
  spec: DocumentMaskSpec,
): Promise<string> {
  const source = await photo.toImageAsync();
  let workingImage: NitroCameraImage = source;
  let normalizedImage: NitroCameraImage | null = null;
  let croppedImage: NitroCameraImage | null = null;
  const cropFrame = spec.lowerHalfOnly
    ? {
        ...frame,
        top: frame.top + frame.height * 0.5,
        height: frame.height * 0.5,
      }
    : frame;

  try {
    normalizedImage = await normalizeDocumentImageForCrop(photo, source);
    workingImage = normalizedImage;

    if (workingImage.width <= 2 || workingImage.height <= 2) {
      const encoded = await workingImage.toEncodedImageDataAsync('jpg', 88);
      return arrayBufferToBase64(encoded.buffer);
    }

    const scale = Math.max(previewSize.width / workingImage.width, previewSize.height / workingImage.height);
    const renderedWidth = workingImage.width * scale;
    const renderedHeight = workingImage.height * scale;
    const offsetX = (renderedWidth - previewSize.width) * 0.5;
    const offsetY = (renderedHeight - previewSize.height) * 0.5;

    const startX = (cropFrame.left + offsetX) / scale;
    const startY = (cropFrame.top + offsetY) / scale;
    const endX = (cropFrame.left + cropFrame.width + offsetX) / scale;
    const endY = (cropFrame.top + cropFrame.height + offsetY) / scale;

    const left = clamp(Math.floor(startX), 0, workingImage.width - 2);
    const top = clamp(Math.floor(startY), 0, workingImage.height - 2);
    const right = clamp(Math.ceil(endX), left + 2, workingImage.width);
    const bottom = clamp(Math.ceil(endY), top + 2, workingImage.height);
    croppedImage = await workingImage.cropAsync(left, top, right, bottom);
    const encoded = await croppedImage.toEncodedImageDataAsync('jpg', 88);
    return arrayBufferToBase64(encoded.buffer);
  } finally {
    disposeImage(croppedImage);
    if (normalizedImage && !sameHybridObject(normalizedImage, source)) {
      disposeImage(normalizedImage);
    }
    disposeImage(source);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

async function normalizeDocumentImageForCrop(
  photo: Photo,
  source: NitroCameraImage,
): Promise<NitroCameraImage> {
  if (Platform.OS !== 'ios' || (photo.orientation === 'up' && !photo.isMirrored)) {
    return source;
  }

  const mirrored = photo.isMirrored ? await source.mirrorHorizontallyAsync() : source;
  try {
    return await mirrored.rotateAsync(0, false);
  } finally {
    if (!sameHybridObject(mirrored, source)) {
      disposeImage(mirrored);
    }
  }
}

function sameHybridObject(a: NitroCameraImage, b: NitroCameraImage): boolean {
  if (a === b) return true;
  try {
    return a.equals(b);
  } catch {
    return false;
  }
}

function disposeImage(image: NitroCameraImage | null): void {
  try {
    image?.dispose();
  } catch {
    // Best-effort native memory cleanup. A disposed/invalid hybrid object can be ignored.
  }
}

function resolveDocumentMaskSpec(
  documentType: KYCDocumentType | null | undefined,
  isPhonePortrait: boolean,
): DocumentMaskSpec {
  const id1LandscapeRatio = 85.6 / 53.98;
  const id1PortraitRatio = 53.98 / 85.6;
  const passportLandscapeRatio = 125 / 88;
  const passportPortraitRatio = 88 / 125;

  if (documentType?.key === 'driverLicense') {
    return isPhonePortrait
      ? {
          aspectRatio: id1PortraitRatio,
          widthRatioPortrait: 0.96,
          widthRatioLandscape: 0.9,
          centerYRatio: 0.52,
          lowerHalfOnly: false,
        }
      : {
          aspectRatio: id1LandscapeRatio,
          widthRatioPortrait: 0.96,
          widthRatioLandscape: 0.92,
          centerYRatio: 0.5,
          lowerHalfOnly: false,
        };
  }

  if (documentType?.key === 'passport') {
    return isPhonePortrait
      ? {
          aspectRatio: passportPortraitRatio,
          widthRatioPortrait: 0.96,
          widthRatioLandscape: 0.9,
          centerYRatio: 0.55,
          lowerHalfOnly: true,
        }
      : {
          aspectRatio: passportLandscapeRatio,
          widthRatioPortrait: 0.96,
          widthRatioLandscape: 0.92,
          centerYRatio: 0.52,
          lowerHalfOnly: true,
        };
  }

  return {
    aspectRatio: id1LandscapeRatio,
    widthRatioPortrait: 0.96,
    widthRatioLandscape: 0.92,
    centerYRatio: 0.5,
    lowerHalfOnly: false,
  };
}

export function VisionFaceCaptureModal({
  visible,
  ...props
}: VisionFaceCaptureModalProps): JSX.Element {
  return (
    <Modal visible={visible} animationType="none" presentationStyle="fullScreen" onRequestClose={props.onCancel}>
      <VisionFaceCaptureView active={visible} {...props} />
    </Modal>
  );
}

export function VisionFaceCaptureView({
  active,
  actions,
  isBusy = false,
  onCancel,
  onComplete,
  onError,
  turnTimeSeconds = 2,
  yawThreshold = 13,
  pitchThreshold = 10,
  mouthOpenRatio = 0.075,
  maskCircleRadius = 0.42,
  maskCircleY = 0.45,
}: VisionFaceCaptureViewProps): JSX.Element {
  const device = useCameraDevice('front');
  const permission = useCameraPermission();
  const window = useWindowDimensions();
  const navigationInset = getAndroidNavigationInset(window.height);
  const [layout, setLayout] = useState({ width: window.width, height: window.height });
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.HD_4_3,
    containerFormat: 'jpeg',
    quality: 0.78,
    qualityPrioritization: 'speed',
  });
  const [faceState, setFaceState] = useState<FaceState>({
    message: 'Position your face in the circle.',
    hasFace: false,
    actionReady: false,
    progress: 0,
  });
  const [faceAligned, setFaceAligned] = useState(false);
  const [scanStarted, setScanStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cameraActivationReady, setCameraActivationReady] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [captured, setCaptured] = useState<string[]>([]);
  const holdStartedAtRef = useRef<number | null>(null);
  const lastUiUpdateAtRef = useRef(0);
  const isCapturingRef = useRef(false);
  const finishedRef = useRef(false);

  const currentAction = actions[stepIndex];
  const requiredCaptures = Math.max(1, actions.length);
  const maskCircle = useMemo(
    () => ({
      centerX: layout.width * 0.5,
      centerY: layout.height * maskCircleY,
      radius: layout.width * maskCircleRadius,
    }),
    [layout.height, layout.width, maskCircleRadius, maskCircleY],
  );

  const captureActionFrame = useCallback(async () => {
    if (isCapturingRef.current || finishedRef.current) return;
    isCapturingRef.current = true;
    let completedSequence = false;
    try {
      const photo = await photoOutput.capturePhoto(
        { flashMode: 'off', enableShutterSound: false },
        {},
      );
      const data = await photo.getFileDataAsync();
      photo.dispose();
      const nextCaptured = [...captured, arrayBufferToBase64(data)];
      setCaptured(nextCaptured);
      holdStartedAtRef.current = null;

      if (nextCaptured.length >= requiredCaptures) {
        completedSequence = true;
        finishedRef.current = true;
        setScanStarted(false);
        setIsSubmitting(true);
        setFaceState({
          message: 'Uploading face verification.',
          hasFace: true,
          actionReady: true,
          progress: 1,
        });
        await waitForNextFrame();
        try {
          await Promise.resolve(onComplete(nextCaptured));
        } catch (error) {
          onError?.(asError(error, 'Unable to upload face verification.'));
        }
      } else {
        setStepIndex((value) => value + 1);
      }
    } catch (error) {
      onError?.(asError(error, 'Unable to capture face frame.'));
    } finally {
      isCapturingRef.current = false;
      if (completedSequence) {
        finishedRef.current = false;
      }
      setIsSubmitting(false);
    }
  }, [captured, onComplete, onError, photoOutput, requiredCaptures]);

  const startScan = useCallback(() => {
    if (scanStarted || finishedRef.current || isBusy || isSubmitting) return;
    if (!faceAligned) {
      holdStartedAtRef.current = null;
      setFaceState((current) => ({
        ...current,
        message: current.hasFace ? 'Keep your face inside the circle.' : 'Align your face inside the circle.',
        actionReady: false,
        progress: 0,
      }));
      return;
    }
    setCaptured([]);
    setStepIndex(0);
    holdStartedAtRef.current = null;
    lastUiUpdateAtRef.current = 0;
    setFaceState({
      message: actions[0]?.instruction || 'Hold still for capture.',
      hasFace: false,
      actionReady: false,
      progress: 0,
    });

    if (actions.length === 0) {
      captureActionFrame();
    } else {
      setScanStarted(true);
    }
  }, [actions, captureActionFrame, faceAligned, isBusy, isSubmitting, scanStarted]);

  const handleFacesDetected = useCallback(
    (faces: Face[]) => {
      if (!active || finishedRef.current) return;

      const face = largestFace(faces);
      const now = Date.now();
      const isInside = face ? isFaceInsideCircle(face, maskCircle) : false;

      if (!scanStarted) {
        if (now - lastUiUpdateAtRef.current > 180) {
          setFaceAligned(isInside);
          setFaceState({
            message: isInside
              ? 'Ready to scan.'
              : face
                ? 'Keep your face inside the circle.'
                : 'Align your face inside the circle.',
            hasFace: !!face,
            actionReady: isInside,
            progress: 0,
          });
          lastUiUpdateAtRef.current = now;
        }
        return;
      }

      if (!currentAction) return;

      if (!isInside) {
        holdStartedAtRef.current = null;
        if (now - lastUiUpdateAtRef.current > 120) {
          setFaceAligned(false);
          setFaceState({
            message: face ? 'Keep your face inside the circle.' : 'Align your face inside the circle.',
            hasFace: !!face,
            actionReady: false,
            progress: 0,
          });
          lastUiUpdateAtRef.current = now;
        }
        return;
      }

      const evaluated = evaluateFaceAction(face, currentAction, {
        yawThreshold,
        pitchThreshold,
        mouthOpenRatio,
      });

      if (evaluated.ready) {
        if (holdStartedAtRef.current == null) holdStartedAtRef.current = now;
        const elapsed = now - holdStartedAtRef.current;
        const progress = Math.min(1, elapsed / Math.max(400, turnTimeSeconds * 1000));
        if (now - lastUiUpdateAtRef.current > 120) {
          setFaceState({
            message: evaluated.message,
            hasFace: !!face,
            actionReady: true,
            progress,
          });
          lastUiUpdateAtRef.current = now;
        }
        if (progress >= 1) {
          captureActionFrame();
        }
      } else {
        holdStartedAtRef.current = null;
        if (now - lastUiUpdateAtRef.current > 160) {
          setFaceState({
            message: evaluated.message,
            hasFace: !!face,
            actionReady: false,
            progress: 0,
          });
          lastUiUpdateAtRef.current = now;
        }
      }
    },
    [
      active,
      captureActionFrame,
      currentAction,
      maskCircle,
      mouthOpenRatio,
      pitchThreshold,
      scanStarted,
      turnTimeSeconds,
      yawThreshold,
    ],
  );

  const faceOutput = useMemo<CameraOutput>(
    () =>
      createFaceDetectorOutput({
        onFacesDetected: handleFacesDetected,
        onError: (error) => onError?.(asError(error, 'Face detector failed.')),
        outputResolution: 'preview',
        cameraFacing: 'front',
        autoMode: true,
        windowWidth: layout.width,
        windowHeight: layout.height,
        performanceMode: 'fast',
        runLandmarks: true,
        runContours: false,
        runClassifications: false,
        minFaceSize: 0.2,
        trackingEnabled: false,
      }),
    [handleFacesDetected, layout.height, layout.width, onError],
  );

  const outputs = useMemo<CameraOutput[]>(() => [photoOutput, faceOutput], [faceOutput, photoOutput]);
  const faceCameraConstraints = useMemo(() => [{ fps: 30 }], []);
  const shouldPauseCamera = isSubmitting || isBusy;
  const shouldRunCamera = active && !shouldPauseCamera && cameraActivationReady;
  const showLocalSubmitOverlay = isSubmitting && !isBusy;

  useEffect(() => {
    if (active && !permission.hasPermission && permission.canRequestPermission) {
      permission.requestPermission();
    }
  }, [active, permission]);

  useEffect(() => {
    if (!active) {
      holdStartedAtRef.current = null;
      lastUiUpdateAtRef.current = 0;
      isCapturingRef.current = false;
      finishedRef.current = false;
      setFaceAligned(false);
      setScanStarted(false);
      setStepIndex(0);
      setCaptured([]);
      setIsSubmitting(false);
      setFaceState({
        message: 'Position your face in the circle.',
        hasFace: false,
        actionReady: false,
        progress: 0,
      });
    }
  }, [active]);

  useEffect(() => {
    if (!active || shouldPauseCamera) {
      setCameraActivationReady(false);
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const interaction = InteractionManager.runAfterInteractions(() => {
      timeout = setTimeout(() => setCameraActivationReady(true), Platform.OS === 'ios' ? 700 : 0);
    });

    return () => {
      if (timeout) clearTimeout(timeout);
      interaction.cancel();
    };
  }, [active, shouldPauseCamera]);

  return (
    <View
      style={cameraStyles.root}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0 && (width !== layout.width || height !== layout.height)) {
          setLayout({ width, height });
        }
      }}
    >
      {permission.hasPermission && device ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={shouldRunCamera}
          outputs={outputs}
          constraints={faceCameraConstraints}
          resizeMode="cover"
          mirrorMode="auto"
          onError={(error) => onError?.(asError(error, 'Camera failed.'))}
        />
      ) : (
        <CameraPlaceholder>
          {!permission.hasPermission ? 'Camera permission is required.' : 'No front camera available.'}
        </CameraPlaceholder>
      )}

      <View pointerEvents="none" style={cameraStyles.faceGuide}>
        <View
          style={[
            cameraStyles.faceCircle,
            {
              width: maskCircle.radius * 2,
              height: maskCircle.radius * 2,
              borderRadius: maskCircle.radius,
              left: maskCircle.centerX - maskCircle.radius,
              top: maskCircle.centerY - maskCircle.radius,
            },
            faceState.hasFace && cameraStyles.faceCircleDetected,
            faceState.actionReady && cameraStyles.faceCircleReady,
          ]}
        />
      </View>

      <CameraTopBar
        title={`FACE CHECK ${Math.min(stepIndex + 1, requiredCaptures)}/${requiredCaptures}`}
        onCancel={onCancel}
      />

      <View style={[cameraStyles.bottomBar, { paddingBottom: 24 + navigationInset }]}>
        <Text style={cameraStyles.actionTitle}>
          {scanStarted ? currentAction?.instruction || 'CAPTURING FACE' : 'ALIGN FACE TO CIRCLE'}
        </Text>
        <Text style={cameraStyles.hint}>{faceState.message}</Text>
        <Text style={cameraStyles.faceCount}>Captured faces: {captured.length}</Text>
        {scanStarted ? (
          <View style={cameraStyles.progressTrack}>
            <View style={[cameraStyles.progressFill, { width: `${Math.round(faceState.progress * 100)}%` }]} />
          </View>
        ) : (
          <RoundButton disabled={!faceAligned || shouldPauseCamera} onPress={startScan}>
            <Text style={cameraStyles.shutterText}>INITIATE SCAN</Text>
          </RoundButton>
        )}
      </View>

      {showLocalSubmitOverlay ? (
        <View pointerEvents="auto" style={cameraStyles.submitOverlay}>
          <ActivityIndicator color="#00FFAB" size="large" />
        </View>
      ) : null}
    </View>
  );
}

export interface DocupassVisionCameraScreenProps
  extends Omit<KYCScreenProps, 'captureDocumentSide' | 'captureFace'>,
    UseVisionCameraCaptureAdaptersOptions {
  captureDocumentSide?: KYCScreenProps['captureDocumentSide'];
  captureFace?: KYCScreenProps['captureFace'];
}

export function DocupassVisionCameraScreen({
  captureDocumentSide,
  captureFace,
  onCaptureError,
  yawThreshold,
  pitchThreshold,
  mouthOpenRatio,
  turnTimeSeconds,
  ...screenProps
}: DocupassVisionCameraScreenProps): JSX.Element {
  const adapters = useVisionCameraCaptureAdapters({
    onCaptureError,
    yawThreshold,
    pitchThreshold,
    mouthOpenRatio,
    turnTimeSeconds,
  });
  const renderFaceVerification =
    screenProps.renderFaceVerification ||
    (captureFace
      ? undefined
      : (props: Parameters<NonNullable<KYCScreenProps['renderFaceVerification']>>[0]) => (
          <VisionFaceCaptureView
            active={!props.isBusy}
            actions={props.actions}
            isBusy={props.isBusy}
            turnTimeSeconds={props.settings.turnTimeSeconds}
            maskCircleRadius={props.settings.maskCircleRadius}
            maskCircleY={props.settings.maskCircleY}
            yawThreshold={yawThreshold}
            pitchThreshold={pitchThreshold}
            mouthOpenRatio={mouthOpenRatio}
            onCancel={props.onCancel}
            onComplete={props.onComplete}
            onError={onCaptureError}
          />
        ));

  return (
    <>
      <KYCScreen
        {...screenProps}
        turnTimeSeconds={turnTimeSeconds}
        captureDocumentSide={captureDocumentSide || adapters.captureDocumentSide}
        captureFace={captureFace || adapters.captureFace}
        renderFaceVerification={renderFaceVerification}
      />
      {adapters.captureModals}
    </>
  );
}

interface FaceState {
  message: string;
  hasFace: boolean;
  actionReady: boolean;
  progress: number;
}

interface FaceThresholds {
  yawThreshold: number;
  pitchThreshold: number;
  mouthOpenRatio: number;
}

interface FaceCircleFrame {
  centerX: number;
  centerY: number;
  radius: number;
}

function evaluateFaceAction(
  face: Face | null,
  action: KYCAction,
  thresholds: FaceThresholds,
): { ready: boolean; message: string } {
  if (!face) {
    return { ready: false, message: 'Move closer until your face is detected.' };
  }

  switch (action.id) {
    case 'front':
      return Math.abs(face.yawAngle) <= thresholds.yawThreshold * 0.7 &&
        Math.abs(face.pitchAngle) <= thresholds.pitchThreshold * 0.9
        ? { ready: true, message: 'Hold still.' }
        : { ready: false, message: 'Look straight at the camera.' };
    case 'turnLeft':
      return face.yawAngle >= thresholds.yawThreshold
        ? { ready: true, message: 'Hold still.' }
        : { ready: false, message: 'Turn your head left.' };
    case 'turnRight':
      return face.yawAngle <= -thresholds.yawThreshold
        ? { ready: true, message: 'Hold still.' }
        : { ready: false, message: 'Turn your head right.' };
    case 'turnUp':
      return face.pitchAngle <= -thresholds.pitchThreshold ||
        face.pitchAngle >= thresholds.pitchThreshold
        ? { ready: true, message: 'Hold still.' }
        : { ready: false, message: 'Tilt your head up.' };
    case 'mouthOpen':
      return isMouthOpen(face, thresholds.mouthOpenRatio)
        ? { ready: true, message: 'Hold still.' }
        : { ready: false, message: 'Open your mouth.' };
  }
}

function isFaceInsideCircle(face: Face, circle: FaceCircleFrame): boolean {
  const bounds = face.bounds;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const landmarks = face.landmarks;
  const points = [
    landmarks?.LEFT_CHEEK || { x: bounds.x + bounds.width * 0.12, y: centerY },
    landmarks?.RIGHT_CHEEK || { x: bounds.x + bounds.width * 0.88, y: centerY },
    landmarks?.LEFT_EYE || { x: bounds.x + bounds.width * 0.32, y: bounds.y + bounds.height * 0.34 },
    landmarks?.RIGHT_EYE || { x: bounds.x + bounds.width * 0.68, y: bounds.y + bounds.height * 0.34 },
    landmarks?.MOUTH_BOTTOM || { x: centerX, y: bounds.y + bounds.height * 0.82 },
    landmarks?.NOSE_BASE || { x: centerX, y: bounds.y + bounds.height * 0.55 },
    { x: centerX, y: bounds.y + bounds.height * 0.08 },
    { x: centerX, y: bounds.y + bounds.height * 0.92 },
  ];
  const radius = circle.radius * 0.96;

  return points.every((point) => {
    const dx = point.x - circle.centerX;
    const dy = point.y - circle.centerY;
    return Math.sqrt(dx * dx + dy * dy) <= radius;
  });
}

function isMouthOpen(face: Face, ratio: number): boolean {
  const landmarks = face.landmarks;
  if (landmarks?.MOUTH_BOTTOM && landmarks.MOUTH_LEFT && landmarks.MOUTH_RIGHT) {
    const mouthLineY = (landmarks.MOUTH_LEFT.y + landmarks.MOUTH_RIGHT.y) / 2;
    return Math.abs(landmarks.MOUTH_BOTTOM.y - mouthLineY) / face.bounds.height >= ratio;
  }

  const contours = face.contours;
  const upper = averageY([...(contours?.UPPER_LIP_BOTTOM || []), ...(contours?.UPPER_LIP_TOP || [])]);
  const lower = averageY([...(contours?.LOWER_LIP_TOP || []), ...(contours?.LOWER_LIP_BOTTOM || [])]);
  if (upper != null && lower != null) {
    return Math.abs(lower - upper) / face.bounds.height >= ratio * 0.7;
  }

  return false;
}

function averageY(points: Array<{ y: number }>): number | null {
  if (points.length === 0) return null;
  return points.reduce((sum, point) => sum + point.y, 0) / points.length;
}

function largestFace(faces: Face[]): Face | null {
  if (faces.length === 0) return null;
  return faces.reduce((best, face) =>
    face.bounds.width * face.bounds.height > best.bounds.width * best.bounds.height ? face : best,
  );
}

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

function getAndroidNavigationInset(windowHeight: number): number {
  if (Platform.OS !== 'android') return 0;

  const screenHeight = Dimensions.get('screen').height;
  const statusBarHeight = StatusBar.currentHeight ?? 0;
  const estimatedInset = screenHeight - windowHeight - statusBarHeight;

  return Math.max(48, estimatedInset);
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function wait(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function CameraTopBar({ title, onCancel }: { title: string; onCancel: () => void }): JSX.Element {
  return (
    <View style={cameraStyles.topBar}>
      <Pressable accessibilityRole="button" onPress={onCancel} style={cameraStyles.closeButton}>
        <Text style={cameraStyles.closeText}>X</Text>
      </Pressable>
      <Text style={cameraStyles.topTitle}>{title}</Text>
      <View style={cameraStyles.topSpacer} />
    </View>
  );
}

function CameraPlaceholder({ children }: { children: ReactNode }): JSX.Element {
  return (
    <View style={cameraStyles.placeholder}>
      <Text style={cameraStyles.placeholderText}>{children}</Text>
    </View>
  );
}

function RoundButton({
  children,
  disabled,
  onPress,
}: {
  children: ReactNode;
  disabled?: boolean;
  onPress: () => void;
}): JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[cameraStyles.roundButton, disabled && cameraStyles.disabled]}
    >
      {children}
    </Pressable>
  );
}

function DocumentShutterButton({
  disabled,
  isLoading,
  onPress,
}: {
  disabled?: boolean;
  isLoading: boolean;
  onPress: () => void;
}): JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Capture document"
      disabled={disabled}
      onPress={onPress}
      style={[cameraStyles.documentShutterOuter, disabled && cameraStyles.disabled]}
    >
      <View style={cameraStyles.documentShutterInner}>
        {isLoading ? <ActivityIndicator color="#090909" /> : null}
      </View>
    </Pressable>
  );
}

const cameraStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050A08',
  },
  documentRoot: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 64,
    paddingBottom: 20,
    backgroundColor: '#090909',
  },
  documentPreview: {
    maxWidth: '100%',
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#000000',
  },
  documentSpacer: {
    flex: 1,
  },
  documentShutterBox: {
    width: '100%',
    minHeight: 92,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  documentShutterOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentShutterInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#050A08',
  },
  placeholderText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 94,
    paddingTop: 42,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  topTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  topSpacer: {
    width: 44,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 172,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 34,
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  hint: {
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    lineHeight: 20,
  },
  actionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  faceCount: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '700',
  },
  roundButton: {
    minWidth: 132,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: '#00FFAB',
  },
  shutterText: {
    color: '#001F16',
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.45,
  },
  maskShade: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.56)',
  },
  documentFrame: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: '#00FFAB',
    backgroundColor: 'transparent',
  },
  lowerHalfShade: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.36)',
  },
  documentHalfLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#FFD166',
  },
  maskToggle: {
    position: 'absolute',
    right: 16,
    top: 25,
    width: 70,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  maskToggleText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  faceGuide: {
    ...StyleSheet.absoluteFillObject,
  },
  faceCircle: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.76)',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  faceCircleDetected: {
    borderColor: 'rgba(0,255,171,0.72)',
  },
  faceCircleReady: {
    borderColor: '#00FFAB',
    backgroundColor: 'rgba(0,255,171,0.08)',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#00FFAB',
  },
  submitOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
});
