"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { SandboxLanguage } from "@/lib/supabase/database.types";

export type CodeEditorLanguage =
  | "html"
  | "css"
  | "javascript"
  | "typescript"
  | "jsx"
  | "plain";

export function mapSandboxLanguageToEditor(
  language: SandboxLanguage,
): CodeEditorLanguage {
  if (language === "html_css_js" || language === "html") {
    return "html";
  }
  if (language === "css") {
    return "css";
  }
  if (language === "javascript" || language === "nodejs") {
    return "javascript";
  }
  if (language === "typescript") {
    return "typescript";
  }
  if (language === "react") {
    return "jsx";
  }
  return "plain";
}

const coditEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--surface-solid)",
    color: "var(--foreground)",
    fontFamily: "var(--font-mono)",
    fontSize: "12.5px",
    lineHeight: "1.6",
    height: "100%",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-mono)",
  },
  ".cm-content": {
    caretColor: "var(--accent)",
    padding: "10px 0",
  },
  ".cm-line": {
    padding: "0 12px",
  },
  ".cm-gutters": {
    backgroundColor: "var(--surface-muted)",
    color: "var(--muted)",
    borderRight: "1px solid var(--border)",
    userSelect: "none",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in srgb, var(--accent) 14%, transparent)",
    color: "var(--foreground)",
    fontWeight: "600",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--accent) 7%, transparent)",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 24%, transparent)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--accent)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--surface-elevated-solid)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    color: "var(--foreground)",
    boxShadow: "0 10px 28px rgba(0, 0, 0, 0.24)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  ".cm-matchingBracket": {
    backgroundColor: "color-mix(in srgb, var(--signal) 22%, transparent)",
    outline: "1px solid color-mix(in srgb, var(--signal) 55%, transparent)",
  },
});

const coditHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--accent)", fontWeight: "600" },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: "var(--foreground)" },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--signal)" },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "var(--accent-strong)" },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: "#d97706" },
  { tag: [tags.definition(tags.name), tags.separator], color: "var(--foreground)" },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: "#0ea5e9" },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link], color: "var(--signal)" },
  { tag: [tags.meta, tags.comment], color: "var(--muted)", fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.tagName, color: "#e11d48" },
  { tag: [tags.string, tags.special(tags.string)], color: "#059669" },
  { tag: tags.atom, color: "#d97706" },
  { tag: tags.bool, color: "#d97706", fontWeight: "600" },
  { tag: tags.invalid, color: "#ef4444", textDecoration: "underline wavy" },
]);

interface SandboxCodeEditorProps {
  value: string;
  language: CodeEditorLanguage;
  ariaLabel: string;
  onChange: (nextValue: string) => void;
  onRunShortcut?: () => void;
  onFormatShortcut?: () => void;
  minHeight?: string;
  readOnly?: boolean;
}

export function SandboxCodeEditor({
  value,
  language,
  ariaLabel,
  onChange,
  onRunShortcut,
  onFormatShortcut,
  minHeight = "280px",
  readOnly = false,
}: SandboxCodeEditorProps) {
  const extensions = useMemo<Extension[]>(() => {
    const langExt: Extension[] = [];
    if (language === "html") {
      langExt.push(html({ autoCloseTags: true, matchClosingTags: true }));
    } else if (language === "css") {
      langExt.push(css());
    } else if (language === "javascript") {
      langExt.push(javascript());
    } else if (language === "typescript") {
      langExt.push(javascript({ typescript: true }));
    } else if (language === "jsx") {
      langExt.push(javascript({ jsx: true }));
    }

    const shortcutsExt = Prec.highest(
      keymap.of([
        {
          key: "Mod-Enter",
          preventDefault: true,
          run: () => {
            onRunShortcut?.();
            return true;
          },
        },
        {
          key: "Shift-Alt-f",
          preventDefault: true,
          run: () => {
            onFormatShortcut?.();
            return true;
          },
        },
      ]),
    );

    return [
      ...langExt,
      coditEditorTheme,
      syntaxHighlighting(coditHighlightStyle),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
      shortcutsExt,
    ];
  }, [ariaLabel, language, onFormatShortcut, onRunShortcut]);

  return (
    <div className="codit-cm-wrapper flex-1 overflow-hidden bg-surface-solid">
      <CodeMirror
        value={value}
        height="100%"
        minHeight={minHeight}
        theme="none"
        readOnly={readOnly}
        extensions={extensions}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightSpecialChars: true,
          history: true,
          foldGutter: true,
          drawSelection: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: true,
          crosshairCursor: false,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          defaultKeymap: true,
          searchKeymap: true,
          historyKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: false,
          tabSize: 2,
        }}
      />
    </div>
  );
}
