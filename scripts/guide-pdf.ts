import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

/**
 * Renders docs/OWNER-GUIDE.md to docs/OWNER-GUIDE.pdf with the phone screenshots
 * inline: `npx tsx scripts/guide-pdf.ts`. A small Markdown subset is enough
 * for the guide: headings, paragraphs, lists, bold, links and images.
 */
const source = resolve('docs', 'OWNER-GUIDE.md');
const target = resolve('docs', 'OWNER-GUIDE.pdf');

/** Files go in as data URIs: a page built with setContent cannot load file:// resources. */
function dataUri(path: string): string {
  const type = path.endsWith('.png') ? 'image/png' : 'font/woff2';
  return `data:${type};base64,${readFileSync(path).toString('base64')}`;
}

function inline(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}

/** A line that starts a block of its own: a heading, an image or a list item. */
const BLOCK_START = /^(#{1,3} |!\[|\d+\. |- )/;

/**
 * Joins wrapped lines: the guide wraps at 80 columns, so a line that does not start a block
 * continues the paragraph or the list item above it (its indent dropped).
 */
function unwrap(markdown: string): string[] {
  const lines: string[] = [];
  let open = false;
  for (const raw of markdown.split('\n')) {
    const text = raw.trim();
    if (text === '') {
      lines.push('');
      open = false;
    } else if (open && !BLOCK_START.test(text)) {
      lines[lines.length - 1] = `${lines[lines.length - 1] ?? ''} ${text}`;
    } else {
      lines.push(raw.trimEnd());
      open = !/^(#{1,3} |!\[)/.test(text);
    }
  }
  return lines;
}

function toHtml(markdown: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of unwrap(markdown)) {
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    const image = /^!\[(.*?)\]\((.+?)\)$/.exec(line.trim());
    const ordered = /^(\d+)\. (.*)$/.exec(line);
    // An indented bullet (a choice under a numbered step) is shown as a plain bullet list.
    const bullet = /^\s*- (.*)$/.exec(line);
    if (heading) {
      closeList();
      out.push(
        `<h${heading[1]?.length ?? 1}>${inline(heading[2] ?? '')}</h${heading[1]?.length ?? 1}>`,
      );
    } else if (image) {
      closeList();
      out.push(
        `<figure><img src="${dataUri(resolve('docs', image[2] ?? ''))}" alt="${image[1] ?? ''}" /></figure>`,
      );
    } else if (ordered || bullet) {
      const kind = ordered ? 'ol' : 'ul';
      if (list !== kind) {
        closeList();
        list = kind;
        // A numbered list split by bullets carries on from its own number.
        out.push(ordered ? `<ol start="${ordered[1] ?? '1'}">` : '<ul>');
      }
      out.push(`<li>${inline((ordered ? ordered[2] : bullet?.[1]) ?? '')}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}

async function main(): Promise<void> {
  const fonts = resolve('node_modules', '@fontsource-variable', 'archivo', 'files');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Archivo;font-weight:100 900;font-stretch:62% 125%;src:url(${dataUri(`${fonts}/archivo-latin-wdth-normal.woff2`)}) format('woff2-variations')}
body{font-family:Archivo,sans-serif;font-size:12pt;line-height:1.5;color:#111;margin:0;padding:0 8mm}
h1{font-size:24pt;font-weight:900;font-stretch:122%;text-transform:uppercase;letter-spacing:-0.01em;margin:0 0 12pt}
h2{font-size:16pt;font-weight:800;font-stretch:116%;text-transform:uppercase;margin:24pt 0 8pt;page-break-after:avoid}
h3{font-size:13pt;margin:16pt 0 6pt;page-break-after:avoid}
p,li{margin:0 0 6pt} ol,ul{padding-left:18pt;margin:0 0 8pt}
figure{margin:8pt 0 12pt;text-align:center;page-break-inside:avoid}
figure img{width:62mm;border:1px solid #D9D9D9;border-radius:6pt}
code{font-family:ui-monospace,monospace;font-size:10.5pt}
a{color:#C8102E}
</style></head><body>${toHtml(readFileSync(source, 'utf8'))}</body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.pdf({
    path: target,
    format: 'Letter',
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    printBackground: true,
  });
  await browser.close();
  process.stdout.write(`${target}\n`);
}

await main();
