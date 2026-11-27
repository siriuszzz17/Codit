"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getSignedChatAttachmentUrl } from "@/modules/messaging/messaging-service";

export interface ChatImageAttachmentProps {
  storagePath?: string | undefined;
  caption: string;
}

export function ChatImageAttachment({
  storagePath,
  caption,
}: ChatImageAttachmentProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!storagePath) {
      return;
    }
    let cancelled = false;
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    void getSignedChatAttachmentUrl(storagePath, client)
      .then((url) => {
        if (!cancelled) {
          if (url) {
            setSignedUrl(url);
          } else {
            setFailed(true);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  return (
    <div className="space-y-1.5">
      {signedUrl ? (
        <a
          href={signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-xl border border-border/60 bg-black/10"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signedUrl}
            alt={caption}
            loading="lazy"
            className="max-h-72 w-full max-w-xs rounded-xl object-cover"
          />
        </a>
      ) : failed || !storagePath ? (
        <div className="rounded-xl border border-dashed border-border/70 px-3 py-2 text-xs opacity-80">
          Imagem indisponível
        </div>
      ) : (
        <div className="h-36 w-56 animate-pulse rounded-xl bg-black/15" />
      )}
      {caption ? (
        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed opacity-90">
          {caption}
        </p>
      ) : null}
    </div>
  );
}
