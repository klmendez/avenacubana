import { useSyncExternalStore } from "react";

export const seenHints = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

export function replayGuide() {
  seenHints.clear();
  version++;
  listeners.forEach(notify => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}

export function useGuideVersion() {
  return useSyncExternalStore(subscribe, () => version);
}
