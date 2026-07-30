import { createHash } from "node:crypto";

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function publicationKey(input: {
  pageId: string;
  sourceHash: string;
  channel: string;
  accountId: string;
  templateVersion: string;
}): string {
  return sha256(
    [
      input.pageId,
      input.sourceHash,
      input.channel,
      input.accountId,
      input.templateVersion,
    ].join("\u001f"),
  );
}
