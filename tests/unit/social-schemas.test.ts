import { describe, expect, it } from "vitest";
import { buildSafeHtmlPreviewDoc } from "@/components/social/social-labels";
import {
  coditUsernameSchema,
  createProjectCommentSchema,
  formatHandle,
  getUsernameChangeEligibility,
  normalizeUsernameInput,
  sanitizeCommunitySearchTerm,
} from "@/modules/social/social-schemas";

describe("social schemas and sanitization", () => {
  it("normalizes and validates @username handles and blocks reserved or impersonation handles", () => {
    expect(normalizeUsernameInput("  @Octopy.Dev ")).toBe("octopy.dev");
    expect(formatHandle("maria_dev")).toBe("@maria_dev");
    expect(formatHandle(null)).toBe("");

    const valid = coditUsernameSchema.safeParse("  @@Maria.Dev_01 ");
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data).toBe("maria.dev_01");
    }

    // Handles pessoais com "octopy" continuam permitidos se não indicarem impersonação oficial
    expect(coditUsernameSchema.safeParse("octopy.dev").success).toBe(true);
    expect(coditUsernameSchema.safeParse("joao.octopy").success).toBe(true);

    // Formatos inválidos e termos reservados / impersonação bloqueados
    expect(coditUsernameSchema.safeParse("ab").success).toBe(false);
    expect(coditUsernameSchema.safeParse("a".repeat(31)).success).toBe(false);
    expect(coditUsernameSchema.safeParse(".maria").success).toBe(false);
    expect(coditUsernameSchema.safeParse("maria_").success).toBe(false);
    expect(coditUsernameSchema.safeParse("maria..dev").success).toBe(false);
    expect(coditUsernameSchema.safeParse("maria__dev").success).toBe(false);
    expect(coditUsernameSchema.safeParse("maria-dev").success).toBe(false);
    expect(coditUsernameSchema.safeParse("admin").success).toBe(false);
    expect(coditUsernameSchema.safeParse("administrador").success).toBe(false);
    expect(coditUsernameSchema.safeParse("staff").success).toBe(false);
    expect(coditUsernameSchema.safeParse("octopy").success).toBe(false);
    expect(coditUsernameSchema.safeParse("codit_oficial").success).toBe(false);
    expect(coditUsernameSchema.safeParse("octopy_admin").success).toBe(false);
    expect(coditUsernameSchema.safeParse("suporte.codit").success).toBe(false);
  });

  it("computes first-time @username eligibility and 30-day cooldown accurately", () => {
    const now = new Date("2026-11-23T12:00:00.000Z");

    expect(getUsernameChangeEligibility(null, now)).toEqual({
      canChange: true,
      isFirstDefinition: true,
      lastChangedAt: null,
      nextAllowedAt: null,
      remainingDays: 0,
    });

    const tenDaysAgo = new Date("2026-11-13T12:00:00.000Z").toISOString();
    const blocked10 = getUsernameChangeEligibility(tenDaysAgo, now);
    expect(blocked10.canChange).toBe(false);
    expect(blocked10.isFirstDefinition).toBe(false);
    expect(blocked10.remainingDays).toBe(20);
    expect(blocked10.nextAllowedAt?.toISOString()).toBe(
      "2026-12-13T12:00:00.000Z",
    );

    const almostExpired = new Date(
      now.getTime() - (30 * 24 - 1) * 60 * 60 * 1000,
    ).toISOString();
    const blocked1HourLeft = getUsernameChangeEligibility(almostExpired, now);
    expect(blocked1HourLeft.canChange).toBe(false);
    expect(blocked1HourLeft.remainingDays).toBe(1);

    const thirtyDaysPassed = new Date(
      now.getTime() - (30 * 24 * 60 * 60 * 1000 + 1000),
    ).toISOString();
    const unlocked = getUsernameChangeEligibility(thirtyDaysPassed, now);
    expect(unlocked.canChange).toBe(true);
    expect(unlocked.isFirstDefinition).toBe(false);
    expect(unlocked.remainingDays).toBe(0);
    expect(unlocked.nextAllowedAt).toBeNull();
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
