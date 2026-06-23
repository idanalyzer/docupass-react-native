import { useEffect, useMemo, useRef, useState } from 'react';
import { createDocuPassSession, createPendingSessionCommands } from './session';
import type {
  DocuPassConfig,
  DocuPassKycSession,
  DocuPassKycState,
  UseDocuPassKycOptions,
  UseDocuPassKycResult,
} from './types';

function dependencyKey(config: DocuPassConfig): string {
  return JSON.stringify({
    reference: config.reference,
    partyId: config.partyId,
    baseUrl: config.baseUrl,
    sessionId: config.sessionId,
    authorization: config.authorization,
    geolocation: config.geolocation,
    enabled: config.enabled,
    disableSSLValidation: config.disableSSLValidation,
    disableSslValidation: config.disableSslValidation,
    timeout: config.timeout,
    connectTimeoutMs: config.connectTimeoutMs,
    readTimeoutMs: config.readTimeoutMs,
  });
}

export function useDocuPassKyc(
  config: DocuPassConfig,
  options: UseDocuPassKycOptions = {}
): UseDocuPassKycResult {
  const [session, setSession] = useState<DocuPassKycSession>();
  const [state, setState] = useState<DocuPassKycState>();
  const [error, setError] = useState<Error>();
  const configKey = dependencyKey(config);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let cancelled = false;
    let activeSession: DocuPassKycSession | undefined;
    let unsubscribe: (() => void) | undefined;

    setSession(undefined);
    setState(undefined);
    setError(undefined);

    createDocuPassSession(config)
      .then((created) => {
        if (cancelled) {
          void created.close();
          return;
        }

        activeSession = created;
        setSession(created);
        unsubscribe = created.subscribe((nextState) => {
          setState(nextState);
          optionsRef.current.onStateChange?.(nextState);
        });

        if (optionsRef.current.autoStart !== false) {
          void created.start();
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught : new Error(String(caught)));
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (activeSession) {
        void activeSession.close();
      }
    };
  }, [configKey]);

  const commands = useMemo(() => createPendingSessionCommands(session), [session]);

  return {
    session,
    state,
    isReady: !!session,
    error,
    ...commands,
  };
}
