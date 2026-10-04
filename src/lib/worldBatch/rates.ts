/**
 * Provider list rates and prompt caps — the TypeScript mirror of config/provider_rates.json and
 * config/provider_caps.json (a test reads both files and holds this module to them). The browser build cannot import
 * from outside src/, so the numbers are mirrored rather than imported.
 */
export const PROVIDER_RATES = {
  still_usd_each: 0.07,
  runway: { gen4_turbo: 0.05, "gen4.5": 0.15 } as Record<string, number>,
  kling_usd_per_s: 0.07,
  dop_usd_per_s: 0.083,
  seedance_usd_per_s: { "480p": 0.2468, "720p": 0.4622, "1080p": 1.1372 } as Record<string, number>,
  /**
   * The provider's published token rule for Seedance 2.5, which is what it charges by (provider_rates.json →
   * _seedance_tokens has the rule in words and the scope of what has actually been charged).
   */
  seedance_tokens: {
    usd_per_1000_tokens: { "480p": 0.0214, "720p": 0.0214, "1080p": 0.0234 } as Record<string, number>,
    video_input_factor: 0.6,
    pixels: { "480p": 409920, "720p": 921600, "1080p": 2073600 } as Record<string, number>,
    frames_per_second: 24,
    divisor: 1024,
  },
  judge_usd_each: 0.08,
} as const;

/** Longest promptText each provider accepts (config/provider_caps.json → max_prompt_chars). */
export const PROMPT_CAPS: Record<"runway" | "higgsfield" | "xai", number> = { runway: 1000, higgsfield: 2000, xai: 4096 };

/** Substrings in a provider error that mean every further submit in this run will be refused (provider_caps.json). */
export const PROVIDER_REFUSALS: Record<"runway" | "higgsfield" | "xai", string[]> = {
  runway: ["not have enough credits", "insufficient credits", "quota"],
  higgsfield: ["insufficient", "balance", "quota", "not_enough_credits"],
  xai: ["used all available credits", "spending limit"],
};
