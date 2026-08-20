<script lang="ts">
  import type { InspTab } from "$lib/types";
  import type { GraphNode } from "$lib/domain/types";
  import { SC, ACCENT, BORDER, TEXT, TEXT2, MUTED } from "$lib/tokens";

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
      ? (node.attributes.find(
          (attribute) => attribute.key === "signalgraph.correlation.id",
        )?.value ?? "-")
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
  <div
    class="flex flex-col items-center justify-center h-full gap-3 text-muted p-6 text-center"
  >
    <svg
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={1.5}
      stroke-linecap="round"
    >
      <circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" />
    </svg>
    <p class="text-xs text-text2 max-w-48">
      Click any node in the graph to inspect its runtime data and span
      attributes.
    </p>
  </div>
{:else}
  <div class="insp-panel flex flex-col h-full">
    <!-- Node identity -->
    <div class="pt-3 px-3.5 pb-2.5 border-b border-b-border shrink-0">
      <div class="flex items-center gap-1.75 mb-1.75">
        <span
          class={`text-[7.5px] font-['JetBrains_Mono'] tracking-widest ${node.kind === "message" ? "text-msg_c bg-msg_c/10 border-msg_c/20" : "text-accent bg-accent/10 border-accent/20"} py-0.5 px-1.75 rounded-sm border`}
        >
          {node.kind === "message" ? "MESSAGE" : "HANDLER"}
        </span>
      </div>
      <h2 class="text-sm font-semibold text-text m-0 -tracking-widest">
        {node.label}
      </h2>
    </div>

    <!-- Tabs -->
    <div
      class="flex border-b border-b-border shrink-0 overflow-x-auto py-0 px-1 scrollbar-none"
    >
      {#each TABS as t (t.id)}
        <button
          onclick={() => onTabChange(t.id)}
          class={`flex items-center gap-1.25 py-1.75 px-2 text-xs font-medium font-[Inter] ${tab === t.id ? "text-accent" : "text-text2"} border-b-2 ${tab === t.id ? "border-b-accent" : "border-b-transparent"} cursor-pointer whitespace-nowrap -mb-px transition-colors`}
        >
          {t.label}
          {#if t.badge !== undefined}
            <span
              class=""
              style={`font-size:9px;background:${SC.error};color:#fff;border-radius:8px;padding:0 4px;line-height:14px`}
            >
              {t.badge}
            </span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- Tab body -->
    <div style="flex:1;overflow:auto;padding:12px 14px">
      <!-- ── Overview ── -->
      {#if tab === "overview"}
        <div style="display:flex;flex-direction:column;gap:10px">
          {#each overviewRows as row (row.label)}
            <div
              style={`display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid ${BORDER}`}
            >
              <span style={`font-size:11px;color:${TEXT2};flex-shrink:0`}
                >{row.label}</span
              >
              <span
                style={`font-size:11px;font-family:'JetBrains Mono', monospace;color:${TEXT};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:58%`}
                title={row.value}
              >
                {row.value}
              </span>
            </div>
          {/each}
        </div>
      {/if}

      <!-- ── Attributes ── -->
      {#if tab === "attributes"}
        <div>
          {#if node.attributes.length > 0}
            <div style="display:flex;flex-direction:column">
              {#each node.attributes as attribute, i (attribute.key)}
                {@const isTrace =
                  attribute.key.includes("trace_id") ||
                  attribute.key.includes("span_id")}
                {@const isErr =
                  attribute.key === "error" && attribute.value === "true"}
                <div
                  style={`display:grid;grid-template-columns:46% 54%;padding:5px 0;gap:6px;border-bottom:${i < node.attributes.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none"};font-size:11px;font-family:'JetBrains Mono', monospace`}
                >
                  <span
                    style="color:{MUTED};overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                  >
                    {formatAttributeKey(attribute.key)}
                  </span>
                  <span
                    style={`color:${isErr ? SC.error : isTrace ? ACCENT : TEXT};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`}
                    title={attribute.value}
                  >
                    {attribute.value}
                  </span>
                </div>
              {/each}
            </div>
          {:else}
            <p style={`font-size:12px;color:${TEXT2}`}>
              No span attributes recorded.
            </p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
