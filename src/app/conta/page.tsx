import type { Metadata } from "next";
import { AccountWorkspace } from "@/components/account/account-workspace";

export const metadata: Metadata = {
  title: "Minha Conta e Mini-Projetos",
  description:
    "Gerencie seu perfil de estudante e seus mini-projetos salvos no Codit.",
};

export default function ContaPage() {
  return <AccountWorkspace />;
}
