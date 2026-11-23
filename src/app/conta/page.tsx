import type { Metadata } from "next";
import { AccountWorkspace } from "@/components/account/account-workspace";

export const metadata: Metadata = {
  title: "Meu Perfil e Projetos",
  description:
    "Personalize seu perfil no Codit e gerencie seus projetos salvos com ícones de linguagem e preview em sandbox.",
};

export default function ContaPage() {
  return <AccountWorkspace />;
}
