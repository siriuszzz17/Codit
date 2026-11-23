import type { Metadata } from "next";
import { CommunityHub } from "@/components/social/community-hub";

export const metadata: Metadata = {
  title: "Comunidade Codit",
  description:
    "Encontre pessoas por @usuário, adicione amigos e explore mini-projetos compartilhados no Codit.",
};

export default function ComunidadePage() {
  return <CommunityHub />;
}
