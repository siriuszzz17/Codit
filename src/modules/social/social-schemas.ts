import { z } from "zod";

export const RESERVED_CODIT_USERNAMES = new Set<string>([
  "admin",
  "administrator",
  "administrador",
  "codit",
  "codit_oficial",
  "codit.oficial",
  "octopy",
  "octopy_oficial",
  "suporte",
  "support",
  "sistema",
  "system",
  "oficial",
  "official",
  "staff",
  "equipe",
  "moderador",
  "moderator",
  "mod",
  "root",
  "security",
  "seguranca",
  "help",
  "ajuda",
  "api",
  "auth",
  "conta",
  "comunidade",
  "perfil",
  "offline",
  "www",
  "mail",
  "noreply",
  "postmaster",
  "webmaster",
  "owner",
  "founder",
  "ceo",
]);

const USERNAME_FORMAT_REGEX = /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/;
const IMPERSONATION_SUFFIX_PATTERN =
  /^(?:codit|octopy)[._](?:oficial|official|admin|administrador|suporte|support|staff|equipe|mod|moderador|team|seguranca|security)$/;
const IMPERSONATION_PREFIX_PATTERN =
  /^(?:oficial|official|admin|administrador|suporte|support|staff|equipe|mod|moderador|team|seguranca|security)[._](?:codit|octopy)$/;

export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;
export const USERNAME_CHANGE_COOLDOWN_MS =
  USERNAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export interface UsernameChangeEligibility {
  canChange: boolean;
  isFirstDefinition: boolean;
  lastChangedAt: Date | null;
  nextAllowedAt: Date | null;
  remainingDays: number;
}

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

export function isImpersonationRiskUsername(normalized: string): boolean {
  return (
    IMPERSONATION_SUFFIX_PATTERN.test(normalized) ||
    IMPERSONATION_PREFIX_PATTERN.test(normalized)
  );
}

export function getUsernameChangeEligibility(
  usernameChangedAt: string | null | undefined,
  now: Date = new Date(),
): UsernameChangeEligibility {
  if (!usernameChangedAt) {
    return {
      canChange: true,
      isFirstDefinition: true,
      lastChangedAt: null,
      nextAllowedAt: null,
      remainingDays: 0,
    };
  }

  const parsedMs = Date.parse(usernameChangedAt);
  if (Number.isNaN(parsedMs)) {
    return {
      canChange: true,
      isFirstDefinition: true,
      lastChangedAt: null,
      nextAllowedAt: null,
      remainingDays: 0,
    };
  }

  const lastChangedAt = new Date(parsedMs);
  const nextAllowedMs = parsedMs + USERNAME_CHANGE_COOLDOWN_MS;
  const diffMs = nextAllowedMs - now.getTime();

  if (diffMs <= 0) {
    return {
      canChange: true,
      isFirstDefinition: false,
      lastChangedAt,
      nextAllowedAt: null,
      remainingDays: 0,
    };
  }

  const remainingDays = Math.max(
    1,
    Math.ceil(diffMs / (24 * 60 * 60 * 1000)),
  );

  return {
    canChange: false,
    isFirstDefinition: false,
    lastChangedAt,
    nextAllowedAt: new Date(nextAllowedMs),
    remainingDays,
  };
}

export function formatDateTimePtBr(input: Date | string): string {
  const timestamp = input instanceof Date ? input.getTime() : Date.parse(input);
  if (Number.isNaN(timestamp)) {
    return "em breve";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(timestamp);
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
    )
    .refine(
      (value) => !isImpersonationRiskUsername(value),
      "Este @usuário é reservado ou protegido contra impersonação no Codit.",
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
