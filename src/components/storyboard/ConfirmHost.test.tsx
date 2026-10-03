import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmHost } from "./ConfirmHost";

afterEach(cleanup);

describe("a confirmation never waits for the work before it", () => {
  it("closes at once, runs the work, and the next confirmation can be pressed while that work is still running", () => {
    let finish: () => void = () => undefined;
    const slow = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const onClose = vi.fn();
    const { rerender } = render(<ConfirmHost request={{ title: "Generate an image for shot 16?", body: "About $0.14", confirmLabel: "Generate image", testId: "confirm-generate-image", onConfirm: slow }} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("confirm-generate-image"));
    expect(onClose).toHaveBeenCalledTimes(1);

    // the first image is still drawing; the director asks for the next shot's
    const next = vi.fn();
    rerender(<ConfirmHost request={{ title: "Generate an image for shot 18?", body: "About $0.14", confirmLabel: "Generate image", testId: "confirm-generate-image", onConfirm: next }} onClose={onClose} />);
    const button = screen.getByTestId("confirm-generate-image") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    return Promise.resolve().then(() => {
      expect(slow).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledTimes(1);
      finish();
    });
  });

  it("a failure in the work does not escape the dialog", async () => {
    const onClose = vi.fn();
    render(<ConfirmHost request={{ title: "t", body: "b", confirmLabel: "Go", testId: "confirm-x", onConfirm: () => Promise.reject(new Error("boom")) }} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("confirm-x"));
    await Promise.resolve();
    expect(onClose).toHaveBeenCalled();
  });
});
