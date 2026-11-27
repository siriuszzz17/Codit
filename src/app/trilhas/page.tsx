import type { Metadata } from "next";
import { TracksOverview } from "@/components/learning/tracks-overview";

export const metadata: Metadata = {
  title: "Trilhas",
  description:
    "Aprenda programação passo a passo com desafios práticos, correção automática e dicas do Octopy.",
};

export default function TrilhasPage() {
  return <TracksOverview />;
}
