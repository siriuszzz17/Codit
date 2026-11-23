import { z } from "zod";

export const RESERVED_CODIT_USERNAMES = new Set<string>([
  "admin",
  "codit",
  "octopy",
  "suporte",
  "support",
  "sistema",
  "system",
  "api",
  "auth",
  "conta",
  "comunidade",
  "perfil",
  "offline",
]);

const USERNAME_FORMAT_REGEX = /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/;

export function normalizeUsernameInput(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function formatHandle(username: string | null | undefined): string {
  if (!username) {
    return "";
  }
  const normalized = normalizeUsernameInput(username);
  return normalized ? `@${normalized}` : "";
}

export const coditUsernameSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizeUsernameInput(value) : value),
  z
    .string({ error: "Informe um @usuário válido." })
    .min(3, "O @usuário deve ter pelo menos 3 caracteres.")
    .max(30, "O @usuário pode ter no máximo 30 caracteres.")
    .refine(
      (value) => USERNAME_FORMAT_REGEX.test(value),
      "Use apenas letras minúsculas, números, ponto ou sublinhado, começando e terminando com letra ou número.",
    )
    .refine(
      (value) => !/[._]{2}/.test(value),
      "O @usuário não pode conter pontos ou sublinhados consecutivos.",
    )
    .refine(
      (value) => !RESERVED_CODIT_USERNAMES.has(value),
      "Este @usuário é reservado pelo Codit. Escolha outro identificador.",
    ),
);

export function sanitizeCommunitySearchTerm(raw: string): {
  query: string;
  isHandleOnly: boolean;
} {
  const trimmed = raw.trim();
  const isHandleOnly = trimmed.startsWith("@");
  const withoutAt = trimmed.replace(/^@+/, "");

  // Remove metacaracteres estruturais de filtros PostgREST e escapa wildcards SQL.
  const withoutOperators = withoutAt.replace(/[,()*'"\\]/g, " ");
  const escapedWildcards = withoutOperators.replace(/[%_]/g, "\\$&");
  const normalized = escapedWildcards.replace(/\s+/g, " ").trim().slice(0, 60);

  return {
    query: normalized,
    isHandleOnly,
  };
}

export const createProjectCommentSchema = z.object({
  content: z
    .string({ error: "Escreva um comentário antes de enviar." })
    .trim()
    .min(1, "Escreva um comentário antes de enviar.")
    .max(500, "O comentário pode ter no máximo 500 caracteres."),
});

export const uuidSchema = z.string().uuid("Identificador inválido.");
