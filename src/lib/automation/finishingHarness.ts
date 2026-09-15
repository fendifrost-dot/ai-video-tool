/**
 * Lane F — harness config. Astra is disabled. No I/O.
 * See docs/research/finishing/CONTROLLED_HARNESS_DESIGN.md.
 */

export type FinishingHarnessConfig = {
  astra: {
    enabled: boolean;
    max_steps: number;
  };
  spend: {
    max_usd: number;
  };
  max_actions: number;
  allow_file_delete: false;
  allow_network: false;
  abort_on_unexpected_dialog: true;
  hosts: ["premiere"];
};

export function createDisabledHarnessConfig(): FinishingHarnessConfig {
  return {
    astra: { enabled: false, max_steps: 0 },
    spend: { max_usd: 0 },
    max_actions: 12,
    allow_file_delete: false,
    allow_network: false,
    abort_on_unexpected_dialog: true,
    hosts: ["premiere"],
  };
}

export function astraRunnerEnabled(config: FinishingHarnessConfig): boolean {
  return config.astra.enabled === true;
}
