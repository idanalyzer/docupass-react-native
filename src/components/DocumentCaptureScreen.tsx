import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { loadVisionCamera } from '../optionalNative';
import { readImageFileAsBase64 } from '../session';
import type { DocuPassDocumentCapturePayload } from '../types';

export interface DocumentCaptureScreenProps {
  payload: DocuPassDocumentCapturePayload;
  disabled?: boolean;
  style?: ViewStyle;
  onSubmit(frontBase64: string, backBase64?: string): void | Promise<void>;
}

function shouldCaptureBack(payload: DocuPassDocumentCapturePayload): boolean {
  if (!payload.documentType?.requiresBackSide) {
    return false;
  }
  if (payload.documentSide === 1) {
    return false;
  }
  return payload.documentSide === 2 || payload.documentSide == null || payload.documentSide === 0;
}

export function DocumentCaptureScreen({
  payload,
  disabled,
  style,
  onSubmit,
}: DocumentCaptureScreenProps) {
  const { Camera, useCameraDevice } = loadVisionCamera();
  const cameraRef = useRef<any>(null);
  const device = useCameraDevice('back');
  const [permission, setPermission] = useState<string>('not-determined');
  const [frontBase64, setFrontBase64] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const needsBack = useMemo(() => shouldCaptureBack(payload), [payload]);
  const captureLabel = frontBase64 && needsBack ? 'Capture back side' : 'Capture front side';

  useEffect(() => {
    let mounted = true;
    Camera.requestCameraPermission()
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
  }, [Camera]);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || disabled || busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      const path = photo.path ?? photo.uri;
      const base64 = await readImageFileAsBase64(path);
      if (!frontBase64 && needsBack) {
        setFrontBase64(base64);
      } else {
        await onSubmit(frontBase64 ?? base64, frontBase64 ? base64 : undefined);
        setFrontBase64(undefined);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [busy, disabled, frontBase64, needsBack, onSubmit]);

  if (permission !== 'granted') {
    return (
      <View style={[styles.center, style]}>
        <Text style={styles.title}>Camera permission required</Text>
        <Text style={styles.body}>Allow camera access to capture the document.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.center, style]}>
        <Text style={styles.title}>Camera unavailable</Text>
        <Text style={styles.body}>No back camera was found on this device.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, style]}>
      <Camera ref={cameraRef} style={StyleSheet.absoluteFill} device={device} isActive photo />
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.header}>
        <Text style={styles.title}>
          {payload.documentType?.label ?? 'Document'} {frontBase64 ? 'back' : 'front'}
        </Text>
        <Text style={styles.body}>
          {payload.country?.name ? `${payload.country.name} - ` : ''}
          Keep all document edges visible.
        </Text>
      </View>
      <View style={styles.frame} pointerEvents="none" />
      <View style={styles.footer}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={disabled || busy}
          style={({ pressed }) => [
            styles.button,
            (pressed || busy || disabled) && styles.buttonMuted,
          ]}
          onPress={takePhoto}
        >
          {busy ? <ActivityIndicator color="#071510" /> : <Text style={styles.buttonText}>{captureLabel}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 520,
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
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  body: {
    color: '#d7e4dc',
    fontSize: 14,
    marginTop: 6,
  },
  frame: {
    alignSelf: 'center',
    marginTop: 70,
    width: '86%',
    aspectRatio: 1.58,
    borderWidth: 3,
    borderColor: '#57d68d',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  footer: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 34,
    gap: 12,
  },
  button: {
    height: 54,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#57d68d',
  },
  buttonMuted: {
    opacity: 0.72,
  },
  buttonText: {
    color: '#071510',
    fontSize: 16,
    fontWeight: '800',
  },
  error: {
    color: '#ffb4ab',
    fontSize: 13,
  },
});
