import { describe, expect, it, vi } from "vitest";
import {
  isNavItemActive,
  normalizePathname,
  PRIMARY_NAV_ITEMS,
  shouldShowTopNavbar,
} from "@/lib/navigation";
import {
  CODIT_FRIENDSHIPS_CHANGED_EVENT,
  CODIT_OPEN_FRIENDSHIPS_DRAWER_EVENT,
  emitFriendshipsChanged,
  emitOpenFriendshipsDrawer,
  subscribeFriendshipsChanged,
  subscribeOpenFriendshipsDrawer,
} from "@/lib/social-events";

describe("navigation helpers", () => {
  it("exposes dedicated top-level navigation routes for home, projects, community and profile", () => {
    const hrefs = PRIMARY_NAV_ITEMS.map((item) => item.href);
    expect(hrefs).toEqual(["/", "/projetos", "/comunidade", "/conta"]);
  });

  it("normalizes pathnames safely", () => {
    expect(normalizePathname(undefined)).toBe("/");
    expect(normalizePathname(null)).toBe("/");
    expect(normalizePathname("")).toBe("/");
    expect(normalizePathname("   ")).toBe("/");
    expect(normalizePathname("/")).toBe("/");
    expect(normalizePathname("/projetos/")).toBe("/projetos");
    expect(normalizePathname("comunidade/perfil/")).toBe("/comunidade/perfil");
  });

  it("matches active navigation items accurately without false positives on root", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/projetos", "/")).toBe(false);
    expect(isNavItemActive("/projetos", "/projetos")).toBe(true);
    expect(isNavItemActive("/projetos/", "/projetos")).toBe(true);
    expect(isNavItemActive("/comunidade", "/comunidade")).toBe(true);
    expect(isNavItemActive("/comunidade/perfil", "/comunidade")).toBe(true);
    expect(isNavItemActive("/comunidade-extra", "/comunidade")).toBe(false);
    expect(isNavItemActive("/conta", "/conta")).toBe(true);
  });

  it("hides the top navbar on /auth/callback and shows it on main routes", () => {
    expect(shouldShowTopNavbar("/auth/callback")).toBe(false);
    expect(shouldShowTopNavbar("/auth/callback/")).toBe(false);
    expect(shouldShowTopNavbar("/")).toBe(true);
    expect(shouldShowTopNavbar("/projetos")).toBe(true);
    expect(shouldShowTopNavbar("/comunidade")).toBe(true);
    expect(shouldShowTopNavbar("/conta")).toBe(true);
    expect(shouldShowTopNavbar("/auth")).toBe(true);
  });
});

describe("social event bus", () => {
  it("runs cleanly in SSR environments where window is undefined", () => {
    expect(typeof window).toBe("undefined");
    expect(() => emitFriendshipsChanged()).not.toThrow();
    expect(() => emitOpenFriendshipsDrawer("requests")).not.toThrow();

    const unsubChanged = subscribeFriendshipsChanged(vi.fn());
    const unsubDrawer = subscribeOpenFriendshipsDrawer(vi.fn());
    expect(() => unsubChanged()).not.toThrow();
    expect(() => unsubDrawer()).not.toThrow();
  });

  it("dispatches and receives friendship drawer and change events when window is present", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);

    try {
      const changedHandler = vi.fn();
      const drawerHandler = vi.fn();

      const unsubChanged = subscribeFriendshipsChanged(changedHandler);
      const unsubDrawer = subscribeOpenFriendshipsDrawer(drawerHandler);

      emitFriendshipsChanged();
      emitOpenFriendshipsDrawer("find");

      expect(changedHandler).toHaveBeenCalledTimes(1);
      expect(drawerHandler).toHaveBeenCalledTimes(1);
      expect(drawerHandler).toHaveBeenCalledWith("find");

      expect(CODIT_FRIENDSHIPS_CHANGED_EVENT).toBe("codit:friendships-changed");
      expect(CODIT_OPEN_FRIENDSHIPS_DRAWER_EVENT).toBe(
        "codit:open-friendships-drawer",
      );

      unsubChanged();
      unsubDrawer();

      emitFriendshipsChanged();
      emitOpenFriendshipsDrawer("requests");
      expect(changedHandler).toHaveBeenCalledTimes(1);
      expect(drawerHandler).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
