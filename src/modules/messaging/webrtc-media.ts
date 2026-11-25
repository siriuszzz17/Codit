// ==============================================================================
// Captura de mídia WebRTC estrita (RN-504: somente áudio de voz; RN-505: tela)
// Câmera de vídeo nunca é solicitada e qualquer faixa de vídeo não autorizada
// é rejeitada e interrompida imediatamente.
// ==============================================================================

import "@/lib/codit-native-bridge";

const authorizedScreenShareTracks = new WeakSet<MediaStreamTrack>();
const authorizedCameraTracks = new WeakSet<MediaStreamTrack>();

export class MediaCaptureCancelledError extends Error {
  constructor(message = "Compartilhamento de tela cancelado.") {
    super(message);
    this.name = "MediaCaptureCancelledError";
  }
}

export function isNativeAndroidScreenShareSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.CoditNative?.isScreenCaptureSupported === "function" &&
    window.CoditNative.isScreenCaptureSupported() === true
  );
}

export function canCaptureMicrophone(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof RTCPeerConnection !== "undefined"
  );
}

export function canShareScreen(): boolean {
  return (
    typeof RTCPeerConnection !== "undefined" &&
    ((typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getDisplayMedia === "function") ||
      isNativeAndroidScreenShareSupported())
  );
}

export function canCaptureCamera(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof RTCPeerConnection !== "undefined"
  );
}

export function isAuthorizedCameraTrack(
  track: MediaStreamTrack | null | undefined,
): boolean {
  if (!track) {
    return false;
  }
  return track.kind === "video" && authorizedCameraTracks.has(track);
}

export function isAuthorizedScreenShareTrack(
  track: MediaStreamTrack | null | undefined,
): boolean {
  if (!track) {
    return false;
  }
  return track.kind === "video" && authorizedScreenShareTracks.has(track);
}

export function stopMediaStream(
  stream: MediaStream | null | undefined,
): void {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Ignorar faixas já encerradas pelo navegador.
    }
  }
}

async function requestMicrophoneStreamWithFallback(
  mediaDevices: Pick<MediaDevices, "getUserMedia">,
): Promise<MediaStream> {
  try {
    return await mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "OverconstrainedError" || error.name === "TypeError")
    ) {
      return await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    }
    throw error;
  }
}

export async function acquireVoiceMicrophoneStream(
  mediaDevices: Pick<MediaDevices, "getUserMedia"> | undefined =
    typeof navigator !== "undefined" ? navigator.mediaDevices : undefined,
): Promise<MediaStream> {
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
    throw new Error(
      "Seu navegador ou dispositivo não oferece suporte para captura de microfone.",
    );
  }

  try {
    const stream = await requestMicrophoneStreamWithFallback(mediaDevices);

    // Defesa em profundidade (RN-504): nenhuma faixa de vídeo de câmera é permitida.
    for (const videoTrack of stream.getVideoTracks()) {
      try {
        videoTrack.stop();
      } catch {
        // noop
      }
      if (typeof stream.removeTrack === "function") {
        stream.removeTrack(videoTrack);
      }
    }

    if (stream.getAudioTracks().length === 0) {
      stopMediaStream(stream);
      throw new Error(
        "Nenhum canal de áudio foi encontrado no microfone selecionado.",
      );
    }

    return stream;
  } catch (error) {
    if (error instanceof DOMException) {
      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        throw new Error(
          "Permissão de microfone negada. Libere o acesso ao microfone nas configurações do navegador ou do sistema.",
        );
      }
      if (
        error.name === "NotFoundError" ||
        error.name === "DevicesNotFoundError"
      ) {
        throw new Error(
          "Nenhum microfone conectado neste dispositivo. Você pode ouvir os amigos normalmente.",
        );
      }
      if (
        error.name === "NotReadableError" ||
        error.name === "TrackStartError"
      ) {
        throw new Error(
          "Seu microfone está ocupado por outro aplicativo no momento.",
        );
      }
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Não foi possível iniciar a captura do microfone.");
  }
}

async function acquireNativeAndroidScreenShareStream(): Promise<MediaStream> {
  const bridge = typeof window !== "undefined" ? window.CoditNative : undefined;
  if (
    !bridge ||
    typeof bridge.startScreenCapture !== "function" ||
    typeof bridge.stopScreenCapture !== "function" ||
    typeof bridge.getScreenFrameSeq !== "function" ||
    typeof bridge.getScreenFrameDataUrl !== "function"
  ) {
    throw new Error("Ponte nativa de captura de tela indisponível.");
  }

  const startResult = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(
          new Error(
            "Tempo esgotado aguardando a autorização de compartilhamento de tela.",
          ),
        );
      }, 45_000);

      function cleanup() {
        window.clearTimeout(timeoutId);
        window.removeEventListener("codit:native-screen-started", onStarted);
        window.removeEventListener(
          "codit:native-screen-cancelled",
          onCancelled,
        );
        window.removeEventListener("codit:native-screen-error", onError);
      }

      function onStarted(event: Event) {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        const detail = (event as CustomEvent<{ width?: number; height?: number }>)
          .detail;
        resolve({
          width:
            detail && typeof detail.width === "number" && detail.width > 0
              ? detail.width
              : 540,
          height:
            detail && typeof detail.height === "number" && detail.height > 0
              ? detail.height
              : 960,
        });
      }

      function onCancelled() {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new MediaCaptureCancelledError());
      }

      function onError(event: Event) {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        const detail = (event as CustomEvent<{ message?: string }>).detail;
        reject(
          new Error(
            detail?.message ||
              "Não foi possível iniciar a captura de tela no Android.",
          ),
        );
      }

      window.addEventListener("codit:native-screen-started", onStarted);
      window.addEventListener("codit:native-screen-cancelled", onCancelled);
      window.addEventListener("codit:native-screen-error", onError);

      try {
        bridge.startScreenCapture!();
      } catch (err) {
        settled = true;
        cleanup();
        reject(
          err instanceof Error
            ? err
            : new Error("Falha ao abrir autorização de captura de tela."),
        );
      }
    },
  );

  const canvas = document.createElement("canvas");
  canvas.width = startResult.width;
  canvas.height = startResult.height;

  const ctx = canvas.getContext("2d");
  if (!ctx || typeof canvas.captureStream !== "function") {
    bridge.stopScreenCapture();
    throw new Error(
      "Este WebView Android não suporta transmissão de fluxo de tela.",
    );
  }

  ctx.fillStyle = "#0b0a16";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const stream = canvas.captureStream(12);
  const videoTracks = stream.getVideoTracks();
  if (videoTracks.length === 0) {
    bridge.stopScreenCapture();
    throw new Error("Não foi possível inicializar a faixa de tela no Android.");
  }

  let cleanedUp = false;
  let lastSeq = -1;
  let lastDrawAt = 0;
  let decodingFrame = false;
  const image = new Image();
  let hasImage = false;

  const pumpTimer = window.setInterval(() => {
    if (cleanedUp || !bridge.getScreenFrameSeq || !bridge.getScreenFrameDataUrl) {
      return;
    }

    const seq = bridge.getScreenFrameSeq();
    const now = Date.now();

    if (seq > 0 && seq !== lastSeq && !decodingFrame) {
      const dataUrl = bridge.getScreenFrameDataUrl();
      if (dataUrl) {
        decodingFrame = true;
        image.onload = () => {
          decodingFrame = false;
          if (cleanedUp || !ctx) {
            return;
          }
          if (
            image.naturalWidth > 0 &&
            image.naturalHeight > 0 &&
            (canvas.width !== image.naturalWidth ||
              canvas.height !== image.naturalHeight)
          ) {
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
          }
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          hasImage = true;
          lastSeq = seq;
          lastDrawAt = Date.now();
        };
        image.onerror = () => {
          decodingFrame = false;
        };
        image.src = dataUrl;
      }
      return;
    }

    // Keepalive para WebRTC continuar enviando keyframes em telas estáticas.
    if (hasImage && now - lastDrawAt >= 480) {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      lastDrawAt = now;
    }
  }, 95);

  function cleanupNativeProjection(notifyNativeStop: boolean) {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    window.clearInterval(pumpTimer);
    window.removeEventListener("codit:native-screen-stopped", onNativeStopped);
    if (notifyNativeStop) {
      try {
        bridge?.stopScreenCapture?.();
      } catch {
        // noop
      }
    }
  }

  function onNativeStopped() {
    cleanupNativeProjection(false);
    for (const track of videoTracks) {
      const onEndedHandler = track.onended;
      try {
        origStops.get(track)?.();
      } catch {
        // noop
      }
      if (typeof onEndedHandler === "function") {
        onEndedHandler.call(track, new Event("ended"));
      }
    }
  }

  const origStops = new WeakMap<MediaStreamTrack, () => void>();
  window.addEventListener("codit:native-screen-stopped", onNativeStopped);

  for (const track of videoTracks) {
    authorizedScreenShareTracks.add(track);
    const origStop = track.stop.bind(track);
    origStops.set(track, origStop);
    track.stop = () => {
      cleanupNativeProjection(true);
      origStop();
    };
  }

  return stream;
}

export async function acquireScreenShareStream(
  mediaDevices: Pick<MediaDevices, "getDisplayMedia"> | undefined =
    typeof navigator !== "undefined" ? navigator.mediaDevices : undefined,
): Promise<MediaStream> {
  // No Android APK (Capacitor), priorizar sempre o MediaProjection nativo porque
  // WebViews Chromium em contexto HTTPS podem expor `getDisplayMedia` sem picker nativo.
  if (isNativeAndroidScreenShareSupported()) {
    return acquireNativeAndroidScreenShareStream();
  }

  if (mediaDevices && typeof mediaDevices.getDisplayMedia === "function") {
    try {
      const stream = await mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 15, max: 24 },
        },
        audio: false,
      });

      // Remover áudio do sistema para evitar eco cruzado; o áudio da chamada vem do microfone.
      for (const audioTrack of stream.getAudioTracks()) {
        try {
          audioTrack.stop();
        } catch {
          // noop
        }
        if (typeof stream.removeTrack === "function") {
          stream.removeTrack(audioTrack);
        }
      }

      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length === 0) {
        stopMediaStream(stream);
        throw new Error("Nenhuma janela ou tela válida foi selecionada.");
      }

      for (const track of videoTracks) {
        authorizedScreenShareTracks.add(track);
        try {
          if ("contentHint" in track) {
            track.contentHint = "detail";
          }
        } catch {
          // contentHint pode ser somente leitura em alguns navegadores.
        }
      }

      return stream;
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === "AbortError" || error.name === "NotAllowedError") {
          throw new MediaCaptureCancelledError();
        }
        if (error.name === "NotFoundError") {
          throw new Error("Nenhuma tela disponível para compartilhamento.");
        }
        if (error.name === "NotReadableError") {
          throw new Error(
            "Não foi possível capturar a tela selecionada no sistema.",
          );
        }
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error("Não foi possível iniciar o compartilhamento de tela.");
    }
  }

  throw new Error(
    "Para compartilhar a tela do celular, abra o aplicativo Codit Android (.apk) ou use um navegador no computador. Você já pode assistir normalmente às telas dos seus amigos aqui!",
  );
}

export async function acquireCameraVideoStream(
  mediaDevices: Pick<MediaDevices, "getUserMedia"> | undefined =
    typeof navigator !== "undefined" ? navigator.mediaDevices : undefined,
  facingMode: "user" | "environment" = "user",
): Promise<MediaStream> {
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
    throw new Error(
      "Seu navegador ou dispositivo não oferece suporte para captura de câmera.",
    );
  }

  try {
    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: false,
      });
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "OverconstrainedError" || error.name === "TypeError")
      ) {
        stream = await mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      } else {
        throw error;
      }
    }

    for (const audioTrack of stream.getAudioTracks()) {
      try {
        audioTrack.stop();
      } catch {
        // noop
      }
      if (typeof stream.removeTrack === "function") {
        stream.removeTrack(audioTrack);
      }
    }

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      stopMediaStream(stream);
      throw new Error("Nenhuma câmera ativa foi encontrada neste dispositivo.");
    }

    for (const track of videoTracks) {
      authorizedCameraTracks.add(track);
      try {
        if ("contentHint" in track) {
          track.contentHint = "motion";
        }
      } catch {
        // noop
      }
    }

    return stream;
  } catch (error) {
    if (error instanceof DOMException) {
      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        throw new Error(
          "Permissão de câmera negada. Libere o acesso à câmera nas configurações do navegador ou do sistema.",
        );
      }
      if (
        error.name === "NotFoundError" ||
        error.name === "DevicesNotFoundError"
      ) {
        throw new Error("Nenhuma câmera conectada neste dispositivo.");
      }
      if (
        error.name === "NotReadableError" ||
        error.name === "TrackStartError"
      ) {
        throw new Error("Sua câmera está ocupada por outro aplicativo no momento.");
      }
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Não foi possível ativar a câmera.");
  }
}

export async function applyCameraVideoBitrateCap(
  sender: RTCRtpSender,
  maxBitrateBps = 1_500_000,
): Promise<void> {
  return applyScreenShareBitrateCap(sender, maxBitrateBps);
}

export async function applyScreenShareBitrateCap(
  sender: RTCRtpSender,
  maxBitrateBps = 1_200_000,
): Promise<void> {
  try {
    if (
      typeof sender.getParameters !== "function" ||
      typeof sender.setParameters !== "function"
    ) {
      return;
    }

    const parameters = sender.getParameters();
    if (!parameters.encodings || parameters.encodings.length === 0) {
      parameters.encodings = [{ maxBitrate: maxBitrateBps }];
    } else {
      parameters.encodings = parameters.encodings.map((encoding) => ({
        ...encoding,
        maxBitrate: maxBitrateBps,
      }));
    }

    await sender.setParameters(parameters);
  } catch {
    // Nem todas as WebViews suportam setParameters com maxBitrate.
  }
}

export function createVoiceActivityMonitor(
  stream: MediaStream,
  onSpeakingChange: (speaking: boolean) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const AudioContextCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextCtor || stream.getAudioTracks().length === 0) {
    return () => {};
  }

  let closed = false;
  let lastSpeaking = false;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let context: AudioContext | null = null;

  try {
    context = new AudioContextCtor();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    timerId = setInterval(() => {
      if (closed) {
        return;
      }

      const activeTrack = stream.getAudioTracks()[0];
      if (!activeTrack || !activeTrack.enabled || activeTrack.readyState !== "live") {
        if (lastSpeaking) {
          lastSpeaking = false;
          onSpeakingChange(false);
        }
        return;
      }

      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let index = 0; index < data.length; index += 1) {
        sum += data[index] ?? 0;
      }
      const average = data.length > 0 ? sum / data.length : 0;
      const speaking = average > 12;

      if (speaking !== lastSpeaking) {
        lastSpeaking = speaking;
        onSpeakingChange(speaking);
      }
    }, 160);
  } catch {
    if (context) {
      void context.close().catch(() => undefined);
    }
    return () => {};
  }

  return () => {
    closed = true;
    if (timerId !== null) {
      clearInterval(timerId);
    }
    if (lastSpeaking) {
      onSpeakingChange(false);
    }
    if (context && context.state !== "closed") {
      void context.close().catch(() => undefined);
    }
  };
}

export function playIncomingCallChime(): void {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextCtor) {
    return;
  }

  try {
    const context = new AudioContextCtor();
    const now = context.currentTime;

    const notes = [523.25, 659.25];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.14;
      const end = start + 0.18;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, end);

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(start);
      oscillator.stop(end + 0.02);
    });

    setTimeout(() => {
      if (context.state !== "closed") {
        void context.close().catch(() => undefined);
      }
    }, 650);
  } catch {
    // Autoplay pode bloquear antes da interação do usuário.
  }
}

export function startIncomingCallRingtone(intervalMs = 2_800): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let stopped = false;
  playIncomingCallChime();
  const timerId = window.setInterval(() => {
    if (!stopped) {
      playIncomingCallChime();
    }
  }, intervalMs);

  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    window.clearInterval(timerId);
  };
}
