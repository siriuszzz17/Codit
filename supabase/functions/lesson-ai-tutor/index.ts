/**
 * Supabase Edge Function: lesson-ai-tutor
 * Proxy autenticado do Assistente IA (Octopy) para lições de código.
 *
 * Segredos configurados exclusivamente via Supabase Secrets (`Deno.env.get`):
 *   - SUPABASE_URL (automático no Supabase)
 *   - SUPABASE_SERVICE_ROLE_KEY (automático no Supabase)
 *   - AI_PROVIDER ("gemini" | "openai", padrão "gemini")
 *   - AI_PROVIDER_API_KEY
 *   - AI_MODEL (opcional)
 *   - AI_FALLBACK_PROVIDER (opcional: "gemini" | "openai")
 *   - AI_FALLBACK_API_KEY (opcional)
 *   - AI_FALLBACK_MODEL (opcional)
 */

import {
  AI_REQUEST_TIMEOUT_MS,
  buildGeminiRequestBody,
  buildOpenAiRequestBody,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
  extractGeminiReply,
  extractOpenAiReply,
  MAX_PAYLOAD_BYTES,
  UserRateLimiter,
  validateLessonTutorInput,
  type LessonTutorInput,
} from "./helpers.ts";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AiProvider = "gemini" | "openai";

interface ProviderConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
}

class TutorUpstreamError extends Error {
  readonly code: "timeout" | "upstream_error" | "invalid_response";

  constructor(code: "timeout" | "upstream_error" | "invalid_response") {
    super(code);
    this.name = "TutorUpstreamError";
    this.code = code;
  }
}

const rateLimiter = new UserRateLimiter();

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

async function authenticateBearerUser(
  req: Request,
  supabaseUrl: string,
  serviceKey: string,
): Promise<{ userId: string } | { error: Response }> {
  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const jwt = match?.[1]?.trim() ?? "";
  if (!jwt) {
    return {
      error: jsonResponse({ error: "Autenticação obrigatória." }, 401),
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const userRes = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${jwt}`,
        },
        signal: controller.signal,
      },
    );

    if (!userRes.ok) {
      return { error: jsonResponse({ error: "Sessão inválida." }, 401) };
    }

    const userJson = (await userRes.json()) as { id?: string };
    const userId = typeof userJson.id === "string" ? userJson.id : "";
    if (!UUID_REGEX.test(userId)) {
      return {
        error: jsonResponse({ error: "Usuário não identificado." }, 401),
      };
    }

    return { userId };
  } catch {
    return {
      error: jsonResponse(
        { error: "Não foi possível validar sua sessão agora." },
        503,
      ),
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseProviderName(raw: string | undefined): AiProvider | null {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "gemini" || normalized === "openai") {
    return normalized;
  }
  return null;
}

function resolveProviderChain(): ProviderConfig[] {
  const chain: ProviderConfig[] = [];

  const primaryProvider =
    parseProviderName(Deno.env.get("AI_PROVIDER")) ?? "gemini";
  const primaryKey = Deno.env.get("AI_PROVIDER_API_KEY")?.trim() ?? "";
  const primaryModel =
    Deno.env.get("AI_MODEL")?.trim() ||
    (primaryProvider === "gemini"
      ? DEFAULT_GEMINI_MODEL
      : DEFAULT_OPENAI_MODEL);

  if (primaryKey) {
    chain.push({
      provider: primaryProvider,
      apiKey: primaryKey,
      model: primaryModel,
    });
  }

  const fallbackProvider = parseProviderName(
    Deno.env.get("AI_FALLBACK_PROVIDER"),
  );
  const fallbackKey = Deno.env.get("AI_FALLBACK_API_KEY")?.trim() ?? "";
  if (fallbackProvider && fallbackKey) {
    const fallbackModel =
      Deno.env.get("AI_FALLBACK_MODEL")?.trim() ||
      (fallbackProvider === "gemini"
        ? DEFAULT_GEMINI_MODEL
        : DEFAULT_OPENAI_MODEL);
    chain.push({
      provider: fallbackProvider,
      apiKey: fallbackKey,
      model: fallbackModel,
    });
  }

  return chain;
}

async function callProvider(
  config: ProviderConfig,
  input: LessonTutorInput,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  try {
    let response: Response;

    if (config.provider === "gemini") {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify(buildGeminiRequestBody(input)),
        signal: controller.signal,
      });
    } else {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildOpenAiRequestBody(input, config.model)),
        signal: controller.signal,
      });
    }

    if (!response.ok) {
      throw new TutorUpstreamError("upstream_error");
    }

    const payload: unknown = await response.json();
    const reply =
      config.provider === "gemini"
        ? extractGeminiReply(payload)
        : extractOpenAiReply(payload);

    if (!reply) {
      throw new TutorUpstreamError("invalid_response");
    }

    return reply;
  } catch (err) {
    if (err instanceof TutorUpstreamError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new TutorUpstreamError("timeout");
    }
    throw new TutorUpstreamError("upstream_error");
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(
      { error: "Serviço do assistente temporariamente indisponível." },
      503,
    );
  }

  const authResult = await authenticateBearerUser(req, supabaseUrl, serviceKey);
  if ("error" in authResult) {
    return authResult.error;
  }

  const limit = rateLimiter.check(authResult.userId);
  if (!limit.allowed) {
    return jsonResponse(
      {
        error: `Aguarde ${limit.retryAfterSeconds}s antes de pedir uma nova análise.`,
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      429,
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
    return jsonResponse(
      { error: "Payload excede o limite permitido." },
      413,
    );
  }

  let rawBody: unknown;
  try {
    const rawText = await req.text();
    if (new TextEncoder().encode(rawText).byteLength > MAX_PAYLOAD_BYTES) {
      return jsonResponse(
        { error: "Payload excede o limite permitido." },
        413,
      );
    }
    rawBody = JSON.parse(rawText);
  } catch {
    return jsonResponse({ error: "Corpo JSON malformado." }, 400);
  }

  const validated = validateLessonTutorInput(rawBody);
  if (!validated.ok) {
    return jsonResponse({ error: validated.error }, 400);
  }

  const providers = resolveProviderChain();
  if (providers.length === 0) {
    return jsonResponse(
      { error: "Assistente IA não configurado no servidor." },
      503,
    );
  }

  let lastErrorCode: TutorUpstreamError["code"] = "upstream_error";

  for (const config of providers) {
    try {
      const reply = await callProvider(config, validated.data);
      return jsonResponse({ reply }, 200);
    } catch (err) {
      lastErrorCode =
        err instanceof TutorUpstreamError ? err.code : "upstream_error";
      console.error(
        `[lesson-ai-tutor] provider=${config.provider} code=${lastErrorCode}`,
      );
    }
  }

  if (lastErrorCode === "timeout") {
    return jsonResponse(
      {
        error:
          "O assistente demorou demais para responder. Tente novamente em instantes.",
      },
      504,
    );
  }

  return jsonResponse(
    {
      error:
        "Não foi possível gerar a orientação agora. Tente novamente em instantes.",
    },
    502,
  );
});
