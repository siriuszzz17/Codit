import { describe, expect, it, vi } from "vitest";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import {
  extractFailedCasesForAi,
  LessonAiTutorError,
  requestLessonAiHelp,
} from "@/modules/learning/lesson-ai-tutor-service";
import {
  buildCompactTutorUserPrompt,
  buildGeminiRequestBody,
  buildOpenAiRequestBody,
  DEFAULT_USER_MESSAGE,
  extractGeminiReply,
  extractOpenAiReply,
  LESSON_TUTOR_SYSTEM_PROMPT,
  MAX_OUTPUT_TOKENS,
  UserRateLimiter,
  validateLessonTutorInput,
} from "../../supabase/functions/lesson-ai-tutor/helpers";

describe("lesson-ai-tutor helpers", () => {
  it("applies default fallback message when mensagemUsuario is omitted or blank", () => {
    const res = validateLessonTutorInput({
      enunciado: "Implemente aplicarDesconto(preco, percentual).",
      codigoAtual: "function aplicarDesconto(p, d) { return p; }",
      casosFalhados: [
        {
          nome: "Aplica 10%",
          entrada: "aplicarDesconto(100, 10)",
          esperado: "90",
          recebido: "100",
        },
      ],
      mensagemUsuario: "   ",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.mensagemUsuario).toBe(DEFAULT_USER_MESSAGE);
      expect(res.data.casosFalhados).toHaveLength(1);
    }
  });

  it("rejects malformed or missing required fields cleanly", () => {
    expect(validateLessonTutorInput(null).ok).toBe(false);
    expect(validateLessonTutorInput({ codigoAtual: "x" }).ok).toBe(false);
    expect(validateLessonTutorInput({ enunciado: "ok" }).ok).toBe(false);
    expect(
      validateLessonTutorInput({
        enunciado: "ok",
        codigoAtual: "x",
        casosFalhados: "invalido",
      }).ok,
    ).toBe(false);
    expect(
      validateLessonTutorInput({
        enunciado: "ok",
        codigoAtual: "x",
        mensagemUsuario: "a".repeat(600),
      }).ok,
    ).toBe(false);
  });

  it("builds token-efficient prompt and enforces socratic anti-spoiler system rules", () => {
    expect(LESSON_TUTOR_SYSTEM_PROMPT).toContain("tutor socrático");
    expect(LESSON_TUTOR_SYSTEM_PROMPT).toContain("3 a 4 linhas");
    expect(LESSON_TUTOR_SYSTEM_PROMPT).toContain("PROIBIDO entregar o código da solução pronta");

    const prompt = buildCompactTutorUserPrompt({
      enunciado: "Some positivos",
      codigoAtual: "function somarPositivos(arr) { return 0; }",
      casosFalhados: [
        {
          nome: "Misturados",
          entrada: "somarPositivos([3, -2, 7])",
          esperado: "10",
          recebido: "0",
        },
      ],
      mensagemUsuario: DEFAULT_USER_MESSAGE,
    });

    expect(prompt).toContain("[ENUNCIADO]");
    expect(prompt).toContain("[CODIGO]");
    expect(prompt).toContain("[FALHAS]");
    expect(prompt).toContain("entrada: somarPositivos([3, -2, 7]) | esperado: 10 | recebido: 0");
    expect(prompt).toContain(DEFAULT_USER_MESSAGE);
  });

  it("enforces per-user cooldown and sliding-window rate limits", () => {
    let now = 1_000_000;
    const limiter = new UserRateLimiter({
      maxRequests: 2,
      windowMs: 60_000,
      cooldownMs: 4_000,
      nowFn: () => now,
    });

    expect(limiter.check("user-a").allowed).toBe(true);

    // Cooldown bloqueia chamada imediata do mesmo usuário, mas não afeta outro
    now += 1_000;
    const cooled = limiter.check("user-a");
    expect(cooled.allowed).toBe(false);
    expect(cooled.retryAfterSeconds).toBeGreaterThanOrEqual(3);
    expect(limiter.check("user-b").allowed).toBe(true);

    // Após cooldown, segunda requisição na janela passa
    now += 4_000;
    expect(limiter.check("user-a").allowed).toBe(true);

    // Terceira na mesma janela é bloqueada
    now += 5_000;
    const windowBlocked = limiter.check("user-a");
    expect(windowBlocked.allowed).toBe(false);
    expect(windowBlocked.retryAfterSeconds).toBeGreaterThan(0);

    // Após janela expirar, libera novamente
    now += 61_000;
    expect(limiter.check("user-a").allowed).toBe(true);
  });

  it("builds and parses Gemini and OpenAI payloads with bounded output tokens", () => {
    const input = {
      enunciado: "Retorne o dobro",
      codigoAtual: "function dobro(x) { return x; }",
      casosFalhados: [],
      mensagemUsuario: DEFAULT_USER_MESSAGE,
    };

    const geminiReq = buildGeminiRequestBody(input);
    expect(geminiReq.generationConfig.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
    expect(
      extractGeminiReply({
        candidates: [
          { content: { parts: [{ text: "Faltou multiplicar x por 2." }] } },
        ],
      }),
    ).toBe("Faltou multiplicar x por 2.");
    expect(extractGeminiReply({})).toBeNull();

    const openAiReq = buildOpenAiRequestBody(input);
    expect(openAiReq.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(
      extractOpenAiReply({
        choices: [{ message: { content: "Multiplique o parâmetro por 2." } }],
      }),
    ).toBe("Multiplique o parâmetro por 2.");
    expect(extractOpenAiReply({})).toBeNull();
  });
});

describe("lesson-ai-tutor-service client", () => {
  it("extracts only failed test cases with expected/actual or runtime error", () => {
    const failed = extractFailedCasesForAi([
      {
        id: "c1",
        label: "Caso OK",
        expression: "aplicarDesconto(100, 10)",
        passed: true,
        expectedFormatted: "90",
        actualFormatted: "90",
      },
      {
        id: "c2",
        label: "Arredondamento",
        expression: "aplicarDesconto(49.9, 15)",
        passed: false,
        expectedFormatted: "42.42",
        actualFormatted: "42.41",
      },
      {
        id: "c3",
        label: "Exceção",
        expression: "aplicarDesconto(80, -10)",
        passed: false,
        expectedFormatted: "80",
        actualFormatted: "erro",
        errorMessage: "ReferenceError: taxa is not defined",
      },
    ]);

    expect(failed).toEqual([
      {
        nome: "Arredondamento",
        entrada: "aplicarDesconto(49.9, 15)",
        esperado: "42.42",
        recebido: "42.41",
      },
      {
        nome: "Exceção",
        entrada: "aplicarDesconto(80, -10)",
        esperado: "80",
        recebido: "Erro: ReferenceError: taxa is not defined",
      },
    ]);
  });

  it("invokes lesson-ai-tutor Edge Function with slim payload and surfaces clean errors", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        data: { reply: "Verifique o arredondamento antes de retornar." },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: {
          context: new Response(
            JSON.stringify({ error: "Aguarde 4s antes de pedir uma nova análise." }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          ),
        },
      });

    const fakeClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "user-1" } } },
          error: null,
        }),
      },
      functions: { invoke },
    } as unknown as CoditSupabaseClient;

    const reply = await requestLessonAiHelp(
      {
        enunciado: "### Desafio\\nCalcule o desconto",
        codigoAtual: "function aplicarDesconto(p, d) { return p; }",
        casosFalhados: [
          {
            nome: "Aplica 10%",
            entrada: "aplicarDesconto(100, 10)",
            esperado: "90",
            recebido: "100",
          },
        ],
      },
      fakeClient,
    );

    expect(reply).toBe("Verifique o arredondamento antes de retornar.");
    expect(invoke).toHaveBeenCalledWith("lesson-ai-tutor", {
      body: {
        enunciado: "### Desafio\nCalcule o desconto",
        codigoAtual: "function aplicarDesconto(p, d) { return p; }",
        casosFalhados: [
          {
            nome: "Aplica 10%",
            entrada: "aplicarDesconto(100, 10)",
            esperado: "90",
            recebido: "100",
          },
        ],
      },
    });

    await expect(
      requestLessonAiHelp(
        {
          enunciado: "Calcule",
          codigoAtual: "x",
          casosFalhados: [],
        },
        fakeClient,
      ),
    ).rejects.toThrow(LessonAiTutorError);
  });
});
