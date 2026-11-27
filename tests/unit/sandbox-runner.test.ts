import { describe, expect, it } from "vitest";
import { buildSandboxedPreviewDocument } from "@/modules/sandbox/sandbox-runner";

describe("sandbox-runner", () => {
  it("injects restrictive CSP and console bridge into HTML/CSS/JS documents", () => {
    const doc = buildSandboxedPreviewDocument(
      "html_css_js",
      "<h1>Olá Codit</h1><script>console.log('ok')</script>",
      "run-42",
    );

    expect(doc).toContain('http-equiv="Content-Security-Policy"');
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain('"codit-sandbox"');
    expect(doc).toContain('"codit-sandbox-host"');
    expect(doc).toContain('"run-42"');
    expect(doc).toContain("<h1>Olá Codit</h1>");
  });

  it("wraps CSS3 code inside the showcase preview and escapes closing style tags", () => {
    const doc = buildSandboxedPreviewDocument(
      "css",
      ".codit-card { color: red; }</style><script>alert(1)</script>",
      "run-css",
    );

    expect(doc).toContain('class="codit-showcase"');
    expect(doc).toContain('class="codit-card"');
    expect(doc).toContain("\\3c/style>");
  });

  it("wraps JavaScript code inside console mirror and escapes closing script tags", () => {
    const doc = buildSandboxedPreviewDocument(
      "javascript",
      "const msg = '</script>'; console.log(msg);",
      "run-js",
    );

    expect(doc).toContain('id="codit-js-lines"');
    expect(doc).toContain("<\\/script>");
    expect(doc).toContain('"run-js"');
  });
});
