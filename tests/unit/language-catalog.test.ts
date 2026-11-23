import { describe, expect, it } from "vitest";
import {
  computeLanguageBreakdown,
  CORE_LEGACY_LANGUAGES,
  getLanguageMeta,
  isStarterCodeSample,
  LANGUAGE_CATALOG,
  ORDERED_SANDBOX_LANGUAGES,
  toLegacySandboxLanguage,
} from "@/modules/sandbox/language-catalog";

describe("language-catalog", () => {
  it("defines complete metadata and starter templates for all 15 languages", () => {
    expect(ORDERED_SANDBOX_LANGUAGES).toHaveLength(15);

    for (const lang of ORDERED_SANDBOX_LANGUAGES) {
      const meta = LANGUAGE_CATALOG[lang];
      expect(meta.id).toBe(lang);
      expect(meta.label.trim().length).toBeGreaterThan(0);
      expect(meta.shortLabel.trim().length).toBeGreaterThan(0);
      expect(meta.fileName.trim().length).toBeGreaterThan(0);
      expect(meta.accentHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(meta.starterCode.trim().length).toBeGreaterThan(10);
      expect(CORE_LEGACY_LANGUAGES).toContain(toLegacySandboxLanguage(lang));
    }
  });

  it("falls back safely to html_css_js for unknown language codes", () => {
    expect(getLanguageMeta("unknown_lang").id).toBe("html_css_js");
  });

  it("identifies starter templates vs custom user code", () => {
    expect(isStarterCodeSample("")).toBe(true);
    expect(isStarterCodeSample(LANGUAGE_CATALOG.python.starterCode)).toBe(true);
    expect(isStarterCodeSample("print('código customizado do aluno')")).toBe(
      false,
    );
  });

  it("computes sorted language breakdown percentages from saved projects", () => {
    const breakdown = computeLanguageBreakdown([
      { primary_language: "python" },
      { primary_language: "python" },
      { primary_language: "react" },
      { primary_language: "html_css_js" },
    ]);

    expect(breakdown).toHaveLength(3);
    expect(breakdown[0]?.language).toBe("python");
    expect(breakdown[0]?.count).toBe(2);
    expect(breakdown[0]?.percent).toBe(50);
    expect(breakdown[1]?.percent).toBe(25);
    expect(breakdown[2]?.percent).toBe(25);
  });
});
