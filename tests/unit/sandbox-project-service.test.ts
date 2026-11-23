import { describe, expect, it, vi } from "vitest";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import type { SandboxProjectRow } from "@/lib/supabase/database.types";
import {
  createSandboxProject,
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
    version: 1,
    created_at: "2026-11-22T12:00:00.000Z",
    updated_at: "2026-11-22T12:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("sandbox-project-service", () => {
  it("maps Python to client_pyodide and web stacks to client_iframe (RN-201)", () => {
    expect(resolveDefaultRuntimeTarget("python")).toBe("client_pyodide");
    expect(resolveDefaultRuntimeTarget("html_css_js")).toBe("client_iframe");
    expect(resolveDefaultRuntimeTarget("javascript")).toBe("client_iframe");
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
});
