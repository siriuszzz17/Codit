import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface LocalSupabaseEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

interface TestActor {
  id: string;
  email: string;
  client: SupabaseClient;
}

function readSupabaseStatusEnv(): Record<string, string> {
  const commands = ["supabase status -o env", "npx supabase status -o env"];
  for (const command of commands) {
    try {
      const raw = execSync(command, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const parsed: Record<string, string> = {};
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed
          .slice(eq + 1)
          .trim()
          .replace(/^"(.*)"$/, "$1");
        parsed[key] = value;
      }
      if (Object.keys(parsed).length > 0) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return {};
}

function resolveLocalSupabaseEnv(): LocalSupabaseEnv {
  const fromStatus =
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
      ? {}
      : readSupabaseStatusEnv();

  const url =
    process.env.SUPABASE_URL ??
    fromStatus.API_URL ??
    "http://127.0.0.1:54321";
  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? fromStatus.ANON_KEY ?? "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    fromStatus.SERVICE_ROLE_KEY ??
    "";

  if (!anonKey || !serviceRoleKey) {
    throw new Error(
      "Supabase local indisponível. Execute `npx supabase start` ou defina SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return { url, anonKey, serviceRoleKey };
}

function makeClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

describe("Supabase RLS & SECURITY DEFINER integration suite", () => {
  let env: LocalSupabaseEnv;
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let userA: TestActor;
  let userB: TestActor;
  let userC: TestActor;

  const createdUserIds: string[] = [];

  async function createSignedInActor(tag: string): Promise<TestActor> {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const email = `rls_${tag}_${suffix}@codit.local`;
    const password = `CoditRls!${suffix}99`;

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: `Teste RLS ${tag.toUpperCase()}`,
      },
    });

    if (error || !data.user) {
      throw new Error(
        `Falha ao criar usuário ${tag}: ${error?.message ?? "sem usuário"}`,
      );
    }

    createdUserIds.push(data.user.id);

    const client = makeClient(env.url, env.anonKey);
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      throw new Error(
        `Falha ao autenticar usuário ${tag}: ${signInError.message}`,
      );
    }

    return {
      id: data.user.id,
      email,
      client,
    };
  }

  beforeAll(async () => {
    env = resolveLocalSupabaseEnv();
    admin = makeClient(env.url, env.serviceRoleKey);
    anon = makeClient(env.url, env.anonKey);

    userA = await createSignedInActor("a");
    userB = await createSignedInActor("b");
    userC = await createSignedInActor("c");
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("enforces strict user_id isolation on profiles and private sandbox_projects", async () => {
    const { data: anonProfiles } = await anon.from("profiles").select("id");
    expect(anonProfiles ?? []).toHaveLength(0);

    const { data: bReadsA } = await userB.client
      .from("profiles")
      .select("id")
      .eq("id", userA.id);
    expect(bReadsA ?? []).toHaveLength(0);

    const { error: roleEscalationError } = await userA.client
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", userA.id);
    expect(roleEscalationError).not.toBeNull();

    const { data: privateProject, error: insertError } = await userA.client
      .from("sandbox_projects")
      .insert({
        user_id: userA.id,
        title: "Projeto Privado RLS",
        language: "javascript",
        source_code: "console.log('privado');",
        visibility: "private",
      })
      .select("id")
      .single();

    expect(insertError).toBeNull();
    expect(privateProject?.id).toBeTruthy();

    const { data: bReadsPrivate } = await userB.client
      .from("sandbox_projects")
      .select("id")
      .eq("id", privateProject!.id);
    expect(bReadsPrivate ?? []).toHaveLength(0);

    const { error: cForgetsOwner } = await userC.client
      .from("sandbox_projects")
      .insert({
        user_id: userA.id,
        title: "Tentativa IDOR",
        language: "javascript",
        source_code: "console.log('idor');",
        visibility: "private",
      });
    expect(cForgetsOwner).not.toBeNull();
  });

  it("blocks 3rd-user enumeration on are_users_friends while allowing participants", async () => {
    const { error: reqError } = await userA.client.from("friendships").insert({
      requester_id: userA.id,
      addressee_id: userB.id,
      status: "pending",
    });
    expect(reqError).toBeNull();

    const { error: acceptError } = await userB.client
      .from("friendships")
      .update({ status: "accepted" })
      .eq("requester_id", userA.id)
      .eq("addressee_id", userB.id);
    expect(acceptError).toBeNull();

    const { data: aChecksAB, error: aErr } = await userA.client.rpc(
      "are_users_friends",
      { p_user_a: userA.id, p_user_b: userB.id },
    );
    expect(aErr).toBeNull();
    expect(aChecksAB).toBe(true);

    const { data: bChecksAB, error: bErr } = await userB.client.rpc(
      "are_users_friends",
      { p_user_a: userA.id, p_user_b: userB.id },
    );
    expect(bErr).toBeNull();
    expect(bChecksAB).toBe(true);

    // 3º usuário (userC) não pode enumerar se userA e userB são amigos
    const { data: cEnumeratesAB, error: cErr } = await userC.client.rpc(
      "are_users_friends",
      { p_user_a: userA.id, p_user_b: userB.id },
    );
    expect(cErr).toBeNull();
    expect(cEnumeratesAB).toBe(false);

    // Usuário anônimo não tem EXECUTE em are_users_friends
    const { error: anonErr } = await anon.rpc("are_users_friends", {
      p_user_a: userA.id,
      p_user_b: userB.id,
    });
    expect(anonErr).not.toBeNull();
  });

  it("blocks 3rd-user enumeration on is_active_chat_member and redacts soft-deleted chat_messages", async () => {
    // Usuário não amigo não pode abrir DM
    const { error: nonFriendDmError } = await userA.client.rpc(
      "get_or_create_direct_conversation",
      { p_friend_id: userC.id },
    );
    expect(nonFriendDmError).not.toBeNull();

    // Amigos aceitos (A <-> B) criam DM
    const { data: conversationId, error: dmError } = await userA.client.rpc(
      "get_or_create_direct_conversation",
      { p_friend_id: userB.id },
    );
    expect(dmError).toBeNull();
    expect(typeof conversationId).toBe("string");

    // Participante próprio recebe true
    const { data: aIsMember } = await userA.client.rpc(
      "is_active_chat_member",
      { p_conversation_id: conversationId, p_user_id: userA.id },
    );
    expect(aIsMember).toBe(true);

    // 3º usuário (userC) tentando enumerar se userA pertence à conversa recebe false
    const { data: cEnumeratesMember, error: cEnumErr } = await userC.client.rpc(
      "is_active_chat_member",
      { p_conversation_id: conversationId, p_user_id: userA.id },
    );
    expect(cEnumErr).toBeNull();
    expect(cEnumeratesMember).toBe(false);

    // 3º usuário não lê a conversa nem envia mensagens
    const { data: cReadsConv } = await userC.client
      .from("chat_conversations")
      .select("id")
      .eq("id", conversationId);
    expect(cReadsConv ?? []).toHaveLength(0);

    const { error: cInsertMsgErr } = await userC.client
      .from("chat_messages")
      .insert({
        conversation_id: conversationId,
        sender_id: userC.id,
        message_type: "text",
        content: "Intrusão",
      });
    expect(cInsertMsgErr).not.toBeNull();

    // userA envia mensagem sensível
    const secretText = "Conteúdo sensível que deve sumir após exclusão";
    const { data: insertedMsg, error: sendErr } = await userA.client
      .from("chat_messages")
      .insert({
        conversation_id: conversationId,
        sender_id: userA.id,
        message_type: "text",
        content: secretText,
      })
      .select("id, content, deleted_at")
      .single();

    expect(sendErr).toBeNull();
    expect(insertedMsg?.content).toBe(secretText);

    // Edição de conteúdo sem soft-delete continua bloqueada
    const { error: editContentErr } = await userA.client
      .from("chat_messages")
      .update({ content: "Texto adulterado" })
      .eq("id", insertedMsg!.id);
    expect(editContentErr).not.toBeNull();

    // userB não pode excluir mensagem de userA
    const { data: bDeleteAttempt } = await userB.client
      .from("chat_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", insertedMsg!.id)
      .select("id");
    expect(bDeleteAttempt ?? []).toHaveLength(0);

    // userA faz soft-delete -> trigger redige automaticamente content
    const { data: deletedMsg, error: softDeleteErr } = await userA.client
      .from("chat_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", insertedMsg!.id)
      .select("id, content, deleted_at")
      .single();

    expect(softDeleteErr).toBeNull();
    expect(deletedMsg?.deleted_at).not.toBeNull();
    expect(deletedMsg?.content).toBe("[Mensagem removida]");

    // Confirma via service_role e via userB que o texto original foi redigido no banco
    const { data: bReadsDeleted } = await userB.client
      .from("chat_messages")
      .select("content, deleted_at")
      .eq("id", insertedMsg!.id)
      .single();
    expect(bReadsDeleted?.content).toBe("[Mensagem removida]");

    // Restauração de mensagem excluída permanece bloqueada
    const { error: restoreErr } = await userA.client
      .from("chat_messages")
      .update({ deleted_at: null })
      .eq("id", insertedMsg!.id);
    expect(restoreErr).not.toBeNull();
  });

  it("isolates notifications and push_devices per user_id", async () => {
    const { error: cReadsNotificationsErr, data: cReadsNotifications } =
      await userC.client
        .from("notifications")
        .select("id")
        .eq("user_id", userA.id);
    expect(cReadsNotificationsErr).toBeNull();
    expect(cReadsNotifications ?? []).toHaveLength(0);

    const { data: cReadsPush } = await userC.client
      .from("push_devices")
      .select("id")
      .eq("user_id", userA.id);
    expect(cReadsPush ?? []).toHaveLength(0);
  });

  it("enforces bilateral user_blocks on DM creation and chat_messages insert", async () => {
    // Cria DM enquanto A e B ainda são amigos
    const { data: convId, error: dmErr } = await userA.client.rpc(
      "get_or_create_direct_conversation",
      { p_friend_id: userB.id },
    );
    expect(dmErr).toBeNull();
    expect(typeof convId).toBe("string");

    // userA bloqueia userB -> trigger remove amizade
    const { error: blockErr } = await userA.client.from("user_blocks").insert({
      blocker_id: userA.id,
      blocked_id: userB.id,
      reason: "Teste RLS bloqueio bilateral",
    });
    expect(blockErr).toBeNull();

    // userB (bloqueado) falha ao abrir DM com userA
    const { error: blockedDmErr } = await userB.client.rpc(
      "get_or_create_direct_conversation",
      { p_friend_id: userA.id },
    );
    expect(blockedDmErr).not.toBeNull();

    // userB (bloqueado) falha ao enviar mensagem na DM existente
    const { error: blockedMsgErr } = await userB.client
      .from("chat_messages")
      .insert({
        conversation_id: convId,
        sender_id: userB.id,
        message_type: "text",
        content: "Mensagem bloqueada",
      });
    expect(blockedMsgErr).not.toBeNull();

    // userA também falha ao enviar DM enquanto bloqueio existir (bilateral)
    const { error: blockerMsgErr } = await userA.client
      .from("chat_messages")
      .insert({
        conversation_id: convId,
        sender_id: userA.id,
        message_type: "text",
        content: "Mensagem bilateral bloqueada",
      });
    expect(blockerMsgErr).not.toBeNull();
  });

  it("deletes profiles, public_profiles, sandbox_projects and push_devices via delete_my_account", async () => {
    const disposable = await createSignedInActor("del");

    const { data: prof } = await disposable.client
      .from("profiles")
      .select("username")
      .eq("id", disposable.id)
      .single();
    expect(prof?.username).toBeTruthy();

    await disposable.client.from("sandbox_projects").insert({
      user_id: disposable.id,
      title: "Projeto para exclusão LGPD",
      language: "javascript",
      source_code: "console.log('lgpd');",
      visibility: "private",
    });

    await disposable.client.rpc("register_push_device", {
      p_token: `fcm_lgpd_test_token_${Date.now()}_0123456789`,
    });

    // Username errado falha
    const { error: wrongErr } = await disposable.client.rpc(
      "delete_my_account",
      { p_confirm_username: "usuario_errado" },
    );
    expect(wrongErr).not.toBeNull();

    // Username correto remove tudo
    const { data: deletedOk, error: deleteErr } = await disposable.client.rpc(
      "delete_my_account",
      { p_confirm_username: prof!.username },
    );
    expect(deleteErr).toBeNull();
    expect(deletedOk).toBe(true);

    const [pRes, pubRes, projRes, pushRes] = await Promise.all([
      admin.from("profiles").select("id").eq("id", disposable.id),
      admin.from("public_profiles").select("id").eq("id", disposable.id),
      admin.from("sandbox_projects").select("id").eq("user_id", disposable.id),
      admin.from("push_devices").select("id").eq("user_id", disposable.id),
    ]);

    expect(pRes.data ?? []).toHaveLength(0);
    expect(pubRes.data ?? []).toHaveLength(0);
    expect(projRes.data ?? []).toHaveLength(0);
    expect(pushRes.data ?? []).toHaveLength(0);
  });
});
