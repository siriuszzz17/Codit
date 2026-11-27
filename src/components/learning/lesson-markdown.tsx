"use client";

import type {
  MarkdownBlock,
  MarkdownInlineToken,
} from "@/modules/learning/lesson-markdown";

function renderInlineTokens(tokens: readonly MarkdownInlineToken[]) {
  return tokens.map((token, idx) => {
    if (token.type === "code") {
      return (
        <code
          key={idx}
          className="rounded-md border border-border/80 bg-surface-muted/90 px-1.5 py-0.5 font-mono text-[0.82em] font-medium text-accent-strong dark:border-white/15 dark:bg-white/10 dark:text-sky-200"
        >
          {token.value}
        </code>
      );
    }
    if (token.type === "strong") {
      return (
        <strong key={idx} className="font-semibold text-foreground">
          {token.value}
        </strong>
      );
    }
    return <span key={idx}>{token.value}</span>;
  });
}

interface LessonMarkdownBlocksProps {
  blocks: readonly MarkdownBlock[];
}

export function LessonMarkdownBlocks({ blocks }: LessonMarkdownBlocksProps) {
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-foreground/90">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Tag = block.level === 2 ? "h3" : "h4";
          return (
            <Tag
              key={index}
              className="pt-1 text-xs font-bold tracking-tight text-foreground"
            >
              {block.text}
            </Tag>
          );
        }

        if (block.type === "paragraph") {
          return (
            <p key={index} className="text-sm leading-relaxed text-foreground/90">
              {renderInlineTokens(block.tokens)}
            </p>
          );
        }

        if (block.type === "list") {
          return (
            <ul key={index} className="space-y-1.5 pl-1">
              {block.items.map((item, itemIdx) => (
                <li
                  key={itemIdx}
                  className="flex items-start gap-2 text-sm leading-relaxed text-foreground/90"
                >
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  />
                  <span>{renderInlineTokens(item)}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <pre
            key={index}
            className="overflow-x-auto rounded-xl border border-border/80 bg-[#0f101a] p-3 font-mono text-xs leading-relaxed text-[#eef0ff] dark:border-white/10"
          >
            <code>{block.content}</code>
          </pre>
        );
      })}
    </div>
  );
}
