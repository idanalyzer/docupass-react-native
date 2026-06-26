import { useEffect, useMemo, useState } from 'react';
import { DocupassKycSession } from './session';
import { DocupassApiConfig, DocupassKycUiState, KYCStep } from './types';

export interface UseDocupassKycOptions {
  config: DocupassApiConfig;
  workflow?: KYCStep[];
  autoStart?: boolean;
}

export function useDocupassKyc({
  config,
  workflow,
  autoStart = true,
}: UseDocupassKycOptions): DocupassKycUiState & { session: DocupassKycSession } {
  const session = useMemo(
    () => new DocupassKycSession(config, workflow),
    // Consumers should memoize config/workflow when they do not want a new session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(config), JSON.stringify(workflow || [])],
  );
  const [state, setState] = useState<DocupassKycUiState>(() => session.currentState());

  useEffect(() => {
    const subscription = session.subscribe(setState);
    if (autoStart) {
      session.start();
    }
    return () => {
      subscription.close();
      session.close();
    };
  }, [autoStart, session]);

  return { ...state, session };
}

