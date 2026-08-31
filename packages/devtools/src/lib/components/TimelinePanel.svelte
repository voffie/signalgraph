<script lang="ts">
  import type { TraceSpan } from "$lib/domain/types";
  import { fmtMs } from "$lib/utils";

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

  const traceEnd = $derived(
    spans.length > 0 ? Math.max(...spans.map((span) => span.endTime)) : 0,
  );

  const traceDuration = $derived(Math.max(traceEnd - traceStart, 1));

  function getSpanLabel(span: TraceSpan): string {
    if (span.name === "signalgraph.publish") {
      let messageName =
        span.attributes.find(
          (attribute) => attribute.key === "signalgraph.message.name",
        )?.value ?? span.name;

      messageName = messageName
        .trim()
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((text) => text.charAt(0).toUpperCase() + text.slice(1))
        .join("");

      return messageName ? messageName + " (Publish)" : span.name;
    }

    if (
      span.name === "signalgraph.consume" ||
      span.name === "signalgraph.handler"
    ) {
      const consumerName =
        span.attributes.find(
          (attribute) => attribute.key === "signalgraph.consumer.name",
        )?.value ?? span.name;

      if (span.name === "signalgraph.consume") {
        return consumerName
          ? consumerName.charAt(0).toUpperCase() +
              consumerName.slice(1) +
              " (Consume)"
          : span.name;
      } else {
        return consumerName
          ? consumerName.charAt(0).toUpperCase() +
              consumerName.slice(1) +
              " (Handler)"
          : span.name;
      }
    }

    return span.name;
  }

  function getSpanPosition(span: TraceSpan): {
    left: number;
    width: number;
  } {
    const left = Math.min(
      Math.max(((span.startTime - traceStart) / traceDuration) * 100, 0),
      100,
    );

    const naturalWidth =
      ((span.endTime - span.startTime) / traceDuration) * 100;

    return {
      left,
      width: Math.min(Math.max(naturalWidth, 0.25), 100 - left),
    };
  }

  function formatTimelineOffset(ms: number): string {
    if (ms === 0) {
      return "0ms";
    }

    if (ms < 10) {
      return `${ms.toFixed(1)}ms`;
    }

    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    }

    return `${(ms / 1000).toFixed(1)}s`;
  }
</script>

<div class="bg-[#07070d] pt-2.5 px-5 pb-3.5">
  <div class="flex items-center justify-between mb-2.5">
    <span
      class="text-[10px] font-['JetBrains_Mono'] text-text2 tracking-[0.06em]"
    >
      TRACE · {traceId}
    </span>

    <span class="text-[10px] font-['JetBrains_Mono'] text-muted">
      {spans.length} spans
    </span>
  </div>

  {#if spans.length === 0}
    <div class="text-[11px] font-['JetBrains_Mono'] text-muted py-2 px-0">
      No spans recorded.
    </div>
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
          class="flex items-center gap-2.5 cursor-pointer"
        >
          <span
            class={`text-[10px] font-['JetBrains_Mono'] w-32.5 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap ${sel ? "text-text font-semibold" : "text-text2 font-normal"}`}
            style={`transition:color 0.14s, font-weight 0.14s`}
          >
            {label}
          </span>

          <div class="flex-1 relative h-5 min-w-0">
            <div
              class="absolute inset-y-0.5 inset-x-0 bg-white/2 rounded-[3px]"
            ></div>

            <div
              class={`absolute top-0.5 bottom-0.5 border ${sel ? "bg-accent/25 border-accent/80" : "bg-accent/10 border-accent/35"} rounded-[3px] overflow-hidden flex items-center pl-1.25 box-border transition-colors`}
              style={`left:${position.left}%;width:${position.width}%`}
            >
              <span
                class={`text-[9px] font-['JetBrains_Mono'], ${sel ? "text-accent" : "text-accent/60"} whitespace-nowrap`}
              >
                {fmtMs(span.endTime - span.startTime)}
              </span>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Time axis -->
    <div class="flex mt-1.5 ml-35 relative h-3.5">
      {#each [0, 0.25, 0.5, 0.75, 1] as pct (pct)}
        <div
          class={`absolute text-[9px] font-['JetBrains_Mono'] text-muted -translate-x-1/2`}
          style={`left:${pct * 100}%;transform:translateX(-50%)`}
        >
          {formatTimelineOffset(pct * traceDuration)}
        </div>
      {/each}
    </div>
  {/if}
</div>
