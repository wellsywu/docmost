import type { ProseMirrorNode } from "../core/types.js";

const allowedNodes = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
  "image",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "details",
  "detailsSummary",
  "detailsContent",
  "callout",
  "mathInline",
  "mathBlock",
  "drawio",
  "excalidraw",
]);

const blockedNodes = new Map([
  ["transclusion", "Transclusion content is not exported deterministically"],
  ["mention", "Mention targets may be silently lost during Markdown export"],
  ["subpages", "Subpage collections are not part of a single-page publication"],
  ["embed", "Interactive embeds cannot be represented in a WeChat draft"],
  ["iframe", "Iframes are not accepted by WeChat article content"],
]);

export class UnsupportedNodeError extends Error {
  constructor(readonly warnings: string[]) {
    super(`Unsupported Docmost nodes: ${warnings.join("; ")}`);
    this.name = "UnsupportedNodeError";
  }
}

export function scanProseMirror(root: ProseMirrorNode): string[] {
  const warnings: string[] = [];

  const visit = (node: ProseMirrorNode, path: string): void => {
    const reason = blockedNodes.get(node.type);
    const diagramWithoutSource =
      (node.type === "drawio" || node.type === "excalidraw") &&
      (typeof node.attrs?.src !== "string" || node.attrs.src.trim() === "");
    if (diagramWithoutSource) {
      warnings.push(
        `${path}:${node.type} - diagram has no SVG source and would be missing from the draft`,
      );
    } else if (reason) {
      warnings.push(`${path}:${node.type} - ${reason}`);
    } else if (!allowedNodes.has(node.type)) {
      warnings.push(`${path}:${node.type} - unknown node type`);
    }
    node.content?.forEach((child, index) => visit(child, `${path}.${index}`));
  };

  visit(root, "doc");
  return warnings;
}

export function assertSupportedProseMirror(root: ProseMirrorNode): void {
  const warnings = scanProseMirror(root);
  if (warnings.length > 0) {
    throw new UnsupportedNodeError(warnings);
  }
}
