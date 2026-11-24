export type FriendshipsDrawerTab = "friends" | "requests" | "find";

export const CODIT_FRIENDSHIPS_CHANGED_EVENT = "codit:friendships-changed";
export const CODIT_OPEN_FRIENDSHIPS_DRAWER_EVENT =
  "codit:open-friendships-drawer";
export const CODIT_MESSAGES_CHANGED_EVENT = "codit:messages-changed";
export const CODIT_NOTIFICATIONS_CHANGED_EVENT =
  "codit:notifications-changed";

export function emitFriendshipsChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(CODIT_FRIENDSHIPS_CHANGED_EVENT));
}

export function subscribeFriendshipsChanged(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = () => {
    listener();
  };
  window.addEventListener(CODIT_FRIENDSHIPS_CHANGED_EVENT, handler);
  return () => {
    window.removeEventListener(CODIT_FRIENDSHIPS_CHANGED_EVENT, handler);
  };
}

export function emitOpenFriendshipsDrawer(tab?: FriendshipsDrawerTab): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<{ tab?: FriendshipsDrawerTab }>(
      CODIT_OPEN_FRIENDSHIPS_DRAWER_EVENT,
      { detail: { tab } },
    ),
  );
}

export function subscribeOpenFriendshipsDrawer(
  listener: (tab?: FriendshipsDrawerTab) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ tab?: FriendshipsDrawerTab }>;
    listener(customEvent.detail?.tab);
  };
  window.addEventListener(CODIT_OPEN_FRIENDSHIPS_DRAWER_EVENT, handler);
  return () => {
    window.removeEventListener(CODIT_OPEN_FRIENDSHIPS_DRAWER_EVENT, handler);
  };
}

export function emitMessagesChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(CODIT_MESSAGES_CHANGED_EVENT));
}

export function subscribeMessagesChanged(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = () => {
    listener();
  };
  window.addEventListener(CODIT_MESSAGES_CHANGED_EVENT, handler);
  return () => {
    window.removeEventListener(CODIT_MESSAGES_CHANGED_EVENT, handler);
  };
}

export function emitNotificationsChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(CODIT_NOTIFICATIONS_CHANGED_EVENT));
}

export function subscribeNotificationsChanged(
  listener: () => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = () => {
    listener();
  };
  window.addEventListener(CODIT_NOTIFICATIONS_CHANGED_EVENT, handler);
  return () => {
    window.removeEventListener(CODIT_NOTIFICATIONS_CHANGED_EVENT, handler);
  };
}
