import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders above the whole app. The page's content sits inside the shell's own stacking layer, so a "fixed, on top"
 * element drawn there still slides UNDER the shell's phone header and bottom bar — the full-screen shot lost its
 * Back button that way. Everything that must cover the screen (the full-screen shot, the footage picker, a
 * confirmation) goes through here instead, onto the document body.
 */
export function Overlay({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
