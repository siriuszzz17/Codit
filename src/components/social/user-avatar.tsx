"use client";

import Image from "next/image";
import { useState } from "react";
import {
  getInitials,
  isSafeHttpUrl,
} from "@/components/social/social-labels";
import { isAllowedAvatarPath } from "@/modules/profiles/profile-themes";

type AvatarSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<AvatarSize, { box: string; px: number; text: string }> = {
  sm: { box: "h-9 w-9 rounded-xl", px: 36, text: "text-xs" },
  md: { box: "h-12 w-12 rounded-2xl", px: 48, text: "text-sm" },
  lg: { box: "h-16 w-16 rounded-2xl", px: 64, text: "text-lg" },
};

export interface UserAvatarProps {
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  size?: AvatarSize;
  className?: string;
}

export function UserAvatar({
  name,
  username,
  avatarUrl,
  size = "md",
  className = "",
}: UserAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const spec = SIZE_CLASSES[size];
  const isPixelAvatar =
    Boolean(avatarUrl) && isAllowedAvatarPath(avatarUrl ?? "");
  const hasValidImage =
    Boolean(avatarUrl) &&
    (isSafeHttpUrl(avatarUrl) || isPixelAvatar) &&
    failedUrl !== avatarUrl;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-border bg-accent-soft font-bold text-accent-strong ${spec.box} ${spec.text} ${className}`.trim()}
    >
      {hasValidImage && avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={`Avatar de ${name}`}
          width={spec.px}
          height={spec.px}
          unoptimized
          onError={() => setFailedUrl(avatarUrl)}
          className={`h-full w-full ${
            isPixelAvatar
              ? "bg-[#141124] object-contain p-0.5"
              : "object-cover"
          }`}
          style={isPixelAvatar ? { imageRendering: "pixelated" } : undefined}
        />
      ) : (
        <span aria-hidden="true">{getInitials(name, username)}</span>
      )}
    </span>
  );
}
