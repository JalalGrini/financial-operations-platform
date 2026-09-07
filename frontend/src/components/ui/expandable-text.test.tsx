/**
 * ExpandableText: the "See more" control must appear exactly when text is
 * clipped, and never when it is not.
 *
 * jsdom performs NO layout, so scrollHeight and clientHeight are both 0 and the
 * overflow check can never fire on its own. The two properties are stubbed per
 * test to simulate clipped and unclipped text. That is the honest way to cover
 * measurement logic here; asserting on real wrapping would need a browser.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpandableText } from "./expandable-text";

/** Force the element metrics jsdom will not compute. */
function stubLayout({ scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  const original = {
    scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight"),
    clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
  };
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
  return () => {
    if (original.scrollHeight) {
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", original.scrollHeight);
    }
    if (original.clientHeight) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", original.clientHeight);
    }
  };
}

let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
  vi.restoreAllMocks();
});

describe("ExpandableText", () => {
  it("renders the text it is given", () => {
    render(<ExpandableText text="A short note" />);
    expect(screen.getByText("A short note")).toBeInTheDocument();
  });

  it("renders the empty fallback when there is no text", () => {
    const { container } = render(<ExpandableText text="" />);
    expect(container.textContent).toBe("—");
  });

  it("treats whitespace-only text as empty", () => {
    // Braces matter: in a JSX string attribute "\n" is a literal backslash
    // followed by n, which is NOT whitespace and would render as text.
    const { container } = render(<ExpandableText text={"   \n  "} />);
    expect(container.textContent).toBe("—");
  });

  it("renders the empty fallback for null", () => {
    const { container } = render(<ExpandableText text={null} />);
    expect(container.textContent).toBe("—");
  });

  it("offers no See more control when the text is not clipped", async () => {
    restore = stubLayout({ scrollHeight: 20, clientHeight: 20 });
    render(<ExpandableText text="Fits on the visible lines" />);
    await waitFor(() => {
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  it("ignores sub-pixel overflow so a fraction of a line is not treated as clipped", async () => {
    restore = stubLayout({ scrollHeight: 21, clientHeight: 20 });
    render(<ExpandableText text="Fractionally taller" />);
    await waitFor(() => {
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  it("offers a See more control when the text is clipped", async () => {
    restore = stubLayout({ scrollHeight: 200, clientHeight: 40 });
    render(<ExpandableText text="A very long note that gets clipped" />);
    expect(await screen.findByRole("button", { name: /see more/i })).toBeInTheDocument();
  });

  it("opens a dialog showing the full text, with the label as its heading", async () => {
    restore = stubLayout({ scrollHeight: 200, clientHeight: 40 });
    const longText = "Line one of the note\nLine two of the note";
    render(<ExpandableText text={longText} label="Note" context="TRF-2026-00001" />);

    const button = await screen.findByRole("button", { name: /see more/i });
    button.click();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.getByText("TRF-2026-00001")).toBeInTheDocument();
    // Assert on the dialog's own content rather than matching the whole string
    // exactly: the same text also sits in the clamped paragraph, and
    // testing-library normalises the newline away.
    expect(dialog.textContent).toContain("Line one of the note");
    expect(dialog.textContent).toContain("Line two of the note");
  });

  it("survives an environment without ResizeObserver", async () => {
    restore = stubLayout({ scrollHeight: 200, clientHeight: 40 });
    const original = globalThis.ResizeObserver;
    // @ts-expect-error deliberately removing it to exercise the guard
    delete globalThis.ResizeObserver;
    try {
      render(<ExpandableText text="Clipped without an observer" />);
      // The initial measurement still runs, so the control is still offered.
      expect(await screen.findByRole("button", { name: /see more/i })).toBeInTheDocument();
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
