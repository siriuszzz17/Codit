interface OctopyBadgeProps {
  size?: number;
  className?: string;
  decorative?: boolean;
}

export function OctopyBadge({
  size = 40,
  className = "",
  decorative = true,
}: OctopyBadgeProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      className={className}
      aria-hidden={decorative ? "true" : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Mascote Octopy do Codit"}
    >
      <rect width="128" height="128" rx="32" fill="#0B0A16" />
      <circle cx="64" cy="54" r="34" fill="#7C3AED" />
      <ellipse cx="52" cy="40" rx="12" ry="7" fill="#A78BFA" opacity="0.45" />
      <path
        d="M34 74c0 11 4 22 9 22 4 0 5-8 8-8s4 10 8 10 5-9 5-9 2 9 5 9 5-10 8-10 4 8 8 8c5 0 9-11 9-22H34Z"
        fill="#7C3AED"
      />
      <circle cx="52" cy="55" r="6.5" fill="#F8FAFC" />
      <circle cx="76" cy="55" r="6.5" fill="#F8FAFC" />
      <circle cx="53.5" cy="55.5" r="2.8" fill="#1E1B4B" />
      <circle cx="77.5" cy="55.5" r="2.8" fill="#1E1B4B" />
      <path
        d="M58 67c3.5 3 8.5 3 12 0"
        stroke="#F8FAFC"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
