"use client";

import Link from "next/link";
import { useState } from "react";
import { emitAppToast } from "@/lib/app-toast";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/modules/auth/auth-provider";
import { markOnboardingCompleted } from "@/modules/learning/learning-service";

interface FirstStepsCardProps {
  completedLessonsCount?: number;
  projectsCount?: number;
}

export function FirstStepsCard({
  completedLessonsCount = 0,
  projectsCount = 0,
}: FirstStepsCardProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user || !profile || profile.onboarding_completed_at || dismissed) {
    return null;
  }

  const hasCustomProfile = Boolean(
    profile.username && (profile.bio || profile.headline || profile.skills.length > 0),
  );
  const hasCompletedLesson =
    completedLessonsCount > 0 || (profile.xp_total ?? 0) > 0;
  const hasProject = projectsCount > 0;

  const steps = [
    {
      id: "profile",
      number: "01",
      title: "Personalize seu perfil e @usuário",
      description: "Adicione bio, habilidades e escolha o visual do seu Octopy.",
      done: hasCustomProfile,
      href: "/conta",
      cta: "Abrir perfil",
    },
    {
      id: "lesson",
      number: "02",
      title: "Conclua sua primeira lição prática",
      description: "Execute os testes automáticos na trilha de JavaScript e ganhe XP.",
      done: hasCompletedLesson,
      href: "/trilhas",
      cta: "Ir para trilhas",
    },
    {
      id: "project",
      number: "03",
      title: "Experimente o Estúdio & Sandbox",
      description: "Crie um mini-projeto interativo e compartilhe com a comunidade.",
      done: hasProject,
      href: "/projetos",
      cta: "Abrir estúdio",
    },
  ];

  const doneCount = steps.filter((step) => step.done).length;
  const percent = Math.round((doneCount / steps.length) * 100);

  async function handleCompleteOnboarding() {
    if (!user) return;
    const client = getSupabaseClient();
    if (!client) {
      setDismissed(true);
      return;
    }

    setSaving(true);
    try {
      await markOnboardingCompleted(user.id, client);
      await refreshProfile();
      setDismissed(true);
      emitAppToast({
        tone: "success",
        title: "Primeiros passos concluídos",
        detail: "Você já pode explorar livremente as trilhas e o estúdio.",
      });
    } catch {
      setDismissed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="onboarding-steps-title"
      className="rounded-2xl border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="onboarding-steps-title"
            className="text-base font-bold tracking-tight text-foreground"
          >
            Primeiros passos no Codit
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {doneCount} de {steps.length} etapas concluídas ({percent}%)
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleCompleteOnboarding()}
          disabled={saving}
          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-foreground disabled:opacity-60"
        >
          {doneCount === steps.length ? "Concluir guia" : "Ocultar guia"}
        </button>
      </div>

      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso dos primeiros passos"
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className="h-full rounded-full bg-accent transition-all duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="mt-4 grid grid-cols-1 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-muted/30 md:grid-cols-3 md:divide-x md:divide-y-0">
        {steps.map((step) => (
          <li key={step.id} className="flex flex-col justify-between gap-3 p-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-accent-strong">
                  Etapa {step.number}
                </span>
                {step.done ? (
                  <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    Feito
                  </span>
                ) : (
                  <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
                    Pendente
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-foreground">
                {step.title}
              </p>
              <p className="text-xs leading-relaxed text-muted">
                {step.description}
              </p>
            </div>

            <Link
              href={step.href}
              className="inline-flex min-h-9 w-fit items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent hover:text-accent-strong"
            >
              {step.cta}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
