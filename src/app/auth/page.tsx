import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata: Metadata = {
  title: "Entrar ou Criar Conta",
  description:
    "Acesse o Codit com e-mail e senha ou Google OAuth para salvar seu perfil e seus mini-projetos no Sandbox.",
};

export default function AuthPage() {
  return <AuthScreen />;
}
