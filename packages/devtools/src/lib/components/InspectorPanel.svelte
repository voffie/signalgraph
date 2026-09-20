<script lang="ts">
  import { getAttribute } from "$lib/domain/attributes";
  import type { GraphNode } from "$lib/domain/types";
  import type { InspTab } from "$lib/types";
  import { capitalize, cn } from "$lib/utils";

  let {
    node,
    tab,
    onTabChange,
  }: {
    node: GraphNode | null;
    tab: InspTab;
    onTabChange: (t: InspTab) => void;
  } = $props();

  function formatAttributeKey(key: string) {
    return key
      .split(".")
      .slice(1)
      .map((word) => {
        if (word.includes("_")) word = word.split("_").join(" ");
        return capitalize(word);
      })
      .join(" ");
  }

  const isHnd = $derived(node?.kind === "handler");

  const TABS: Array<{ id: InspTab; label: string }> = $derived([
    { id: "overview", label: "Overview" },
    { id: "attributes", label: "Attributes" },
  ]);

  const traceId = $derived(node ? (node?.traceId ?? "-") : "-");

  const corrId = $derived(
    node ? (getAttribute(node.attributes, "signalgraph.correlation.id") ?? "-") : "-",
  );

  const overviewRows = $derived(
    node
      ? [
          { label: "Kind", value: isHnd ? "Handler (Service)" : "Event (Message)" },
          { label: "Trace ID", value: traceId },
          { label: "Correlation ID", value: corrId },
        ]
      : [],
  );
</script>

{#if !node}
  <div
    class="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
    <svg
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={1.5}
      stroke-linecap="round">
      <circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" />
    </svg>
    <p class="max-w-48 text-xs">
      Click any node in the graph to inspect its runtime data and span attributes.
    </p>
  </div>
{:else}
  <div class="insp-panel flex h-full flex-col">
    <div class="border-b-border shrink-0 border-b px-3.5 pt-3 pb-2.5">
      <div class="mb-1.75 flex items-center gap-1.75">
        <span
          class={cn(
            "rounded-sm border px-1.75 py-0.5 font-mono text-[7.5px] tracking-widest uppercase",
            node.kind === "message"
              ? "text-chart-1 bg-chart-1/10 border-chart-1/20"
              : "text-primary bg-primary/10 border-primary/20",
          )}>
          {node.kind}
        </span>
      </div>
      <h2 class="m-0 text-sm font-semibold">{node.label}</h2>
    </div>

    <div class="border-b-border flex shrink-0 scrollbar-none overflow-x-auto border-b px-1 py-0">
      {#each TABS as t (t.id)}
        <button
          onclick={() => onTabChange(t.id)}
          class={cn(
            "-mb-px flex cursor-pointer items-center gap-1.25 border-b-2 px-2 py-1.75 text-xs font-medium whitespace-nowrap transition-colors",
            tab === t.id ? "text-primary border-b-primary" : "border-b-transparent",
          )}>
          {t.label}
        </button>
      {/each}
    </div>

    <div class="flex-1 overflow-auto px-3.5 py-3">
      {#if tab === "overview"}
        <div class="flex flex-col gap-2.5">
          {#each overviewRows as row (row.label)}
            <div
              class="border-b-border flex items-center justify-between gap-2 border-b px-0 py-1.25">
              <span class="shrink-0 text-[11px]">{row.label}</span>
              <span
                class="text-muted-foreground max-w-[58%] overflow-hidden font-mono text-[11px] text-ellipsis whitespace-nowrap"
                title={row.value}>
                {row.value}
              </span>
            </div>
          {/each}
        </div>
      {/if}

      {#if tab === "attributes"}
        <div>
          {#if node.attributes.length > 0}
            <div class="flex flex-col">
              {#each node.attributes as attribute, i (attribute.key)}
                {@const isTrace =
                  attribute.key.includes("trace_id") || attribute.key.includes("span_id")}
                {@const isErr = attribute.key === "error" && attribute.value === "true"}
                <div
                  class={cn(
                    "grid grid-cols-[46%_54%] gap-1.5 px-0 py-1.25 font-mono text-[11px]",
                    i < node.attributes.length - 1 ? "border-b border-b-white/4" : "",
                  )}>
                  <span
                    class="text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                    {formatAttributeKey(attribute.key)}
                  </span>
                  <span
                    class={cn(
                      "overflow-hidden, text-ellipsis whitespace-nowrap",
                      isErr ? "text-destructive" : isTrace ? "text-primary" : "",
                    )}
                    title={attribute.value}>
                    {attribute.value}
                  </span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-xs">No span attributes recorded.</p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
