import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import type { Look } from "@/lib/queries/looks";
import { useArtistLooks } from "@/lib/queries/looks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type LookSelectorProps = {
  artistId: string;
  selected: Look[];
  onChange: (looks: Look[]) => void;
  multiSelect?: boolean;
  placeholder?: string;
};

function lookLabel(look: Look): string {
  const name = look.name?.trim();
  return name && name.length > 0 ? name : `Look ${look.id.slice(0, 8)}`;
}

export function LookSelector({
  artistId,
  selected,
  onChange,
  multiSelect = false,
  placeholder = "Select look...",
}: LookSelectorProps) {
  const [open, setOpen] = useState(false);
  const looksQuery = useArtistLooks(artistId);
  const looks = looksQuery.data ?? [];
  const selectedIds = useMemo(() => new Set(selected.map((l) => l.id)), [selected]);

  function handleSelect(look: Look) {
    if (multiSelect) {
      if (selectedIds.has(look.id)) {
        onChange(selected.filter((s) => s.id !== look.id));
      } else {
        onChange([...selected, look]);
      }
      return;
    }
    onChange([look]);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selected.length > 0
            ? multiSelect
              ? `${selected.length} looks selected`
              : lookLabel(selected[0]!)
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] max-w-[90vw] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search looks..." />
          <CommandList>
            <CommandEmpty>
              {looksQuery.isLoading ? "Loading looks..." : "No looks found."}
            </CommandEmpty>
            <CommandGroup>
              {looks.map((look) => (
                <CommandItem
                  key={look.id}
                  value={`${look.id} ${lookLabel(look)} ${look.pipeline_used ?? ""}`}
                  onSelect={() => handleSelect(look)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedIds.has(look.id) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{lookLabel(look)}</span>
                    <span className="text-xs text-muted-foreground">
                      {look.pipeline_used ?? look.status}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
