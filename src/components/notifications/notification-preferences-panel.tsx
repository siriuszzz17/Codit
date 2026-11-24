"use client";

import {
  isDefaultNotificationPreferences,
  NOTIFICATION_CATEGORY_CATALOG,
} from "@/modules/notifications/notification-schemas";
import { useNotifications } from "@/modules/notifications/notifications-provider";

function ToggleSwitch({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-accent bg-accent"
          : "border-border bg-surface-muted"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-xs transition-transform ${
          checked ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function NotificationPreferencesPanel({
  compact = false,
}: {
  compact?: boolean;
}) {
  const {
    prefs,
    isSyncingPrefs,
    browserPermission,
    conversationTitlesById,
    updatePrefs,
    setCategoryEnabled,
    toggleMuteAll,
    toggleConversationMute,
    requestBrowserPermission,
    resetPrefs,
  } = useNotifications();

  const isDefault = isDefaultNotificationPreferences(prefs);

  function handleBrowserToggle() {
    if (prefs.browserPushEnabled) {
      updatePrefs({ browserPushEnabled: false });
      return;
    }
    if (browserPermission === "granted") {
      updatePrefs({ browserPushEnabled: true });
      return;
    }
    void requestBrowserPermission();
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      {/* Mudo global */}
      <div
        className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 transition-colors ${
          prefs.muteAll
            ? "border-amber-500/50 bg-amber-500/10"
            : "border-border bg-surface-muted/50"
        }`}
      >
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-bold text-foreground sm:text-sm">
            Modo silencioso (mutar tudo)
          </p>
          <p className="text-[11px] leading-relaxed text-muted sm:text-xs">
            Silencia alertas na tela, sons, contadores e evita salvar novas
            notificações enquanto estiver ativo.
          </p>
        </div>
        <ToggleSwitch
          checked={prefs.muteAll}
          label="Ativar ou desativar modo silencioso global"
          onChange={toggleMuteAll}
        />
      </div>

      {/* Canais de entrega */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">
            Como exibir alertas
          </span>
          {isSyncingPrefs ? (
            <span className="text-[11px] text-muted">Salvando...</span>
          ) : null}
        </div>

        <div className="divide-y divide-border rounded-2xl border border-border bg-surface-muted/35">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">
                Pop-ups na tela
              </p>
              <p className="text-[11px] text-muted">
                Cartões rápidos ao receber atividades com o app aberto.
              </p>
            </div>
            <ToggleSwitch
              checked={prefs.toastEnabled && !prefs.muteAll}
              disabled={prefs.muteAll}
              label="Mostrar pop-ups na tela"
              onChange={() =>
                updatePrefs({ toastEnabled: !prefs.toastEnabled })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">
                Sons de alerta
              </p>
              <p className="text-[11px] text-muted">
                Toque curto para novas notificações e toque de ligação de voz.
              </p>
            </div>
            <ToggleSwitch
              checked={prefs.soundEnabled && !prefs.muteAll}
              disabled={prefs.muteAll}
              label="Tocar sons de notificação"
              onChange={() =>
                updatePrefs({ soundEnabled: !prefs.soundEnabled })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">
                Alertas do navegador
              </p>
              <p className="text-[11px] text-muted">
                {browserPermission === "unsupported"
                  ? "Indisponível neste ambiente."
                  : browserPermission === "denied"
                    ? "Permissão bloqueada nas configurações do navegador."
                    : "Mostra avisos quando o Codit estiver em segundo plano."}
              </p>
            </div>
            <ToggleSwitch
              checked={
                prefs.browserPushEnabled &&
                !prefs.muteAll &&
                browserPermission === "granted"
              }
              disabled={
                prefs.muteAll ||
                browserPermission === "unsupported" ||
                browserPermission === "denied"
              }
              label="Ativar notificações do navegador"
              onChange={handleBrowserToggle}
            />
          </div>
        </div>
      </div>

      {/* Categorias individuais */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">
            Escolha o que aparece ou fica mutado
          </span>
        </div>

        <div className="divide-y divide-border rounded-2xl border border-border bg-surface-muted/35">
          {NOTIFICATION_CATEGORY_CATALOG.map((item) => {
            const enabled = prefs.categories[item.key];
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-foreground">
                      {item.label}
                    </p>
                    {prefs.muteAll || !enabled ? (
                      <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                        Mutado
                      </span>
                    ) : null}
                  </div>
                  {!compact ? (
                    <p className="mt-0.5 text-[11px] text-muted">
                      {item.description}
                    </p>
                  ) : null}
                </div>

                <ToggleSwitch
                  checked={enabled && !prefs.muteAll}
                  disabled={prefs.muteAll}
                  label={`${enabled ? "Mutar" : "Ativar"} notificações de ${item.label}`}
                  onChange={() => setCategoryEnabled(item.key, !enabled)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Conversas mutadas individualmente */}
      {prefs.mutedConversationIds.length > 0 ? (
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-foreground">
            Conversas silenciadas ({prefs.mutedConversationIds.length})
          </span>
          <div className="space-y-1.5 rounded-2xl border border-border bg-surface-muted/35 p-2.5">
            {prefs.mutedConversationIds.map((conversationId) => {
              const title =
                conversationTitlesById[conversationId] ??
                `Conversa ${conversationId.slice(0, 8)}`;
              return (
                <div
                  key={conversationId}
                  className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2"
                >
                  <span className="truncate text-xs font-medium text-foreground">
                    {title}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleConversationMute(conversationId)}
                    className="shrink-0 rounded-lg border border-border bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-accent"
                  >
                    Reativar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-[11px] text-muted">
          Salvo automaticamente no dispositivo e na conta.
        </span>
        <button
          type="button"
          onClick={resetPrefs}
          disabled={isDefault}
          className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border bg-surface-muted px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Restaurar padrão
        </button>
      </div>
    </div>
  );
}
