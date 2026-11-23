import type {
  SandboxLanguage,
  SandboxProjectRow,
  SandboxRuntimeTarget,
} from "@/lib/supabase/database.types";

export type LanguageCategory = "web" | "backend" | "systems" | "data";

export type LegacySandboxLanguage =
  | "html_css_js"
  | "python"
  | "javascript"
  | "typescript";

export interface LanguageMeta {
  id: SandboxLanguage;
  label: string;
  shortLabel: string;
  fileName: string;
  category: LanguageCategory;
  accentHex: string;
  badgeBgClass: string;
  badgeTextClass: string;
  badgeBorderClass: string;
  defaultRuntimeTarget: SandboxRuntimeTarget;
  legacyLanguage: LegacySandboxLanguage;
  supportsLivePreview: boolean;
  starterCode: string;
}

export const ORDERED_SANDBOX_LANGUAGES: readonly SandboxLanguage[] = [
  "html_css_js",
  "html",
  "css",
  "javascript",
  "typescript",
  "python",
  "react",
  "nodejs",
  "java",
  "csharp",
  "cpp",
  "go",
  "rust",
  "sql",
  "php",
] as const;

export const CORE_LEGACY_LANGUAGES: readonly LegacySandboxLanguage[] = [
  "html_css_js",
  "python",
  "javascript",
  "typescript",
] as const;

export const LANGUAGE_CATALOG: Record<SandboxLanguage, LanguageMeta> = {
  html_css_js: {
    id: "html_css_js",
    label: "HTML / CSS / JS",
    shortLabel: "WEB",
    fileName: "index.html",
    category: "web",
    accentHex: "#F97316",
    badgeBgClass: "bg-orange-500/15",
    badgeTextClass: "text-orange-600 dark:text-orange-300",
    badgeBorderClass: "border-orange-500/35",
    defaultRuntimeTarget: "client_iframe",
    legacyLanguage: "html_css_js",
    supportsLivePreview: true,
    starterCode: `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <style>
      body {
        font-family: system-ui, sans-serif;
        background: linear-gradient(135deg, #141228, #24194d);
        color: #f4f2ff;
        padding: 24px;
        margin: 0;
      }
      .card {
        max-width: 420px;
        margin: 0 auto;
        padding: 20px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(167, 139, 250, 0.35);
      }
      button {
        margin-top: 12px;
        padding: 10px 16px;
        border: 0;
        border-radius: 10px;
        background: #8b5cf6;
        color: #fff;
        font-weight: 600;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Olá, Codit!</h1>
      <p id="msg">Clique no botão abaixo para testar a interatividade.</p>
      <button onclick="saudar()">Executar ação</button>
    </div>
    <script>
      function saudar() {
        document.getElementById("msg").textContent = "Octopy aprovado! JavaScript rodando no sandbox.";
        console.log("Botão clicado no mini-projeto Codit!");
      }
    </script>
  </body>
</html>`,
  },
  html: {
    id: "html",
    label: "HTML5",
    shortLabel: "HTML",
    fileName: "index.html",
    category: "web",
    accentHex: "#E34F26",
    badgeBgClass: "bg-orange-600/15",
    badgeTextClass: "text-orange-600 dark:text-orange-300",
    badgeBorderClass: "border-orange-600/35",
    defaultRuntimeTarget: "client_iframe",
    legacyLanguage: "html_css_js",
    supportsLivePreview: true,
    starterCode: `<main style="font-family: system-ui, sans-serif; padding: 24px; color: #f8fafc; background: #0f172a; min-height: 100vh;">
  <article style="max-width: 480px; margin: 0 auto; padding: 20px; border-radius: 14px; background: #1e293b; border: 1px solid #334155;">
    <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #fb923c;">Portfólio HTML5</span>
    <h1 style="margin: 8px 0;">Estrutura Semântica</h1>
    <p style="color: #cbd5e1; line-height: 1.5;">
      Este bloco demonstra tags semânticas como <code>&lt;main&gt;</code> e <code>&lt;article&gt;</code> no Codit.
    </p>
  </article>
</main>`,
  },
  css: {
    id: "css",
    label: "CSS3",
    shortLabel: "CSS",
    fileName: "styles.css",
    category: "web",
    accentHex: "#1572B6",
    badgeBgClass: "bg-sky-500/15",
    badgeTextClass: "text-sky-600 dark:text-sky-300",
    badgeBorderClass: "border-sky-500/35",
    defaultRuntimeTarget: "client_iframe",
    legacyLanguage: "html_css_js",
    supportsLivePreview: true,
    starterCode: `/* Estilize os elementos da vitrine Codit abaixo */
.codit-showcase {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: radial-gradient(circle at top, #1d4ed8, #090d1f);
  font-family: system-ui, sans-serif;
}

.codit-card {
  max-width: 380px;
  padding: 24px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.85);
  color: #f8fafc;
  border: 1px solid rgba(56, 189, 248, 0.45);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
}

.codit-btn {
  margin-top: 14px;
  padding: 10px 18px;
  border-radius: 999px;
  border: none;
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  color: #090d1f;
  font-weight: 700;
}`,
  },
  javascript: {
    id: "javascript",
    label: "JavaScript",
    shortLabel: "JS",
    fileName: "script.js",
    category: "web",
    accentHex: "#F7DF1E",
    badgeBgClass: "bg-yellow-500/15",
    badgeTextClass: "text-yellow-700 dark:text-yellow-300",
    badgeBorderClass: "border-yellow-500/35",
    defaultRuntimeTarget: "client_iframe",
    legacyLanguage: "javascript",
    supportsLivePreview: true,
    starterCode: `const linguagens = ["HTML", "CSS", "JavaScript", "Python"];

function resumirTrilha(lista) {
  return lista.map((item, indice) => \`\${indice + 1}. \${item}\`).join(" | ");
}

console.log("Iniciando exercício em JavaScript no Codit...");
console.log("Trilha:", resumirTrilha(linguagens));
console.log("Total de tecnologias:", linguagens.length);`,
  },
  typescript: {
    id: "typescript",
    label: "TypeScript",
    shortLabel: "TS",
    fileName: "main.ts",
    category: "web",
    accentHex: "#3178C6",
    badgeBgClass: "bg-blue-500/15",
    badgeTextClass: "text-blue-600 dark:text-blue-300",
    badgeBorderClass: "border-blue-500/35",
    defaultRuntimeTarget: "client_iframe",
    legacyLanguage: "typescript",
    supportsLivePreview: false,
    starterCode: `interface ProjetoCodit {
  titulo: string;
  linguagem: "TypeScript" | "Python";
  concluido: boolean;
}

function formatarResumo(projeto: ProjetoCodit): string {
  const status = projeto.concluido ? "Pronto para portfólio" : "Em evolução";
  return \`\${projeto.titulo} [\${projeto.linguagem}] — \${status}\`;
}

console.log(
  formatarResumo({
    titulo: "API de Tarefas",
    linguagem: "TypeScript",
    concluido: true,
  }),
);`,
  },
  python: {
    id: "python",
    label: "Python",
    shortLabel: "PY",
    fileName: "main.py",
    category: "data",
    accentHex: "#3776AB",
    badgeBgClass: "bg-sky-600/15",
    badgeTextClass: "text-sky-700 dark:text-sky-300",
    badgeBorderClass: "border-sky-600/35",
    defaultRuntimeTarget: "client_pyodide",
    legacyLanguage: "python",
    supportsLivePreview: false,
    starterCode: `def calcular_media(notas: list[float]) -> float:
    return sum(notas) / len(notas)


notas_aluno = [8.5, 9.0, 9.5]
media = calcular_media(notas_aluno)
print(f"Olá, Codit! Sua média atual é {media:.2f}")`,
  },
  react: {
    id: "react",
    label: "React",
    shortLabel: "JSX",
    fileName: "App.jsx",
    category: "web",
    accentHex: "#087EA4",
    badgeBgClass: "bg-cyan-500/15",
    badgeTextClass: "text-cyan-700 dark:text-cyan-300",
    badgeBorderClass: "border-cyan-500/35",
    defaultRuntimeTarget: "client_iframe",
    legacyLanguage: "javascript",
    supportsLivePreview: false,
    starterCode: `import { useState } from "react";

export function ContadorCodit() {
  const [pontos, setPontos] = useState(0);

  return (
    <section>
      <h2>Desafio React</h2>
      <p>Pontos acumulados: {pontos}</p>
      <button onClick={() => setPontos((valor) => valor + 10)}>
        Ganhar +10 XP
      </button>
    </section>
  );
}`,
  },
  nodejs: {
    id: "nodejs",
    label: "Node.js",
    shortLabel: "NODE",
    fileName: "server.mjs",
    category: "backend",
    accentHex: "#3C873A",
    badgeBgClass: "bg-emerald-500/15",
    badgeTextClass: "text-emerald-700 dark:text-emerald-300",
    badgeBorderClass: "border-emerald-500/35",
    defaultRuntimeTarget: "remote_piston",
    legacyLanguage: "javascript",
    supportsLivePreview: false,
    starterCode: `import http from "node:http";

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ status: "ok", mensagem: "API Node.js no Codit" }));
});

server.listen(3000, () => {
  console.log("Servidor ouvindo na porta 3000");
});`,
  },
  java: {
    id: "java",
    label: "Java",
    shortLabel: "JAVA",
    fileName: "Main.java",
    category: "backend",
    accentHex: "#EA2D2E",
    badgeBgClass: "bg-red-500/15",
    badgeTextClass: "text-red-600 dark:text-red-300",
    badgeBorderClass: "border-red-500/35",
    defaultRuntimeTarget: "remote_judge0",
    legacyLanguage: "typescript",
    supportsLivePreview: false,
    starterCode: `public class Main {
    public static void main(String[] args) {
        String aluno = "Estudante Codit";
        System.out.println("Bem-vindo ao Java, " + aluno + "!");
    }
}`,
  },
  csharp: {
    id: "csharp",
    label: "C#",
    shortLabel: "C#",
    fileName: "Program.cs",
    category: "backend",
    accentHex: "#68217A",
    badgeBgClass: "bg-purple-500/15",
    badgeTextClass: "text-purple-700 dark:text-purple-300",
    badgeBorderClass: "border-purple-500/35",
    defaultRuntimeTarget: "remote_judge0",
    legacyLanguage: "typescript",
    supportsLivePreview: false,
    starterCode: `using System;

class Program
{
    static void Main()
    {
        string plataforma = "Codit";
        Console.WriteLine($"Olá do C# na plataforma {plataforma}!");
    }
}`,
  },
  cpp: {
    id: "cpp",
    label: "C++",
    shortLabel: "C++",
    fileName: "main.cpp",
    category: "systems",
    accentHex: "#00599C",
    badgeBgClass: "bg-blue-600/15",
    badgeTextClass: "text-blue-700 dark:text-blue-300",
    badgeBorderClass: "border-blue-600/35",
    defaultRuntimeTarget: "remote_judge0",
    legacyLanguage: "typescript",
    supportsLivePreview: false,
    starterCode: `#include <iostream>
#include <vector>

int main() {
    std::vector<int> passos = {1, 2, 3, 4};
    std::cout << "Codit C++ ativo! Total de passos: " << passos.size() << "\\n";
    return 0;
}`,
  },
  go: {
    id: "go",
    label: "Go",
    shortLabel: "GO",
    fileName: "main.go",
    category: "backend",
    accentHex: "#00ADD8",
    badgeBgClass: "bg-cyan-500/15",
    badgeTextClass: "text-cyan-700 dark:text-cyan-300",
    badgeBorderClass: "border-cyan-500/35",
    defaultRuntimeTarget: "remote_judge0",
    legacyLanguage: "typescript",
    supportsLivePreview: false,
    starterCode: `package main

import "fmt"

func main() {
    trilha := "Backend com Go"
    fmt.Printf("Iniciando mini-projeto: %s\\n", trilha)
}`,
  },
  rust: {
    id: "rust",
    label: "Rust",
    shortLabel: "RS",
    fileName: "main.rs",
    category: "systems",
    accentHex: "#CE422B",
    badgeBgClass: "bg-amber-600/15",
    badgeTextClass: "text-amber-700 dark:text-amber-300",
    badgeBorderClass: "border-amber-600/35",
    defaultRuntimeTarget: "remote_judge0",
    legacyLanguage: "typescript",
    supportsLivePreview: false,
    starterCode: `fn main() {
    let habilidades = ["Ownership", "Borrowing", "Traits"];
    println!("Rust seguro no Codit! Conceitos: {:?}", habilidades);
}`,
  },
  sql: {
    id: "sql",
    label: "SQL",
    shortLabel: "SQL",
    fileName: "query.sql",
    category: "data",
    accentHex: "#336791",
    badgeBgClass: "bg-indigo-500/15",
    badgeTextClass: "text-indigo-700 dark:text-indigo-300",
    badgeBorderClass: "border-indigo-500/35",
    defaultRuntimeTarget: "remote_piston",
    legacyLanguage: "python",
    supportsLivePreview: false,
    starterCode: `-- Consulta de portfólio de projetos no Codit
SELECT
  primary_language AS linguagem,
  COUNT(*) AS total_projetos
FROM sandbox_projects
WHERE deleted_at IS NULL
GROUP BY primary_language
ORDER BY total_projetos DESC;`,
  },
  php: {
    id: "php",
    label: "PHP",
    shortLabel: "PHP",
    fileName: "index.php",
    category: "backend",
    accentHex: "#777BB4",
    badgeBgClass: "bg-violet-500/15",
    badgeTextClass: "text-violet-700 dark:text-violet-300",
    badgeBorderClass: "border-violet-500/35",
    defaultRuntimeTarget: "remote_piston",
    legacyLanguage: "javascript",
    supportsLivePreview: false,
    starterCode: `<?php
$stack = ["PHP 8", "PostgreSQL", "Codit"];
echo "Projeto backend ativo com: " . implode(", ", $stack) . PHP_EOL;`,
  },
};

export function isSandboxLanguage(value: string): value is SandboxLanguage {
  return Object.prototype.hasOwnProperty.call(LANGUAGE_CATALOG, value);
}

export function getLanguageMeta(language: string): LanguageMeta {
  if (isSandboxLanguage(language)) {
    return LANGUAGE_CATALOG[language];
  }
  return LANGUAGE_CATALOG.html_css_js;
}

export function isCoreLegacyLanguage(
  language: SandboxLanguage,
): language is LegacySandboxLanguage {
  return (CORE_LEGACY_LANGUAGES as readonly string[]).includes(language);
}

export function toLegacySandboxLanguage(
  language: SandboxLanguage,
): LegacySandboxLanguage {
  return getLanguageMeta(language).legacyLanguage;
}

export function isStarterCodeSample(sourceCode: string): boolean {
  const normalized = sourceCode.trim();
  if (!normalized) {
    return true;
  }

  return ORDERED_SANDBOX_LANGUAGES.some(
    (lang) => LANGUAGE_CATALOG[lang].starterCode.trim() === normalized,
  );
}

export interface LanguageBreakdownItem {
  language: SandboxLanguage;
  count: number;
  percent: number;
  meta: LanguageMeta;
}

export function computeLanguageBreakdown(
  projects: readonly Pick<SandboxProjectRow, "primary_language">[],
): LanguageBreakdownItem[] {
  if (projects.length === 0) {
    return [];
  }

  const counts = new Map<SandboxLanguage, number>();
  for (const project of projects) {
    const meta = getLanguageMeta(project.primary_language);
    counts.set(meta.id, (counts.get(meta.id) ?? 0) + 1);
  }

  const total = projects.length;
  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return ORDERED_SANDBOX_LANGUAGES.indexOf(a[0]) - ORDERED_SANDBOX_LANGUAGES.indexOf(b[0]);
    })
    .map(([language, count]) => ({
      language,
      count,
      percent: Math.round((count / total) * 1000) / 10,
      meta: LANGUAGE_CATALOG[language],
    }));
}
