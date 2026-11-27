export const DEFAULT_USER_MESSAGE =
  "Me ajude a entender o que está faltando no meu código";

export const AI_REQUEST_TIMEOUT_MS = 12_000;
export const MAX_PAYLOAD_BYTES = 32_768;

export const MAX_ENUNCIADO_CHARS = 2_500;
export const MAX_CODIGO_CHARS = 10_000;
export const MAX_MENSAGEM_CHARS = 500;
export const MAX_FAILED_CASES = 8;
export const MAX_CASE_FIELD_CHARS = 240;

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 6;
export const RATE_LIMIT_COOLDOWN_MS = 4_000;

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const MAX_OUTPUT_TOKENS = 260;

export const KEY_RATE_LIMIT_COOLDOWN_MS = 60_000;
export const KEY_AUTH_ERROR_COOLDOWN_MS = 300_000;
export const KEY_MAX_COOLDOWN_MS = 300_000;
export const MAX_NUMBERED_API_KEYS = 10;

export type AiProvider = "gemini" | "openai";

export interface ProviderConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  slot: string;
}

export const LESSON_TUTOR_SYSTEM_PROMPT = [
  "Você é o Octopy, tutor socrático de programação do Codit.",
  "Responda sempre em português (pt-BR), de forma direta e didática.",
  "Regras estritas:",
  "1. Diagnostique a causa exata da falha no código atual do aluno em no máximo 3 a 4 linhas curtas.",
  "2. Indique apenas o próximo passo lógico ou pergunta guia para o aluno corrigir sozinho.",
  "3. PROIBIDO entregar o código da solução pronta, reescrever a função completa ou fornecer trechos copiáveis que resolvam o exercício.",
  "4. Sem saudações, sem elogios genéricos e sem repetir o enunciado.",
].join("\n");

export interface FailedTestCaseInput {
  nome: string;
  entrada: string;
  esperado: string;
  recebido: string;
}

export interface LessonTutorInput {
  enunciado: string;
  codigoAtual: string;
  casosFalhados: FailedTestCaseInput[];
  mensagemUsuario: string;
}

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function compactText(value: string, maxChars: number): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars)}…`;
}

function formatCompactField(value: unknown, maxChars: number): string {
  if (typeof value === "string") {
    return compactText(value, maxChars);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }
  if (value === undefined) {
    return "";
  }
  try {
    return compactText(JSON.stringify(value), maxChars);
  } catch {
    return "";
  }
}

export function validateLessonTutorInput(
  raw: unknown,
): ValidationResult<LessonTutorInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Payload JSON inválido." };
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.enunciado !== "string" || !body.enunciado.trim()) {
    return { ok: false, error: "O campo 'enunciado' é obrigatório." };
  }
  if (body.enunciado.length > MAX_ENUNCIADO_CHARS * 2) {
    return {
      ok: false,
      error: "O enunciado excede o tamanho máximo permitido.",
    };
  }

  if (typeof body.codigoAtual !== "string") {
    return { ok: false, error: "O campo 'codigoAtual' é obrigatório." };
  }
  if (body.codigoAtual.length > MAX_CODIGO_CHARS * 2) {
    return {
      ok: false,
      error: "O código enviado excede o tamanho máximo permitido.",
    };
  }

  let casosFalhados: FailedTestCaseInput[] = [];
  if (body.casosFalhados !== undefined) {
    if (!Array.isArray(body.casosFalhados)) {
      return {
        ok: false,
        error: "O campo 'casosFalhados' deve ser uma lista.",
      };
    }

    const parsedCases: FailedTestCaseInput[] = [];
    for (const item of body.casosFalhados.slice(0, MAX_FAILED_CASES)) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        return {
          ok: false,
          error: "Cada item em 'casosFalhados' deve ser um objeto válido.",
        };
      }
      const entry = item as Record<string, unknown>;
      const nome = formatCompactField(entry.nome, MAX_CASE_FIELD_CHARS);
      const entrada = formatCompactField(entry.entrada, MAX_CASE_FIELD_CHARS);
      const esperado = formatCompactField(entry.esperado, MAX_CASE_FIELD_CHARS);
      const recebido = formatCompactField(entry.recebido, MAX_CASE_FIELD_CHARS);

      if (!nome && !entrada) {
        return {
          ok: false,
          error: "Cada caso falhado precisa informar 'nome' ou 'entrada'.",
        };
      }

      parsedCases.push({ nome, entrada, esperado, recebido });
    }
    casosFalhados = parsedCases;
  }

  let mensagemUsuario = DEFAULT_USER_MESSAGE;
  if (body.mensagemUsuario !== undefined && body.mensagemUsuario !== null) {
    if (typeof body.mensagemUsuario !== "string") {
      return {
        ok: false,
        error: "O campo 'mensagemUsuario' deve ser texto.",
      };
    }
    const trimmed = body.mensagemUsuario.trim();
    if (trimmed.length > MAX_MENSAGEM_CHARS) {
      return {
        ok: false,
        error: `A mensagem pode ter no máximo ${MAX_MENSAGEM_CHARS} caracteres.`,
      };
    }
    if (trimmed.length > 0) {
      mensagemUsuario = trimmed;
    }
  }

  return {
    ok: true,
    data: {
      enunciado: compactText(body.enunciado, MAX_ENUNCIADO_CHARS),
      codigoAtual: compactText(body.codigoAtual, MAX_CODIGO_CHARS),
      casosFalhados,
      mensagemUsuario,
    },
  };
}

/**
 * Monta o prompt de usuário no formato mais enxuto possível para economia de tokens.
 */
export function buildCompactTutorUserPrompt(input: LessonTutorInput): string {
  const parts: string[] = [
    `[ENUNCIADO]\n${input.enunciado}`,
    `[CODIGO]\n${input.codigoAtual || "(vazio)"}`,
  ];

  if (input.casosFalhados.length > 0) {
    const failedLines = input.casosFalhados.map((c, idx) => {
      const title = c.nome || `Caso ${idx + 1}`;
      return `- ${title} | entrada: ${c.entrada || "-"} | esperado: ${c.esperado || "-"} | recebido: ${c.recebido || "-"}`;
    });
    parts.push(`[FALHAS]\n${failedLines.join("\n")}`);
  } else {
    parts.push("[FALHAS]\nNenhum caso falhado informado.");
  }

  parts.push(`[DUVIDA]\n${input.mensagemUsuario}`);
  return parts.join("\n\n");
}

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Rate limiter em memória por userId com cooldown curto + limite em janela deslizante.
 */
export class UserRateLimiter {
  private readonly timestamps = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  private readonly nowFn: () => number;

  constructor(options?: {
    maxRequests?: number;
    windowMs?: number;
    cooldownMs?: number;
    nowFn?: () => number;
  }) {
    this.maxRequests = options?.maxRequests ?? RATE_LIMIT_MAX_REQUESTS;
    this.windowMs = options?.windowMs ?? RATE_LIMIT_WINDOW_MS;
    this.cooldownMs = options?.cooldownMs ?? RATE_LIMIT_COOLDOWN_MS;
    this.nowFn = options?.nowFn ?? (() => Date.now());
  }

  check(userId: string): RateLimitCheckResult {
    const now = this.nowFn();
    const cutoff = now - this.windowMs;
    const history = (this.timestamps.get(userId) ?? []).filter(
      (ts) => ts > cutoff,
    );

    const lastTs = history[history.length - 1];
    if (lastTs !== undefined && now - lastTs < this.cooldownMs) {
      const remainingMs = this.cooldownMs - (now - lastTs);
      this.timestamps.set(userId, history);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      };
    }

    if (history.length >= this.maxRequests) {
      const oldestTs = history[0] ?? now;
      const remainingMs = Math.max(1000, oldestTs + this.windowMs - now);
      this.timestamps.set(userId, history);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      };
    }

    history.push(now);
    this.timestamps.set(userId, history);

    // Limpeza oportunista se o mapa crescer demais
    if (this.timestamps.size > 500) {
      for (const [key, list] of this.timestamps.entries()) {
        const active = list.filter((ts) => ts > cutoff);
        if (active.length === 0) {
          this.timestamps.delete(key);
        } else {
          this.timestamps.set(key, active);
        }
      }
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export function buildGeminiRequestBody(input: LessonTutorInput) {
  return {
    system_instruction: {
      parts: [{ text: LESSON_TUTOR_SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: buildCompactTutorUserPrompt(input) }],
      },
    ],
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  };
}

export function extractGeminiReply(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }
  const first = candidates[0] as {
    content?: { parts?: Array<{ text?: unknown }> };
  };
  const parts = first?.content?.parts;
  if (!Array.isArray(parts)) {
    return null;
  }
  const text = parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .join("")
    .trim();
  return text || null;
}

export function buildOpenAiRequestBody(
  input: LessonTutorInput,
  model: string = DEFAULT_OPENAI_MODEL,
) {
  return {
    model,
    temperature: 0.25,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: "system", content: LESSON_TUTOR_SYSTEM_PROMPT },
      { role: "user", content: buildCompactTutorUserPrompt(input) },
    ],
  };
}

export function extractOpenAiReply(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

export function parseProviderName(raw: string | undefined): AiProvider | null {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "gemini" || normalized === "openai") {
    return normalized;
  }
  return null;
}

/**
 * Extrai múltiplas chaves de API separadas por vírgula, ponto e vírgula ou quebra de linha,
 * preservando a ordem de prioridade e removendo duplicatas.
 */
export function parseApiKeyList(
  rawValues: ReadonlyArray<string | undefined>,
): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];

  for (const raw of rawValues) {
    if (!raw) continue;
    for (const part of raw.split(/[,;\r\n]+/)) {
      const cleaned = part.trim();
      if (!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      keys.push(cleaned);
    }
  }

  return keys;
}

/**
 * Monta a cadeia sequencial de chaves/provedores a partir de um leitor de variáveis de ambiente.
 * Suporta:
 * - AI_PROVIDER_API_KEY (única ou separada por vírgula)
 * - AI_PROVIDER_API_KEYS (lista separada por vírgula/linha)
 * - AI_PROVIDER_API_KEY_1 .. AI_PROVIDER_API_KEY_10
 * - AI_FALLBACK_PROVIDER + AI_FALLBACK_API_KEY / AI_FALLBACK_API_KEYS / AI_FALLBACK_API_KEY_1..10
 */
export function buildProviderChainFromEnv(
  getEnv: (name: string) => string | undefined,
): ProviderConfig[] {
  const chain: ProviderConfig[] = [];

  const primaryProvider = parseProviderName(getEnv("AI_PROVIDER")) ?? "gemini";
  const primaryModel =
    getEnv("AI_MODEL")?.trim() ||
    (primaryProvider === "gemini"
      ? DEFAULT_GEMINI_MODEL
      : DEFAULT_OPENAI_MODEL);

  const primaryRawKeys: Array<string | undefined> = [
    getEnv("AI_PROVIDER_API_KEY"),
    getEnv("AI_PROVIDER_API_KEYS"),
  ];
  for (let i = 1; i <= MAX_NUMBERED_API_KEYS; i += 1) {
    primaryRawKeys.push(getEnv(`AI_PROVIDER_API_KEY_${i}`));
  }

  const primaryKeys = parseApiKeyList(primaryRawKeys);
  primaryKeys.forEach((apiKey, index) => {
    chain.push({
      provider: primaryProvider,
      apiKey,
      model: primaryModel,
      slot: `${primaryProvider}#${index + 1}`,
    });
  });

  const fallbackProvider = parseProviderName(getEnv("AI_FALLBACK_PROVIDER"));
  if (fallbackProvider) {
    const fallbackModel =
      getEnv("AI_FALLBACK_MODEL")?.trim() ||
      (fallbackProvider === "gemini"
        ? DEFAULT_GEMINI_MODEL
        : DEFAULT_OPENAI_MODEL);

    const fallbackRawKeys: Array<string | undefined> = [
      getEnv("AI_FALLBACK_API_KEY"),
      getEnv("AI_FALLBACK_API_KEYS"),
    ];
    for (let i = 1; i <= MAX_NUMBERED_API_KEYS; i += 1) {
      fallbackRawKeys.push(getEnv(`AI_FALLBACK_API_KEY_${i}`));
    }

    const fallbackKeys = parseApiKeyList(fallbackRawKeys);
    fallbackKeys.forEach((apiKey, index) => {
      chain.push({
        provider: fallbackProvider,
        apiKey,
        model: fallbackModel,
        slot: `fallback:${fallbackProvider}#${index + 1}`,
      });
    });
  }

  return chain;
}

/**
 * Controla cooldown em memória por slot de chave: usa a 1ª chave até ela bater limite (429/401/403),
 * pula imediatamente para a 2ª, depois 3ª, e volta a tentar chaves anteriores após o cooldown expirar.
 */
export class ProviderKeyCooldownTracker {
  private readonly cooldownUntil = new Map<string, number>();
  private readonly nowFn: () => number;

  constructor(nowFn: () => number = () => Date.now()) {
    this.nowFn = nowFn;
  }

  markRateLimited(slot: string, retryAfterHeader?: string | null): void {
    const parsedSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
    const durationMs =
      Number.isFinite(parsedSeconds) && parsedSeconds > 0
        ? Math.min(KEY_MAX_COOLDOWN_MS, Math.ceil(parsedSeconds * 1000))
        : KEY_RATE_LIMIT_COOLDOWN_MS;
    this.cooldownUntil.set(slot, this.nowFn() + durationMs);
  }

  markAuthFailed(slot: string): void {
    this.cooldownUntil.set(slot, this.nowFn() + KEY_AUTH_ERROR_COOLDOWN_MS);
  }

  clear(slot: string): void {
    this.cooldownUntil.delete(slot);
  }

  isCoolingDown(slot: string): boolean {
    const until = this.cooldownUntil.get(slot);
    if (until === undefined) return false;
    if (this.nowFn() >= until) {
      this.cooldownUntil.delete(slot);
      return false;
    }
    return true;
  }

  orderCandidates(chain: readonly ProviderConfig[]): ProviderConfig[] {
    const ready: ProviderConfig[] = [];
    const cooling: ProviderConfig[] = [];
    for (const item of chain) {
      if (this.isCoolingDown(item.slot)) {
        cooling.push(item);
      } else {
        ready.push(item);
      }
    }
    return [...ready, ...cooling];
  }
}
