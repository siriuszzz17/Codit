import { describe, expect, it } from "vitest";
import { tokenizeCodeLine } from "@/components/messaging/code-message-block";
import {
  CURRENT_PRIVACY_VERSION,
  signUpSchema,
} from "@/modules/auth/auth-schemas";
import {
  CHAT_REACTION_EMOJIS,
  chatReactionEmojiSchema,
  MAX_CHAT_IMAGE_BYTES,
  MAX_CODE_MESSAGE_LENGTH,
  searchConversationQuerySchema,
  sendCodeMessageSchema,
  validateChatImageFile,
} from "@/modules/messaging/messaging-schemas";

describe("Phase 3 — Rich chat schemas, code tokenizer & LGPD validation", () => {
  it("validates code message payload and rejects empty or oversized snippets", () => {
    const ok = sendCodeMessageSchema.safeParse({
      code: "const x = 42;",
      language: "typescript",
      filename: "index.ts",
    });
    expect(ok.success).toBe(true);

    const empty = sendCodeMessageSchema.safeParse({ code: "   " });
    expect(empty.success).toBe(false);

    const tooLong = sendCodeMessageSchema.safeParse({
      code: "a".repeat(MAX_CODE_MESSAGE_LENGTH + 1),
    });
    expect(tooLong.success).toBe(false);
  });

  it("validates allowed chat image MIME types and 5 MB limit", () => {
    expect(
      validateChatImageFile({ type: "image/png", size: 1024, name: "a.png" }),
    ).toEqual({ ok: true, extension: "png" });

    expect(
      validateChatImageFile({
        type: "application/pdf",
        size: 1024,
        name: "doc.pdf",
      }).ok,
    ).toBe(false);

    expect(
      validateChatImageFile({
        type: "image/jpeg",
        size: MAX_CHAT_IMAGE_BYTES + 1,
        name: "huge.jpg",
      }).ok,
    ).toBe(false);
  });

  it("allows exactly the 6 supported chat reaction emojis", () => {
    expect(CHAT_REACTION_EMOJIS).toHaveLength(6);
    for (const emoji of CHAT_REACTION_EMOJIS) {
      expect(chatReactionEmojiSchema.safeParse(emoji).success).toBe(true);
    }
    expect(chatReactionEmojiSchema.safeParse("🎉").success).toBe(false);
  });

  it("validates conversation search query", () => {
    expect(searchConversationQuerySchema.safeParse("async").success).toBe(true);
    expect(searchConversationQuerySchema.safeParse("   ").success).toBe(false);
  });

  it("tokenizes code lines into keywords, strings, numbers and comments", () => {
    const tokens = tokenizeCodeLine('const count = 10; // ok "hi"');
    expect(tokens.some((t) => t.kind === "keyword" && t.value === "const")).toBe(
      true,
    );
    expect(tokens.some((t) => t.kind === "number" && t.value === "10")).toBe(
      true,
    );
    expect(
      tokens.some((t) => t.kind === "comment" && t.value.includes("// ok")),
    ).toBe(true);
  });

  it("rejects signup when acceptedTerms is explicitly false and defines privacy version", () => {
    expect(CURRENT_PRIVACY_VERSION).toBe("2026-11");
    const rejected = signUpSchema.safeParse({
      fullName: "Maria Oliveira",
      email: "maria@codit.dev",
      password: "Password1",
      confirmPassword: "Password1",
      acceptedTerms: false,
    });
    expect(rejected.success).toBe(false);

    const accepted = signUpSchema.safeParse({
      fullName: "Maria Oliveira",
      email: "maria@codit.dev",
      password: "Password1",
      confirmPassword: "Password1",
      acceptedTerms: true,
    });
    expect(accepted.success).toBe(true);
  });
});
