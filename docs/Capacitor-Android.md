# Capacitor & Android Nativo — Codit (`TCC-Codit`)

## 1. Configuração Capacitor & Build Android (`v0.1.15`)

- **`capacitor.config.ts`:** `appId: "com.codit.app"`, `appName: "Codit"`, `webDir: "out"`, `server.androidScheme: "https"`, `SystemBars.insetsHandling: "disable"`, `LocalNotifications` (`ic_stat_codit`, `#8B6BFF`), `PushNotifications.presentationOptions: []`.
- **`android/app/build.gradle`:** `versionCode 16`, `versionName "0.1.15"`, `outputFileName = "Codit-mobile.apk"`, `com.google.firebase:firebase-messaging:25.0.1` + `google-services.json`.
- **Ponte `window.CoditNative` (`MainActivity.java` & `src/lib/codit-native-bridge.ts`):**
  - Safe-area/IME (`getInsets`), Screen Share `MediaProjection` (`isScreenCaptureSupported`, `startScreenCapture`, `stopScreenCapture`, `getScreenFrameSeq`, `getScreenFrameDataUrl`, `getScreenDimensions`), Sessão REST (`syncAuthSession`, `clearAuthSession`), Notificações/Chamadas (`showRichNotification`, `dismissNotificationTag`, `startOrUpdateCallNotification`, `stopCallNotification`, `consumePendingNavigationHref`).
  - Eventos WebView: `codit:native-screen-{started,stopped,cancelled,error}`, `codit:native-call-action`, `codit:native-reply-sent`, `codit:native-notification-reply`, `codit:native-navigate`.

---

## 2. Permissões & Serviços (`AndroidManifest.xml`)

- **Permissões:** `INTERNET`, `ACCESS_WIFI_STATE`, `POST_NOTIFICATIONS`, `VIBRATE`, `WAKE_LOCK`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `CAMERA`, `FOREGROUND_SERVICE` + `_MEDIA_PROJECTION`, `_MICROPHONE`, `_MEDIA_PLAYBACK`, `_CAMERA`.
- **Serviços & Receivers:** `CoditFirebaseMessagingService` (substitui o serviço padrão do Capacitor), `ScreenCaptureService`, `CallForegroundService` (`NOTIFICATION_ID = 4101`), `NotificationActionReceiver` (`ACTION_DIRECT_REPLY`, `ACTION_CALL_TOGGLE_MUTE`, `ACTION_CALL_HANGUP`).
- **Hardening:** `allowBackup="false"`, `usesCleartextTraffic="false"`, `network_security_config.xml`, Deep Link `com.codit.app://auth/callback`.

---

## 3. Comandos & Diferenças Web vs. WebView

- **Build & Sync:** `npm run android:sync` (`npm run build` + `cap sync android`); build APK em `android/` via `.\gradlew.bat assembleDebug` / `assembleRelease`.
- **Diferenças Críticas:**
  - `CapacitorHttp.get` usado em `app-updater.ts` para evitar CORS ao baixar `latest.json`.
  - `ScreenCaptureService` supre a ausência de `getDisplayMedia` na WebView Android.
  - Pyodide WASM roda em Web Worker (`https://cdn.jsdelivr.net/pyodide/v0.27.4/full/`) sobre esquema `https://localhost` do Capacitor.
  - Câmera e microfone estão alinhados e habilitados nas 3 plataformas (Web, Android `CoditWebChromeClient` e Tauri `src-tauri/src/lib.rs`).

## 4. Navegação
[[INDEX]] · [[Auth-Seguranca]] · [[Backend]] · [[Frontend]] · [[Fluxos-Criticos]] · [[STATE]]
