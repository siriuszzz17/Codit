import { describe, expect, it } from "vitest";
import {
  buildAssertWorkerScript,
  normalizeRunnerPayload,
} from "@/modules/learning/assert-runner";
import {
  extractFunctionSignature,
  normalizeLessonMarkdown,
  parseLessonMarkdown,
  splitLessonSections,
} from "@/modules/learning/lesson-markdown";
import type { LessonTestCase } from "@/modules/learning/learning-schemas";

interface CatalogLessonFixture {
  slug: string;
  language: "javascript" | "python";
  starterCode: string;
  solutionCode: string;
  testCases: LessonTestCase[];
}

const JS_CATALOG_LESSONS: CatalogLessonFixture[] = [
  {
    slug: "variaveis-e-saudacao",
    language: "javascript",
    starterCode:
      'function saudar(nome) {\n  // Remova espaços extras e retorne a saudação esperada\n  return "";\n}\n',
    solutionCode:
      'function saudar(nome) {\n  const limpo = String(nome ?? "").trim();\n  if (!limpo) {\n    return "Olá, estudante!";\n  }\n  return `Olá, ${limpo}!`;\n}\n',
    testCases: [
      {
        id: "c1",
        label: "Saúda um nome simples",
        expression: 'saudar("Ana")',
        expected: "Olá, Ana!",
      },
      {
        id: "c2",
        label: "Remove espaços extras nas pontas",
        expression: 'saudar("  Lucas  ")',
        expected: "Olá, Lucas!",
      },
      {
        id: "c3",
        label: "Usa fallback para string vazia",
        expression: 'saudar("   ")',
        expected: "Olá, estudante!",
      },
    ],
  },
  {
    slug: "condicionais-e-logica",
    language: "javascript",
    starterCode:
      'function classificarNota(nota) {\n  // Retorne "Excelente", "Aprovado", "Recuperação" ou "Reprovado"\n}\n',
    solutionCode:
      'function classificarNota(nota) {\n  if (nota >= 9) return "Excelente";\n  if (nota >= 7) return "Aprovado";\n  if (nota >= 5) return "Recuperação";\n  return "Reprovado";\n}\n',
    testCases: [
      {
        id: "c1",
        label: "Nota 9.5 é Excelente",
        expression: "classificarNota(9.5)",
        expected: "Excelente",
      },
      {
        id: "c2",
        label: "Nota 7 é Aprovado",
        expression: "classificarNota(7)",
        expected: "Aprovado",
      },
      {
        id: "c3",
        label: "Nota 5.5 é Recuperação",
        expression: "classificarNota(5.5)",
        expected: "Recuperação",
      },
      {
        id: "c4",
        label: "Nota 4 é Reprovado",
        expression: "classificarNota(4)",
        expected: "Reprovado",
      },
    ],
  },
  {
    slug: "funcoes-e-calculos",
    language: "javascript",
    starterCode:
      "function aplicarDesconto(preco, percentual) {\n  // Calcule o preço com desconto arredondado para 2 casas\n}\n",
    solutionCode:
      "function aplicarDesconto(preco, percentual) {\n  const taxa = Math.min(100, Math.max(0, percentual));\n  const final = preco * (1 - taxa / 100);\n  return Math.round((final + Number.EPSILON) * 100) / 100;\n}\n",
    testCases: [
      {
        id: "c1",
        label: "Aplica 10% sobre 100",
        expression: "aplicarDesconto(100, 10)",
        expected: 90,
      },
      {
        id: "c2",
        label: "Arredonda para 2 casas decimais",
        expression: "aplicarDesconto(49.9, 15)",
        expected: 42.42,
      },
      {
        id: "c3",
        label: "Limita desconto negativo a 0%",
        expression: "aplicarDesconto(80, -20)",
        expected: 80,
      },
      {
        id: "c4",
        label: "Limita desconto acima de 100%",
        expression: "aplicarDesconto(80, 150)",
        expected: 0,
      },
    ],
  },
  {
    slug: "arrays-e-lacos",
    language: "javascript",
    starterCode:
      "function somarPositivos(numeros) {\n  // Some apenas os números maiores que zero\n}\n",
    solutionCode:
      "function somarPositivos(numeros) {\n  let total = 0;\n  for (const n of numeros) {\n    if (n > 0) {\n      total += n;\n    }\n  }\n  return total;\n}\n",
    testCases: [
      {
        id: "c1",
        label: "Soma positivos misturados com negativos",
        expression: "somarPositivos([3, -2, 7, 0, -5, 4])",
        expected: 14,
      },
      {
        id: "c2",
        label: "Retorna 0 para lista vazia",
        expression: "somarPositivos([])",
        expected: 0,
      },
      {
        id: "c3",
        label: "Ignora lista só com negativos",
        expression: "somarPositivos([-1, -10, 0])",
        expected: 0,
      },
    ],
  },
  {
    slug: "objetos-e-transformacao",
    language: "javascript",
    starterCode:
      "function resumirAluno(aluno) {\n  // Calcule a média e retorne { nome, media, aprovado }\n}\n",
    solutionCode:
      "function resumirAluno(aluno) {\n  const notas = Array.isArray(aluno.notas) ? aluno.notas : [];\n  const soma = notas.reduce((acc, n) => acc + n, 0);\n  const media = notas.length > 0 ? Number((soma / notas.length).toFixed(1)) : 0;\n  return {\n    nome: aluno.nome,\n    media,\n    aprovado: media >= 7,\n  };\n}\n",
    testCases: [
      {
        id: "c1",
        label: "Aluno aprovado com média exata",
        expression: 'resumirAluno({ nome: "Bia", notas: [8, 9, 7] })',
        expected: { nome: "Bia", media: 8, aprovado: true },
      },
      {
        id: "c2",
        label: "Aluno reprovado com arredondamento",
        expression: 'resumirAluno({ nome: "Caio", notas: [5, 6, 6] })',
        expected: { nome: "Caio", media: 5.7, aprovado: false },
      },
      {
        id: "c3",
        label: "Lista de notas vazia retorna média 0",
        expression: 'resumirAluno({ nome: "Duda", notas: [] })',
        expected: { nome: "Duda", media: 0, aprovado: false },
      },
    ],
  },
];

describe("lesson-markdown parser & formatting", () => {
  it("normalizes literal \\n sequences into real line breaks", () => {
    const raw =
      '### Desafio\\nCrie `saudar(nome)`\\n\\n### Regras\\n- Use `.trim()`';
    const normalized = normalizeLessonMarkdown(raw);
    expect(normalized).not.toContain("\\n");
    expect(normalized.split("\n")).toEqual([
      "### Desafio",
      "Crie `saudar(nome)`",
      "",
      "### Regras",
      "- Use `.trim()`",
    ]);
  });

  it("parses headings, lists, inline code, and fenced code blocks without raw markdown leakage", () => {
    const raw =
      '### Desafio\\nImplemente `resumirAluno(aluno)` retornando:\\n```js\\n{ nome, media }\\n```\\n\\n### Regras\\n- Use `media >= 7`.';
    const blocks = parseLessonMarkdown(raw);
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "code",
      "heading",
      "list",
    ]);

    const sections = splitLessonSections(raw);
    expect(sections.objectiveBlocks).toHaveLength(2);
    expect(sections.rulesBlocks).toHaveLength(1);
    expect(sections.rulesBlocks[0]?.type).toBe("list");
  });

  it("extracts function signatures for JS and Python starter code", () => {
    expect(
      extractFunctionSignature(
        "function aplicarDesconto(preco, percentual) {\n}\n",
        "javascript",
      ),
    ).toBe("function aplicarDesconto(preco, percentual)");

    expect(
      extractFunctionSignature(
        "def calcular_media(notas):\n    return 0\n",
        "python",
      ),
    ).toBe("def calcular_media(notas):");

    expect(
      extractFunctionSignature('nome = "Codit"\nidade = 20\n', "python"),
    ).toBeNull();
  });
});

describe("official catalog lessons validation & IEEE 754 precision", () => {
  it("passes 100% of registered JavaScript official solutions including aplicarDesconto(49.9, 15)", () => {
    for (const lesson of JS_CATALOG_LESSONS) {
      const messages: unknown[] = [];
      const runId = `catalog-${lesson.slug}`;
      const harness = buildAssertWorkerScript(
        lesson.solutionCode,
        lesson.testCases,
        runId,
      );
      new Function("self", harness)({
        postMessage: (msg: unknown) => messages.push(msg),
      });

      const summary = normalizeRunnerPayload(
        messages[0],
        runId,
        lesson.testCases,
      );
      expect(summary, `Lição ${lesson.slug} deve retornar resumo válido`).not.toBeNull();
      expect(
        summary?.passed,
        `Lição ${lesson.slug} falhou: ${JSON.stringify(summary?.results)}`,
      ).toBe(true);
      expect(summary?.passedCount).toBe(lesson.testCases.length);
    }
  });

  it("handles IEEE 754 floating-point drift in deepEqual tolerance", () => {
    const cases: LessonTestCase[] = [
      {
        id: "f1",
        label: "0.1 + 0.2 == 0.3",
        expression: "somar(0.1, 0.2)",
        expected: 0.3,
      },
    ];
    const messages: unknown[] = [];
    const harness = buildAssertWorkerScript(
      "function somar(a, b) { return a + b; }",
      cases,
      "run-float",
    );
    new Function("self", harness)({
      postMessage: (msg: unknown) => messages.push(msg),
    });

    const summary = normalizeRunnerPayload(messages[0], "run-float", cases);
    expect(summary?.passed).toBe(true);
  });
});
