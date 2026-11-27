import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidade e Termos · Codit",
  description:
    "Política de Privacidade, Termos de Uso e direitos do titular (LGPD) na plataforma educacional Codit.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="space-y-2 border-b border-border pb-5">
        <p className="font-mono text-xs font-semibold text-accent-strong">
          Versão 2026-11 · Conformidade LGPD (Lei nº 13.709/2018)
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Política de Privacidade e Termos de Uso
        </h1>
        <p className="max-w-[65ch] text-sm leading-relaxed text-muted">
          O Codit é uma plataforma educacional de programação. Levamos a
          privacidade, o isolamento dos seus dados e o controle sobre a sua
          conta a sério.
        </p>
      </header>

      <section className="codit-panel space-y-3 p-5 sm:p-6">
        <h2 className="text-base font-bold text-foreground">
          1. Quais dados coletamos
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>
            <strong className="text-foreground">Conta e perfil:</strong> nome,
            e-mail de autenticação, <code className="font-mono">@usuário</code>,
            preferências de tema/aparência e informações opcionais de portfólio.
          </li>
          <li>
            <strong className="text-foreground">Aprendizagem e código:</strong>{" "}
            mini-projetos do Sandbox, progresso em trilhas, submissões de
            exercícios, XP e conquistas.
          </li>
          <li>
            <strong className="text-foreground">Comunidade e mensagens:</strong>{" "}
            amizades, conversas diretas e em grupo, reações, anexos de imagem
            enviados no chat e registros de moderação (bloqueios e denúncias).
          </li>
        </ul>
      </section>

      <section className="codit-panel space-y-3 p-5 sm:p-6">
        <h2 className="text-base font-bold text-foreground">
          2. Segurança e isolamento
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          Todo dado privado é protegido por políticas de Row-Level Security
          (RLS) vinculadas ao identificador autenticado do usuário. Códigos
          executados no Sandbox rodam isoladamente no navegador do aluno, sem
          acesso à sua sessão ou ao servidor principal.
        </p>
      </section>

      <section className="codit-panel space-y-3 p-5 sm:p-6">
        <h2 className="text-base font-bold text-foreground">
          3. Moderação e convivência
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          Usuários podem bloquear contas (encerrando bilateralmente amizades,
          mensagens diretas, chamadas e interações em projetos) e registrar
          denúncias sobre usuários, projetos públicos ou mensagens que violem
          boas práticas de convivência.
        </p>
      </section>

      <section className="codit-panel space-y-3 p-5 sm:p-6">
        <h2 className="text-base font-bold text-foreground">
          4. Seus direitos como titular (LGPD)
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>
            <strong className="text-foreground">
              Acesso e portabilidade:
            </strong>{" "}
            você pode exportar uma cópia completa dos seus dados em formato JSON
            a qualquer momento em{" "}
            <Link
              href="/conta"
              className="font-semibold text-accent-strong underline"
            >
              Minha Conta
            </Link>
            .
          </li>
          <li>
            <strong className="text-foreground">Correção:</strong> seus dados de
            perfil e privacidade podem ser atualizados diretamente na página da
            conta.
          </li>
          <li>
            <strong className="text-foreground">
              Eliminação definitiva:
            </strong>{" "}
            você pode excluir permanentemente sua conta e todos os dados
            vinculados (perfil, projetos, mensagens, progresso e dispositivos de
            push) em{" "}
            <Link
              href="/conta"
              className="font-semibold text-accent-strong underline"
            >
              Minha Conta
            </Link>
            .
          </li>
        </ul>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Link
          href="/conta"
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90"
        >
          Gerenciar meus dados em /conta
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface-muted px-4 py-2 text-xs font-semibold text-foreground hover:border-accent"
        >
          Voltar ao início
        </Link>
      </footer>
    </main>
  );
}
