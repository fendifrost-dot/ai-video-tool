/** Future: Resolve Python/Lua — apply LUTs from style_profiles. Not implemented in v1. */
export interface ResolveScriptBridge {
  applyColorProfile(clipId: string, profileId: string): Promise<void>;
}
