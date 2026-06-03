import React from 'react';
import {
  requireNativeComponent,
  UIManager,
  Platform,
  type NativeSyntheticEvent,
} from 'react-native';
import type { DocuPassResultEvent, DocuPassViewProps } from './types';

const COMPONENT_NAME = 'DocuPassView';

const LINKING_ERROR =
  `The native component '${COMPONENT_NAME}' is not linked. Make sure:\n` +
  '- you rebuilt the app after installing @idanalyzer/docupass-react-native\n' +
  '- the native cores are available (Android: com.idanalyzer:docupass; iOS: DocuPass pod)\n';

type NativeProps = {
  reference: string;
  partyId?: string;
  baseUrl?: string;
  style?: any;
  onResult?: (event: NativeSyntheticEvent<DocuPassResultEvent>) => void;
};

const NativeDocuPassView =
  UIManager.getViewManagerConfig(COMPONENT_NAME) != null
    ? requireNativeComponent<NativeProps>(COMPONENT_NAME)
    : () => {
        throw new Error(LINKING_ERROR);
      };

/**
 * Drop-in DocuPass verification view. Wraps the native Android/iOS DocuPass SDK.
 *
 * ```tsx
 * <DocuPassView
 *   reference="US…"
 *   style={{ flex: 1 }}
 *   onResult={(r) => console.log(r.status, r.reference)}
 * />
 * ```
 */
export function DocuPassView({ onResult, ...props }: DocuPassViewProps) {
  const Comp = NativeDocuPassView as React.ComponentType<NativeProps>;
  return (
    <Comp
      {...props}
      onResult={(e: NativeSyntheticEvent<DocuPassResultEvent>) => onResult?.(e.nativeEvent)}
    />
  );
}

export const isSupported = Platform.OS === 'android' || Platform.OS === 'ios';
