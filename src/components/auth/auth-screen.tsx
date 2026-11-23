"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import {
  cancelDesktopOAuth,
  subscribeCapacitorBrowserFinished,
} from "@/lib/native-oauth";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useIsOnline } from "@/lib/use-is-online";
import { useAuth } from "@/modules/auth/auth-provider";
import {
  getFieldErrors,
  loginSchema,
  signUpSchema,
  type LoginInput,
  type SignUpInput,
} from "@/modules/auth/auth-schemas";
import {
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "@/modules/auth/auth-service";

type AuthMode = "login" | "signup";

function subscribeModeQuery(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("popstate", onStoreChange);
  return () => {
    window.removeEventListener("popstate", onStoreChange);
  };
}

function getModeQuerySnapshot(): AuthMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "signup" || mode === "login") {
    return mode;
  }
  return null;
}

function getServerModeQuerySnapshot(): AuthMode | null {
  return null;
}

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.64Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.96H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28v-3.1H1.28a12 12 0 0 0 0 10.76l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.28 6.62l4 3.1c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

export function AuthScreen() {
  const router = useRouter();
  const isOnline = useIsOnline();
  const { user, profile, isLoading, isConfigured, authError, signOut } =
    useAuth();

  const urlMode = useSyncExternalStore(
    subscribeModeQuery,
    getModeQuerySnapshot,
    getServerModeQuerySnapshot,
  );
  const [selectedMode, setSelectedMode] = useState<AuthMode | null>(null);
  const mode: AuthMode = selectedMode ?? urlMode ?? "login";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof LoginInput | keyof SignUpInput, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<
    "email" | "google" | "signout" | null
  >(null);
  const [externalAuthPlatform, setExternalAuthPlatform] = useState<
    "desktop" | "mobile" | null
  >(null);
  const [dismissedAuthError, setDismissedAuthError] = useState<string | null>(
    null,
  );

  const mobileFinishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const hasActiveAuthError =
    Boolean(authError) && authError !== dismissedAuthError;
  const isWaitingExternalOAuth =
    externalAuthPlatform !== null && !user && !hasActiveAuthError;
  const effectiveAction =
    submittingAction === "google" && hasActiveAuthError
      ? null
      : submittingAction;
  const isBusy = effectiveAction !== null || isWaitingExternalOAuth;
  const actionsDisabled = isBusy || !isConfigured || !isOnline;

  useEffect(() => {
    if (externalAuthPlatform !== "mobile") {
      return;
    }

    let cancelled = false;
    let cleanup: () => void = () => {};

    void subscribeCapacitorBrowserFinished(() => {
      if (cancelled) {
        return;
      }

      if (mobileFinishTimerRef.current !== null) {
        clearTimeout(mobileFinishTimerRef.current);
      }

      // Aguarda janela curta para que `appUrlOpen` entregue o deep link antes de destravar.
      mobileFinishTimerRef.current = setTimeout(() => {
        if (!cancelled) {
          setExternalAuthPlatform(null);
          setSubmittingAction((current) =>
            current === "google" ? null : current,
          );
        }
      }, 1500);
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        cleanup = unlisten;
      }
    });

    return () => {
      cancelled = true;
      if (mobileFinishTimerRef.current !== null) {
        clearTimeout(mobileFinishTimerRef.current);
        mobileFinishTimerRef.current = null;
      }
      cleanup();
    };
  }, [externalAuthPlatform]);

  function switchMode(nextMode: AuthMode) {
    setSelectedMode(nextMode);
    setFieldErrors({});
    setFormError(null);
    setSuccessMessage(null);
  }

  async function handleCancelExternalWait() {
    if (mobileFinishTimerRef.current !== null) {
      clearTimeout(mobileFinishTimerRef.current);
      mobileFinishTimerRef.current = null;
    }

    if (externalAuthPlatform === "desktop") {
      await cancelDesktopOAuth();
    }

    setExternalAuthPlatform(null);
    setSubmittingAction(null);
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setSuccessMessage(null);
    setDismissedAuthError(authError);

    if (!isOnline) {
      setFormError(
        "Você está offline. Reconecte-se à internet para entrar ou criar uma conta.",
      );
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setFormError(
        "O Supabase ainda não foi configurado neste ambiente (.env.local).",
      );
      return;
    }

    if (mode === "login") {
      const parsed = loginSchema.safeParse({ email, password });
      if (!parsed.success) {
        setFieldErrors(getFieldErrors(parsed.error));
        return;
      }

      setSubmittingAction("email");
      try {
        await signInWithEmail(parsed.data, client);
        router.push("/conta");
      } catch (error) {
        setFormError(
          error instanceof Error
            ? error.message
            : "Não foi possível entrar na sua conta.",
        );
      } finally {
        setSubmittingAction(null);
      }
      return;
    }

    const parsed = signUpSchema.safeParse({
      fullName,
      email,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      setFieldErrors(getFieldErrors(parsed.error));
      return;
    }

    setSubmittingAction("email");
    try {
      const result = await signUpWithEmail(parsed.data, client);
      if (result.needsEmailConfirmation) {
        setSuccessMessage(
          "Conta criada com sucesso! Enviamos um link de confirmação para o seu e-mail. Confirme o endereço para acessar o Codit.",
        );
        setPassword("");
        setConfirmPassword("");
      } else {
        router.push("/conta");
      }
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir seu cadastro.",
      );
    } finally {
      setSubmittingAction(null);
    }
  }

  async function handleGoogleLogin() {
    setFieldErrors({});
    setFormError(null);
    setSuccessMessage(null);
    setDismissedAuthError(authError);

    if (!isOnline) {
      setFormError(
        "Você está offline. Conecte-se à internet para continuar com o Google.",
      );
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setFormError(
        "O Supabase ainda não foi configurado neste ambiente (.env.local).",
      );
      return;
    }

    setSubmittingAction("google");
    try {
      const result = await signInWithGoogle(client);
      if (result.mode === "external_desktop") {
        setExternalAuthPlatform("desktop");
        setSubmittingAction(null);
      } else if (result.mode === "external_mobile") {
        setExternalAuthPlatform("mobile");
        setSubmittingAction(null);
      }
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar o login com o Google.",
      );
      setExternalAuthPlatform(null);
      setSubmittingAction(null);
    }
  }

  async function handleSignOut() {
    setFormError(null);
    setSubmittingAction("signout");
    try {
      await signOut();
      setSuccessMessage("Você saiu da sua conta com segurança.");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Não foi possível encerrar a sessão agora.",
      );
    } finally {
      setSubmittingAction(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-5 sm:px-6 sm:py-8">
      <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <Link href="/" className="flex items-center gap-3">
          <OctopyBadge size={40} className="shrink-0 rounded-xl shadow-xs" />
          <div>
            <p className="text-base font-bold tracking-tight text-foreground sm:text-lg">
              Codit
            </p>
            <p className="text-xs text-muted">Acesso da plataforma</p>
          </div>
        </Link>

        <Link
          href="/"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:border-accent sm:text-sm"
        >
          Voltar ao início
        </Link>
      </header>

      <main className="grid flex-1 items-center gap-6 py-6 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:py-10">
        {/* Painel de identidade Codit + Mascote Octopy */}
        <section
          aria-labelledby="octopy-welcome-title"
          className="flex flex-col justify-between gap-6 rounded-2xl border border-border bg-surface p-5 shadow-xs sm:p-7"
        >
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <OctopyBadge
                size={64}
                decorative={false}
                className="shrink-0 rounded-2xl shadow-sm"
              />
              <div>
                <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-strong">
                  Tutor &amp; Mascote Octopy
                </span>
                <h1
                  id="octopy-welcome-title"
                  className="mt-1.5 text-xl font-bold tracking-tight text-foreground sm:text-2xl"
                >
                  {mode === "login"
                    ? "Que bom ter você de volta!"
                    : "Comece sua jornada tech hoje"}
                </h1>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface-muted/80 p-4 text-sm leading-relaxed text-foreground">
              {mode === "login" ? (
                <p>
                  &ldquo;Oi! Eu sou o{" "}
                  <strong className="font-semibold text-accent-strong">
                    Octopy
                  </strong>
                  . Entre na sua conta para retomar suas lições, atualizar seu
                  perfil e continuar seus mini-projetos no Sandbox.&rdquo;
                </p>
              ) : (
                <p>
                  &ldquo;Oi! Eu sou o{" "}
                  <strong className="font-semibold text-accent-strong">
                    Octopy
                  </strong>
                  . Com sua conta gratuita no Codit, cada desafio resolvido e
                  cada mini-projeto ficam salvos com segurança só para
                  você.&rdquo;
                </p>
              )}
            </div>

            <ul className="space-y-2.5 text-sm text-muted">
              <li className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                />
                <span>
                  Trilhas de Programação, IA, Git/GitHub e Carreira Tech em{" "}
                  <strong className="font-medium text-foreground">pt-BR</strong>
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                />
                <span>
                  Mini-projetos privados na nuvem com controle de versão por
                  dispositivo
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                />
                <span>
                  Acesso contínuo entre Navegador/PWA, Windows e Android
                </span>
              </li>
            </ul>
          </div>

          <p className="border-t border-border pt-4 text-xs text-muted">
            Seus dados de perfil e projetos são isolados pelo seu identificador
            único com políticas Row-Level Security (RLS).
          </p>
        </section>

        {/* Painel do formulário */}
        <section
          aria-label="Autenticação do aluno"
          className="rounded-2xl border border-border bg-surface p-5 shadow-xs sm:p-7"
        >
          {!isConfigured ? (
            <div
              role="status"
              className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-foreground"
            >
              <p className="font-semibold">Configuração do Supabase pendente</p>
              <p className="mt-1 text-muted">
                Adicione{" "}
                <code className="font-mono text-foreground">
                  NEXT_PUBLIC_SUPABASE_URL
                </code>{" "}
                e{" "}
                <code className="font-mono text-foreground">
                  NEXT_PUBLIC_SUPABASE_ANON_KEY
                </code>{" "}
                no arquivo <code className="font-mono">.env.local</code> para
                ativar o login e o banco de dados.
              </p>
            </div>
          ) : null}

          {!isOnline ? (
            <div
              role="status"
              className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-foreground"
            >
              Você está offline no momento. Conecte-se à internet para entrar ou
              criar sua conta.
            </div>
          ) : null}

          {authError ? (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-foreground"
            >
              {authError}
            </div>
          ) : null}

          {isLoading ? (
            <div className="space-y-4 py-8 text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-border border-t-accent" />
              <p className="text-sm text-muted">
                Verificando sua sessão no Codit...
              </p>
            </div>
          ) : user ? (
            <div className="space-y-5 py-2">
              <div className="space-y-1.5">
                <span className="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
                  Sessão ativa
                </span>
                <h2 className="text-xl font-bold text-foreground">
                  Olá, {profile?.full_name || user.email}
                </h2>
                <p className="text-sm text-muted">
                  Você já está autenticado como{" "}
                  <span className="font-medium text-foreground">
                    {user.email}
                  </span>
                  .
                </p>
              </div>

              {successMessage ? (
                <p
                  role="status"
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
                >
                  {successMessage}
                </p>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/conta"
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
                >
                  Ir para minha conta e projetos
                </Link>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={effectiveAction === "signout"}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {effectiveAction === "signout"
                    ? "Saindo..."
                    : "Sair da conta"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Alternador Entrar / Criar Conta */}
              <div
                role="tablist"
                aria-label="Alternar entre entrar e criar conta"
                className="grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-surface-muted p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "login"}
                  onClick={() => switchMode("login")}
                  className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    mode === "login"
                      ? "bg-surface text-foreground shadow-xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "signup"}
                  onClick={() => switchMode("signup")}
                  className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    mode === "signup"
                      ? "bg-surface text-foreground shadow-xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  Criar conta
                </button>
              </div>

              <div className="space-y-1">
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  {mode === "login"
                    ? "Acesse sua conta Codit"
                    : "Crie sua conta no Codit"}
                </h2>
                <p className="text-xs text-muted sm:text-sm">
                  {mode === "login"
                    ? "Use Google ou seu e-mail e senha cadastrados."
                    : "Cadastro rápido e gratuito para salvar seu progresso."}
                </p>
              </div>

              {isWaitingExternalOAuth ? (
                <div
                  role="status"
                  className="space-y-3 rounded-xl border border-accent/40 bg-accent-soft/50 px-4 py-3 text-xs leading-relaxed text-foreground"
                >
                  <p className="font-semibold text-accent-strong">
                    Aguardando conclusão no navegador...
                  </p>
                  <p className="text-muted">
                    Finalize o login com Google na janela do navegador aberta.
                    Assim que concluir, você voltará automaticamente para o
                    aplicativo Codit.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCancelExternalWait()}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent"
                  >
                    Cancelar espera
                  </button>
                </div>
              ) : null}

              {/* Botão Google OAuth */}
              <button
                type="button"
                onClick={() => void handleGoogleLogin()}
                disabled={actionsDisabled}
                className="inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface-muted/70 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <GoogleIcon />
                <span>
                  {effectiveAction === "google"
                    ? "Abrindo login do Google..."
                    : isWaitingExternalOAuth
                      ? "Aguardando retorno do Google..."
                      : "Continuar com Google"}
                </span>
              </button>

              <div className="relative flex items-center py-1">
                <div className="grow border-t border-border" />
                <span className="mx-3 shrink-0 text-xs font-medium text-muted">
                  ou use seu e-mail
                </span>
                <div className="grow border-t border-border" />
              </div>

              <form
                onSubmit={(event) => void handleEmailSubmit(event)}
                noValidate
                className="space-y-4"
              >
                {mode === "signup" ? (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="codit-auth-fullname"
                      className="block text-xs font-semibold text-foreground"
                    >
                      Nome completo
                    </label>
                    <input
                      id="codit-auth-fullname"
                      name="fullName"
                      type="text"
                      autoComplete="name"
                      placeholder="Ex.: Maria Oliveira"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      aria-invalid={Boolean(fieldErrors.fullName)}
                      aria-describedby={
                        fieldErrors.fullName
                          ? "codit-auth-fullname-error"
                          : undefined
                      }
                      className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                    />
                    {fieldErrors.fullName ? (
                      <p
                        id="codit-auth-fullname-error"
                        className="text-xs font-medium text-red-500"
                      >
                        {fieldErrors.fullName}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label
                    htmlFor="codit-auth-email"
                    className="block text-xs font-semibold text-foreground"
                  >
                    E-mail
                  </label>
                  <input
                    id="codit-auth-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="voce@exemplo.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={
                      fieldErrors.email ? "codit-auth-email-error" : undefined
                    }
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  {fieldErrors.email ? (
                    <p
                      id="codit-auth-email-error"
                      className="text-xs font-medium text-red-500"
                    >
                      {fieldErrors.email}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="codit-auth-password"
                      className="block text-xs font-semibold text-foreground"
                    >
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="text-xs font-medium text-accent-strong hover:underline"
                    >
                      {showPassword ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                  <input
                    id="codit-auth-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    placeholder={
                      mode === "login"
                        ? "Digite sua senha"
                        : "Mínimo de 8 caracteres"
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={
                      fieldErrors.password
                        ? "codit-auth-password-error"
                        : mode === "signup"
                          ? "codit-auth-password-hint"
                          : undefined
                    }
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  {mode === "signup" && !fieldErrors.password ? (
                    <p
                      id="codit-auth-password-hint"
                      className="text-[11px] text-muted"
                    >
                      Use pelo menos 8 caracteres combinando letras e números.
                    </p>
                  ) : null}
                  {fieldErrors.password ? (
                    <p
                      id="codit-auth-password-error"
                      className="text-xs font-medium text-red-500"
                    >
                      {fieldErrors.password}
                    </p>
                  ) : null}
                </div>

                {mode === "signup" ? (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="codit-auth-confirm-password"
                      className="block text-xs font-semibold text-foreground"
                    >
                      Confirmar senha
                    </label>
                    <input
                      id="codit-auth-confirm-password"
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Repita a senha"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      aria-invalid={Boolean(fieldErrors.confirmPassword)}
                      aria-describedby={
                        fieldErrors.confirmPassword
                          ? "codit-auth-confirm-password-error"
                          : undefined
                      }
                      className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                    />
                    {fieldErrors.confirmPassword ? (
                      <p
                        id="codit-auth-confirm-password-error"
                        className="text-xs font-medium text-red-500"
                      >
                        {fieldErrors.confirmPassword}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {formError ? (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
                  >
                    {formError}
                  </p>
                ) : null}

                {successMessage ? (
                  <p
                    role="status"
                    className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
                  >
                    {successMessage}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={actionsDisabled}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {effectiveAction === "email"
                    ? mode === "login"
                      ? "Entrando..."
                      : "Criando conta..."
                    : mode === "login"
                      ? "Entrar no Codit"
                      : "Criar conta gratuita"}
                </button>
              </form>

              <p className="text-center text-xs text-muted">
                {mode === "login" ? (
                  <>
                    Ainda não tem conta?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("signup")}
                      className="font-semibold text-accent-strong hover:underline"
                    >
                      Criar conta agora
                    </button>
                  </>
                ) : (
                  <>
                    Já possui conta?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className="font-semibold text-accent-strong hover:underline"
                    >
                      Fazer login
                    </button>
                  </>
                )}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
