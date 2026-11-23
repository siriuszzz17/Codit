interface ErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  details?: unknown;
  hint?: unknown;
}

function extractErrorFields(error: unknown): {
  message: string;
  code: string;
  status: number | null;
  details: string;
  hint: string;
} {
  if (error instanceof Error) {
    const candidate = error as Error & ErrorLike;
    return {
      message: error.message,
      code: typeof candidate.code === "string" ? candidate.code : "",
      status: typeof candidate.status === "number" ? candidate.status : null,
      details: typeof candidate.details === "string" ? candidate.details : "",
      hint: typeof candidate.hint === "string" ? candidate.hint : "",
    };
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as ErrorLike;
    return {
      message: typeof candidate.message === "string" ? candidate.message : "",
      code: typeof candidate.code === "string" ? candidate.code : "",
      status: typeof candidate.status === "number" ? candidate.status : null,
      details: typeof candidate.details === "string" ? candidate.details : "",
      hint: typeof candidate.hint === "string" ? candidate.hint : "",
    };
  }

  if (typeof error === "string") {
    return { message: error, code: "", status: null, details: "", hint: "" };
  }

  return { message: "", code: "", status: null, details: "", hint: "" };
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

export function isSchemaMismatchError(error: unknown): boolean {
  const { message, code, details, hint } = extractErrorFields(error);
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

export function mapSupabaseAuthError(error: unknown): string {
  const { message, code, status } = extractErrorFields(error);
  const messageLower = message.toLowerCase();
  const codeLower = code.toLowerCase();

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
    return "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada ou pasta de spam.";
  }

  if (
    codeLower === "user_already_exists" ||
    codeLower === "email_exists" ||
    messageLower.includes("user already registered")
  ) {
    return "Já existe uma conta cadastrada com este e-mail. Tente entrar ou usar o Google.";
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
    status === 429 ||
    codeLower === "over_request_rate_limit" ||
    codeLower === "over_email_send_rate_limit" ||
    messageLower.includes("for security purposes") ||
    messageLower.includes("rate limit")
  ) {
    return "Muitas tentativas em sequência. Aguarde alguns instantes antes de tentar novamente.";
  }

  if (
    codeLower === "flow_state_not_found" ||
    codeLower === "bad_oauth_callback" ||
    messageLower.includes("invalid flow state")
  ) {
    return "A sessão de autenticação expirou ou foi interrompida. Inicie o login novamente.";
  }

  return "Não foi possível concluir a autenticação no momento. Tente novamente em instantes.";
}

export function isMissingDatabaseSchemaError(error: unknown): boolean {
  const { message, code } = extractErrorFields(error);
  const messageLower = message.toLowerCase();
  const codeUpper = code.toUpperCase();

  return (
    codeUpper === "42P01" ||
    codeUpper === "42703" ||
    codeUpper === "42883" ||
    codeUpper === "PGRST204" ||
    codeUpper === "PGRST205" ||
    messageLower.includes("could not find the table") ||
    messageLower.includes("schema cache") ||
    messageLower.includes("does not exist")
  );
}

export function mapSupabaseDatabaseError(error: unknown): string {
  const { message, code, details, hint } = extractErrorFields(error);
  const messageLower = message.toLowerCase();
  const combinedLower = `${message} ${details} ${hint}`.toLowerCase();
  const codeUpper = code.toUpperCase();

  if (isNetworkFailure(messageLower)) {
    return "Sem comunicação com o banco de dados. Verifique sua conexão com a internet.";
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
    return "Seu perfil ainda está sendo sincronizado. Recarregue a página e tente novamente.";
  }

  if (isMissingDatabaseSchemaError(error)) {
    return "A estrutura da rede social ainda não foi aplicada no Supabase. Execute a migração 20261123000002_add_social_network.sql no SQL Editor do projeto.";
  }

  if (codeUpper === "42501" || messageLower.includes("row-level security")) {
    return "Você não possui permissão para acessar ou alterar este registro.";
  }

  if (codeUpper === "22P02") {
    return "Identificador ou formato de dado inválido para esta operação.";
  }

  if (codeUpper === "23514") {
    if (combinedLower.includes("chk_sandbox_projects_language")) {
      return "As 15 linguagens do estúdio exigem a migração 20261123000001_enhance_profiles_and_projects.sql no SQL Editor do projeto.";
    }
    return "Os dados informados não atendem às regras de validação do sistema.";
  }

  if (codeUpper === "PGRST116") {
    return "Registro não encontrado ou inacessível para sua conta.";
  }

  return "Não foi possível salvar ou carregar os dados no momento. Tente novamente em instantes.";
}
