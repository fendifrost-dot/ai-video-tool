import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MultiAngleGallery, type ReferenceImage } from "./MultiAngleGallery";

// ---------------------------------------------------------------------------
// Storage is mocked because the component fires off a signedUrls() call on
// mount. We don't want the test to depend on a Supabase client.
// ---------------------------------------------------------------------------
vi.mock("@/lib/storage", () => ({
  signedUrls: vi.fn(async (_bucket: string, paths: string[]) => {
    const map: Record<string, string> = {};
    for (const p of paths) map[p] = `https://example.test/signed/${p}`;
    return map;
  }),
}));

vi.mock("@/lib/image-normalize", () => ({
  normalizeImageForUpload: vi.fn(async (f: File) => f),
}));

// shadcn Select uses Radix; jsdom doesn't implement the pointer-events flow
// it relies on. The component still renders the trigger button and the option
// list — which is what we care about for the smoke test — but a full
// interaction test would need either @testing-library/user-event with
// pointerEvents disabled, or a slimmer custom select. Out of scope for the
// "basic render + add flow" target.
vi.mock("@/components/ui/select", () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    Select: Passthrough,
    SelectContent: Passthrough,
    SelectItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SelectTrigger: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ""}</span>,
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

describe("MultiAngleGallery", () => {
  const sampleImages: ReferenceImage[] = [
    {
      id: "a1",
      url: "users/u/path-a.jpg",
      storage_path: "users/u/path-a.jpg",
      angle: "front",
    },
    {
      id: "b2",
      url: "users/u/path-b.jpg",
      storage_path: "users/u/path-b.jpg",
      angle: "side",
    },
  ];

  it("renders one tile per image plus an add-angle tile, and shows the count line", () => {
    render(
      <MultiAngleGallery
        images={sampleImages}
        bucket="wardrobe-refs"
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const tiles = screen.getAllByTestId("multi-angle-tile");
    expect(tiles).toHaveLength(2);
    expect(screen.getByTestId("multi-angle-add")).toBeTruthy();
    expect(screen.getByText(/2 of 8 angles/)).toBeTruthy();
  });

  it("calls onAdd with the normalised files when the user picks a file", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(
      <MultiAngleGallery
        images={[]}
        bucket="wardrobe-refs"
        onAdd={onAdd}
        onRemove={vi.fn()}
      />,
    );

    // The hidden <input type=file> sits next to the add button. The component
    // wires the add button to trigger the input via click(); we don't need to
    // exercise that synthesis here — we can fire `change` directly on the
    // file input, which is what the click would eventually produce.
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const file = new File(["x"], "front.jpg", { type: "image/jpeg" });
    Object.defineProperty(fileInput, "files", {
      value: [file],
      configurable: true,
    });
    fireEvent.change(fileInput);

    // Wait one microtask tick for the async upload handler.
    await new Promise((r) => setTimeout(r, 0));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toHaveLength(1);
    expect(onAdd.mock.calls[0][0][0]).toBe(file);
  });
});
