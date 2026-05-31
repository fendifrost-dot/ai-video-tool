/** Future: Premiere UXP panel — import timeline_manifest + sync bins. Not implemented in v1. */
export interface PremiereUxpBridge {
  connect(): Promise<void>;
  importFcpxml(path: string): Promise<void>;
}
