import { useState, type ReactNode, type Ref } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TreeNode } from "../model/tree-model.types";
import { treeModel } from "../model/tree-model";
import { DocTree, type DocTreeProps, type RenderRowProps } from "./doc-tree";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 32,
        size: 32,
      })),
    getTotalSize: () => count * 32,
    scrollToIndex: vi.fn(),
    scrollOffset: 0,
  }),
}));

vi.mock("@atlaskit/pragmatic-drag-and-drop-auto-scroll/element", () => ({
  autoScrollForElements: () => vi.fn(),
}));

vi.mock("./doc-tree-row", () => ({
  DocTreeRow: ({
    node,
    level,
    openIds,
    selectedId,
    activeId,
    renderRow,
    onToggle,
    registerRowElement,
  }: {
    node: TreeNode<TestNode>;
    level: number;
    openIds: ReadonlySet<string>;
    selectedId?: string;
    activeId?: string;
    renderRow: (props: RenderRowProps<TestNode>) => ReactNode;
    onToggle: (id: string, isOpen: boolean) => void;
    registerRowElement: (id: string, element: HTMLElement | null) => void;
  }) => {
    const isOpen = openIds.has(node.id);
    const hasChildren = !!node.children?.length;
    return renderRow({
      node,
      level,
      isOpen,
      hasChildren,
      isSelected: selectedId === node.id,
      isDragging: false,
      isReceivingDrop: null,
      rowRef: (element) =>
        registerRowElement(node.id, element as HTMLElement | null),
      tabIndex: activeId === node.id ? 0 : -1,
      treeItemProps: {
        role: "treeitem",
        "aria-level": level + 1,
        "aria-label": node.name,
        "data-row-id": node.id,
      },
      toggleOpen: () => onToggle(node.id, !isOpen),
    });
  },
}));

type TestNode = {
  id: string;
  name: string;
  canEdit?: boolean;
  children?: TestNode[];
};

const nodes: TreeNode<TestNode>[] = [
  {
    id: "a",
    name: "A",
    children: [{ id: "a1", name: "A1", children: [] }],
  },
  { id: "b", name: "B", children: [] },
];

function Row({
  node,
  rowRef,
  tabIndex,
  treeItemProps,
}: RenderRowProps<TestNode>) {
  return (
    <div
      ref={rowRef as Ref<HTMLDivElement>}
      tabIndex={tabIndex}
      data-testid={`row-${node.id}`}
      {...treeItemProps}
    >
      {node.name}
      <button type="button" data-testid={`inner-${node.id}`}>
        action
      </button>
    </div>
  );
}

function renderTree(overrides: Partial<DocTreeProps<TestNode>> = {}) {
  const props: DocTreeProps<TestNode> = {
    data: nodes,
    openIds: new Set(["a"]),
    renderRow: (rowProps) => <Row {...rowProps} />,
    onMove: vi.fn(),
    onToggle: vi.fn(),
    getDragLabel: (node) => node.name,
    ...overrides,
  };
  return render(<DocTree {...props} />);
}

function dispatchKey(
  target: HTMLElement,
  key: string,
  init: KeyboardEventInit = {},
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe("DocTree mutation shortcuts", () => {
  it("creates a child only from the focused treeitem and stops bubbling", () => {
    const onCreateChild = vi.fn();
    const outerKeyDown = vi.fn();
    render(
      <div onKeyDown={outerKeyDown}>
        <DocTree
          data={nodes}
          openIds={new Set(["a"])}
          renderRow={(rowProps) => <Row {...rowProps} />}
          onMove={vi.fn()}
          onToggle={vi.fn()}
          canMutate={() => true}
          onCreateChild={onCreateChild}
          getDragLabel={(node) => node.name}
        />
      </div>,
    );

    const row = screen.getByTestId("row-a");
    row.focus();
    const event = dispatchKey(row, "n");

    expect(event.defaultPrevented).toBe(true);
    expect(outerKeyDown).not.toHaveBeenCalled();
    expect(onCreateChild).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
    );
  });

  it("consumes mutation keys from inner row actions without mutating", () => {
    const onCreateChild = vi.fn();
    const onRequestDelete = vi.fn();
    renderTree({
      canMutate: () => true,
      onCreateChild,
      onRequestDelete,
    });

    const inner = screen.getByTestId("inner-a");
    inner.focus();
    fireEvent.keyDown(inner, { key: "n" });
    fireEvent.keyDown(inner, { key: "Delete" });

    expect(onCreateChild).not.toHaveBeenCalled();
    expect(onRequestDelete).not.toHaveBeenCalled();
  });

  it.each([
    ["read-only tree", true, true],
    ["read-only node", false, false],
  ])("does nothing for a %s", (_, readOnly, canMutate) => {
    const onCreateChild = vi.fn();
    const onRequestDelete = vi.fn();
    renderTree({
      readOnly,
      canMutate: () => canMutate,
      onCreateChild,
      onRequestDelete,
    });

    const row = screen.getByTestId("row-a");
    row.focus();
    fireEvent.keyDown(row, { key: "n" });
    fireEvent.keyDown(row, { key: "Backspace" });

    expect(onCreateChild).not.toHaveBeenCalled();
    expect(onRequestDelete).not.toHaveBeenCalled();
  });

  it("ignores repeated and composing mutation keys", () => {
    const onCreateChild = vi.fn();
    renderTree({ canMutate: () => true, onCreateChild });

    const row = screen.getByTestId("row-a");
    row.focus();
    fireEvent.keyDown(row, { key: "n", repeat: true });
    dispatchKey(row, "n", { isComposing: true });
    fireEvent.keyDown(row, { key: "N", shiftKey: true });

    const safariImeEvent = new KeyboardEvent("keydown", {
      key: "n",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(safariImeEvent, "keyCode", { value: 229 });
    row.dispatchEvent(safariImeEvent);

    expect(onCreateChild).not.toHaveBeenCalled();
  });

  it("focuses the first surviving row after the deleted subtree", async () => {
    function Harness() {
      const [data, setData] = useState(nodes);
      return (
        <DocTree
          data={data}
          openIds={new Set(["a"])}
          renderRow={(rowProps) => <Row {...rowProps} />}
          onMove={vi.fn()}
          onToggle={vi.fn()}
          canMutate={() => true}
          onRequestDelete={(node, onDeleteComplete) => {
            setData((current) => treeModel.remove(current, node.id));
            onDeleteComplete();
          }}
          getDragLabel={(node) => node.name}
        />
      );
    }

    render(<Harness />);
    const row = screen.getByTestId("row-a");
    row.focus();
    fireEvent.keyDown(row, { key: "Delete" });

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("row-b")),
    );
    expect(screen.queryByTestId("row-a1")).toBeNull();
  });

  it("falls back to the previous surviving row after deletion", async () => {
    function Harness() {
      const [data, setData] = useState(nodes);
      return (
        <DocTree
          data={data}
          openIds={new Set()}
          renderRow={(rowProps) => <Row {...rowProps} />}
          onMove={vi.fn()}
          onToggle={vi.fn()}
          canMutate={() => true}
          onRequestDelete={(node, onDeleteComplete) => {
            setData((current) => treeModel.remove(current, node.id));
            onDeleteComplete();
          }}
          getDragLabel={(node) => node.name}
        />
      );
    }

    render(<Harness />);
    const row = screen.getByTestId("row-b");
    row.focus();
    fireEvent.keyDown(row, { key: "Backspace" });

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("row-a")),
    );
  });
});
