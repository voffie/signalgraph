<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import type { TraceSummary } from "$lib/domain/types";
  import { cn } from "$lib/utils.js";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import { tick } from "svelte";

  import { moveListIndex } from "../listNavigation";

  let {
    open,
    selectedTraceId,
    onOpenChange,
  }: {
    open: boolean;
    selectedTraceId: string | null;
    onOpenChange: (open: boolean) => void;
  } = $props();

  let selectedIndex = $state(0);
  let listEl = $state<HTMLDivElement | null>(null);
  let traces = $state<Array<TraceSummary>>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function loadTraces() {
    loading = true;
    error = null;
    traces = [];
    selectedIndex = 0;

    try {
      const response = await fetch("/api/traces");

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Unable to load traces.");
      }

      const body = (await response.json()) as { traces: Array<TraceSummary> };
      traces = body.traces;

      await tick();
      listEl?.focus();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Unable to load traces.";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (open) {
      void loadTraces();
    }
  });

  function selectTrace(traceId: string) {
    onOpenChange(false);
    goto(`/?trace=${traceId}`);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (traces === null || traces.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      selectedIndex = moveListIndex(selectedIndex, "down", traces.length);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      selectedIndex = moveListIndex(selectedIndex, "up", traces.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectTrace(traces[selectedIndex].traceId);
    }
  }

  function formatTraceTime(startTime: number): string {
    return new Date(startTime).toLocaleTimeString();
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content
    onOpenAutoFocus={(event) => event.preventDefault()}
    class="flex max-w-md flex-col gap-4 p-5">
    <Dialog.Title class="text-sm font-semibold">Switch trace</Dialog.Title>

    {#if loading}
      <div class="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircleIcon class="size-4 animate-spin" />
        Loading recent traces...
      </div>
    {:else if error}
      <div class="flex flex-col gap-3">
        <div class="text-destructive flex items-center gap-2 text-sm">
          <CircleAlertIcon class="size-4" />
          {error}
        </div>

        <Button variant="outline" size="sm" class="w-fit gap-2" onclick={loadTraces}>
          <RefreshCwIcon class="size-3.5" />
          Retry
        </Button>
      </div>
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
            {#if trace.traceId === selectedTraceId}
              <CheckIcon class="text-primary size-3.5" />
            {/if}
          </button>
        {/each}
      </div>
      <p class="text-muted-foreground text-xs">↑↓/j k navigate · Enter select</p>
    {/if}
  </Dialog.Content>
</Dialog.Root>
