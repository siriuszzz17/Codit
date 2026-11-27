"use client";

import { useMemo, useState } from "react";

export interface CodeMessageBlockProps {
  code: string;
  language?: string | undefined;
  filename?: string | undefined;
  compact?: boolean | undefined;
}

type TokenKind = "plain" | "keyword" | "string" | "number" | "comment" | "tag";

interface HighlightToken {
  kind: TokenKind;
  value: string;
}

const KEYWORD_SET = new Set([
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "def",
  "default",
  "elif",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "fn",
  "for",
  "from",
  "func",
  "function",
  "if",
  "import",
  "in",
  "interface",
  "let",
  "match",
  "new",
  "None",
  "null",
  "package",
  "private",
  "public",
  "return",
  "select",
  "SELECT",
  "FROM",
  "WHERE",
  "static",
  "struct",
  "switch",
  "this",
  "throw",
  "true",
  "True",
  "False",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
]);

const TOKEN_REGEX =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|<\/?[a-zA-Z][\w-]*[^>]*>|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g;

export function tokenizeCodeLine(line: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let lastIndex = 0;

  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        kind: "plain",
        value: line.slice(lastIndex, match.index),
      });
    }

    const raw = match[0];
    let kind: TokenKind = "plain";
    if (
      raw.startsWith("//") ||
      raw.startsWith("/*") ||
      raw.startsWith("#")
    ) {
      kind = "comment";
    } else if (
      raw.startsWith('"') ||
      raw.startsWith("'") ||
      raw.startsWith("`")
    ) {
      kind = "string";
    } else if (raw.startsWith("<") && raw.endsWith(">")) {
      kind = "tag";
    } else if (/^\d/.test(raw)) {
      kind = "number";
    } else if (KEYWORD_SET.has(raw)) {
      kind = "keyword";
    }

    tokens.push({ kind, value: raw });
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ kind: "plain", value: line.slice(lastIndex) });
  }

  return tokens;
}

const TOKEN_CLASS_MAP: Record<TokenKind, string> = {
  plain: "text-slate-100",
  keyword: "font-semibold text-violet-300",
  string: "text-emerald-300",
  number: "text-amber-300",
  comment: "italic text-slate-400",
  tag: "text-sky-300",
};

export function CodeMessageBlock({
  code,
  language = "text",
  filename,
  compact = false,
}: CodeMessageBlockProps) {
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => {
    const normalized = code.replace(/\r\n/g, "\n");
    return normalized.split("\n").map((line) => tokenizeCodeLine(line));
  }, [code]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="w-full min-w-[220px] max-w-full overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950 text-slate-100 shadow-xs">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-3 py-1.5 text-[11px]">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded bg-violet-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-violet-200">
            {language}
          </span>
          {filename ? (
            <span className="truncate font-mono text-slate-300">{filename}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="shrink-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-200 transition-colors hover:border-violet-400 hover:text-white"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre
        className={`overflow-x-auto p-3 font-mono text-xs leading-relaxed ${
          compact ? "max-h-56" : "max-h-80"
        }`}
      >
        <code>
          {lines.map((lineTokens, lineIdx) => (
            <div key={lineIdx} className="flex gap-3">
              <span
                aria-hidden="true"
                className="w-6 shrink-0 select-none text-right text-[10px] text-slate-500"
              >
                {lineIdx + 1}
              </span>
              <span className="min-w-0 whitespace-pre">
                {lineTokens.length === 0
                  ? " "
                  : lineTokens.map((token, tokenIdx) => (
                      <span
                        key={tokenIdx}
                        className={TOKEN_CLASS_MAP[token.kind]}
                      >
                        {token.value}
                      </span>
                    ))}
              </span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
