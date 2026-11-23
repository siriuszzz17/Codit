import type { Metadata } from "next";
import { AccountWorkspace } from "@/components/account/account-workspace";

export const metadata: Metadata = {
  title: "Meu Perfil",
  description:
    "Personalize seu perfil, capa, tema visual, habilidades e @usuário na Comunidade Codit.",
};

export default function ContaPage() {
  return <AccountWorkspace />;
}
