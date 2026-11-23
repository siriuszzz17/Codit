import type { SandboxLanguage } from "@/lib/supabase/database.types";
import { getLanguageMeta } from "@/modules/sandbox/language-catalog";

interface LanguageIconProps {
  language: SandboxLanguage | string;
  size?: number;
  className?: string;
}

export function LanguageIcon({
  language,
  size = 20,
  className = "",
}: LanguageIconProps) {
  const meta = getLanguageMeta(language);

  switch (meta.id) {
    case "html_css_js":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <rect x="2" y="2" width="20" height="20" rx="5" fill="#F97316" />
          <path
            d="M9.2 8.2L5.6 12L9.2 15.8"
            stroke="#FFF"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14.8 8.2L18.4 12L14.8 15.8"
            stroke="#FFF"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M13 7.5L11 16.5"
            stroke="#FDE68A"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        </svg>
      );

    case "html":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <path d="M4 3L5.45 19.2L12 21L18.55 19.2L20 3H4Z" fill="#E34F26" />
          <path d="M12 4.4V19.55L17.25 18.1L18.45 4.4H12Z" fill="#EF652A" />
          <path
            d="M7.5 7.4H16.5L16.3 9.7H9.9L10.1 12H16.1L15.6 16.9L12 17.9L8.4 16.9L8.2 14.3H10.5L10.6 15.4L12 15.8L13.4 15.4L13.6 13.7H8L7.5 7.4Z"
            fill="#FFF"
          />
        </svg>
      );

    case "css":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <path d="M4 3L5.45 19.2L12 21L18.55 19.2L20 3H4Z" fill="#1572B6" />
          <path d="M12 4.4V19.55L17.25 18.1L18.45 4.4H12Z" fill="#33A9DC" />
          <path
            d="M7.6 7.4H16.4L16.2 9.7H12L15.9 11.4L15.5 16.8L12 17.8L8.5 16.8L8.3 14.2H10.6L10.7 15.4L12 15.8L13.4 15.4L13.6 13.5H8.3L8.1 11.4L12 9.7H7.8L7.6 7.4Z"
            fill="#FFF"
          />
        </svg>
      );

    case "javascript":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <rect x="2" y="2" width="20" height="20" rx="4.5" fill="#F7DF1E" />
          <path
            d="M11.2 10.5V16.4C11.2 17.8 10.3 18.7 8.9 18.7C7.8 18.7 7.1 18.1 6.7 17.3L8.2 16.4C8.4 16.8 8.7 17.1 9.1 17.1C9.5 17.1 9.7 16.8 9.7 16.2V10.5H11.2ZM15.5 18.7C13.9 18.7 12.9 17.9 12.4 16.8L13.8 16C14.1 16.6 14.6 17.1 15.5 17.1C16.2 17.1 16.6 16.7 16.6 16.3C16.6 15.8 16.1 15.6 15.1 15.2L14.6 15C13.3 14.5 12.6 13.8 12.6 12.5C12.6 11.2 13.6 10.3 15.2 10.3C16.4 10.3 17.3 10.8 17.8 11.8L16.4 12.6C16.1 12.1 15.7 11.8 15.2 11.8C14.6 11.8 14.2 12.1 14.2 12.5C14.2 13 14.6 13.2 15.5 13.6L16 13.8C17.5 14.4 18.3 15 18.3 16.3C18.3 17.8 17.1 18.7 15.5 18.7Z"
            fill="#111827"
          />
        </svg>
      );

    case "typescript":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <rect x="2" y="2" width="20" height="20" rx="4.5" fill="#3178C6" />
          <path
            d="M11.6 12H9.3V18.5H7.6V12H5.3V10.5H11.6V12ZM15.6 18.7C14 18.7 13 17.9 12.5 16.8L13.9 16C14.2 16.6 14.7 17.1 15.6 17.1C16.3 17.1 16.7 16.7 16.7 16.3C16.7 15.8 16.2 15.6 15.2 15.2L14.7 15C13.4 14.5 12.7 13.8 12.7 12.5C12.7 11.2 13.7 10.3 15.3 10.3C16.5 10.3 17.4 10.8 17.9 11.8L16.5 12.6C16.2 12.1 15.8 11.8 15.3 11.8C14.7 11.8 14.3 12.1 14.3 12.5C14.3 13 14.7 13.2 15.6 13.6L16.1 13.8C17.6 14.4 18.4 15 18.4 16.3C18.4 17.8 17.2 18.7 15.6 18.7Z"
            fill="#FFF"
          />
        </svg>
      );

    case "python":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <path
            d="M11.9 3C8.8 3 9.1 4.4 9.1 4.4V6.6H12V7.3H7.4C7.4 7.3 5 7 5 10.3C5 13.6 7.1 13.4 7.1 13.4H8.4V11.6C8.4 11.6 8.3 9.5 10.5 9.5H14.2C14.2 9.5 16.2 9.5 16.2 7.5V4.8C16.2 4.8 16.5 3 11.9 3ZM9.9 4.5C10.3 4.5 10.6 4.8 10.6 5.2C10.6 5.6 10.3 5.9 9.9 5.9C9.5 5.9 9.2 5.6 9.2 5.2C9.2 4.8 9.5 4.5 9.9 4.5Z"
            fill="#3776AB"
          />
          <path
            d="M12.1 21C15.2 21 14.9 19.6 14.9 19.6V17.4H12V16.7H16.6C16.6 16.7 19 17 19 13.7C19 10.4 16.9 10.6 16.9 10.6H15.6V12.4C15.6 12.4 15.7 14.5 13.5 14.5H9.8C9.8 14.5 7.8 14.5 7.8 16.5V19.2C7.8 19.2 7.5 21 12.1 21ZM14.1 19.5C13.7 19.5 13.4 19.2 13.4 18.8C13.4 18.4 13.7 18.1 14.1 18.1C14.5 18.1 14.8 18.4 14.8 18.8C14.8 19.2 14.5 19.5 14.1 19.5Z"
            fill="#FFD43B"
          />
        </svg>
      );

    case "react":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <rect x="2" y="2" width="20" height="20" rx="5" fill="#0B192C" />
          <circle cx="12" cy="12" r="1.7" fill="#61DAFB" />
          <ellipse
            cx="12"
            cy="12"
            rx="7.5"
            ry="2.9"
            stroke="#61DAFB"
            strokeWidth="1.4"
          />
          <ellipse
            cx="12"
            cy="12"
            rx="7.5"
            ry="2.9"
            transform="rotate(60 12 12)"
            stroke="#61DAFB"
            strokeWidth="1.4"
          />
          <ellipse
            cx="12"
            cy="12"
            rx="7.5"
            ry="2.9"
            transform="rotate(120 12 12)"
            stroke="#61DAFB"
            strokeWidth="1.4"
          />
        </svg>
      );

    case "nodejs":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <path
            d="M12 2.5L20.2 7.25V16.75L12 21.5L3.8 16.75V7.25L12 2.5Z"
            fill="#3C873A"
          />
          <path
            d="M8.8 15.5V8.5L15.2 15.5V8.5"
            stroke="#FFF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "java":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <rect x="2" y="2" width="20" height="20" rx="5" fill="#1F1926" />
          <path
            d="M7.5 12H15.5V14.2C15.5 16.2 13.9 17.5 11.5 17.5C9.1 17.5 7.5 16.2 7.5 14.2V12Z"
            fill="#EA2D2E"
          />
          <path
            d="M15.5 12.6H16.8C17.6 12.6 18.2 13.1 18.2 13.9C18.2 14.7 17.6 15.2 16.8 15.2H15.5"
            stroke="#EA2D2E"
            strokeWidth="1.5"
          />
          <path
            d="M9.6 9.8C9.2 8.7 10.6 7.8 10.2 6.5M12.6 9.8C12.2 8.7 13.6 7.8 13.2 6.5"
            stroke="#FDBA74"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M6.8 19H16.2"
            stroke="#60A5FA"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );

    case "csharp":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <path
            d="M12 2.5L20.2 7.25V16.75L12 21.5L3.8 16.75V7.25L12 2.5Z"
            fill="#68217A"
          />
          <path
            d="M11.6 9.4C10.9 8.7 10 8.4 9.1 8.6C7.6 8.9 6.6 10.3 6.6 12C6.6 13.7 7.6 15.1 9.1 15.4C10 15.6 10.9 15.3 11.6 14.6"
            stroke="#FFF"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M14.2 9.4L13.5 14.6M16.8 9.4L16.1 14.6M12.9 11.1H17.6M12.6 13H17.3"
            stroke="#E9D5FF"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );

    case "cpp":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <path
            d="M12 2.5L20.2 7.25V16.75L12 21.5L3.8 16.75V7.25L12 2.5Z"
            fill="#00599C"
          />
          <path
            d="M11.2 9.4C10.5 8.7 9.6 8.4 8.7 8.6C7.2 8.9 6.2 10.3 6.2 12C6.2 13.7 7.2 15.1 8.7 15.4C9.6 15.6 10.5 15.3 11.2 14.6"
            stroke="#FFF"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M13.5 10.6V13.4M12.1 12H14.9M16.9 10.6V13.4M15.5 12H18.3"
            stroke="#BAE6FD"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );

    case "go":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <rect x="2" y="2" width="20" height="20" rx="5" fill="#00ADD8" />
          <path
            d="M11 10.2C10.3 9.2 9.2 8.7 8 8.9C6.4 9.2 5.4 10.5 5.4 12.1C5.4 13.8 6.5 15.1 8.3 15.1C9.8 15.1 10.9 14.2 11.1 12.7H8.5"
            stroke="#FFF"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <ellipse
            cx="15.8"
            cy="12"
            rx="2.6"
            ry="3"
            stroke="#FFF"
            strokeWidth="1.9"
          />
        </svg>
      );

    case "rust":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <circle cx="12" cy="12" r="9.5" fill="#1F1918" stroke="#CE422B" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="6.2" stroke="#F97316" strokeWidth="1.4" strokeDasharray="2.5 2" />
          <path
            d="M9 15.5V8.5H12.7C14 8.5 14.8 9.2 14.8 10.4C14.8 11.5 14.1 12.1 12.9 12.2L15 15.5M9 12.2H12.7"
            stroke="#FFF"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "sql":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <rect x="2" y="2" width="20" height="20" rx="5" fill="#336791" />
          <ellipse cx="12" cy="7.5" rx="5.5" ry="2.2" fill="#E0F2FE" />
          <path
            d="M6.5 7.5V16.5C6.5 17.7 9 18.7 12 18.7C15 18.7 17.5 17.7 17.5 16.5V7.5"
            stroke="#BAE6FD"
            strokeWidth="1.6"
          />
          <path
            d="M6.5 12C6.5 13.2 9 14.2 12 14.2C15 14.2 17.5 13.2 17.5 12"
            stroke="#BAE6FD"
            strokeWidth="1.5"
          />
        </svg>
      );

    case "php":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 ${className}`.trim()}
        >
          <ellipse cx="12" cy="12" rx="10" ry="7.2" fill="#777BB4" stroke="#E0E7FF" strokeWidth="1.2" />
          <path
            d="M5.5 14.5V9.5H7.3C8.2 9.5 8.7 10 8.7 10.9C8.7 11.8 8.2 12.3 7.3 12.3H5.5M10.4 14.5V8.5M10.4 10.8H12.2C12.9 10.8 13.4 11.3 13.4 12.1V14.5M15.3 14.5V9.5H17.1C18 9.5 18.5 10 18.5 10.9C18.5 11.8 18 12.3 17.1 12.3H15.3"
            stroke="#FFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

interface LanguageBadgeProps {
  language: SandboxLanguage | string;
  size?: "xs" | "sm" | "md";
  showFileName?: boolean;
  className?: string;
}

export function LanguageBadge({
  language,
  size = "sm",
  showFileName = false,
  className = "",
}: LanguageBadgeProps) {
  const meta = getLanguageMeta(language);
  const iconSize = size === "xs" ? 14 : size === "sm" ? 16 : 20;
  const paddingClass =
    size === "xs"
      ? "px-2 py-0.5 text-[11px] gap-1.5"
      : size === "sm"
        ? "px-2.5 py-1 text-xs gap-1.5"
        : "px-3 py-1.5 text-xs gap-2";

  return (
    <span
      className={`inline-flex items-center rounded-lg border font-semibold ${meta.badgeBgClass} ${meta.badgeTextClass} ${meta.badgeBorderClass} ${paddingClass} ${className}`.trim()}
    >
      <LanguageIcon language={meta.id} size={iconSize} />
      <span>{meta.label}</span>
      {showFileName ? (
        <span className="font-mono text-[11px] opacity-75">
          ({meta.fileName})
        </span>
      ) : null}
    </span>
  );
}
