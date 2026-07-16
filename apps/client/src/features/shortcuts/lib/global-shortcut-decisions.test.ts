import { describe, expect, it } from "vitest";
import { PageEditMode } from "@/features/user/types/user.types";
import { shouldCreateRootPageWithBareN } from "./global-shortcut-decisions";

function bareN(target: Element = document.body) {
  const event = new KeyboardEvent("keydown", { code: "KeyN" });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

const allowedState = {
  spaceId: "space-id",
  canCreatePage: true,
  isPageRoute: false,
  allowBareRootCreate: true,
  currentPageEditMode: PageEditMode.Read,
  overlayOpen: false,
};

describe("bare root page shortcut", () => {
  it("allows N on a space home or readable page", () => {
    expect(shouldCreateRootPageWithBareN(bareN(), allowedState)).toBe(true);
    expect(
      shouldCreateRootPageWithBareN(bareN(), {
        ...allowedState,
        isPageRoute: true,
      }),
    ).toBe(true);
  });

  it("rejects unrelated routes, edit mode, inputs, and overlays", () => {
    expect(
      shouldCreateRootPageWithBareN(bareN(), {
        ...allowedState,
        allowBareRootCreate: false,
      }),
    ).toBe(false);
    expect(
      shouldCreateRootPageWithBareN(bareN(), {
        ...allowedState,
        isPageRoute: true,
        currentPageEditMode: PageEditMode.Edit,
      }),
    ).toBe(false);
    expect(
      shouldCreateRootPageWithBareN(
        bareN(document.createElement("input")),
        allowedState,
      ),
    ).toBe(false);
    expect(
      shouldCreateRootPageWithBareN(bareN(), {
        ...allowedState,
        overlayOpen: true,
      }),
    ).toBe(false);
  });
});
