const OVERLAY_SELECTORS = [
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  "[data-page-find-dialog]",
  "#slash-command",
  "#emoji-command",
  ".mantine-Popover-dropdown",
];

function isVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;

  let current: HTMLElement | null = element;
  while (current) {
    if (current.hidden || current.getAttribute("aria-hidden") === "true") {
      return false;
    }

    const style = window.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    current = current.parentElement;
  }

  return true;
}

function getTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

export function isShortcutOverlayTarget(
  event: Pick<KeyboardEvent, "target">,
): boolean {
  const target = getTargetElement(event.target);
  if (!target) return false;

  return OVERLAY_SELECTORS.some((selector) =>
    Boolean(target.closest(selector)),
  );
}

export function hasOpenShortcutOverlay({
  excludePageFind = false,
}: { excludePageFind?: boolean } = {}): boolean {
  return OVERLAY_SELECTORS.some((selector) =>
    Array.from(document.querySelectorAll(selector)).some(
      (element) =>
        (!excludePageFind || !element.closest("[data-page-find-dialog]")) &&
        isVisible(element),
    ),
  );
}
