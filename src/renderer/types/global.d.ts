import type { PosDesktopApi } from '../../shared/types/ipc';

declare global {
  interface Window {
    posApi: PosDesktopApi;
  }
}

export {};
