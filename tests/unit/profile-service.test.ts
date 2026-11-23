import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/supabase/database.types";
import {
  ensureProfile,
  ProfileServiceError,
  ProfileValidationError,
  updateProfile,
} from "@/modules/profiles/profile-service";

function createProfileRow(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "user-123",
    email: "aluno@codit.dev",
    full_name: "Aluno Codit",
    username: "aluno_codit",
    username_changed_at: null,
    avatar_url: null,
    role: "student",
    bio: null,
    github_username: null,
    headline: null,
    location: null,
    website_url: null,
    linkedin_url: null,
    banner_preset: "nebula",
    accent_theme: "violet",
    avatar_frame: "glow",
    octopy_companion: "coding",
    skills: [],
    show_email: false,
    created_at: "2026-11-22T12:00:00.000Z",
    updated_at: "2026-11-22T12:00:00.000Z",
    ...overrides,
  };
}

describe("profile-service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns existing profile filtered by user id without issuing an extra upsert (RN-003)", async () => {
    const existing = createProfileRow();
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: existing, error: null, status: 200 });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const upsert = vi.fn();

    const mockClient = {
      from: vi.fn().mockReturnValue({ select, upsert }),
    } as unknown as CoditSupabaseClient;

    const result = await ensureProfile(
      { id: "user-123", email: "aluno@codit.dev", user_metadata: {} },
      mockClient,
    );

    expect(mockClient.from).toHaveBeenCalledWith("profiles");
    expect(eq).toHaveBeenCalledWith("id", "user-123");
    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual(existing);
  });

  it("creates profile with role='student' and safe metadata fallback when absent", async () => {
    const created = createProfileRow({
      full_name: "Octopy Dev",
      avatar_url: "https://example.com/avatar.png",
    });

    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: null, status: 200 });
    const selectEq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: selectEq });

    const single = vi
      .fn()
      .mockResolvedValue({ data: created, error: null, status: 201 });
    const upsertSelect = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select: upsertSelect });

    const mockClient = {
      from: vi.fn().mockReturnValue({ select, upsert }),
    } as unknown as CoditSupabaseClient;

    const result = await ensureProfile(
      {
        id: "user-123",
        email: "ALUNO@CODIT.DEV",
        user_metadata: {
          full_name: "Octopy Dev",
          avatar_url: "https://example.com/avatar.png",
        },
      },
      mockClient,
    );

    expect(upsert).toHaveBeenCalledWith(
      {
        id: "user-123",
        email: "aluno@codit.dev",
        full_name: "Octopy Dev",
        avatar_url: "https://example.com/avatar.png",
        role: "student",
      },
      { onConflict: "id" },
    );
    expect(result.full_name).toBe("Octopy Dev");
  });

  it("updates only allowed profile fields scoped by user id and rejects unsafe avatar URLs", async () => {
    const updated = createProfileRow({
      full_name: "Maria Oliveira",
      github_username: "maria-dev",
      bio: "Estudando Python e IA",
    });

    const single = vi
      .fn()
      .mockResolvedValue({ data: updated, error: null, status: 200 });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });

    const mockClient = {
      from: vi.fn().mockReturnValue({ update }),
    } as unknown as CoditSupabaseClient;

    await expect(
      updateProfile(
        "user-123",
        {
          fullName: "Maria Oliveira",
          avatarUrl: "javascript:alert(1)",
        },
        mockClient,
      ),
    ).rejects.toBeInstanceOf(ProfileValidationError);

    const saved = await updateProfile(
      "user-123",
      {
        fullName: "Maria Oliveira",
        githubUsername: "maria-dev",
        bio: "Estudando Python e IA",
      },
      mockClient,
    );

    expect(eq).toHaveBeenCalledWith("id", "user-123");
    const updateArg = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg).not.toHaveProperty("role");
    expect(updateArg).not.toHaveProperty("id");
    expect(updateArg).not.toHaveProperty("username_changed_at");
    expect(saved.github_username).toBe("maria-dev");
  });

  it("accepts curated Octopy avatars and profile customization fields while rejecting unsafe paths", async () => {
    const updated = createProfileRow({
      full_name: "Lucas Silva",
      avatar_url: "/icons/octopy-coding.png",
      banner_preset: "aurora",
      accent_theme: "cyan",
      avatar_frame: "pixel",
      octopy_companion: "headphones",
      skills: ["Python", "TypeScript"],
      show_email: true,
    });

    const single = vi
      .fn()
      .mockResolvedValue({ data: updated, error: null, status: 200 });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });

    const mockClient = {
      from: vi.fn().mockReturnValue({ update }),
    } as unknown as CoditSupabaseClient;

    await expect(
      updateProfile(
        "user-123",
        { fullName: "Lucas Silva", avatarUrl: "../evil.png" },
        mockClient,
      ),
    ).rejects.toBeInstanceOf(ProfileValidationError);

    await expect(
      updateProfile(
        "user-123",
        {
          fullName: "Lucas Silva",
          websiteUrl: "ftp://invalid.example.com",
        },
        mockClient,
      ),
    ).rejects.toBeInstanceOf(ProfileValidationError);

    await expect(
      updateProfile(
        "user-123",
        {
          fullName: "Lucas Silva",
          skills: Array.from({ length: 13 }, (_, idx) => `Skill-${idx}`),
        },
        mockClient,
      ),
    ).rejects.toBeInstanceOf(ProfileValidationError);

    const saved = await updateProfile(
      "user-123",
      {
        fullName: "Lucas Silva",
        avatarUrl: "/icons/octopy-coding.png",
        headline: "Desenvolvedor Python",
        location: "São Paulo, BR",
        websiteUrl: "https://lucas.dev",
        linkedinUrl: "https://linkedin.com/in/lucas",
        bannerPreset: "aurora",
        accentTheme: "cyan",
        avatarFrame: "pixel",
        octopyCompanion: "headphones",
        skills: ["Python", "python", "TypeScript"],
        showEmail: true,
      },
      mockClient,
    );

    const payload = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.skills).toEqual(["Python", "TypeScript"]);
    expect(payload.banner_preset).toBe("aurora");
    expect(saved.avatar_url).toBe("/icons/octopy-coding.png");
    expect(saved.accent_theme).toBe("cyan");
  });

  it("normalizes and updates @username on profiles and enforces 30-day cooldown + anti-impersonation", async () => {
    const updated = createProfileRow({
      full_name: "Maria Oliveira",
      username: "maria.dev",
      username_changed_at: new Date().toISOString(),
    });

    const single = vi
      .fn()
      .mockResolvedValue({ data: updated, error: null, status: 200 });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });

    const mockClient = {
      from: vi.fn().mockReturnValue({ update }),
    } as unknown as CoditSupabaseClient;

    await expect(
      updateProfile(
        "user-123",
        {
          fullName: "Maria Oliveira",
          username: "admin",
        },
        mockClient,
      ),
    ).rejects.toBeInstanceOf(ProfileValidationError);

    await expect(
      updateProfile(
        "user-123",
        {
          fullName: "Maria Oliveira",
          username: "codit_oficial",
        },
        mockClient,
      ),
    ).rejects.toBeInstanceOf(ProfileValidationError);

    // 1ª definição imediata quando username_changed_at === null
    const saved = await updateProfile(
      "user-123",
      {
        fullName: "Maria Oliveira",
        username: "  @Maria.Dev ",
      },
      mockClient,
      {
        currentProfile: {
          username: "aluno_codit",
          username_changed_at: null,
        },
      },
    );

    expect(update).toHaveBeenCalledWith({
      full_name: "Maria Oliveira",
      username: "maria.dev",
    });
    expect(saved.username).toBe("maria.dev");

    // Bloqueia nova mudança dentro de 30 dias
    const recentIso = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await expect(
      updateProfile(
        "user-123",
        {
          fullName: "Maria Oliveira",
          username: "maria.novo",
        },
        mockClient,
        {
          currentProfile: {
            username: "maria.dev",
            username_changed_at: recentIso,
          },
        },
      ),
    ).rejects.toThrow("Próxima alteração liberada em");

    // Permite editar bio/nome durante o cooldown omitindo username do payload
    update.mockClear();
    await updateProfile(
      "user-123",
      {
        fullName: "Maria Oliveira",
        username: "@Maria.Dev",
        bio: "Nova bio",
      },
      mockClient,
      {
        currentProfile: {
          username: "maria.dev",
          username_changed_at: recentIso,
        },
      },
    );
    expect(update).toHaveBeenCalledWith({
      full_name: "Maria Oliveira",
      bio: "Nova bio",
    });

    // Libera nova mudança após 30 dias
    update.mockClear();
    const expiredCooldownIso = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await updateProfile(
      "user-123",
      {
        fullName: "Maria Oliveira",
        username: "maria.v2",
      },
      mockClient,
      {
        currentProfile: {
          username: "maria.dev",
          username_changed_at: expiredCooldownIso,
        },
      },
    );
    expect(update).toHaveBeenCalledWith({
      full_name: "Maria Oliveira",
      username: "maria.v2",
    });
  });

  it("maps server-side DB cooldown (P0001), blocks cross-user updates, and exposes 42501 grant diagnostic", async () => {
    const updateCrossUser = vi.fn();
    const mismatchedClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "user-B" } } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({ update: updateCrossUser }),
    } as unknown as CoditSupabaseClient;

    await expect(
      updateProfile(
        "user-A",
        { fullName: "Atacante" },
        mismatchedClient,
      ),
    ).rejects.toMatchObject({
      name: "ProfileServiceError",
      code: "AUTH_USER_MISMATCH",
    });
    expect(updateCrossUser).not.toHaveBeenCalled();

    const singleCooldown = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "USERNAME_COOLDOWN_ACTIVE:2026-12-23T12:00:00Z",
      },
      status: 400,
    });
    const eqCooldown = vi
      .fn()
      .mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleCooldown }) });
    const serverCooldownClient = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: eqCooldown }),
      }),
    } as unknown as CoditSupabaseClient;

    await expect(
      updateProfile(
        "user-123",
        { fullName: "Aluno Codit", username: "outro.handle" },
        serverCooldownClient,
      ),
    ).rejects.toThrow("Próxima alteração liberada em");

    const singleGrantErr = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for table profiles",
      },
      status: 401,
    });
    const eqGrantErr = vi
      .fn()
      .mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleGrantErr }) });
    const grantErrClient = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: eqGrantErr }),
      }),
    } as unknown as CoditSupabaseClient;

    await expect(
      updateProfile("user-123", { fullName: "Aluno Codit" }, grantErrClient),
    ).rejects.toMatchObject({
      name: "ProfileServiceError",
      isPermissionGrantMissing: true,
    } satisfies Partial<ProfileServiceError>);
  });

  it("falls back to core profile update and local preferences when DB still uses Phase 2 schema", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });

    const coreRow = {
      id: "user-123",
      email: "aluno@codit.dev",
      full_name: "Ana Costa",
      avatar_url: "/icons/octopy-happy.png",
      role: "student" as const,
      bio: "Bio atualizada",
      github_username: "ana-dev",
      created_at: "2026-11-22T12:00:00.000Z",
      updated_at: "2026-11-23T12:00:00.000Z",
    };

    const single = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "PGRST204",
          message: "Could not find the 'banner_preset' column of 'profiles' in the schema cache",
        },
        status: 400,
      })
      .mockResolvedValueOnce({ data: coreRow, error: null, status: 200 });

    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null });

    const mockClient = {
      from: vi.fn().mockReturnValue({ update }),
      auth: { updateUser },
    } as unknown as CoditSupabaseClient;

    const result = await updateProfile(
      "user-123",
      {
        fullName: "Ana Costa",
        bio: "Bio atualizada",
        githubUsername: "ana-dev",
        avatarUrl: "/icons/octopy-happy.png",
        bannerPreset: "emerald_matrix",
        accentTheme: "emerald",
        skills: ["React", "Go"],
        showEmail: true,
      },
      mockClient,
    );

    expect(update).toHaveBeenCalledTimes(2);
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(result.banner_preset).toBe("emerald_matrix");
    expect(result.accent_theme).toBe("emerald");
    expect(result.skills).toEqual(["React", "Go"]);
    expect(result.show_email).toBe(true);
  });
});
