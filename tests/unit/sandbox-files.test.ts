import { describe, expect, it } from "vitest";
import {
  compileProjectFilesToSource,
  extractFilesFromLegacySource,
  resolveProjectFiles,
} from "@/modules/sandbox/sandbox-files";

describe("sandbox-files", () => {
  it("extracts inline style, script, and body markup from legacy html_css_js source", () => {
    const legacy = `<!doctype html>
<html>
  <head>
    <style>
      body { color: red; }
    </style>
  </head>
  <body>
    <h1>Olá Codit</h1>
    <script>
      console.log("ok");
    </script>
  </body>
</html>`;

    const files = extractFilesFromLegacySource("html_css_js", legacy);
    expect(files["index.html"]).toContain("<h1>Olá Codit</h1>");
    expect(files["styles.css"]).toContain("body { color: red; }");
    expect(files["script.js"]).toContain('console.log("ok");');
  });

  it("compiles 3 files into standalone HTML while escaping closing style/script tags", () => {
    const compiled = compileProjectFilesToSource("html_css_js", {
      "index.html": "<main>Teste</main>",
      "styles.css": "main { color: blue; }</style>",
      "script.js": 'console.log("</script>");',
    });

    expect(compiled).toContain("<main>Teste</main>");
    expect(compiled).toContain("\\3c/style>");
    expect(compiled).toContain("<\\/script>");
  });

  it("preserves persisted files when available and falls back to legacy source otherwise", () => {
    const persisted = resolveProjectFiles("html_css_js", "<p>old</p>", {
      "index.html": "<p>new</p>",
      "styles.css": "p { margin: 0; }",
      "script.js": "console.log(1);",
    });
    expect(persisted["index.html"]).toBe("<p>new</p>");

    const legacyJs = resolveProjectFiles("javascript", "console.log(42);", null);
    expect(legacyJs["script.js"]).toBe("console.log(42);");
    expect(compileProjectFilesToSource("javascript", legacyJs)).toBe(
      "console.log(42);",
    );
  });
});
