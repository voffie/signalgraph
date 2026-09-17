<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import type { TraceSummary } from "$lib/domain/types";
  import { cn } from "$lib/utils.js";
  import CheckIcon from "@lucide/svelte/icons/check";

  let { open, traces }: { open: boolean; traces: Array<TraceSummary> | null } = $props();

  let selectedIndex = $state(0);
  let listEl: HTMLDivElement | undefined = $state();

  let currentTraceId = $derived(page.url.searchParams.get("trace"));

  function selectTrace(traceId: string) {
    open = false;
    goto(`/?trace=${traceId}`);
  }

  function handleKeydown(e: KeyboardEvent) {
    e.preventDefault();
    if (traces === null || traces.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "j") {
      selectedIndex = Math.min(selectedIndex + 1, traces.length - 1);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === "Enter") {
      selectTrace(traces[selectedIndex].traceId);
    }
  }

  function formatTraceTime(startTime: number): string {
    return new Date(startTime).toLocaleTimeString();
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    onOpenAutoFocus={() => {
      listEl?.focus();
    }}
    class="flex max-w-md flex-col gap-4 p-5">
    <Dialog.Title class="text-sm font-semibold">Switch trace</Dialog.Title>

    {#if traces === null}
      <p class="text-muted-foreground text-sm">No traces found</p>
    {:else if traces.length === 0}
      <p class="text-muted-foreground text-sm">No recent traces found.</p>
    {:else}
      <div
        bind:this={listEl}
        role="listbox"
        tabindex="0"
        onkeydown={handleKeydown}
        class="flex flex-col gap-0.5 outline-none">
        {#each traces as trace, i (trace.traceId)}
          <button
            role="option"
            aria-selected={i === selectedIndex}
            onclick={() => selectTrace(trace.traceId)}
            class={cn(
              "flex items-center justify-between rounded-md border-l-2 px-3 py-2 text-left transition-colors",
              i === selectedIndex ? "border-l-primary bg-muted" : "border-l-transparent",
            )}>
            <span class="font-mono text-xs">{trace.traceId}</span>
            <span class="text-muted-foreground text-xs">
              {formatTraceTime(trace.startTime)} · {trace.durationMs}ms
            </span>
            {#if trace.traceId === currentTraceId}
              <CheckIcon class="text-primary size-3.5" />
            {/if}
          </button>
        {/each}
      </div>
      <p class="text-muted-foreground text-xs">↑↓/j k navigate · Enter select</p>
    {/if}
  </Dialog.Content>
</Dialog.Root>
