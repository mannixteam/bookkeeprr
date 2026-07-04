'use client';

import { createContext, useContext } from 'react';
import { FALLBACK_VERSION } from '../../lib/version';

/**
 * Carries the server-resolved release version (see getAppVersion) to client
 * components. Seeded once in the root layout from the server-side fetch, so the
 * value is ISR-fresh and the browser never calls GitHub itself.
 */
const VersionContext = createContext<string>(FALLBACK_VERSION);

export function VersionProvider({
  version,
  children,
}: {
  version: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return <VersionContext.Provider value={version}>{children}</VersionContext.Provider>;
}

export function useAppVersion(): string {
  return useContext(VersionContext);
}
