import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsonToMarkdown } from '../../collaboration/collaboration.util';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8'),
  );
}

function markdownSnapshot(name: string): string {
  return readFileSync(
    join(__dirname, '__fixtures__', `${name}.md.expected`),
    'utf8',
  ).trimEnd();
}

/**
 * Lives with the doocs integration rather than in `collaboration/` because the
 * doocs editor and the publisher are the only consumers of this Markdown shape.
 * Docmost core owns `jsonToMarkdown`; this pins the parts we depend on.
 */
describe('Docmost Markdown export contract for Publisher', () => {
  it('keeps rich-content Markdown stable against its reviewable snapshot', () => {
    expect(jsonToMarkdown(fixture('publisher-rich-content'))).toBe(
      markdownSnapshot('publisher-rich-content'),
    );
  });

  it('preserves Mermaid as a fenced block for Publisher preprocessing', () => {
    expect(jsonToMarkdown(fixture('publisher-mermaid'))).toBe(
      markdownSnapshot('publisher-mermaid'),
    );
  });

  it('exports drawio and Excalidraw SVG sources as Markdown images', () => {
    expect(jsonToMarkdown(fixture('publisher-diagrams'))).toBe(
      markdownSnapshot('publisher-diagrams'),
    );
  });
});
