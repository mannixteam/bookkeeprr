'use client';

import { useRef, useState } from 'react';
import { FrenchIsbnLookup, type FrenchIsbnLookupHandle } from './FrenchIsbnLookup';
import { FrenchTitleLookup } from './FrenchTitleLookup';

/** Only the ISBN crosses from title discovery into the verified add flow. */
export function FrenchEditionDiscovery() {
  const lookup = useRef<FrenchIsbnLookupHandle>(null);
  const [busy, setBusy] = useState(false);
  return <>
    <FrenchTitleLookup selectionDisabled={busy} onSelectIsbn={isbn => lookup.current?.lookupIsbn(isbn)} />
    <FrenchIsbnLookup ref={lookup} onBusyChange={setBusy} />
  </>;
}
