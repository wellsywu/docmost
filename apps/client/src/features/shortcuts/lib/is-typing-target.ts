const TYPING_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
].join(",");

const INTERACTIVE_TARGET_SELECTOR = [
  "a",
  "button",
  '[role="button"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
].join(",");

function getTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

export function isTypingTarget(event: Pick<KeyboardEvent, "target">): boolean {
  return Boolean(
    getTargetElement(event.target)?.closest(TYPING_TARGET_SELECTOR),
  );
}

export function isInteractiveTarget(
  event: Pick<KeyboardEvent, "target">,
): boolean {
  const target = getTargetElement(event.target);
  return Boolean(
    target?.closest(`${TYPING_TARGET_SELECTOR},${INTERACTIVE_TARGET_SELECTOR}`),
  );
}

export function isComposing(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

export function isTreeTarget(event: Pick<KeyboardEvent, "target">): boolean {
  return Boolean(getTargetElement(event.target)?.closest('[role="tree"]'));
}
