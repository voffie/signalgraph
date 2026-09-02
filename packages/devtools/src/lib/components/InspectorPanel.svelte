<script lang="ts">
  import type { GraphNode } from "$lib/domain/types";
  import type { InspTab } from "$lib/types";

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
        if (word.includes("_")) {
          word = word.split("_").join(" ");
        }

        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  }

  const isHnd = $derived(node?.kind === "handler");

  const TABS: Array<{ id: InspTab; label: string; badge?: number }> = $derived([
    { id: "overview", label: "Overview" },
    { id: "attributes", label: "Attributes" },
  ]);

  const traceId = $derived(node ? (node?.traceId ?? "-") : "-");

  const corrId = $derived(
    node
      ? (node.attributes.find((attribute) => attribute.key === "signalgraph.correlation.id")
          ?.value ?? "-")
      : "-",
  );

  const overviewRows = $derived(
    node
      ? [
          {
            label: "Kind",
            value: isHnd ? "Handler (Service)" : "Event (Message)",
          },
          { label: "Trace ID", value: traceId },
          { label: "Correlation ID", value: corrId },
        ]
      : [],
  );
</script>

{#if !node}
  <div class="text-muted flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
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
    <p class="text-text2 max-w-48 text-xs">
      Click any node in the graph to inspect its runtime data and span attributes.
    </p>
  </div>
{:else}
  <div class="insp-panel flex h-full flex-col">
    <div class="border-b-border shrink-0 border-b px-3.5 pt-3 pb-2.5">
      <div class="mb-1.75 flex items-center gap-1.75">
        <span
          class={`font-['JetBrains_Mono'] text-[7.5px] tracking-widest ${node.kind === "message" ? "text-msg_c bg-msg_c/10 border-msg_c/20" : "text-accent bg-accent/10 border-accent/20"} rounded-sm border px-1.75 py-0.5`}>
          {node.kind === "message" ? "MESSAGE" : "HANDLER"}
        </span>
      </div>
      <h2 class="text-text m-0 text-sm font-semibold -tracking-widest">
        {node.label}
      </h2>
    </div>

    <div class="border-b-border flex shrink-0 scrollbar-none overflow-x-auto border-b px-1 py-0">
      {#each TABS as t (t.id)}
        <button
          onclick={() => onTabChange(t.id)}
          class={`flex items-center gap-1.25 px-2 py-1.75 font-[Inter] text-xs font-medium ${tab === t.id ? "text-accent" : "text-text2"} border-b-2 ${tab === t.id ? "border-b-accent" : "border-b-transparent"} -mb-px cursor-pointer whitespace-nowrap transition-colors`}>
          {t.label}
          {#if t.badge !== undefined}
            <span class="rounded-lg bg-red-500 px-1 py-0 text-[9px] leading-3.5 text-white">
              {t.badge}
            </span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="flex-1 overflow-auto px-3.5 py-3">
      {#if tab === "overview"}
        <div class="flex flex-col gap-2.5">
          {#each overviewRows as row (row.label)}
            <div
              class="border-b-border flex items-center justify-between gap-2 border-b px-0 py-1.25">
              <span class="text-text2 shrink-0 text-[11px]">{row.label}</span>
              <span
                class="text-text max-w-[58%] overflow-hidden font-['JetBrains_Mono'] text-[11px] text-ellipsis whitespace-nowrap"
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
                  class={`grid grid-cols-[46%_54%] gap-1.5 px-0 py-1.25 ${i < node.attributes.length - 1 ? "border-b border-b-white/4" : ""} font-['JetBrains_Mono'] text-[11px]`}>
                  <span class="text-muted overflow-hidden text-ellipsis whitespace-nowrap">
                    {formatAttributeKey(attribute.key)}
                  </span>
                  <span
                    class={`${isErr ? "text-red-500" : isTrace ? "text-accent" : "text-text"} overflow-hidden text-ellipsis whitespace-nowrap`}
                    title={attribute.value}>
                    {attribute.value}
                  </span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-text2 text-xs">No span attributes recorded.</p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
