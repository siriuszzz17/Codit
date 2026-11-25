# Infraestrutura

## Responsabilidade
Configuração, acesso a dados, contratos compartilhados, segurança, PWA e empacotamento nativo.

## Arquivos-chave
- src/lib/env.ts
- src/lib/supabase/client.ts — getSupabaseClient(), requireSupabaseClient().
- src/lib/supabase/config.ts
- src/lib/supabase/database.types.ts
- src/lib/supabase/errors.ts — mapeamento de erros.
- src/lib/supabase/session-guard.ts
- supabase/migrations/*.sql
- supabase/functions/send-push/index.ts — Edge Function FCM HTTP v1 (secrets server-side).
- next.config.ts — exportação estática e cabeçalhos.
- src/components/pwa/service-worker-register.tsx, public/sw.js
- src-tauri/ — desktop (`.exe` + `.sig`, Tauri Updater `v0.1.13`); android/ — Capacitor (`Codit-mobile.apk`, `versionCode 14`).
- tests/unit/

## Dependências
Base compartilhada de [[Backend]], [[Auth]], [[Perfis]], [[Sandbox]], [[Comunidade]], [[Mensagens]], [[Notificacoes]] e [[design-system]]. Consumida por toda [[Frontend]].
