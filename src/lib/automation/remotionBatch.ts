/** Future: headless Remotion render from remotion_manifest.json. Not implemented in v1. */
export interface RemotionBatchRenderer {
  render(manifestPath: string, outputPath: string): Promise<void>;
}
