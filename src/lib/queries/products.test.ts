import { describe, expect, it, vi, afterEach } from "vitest";
import {
  formatProductCatalogError,
  isProductCatalogEnabled,
  isProductLibraryComposeEnabled,
  isWardrobeDeprecated,
} from "./products";

describe("product catalog feature flags", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults all flags off when env vars are unset", () => {
    vi.stubEnv("VITE_PRODUCT_CATALOG_ENABLED", "");
    vi.stubEnv("VITE_PRODUCT_LIBRARY_COMPOSE", "");
    vi.stubEnv("VITE_WARDROBE_DEPRECATED", "");
    expect(isProductCatalogEnabled()).toBe(false);
    expect(isProductLibraryComposeEnabled()).toBe(false);
    expect(isWardrobeDeprecated()).toBe(false);
  });

  it("enables flags only when explicitly true", () => {
    vi.stubEnv("VITE_PRODUCT_CATALOG_ENABLED", "true");
    vi.stubEnv("VITE_PRODUCT_LIBRARY_COMPOSE", "1");
    vi.stubEnv("VITE_WARDROBE_DEPRECATED", "true");
    expect(isProductCatalogEnabled()).toBe(true);
    expect(isProductLibraryComposeEnabled()).toBe(true);
    expect(isWardrobeDeprecated()).toBe(true);
  });
});

describe("formatProductCatalogError", () => {
  it("surfaces missing schema with migration guidance", () => {
    expect(
      formatProductCatalogError({ code: "PGRST205", message: "Could not find the table" }),
    ).toContain("20260617120000_product_catalog.sql");
  });
});
