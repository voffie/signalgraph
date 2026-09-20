<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import type { SearchField } from "$lib/types";
  import { cn } from "$lib/utils";
  import SearchIcon from "@lucide/svelte/icons/search";
  import XIcon from "@lucide/svelte/icons/x";

  let {
    search,
    searchField,
    matchCount,
    onSearchChange,
    onSearchFieldChange,
  }: {
    search: string;
    searchField: SearchField;
    matchCount: number;
    onSearchChange: (value: string) => void;
    onSearchFieldChange: (value: SearchField) => void;
  } = $props();

  const SEARCH_FIELDS: Array<{ value: SearchField; label: string }> = [
    { value: "any", label: "Any" },
    { value: "name", label: "Name" },
    { value: "msg-id", label: "Msg ID" },
    { value: "corr-id", label: "Corr ID" },
    { value: "trace-id", label: "Trace ID" },
    { value: "service", label: "Service" },
  ];

  function searchFieldLabel(value: SearchField): string {
    return SEARCH_FIELDS.find((f) => f.value === value)?.label ?? value;
  }
</script>

<div
  class="flex h-7 w-72 items-stretch overflow-hidden rounded-lg border border-white/10 bg-white/4">
  <Select.Root
    type="single"
    bind:value={searchField}
    onValueChange={(v) => onSearchFieldChange(v as SearchField)}>
    <Select.Trigger
      class="max-w-20 min-w-16 shrink-0 rounded-none border-0 border-r border-white/10 bg-white/6 px-2 font-mono text-[10px]">
      {searchFieldLabel(searchField)}
    </Select.Trigger>
    <Select.Content>
      {#each SEARCH_FIELDS as f (f.value)}
        <Select.Item value={f.value} label={f.label}>{f.label}</Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>

  <div class="flex flex-1 items-center gap-1.5 px-2">
    <SearchIcon class="text-muted-foreground size-3 shrink-0" />
    <Input
      name="searchValue"
      type="text"
      placeholder="Search nodes..."
      value={search}
      oninput={(e) => onSearchChange(e.currentTarget.value)}
      class="h-auto flex-1 border-none bg-transparent p-0 text-[11px] shadow-none focus-visible:ring-0" />
    {#if search}
      <span class={cn("font-mono text-[9px]", matchCount > 0 ? "text-primary" : "text-amber-400")}>
        {matchCount} match{matchCount !== 1 ? "es" : ""}
      </span>
      <Button
        variant="ghost"
        size="icon"
        class="text-muted-foreground size-4"
        onclick={() => onSearchChange("")}>
        <XIcon class="size-3" />
      </Button>
    {/if}
  </div>
</div>
