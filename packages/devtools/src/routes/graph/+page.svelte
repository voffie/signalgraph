<script lang="ts">
  import type { InspTab, SearchField } from "$lib/types";
  import type { TraceSpan } from "$lib/domain/types";
  import { ACCENT, MSG_C, MUTED } from "$lib/tokens";
  import { buildNmap, matchSearch } from "$lib/utils";
  import EdgeEl from "$lib/components/EdgeEl.svelte";
  import NodeEl from "$lib/components/NodeEl.svelte";
  import InspectorPanel from "$lib/components/InspectorPanel.svelte";
  import TimelinePanel from "$lib/components/TimelinePanel.svelte";
  import { buildGraph } from "$lib/domain/graph";
  import {
    NODE_HEIGHT,
    NODE_WIDTH,
    positionGraphNodes,
  } from "$lib/domain/layout";
  import { invalidate } from "$app/navigation";
  import { tick } from "svelte";

  let { data } = $props();

  const POLL_INTERVAL_MS = 15_100;
  $effect(() => {
    const timer = setInterval(() => invalidate("app:trace"), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  });

  let selectedId = $state<string | null>(null);
  let selectedSpanId = $state<string | null>(null);
  let hoveredEdgeId = $state<string | null>(null);
  let hoveredNodeId = $state<string | null>(null);
  let search = $state("");
  let searchField = $state<SearchField>("any");
  let timelineOpen = $state(true);
  let inspCollapsed = $state(false);
  let inspTab = $state<InspTab>("overview");
  let transform = $state({ x: 20, y: 55, scale: 0.76 });
  let panning = $state(false);

  let panRef: { x: number; y: number; tx: number; ty: number } = {
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
  };
  let svgEl: SVGSVGElement | undefined = $state();
  let canvasEl: HTMLElement | undefined = $state();

  const graph = $derived(data.trace ? buildGraph(data.trace) : null);
  const positionedNodes = $derived(graph ? positionGraphNodes(graph) : []);
  const nmap = $derived(buildNmap(positionedNodes));
  const selected = $derived(selectedId ? (nmap[selectedId] ?? null) : null);

  const filteredIds: Set<string> | null = $derived(
    search.trim()
      ? new Set(
          positionedNodes
            .filter((n) => matchSearch(n, search, searchField))
            .map((n) => n.id),
        )
      : null,
  );

  const matchCount = $derived(filteredIds?.size ?? 0);
  const hasGraphNodes = $derived(positionedNodes.length > 0);

  const searchFields: Array<{ value: SearchField; label: string }> = [
    { value: "any", label: "Any" },
    { value: "name", label: "Name" },
    { value: "msg-id", label: "Msg ID" },
    { value: "corr-id", label: "Corr ID" },
    { value: "trace-id", label: "Trace ID" },
    { value: "service", label: "Service" },
  ];

  $effect(() => {
    if (hasGraphNodes) {
      tick().then(handleFitView);
    }
  });

  $effect(() => {
    const el = svgEl;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      transform = {
        ...transform,
        scale: Math.max(0.2, Math.min(3, transform.scale * factor)),
      };
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  });

  function handleFitView() {
    const canvas = canvasEl;
    if (!canvas || positionedNodes.length === 0) return;

    const { width, height } = canvas.getBoundingClientRect();
    const padding = 80;

    const minX = Math.min(...positionedNodes.map((node) => node.x));
    const minY = Math.min(...positionedNodes.map((node) => node.y));
    const maxX = Math.max(
      ...positionedNodes.map((node) => node.x + NODE_WIDTH),
    );
    const maxY = Math.max(
      ...positionedNodes.map((node) => node.y + NODE_HEIGHT),
    );

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;

    const scale = Math.min(
      (width - padding * 2) / graphWidth,
      (height - padding * 2) / graphHeight,
      1.5,
    );

    transform = {
      x: (width - graphWidth * scale) / 2 - minX * scale,
      y: (height - graphHeight * scale) / 2 - minY * scale,
      scale,
    };
  }

  function onPointerDown(e: PointerEvent) {
    if ((e.target as Element).closest(".graph-node")) return;
    panning = true;
    panRef = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!panning) return;
    transform = {
      ...transform,
      x: panRef.tx + (e.clientX - panRef.x),
      y: panRef.ty + (e.clientY - panRef.y),
    };
  }

  function onPointerUp() {
    panning = false;
  }

  function getSpanAttribute(span: TraceSpan, key: string): string | undefined {
    return span.attributes.find((attribute) => attribute.key === key)?.value;
  }

  function getNodeIdForSpan(span: TraceSpan): string | null {
    if (span.name === "signalgraph.publish") {
      return getSpanAttribute(span, "signalgraph.message.id") ?? null;
    }

    if (
      span.name === "signalgraph.consume" ||
      span.name === "signalgraph.handler"
    ) {
      return getSpanAttribute(span, "signalgraph.consumer.name") ?? null;
    }

    return null;
  }

  function getPrimarySpanForNode(nodeId: string): TraceSpan | null {
    if (!graph) {
      return null;
    }

    const node = nmap[nodeId];

    if (!node) {
      return null;
    }

    const primarySpanName =
      node.kind === "message" ? "signalgraph.publish" : "signalgraph.handler";

    return (
      graph.traceSpans.find(
        (span) =>
          span.name === primarySpanName && getNodeIdForSpan(span) === nodeId,
      ) ?? null
    );
  }

  function handleSpanClick(span: TraceSpan) {
    selectedSpanId = span.spanId;
    selectedId = getNodeIdForSpan(span);
    inspTab = "overview";
    inspCollapsed = false;
  }

  function handleNodeClick(nodeId: string) {
    const nextSelectedId = selectedId === nodeId ? null : nodeId;

    selectedId = nextSelectedId;
    selectedSpanId = nextSelectedId
      ? (getPrimarySpanForNode(nextSelectedId)?.spanId ?? null)
      : null;

    if (nextSelectedId) {
      inspTab = "overview";
      inspCollapsed = false;
    }
  }

  const zoomButtons = [
    {
      l: "+",
      tip: "Zoom in",
      fn: () => {
        transform = {
          ...transform,
          scale: Math.min(3, transform.scale * 1.2),
        };
      },
    },
    {
      l: "−",
      tip: "Zoom out",
      fn: () => {
        transform = {
          ...transform,
          scale: Math.max(0.2, transform.scale * 0.8),
        };
      },
    },
    { l: "⊡", tip: "Fit view", fn: handleFitView },
  ];
</script>

{#if data.error}
  <div class="flex flex-1 items-center justify-center p-8 text-center">
    <div>
      <h2 class="m-0 text-sm font-semibold text-text">Unable to load trace</h2>
      <p class="mt-2 max-w-sm text-xs leading-relaxed text-text2">
        {data.error}
      </p>
    </div>
  </div>
{:else if !graph}
  <div class="flex flex-1 items-center justify-center p-8 text-center">
    <p class="text-xs text-text2">No data source configured yet.</p>
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
    <div class="flex min-h-0 flex-1">
      <main
        bind:this={canvasEl}
        class="relative min-w-0 flex-1 overflow-hidden bg-surface"
      >
        {#if hasGraphNodes}
          <div class="absolute left-3 top-3 z-10 flex items-center gap-1">
            {#each zoomButtons as b (b.l)}
              <button
                onclick={b.fn}
                title={b.tip}
                class="flex size-7 items-center justify-center rounded-md border border-border_hi bg-panel text-[14px] text-text2"
              >
                {b.l}
              </button>
            {/each}
            <span class="ml-1 font-['JetBrains_Mono'] text-[10px] text-muted">
              {Math.round(transform.scale * 100)}%
            </span>
          </div>

          <div
            class="absolute bottom-3 left-3 z-10 flex items-center gap-3.5 rounded-lg border border-border_hi bg-panel/94 px-3.5 py-1.75 backdrop-blur-md"
          >
            <span
              class="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] text-text2"
            >
              <span class="inline-block size-2 rotate-45 bg-msg_c"></span>
              Message
            </span>
            <span
              class="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] text-text2"
            >
              <span class="font-['JetBrains_Mono']text-[10px] text-accent">
                {"{ }"}
              </span>
              Handler
            </span>
          </div>

          {#if inspCollapsed}
            <button
              onclick={() => (inspCollapsed = false)}
              title="Open Inspector"
              class="absolute right-0 top-[50%] z-10 flex h-13 w-5 translate-y-[-50%] items-center justify-center rounded-bl-[7px] rounded-tl-[7px] border border-r-0 border-border_hi bg-panel p-0 text-text2"
            >
              <svg width={9} height={9} viewBox="0 0 10 10">
                <path
                  d="M7 2L3 5l4 3"
                  fill="none"
                  stroke="currentColor"
                  stroke-width={1.5}
                  stroke-linecap="round"
                />
              </svg>
            </button>
          {/if}

          <svg
            bind:this={svgEl}
            class={`block size-full select-none ${panning ? "cursor-grabbing" : "cursor-grab"}`}
            onpointerdown={onPointerDown}
            onpointermove={onPointerMove}
            onpointerup={onPointerUp}
            role="application"
            aria-label="Trace graph canvas — drag to pan, scroll to zoom"
          >
            <defs>
              <pattern
                id="dotgrid"
                x={0}
                y={0}
                width={28}
                height={28}
                patternUnits="userSpaceOnUse"
              >
                <circle
                  cx={0.5}
                  cy={0.5}
                  r={0.6}
                  fill="rgba(255,255,255,0.07)"
                />
              </pattern>
              <filter
                id="glow-evt"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur
                  in="SourceAlpha"
                  stdDeviation="8"
                  result="blur"
                />
                <feFlood
                  flood-color={MSG_C}
                  flood-opacity="0.5"
                  result="color"
                />
                <feComposite
                  in="color"
                  in2="blur"
                  operator="in"
                  result="glow"
                />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter
                id="glow-hnd"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur
                  in="SourceAlpha"
                  stdDeviation="8"
                  result="blur"
                />
                <feFlood
                  flood-color={ACCENT}
                  flood-opacity="0.5"
                  result="color"
                />
                <feComposite
                  in="color"
                  in2="blur"
                  operator="in"
                  result="glow"
                />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect width="100%" height="100%" fill="url(#dotgrid)" />

            <g
              transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}
            >
              {#each graph.edges as edge (edge.id)}
                <EdgeEl
                  {edge}
                  {nmap}
                  hovered={hoveredEdgeId === edge.id}
                  onEnter={() => (hoveredEdgeId = edge.id)}
                  onLeave={() => (hoveredEdgeId = null)}
                />
              {/each}

              {#each positionedNodes as node (node.id)}
                <NodeEl
                  {node}
                  selected={selectedId === node.id}
                  dimmed={filteredIds !== null && !filteredIds.has(node.id)}
                  hovered={hoveredNodeId === node.id}
                  onClick={() => handleNodeClick(node.id)}
                  onEnter={() => (hoveredNodeId = node.id)}
                  onLeave={() => (hoveredNodeId = null)}
                />
              {/each}
            </g>
          </svg>
        {:else}
          <div
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center"
          >
            <div
              class="flex size-10 items-center justify-center rounded-full border border-border_hi bg-panel font-mono text-accent"
            >
              ∿
            </div>
            <div>
              <h2 class="m-0 text-sm font-semibold text-text">
                No SignalGraph spans found
              </h2>
              <p class="mb-0 mt-2 max-w-sm text-xs leading-relaxed text-text2">
                This trace was loaded successfully, but it does not contain
                spans instrumented with SignalGraph.
              </p>
            </div>
          </div>
        {/if}
      </main>

      {#if hasGraphNodes}
        <aside
          class={`${inspCollapsed ? "w-0" : "w-74.5"} flex shrink-0 flex-col overflow-hidden border-l border-l-border_hi bg-panel`}
          style={`transition:width 0.25s cubic-bezier(0.4,0,0.2,1)`}
        >
          <div class="flex h-full w-74.5 flex-col">
            <div
              class="flex h-10 shrink-0 items-center justify-between border-b border-b-border px-3.5"
            >
              <span
                class="font-['JetBrains_Mono'] text-[9.5px] tracking-[0.09em] text-muted"
              >
                INSPECTOR
              </span>
              <button
                onclick={() => (inspCollapsed = true)}
                title="Collapse inspector"
                class="flex items-center gap-1 rounded-sm px-1 py-0.5 font-['JetBrains_Mono'] text-[10px] text-muted"
              >
                <svg width={12} height={12} viewBox="0 0 12 12">
                  <path
                    d="M4 2L8 6l-4 4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width={1.5}
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </div>

            <div class="flex flex-1 flex-col overflow-hidden">
              <InspectorPanel
                node={selected}
                tab={inspTab}
                onTabChange={(t) => (inspTab = t)}
              />
            </div>
          </div>
        </aside>
      {/if}
    </div>

    {#if hasGraphNodes}
      <div class="shrink-0">
        <button
          onclick={() => (timelineOpen = !timelineOpen)}
          class="flex w-full items-center gap-2 border-none border-t border-t-border_hi bg-panel px-4.5 py-1.25 text-left font-['JetBrains_Mono'] text-[9.5px] tracking-[0.07em] text-text2"
        >
          <svg
            width={12}
            height={12}
            viewBox="0 0 12 12"
            class={`${timelineOpen ? "rotate-0" : "rotate-180"} shrink-0`}
            style="transition:transform 0.2s cubic-bezier(0.4,0,0.2,1)"
          >
            <path
              d="M 2 8 L 6 4 L 10 8"
              fill="none"
              stroke="currentColor"
              stroke-width={1.5}
              stroke-linecap="round"
            />
          </svg>
          TIMELINE
        </button>

        <div
          class={`overflow-scroll ${timelineOpen ? "max-h-52.5" : "max-h-0"}`}
          style="transition:max-height 0.24s cubic-bezier(0.4,0,0.2,1)"
        >
          <TimelinePanel
            spans={graph.traceSpans}
            traceId={data.trace?.traceId ?? ""}
            {selectedSpanId}
            onSpanClick={handleSpanClick}
          />
        </div>
      </div>
    {/if}
  </div>
{/if}
