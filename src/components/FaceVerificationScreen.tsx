import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { loadFaceDetector, loadVisionCamera } from '../optionalNative';
import { readImageFileAsBase64 } from '../session';
import type { DocuPassKycAction } from '../types';

export interface FaceVerificationScreenProps {
  actions: DocuPassKycAction[];
  disabled?: boolean;
  holdSeconds?: number;
  style?: ViewStyle;
  onComplete(faceBase64List: string[]): void | Promise<void>;
}

type FaceLike = Record<string, any>;

function numberFrom(face: FaceLike, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = face[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function nestedNumber(face: FaceLike, path: string[]): number | undefined {
  let value: any = face;
  for (const key of path) {
    value = value?.[key];
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mouthOpen(face: FaceLike): boolean {
  const explicit = numberFrom(face, ['mouthOpenProbability', 'mouthOpening', 'mouthOpen']);
  if (explicit != null) {
    return explicit > 0.35;
  }

  const topY =
    nestedNumber(face, ['landmarks', 'mouthTop', 'y']) ??
    nestedNumber(face, ['landmarks', 'MOUTH_TOP', 'y']) ??
    nestedNumber(face, ['landmarks', 'upperLipTop', 'y']);
  const bottomY =
    nestedNumber(face, ['landmarks', 'mouthBottom', 'y']) ??
    nestedNumber(face, ['landmarks', 'MOUTH_BOTTOM', 'y']) ??
    nestedNumber(face, ['landmarks', 'lowerLipBottom', 'y']);
  const height =
    nestedNumber(face, ['bounds', 'height']) ??
    nestedNumber(face, ['bounds', 'size', 'height']) ??
    nestedNumber(face, ['boundingBox', 'height']);

  if (topY != null && bottomY != null && height != null && height > 0) {
    return Math.abs(bottomY - topY) / height > 0.055;
  }

  const smile = numberFrom(face, ['smilingProbability', 'smileProbability']);
  return smile != null && smile > 0.65;
}

function actionMatches(face: FaceLike, action: DocuPassKycAction): boolean {
  const yaw = numberFrom(face, [
    'yawAngle',
    'headEulerAngleY',
    'eulerY',
    'rotY',
    'rotationY',
  ]) ?? 0;
  const pitch = numberFrom(face, [
    'pitchAngle',
    'headEulerAngleX',
    'eulerX',
    'rotX',
    'rotationX',
  ]) ?? 0;

  switch (action) {
    case 'turnLeft':
      return yaw < -12 || yaw > 12;
    case 'turnRight':
      return yaw < -12 || yaw > 12;
    case 'turnUp':
      return pitch < -10 || pitch > 10;
    case 'mouthOpen':
      return mouthOpen(face);
    default:
      return false;
  }
}

function instructionFor(action: DocuPassKycAction): string {
  switch (action) {
    case 'turnLeft':
      return 'Turn your head left';
    case 'turnRight':
      return 'Turn your head right';
    case 'turnUp':
      return 'Look up';
    case 'mouthOpen':
      return 'Open your mouth';
    default:
      return 'Follow the prompt';
  }
}

function facesFromEvent(event: any): FaceLike[] {
  if (Array.isArray(event)) {
    return event;
  }
  if (Array.isArray(event?.faces)) {
    return event.faces;
  }
  if (event && typeof event === 'object') {
    return [event];
  }
  return [];
}

export function FaceVerificationScreen({
  actions,
  disabled,
  holdSeconds = 1.2,
  style,
  onComplete,
}: FaceVerificationScreenProps) {
  const { useCameraDevice } = loadVisionCamera();
  const { Camera } = loadFaceDetector();
  const cameraRef = useRef<any>(null);
  const device = useCameraDevice('front');
  const [permission, setPermission] = useState<string>('not-determined');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [holdStartedAt, setHoldStartedAt] = useState<number>();
  const [captured, setCaptured] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const capturingRef = useRef(false);
  const safeActions = useMemo<DocuPassKycAction[]>(
    () => (actions.length ? actions : ['turnLeft', 'mouthOpen']),
    [actions]
  );
  const activeAction = safeActions[currentIndex];
  const progress = holdStartedAt ? Math.min(1, (Date.now() - holdStartedAt) / (holdSeconds * 1000)) : 0;

  useEffect(() => {
    let mounted = true;
    const { Camera: VisionCamera } = loadVisionCamera();
    VisionCamera.requestCameraPermission()
      .then((status: string) => {
        if (mounted) {
          setPermission(status);
        }
      })
      .catch((caught: unknown) => {
        if (mounted) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const captureFrame = useCallback(async () => {
    if (capturingRef.current || !cameraRef.current) {
      return;
    }
    capturingRef.current = true;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      const path = photo.path ?? photo.uri;
      const base64 = await readImageFileAsBase64(path);
      const nextCaptured = [...captured, base64];
      setCaptured(nextCaptured);
      setHoldStartedAt(undefined);

      if (nextCaptured.length >= safeActions.length) {
        await onComplete(nextCaptured);
      } else {
        setCurrentIndex((index) => index + 1);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      capturingRef.current = false;
    }
  }, [captured, onComplete, safeActions.length]);

  const onFacesDetected = useCallback(
    (event: any) => {
      if (disabled || busy || !activeAction) {
        return;
      }

      const face = facesFromEvent(event)[0];
      if (!face) {
        setHoldStartedAt(undefined);
        return;
      }

      if (!actionMatches(face, activeAction)) {
        setHoldStartedAt(undefined);
        return;
      }

      const now = Date.now();
      const started = holdStartedAt ?? now;
      if (!holdStartedAt) {
        setHoldStartedAt(now);
      }

      if (now - started >= holdSeconds * 1000) {
        void captureFrame();
      }
    },
    [activeAction, busy, captureFrame, disabled, holdSeconds, holdStartedAt]
  );

  if (permission !== 'granted') {
    return (
      <View style={[styles.center, style]}>
        <Text style={styles.title}>Camera permission required</Text>
        <Text style={styles.body}>Allow camera access to complete face verification.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.center, style]}>
        <Text style={styles.title}>Camera unavailable</Text>
        <Text style={styles.body}>No front camera was found on this device.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, style]}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        photo
        faceDetectionOptions={{
          performanceMode: 'fast',
          landmarkMode: 'all',
          classificationMode: 'all',
          contourMode: 'all',
        }}
        onFacesDetected={onFacesDetected}
      />
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.header}>
        <Text style={styles.title}>{instructionFor(activeAction ?? safeActions[0])}</Text>
        <Text style={styles.body}>
          Step {Math.min(currentIndex + 1, safeActions.length)} of {safeActions.length}
        </Text>
      </View>
      <View style={styles.faceGuide} pointerEvents="none">
        <View style={[styles.progress, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <View style={styles.footer}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color="#071510" />
            <Text style={styles.busyText}>Saving frame</Text>
          </View>
        ) : (
          <Text style={styles.hint}>Keep one face visible and hold the prompt.</Text>
        )}
        <Pressable
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={() => {
            setCurrentIndex(0);
            setCaptured([]);
            setHoldStartedAt(undefined);
          }}
        >
          <Text style={styles.secondaryText}>Restart face check</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 540,
    backgroundColor: '#071510',
  },
  center: {
    flex: 1,
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#071510',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  body: {
    color: '#d7e4dc',
    fontSize: 14,
    marginTop: 6,
  },
  faceGuide: {
    alignSelf: 'center',
    marginTop: 54,
    width: 260,
    height: 330,
    borderRadius: 130,
    borderWidth: 3,
    borderColor: '#57d68d',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  progress: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 8,
    backgroundColor: '#57d68d',
  },
  footer: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
    gap: 12,
  },
  hint: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
  },
  busy: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#57d68d',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  busyText: {
    color: '#071510',
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryText: {
    color: '#d7e4dc',
    fontWeight: '700',
  },
  error: {
    color: '#ffb4ab',
    fontSize: 13,
    textAlign: 'center',
  },
});
