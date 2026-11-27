export type MarkdownInlineToken =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; value: string };

export type MarkdownBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; tokens: MarkdownInlineToken[] }
  | { type: "list"; items: MarkdownInlineToken[][] }
  | { type: "code"; language: string; content: string };

export interface ParsedLessonSections {
  objectiveBlocks: MarkdownBlock[];
  rulesBlocks: MarkdownBlock[];
  extraBlocks: MarkdownBlock[];
}

/**
 * Normaliza sequências literais `\\n` e quebras CRLF para `\n` reais.
 */
export function normalizeLessonMarkdown(raw: string): string {
  if (!raw) {
    return "";
  }
  return raw
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();
}

/**
 * Tokeniza apenas inline code (`...`) e negrito (**...**) sem interpretar HTML.
 */
export function parseInlineMarkdown(line: string): MarkdownInlineToken[] {
  const tokens: MarkdownInlineToken[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(line);

  while (match !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: "text",
        value: line.slice(lastIndex, match.index),
      });
    }
    if (match[1] !== undefined) {
      tokens.push({ type: "code", value: match[1] });
    } else if (match[2] !== undefined) {
      tokens.push({ type: "strong", value: match[2] });
    }
    lastIndex = pattern.lastIndex;
    match = pattern.exec(line);
  }

  if (lastIndex < line.length) {
    tokens.push({ type: "text", value: line.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: "text", value: line }];
}

/**
 * Parser Markdown minimalista e sanitizado (AST pura, zero HTML cru).
 * Suporta headings (## / ###), listas (- / *), blocos de código (```) e inline code (`).
 */
export function parseLessonMarkdown(raw: string): MarkdownBlock[] {
  const normalized = normalizeLessonMarkdown(raw);
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i] ?? "";
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced code block ```lang
    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) {
        i += 1;
      }
      blocks.push({
        type: "code",
        language,
        content: codeLines.join("\n"),
      });
      continue;
    }

    // Headings ### ou ##
    const headingMatch = /^(#{2,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1]?.length === 2 ? 2 : 3;
      blocks.push({
        type: "heading",
        level,
        text: (headingMatch[2] ?? "").trim(),
      });
      i += 1;
      continue;
    }

    // Listas - item ou * item
    if (/^[-*]\s+/.test(trimmed)) {
      const items: MarkdownInlineToken[][] = [];
      while (i < lines.length) {
        const current = (lines[i] ?? "").trim();
        const itemMatch = /^[-*]\s+(.+)$/.exec(current);
        if (!itemMatch) {
          break;
        }
        items.push(parseInlineMarkdown((itemMatch[1] ?? "").trim()));
        i += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    // Parágrafo (agrupa linhas contínuas que não iniciam outro bloco)
    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const current = (lines[i] ?? "").trim();
      if (
        !current ||
        current.startsWith("```") ||
        /^#{2,3}\s+/.test(current) ||
        /^[-*]\s+/.test(current)
      ) {
        break;
      }
      paragraphLines.push(current);
      i += 1;
    }
    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        tokens: parseInlineMarkdown(paragraphLines.join(" ")),
      });
    }
  }

  return blocks;
}

/**
 * Agrupa blocos do enunciado em Objetivo, Regras e seções extras para escaneabilidade.
 */
export function splitLessonSections(raw: string): ParsedLessonSections {
  const blocks = parseLessonMarkdown(raw);
  const objectiveBlocks: MarkdownBlock[] = [];
  const rulesBlocks: MarkdownBlock[] = [];
  const extraBlocks: MarkdownBlock[] = [];

  let activeSection: "objective" | "rules" | "extra" = "objective";

  for (const block of blocks) {
    if (block.type === "heading") {
      const normalizedTitle = block.text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      if (normalizedTitle.includes("regra")) {
        activeSection = "rules";
        continue;
      }
      if (
        normalizedTitle.includes("desafio") ||
        normalizedTitle.includes("objetivo") ||
        objectiveBlocks.length === 0
      ) {
        activeSection = "objective";
        continue;
      }
      activeSection = "extra";
      extraBlocks.push(block);
      continue;
    }

    if (activeSection === "rules") {
      rulesBlocks.push(block);
    } else if (activeSection === "extra") {
      extraBlocks.push(block);
    } else if (block.type === "list" && rulesBlocks.length === 0 && objectiveBlocks.length > 0) {
      rulesBlocks.push(block);
    } else {
      objectiveBlocks.push(block);
    }
  }

  return { objectiveBlocks, rulesBlocks, extraBlocks };
}

/**
 * Extrai a assinatura principal da função a partir do starter_code da lição.
 */
export function extractFunctionSignature(
  starterCode: string,
  language: string,
): string | null {
  const normalized = normalizeLessonMarkdown(starterCode);
  if (!normalized) {
    return null;
  }

  const isPython = language.toLowerCase() === "python";
  if (isPython) {
    const pyMatch = /^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\))/m.exec(
      normalized,
    );
    return pyMatch?.[1] ? `def ${pyMatch[1].trim()}:` : null;
  }

  const jsFnMatch =
    /^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\))/m.exec(
      normalized,
    );
  if (jsFnMatch?.[1]) {
    return `function ${jsFnMatch[1].trim()}`;
  }

  const jsArrowMatch =
    /^\s*(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/m.exec(
      normalized,
    );
  if (jsArrowMatch?.[1]) {
    return `const ${jsArrowMatch[1]} = (${jsArrowMatch[2]?.trim() ?? ""}) =>`;
  }

  return null;
}
