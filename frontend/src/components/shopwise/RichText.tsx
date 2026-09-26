import React from 'react';

// Mise en forme légère du texte : **gras** et *italique* à l'intérieur d'une ligne
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={`${keyPrefix}-${i}`}>{part.slice(1, -1)}</em>;
    return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
  });
}

type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { type: 'ul' | 'ol'; items: string[] };

// Découpe un texte façon Markdown (titres #, listes - / 1., citations >, paragraphes) en blocs
function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const last = blocks[blocks.length - 1];
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: (['h1', 'h2', 'h3'] as const)[heading[1].length - 1], text: heading[2] });
    } else if (/^>\s*/.test(line)) {
      blocks.push({ type: 'quote', text: line.replace(/^>\s*/, '') });
    } else if (/^[-*]\s+/.test(line) && !/^\*[^*]+\*$/.test(line)) {
      const item = line.replace(/^[-*]\s+/, '');
      if (last?.type === 'ul') last.items.push(item);
      else blocks.push({ type: 'ul', items: [item] });
    } else if (/^\d+\.\s+/.test(line)) {
      const item = line.replace(/^\d+\.\s+/, '');
      if (last?.type === 'ol') last.items.push(item);
      else blocks.push({ type: 'ol', items: [item] });
    } else {
      blocks.push({ type: 'p', text: line });
    }
  }
  return blocks;
}

interface RichTextProps {
  content: string;
  /** Ignore le premier titre de niveau 1 (souvent identique au titre de la page). */
  skipFirstTitle?: boolean;
  className?: string;
}

// Rendu du contenu rédactionnel (articles de blog, descriptions de services) dans le style ShopWise
export function RichText({ content, skipFirstTitle = false, className = '' }: RichTextProps) {
  let blocks = parseBlocks(content);
  if (skipFirstTitle && blocks[0]?.type === 'h1') blocks = blocks.slice(1);

  return (
    <div className={`sw-richtext ${className}`}>
      {blocks.map((block, i) => {
        const key = `b${i}`;
        switch (block.type) {
          case 'h1':
            return <h2 key={key}>{renderInline(block.text, key)}</h2>;
          case 'h2':
            return <h3 key={key}>{renderInline(block.text, key)}</h3>;
          case 'h3':
            return <h4 key={key}>{renderInline(block.text, key)}</h4>;
          case 'ul':
            return (
              <ul key={key}>
                {block.items.map((item, j) => <li key={j}>{renderInline(item, `${key}-${j}`)}</li>)}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key}>
                {block.items.map((item, j) => <li key={j}>{renderInline(item, `${key}-${j}`)}</li>)}
              </ol>
            );
          case 'quote':
            return (
              <blockquote key={key}>
                <i className="bi bi-quote" aria-hidden="true"></i>
                <p>{renderInline(block.text, key)}</p>
              </blockquote>
            );
          default:
            return <p key={key}>{renderInline(block.text, key)}</p>;
        }
      })}
    </div>
  );
}
