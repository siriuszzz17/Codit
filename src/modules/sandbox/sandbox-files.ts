import type {
  SandboxLanguage,
  SandboxProjectFilesJson,
} from "@/lib/supabase/database.types";
import { LANGUAGE_CATALOG } from "@/modules/sandbox/language-catalog";

export type SandboxFileKey = "index.html" | "styles.css" | "script.js";

export interface SandboxProjectFiles {
  "index.html": string;
  "styles.css": string;
  "script.js": string;
}

export const SANDBOX_FILE_TABS: ReadonlyArray<{
  key: SandboxFileKey;
  label: string;
  editorLanguage: "html" | "css" | "javascript";
}> = [
  { key: "index.html", label: "index.html", editorLanguage: "html" },
  { key: "styles.css", label: "styles.css", editorLanguage: "css" },
  { key: "script.js", label: "script.js", editorLanguage: "javascript" },
] as const;

export const MAX_SANDBOX_FILES_TOTAL_LENGTH = 200_000;

export function isMultiFileWebLanguage(language: SandboxLanguage): boolean {
  return (
    language === "html_css_js" ||
    language === "html" ||
    language === "css" ||
    language === "javascript"
  );
}

export function getDefaultActiveTab(language: SandboxLanguage): SandboxFileKey {
  if (language === "css") {
    return "styles.css";
  }
  if (language === "javascript") {
    return "script.js";
  }
  return "index.html";
}

function dedentBlock(block: string): string {
  const lines = block.replace(/^\r?\n/, "").replace(/\r?\n\s*$/, "").split(/\r?\n/);
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) {
    return "";
  }
  const minIndent = Math.min(
    ...nonEmpty.map((line) => {
      const match = line.match(/^(\s*)/);
      return match?.[1]?.length ?? 0;
    }),
  );
  return lines.map((line) => line.slice(minIndent)).join("\n").trim();
}

export function normalizeSandboxFiles(
  raw: SandboxProjectFilesJson | null | undefined,
): SandboxProjectFiles | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const html = typeof candidate["index.html"] === "string" ? candidate["index.html"] : null;
  const css = typeof candidate["styles.css"] === "string" ? candidate["styles.css"] : null;
  const js = typeof candidate["script.js"] === "string" ? candidate["script.js"] : null;

  if (html === null && css === null && js === null) {
    return null;
  }

  return {
    "index.html": html ?? "",
    "styles.css": css ?? "",
    "script.js": js ?? "",
  };
}

export function extractFilesFromLegacySource(
  language: SandboxLanguage,
  sourceCode: string,
): SandboxProjectFiles {
  const raw = sourceCode ?? "";

  if (language === "css") {
    return {
      "index.html": "",
      "styles.css": raw,
      "script.js": "",
    };
  }

  if (language === "javascript") {
    return {
      "index.html": "",
      "styles.css": "",
      "script.js": raw,
    };
  }

  const styleMatches: string[] = [];
  let remaining = raw.replace(
    /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
    (_full, content: string) => {
      const cleaned = dedentBlock(content);
      if (cleaned) {
        styleMatches.push(cleaned);
      }
      return "";
    },
  );

  const scriptMatches: string[] = [];
  remaining = remaining.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    (full, attrs: string, content: string) => {
      if (/\bsrc\s*=/i.test(attrs)) {
        return full;
      }
      const cleaned = dedentBlock(content);
      if (cleaned) {
        scriptMatches.push(cleaned);
      }
      return "";
    },
  );

  const bodyMatch = remaining.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const htmlContent =
    bodyMatch?.[1] !== undefined
      ? dedentBlock(bodyMatch[1])
      : dedentBlock(remaining);

  return {
    "index.html": htmlContent,
    "styles.css": styleMatches.join("\n\n"),
    "script.js": scriptMatches.join("\n\n"),
  };
}

export function resolveProjectFiles(
  language: SandboxLanguage,
  sourceCode: string,
  persistedFiles?: SandboxProjectFilesJson | null,
): SandboxProjectFiles {
  const normalized = normalizeSandboxFiles(persistedFiles);
  if (normalized) {
    return normalized;
  }
  return extractFilesFromLegacySource(language, sourceCode);
}

export function getStarterFilesForLanguage(
  language: SandboxLanguage,
): SandboxProjectFiles {
  return extractFilesFromLegacySource(
    language,
    LANGUAGE_CATALOG[language].starterCode,
  );
}

function escapeStyleClose(css: string): string {
  return css.replace(/<\/(style)/gi, "\\3c/$1");
}

function escapeScriptClose(js: string): string {
  return js.replace(/<\/(script)/gi, "<\\/$1");
}

export function compileProjectFilesToSource(
  language: SandboxLanguage,
  files: SandboxProjectFiles,
): string {
  const html = files["index.html"] ?? "";
  const css = files["styles.css"] ?? "";
  const js = files["script.js"] ?? "";

  if (language === "javascript" && !html.trim() && !css.trim()) {
    return js;
  }

  if (language === "css" && !html.trim() && !js.trim()) {
    return css;
  }

  const styleBlock = css.trim()
    ? `    <style>\n${escapeStyleClose(css)}\n    </style>`
    : "";
  const scriptBlock = js.trim()
    ? `    <script>\n${escapeScriptClose(js)}\n    </script>`
    : "";

  if (/<html[\s>]/i.test(html) || /<!doctype\s+html/i.test(html)) {
    let compiled = html;
    if (styleBlock) {
      if (/<\/head>/i.test(compiled)) {
        compiled = compiled.replace(/<\/head>/i, () => `${styleBlock}\n</head>`);
      } else if (/<head[^>]*>/i.test(compiled)) {
        compiled = compiled.replace(
          /<head[^>]*>/i,
          (match) => `${match}\n${styleBlock}`,
        );
      } else {
        compiled = `${styleBlock}\n${compiled}`;
      }
    }
    if (scriptBlock) {
      if (/<\/body>/i.test(compiled)) {
        compiled = compiled.replace(/<\/body>/i, () => `${scriptBlock}\n</body>`);
      } else {
        compiled = `${compiled}\n${scriptBlock}`;
      }
    }
    return compiled;
  }

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
${styleBlock ? `${styleBlock}\n` : ""}  </head>
  <body>
${html}
${scriptBlock ? `${scriptBlock}\n` : ""}  </body>
</html>`;
}

export function getTotalFilesLength(files: SandboxProjectFiles): number {
  return (
    files["index.html"].length +
    files["styles.css"].length +
    files["script.js"].length
  );
}
