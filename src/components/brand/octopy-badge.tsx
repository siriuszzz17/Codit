import Image from "next/image";

export type OctopyVariant = "default" | "coding" | "headphones" | "happy";

const VARIANT_SRC: Record<OctopyVariant, string> = {
  default: "/icons/octopy-default.png",
  coding: "/icons/octopy-coding.png",
  headphones: "/icons/octopy-headphones.png",
  happy: "/icons/octopy-happy.png",
};

interface OctopyBadgeProps {
  size?: number;
  className?: string;
  decorative?: boolean;
  variant?: OctopyVariant;
}

export function OctopyBadge({
  size = 40,
  className = "",
  decorative = true,
  variant = "default",
}: OctopyBadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-xl bg-[#141124] p-1 ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <Image
        src={VARIANT_SRC[variant]}
        alt={decorative ? "" : "Mascote Octopy do Codit"}
        width={size}
        height={size}
        unoptimized
        aria-hidden={decorative ? true : undefined}
        className="h-full w-full object-contain"
        style={{ imageRendering: "pixelated" }}
      />
    </span>
  );
}
