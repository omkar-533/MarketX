import type { ReactNode } from 'react';

type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'h'; text: string };

function inlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // **bold** then *italic* / _italic_
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={`b${key++}`} className="mai-md__strong">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={`i${key++}`} className="mai-md__em">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : [text];
}

function parseBlocks(raw: string): Block[] {
  const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      blocks.push({ type: 'h', text: trimmed.replace(/^#{1,3}\s+/, '') });
      i += 1;
      continue;
    }

    if (/^([-*•]|\d+\.)\s+/.test(trimmed)) {
      const isOl = /^\d+\.\s+/.test(trimmed);
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t) break;
        if (isOl) {
          if (!/^\d+\.\s+/.test(t)) break;
          items.push(t.replace(/^\d+\.\s+/, ''));
        } else {
          if (!/^[-*•]\s+/.test(t)) break;
          items.push(t.replace(/^[-*•]\s+/, ''));
        }
        i += 1;
      }
      blocks.push({ type: isOl ? 'ol' : 'ul', items });
      continue;
    }

    const chunk: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t) break;
      if (/^#{1,3}\s+/.test(t) || /^([-*•]|\d+\.)\s+/.test(t)) break;
      chunk.push(t);
      i += 1;
    }
    if (chunk.length) blocks.push({ type: 'p', lines: chunk });
  }

  return blocks;
}

/** Safe lightweight markdown for Hunter chat answers (no HTML injection). */
export default function ChatMarkdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);

  if (!blocks.length) {
    return <p className="mai-md__p">{inlineMarkdown(text)}</p>;
  }

  return (
    <div className="mai-md">
      {blocks.map((b, idx) => {
        if (b.type === 'h') {
          return (
            <h3 key={idx} className="mai-md__h">
              {inlineMarkdown(b.text)}
            </h3>
          );
        }
        if (b.type === 'ul') {
          return (
            <ul key={idx} className="mai-md__ul">
              {b.items.map((item, j) => (
                <li key={j}>{inlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }
        if (b.type === 'ol') {
          return (
            <ol key={idx} className="mai-md__ol">
              {b.items.map((item, j) => (
                <li key={j}>{inlineMarkdown(item)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={idx} className="mai-md__p">
            {b.lines.map((line, j) => (
              <span key={j}>
                {j > 0 ? <br /> : null}
                {inlineMarkdown(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
