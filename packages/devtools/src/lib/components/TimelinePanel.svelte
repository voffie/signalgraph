<script lang="ts">
  import type { TraceSpan } from "$lib/domain/types";
  import { TEXT, TEXT2, MUTED } from "$lib/tokens";
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

<div style="background:#07070d;padding:10px 20px 14px">
  <div
    style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"
  >
    <span
      style={`font-size:10px;font-family:'JetBrains Mono', monospace;color:${TEXT2};letter-spacing:0.06em`}
    >
      TRACE · {traceId}
    </span>

    <span
      style={`font-size:10px;font-family:'JetBrains Mono', monospace;color:${MUTED}`}
    >
      {spans.length} spans
    </span>
  </div>

  {#if spans.length === 0}
    <div
      style={`font-size:11px;font-family:'JetBrains Mono', monospace;color:${MUTED};padding:8px 0`}
    >
      No spans recorded.
    </div>
  {:else}
    <div style="display:flex;flex-direction:column;gap:4px">
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
          style="display:flex;align-items:center;gap:10px;cursor:pointer"
        >
          <span
            style={`font-size:10px;font-family:'JetBrains Mono', monospace;width:130px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${sel ? TEXT : TEXT2};font-weight:${sel ? 600 : 400};transition:color 0.14s, font-weight 0.14s`}
          >
            {label}
          </span>

          <div style="flex:1;position:relative;height:20px;min-width:0">
            <div
              style="position:absolute;inset:2px 0;background:rgba(255, 255, 255,0.018);border-radius:3px"
            ></div>

            <div
              style={`position:absolute;top:2px;bottom:2px;left:${position.left}%;width:${position.width}%;background:${sel ? "rgba(124,111,224,0.25)" : "rgba(124,111,224,0.10)"};border:1px solid ${sel ? "rgba(124,111,224,0.8)" : "rgba(124,111,224,0.35)"};border-radius:3px;overflow:hidden;display:flex;align-items:center;padding-left:5px;box-sizing:border-box;transition:background 0.14s, border-color 0.14s`}
            >
              <span
                style={`font-size:9px;font-family:'JetBrains Mono', monospace;color:${sel ? "#7c6fe0" : "rgba(124,111,224,0.6)"};white-space:nowrap`}
              >
                {fmtMs(span.endTime - span.startTime)}
              </span>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Time axis -->
    <div
      style="display:flex;margin-top:6px;margin-left:140px;position:relative;height:14px"
    >
      {#each [0, 0.25, 0.5, 0.75, 1] as pct (pct)}
        <div
          style={`position:absolute;left:${pct * 100}%;font-size:9px;font-family:'JetBrains Mono', monospace;color:${MUTED};transform:translateX(-50%)`}
        >
          {formatTimelineOffset(pct * traceDuration)}
        </div>
      {/each}
    </div>
  {/if}
</div>
