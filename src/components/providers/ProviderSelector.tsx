import type { ProviderName } from "@/integrations/supabase/aliases";
import { getProvider, PROVIDER_ORDER } from "@/lib/providers/registry";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CapabilityFilter = "video" | "image" | "any";

type ProviderSelectorProps = {
  value: ProviderName;
  onChange: (value: ProviderName) => void;
  capabilitiesFilter?: CapabilityFilter;
  allowManual?: boolean;
};

function supportsFilter(providerName: ProviderName, filter: CapabilityFilter): boolean {
  const provider = getProvider(providerName);
  if (filter === "any") return true;
  if (filter === "video") {
    return (
      provider.capabilities.includes("text_to_video") ||
      provider.capabilities.includes("image_to_video")
    );
  }
  return provider.capabilities.includes("variation");
}

export function ProviderSelector({
  value,
  onChange,
  capabilitiesFilter = "video",
  allowManual = false,
}: ProviderSelectorProps) {
  const options = PROVIDER_ORDER.filter((name) => {
    if (!allowManual && name === "manual") return false;
    return supportsFilter(name, capabilitiesFilter);
  });

  return (
    <Select value={value} onValueChange={(v) => onChange(v as ProviderName)}>
      <SelectTrigger>
        <SelectValue placeholder="Select provider" />
      </SelectTrigger>
      <SelectContent>
        {options.map((name) => {
          const provider = getProvider(name);
          return (
            <SelectItem key={name} value={name}>
              <span className="capitalize">{provider.displayName}</span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
