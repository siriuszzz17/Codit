import { describe, expect, it, vi } from "vitest";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/supabase/database.types";
import {
  ensureProfile,
  ProfileValidationError,
  updateProfile,
} from "@/modules/profiles/profile-service";

function createProfileRow(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "user-123",
    email: "aluno@codit.dev",
    full_name: "Aluno Codit",
    avatar_url: null,
    role: "student",
    bio: null,
    github_username: null,
    created_at: "2026-11-22T12:00:00.000Z",
    updated_at: "2026-11-22T12:00:00.000Z",
    ...overrides,
  };
}

describe("profile-service", () => {
  it("returns existing profile filtered by user id without issuing an extra upsert (RN-003)", async () => {
    const existing = createProfileRow();
    const maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });
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

    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const selectEq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: selectEq });

    const single = vi.fn().mockResolvedValue({ data: created, error: null });
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

    const single = vi.fn().mockResolvedValue({ data: updated, error: null });
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
    expect(saved.github_username).toBe("maria-dev");
  });
});
