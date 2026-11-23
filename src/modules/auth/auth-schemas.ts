import { z } from "zod";
import {
  NATIVE_MOBILE_AUTH_BRIDGE_URL,
  type AuthPlatform,
} from "@/lib/native-oauth";
import { coditUsernameSchema } from "@/modules/social/social-schemas";

function emptyStringToUndefined(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}

export const emailFieldSchema = z
  .string({ error: "Informe seu e-mail." })
  .trim()
  .toLowerCase()
  .min(1, "Informe seu e-mail.")
  .email("Informe um endereço de e-mail válido.");

export const loginSchema = z.object({
  email: emailFieldSchema,
  password: z
    .string({ error: "Informe sua senha." })
    .min(1, "Informe sua senha."),
});

export const signUpSchema = z
  .object({
    fullName: z
      .string({ error: "Informe seu nome completo." })
      .trim()
      .min(2, "O nome deve ter pelo menos 2 caracteres.")
      .max(120, "O nome pode ter no máximo 120 caracteres."),
    username: z.preprocess(
      emptyStringToUndefined,
      coditUsernameSchema.optional(),
    ),
    email: emailFieldSchema,
    password: z
      .string({ error: "Crie uma senha." })
      .min(8, "A senha deve ter pelo menos 8 caracteres.")
      .max(72, "A senha pode ter no máximo 72 caracteres.")
      .refine(
        (value) => /[A-Za-z]/.test(value) && /\d/.test(value),
        "Use pelo menos uma letra e um número na senha.",
      ),
    confirmPassword: z
      .string({ error: "Confirme sua senha." })
      .min(1, "Confirme sua senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas informadas não coincidem.",
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignUpInput = z.input<typeof signUpSchema>;

export function resolveOAuthRedirectUrl(options?: {
  origin?: string | undefined;
  configuredRedirectUrl?: string | undefined;
}): string {
  const configured = options?.configuredRedirectUrl?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const runtimeOrigin =
    options?.origin?.trim() ??
    (typeof window !== "undefined" ? window.location.origin : "");

  if (!runtimeOrigin) {
    return "/auth/callback";
  }

  return `${runtimeOrigin.replace(/\/+$/, "")}/auth/callback`;
}

export function resolveNativeMobileRedirectUrl(
  configuredNativeRedirectUrl?: string | undefined,
): string {
  const configured = configuredNativeRedirectUrl?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  return NATIVE_MOBILE_AUTH_BRIDGE_URL;
}

export function resolveEmailConfirmationRedirectUrl(options: {
  platform: AuthPlatform;
  origin?: string | undefined;
  configuredRedirectUrl?: string | undefined;
  nativeRedirectUrl?: string | undefined;
}): string | undefined {
  if (options.platform === "capacitor") {
    return resolveNativeMobileRedirectUrl(options.nativeRedirectUrl);
  }

  if (options.platform === "tauri") {
    const configured = options.configuredRedirectUrl?.trim();
    if (
      configured &&
      (configured.startsWith("https://") || configured.startsWith("http://"))
    ) {
      return configured.replace(/\/+$/, "");
    }
    return undefined;
  }

  return resolveOAuthRedirectUrl({
    origin: options.origin,
    configuredRedirectUrl: options.configuredRedirectUrl,
  });
}

export function getFieldErrors<T extends Record<string, unknown>>(
  error: z.ZodError<T>,
): Partial<Record<keyof T, string>> {
  const fieldErrors: Partial<Record<keyof T, string>> = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) {
      fieldErrors[key as keyof T] = issue.message;
    }
  }

  return fieldErrors;
}
