<script lang="ts">
  import { ACCENT, MUTED } from "$lib/tokens";
  import type { SearchField } from "$lib/types";
  import { matchSearchTrace } from "$lib/utils";

  let { data } = $props();

  let search = $state("");
  let searchField = $state<SearchField>("any");

  const filteredIds: Set<string> | null = $derived(
    search.trim()
      ? new Set(
          data.traces
            .filter((n) => matchSearchTrace(n, search, searchField))
            .map((n) => n.traceId),
        )
      : null,
  );

  const matchCount = $derived(filteredIds?.size ?? 0);

  const searchFields: Array<{ value: SearchField; label: string }> = [
    { value: "any", label: "Any" },
    { value: "name", label: "Name" },
    { value: "msg-id", label: "Msg ID" },
    { value: "corr-id", label: "Corr ID" },
    { value: "trace-id", label: "Trace ID" },
    { value: "service", label: "Service" },
  ];

  function formatDuration(ms: number): string {
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
  }

  function formatTime(ms: number): string {
    return new Date(ms).toLocaleTimeString();
  }
</script>

{#if data.error}
  <div class="flex flex-1 items-center justify-center p-8 text-center">
    <div>
      <h2 class="m-0 text-sm font-semibold text-text">Unable to load traces</h2>
      <p class="mt-2 max-w-sm text-xs leading-relaxed text-text2">
        {data.error}
      </p>
    </div>
  </div>
{:else if data.traces.length === 0}
  <div class="flex flex-1 items-center justify-center p-8 text-center">
    <p class="text-xs text-text2">No traces found.</p>
  </div>
{:else}
  <div class="flex min-h-0 flex-1 flex-col">
    <div
      class="relative flex h-11 shrink-0 items-center gap-2 border-b border-b-border_hi bg-panel px-3"
    >
      <div>
        <div class="flex items-center gap-2 shrink-0 mr-1">
          <svg width={18} height={18} viewBox="0 0 20 20" fill="none">
            <circle cx={10} cy={10} r={2.8} fill={ACCENT} />
            <circle cx={3} cy={5} r={1.6} fill={ACCENT} opacity={0.5} />
            <circle cx={17} cy={5} r={1.6} fill={ACCENT} opacity={0.5} />
            <circle cx={3} cy={15} r={1.6} fill={ACCENT} opacity={0.5} />
            <circle cx={17} cy={15} r={1.6} fill={ACCENT} opacity={0.5} />
            <path
              d="M4.4 5.7 7.6 8.4M12.4 8.4 15.6 5.7M4.4 14.3 7.6 11.6M12.4 11.6 15.6 14.3"
              stroke={ACCENT}
              stroke-width={1}
              opacity={0.45}
            />
          </svg>
          <span class="text-[13.5px] font-semibold tracking-tight text-text">
            SignalGraph
          </span>
          <span
            class="text-[9px] font-['JetBrains_Mono'] bg-accent/20 text-accent py-px px-1.5 rounded-[3px] tracking-[0.06em] border border-accent/35"
          >
            OTEL
          </span>
        </div>
      </div>
      <div
        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-8 w-120 items-stretch overflow-hidden rounded-lg border border-border_hi bg-white/4"
      >
        <select
          name="searchType"
          bind:value={searchField}
          class="min-w-20 max-w-22.5 shrink-0 cursor-pointer border-none border-r border-r-border_hi bg-white[0.06] px-2.5 font-['JetBrains_Mono'] text-[10.5px] text-text2 outline-none"
        >
          {#each searchFields as f (f.value)}
            <option value={f.value}>{f.label}</option>
          {/each}
        </select>
        <div class="flex flex-1 items-center gap-1.75 px-2.5">
          <svg
            width={13}
            height={13}
            viewBox="0 0 24 24"
            fill="none"
            stroke={MUTED}
            stroke-width={2}
            stroke-linecap="round"
          >
            <circle cx={11} cy={11} r={8} />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            name="searchValue"
            type="text"
            placeholder="Search nodes, message IDs, trace IDs..."
            bind:value={search}
            class="flex-1 border-none bg-transparent text-[12.5px] text-text outline-none"
          />
          {#if search}
            <span
              class={`font-['JetBrains_Mono'] text-[10px] ${matchCount > 0 ? "text-accent" : "text-amber-400"}`}
            >
              {matchCount} match{matchCount !== 1 ? "es" : ""}
            </span>
            <button
              onclick={() => (search = "")}
              class="shrink-0 border-none bg-none p-0 text-[18px] leading-none text-muted"
            >
              ×
            </button>
          {/if}
        </div>
      </div>
    </div>
    <div class="flex min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
      <main class="w-full">
        <div class="rounded-lg border border-border_hi bg-panel">
          <table
            class="w-full border-separate border-spacing-0 text-left text-xs"
          >
            <thead>
              <tr>
                <th
                  class="bg-panel py-2.5 px-4 font-medium text-text2 uppercase tracking-wide text-[10.5px] rounded-tl-lg shadow-[0_1px_0_0_var(--color-border_hi)]"
                  >Trace ID</th
                >
                <th
                  class="bg-panel py-2.5 px-4 font-medium text-text2 uppercase tracking-wide text-[10.5px] shadow-[0_1px_0_0_var(--color-border_hi)]"
                  >Root service</th
                >
                <th
                  class="bg-panel py-2.5 px-4 font-medium text-text2 uppercase tracking-wide text-[10.5px] shadow-[0_1px_0_0_var(--color-border_hi)]"
                  >Operation</th
                >
                <th
                  class="bg-panel py-2.5 px-4 font-medium text-text2 uppercase tracking-wide text-[10.5px] shadow-[0_1px_0_0_var(--color-border_hi)]"
                  >Duration</th
                >
                <th
                  class="bg-panel py-2.5 px-4 font-medium text-text2 uppercase tracking-wide text-[10.5px] shadow-[0_1px_0_0_var(--color-border_hi)]"
                  >Started</th
                >
                <th
                  class="bg-panel py-2.5 px-4 font-medium text-text2 uppercase tracking-wide text-[10.5px] rounded-tr-lg shadow-[0_1px_0_0_var(--color-border_hi)]"
                  >Status</th
                >
              </tr>
            </thead>
            <tbody>
              {#each data.traces as trace (trace.traceId)}
                <tr class="transition-colors hover:bg-white/4">
                  <td class="py-3 px-4 border-b border-border/40">
                    <a
                      href={`/graph?trace=${trace.traceId}`}
                      class="font-['JetBrains_Mono'] text-accent hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
                    >
                      {trace.traceId.slice(0, 8)}
                    </a>
                  </td>
                  <td
                    class="py-3 px-4 border-b border-border/40 font-medium text-text truncate max-w-50"
                    >{trace.rootService}</td
                  >
                  <td
                    class="py-3 px-4 border-b border-border/40 text-text2 truncate max-w-50"
                    >{trace.rootOperation}</td
                  >
                  <td
                    class="py-2 px-4 border-b border-border/40 font-['JetBrains_Mono'] tabular-nums text-text"
                  >
                    {formatDuration(trace.durationMs)}
                  </td>
                  <td class="py-3 px-4 border-b border-border/40 text-text2">
                    {formatTime(trace.startTime)}
                  </td>
                  <td class="py-3 px-4 border-b border-border/40">
                    <span
                      class={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] capitalize font-medium ${
                        trace.status === "error"
                          ? "bg-red-400/15 text-red-400"
                          : "bg-emerald-400/15 text-emerald-400"
                      }`}
                    >
                      {trace.status}
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  </div>
{/if}
