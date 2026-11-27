export type NavIconKey =
  | "home"
  | "tracks"
  | "projects"
  | "community"
  | "messages"
  | "profile";

export interface PrimaryNavItem {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: NavIconKey;
}

export const PRIMARY_NAV_ITEMS: readonly PrimaryNavItem[] = [
  {
    href: "/",
    label: "Início",
    shortLabel: "Início",
    description: "Visão geral do Codit",
    icon: "home",
  },
  {
    href: "/trilhas",
    label: "Trilhas",
    shortLabel: "Trilhas",
    description: "Trilhas práticas com testes e Octopy",
    icon: "tracks",
  },
  {
    href: "/projetos",
    label: "Projetos",
    shortLabel: "Projetos",
    description: "Estúdio e Sandbox de código",
    icon: "projects",
  },
  {
    href: "/comunidade",
    label: "Comunidade",
    shortLabel: "Comunidade",
    description: "Feed de projetos e busca por @",
    icon: "community",
  },
  {
    href: "/mensagens",
    label: "Mensagens",
    shortLabel: "Chat",
    description: "Mensagens entre amigos, grupos e voz",
    icon: "messages",
  },
  {
    href: "/conta",
    label: "Perfil",
    shortLabel: "Perfil",
    description: "Personalização e @usuário",
    icon: "profile",
  },
];

export function normalizePathname(pathname: string | null | undefined): string {
  const trimmed = pathname?.trim();
  if (!trimmed) {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withLeadingSlash === "/") {
    return "/";
  }

  const withoutTrailing = withLeadingSlash.replace(/\/+$/, "");
  return withoutTrailing || "/";
}

export function isNavItemActive(
  pathname: string | null | undefined,
  href: string,
): boolean {
  const normalizedPath = normalizePathname(pathname);
  const normalizedHref = normalizePathname(href);

  if (normalizedHref === "/") {
    return normalizedPath === "/";
  }

  return (
    normalizedPath === normalizedHref ||
    normalizedPath.startsWith(`${normalizedHref}/`)
  );
}

export function shouldShowTopNavbar(
  pathname: string | null | undefined,
): boolean {
  const normalizedPath = normalizePathname(pathname);
  return (
    normalizedPath !== "/auth/callback" &&
    normalizedPath !== "/auth/native-callback"
  );
}
