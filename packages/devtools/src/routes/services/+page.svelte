<script lang="ts">
  import { ACCENT, MUTED } from "$lib/tokens";
  import type { SearchField } from "$lib/types";
  import { matchSearchService } from "$lib/utils";

  let { data } = $props();

  let search = $state("");
  let searchField = $state<SearchField>("any");

  const filteredIds: Set<string> | null = $derived(
    search.trim()
      ? new Set(
          data.services
            .filter((n) => matchSearchService(n, search, searchField))
            .map((n) => n.name),
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

  const statusColor: Record<string, string> = {
    healthy: "bg-emerald-400/15 text-emerald-400",
    degraded: "bg-amber-400/15 text-amber-400",
    failed: "bg-red-400/15 text-red-400",
  };

  function formatDuration(ms: number): string {
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
  }
</script>

{#if data.error}
  <div class="flex flex-1 items-center justify-center p-8 text-center">
    <div>
      <h2 class="text-text m-0 text-sm font-semibold">Unable to load services</h2>
      <p class="text-text2 mt-2 max-w-sm text-xs leading-relaxed">
        {data.error}
      </p>
    </div>
  </div>
{:else if data.services.length === 0}
  <div class="flex flex-1 items-center justify-center p-8 text-center">
    <p class="text-text2 text-xs">No services found.</p>
  </div>
{:else}
  <div class="flex min-h-0 flex-1 flex-col">
    <div
      class="border-b-border_hi bg-panel relative flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <div>
        <div class="mr-1 flex shrink-0 items-center gap-2">
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
              opacity={0.45} />
          </svg>
          <span class="text-text text-[13.5px] font-semibold tracking-tight"> SignalGraph </span>
          <span
            class="bg-accent/20 text-accent border-accent/35 rounded-[3px] border px-1.5 py-px font-['JetBrains_Mono'] text-[9px] tracking-[0.06em]">
            OTEL
          </span>
        </div>
      </div>
      <div
        class="border-border_hi absolute top-1/2 left-1/2 flex h-8 w-120 -translate-x-1/2 -translate-y-1/2 items-stretch overflow-hidden rounded-lg border bg-white/4">
        <select
          name="searchType"
          bind:value={searchField}
          class="border-r-border_hi bg-white[0.06] text-text2 max-w-22.5 min-w-20 shrink-0 cursor-pointer border-r border-none px-2.5 font-['JetBrains_Mono'] text-[10.5px] outline-none">
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
            stroke-linecap="round">
            <circle cx={11} cy={11} r={8} />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            name="searchValue"
            type="text"
            placeholder="Search nodes, message IDs, trace IDs..."
            bind:value={search}
            class="text-text flex-1 border-none bg-transparent text-[12.5px] outline-none" />
          {#if search}
            <span
              class={`font-['JetBrains_Mono'] text-[10px] ${matchCount > 0 ? "text-accent" : "text-amber-400"}`}>
              {matchCount} match{matchCount !== 1 ? "es" : ""}
            </span>
            <button
              onclick={() => (search = "")}
              class="text-muted shrink-0 border-none bg-none p-0 text-[18px] leading-none">
              ×
            </button>
          {/if}
        </div>
      </div>
    </div>
    <div class="flex min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
      <main class="w-full">
        <div class="border-border_hi bg-panel rounded-lg border">
          <table class="w-full border-separate border-spacing-0 text-left text-xs">
            <thead>
              <tr>
                <th
                  class="text-text2 text-[10.5]px rounded-tl-lg px-4 py-2.5 font-medium tracking-wide uppercase shadow-[0_1px_0_0_var(--color-border_hi)]">
                  Service
                </th>
                <th
                  class="text-text2 text-[10.5]px px-4 py-2.5 font-medium tracking-wide uppercase shadow-[0_1px_0_0_var(--color-border_hi)]">
                  Status
                </th>
                <th
                  class="text-text2 text-[10.5]px px-4 py-2.5 font-medium tracking-wide uppercase shadow-[0_1px_0_0_var(--color-border_hi)]">
                  Rate
                </th>
                <th
                  class="text-text2 text-[10.5]px px-4 py-2.5 font-medium tracking-wide uppercase shadow-[0_1px_0_0_var(--color-border_hi)]">
                  Error rate
                </th>
                <th
                  class="text-text2 text-[10.5]px rounded-tr-lg px-4 py-2.5 font-medium tracking-wide uppercase shadow-[0_1px_0_0_var(--color-border_hi)]">
                  P50 latency
                </th>
              </tr>
            </thead>
            <tbody>
              {#each data.services as service (service.name)}
                <tr class="transition-colors hover:bg-white/4">
                  <td class="border-border/40 border-b px-4 py-3">
                    <a
                      href={`/traces?service=${service.name}`}
                      class="text-accent focus-visible:ring-accent/50 font-['JetBrains_Mono'] hover:underline focus-visible:underline focus-visible:ring-1 focus-visible:outline-none">
                      {service.name}
                    </a>
                  </td>
                  <td class="border-border/40 border-b px-4 py-3">
                    <span
                      class={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium capitalize ${statusColor[service.status]}`}>
                      {service.status}
                    </span>
                  </td>
                  <td class="border-border/40 text-text2 border-b px-4 py-3">
                    {service.requestRate}
                  </td>
                  <td class="border-border/40 text-text2 border-b py-3 pr-4">
                    {service.errorRate}%
                  </td>
                  <td
                    class="border-border/40 text-text border-b px-4 py-3 font-['JetBrains_Mono'] tabular-nums">
                    {formatDuration(service.latencyP50Ms)}ms
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
