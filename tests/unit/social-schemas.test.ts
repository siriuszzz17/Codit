import { describe, expect, it } from "vitest";
import { buildSafeHtmlPreviewDoc } from "@/components/social/social-labels";
import {
  coditUsernameSchema,
  createProjectCommentSchema,
  formatHandle,
  normalizeUsernameInput,
  sanitizeCommunitySearchTerm,
} from "@/modules/social/social-schemas";

describe("social schemas and sanitization", () => {
  it("normalizes and validates @username handles according to Codit constraints", () => {
    expect(normalizeUsernameInput("  @Octopy.Dev ")).toBe("octopy.dev");
    expect(formatHandle("maria_dev")).toBe("@maria_dev");
    expect(formatHandle(null)).toBe("");

    const valid = coditUsernameSchema.safeParse("  @@Maria.Dev_01 ");
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data).toBe("maria.dev_01");
    }

    expect(coditUsernameSchema.safeParse("ab").success).toBe(false);
    expect(coditUsernameSchema.safeParse("a".repeat(31)).success).toBe(false);
    expect(coditUsernameSchema.safeParse(".maria").success).toBe(false);
    expect(coditUsernameSchema.safeParse("maria_").success).toBe(false);
    expect(coditUsernameSchema.safeParse("maria..dev").success).toBe(false);
    expect(coditUsernameSchema.safeParse("maria__dev").success).toBe(false);
    expect(coditUsernameSchema.safeParse("maria-dev").success).toBe(false);
    expect(coditUsernameSchema.safeParse("admin").success).toBe(false);
    expect(coditUsernameSchema.safeParse("octopy").success).toBe(false);
  });

  it("sanitizes PostgREST filter metacharacters and SQL wildcards in @ searches", () => {
    expect(sanitizeCommunitySearchTerm("  @octopy.dev ")).toEqual({
      query: "octopy.dev",
      isHandleOnly: true,
    });

    const malicious = sanitizeCommunitySearchTerm(
      "ana,id.eq.1,(admin)*\"'%_\\",
    );
    expect(malicious.isHandleOnly).toBe(false);
    expect(malicious.query).not.toContain(",");
    expect(malicious.query).not.toContain("(");
    expect(malicious.query).not.toContain(")");
    expect(malicious.query).not.toContain("*");
    expect(malicious.query).toContain("\\%");
    expect(malicious.query).toContain("\\_");
  });

  it("validates comment body length and trims whitespace", () => {
    expect(createProjectCommentSchema.safeParse({ content: "   " }).success).toBe(
      false,
    );
    expect(
      createProjectCommentSchema.safeParse({ content: "a".repeat(501) }).success,
    ).toBe(false);

    const ok = createProjectCommentSchema.safeParse({
      content: "  Muito legal esse código!  ",
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.content).toBe("Muito legal esse código!");
    }
  });

  it("injects restrictive CSP into safe HTML preview documents (RN-201)", () => {
    const fragmentDoc = buildSafeHtmlPreviewDoc("<h1>Olá Codit</h1>");
    expect(fragmentDoc).toContain('http-equiv="Content-Security-Policy"');
    expect(fragmentDoc).toContain("default-src 'none'");
    expect(fragmentDoc).toContain("<h1>Olá Codit</h1>");

    const fullHtmlDoc = buildSafeHtmlPreviewDoc(
      "<!DOCTYPE html><html><head><title>Teste</title></head><body><p>Oi</p></body></html>",
    );
    expect(fullHtmlDoc).toContain("default-src 'none'");
    expect(fullHtmlDoc).toContain("<title>Teste</title>");
  });
});
