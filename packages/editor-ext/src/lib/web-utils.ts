import { sanitizeUrl as braintreeSanitizeUrl } from "@braintree/sanitize-url";

// Editor-independent helpers. Kept free of @tiptap imports so app entry code
// can import them without dragging the editor bundle into the entry chunk.

export function sanitizeUrl(url: string | undefined): string {
  if (!url) return "";

  const sanitized = braintreeSanitizeUrl(url);

  // Return empty string instead of "about:blank"
  return sanitized === "about:blank" ? "" : sanitized;
}

export function isInternalFileUrl(url: string | undefined): boolean {
  if (!url) return false;
  const normalized = url.trim();
  return normalized.startsWith("/api/files/") || normalized.startsWith("/files/");
}

export function copyToClipboard(text: string): void {
  if ("clipboard" in navigator) {
    navigator.clipboard.writeText(text).catch(() => {
      execCommandCopy(text);
    });
  } else {
    execCommandCopy(text);
  }
}

export function execCommandCopy(text: string): void {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}
