import type { Metadata } from "next";
import { Suspense } from "react";
import { LessonWorkbench } from "@/components/learning/lesson-workbench";
import { SkeletonList } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Lição Prática",
  description:
    "Resolva o exercício com testes automáticos em sandbox isolado e tutor socrático Octopy.",
};

export default function LicaoPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <SkeletonList count={3} label="Carregando lição..." />
        </main>
      }
    >
      <LessonWorkbench />
    </Suspense>
  );
}
