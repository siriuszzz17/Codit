import type {
  SandboxLanguage,
  SandboxVisibility,
} from "@/lib/supabase/database.types";

export const SANDBOX_LANGUAGE_LABELS: Record<SandboxLanguage, string> = {
  html_css_js: "HTML / CSS / JS",
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
};

export const SANDBOX_VISIBILITY_LABELS: Record<SandboxVisibility, string> = {
  private: "Privado",
  friends: "Somente amigos",
  unlisted: "Não listado",
  public_portfolio: "Portfólio público",
};

export function formatDatePtBr(isoDate: string): string {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) {
    return "Agora";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

export function getInitials(
  name: string | null | undefined,
  fallback?: string | null,
): string {
  const source = (name || fallback || "C").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function isSafeHttpUrl(rawUrl: string | null | undefined): rawUrl is string {
  if (!rawUrl) {
    return false;
  }
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

const PREVIEW_CSP_META =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; img-src data: blob:;">';

export function buildSafeHtmlPreviewDoc(sourceCode: string): string {
  const trimmed = sourceCode.trim();

  if (/<head\b[^>]*>/i.test(trimmed)) {
    return trimmed.replace(/<head\b[^>]*>/i, (match) => `${match}\n${PREVIEW_CSP_META}`);
  }

  if (/<html\b[^>]*>/i.test(trimmed)) {
    return trimmed.replace(
      /<html\b[^>]*>/i,
      (match) => `${match}\n<head>${PREVIEW_CSP_META}</head>`,
    );
  }

  return [
    "<!DOCTYPE html>",
    '<html lang="pt-BR">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    PREVIEW_CSP_META,
    "<style>",
    "body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 16px; color: #141224; background: #ffffff; line-height: 1.5; }",
    "</style>",
    "</head>",
    "<body>",
    sourceCode,
    "</body>",
    "</html>",
  ].join("\n");
}
