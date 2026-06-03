import type { ViewStyle } from 'react-native';

export type DocuPassResultStatus = 'completed' | 'failed' | 'cancelled' | 'error';

/** Result delivered to `onResult`. The verification data lives server-side —
 *  fetch it with `GET /docupass/{reference}` using your API key. */
export interface DocuPassResultEvent {
  status: DocuPassResultStatus;
  reference: string;
  /** Terminal/error code (e.g. DOCUPASS_COMPLETED, DOCUPASS_FAILED). */
  code?: string;
  message?: string;
  /** Server-configured redirect URL, when present. */
  redirectUrl?: string;
}

export interface DocuPassViewProps {
  /** The DocuPass reference (create server-side via POST /docupass). */
  reference: string;
  /** Optional party sign-token for multi-party contract flows. */
  partyId?: string;
  /** Optional base URL override (on-prem ID Fort). */
  baseUrl?: string;
  style?: ViewStyle;
  onResult?: (event: DocuPassResultEvent) => void;
}
