# Infraestrutura

## Responsabilidade
Configuração, acesso a dados, contratos compartilhados, segurança, PWA e empacotamento nativo.

## Arquivos-chave
- src/lib/env.ts
- src/lib/supabase/client.ts — getSupabaseClient(), requireSupabaseClient().
- src/lib/supabase/config.ts
- src/lib/supabase/database.types.ts
- src/lib/problem-details.ts, src/lib/problem-response.ts, src/lib/app-toast.ts — contratos RFC 9457 client-safe, observer de observabilidade e barramento de toasts efêmeros.
- src/lib/telemetry/error-reporter.ts + src/components/telemetry/global-error-observer.tsx — captura global sanitizada zero-PII (throttle 5/sessão) persistida em `client_error_logs`.
- src/modules/learning/learning-analytics-service.ts + src/components/learning/learning-analytics-drawer.tsx — métricas de retenção por lição via RPC `get_learning_retention_analytics`.
- src/lib/supabase/errors.ts — mapeamento de erros + emissão automática de toast amigável.
- .github/workflows/ci.yml, supabase/config.toml, vitest.rls.config.ts — CI e testes de integração RLS (`tests/rls/`).
- src/lib/supabase/session-guard.ts
- supabase/migrations/*.sql
- supabase/functions/send-push/index.ts — Edge Function FCM HTTP v1 (secrets server-side).
- next.config.ts — exportação estática e cabeçalhos.
- src/components/pwa/service-worker-register.tsx, public/sw.js
- src-tauri/ — desktop (`.exe` + `.sig`, Tauri Updater `v0.1.14`); android/ — Capacitor (`Codit-mobile.apk`, `versionCode 15`).
- tests/unit/

## Dependências
Base compartilhada de [[Backend]], [[Auth]], [[Perfis]], [[Sandbox]], [[Comunidade]], [[Mensagens]], [[Notificacoes]] e [[design-system]]. Consumida por toda [[Frontend]].
