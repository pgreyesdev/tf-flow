import { Fragment, type ReactNode } from "react";

/**
 * Pinta el Markdown sencillo que devuelve el asistente: párrafos, listas, **negrita**, *cursiva* y
 * `código`. Se construyen nodos de React a partir del texto, nunca HTML, así que nada de lo que
 * escriba el modelo puede inyectar marcado.
 */
type Block =
  { kind: "paragraph"; lines: string[] } | { kind: "list"; ordered: boolean; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`)/g;

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | undefined;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const bullet = BULLET.exec(raw);
    const numbered = bullet ? null : NUMBERED.exec(raw);
    const item = bullet ?? numbered;
    if (item) {
      const ordered = Boolean(numbered);
      if (current?.kind !== "list" || current.ordered !== ordered) {
        current = { kind: "list", ordered, items: [] };
        blocks.push(current);
      }
      current.items.push(item[1]!.trim());
    } else if (raw.trim() === "") {
      current = undefined;
    } else {
      // Los títulos se leen como un párrafo en negrita: en una burbuja de chat sobran tamaños.
      const heading = HEADING.exec(raw);
      const line = heading ? `**${heading[1]!.trim()}**` : raw.trim();
      if (current?.kind !== "paragraph") {
        current = { kind: "paragraph", lines: [] };
        blocks.push(current);
      }
      current.lines.push(line);
    }
  }
  return blocks;
}

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (/^(\*\*|__).+\1$/.test(part)) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (/^`.+`$/.test(part)) {
      return (
        <code key={i} className="rounded bg-glass-strong px-1 text-[0.95em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (/^([*_]).+\1$/.test(part)) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {parseBlocks(text).map((block, i) => {
        if (block.kind === "paragraph") {
          return (
            <p key={i}>
              {block.lines.map((line, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {inline(line)}
                </Fragment>
              ))}
            </p>
          );
        }
        const List = block.ordered ? "ol" : "ul";
        return (
          <List
            key={i}
            className={block.ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}
          >
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
