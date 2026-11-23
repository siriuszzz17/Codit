import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import type { SandboxProjectRow } from "@/lib/supabase/database.types";
import {
  createSandboxProject,
  listUserSandboxProjects,
  resolveDefaultRuntimeTarget,
  SandboxProjectConflictError,
  softDeleteSandboxProject,
  updateSandboxProject,
} from "@/modules/sandbox/sandbox-project-service";

function createProjectRow(
  overrides: Partial<SandboxProjectRow> = {},
): SandboxProjectRow {
  return {
    id: "proj-1",
    user_id: "user-123",
    title: "Meu Projeto",
    description: null,
    primary_language: "html_css_js",
    runtime_target: "client_iframe",
    source_code: "<h1>Codit</h1>",
    visibility: "private",
    share_slug: null,
    is_pinned: false,
    tags: [],
    repository_url: null,
    live_url: null,
    version: 1,
    created_at: "2026-11-22T12:00:00.000Z",
    updated_at: "2026-11-22T12:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("sandbox-project-service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps Python to client_pyodide, web stacks to client_iframe, and backend languages to remote targets (RN-201)", () => {
    expect(resolveDefaultRuntimeTarget("python")).toBe("client_pyodide");
    expect(resolveDefaultRuntimeTarget("html_css_js")).toBe("client_iframe");
    expect(resolveDefaultRuntimeTarget("javascript")).toBe("client_iframe");
    expect(resolveDefaultRuntimeTarget("react")).toBe("client_iframe");
    expect(resolveDefaultRuntimeTarget("java")).toBe("remote_judge0");
    expect(resolveDefaultRuntimeTarget("nodejs")).toBe("remote_piston");
  });

  it("creates new sandbox projects private by default and bound to userId (RN-003, RN-204)", async () => {
    const row = createProjectRow({
      primary_language: "python",
      runtime_target: "client_pyodide",
      source_code: "print('Codit')",
    });

    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });

    const mockClient = {
      from: vi.fn().mockReturnValue({ insert }),
    } as unknown as CoditSupabaseClient;

    const created = await createSandboxProject(
      "user-123",
      {
        title: "Olá Python",
        primaryLanguage: "python",
        sourceCode: "print('Codit')",
      },
      mockClient,
    );

    expect(mockClient.from).toHaveBeenCalledWith("sandbox_projects");
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-123",
      title: "Olá Python",
      description: null,
      primary_language: "python",
      runtime_target: "client_pyodide",
      source_code: "print('Codit')",
      visibility: "private",
      version: 1,
    });
    expect(created.version).toBe(1);
    expect(created.is_pinned).toBe(false);
    expect(created.tags).toEqual([]);
  });

  it("supports extended languages, normalized tags, pinning, and external links", async () => {
    const row = createProjectRow({
      primary_language: "react",
      runtime_target: "client_iframe",
      is_pinned: true,
      tags: ["frontend", "hooks"],
      repository_url: "https://github.com/codit/react-app",
      live_url: "https://react-app.codit.dev",
    });

    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });

    const mockClient = {
      from: vi.fn().mockReturnValue({ insert }),
    } as unknown as CoditSupabaseClient;

    const created = await createSandboxProject(
      "user-123",
      {
        title: "Dashboard React",
        primaryLanguage: "react",
        sourceCode: "export default function App() {}",
        isPinned: true,
        tags: ["#frontend", "Frontend", "hooks"],
        repositoryUrl: "https://github.com/codit/react-app",
        liveUrl: "https://react-app.codit.dev",
      },
      mockClient,
    );

    expect(insert).toHaveBeenCalledWith({
      user_id: "user-123",
      title: "Dashboard React",
      description: null,
      primary_language: "react",
      runtime_target: "client_iframe",
      source_code: "export default function App() {}",
      visibility: "private",
      version: 1,
      is_pinned: true,
      tags: ["frontend", "hooks"],
      repository_url: "https://github.com/codit/react-app",
      live_url: "https://react-app.codit.dev",
    });
    expect(created.primary_language).toBe("react");
    expect(created.is_pinned).toBe(true);
  });

  it("enforces optimistic locking with version increment and throws SandboxProjectConflictError on stale version (RN-203)", async () => {
    const maybeSingleStale = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });
    const selectStale = vi
      .fn()
      .mockReturnValue({ maybeSingle: maybeSingleStale });
    const isStale = vi.fn().mockReturnValue({ select: selectStale });
    const eqVersionStale = vi.fn().mockReturnValue({ is: isStale });
    const eqUserStale = vi.fn().mockReturnValue({ eq: eqVersionStale });
    const eqIdStale = vi.fn().mockReturnValue({ eq: eqUserStale });
    const updateStale = vi.fn().mockReturnValue({ eq: eqIdStale });

    const staleClient = {
      from: vi.fn().mockReturnValue({ update: updateStale }),
    } as unknown as CoditSupabaseClient;

    await expect(
      updateSandboxProject(
        "user-123",
        "proj-1",
        { title: "Título Atualizado", expectedVersion: 2 },
        staleClient,
      ),
    ).rejects.toBeInstanceOf(SandboxProjectConflictError);

    expect(updateStale).toHaveBeenCalledWith({
      title: "Título Atualizado",
      version: 3,
    });
    expect(eqIdStale).toHaveBeenCalledWith("id", "proj-1");
    expect(eqUserStale).toHaveBeenCalledWith("user_id", "user-123");
    expect(eqVersionStale).toHaveBeenCalledWith("version", 2);
  });

  it("gracefully falls back to Phase 2 columns when DB rejects extended language/columns and rehydrates pinned order", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });

    const legacyInsertedRow = {
      id: "proj-rust-1",
      user_id: "user-123",
      title: "CLI em Rust",
      description: null,
      primary_language: "typescript" as const,
      runtime_target: "client_iframe" as const,
      source_code: "fn main() {}",
      visibility: "private" as const,
      share_slug: null,
      version: 1,
      created_at: "2026-11-23T10:00:00.000Z",
      updated_at: "2026-11-23T10:00:00.000Z",
      deleted_at: null,
    };

    const legacyNormalRow = {
      id: "proj-py-2",
      user_id: "user-123",
      title: "Script Python",
      description: null,
      primary_language: "python" as const,
      runtime_target: "client_pyodide" as const,
      source_code: "print(1)",
      visibility: "private" as const,
      share_slug: null,
      version: 1,
      created_at: "2026-11-23T11:00:00.000Z",
      updated_at: "2026-11-23T11:00:00.000Z",
      deleted_at: null,
    };

    const single = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "23514",
          message:
            'new row for relation "sandbox_projects" violates check constraint "chk_sandbox_projects_language"',
        },
      })
      .mockResolvedValueOnce({ data: legacyInsertedRow, error: null });

    const selectAfterInsert = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: selectAfterInsert });

    const order = vi
      .fn()
      .mockResolvedValue({ data: [legacyNormalRow, legacyInsertedRow], error: null });
    const isNotDeleted = vi.fn().mockReturnValue({ order });
    const eqUser = vi.fn().mockReturnValue({ is: isNotDeleted });
    const selectList = vi.fn().mockReturnValue({ eq: eqUser });

    const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null });

    const mockClient = {
      from: vi.fn().mockReturnValue({ insert, select: selectList }),
      auth: { updateUser },
    } as unknown as CoditSupabaseClient;

    const created = await createSandboxProject(
      "user-123",
      {
        title: "CLI em Rust",
        primaryLanguage: "rust",
        sourceCode: "fn main() {}",
        isPinned: true,
        tags: ["systems"],
      },
      mockClient,
    );

    expect(created.primary_language).toBe("rust");
    expect(created.runtime_target).toBe("remote_judge0");
    expect(created.is_pinned).toBe(true);
    expect(created.tags).toEqual(["systems"]);

    const listed = await listUserSandboxProjects("user-123", mockClient);
    expect(listed).toHaveLength(2);
    expect(listed[0]?.id).toBe("proj-rust-1");
    expect(listed[0]?.primary_language).toBe("rust");
    expect(listed[0]?.is_pinned).toBe(true);
    expect(listed[1]?.id).toBe("proj-py-2");
  });

  it("performs soft delete scoped by user_id and non-deleted records", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: "proj-1" }, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const isNotDeleted = vi.fn().mockReturnValue({ select });
    const eqUser = vi.fn().mockReturnValue({ is: isNotDeleted });
    const eqId = vi.fn().mockReturnValue({ eq: eqUser });
    const update = vi.fn().mockReturnValue({ eq: eqId });

    const mockClient = {
      from: vi.fn().mockReturnValue({ update }),
    } as unknown as CoditSupabaseClient;

    const deleted = await softDeleteSandboxProject(
      "user-123",
      "proj-1",
      mockClient,
    );

    expect(deleted).toBe(true);
    expect(eqId).toHaveBeenCalledWith("id", "proj-1");
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-123");
    expect(isNotDeleted).toHaveBeenCalledWith("deleted_at", null);
  });

  it("supports creating and updating projects with visibility='friends'", async () => {
    const row = createProjectRow({
      visibility: "friends",
      version: 2,
    });

    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const insertSelect = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });

    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const updateSelect = vi.fn().mockReturnValue({ maybeSingle });
    const isNotDeleted = vi.fn().mockReturnValue({ select: updateSelect });
    const eqVersion = vi.fn().mockReturnValue({ is: isNotDeleted });
    const eqUser = vi.fn().mockReturnValue({ eq: eqVersion });
    const eqId = vi.fn().mockReturnValue({ eq: eqUser });
    const update = vi.fn().mockReturnValue({ eq: eqId });

    const mockClient = {
      from: vi.fn().mockReturnValue({ insert, update }),
    } as unknown as CoditSupabaseClient;

    const created = await createSandboxProject(
      "user-123",
      {
        title: "Projeto dos Amigos",
        visibility: "friends",
      },
      mockClient,
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        visibility: "friends",
      }),
    );
    expect(created.visibility).toBe("friends");

    const updated = await updateSandboxProject(
      "user-123",
      "proj-1",
      {
        visibility: "friends",
        expectedVersion: 1,
      },
      mockClient,
    );

    expect(update).toHaveBeenCalledWith({
      visibility: "friends",
      version: 2,
    });
    expect(updated.visibility).toBe("friends");
  });
});
