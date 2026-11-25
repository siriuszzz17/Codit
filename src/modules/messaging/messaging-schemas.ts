import { z } from "zod";
import { uuidSchema } from "@/modules/social/social-schemas";

export const MAX_GROUP_MEMBERS = 10;
export const MAX_GROUP_INVITEES = MAX_GROUP_MEMBERS - 1;
export const MIN_GROUP_INVITEES = 1;
export const MAX_GROUP_TITLE_LENGTH = 80;
export const MAX_MESSAGE_LENGTH = 2000;
export const CALL_RINGING_TIMEOUT_SECONDS = 60;
export const CALL_RINGING_TIMEOUT_MS = CALL_RINGING_TIMEOUT_SECONDS * 1000;

export const DEFAULT_WEBRTC_ICE_SERVERS: ReadonlyArray<RTCIceServer> = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
    ],
  },
  {
    urls: "stun:stun.cloudflare.com:3478",
  },
];

export const sendChatMessageSchema = z.object({
  content: z
    .string({ error: "Escreva uma mensagem antes de enviar." })
    .trim()
    .min(1, "Escreva uma mensagem antes de enviar.")
    .max(
      MAX_MESSAGE_LENGTH,
      `A mensagem pode ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.`,
    ),
});

export const groupTitleSchema = z
  .string({ error: "Informe um nome para o grupo." })
  .trim()
  .min(1, "Informe um nome para o grupo.")
  .max(
    MAX_GROUP_TITLE_LENGTH,
    `O nome do grupo pode ter no máximo ${MAX_GROUP_TITLE_LENGTH} caracteres.`,
  );

export const createGroupConversationSchema = z.object({
  title: groupTitleSchema,
  memberIds: z
    .array(uuidSchema, { error: "Selecione pelo menos 1 amigo para o grupo." })
    .transform((ids) => Array.from(new Set(ids)))
    .refine(
      (ids) => ids.length >= MIN_GROUP_INVITEES,
      "Convide pelo menos 1 amigo para criar um grupo.",
    )
    .refine(
      (ids) => ids.length <= MAX_GROUP_INVITEES,
      `Grupos no Codit permitem no máximo ${MAX_GROUP_MEMBERS} pessoas (você + até ${MAX_GROUP_INVITEES} amigos).`,
    ),
});

export type GroupAdditionValidationResult =
  | { ok: true; newMemberIds: string[] }
  | { ok: false; message: string };

export function validateGroupMemberAddition(
  currentActiveCount: number,
  existingMemberIds: ReadonlyArray<string>,
  candidateFriendIds: ReadonlyArray<string>,
): GroupAdditionValidationResult {
  const uniqueCandidates: string[] = [];
  const seen = new Set<string>();

  for (const rawId of candidateFriendIds) {
    const parsed = uuidSchema.safeParse(rawId);
    if (!parsed.success) {
      return { ok: false, message: "Identificador de amigo inválido." };
    }
    if (!seen.has(parsed.data)) {
      seen.add(parsed.data);
      uniqueCandidates.push(parsed.data);
    }
  }

  const existingSet = new Set(existingMemberIds);
  const newMemberIds = uniqueCandidates.filter((id) => !existingSet.has(id));

  if (newMemberIds.length === 0) {
    return {
      ok: false,
      message: "Selecione pelo menos 1 amigo que ainda não esteja no grupo.",
    };
  }

  if (
    currentActiveCount >= MAX_GROUP_MEMBERS ||
    currentActiveCount + newMemberIds.length > MAX_GROUP_MEMBERS
  ) {
    return {
      ok: false,
      message: `Grupos no Codit permitem no máximo ${MAX_GROUP_MEMBERS} pessoas participantes.`,
    };
  }

  return { ok: true, newMemberIds };
}

const signalBaseSchema = {
  conversationId: uuidSchema,
  fromUserId: uuidSchema,
  toUserId: uuidSchema,
  fromSessionId: z.string().trim().min(1).max(120),
  toSessionId: z.string().trim().min(1).max(120).optional(),
};

const videoTrackMetaSchema = z
  .object({
    cameraStreamId: z.string().trim().min(1).max(160).nullable().optional(),
    screenStreamId: z.string().trim().min(1).max(160).nullable().optional(),
  })
  .optional();

export const callSignalEnvelopeSchema = z.discriminatedUnion("kind", [
  z.object({
    ...signalBaseSchema,
    kind: z.literal("offer"),
    sdp: z.object({
      type: z.literal("offer"),
      sdp: z.string().min(1),
    }),
    videoTrackMeta: videoTrackMetaSchema,
  }),
  z.object({
    ...signalBaseSchema,
    kind: z.literal("answer"),
    sdp: z.object({
      type: z.literal("answer"),
      sdp: z.string().min(1),
    }),
    videoTrackMeta: videoTrackMetaSchema,
  }),
  z.object({
    ...signalBaseSchema,
    kind: z.literal("ice-candidate"),
    candidate: z.object({
      candidate: z.string(),
      sdpMid: z.string().nullable().optional(),
      sdpMLineIndex: z.number().nullable().optional(),
      usernameFragment: z.string().nullable().optional(),
    }),
  }),
  z.object({
    ...signalBaseSchema,
    kind: z.literal("video-track-state"),
    trackKind: z.enum(["camera", "screen"]),
    active: z.boolean(),
    streamId: z.string().trim().min(1).max(160).nullable().optional(),
    trackId: z.string().trim().min(1).max(160).nullable().optional(),
  }),
  z.object({
    ...signalBaseSchema,
    kind: z.literal("camera-stopped"),
  }),
  z.object({
    ...signalBaseSchema,
    kind: z.literal("screen-share-stopped"),
  }),
  z.object({
    ...signalBaseSchema,
    kind: z.literal("call-timeout"),
    callId: uuidSchema.optional(),
    reason: z.enum(["missed", "timeout"]).default("missed"),
    timedOutAt: z.string().min(1),
  }),
  z.object({
    ...signalBaseSchema,
    kind: z.literal("hangup"),
  }),
]);

export type CallSignalEnvelope = z.infer<typeof callSignalEnvelopeSchema>;

export const incomingCallNoticeSchema = z.object({
  callId: uuidSchema.optional(),
  conversationId: uuidSchema,
  conversationTitle: z.string().trim().min(1).max(MAX_GROUP_TITLE_LENGTH),
  isGroup: z.boolean(),
  callerId: uuidSchema,
  callerName: z.string().trim().min(1).max(120),
  callerUsername: z.string().trim().min(1).max(30),
  callerAvatarUrl: z.string().nullable().optional(),
  hasVideo: z.boolean().optional(),
  timeoutSeconds: z.number().int().min(10).max(120).optional(),
  sentAt: z.string().min(1),
});

export type IncomingCallNotice = z.infer<typeof incomingCallNoticeSchema>;

export const callTimeoutNoticeSchema = z.object({
  callId: uuidSchema.optional(),
  conversationId: uuidSchema,
  callerId: uuidSchema,
  reason: z.enum(["missed", "timeout", "cancelled"]).default("missed"),
  timedOutAt: z.string().min(1),
});

export type CallTimeoutNotice = z.infer<typeof callTimeoutNoticeSchema>;

const iceUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => /^(?:stuns?|turns?):/i.test(value),
    "URL ICE inválida.",
  );

const iceServerEntrySchema = z.object({
  urls: z.union([iceUrlSchema, z.array(iceUrlSchema).min(1)]),
  username: z.string().optional(),
  credential: z.string().optional(),
});

const iceServersArraySchema = z.array(iceServerEntrySchema).min(1).max(12);

export function resolveWebRtcIceServers(rawJson?: string): RTCIceServer[] {
  const source =
    rawJson !== undefined
      ? rawJson
      : process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON;

  if (!source || !source.trim()) {
    return DEFAULT_WEBRTC_ICE_SERVERS.map((entry) => ({ ...entry }));
  }

  try {
    const parsedJson: unknown = JSON.parse(source);
    const validated = iceServersArraySchema.safeParse(parsedJson);
    if (!validated.success) {
      return DEFAULT_WEBRTC_ICE_SERVERS.map((entry) => ({ ...entry }));
    }

    return validated.data.map((entry) => ({
      urls: entry.urls,
      ...(entry.username !== undefined ? { username: entry.username } : {}),
      ...(entry.credential !== undefined
        ? { credential: entry.credential }
        : {}),
    }));
  } catch {
    return DEFAULT_WEBRTC_ICE_SERVERS.map((entry) => ({ ...entry }));
  }
}
