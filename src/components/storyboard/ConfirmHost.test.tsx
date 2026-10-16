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

describe("paid work shows the picture it is made from", () => {
  it("shows the image and says what it is, before the press", () => {
    render(
      <ConfirmHost
        request={{ title: "Restage your take for shot 17?", body: "About $3.70", confirmLabel: "Restage take", testId: "confirm-generate-clip", onConfirm: () => undefined, picture: { url: "https://example.test/place.png", caption: "The place he is put in — storyboard_c018" } }}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByTestId("confirm-picture").textContent).toContain("The place he is put in — storyboard_c018");
    expect((screen.getByTestId("confirm-picture-image") as HTMLImageElement).src).toBe("https://example.test/place.png");
  });

  it("says which image even when its link is not ready, and shows nothing when there is no image", () => {
    const { rerender } = render(<ConfirmHost request={{ title: "t", body: "b", confirmLabel: "Go", testId: "confirm-x", onConfirm: () => undefined, picture: { caption: "The clip is made from this image — still_1" } }} onClose={() => undefined} />);
    expect(screen.getByTestId("confirm-picture").textContent).toContain("still_1");
    expect(screen.queryByTestId("confirm-picture-image")).toBeNull();
    rerender(<ConfirmHost request={{ title: "t", body: "b", confirmLabel: "Go", testId: "confirm-x", onConfirm: () => undefined }} onClose={() => undefined} />);
    expect(screen.queryByTestId("confirm-picture")).toBeNull();
  });
});

describe("a line the director writes before the press", () => {
  const req = (onConfirm: (typed?: string) => void, secondary?: (typed?: string) => void) => ({
    title: "Animate the plate of shot 47?",
    body: "About $0.350",
    confirmLabel: "Animate the plate",
    testId: "confirm-animate-plate",
    onConfirm,
    input: { label: "Something absurd that happens", testId: "confirm-animate-plate-event", maxLength: 400 },
    ...(secondary ? { secondary: { label: "Dry run", testId: "confirm-animate-plate-dryrun", onConfirm: secondary } } : {}),
  });

  it("hands what was typed to the press, and to the dry run", async () => {
    const onConfirm = vi.fn();
    const dry = vi.fn();
    render(<ConfirmHost request={req(onConfirm, dry)} onClose={() => undefined} />);
    fireEvent.change(screen.getByTestId("confirm-animate-plate-event"), { target: { value: "a horse on the expressway" } });
    fireEvent.click(screen.getByTestId("confirm-animate-plate-dryrun"));
    fireEvent.click(screen.getByTestId("confirm-animate-plate"));
    await Promise.resolve();
    expect(dry).toHaveBeenCalledWith("a horse on the expressway");
    expect(onConfirm).toHaveBeenCalledWith("a horse on the expressway");
  });

  it("a dialog that replaces another starts with an empty field: the first one's words never reach the second", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<ConfirmHost request={req(first)} onClose={() => undefined} />);
    fireEvent.change(screen.getByTestId("confirm-animate-plate-event"), { target: { value: "shot 3's event" } });
    rerender(<ConfirmHost request={req(second)} onClose={() => undefined} />);
    expect((screen.getByTestId("confirm-animate-plate-event") as HTMLTextAreaElement).value).toBe("");
    fireEvent.click(screen.getByTestId("confirm-animate-plate"));
    await Promise.resolve();
    expect(second).toHaveBeenCalledWith("");
    expect(first).not.toHaveBeenCalled();
  });

  it("a dialog without a field hands nothing", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmHost request={{ title: "t", body: "b", confirmLabel: "Go", testId: "confirm-go", onConfirm }} onClose={() => undefined} />);
    fireEvent.click(screen.getByTestId("confirm-go"));
    await Promise.resolve();
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });
});
