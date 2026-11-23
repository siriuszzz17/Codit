import { logError } from "@/lib/logger";

export type MissingMigrationFile =
  | "20261123000001_enhance_profiles_and_projects.sql"
  | "20261123000002_add_social_network.sql"
  | "20261123000003_fix_grants_rls_and_username_cooldown.sql";

export interface SupabaseErrorContext {
  status?: number | null;
  table?: string;
  operation?: string;
}

export interface SupabaseErrorMeta {
  message: string;
  code: string;
  status: number | null;
  details: string;
  hint: string;
}

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  error_code?: unknown;
  status?: unknown;
  details?: unknown;
  hint?: unknown;
}

export function extractSupabaseErrorMeta(
  error: unknown,
  context?: SupabaseErrorContext,
): SupabaseErrorMeta {
  const contextStatus =
    typeof context?.status === "number" ? context.status : null;

  if (error instanceof Error) {
    const candidate = error as Error & ErrorLike;
    const rawCode =
      typeof candidate.code === "string"
        ? candidate.code
        : typeof candidate.error_code === "string"
          ? candidate.error_code
          : "";
    return {
      message: error.message,
      code: rawCode,
      status: typeof candidate.status === "number" ? candidate.status : contextStatus,
      details: typeof candidate.details === "string" ? candidate.details : "",
      hint: typeof candidate.hint === "string" ? candidate.hint : "",
    };
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as ErrorLike;
    const rawCode =
      typeof candidate.code === "string"
        ? candidate.code
        : typeof candidate.error_code === "string"
          ? candidate.error_code
          : "";
    return {
      message: typeof candidate.message === "string" ? candidate.message : "",
      code: rawCode,
      status: typeof candidate.status === "number" ? candidate.status : contextStatus,
      details: typeof candidate.details === "string" ? candidate.details : "",
      hint: typeof candidate.hint === "string" ? candidate.hint : "",
    };
  }

  if (typeof error === "string") {
    return {
      message: error,
      code: "",
      status: contextStatus,
      details: "",
      hint: "",
    };
  }

  return {
    message: "",
    code: "",
    status: contextStatus,
    details: "",
    hint: "",
  };
}

function isNetworkFailure(messageLower: string): boolean {
  return (
    messageLower.includes("failed to fetch") ||
    messageLower.includes("networkerror") ||
    messageLower.includes("network request failed") ||
    messageLower.includes("fetch failed") ||
    messageLower.includes("load failed")
  );
}

function formatDiagnosticSuffix(status: number | null, code: string): string {
  const parts: string[] = [];
  if (typeof status === "number" && status > 0) {
    parts.push(`HTTP ${status}`);
  }
  if (code) {
    parts.push(`código ${code}`);
  }
  return parts.length > 0 ? ` (${parts.join(" · ")})` : "";
}

function formatCooldownDatePtBr(rawIso: string | null): string | null {
  if (!rawIso) {
    return null;
  }
  const timestamp = Date.parse(rawIso);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(timestamp);
}

export function isTablePrivilegeError(error: unknown): boolean {
  const { message, code, details, hint } = extractSupabaseErrorMeta(error);
  const codeUpper = code.toUpperCase();
  const combinedLower = `${message} ${details} ${hint}`.toLowerCase();

  return (
    codeUpper === "42501" &&
    /permission denied for (?:table|schema|function|relation)/i.test(combinedLower)
  );
}

export function isUsernameCooldownError(error: unknown): {
  active: boolean;
  nextAllowedIso: string | null;
} {
  const { message, details } = extractSupabaseErrorMeta(error);
  const combined = `${message} ${details}`;
  const match = combined.match(/USERNAME_COOLDOWN_ACTIVE:([^\s,;]+)/i);
  if (!match) {
    return { active: false, nextAllowedIso: null };
  }
  return {
    active: true,
    nextAllowedIso: match[1] ?? null,
  };
}

export function isSchemaMismatchError(error: unknown): boolean {
  const { message, code, details, hint } = extractSupabaseErrorMeta(error);
  const combinedLower = `${message} ${details} ${hint}`.toLowerCase();
  const codeUpper = code.toUpperCase();

  return (
    codeUpper === "42703" ||
    codeUpper === "PGRST204" ||
    combinedLower.includes("schema cache") ||
    combinedLower.includes("could not find the") ||
    combinedLower.includes("chk_sandbox_projects_language")
  );
}

export function isMissingDatabaseSchemaError(error: unknown): boolean {
  const { message, code, details } = extractSupabaseErrorMeta(error);
  const messageLower = `${message} ${details}`.toLowerCase();
  const codeUpper = code.toUpperCase();

  return (
    codeUpper === "42P01" ||
    codeUpper === "42703" ||
    codeUpper === "42883" ||
    codeUpper === "PGRST202" ||
    codeUpper === "PGRST204" ||
    codeUpper === "PGRST205" ||
    messageLower.includes("could not find the table") ||
    messageLower.includes("could not find the function") ||
    messageLower.includes("schema cache") ||
    messageLower.includes("does not exist")
  );
}

export function detectMissingMigrationName(
  error: unknown,
): MissingMigrationFile | null {
  if (isTablePrivilegeError(error)) {
    return "20261123000003_fix_grants_rls_and_username_cooldown.sql";
  }

  const { message, details, hint } = extractSupabaseErrorMeta(error);
  const combinedLower = `${message} ${details} ${hint}`.toLowerCase();

  if (
    combinedLower.includes("username_changed_at") ||
    combinedLower.includes("is_reserved_or_impersonation_username")
  ) {
    return "20261123000003_fix_grants_rls_and_username_cooldown.sql";
  }

  if (
    combinedLower.includes("public_profiles") ||
    combinedLower.includes("friendships") ||
    combinedLower.includes("project_likes") ||
    combinedLower.includes("project_comments") ||
    combinedLower.includes("get_profile_friend_count") ||
    combinedLower.includes("is_friend_with_current_user") ||
    combinedLower.includes("can_view_sandbox_project") ||
    combinedLower.includes("chk_sandbox_projects_visibility") ||
    /(?:^|[\s.'"])username(?:[\s.'"]|$)/.test(combinedLower)
  ) {
    return "20261123000002_add_social_network.sql";
  }

  if (
    combinedLower.includes("chk_sandbox_projects_language") ||
    combinedLower.includes("is_pinned") ||
    combinedLower.includes("repository_url") ||
    combinedLower.includes("live_url") ||
    combinedLower.includes("headline") ||
    combinedLower.includes("banner_preset") ||
    combinedLower.includes("accent_theme") ||
    combinedLower.includes("avatar_frame") ||
    combinedLower.includes("octopy_companion") ||
    combinedLower.includes("show_email") ||
    combinedLower.includes("website_url") ||
    combinedLower.includes("linkedin_url") ||
    /(?:^|[\s.'"])(tags|skills|location)(?:[\s.'"]|$)/.test(combinedLower)
  ) {
    return "20261123000001_enhance_profiles_and_projects.sql";
  }

  return null;
}

export function mapSupabaseAuthError(
  error: unknown,
  context?: SupabaseErrorContext,
): string {
  const { message, code, status, hint } = extractSupabaseErrorMeta(
    error,
    context,
  );
  const messageLower = message.toLowerCase();
  const codeLower = code.toLowerCase();

  logError("supabase.auth.error", {
    operation: context?.operation,
    status,
    code: code || undefined,
    ...(hint ? { hint } : {}),
  });

  if (isNetworkFailure(messageLower)) {
    return "Não foi possível conectar ao servidor de autenticação. Verifique sua conexão com a internet.";
  }

  if (
    codeLower === "invalid_credentials" ||
    messageLower.includes("invalid login credentials")
  ) {
    return "E-mail ou senha incorretos. Verifique seus dados e tente novamente.";
  }

  if (
    codeLower === "email_not_confirmed" ||
    messageLower.includes("email not confirmed")
  ) {
    return "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada ou spam, ou solicite o reenvio do link abaixo.";
  }

  if (
    codeLower === "user_already_exists" ||
    codeLower === "email_exists" ||
    messageLower.includes("user already registered")
  ) {
    return "Já existe uma conta cadastrada com este e-mail. Tente entrar com sua senha ou usar o Google.";
  }

  if (
    codeLower === "over_email_send_rate_limit" ||
    messageLower.includes("email rate limit exceeded")
  ) {
    return "Limite de envio de e-mails atingido no servidor de autenticação. Aguarde alguns minutos antes de reenviar (em projetos sem SMTP personalizado no Supabase, há limite restrito de envios/hora).";
  }

  if (
    status === 429 ||
    codeLower === "over_request_rate_limit" ||
    messageLower.includes("for security purposes") ||
    messageLower.includes("rate limit")
  ) {
    return "Muitas tentativas em sequência. Aguarde alguns instantes antes de tentar novamente.";
  }

  if (
    codeLower === "email_address_not_authorized" ||
    messageLower.includes("email address not authorized")
  ) {
    return "O remetente padrão do Supabase não autorizou o envio para este destinatário. Configure um SMTP personalizado (Custom SMTP) no painel Supabase Auth.";
  }

  if (
    codeLower === "email_provider_disabled" ||
    messageLower.includes("email logins are disabled")
  ) {
    return "O cadastro e login por e-mail estão desativados no projeto Supabase. Habilite o provedor Email em Authentication -> Providers.";
  }

  if (
    codeLower === "signup_disabled" ||
    messageLower.includes("signups not allowed")
  ) {
    return "Novos cadastros estão desativados neste projeto Supabase (Authentication -> User Signups).";
  }

  if (
    codeLower === "otp_expired" ||
    codeLower === "token_expired" ||
    messageLower.includes("token has expired") ||
    messageLower.includes("email link is invalid or has expired")
  ) {
    return "O link de confirmação expirou ou já foi utilizado. Solicite um novo e-mail de confirmação na tela de acesso.";
  }

  if (
    codeLower === "weak_password" ||
    messageLower.includes("password should be at least")
  ) {
    return "A senha precisa atender aos requisitos mínimos de segurança (mínimo de 8 caracteres, letra e número).";
  }

  if (
    codeLower === "validation_failed" ||
    messageLower.includes("unable to validate email address")
  ) {
    return "Informe um endereço de e-mail válido.";
  }

  if (
    codeLower === "provider_disabled" ||
    messageLower.includes("provider is not enabled")
  ) {
    return "O login com Google ainda não está habilitado neste projeto Supabase.";
  }

  if (
    codeLower === "flow_state_not_found" ||
    codeLower === "bad_oauth_callback" ||
    messageLower.includes("invalid flow state") ||
    messageLower.includes("code verifier") ||
    messageLower.includes("pkce")
  ) {
    return "A sessão de autenticação expirou ou foi concluída em outro navegador. Tente entrar novamente.";
  }

  if (
    (status !== null && status >= 500) ||
    messageLower.includes("error sending confirmation") ||
    messageLower.includes("error sending magic link") ||
    messageLower.includes("smtp") ||
    messageLower.includes("mailer") ||
    (codeLower === "unexpected_failure" && messageLower.includes("mail"))
  ) {
    const suffix = formatDiagnosticSuffix(status, code);
    return `O servidor não conseguiu enviar o e-mail de confirmação${suffix}. Verifique a configuração de SMTP e Redirect URLs no painel Supabase Auth.`;
  }

  const suffix = formatDiagnosticSuffix(status, code);
  return `Não foi possível concluir a autenticação no momento${suffix}. Tente novamente em instantes.`;
}

export function mapSupabaseDatabaseError(
  error: unknown,
  context?: SupabaseErrorContext,
): string {
  const { message, code, status, details, hint } = extractSupabaseErrorMeta(
    error,
    context,
  );
  const messageLower = message.toLowerCase();
  const combinedLower = `${message} ${details} ${hint}`.toLowerCase();
  const codeUpper = code.toUpperCase();

  logError("supabase.database.error", {
    operation: context?.operation,
    table: context?.table,
    status,
    code: codeUpper || undefined,
    ...(hint ? { hint } : {}),
  });

  if (isNetworkFailure(messageLower)) {
    return "Sem comunicação com o banco de dados. Verifique sua conexão com a internet.";
  }

  const cooldown = isUsernameCooldownError(error);
  if (cooldown.active) {
    const formattedDate = formatCooldownDatePtBr(cooldown.nextAllowedIso);
    return formattedDate
      ? `Você já alterou seu @usuário recentemente. Próxima alteração liberada em ${formattedDate}.`
      : "Você já alterou seu @usuário recentemente. Aguarde o intervalo mínimo de 30 dias para alterar novamente.";
  }

  if (
    codeUpper === "PGRST301" ||
    codeUpper === "PGRST302" ||
    codeUpper === "PGRST303" ||
    ((status === 401 || codeUpper === "42501") && combinedLower.includes("jwt"))
  ) {
    const codeLabel = codeUpper ? `código ${codeUpper}` : "HTTP 401";
    return `Sua sessão expirou ou ficou inválida (${codeLabel}). Entre novamente na sua conta para continuar.`;
  }

  if (codeUpper === "23505") {
    if (messageLower.includes("username")) {
      return "Este @usuário já está em uso por outra pessoa. Escolha outro identificador.";
    }
    if (messageLower.includes("friendships")) {
      return "Já existe uma solicitação ou amizade registrada entre essas contas.";
    }
    return "Já existe um registro com esses dados únicos (por exemplo, slug ou e-mail duplicado).";
  }

  if (codeUpper === "23503") {
    return "Seu perfil ainda não foi sincronizado ou o registro relacionado não existe (código 23503). Recarregue a página e tente novamente.";
  }

  if (isTablePrivilegeError(error)) {
    return "Permissão de tabela ausente no banco (código 42501). Execute a migração 20261123000003_fix_grants_rls_and_username_cooldown.sql no SQL Editor do Supabase e recarregue.";
  }

  if (isMissingDatabaseSchemaError(error)) {
    const missingMigration = detectMissingMigrationName(error);
    const codeSuffix = codeUpper ? ` (código ${codeUpper})` : "";

    if (missingMigration === "20261123000001_enhance_profiles_and_projects.sql") {
      return `Estrutura de perfil/projetos da Fase 3 desatualizada no Supabase${codeSuffix}. Execute a migração 20261123000001_enhance_profiles_and_projects.sql no SQL Editor do projeto.`;
    }
    if (missingMigration === "20261123000003_fix_grants_rls_and_username_cooldown.sql") {
      return `Estrutura de controle de @usuário ou privilégios desatualizada no Supabase${codeSuffix}. Execute a migração 20261123000003_fix_grants_rls_and_username_cooldown.sql no SQL Editor do projeto.`;
    }
    return `A estrutura da rede social ainda não foi aplicada no Supabase${codeSuffix}. Execute a migração 20261123000002_add_social_network.sql no SQL Editor do projeto.`;
  }

  if (codeUpper === "42501" || messageLower.includes("row-level security")) {
    return "Você não possui permissão pelas regras de segurança (RLS) para esta operação (código 42501). Verifique se você está autenticado na conta dona deste registro.";
  }

  if (codeUpper === "22P02") {
    return "Identificador ou formato de dado inválido para esta operação (código 22P02).";
  }

  if (codeUpper === "23502") {
    return "Faltou um campo obrigatório para salvar este registro (código 23502).";
  }

  if (codeUpper === "22001") {
    return "Um dos campos ultrapassa o limite máximo de caracteres permitido (código 22001).";
  }

  if (codeUpper === "23514") {
    if (combinedLower.includes("chk_sandbox_projects_language")) {
      return "As 15 linguagens do estúdio exigem a migração 20261123000001_enhance_profiles_and_projects.sql no SQL Editor do projeto (código 23514).";
    }
    if (combinedLower.includes("chk_sandbox_projects_visibility")) {
      return "A visibilidade Somente amigos exige a migração 20261123000002_add_social_network.sql no SQL Editor do projeto (código 23514).";
    }
    if (
      combinedLower.includes("chk_profiles_username_format") ||
      combinedLower.includes("formato inválido para @usuário")
    ) {
      return "Formato de @usuário inválido: use 3 a 30 letras minúsculas, números, ponto ou sublinhado sem repetição (código 23514).";
    }
    if (
      combinedLower.includes("reservado") ||
      combinedLower.includes("imperson")
    ) {
      return "Este @usuário é reservado ou protegido contra impersonação no Codit (código 23514).";
    }
    if (combinedLower.includes("chk_profiles_github_format")) {
      return "Usuário do GitHub inválido (código 23514).";
    }
    if (combinedLower.includes("chk_sandbox_projects_source_size")) {
      return "O código excede o limite de 200.000 caracteres permitido pelo banco (código 23514).";
    }
    return "Os dados informados não atendem às regras de validação do sistema (código 23514).";
  }

  if (codeUpper === "42P17") {
    return "Erro de configuração nas políticas de acesso (RLS) do banco (código 42P17).";
  }

  if (codeUpper === "57014") {
    return "A operação excedeu o tempo limite no banco de dados (código 57014). Tente novamente.";
  }

  if (codeUpper === "P0001") {
    if (combinedLower.includes("role")) {
      return "Alteração do papel da conta não é permitida diretamente (código P0001).";
    }
    if (combinedLower.includes("amizade")) {
      return "Não foi possível alterar essa amizade nessa condição (código P0001).";
    }
    return "Operação bloqueada por regra de segurança do banco (código P0001).";
  }

  if (codeUpper === "PGRST116") {
    return "Registro não encontrado ou inacessível para sua conta (código PGRST116).";
  }

  const suffix = formatDiagnosticSuffix(status, codeUpper);
  return `Não foi possível salvar ou carregar os dados no momento${suffix}. Tente novamente em instantes.`;
}
