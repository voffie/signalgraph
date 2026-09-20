<script lang="ts">
  import { getAttribute } from "$lib/domain/attributes";
  import type { TraceSpan } from "$lib/domain/types";
  import { capitalize, cn, fmtMs } from "$lib/utils";

  let {
    spans,
    traceId,
    selectedSpanId,
    onSpanClick,
  }: {
    spans: Array<TraceSpan>;
    traceId: string;
    selectedSpanId: string | null;
    onSpanClick: (s: TraceSpan) => void;
  } = $props();

  const traceStart = $derived(
    spans.length > 0 ? Math.min(...spans.map((span) => span.startTime)) : 0,
  );
  const traceEnd = $derived(spans.length > 0 ? Math.max(...spans.map((span) => span.endTime)) : 0);
  const traceDuration = $derived(Math.max(traceEnd - traceStart, 1));

  function getSpanLabel(span: TraceSpan): string {
    if (span.name === "signalgraph.publish") {
      let messageName = getAttribute(span.attributes, "signalgraph.message.name") ?? span.name;

      messageName = messageName
        .trim()
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((text) => capitalize(text))
        .join("");

      return messageName ? messageName + " (Publish)" : span.name;
    }

    if (span.name === "signalgraph.consume" || span.name === "signalgraph.handler") {
      const consumerName = getAttribute(span.attributes, "signalgraph.consumer.name") ?? span.name;

      const suffix = span.name === "signalgraph.consume" ? " (Consume)" : " (Handler)";
      return consumerName ? capitalize(consumerName) + suffix : span.name;
    }

    return span.name;
  }

  function getSpanPosition(span: TraceSpan): { left: number; width: number } {
    const left = Math.min(Math.max(((span.startTime - traceStart) / traceDuration) * 100, 0), 100);
    const naturalWidth = ((span.endTime - span.startTime) / traceDuration) * 100;

    return { left, width: Math.min(Math.max(naturalWidth, 0.25), 100 - left) };
  }

  function formatTimelineOffset(ms: number): string {
    if (ms === 0) return "0ms";
    if (ms < 10) return `${ms.toFixed(1)}ms`;
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
</script>

<div class="bg-secondary px-5 pt-2.5 pb-3.5">
  <div class="mb-2.5 flex items-center justify-between">
    <span class="font-mono text-[10px] tracking-[0.06em]">TRACE · {traceId}</span>
    <span class="text-muted-foreground font-mono text-[10px]">{spans.length} spans </span>
  </div>

  {#if spans.length === 0}
    <div class="text-muted-foreground px-0 py-2 font-mono text-[11px]">No spans recorded.</div>
  {:else}
    <div class="flex flex-col gap-1">
      {#each spans as span (span.spanId)}
        {@const position = getSpanPosition(span)}
        {@const sel = selectedSpanId === span.spanId}
        {@const label = getSpanLabel(span)}
        <div
          onclick={() => onSpanClick(span)}
          onkeydown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSpanClick(span);
            }
          }}
          role="button"
          tabindex="0"
          title={`${label} — ${fmtMs(span.endTime - span.startTime)}`}
          class="flex cursor-pointer items-center gap-2.5">
          <span
            class={cn(
              "w-32.5 shrink-0 overflow-hidden font-mono text-[10px] text-ellipsis whitespace-nowrap",
              sel ? "font-semibold" : "font-normal",
            )}
            style={`transition:color 0.14s, font-weight 0.14s`}>
            {label}
          </span>

          <div class="relative h-5 min-w-0 flex-1">
            <div class="absolute inset-x-0 inset-y-0.5 rounded-[3px] bg-white/2"></div>
            <div
              class={cn(
                "absolute top-0.5 bottom-0.5 box-border flex items-center overflow-hidden rounded-[3px] border pl-1.25 transition-colors",
                sel ? "bg-primary/25 border-primary/80" : "bg-primary/10 border-primary/35",
              )}
              style={`left:${position.left}%;width:${position.width}%`}>
              <span
                class={cn(
                  "font-mono text-[9px] whitespace-nowrap",
                  sel ? "text-primary" : "text-primary/60",
                )}>
                {fmtMs(span.endTime - span.startTime)}
              </span>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <div class="relative mt-1.5 ml-35 flex h-3.5">
      {#each [0, 0.25, 0.5, 0.75, 1] as pct (pct)}
        <div
          class="text-muted-foreground absolute -translate-x-1/2 font-mono text-[9px]"
          style={`left:${pct * 100}%;transform:translateX(-50%)`}>
          {formatTimelineOffset(pct * traceDuration)}
        </div>
      {/each}
    </div>
  {/if}
</div>
