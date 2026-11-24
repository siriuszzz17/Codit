// ==============================================================================
// Captura de mídia WebRTC estrita (RN-504: somente áudio de voz; RN-505: tela)
// Câmera de vídeo nunca é solicitada e qualquer faixa de vídeo não autorizada
// é rejeitada e interrompida imediatamente.
// ==============================================================================

const authorizedScreenShareTracks = new WeakSet<MediaStreamTrack>();

export class MediaCaptureCancelledError extends Error {
  constructor(message = "Compartilhamento de tela cancelado.") {
    super(message);
    this.name = "MediaCaptureCancelledError";
  }
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
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof RTCPeerConnection !== "undefined"
  );
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
    const stream = await mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

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
          "Nenhum microfone disponível foi encontrado neste dispositivo.",
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

export async function acquireScreenShareStream(
  mediaDevices: Pick<MediaDevices, "getDisplayMedia"> | undefined =
    typeof navigator !== "undefined" ? navigator.mediaDevices : undefined,
): Promise<MediaStream> {
  if (!mediaDevices || typeof mediaDevices.getDisplayMedia !== "function") {
    throw new Error(
      "O compartilhamento de tela não está disponível neste navegador ou dispositivo. Você ainda pode assistir às telas compartilhadas pelos amigos.",
    );
  }

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
