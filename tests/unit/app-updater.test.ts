import { describe, expect, it } from "vitest";
import {
  checkForAppUpdate,
  isAllowedReleaseDownloadUrl,
  isNewerVersion,
  parseReleaseManifest,
  parseSemver,
} from "@/lib/app-updater";

describe("app-updater helpers", () => {
  it("parses valid semver strings with optional v prefix and suffixes", () => {
    expect(parseSemver("0.1.0")).toEqual([0, 1, 0]);
    expect(parseSemver("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseSemver("0.2.0-rc.1")).toEqual([0, 2, 0]);
    expect(parseSemver("Arquivos")).toBeNull();
    expect(parseSemver("1.0")).toBeNull();
    expect(parseSemver("")).toBeNull();
  });

  it("compares candidate and current versions accurately", () => {
    expect(isNewerVersion("0.2.0", "0.1.0")).toBe(true);
    expect(isNewerVersion("v1.0.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.1.0", "0.2.0")).toBe(false);
    expect(isNewerVersion("Arquivos", "0.1.0")).toBe(false);
  });

  it("allows only HTTPS download URLs from the official Codit GitHub Releases", () => {
    expect(
      isAllowedReleaseDownloadUrl(
        "https://github.com/siriuszzz17/Codit/releases/download/v0.2.0/app-release.apk",
      ),
    ).toBe(true);
    expect(
      isAllowedReleaseDownloadUrl(
        "http://github.com/siriuszzz17/Codit/releases/download/v0.2.0/app-release.apk",
      ),
    ).toBe(false);
    expect(
      isAllowedReleaseDownloadUrl(
        "https://github.com/other/repo/releases/download/v0.2.0/app.apk",
      ),
    ).toBe(false);
    expect(isAllowedReleaseDownloadUrl("https://evil.example/app.apk")).toBe(
      false,
    );
    expect(isAllowedReleaseDownloadUrl("javascript:alert(1)")).toBe(false);
  });

  it("validates static release manifest payloads", () => {
    const withAndroid = parseReleaseManifest({
      version: "0.2.0",
      notes: "Nova atualização",
      pub_date: "2026-11-23T00:19:37Z",
      android: {
        url: "https://github.com/siriuszzz17/Codit/releases/download/v0.2.0/app.apk",
      },
    });
    expect(withAndroid?.version).toBe("0.2.0");
    expect(withAndroid?.android?.url).toContain("app.apk");

    const desktopOnly = parseReleaseManifest({ version: "0.2.0" });
    expect(desktopOnly?.version).toBe("0.2.0");

    expect(parseReleaseManifest({ notes: "sem versao" })).toBeNull();
    expect(parseReleaseManifest(null)).toBeNull();
  });

  it("returns null outside Tauri Desktop and Capacitor Android", async () => {
    await expect(checkForAppUpdate("0.1.0")).resolves.toBeNull();
  });
});
