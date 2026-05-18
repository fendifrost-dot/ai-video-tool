import { useMemo } from "react";
import type {
  PromptTemplate,
  ProviderName,
} from "@/integrations/supabase/aliases";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TemplatePicker({
  templates,
  value,
  onChange,
  providerHint,
}: {
  templates: PromptTemplate[];
  value: string | null;
  onChange: (id: string) => void;
  providerHint?: ProviderName;
}) {
  // Group: provider-specific seeds, universal seeds, then user customs
  const groups = useMemo(() => {
    const seedsByProvider: PromptTemplate[] = [];
    const seedsUniversal: PromptTemplate[] = [];
    const customs: PromptTemplate[] = [];
    for (const t of templates) {
      if (!t.is_seed) {
        customs.push(t);
      } else if (t.provider == null) {
        seedsUniversal.push(t);
      } else {
        seedsByProvider.push(t);
      }
    }

    // Sort: provider seeds prioritise the providerHint
    const byProviderOrder = (a: PromptTemplate, b: PromptTemplate) => {
      const aMatch = providerHint && a.provider === providerHint ? -1 : 0;
      const bMatch = providerHint && b.provider === providerHint ? -1 : 0;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return a.name.localeCompare(b.name);
    };
    seedsByProvider.sort(byProviderOrder);
    seedsUniversal.sort((a, b) => a.name.localeCompare(b.name));
    customs.sort((a, b) => a.name.localeCompare(b.name));

    return { seedsByProvider, seedsUniversal, customs };
  }, [templates, providerHint]);

  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Pick a template" />
      </SelectTrigger>
      <SelectContent className="max-h-[60vh]">
        {groups.customs.length > 0 && (
          <SelectGroup>
            <SelectLabel>Your templates</SelectLabel>
            {groups.customs.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {groups.seedsByProvider.length > 0 && (
          <SelectGroup>
            <SelectLabel>Provider seeds</SelectLabel>
            {groups.seedsByProvider.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {groups.seedsUniversal.length > 0 && (
          <SelectGroup>
            <SelectLabel>Universal seeds</SelectLabel>
            {groups.seedsUniversal.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
