import { Fragment } from 'react';

// Purpose-built, minimal markdown renderer for the legal pages only.
// Deliberately not a general-purpose markdown library — pulling in a real
// dependency for two static pages isn't worth the bundle size when the
// actual markdown used here is limited to a known, small feature set:
// headers (# ## ###), bold (**text**), tables (| a | b |), bullet lists
// (- item), and plain paragraphs. If the legal docs ever need richer
// markdown (nested lists, links, code blocks), upgrading to a real
// library at that point is the right call — this is intentionally not
// trying to be that.

function renderInline(text, keyPrefix) {
  // Handle **bold** spans within a line of text.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
  });
}

function parseTable(lines, startIdx) {
  // Expects a header row, a separator row (|---|---|), then data rows.
  const headerCells = lines[startIdx].split('|').map((c) => c.trim()).filter(Boolean);
  let i = startIdx + 2; // skip header + separator
  const rows = [];
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    rows.push(lines[i].split('|').map((c) => c.trim()).filter(Boolean));
    i++;
  }
  return { headerCells, rows, nextIdx: i };
}

export default function MarkdownDoc({ content }) {
  const lines = content.split('\n');
  const blocks = [];
  let i = 0;
  let listBuffer = [];

  function flushList() {
    if (listBuffer.length > 0) {
      blocks.push(
        <ul key={`list-${blocks.length}`} style={{ margin: '0 0 16px', paddingLeft: 22 }}>
          {listBuffer.map((item, idx) => (
            <li key={idx} style={{ marginBottom: 6, lineHeight: 1.6 }}>{renderInline(item, `li-${idx}`)}</li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      flushList();
      i++;
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flushList();
      blocks.push(<h1 key={i} style={{ fontSize: 32, marginTop: 0, marginBottom: 8 }}>{trimmed.slice(2)}</h1>);
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      blocks.push(<h2 key={i} style={{ fontSize: 22, marginTop: 32, marginBottom: 12 }}>{trimmed.slice(3)}</h2>);
      i++;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      flushList();
      blocks.push(<h3 key={i} style={{ fontSize: 17, marginTop: 22, marginBottom: 8 }}>{trimmed.slice(4)}</h3>);
      i++;
      continue;
    }

    if (trimmed.startsWith('|')) {
      flushList();
      const { headerCells, rows, nextIdx } = parseTable(lines, i);
      blocks.push(
        <table key={i} style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <thead>
            <tr>
              {headerCells.map((cell, idx) => (
                <th key={idx} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid var(--line-dark)', fontSize: 13 }}>
                  {renderInline(cell, `th-${idx}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} style={{ padding: '8px 12px', borderBottom: '1px solid var(--line-dark)', fontSize: 14, verticalAlign: 'top' }}>
                    {renderInline(cell, `td-${rIdx}-${cIdx}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
      i = nextIdx;
      continue;
    }

    if (trimmed.startsWith('- ')) {
      listBuffer.push(trimmed.slice(2));
      i++;
      continue;
    }

    // Plain paragraph
    flushList();
    blocks.push(<p key={i} style={{ lineHeight: 1.7, marginBottom: 16 }}>{renderInline(trimmed, `p-${i}`)}</p>);
    i++;
  }
  flushList();

  return <div>{blocks}</div>;
}
