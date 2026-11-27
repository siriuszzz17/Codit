import type { SandboxLanguage } from "@/lib/supabase/database.types";

export const SANDBOX_EXECUTION_TIMEOUT_MS = 4000;
export const SANDBOX_MAX_CONSOLE_MESSAGES = 60;
export const SANDBOX_MAX_CONSOLE_TEXT_LENGTH = 1000;

function escapeClosingTag(source: string, tagName: string): string {
  const pattern = new RegExp(`</(${tagName})`, "gi");
  return source.replace(pattern, "<\\/$1");
}

function buildConsoleBridgeScript(runId: string): string {
  const serializedRunId = JSON.stringify(runId);

  return `<script>
(function() {
  var RUN_ID = ${serializedRunId};
  var MAX_TEXT = ${SANDBOX_MAX_CONSOLE_TEXT_LENGTH};
  var MAX_COUNT = ${SANDBOX_MAX_CONSOLE_MESSAGES};
  var sentCount = 0;
  var readySent = false;

  function formatArg(value) {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.name + ": " + value.message;
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }

  function postToParent(payload) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, "*");
      }
    } catch (_) {
      // Silencia falha de postMessage em ambientes restritos
    }
  }

  function sendLog(level, args) {
    if (sentCount >= MAX_COUNT) {
      if (sentCount === MAX_COUNT) {
        sentCount += 1;
        postToParent({
          source: "codit-sandbox",
          runId: RUN_ID,
          type: "log",
          level: "warn",
          text: "Limite de mensagens de console atingido (" + MAX_COUNT + ")."
        });
      }
      return;
    }
    sentCount += 1;
    var parts = [];
    for (var i = 0; i < args.length; i += 1) {
      parts.push(formatArg(args[i]));
    }
    var rawText = parts.join(" ");
    var truncated = rawText.length > MAX_TEXT ? rawText.slice(0, MAX_TEXT) + "..." : rawText;
    postToParent({
      source: "codit-sandbox",
      runId: RUN_ID,
      type: "log",
      level: level,
      text: truncated
    });
  }

  function sendReady() {
    postToParent({
      source: "codit-sandbox",
      runId: RUN_ID,
      type: "ready"
    });
  }

  window.addEventListener("message", function(event) {
    var payload = event && event.data;
    if (
      payload &&
      payload.source === "codit-sandbox-host" &&
      payload.type === "ping" &&
      payload.runId === RUN_ID
    ) {
      sendReady();
    }
  });

  var originalConsole = window.console || {};
  ["log", "info", "warn", "error"].forEach(function(level) {
    var original = originalConsole[level];
    originalConsole[level] = function() {
      sendLog(level, arguments);
      if (typeof original === "function") {
        try {
          original.apply(originalConsole, arguments);
        } catch (_) {}
      }
    };
  });

  window.addEventListener("error", function(event) {
    var msg = event && event.message ? event.message : "Erro de execução no código.";
    sendLog("error", [msg]);
  });

  window.addEventListener("unhandledrejection", function(event) {
    var reason = event && event.reason ? formatArg(event.reason) : "Promise rejeitada sem tratamento.";
    sendLog("error", [reason]);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sendReady);
  } else {
    sendReady();
  }
  window.addEventListener("load", sendReady);
  setTimeout(sendReady, 40);
})();
</script>`;
}

const SANDBOX_CSP_META =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: https: blob:; font-src data: https:;" />';

function injectHeadPayload(html: string, headPayload: string): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}\n${headPayload}`);
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(
      /<html[^>]*>/i,
      (match) => `${match}\n<head>\n${headPayload}\n</head>`,
    );
  }

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    ${headPayload}
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
    </style>
  </head>
  <body>
    ${html}
  </body>
</html>`;
}

export function buildSandboxedPreviewDocument(
  language: SandboxLanguage,
  sourceCode: string,
  runId: string,
): string {
  const bridgeScript = buildConsoleBridgeScript(runId);
  const headPayload = `${SANDBOX_CSP_META}\n${bridgeScript}`;

  if (language === "css") {
    const safeCss = sourceCode.replace(/<\/(style)/gi, "\\3c/$1");
    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    ${headPayload}
    <style>${safeCss}</style>
  </head>
  <body style="margin:0;">
    <div class="codit-showcase">
      <article class="codit-card">
        <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8;">Vitrine CSS3 · Codit</span>
        <h1 style="margin:8px 0 6px;">Pré-visualização de Estilo</h1>
        <p style="margin:0;line-height:1.5;opacity:0.9;">
          Use as classes <code>.codit-showcase</code>, <code>.codit-card</code> e <code>.codit-btn</code> ou seletores HTML padrão.
        </p>
        <button type="button" class="codit-btn" onclick="console.log('Botão CSS clicado!')">
          Botão de Exemplo
        </button>
      </article>
    </div>
  </body>
</html>`;
  }

  if (language === "javascript") {
    const safeScript = escapeClosingTag(sourceCode, "script");
    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    ${headPayload}
    <style>
      body {
        margin: 0;
        padding: 18px;
        min-height: 100vh;
        box-sizing: border-box;
        background: #0b0a16;
        color: #f4f2ff;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      .banner {
        border: 1px solid #2c2752;
        background: #141228;
        border-radius: 12px;
        padding: 12px 14px;
        font-size: 12px;
        margin-bottom: 12px;
      }
      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(247, 223, 30, 0.16);
        color: #fde047;
        font-weight: 700;
        margin-right: 8px;
      }
      #codit-js-lines {
        margin: 0;
        padding: 12px 14px;
        border-radius: 12px;
        background: #111022;
        border: 1px solid #231f42;
        font-size: 12px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <div class="banner">
      <span class="badge">JS</span>
      <span>Saída em tempo real no Sandbox Isolado Codit</span>
    </div>
    <pre id="codit-js-lines">Executando script...</pre>
    <script>
      (function() {
        var box = document.getElementById("codit-js-lines");
        var lines = [];
        function appendLine(prefix, args) {
          var parts = [];
          for (var i = 0; i < args.length; i += 1) {
            var v = args[i];
            if (typeof v === "string") parts.push(v);
            else {
              try { parts.push(JSON.stringify(v)); } catch (_) { parts.push(String(v)); }
            }
          }
          lines.push(prefix + parts.join(" "));
          if (box) box.textContent = lines.join("\\n");
        }
        var prevLog = console.log;
        var prevInfo = console.info;
        var prevWarn = console.warn;
        var prevError = console.error;
        console.log = function() { appendLine("> ", arguments); prevLog.apply(console, arguments); };
        console.info = function() { appendLine("[info] ", arguments); prevInfo.apply(console, arguments); };
        console.warn = function() { appendLine("[aviso] ", arguments); prevWarn.apply(console, arguments); };
        console.error = function() { appendLine("[erro] ", arguments); prevError.apply(console, arguments); };
        window.addEventListener("error", function(ev) {
          appendLine("[erro] ", [ev && ev.message ? ev.message : "Erro de execução"]);
        });
        window.addEventListener("unhandledrejection", function(ev) {
          appendLine("[erro] ", [ev && ev.reason ? String(ev.reason) : "Promise rejeitada"]);
        });
      })();
    </script>
    <script>
${safeScript}
    </script>
    <script>
      (function() {
        var box = document.getElementById("codit-js-lines");
        if (box && box.textContent === "Executando script...") {
          box.textContent = "Execução concluída sem saídas no console. Use console.log(...) para imprimir valores.";
        }
      })();
    </script>
  </body>
</html>`;
  }

  return injectHeadPayload(sourceCode, headPayload);
}
