import { create } from 'zustand';

// A new app version is downloaded in the background and then waits. It is applied only when
// the user agrees (or at a cold start without a running workout), so an update never reloads
// the page in the middle of an entry.

interface UpdateState {
  ready: boolean;
  /** Set by main.tsx: activates the waiting version and reloads. */
  apply: () => void;
}

export const useUpdate = create<UpdateState>(() => ({ ready: false, apply: () => {} }));

export const markUpdateReady = () => useUpdate.setState({ ready: true });
export const setApplyUpdate = (apply: () => void) => useUpdate.setState({ apply });
