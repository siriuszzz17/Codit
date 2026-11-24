export interface CoditNativeBridge {
  getInsets(): string;
  isScreenCaptureSupported?: () => boolean;
  startScreenCapture?: () => void;
  stopScreenCapture?: () => void;
  getScreenFrameSeq?: () => number;
  getScreenFrameDataUrl?: () => string;
  getScreenDimensions?: () => string;
}

declare global {
  interface Window {
    /** Injetado por `MainActivity` (Android/Capacitor). Ausente na Web, PWA e Tauri. */
    CoditNative?: CoditNativeBridge;
  }
}
