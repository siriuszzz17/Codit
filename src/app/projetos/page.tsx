import type { Metadata } from "next";
import { ProjectsWorkspace } from "@/components/projects/projects-workspace";

export const metadata: Metadata = {
  title: "Projetos & Estúdio",
  description:
    "Desenvolva, execute no Sandbox isolado e gerencie seus mini-projetos em até 15 linguagens no Codit.",
};

export default function ProjetosPage() {
  return <ProjectsWorkspace />;
}
