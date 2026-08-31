<script lang="ts">
  import type { InspTab, SearchField } from "$lib/types";
  import type { Trace, TraceSpan } from "$lib/domain/types";
  import { ACCENT, MSG_C, MUTED } from "$lib/tokens";
  import { buildNmap, matchSearch } from "$lib/utils";
  import EdgeEl from "$lib/components/EdgeEl.svelte";
  import NodeEl from "$lib/components/NodeEl.svelte";
  import InspectorPanel from "$lib/components/InspectorPanel.svelte";
  import TimelinePanel from "$lib/components/TimelinePanel.svelte";
  import { createCollector } from "$lib/telemetry/collectorFactory";
  import type { CollectorConfig } from "$lib/telemetry/collector";
  import { buildGraph } from "$lib/domain/graph";
  import {
    NODE_HEIGHT,
    NODE_WIDTH,
    positionGraphNodes,
  } from "$lib/domain/layout";
  import { onDestroy, tick } from "svelte";

  type PageState = "setup" | "loading" | "ready" | "error";

  let pageState = $state<PageState>("setup");
  let trace = $state<Trace | null>(null);
  let loadError = $state<string | null>(null);
  let activeCollectorConfig = $state<CollectorConfig | null>(null);

  let collectorType = $state<CollectorConfig["type"]>("tempo");
  let collectorUrl = $state("");

  let isRefreshing = $state(false);
  let lastUpdatedAt = $state<Date | null>(null);
  const POLL_INTERVAL_MS = 15_000;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  async function loadTrace(config: CollectorConfig, isInitialLoad: boolean) {
    if (isInitialLoad) {
      pageState = "loading";
      loadError = null;
      trace = null;
      selectedId = null;
      selectedSpanId = null;
    } else {
      isRefreshing = true;
      loadError = null;
    }

    try {
      const collector = createCollector(config);

      trace = await collector.collect();
      activeCollectorConfig = config;
      lastUpdatedAt = new Date();

      if (isInitialLoad) {
        pageState = "ready";

        await tick();
        handleFitView();
      }
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : "Unable to load trace";

      if (isInitialLoad) {
        pageState = "error";
      }
    } finally {
      isRefreshing = false;
    }
  }

  const collectorOptions: Array<{
    value: CollectorConfig["type"];
    label: string;
  }> = [{ value: "tempo", label: "Tempo" }];

  async function connect() {
    const config: CollectorConfig = {
      type: collectorType,
      url: collectorUrl,
    };

    stopPolling();
    await loadTrace(config, true);

    if (pageState === "ready") {
      startPolling();
    }
  }

  async function refreshTrace() {
    if (!activeCollectorConfig || isRefreshing) {
      return;
    }

    await loadTrace(activeCollectorConfig, false);
  }

  function startPolling() {
    stopPolling();

    refreshTimer = setInterval(() => {
      void refreshTrace();
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  onDestroy(stopPolling);

  function disconnect() {
    trace = null;
    selectedId = null;
    selectedSpanId = null;
    activeCollectorConfig = null;
    loadError = null;
    isRefreshing = false;
    lastUpdatedAt = null;

    stopPolling();

    pageState = "setup";
  }

  // ── State ────────────────────────────────────────────────────────────────
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

  // Plain (non-reactive) refs — mirror of React's useRef for pan bookkeeping
  let panRef: { x: number; y: number; tx: number; ty: number } = {
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
  };
  let svgEl: SVGSVGElement | undefined = $state();
  let canvasEl: HTMLElement | undefined = $state();

  // ── Derived ──────────────────────────────────────────────────────────────
  const graph = $derived(trace ? buildGraph(trace) : null);

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

  const activeCollectorLabel = $derived(
    activeCollectorConfig
      ? `${activeCollectorConfig.type.charAt(0).toUpperCase()}${activeCollectorConfig.type.slice(1)}`
      : "Collector",
  );

  const lastUpdatedLabel = $derived(
    lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : "Not yet updated",
  );

  const hasGraphNodes = $derived(positionedNodes.length > 0);

  // ── Non-passive wheel listener (required to call preventDefault) ────────
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

  // ── Fit view — measures canvas and adjusts transform to show full graph ─
  function handleFitView() {
    const canvas = canvasEl;

    if (!canvas || positionedNodes.length === 0) {
      return;
    }

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

  // ── Sidebar nav (inline SVG markup rendered via {@html}) ─────────────────
  const navItems = [
    {
      title: "Graph",
      active: true,
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" /><circle cx="4" cy="6" r="2" /><circle cx="20" cy="6" r="2" />
        <circle cx="4" cy="18" r="2" /><circle cx="20" cy="18" r="2" />
        <path d="M6 6.5 9.5 10M14.5 10 18 6.5M6 17.5 9.5 14M14.5 14 18 17.5" />
      </svg>`,
    },
    {
      title: "Services",
      active: false,
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="5" rx="1" /><rect x="2" y="10" width="20" height="5" rx="1" /><rect x="2" y="17" width="20" height="5" rx="1" />
      </svg>`,
    },
    {
      title: "Traces",
      active: false,
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>`,
    },
    {
      title: "Events",
      active: false,
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 4.5 13.5 11 13.5 9 22 18.5 10.5 12 10.5 13 2" />
      </svg>`,
    },
    {
      title: "Settings",
      active: false,
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>`,
    },
  ];

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

  const searchFields: Array<{ value: SearchField; label: string }> = [
    { value: "any", label: "Any" },
    { value: "name", label: "Name" },
    { value: "msg-id", label: "Msg ID" },
    { value: "corr-id", label: "Corr ID" },
    { value: "trace-id", label: "Trace ID" },
    { value: "service", label: "Service" },
  ];
</script>

{#if pageState !== "ready"}
  <main
    class="flex min-h-screen items-center justify-center bg-bg p-6 font-sans text-text"
  >
    <section
      class="w-full max-w-105 rounded-xl border border-border_hi bg-panel p-7"
    >
      <p class="mb-2 font-mono text-[10px] tracking-widest text-accent">
        SIGNALGRAPH · OTEL
      </p>

      <h1 class="m-0 text-[22px] font-semibold text-text">
        Connect a collector
      </h1>

      <p class="mb-5 mt-2.5 text-[13px] leading-relaxed text-text2">
        Connect a telemetry collector to explore message flow and handler
        execution for a trace.
      </p>

      <form
        onsubmit={(event) => {
          event.preventDefault();
          connect();
        }}
        class="flex flex-col gap-3"
      >
        <label
          for="collector-type"
          class="flex flex-col gap-1.5 text-[11px] text-text2"
        >
          Collector
        </label>

        <select
          id="collector-type"
          bind:value={collectorType}
          disabled={pageState === "loading"}
          class="rounded-md border border-border bg-surface px-2.5 py-2.25 text-sm text-text outline-none scheme-dark focus:border-accent disabled:cursor-not-allowed disabled:opacity-70"
        >
          {#each collectorOptions as collector (collector.value)}
            <option value={collector.value} class="bg-surface text-text">
              {collector.label}
            </option>
          {/each}
        </select>

        <label
          for="collector-url"
          class="flex flex-col gap-1.5 text-[11px] text-text2"
        >
          Collector URL
        </label>

        <input
          type="text"
          id="collector-url"
          name="collector-url"
          placeholder="http://localhost:3200"
          bind:value={collectorUrl}
          disabled={pageState === "loading"}
          required
          class="rounded-md border border-border bg-surface px-2.5 py-2.25 font-mono text-sm text-text outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-70"
        />

        {#if loadError}
          <p class="m-0 text-xs text-red-500">
            {loadError}
          </p>
        {/if}

        <button
          type="submit"
          disabled={pageState === "loading"}
          class="mt-1 rounded-md bg-accent px-3 py-2.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
        >
          {pageState === "loading" ? "Connecting..." : "Connect"}
        </button>
      </form>
    </section>
  </main>
{:else if graph}
  <div
    class="flex flex-col h-screen w-screen bg-bg text-text overflow-hidden font-sans"
  >
    <!-- ══ Header ══════════════════════════════════════════════════════════ -->
    <header
      class="h-13 shrink-0 flex items-center gap-3 py-0 px-3.5 bg-panel border-b border-border_hi z-20"
    >
      <!-- Wordmark -->
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

      <!-- Search with field selector -->
      <div
        class="flex-1 max-w-120 flex items-stretch bg-white/0.04 border border-border_hi rounded-lg overflow-hidden h-8.5"
      >
        <select
          id="search-type"
          bind:value={searchField}
          class="bg-white/0.06 border-none border-r border-r-border_hi text-text2 py-0 px-2.5 text-[10.5px] font-['JetBrains_Mono'] outline-none cursor-pointer shrink-0 min-w-20 max-w-22.5"
        >
          {#each searchFields as f (f.value)}
            <option value={f.value}>{f.label}</option>
          {/each}
        </select>
        <div class="flex items-center flex-1 py-0 px-2.5 gap-1.75">
          <svg
            width={13}
            height={13}
            viewBox="0 0 24 24"
            fill="none"
            stroke={MUTED}
            stroke-width={2}
            stroke-linecap="round"
          >
            <circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            id="search"
            type="text"
            placeholder="Search nodes, message IDs, trace IDs..."
            bind:value={search}
            class="bg-none border-none outline-none text-[12.5px] text-text flex-1 font-sans"
          />
          {#if search}
            <span
              class={`text-[10px] font-['JetBrains_Mono'] ${matchCount > 0 ? "text-accent" : "text-[#f59e0b]"}`}
            >
              {matchCount} match{matchCount !== 1 ? "es" : ""}
            </span>
            <button
              onclick={() => (search = "")}
              class="bg-none border-none cursor-pointer text-muted p-0 text-[18px] leading-none shrink-0"
            >
              ×
            </button>
          {/if}
        </div>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <div
          class="hidden text-right font-mono text-[10px] text-muted sm:block"
        >
          <p class="m-0">Collector: {activeCollectorLabel}</p>
          <p class="m-0">Updated: {lastUpdatedLabel}</p>
        </div>

        {#if loadError}
          <span title={loadError} class="font-mono text-[10px] text-amber-400">
            Refresh failed
          </span>
        {/if}

        <button
          type="button"
          onclick={refreshTrace}
          disabled={isRefreshing}
          class="rounded-md border border-border_hi bg-panel px-2.5 py-1.5 text-[11px] font-medium text-text2 transition-colors hover:border-accent hover:text-text disabled:cursor-wait disabled:opacity-70"
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>

        <button
          type="button"
          onclick={disconnect}
          class="rounded-md border border-border_hi bg-panel px-2.5 py-1.5 text-[11px] font-medium text-text2 transition-colors hover:border-red-400 hover:text-red-400"
        >
          Disconnect
        </button>
      </div>
    </header>

    <!-- ══ Body ════════════════════════════════════════════════════════════ -->
    <div class="flex flex-1 min-h-0">
      <!-- ── Sidebar ─────────────────────────────────────────────────────── -->
      <nav
        class="w-12 shrink-0 flex flex-col items-center py-2.5 px-0 gap-0.75 bg-panel border-r border-r-border_hi"
      >
        {#each navItems as item (item.title)}
          <button
            title={item.title}
            class={`size-9 rounded-lg border ${item.active ? "bg-accent/18 border-accent/38 text-accent" : "bg-transparent border-transparent text-muted"} cursor-pointer flex items-center justify-center transition-all`}
          >
            {@html item.icon}
          </button>
        {/each}
      </nav>

      <!-- ── Graph canvas ─────────────────────────────────────────────────── -->
      <main
        bind:this={canvasEl}
        class="flex-1 min-w-0 relative overflow-hidden bg-surface"
      >
        {#if hasGraphNodes}
          <!-- Toolbar -->
          <div class="absolute top-3 left-3 z-10 flex gap-1 items-center">
            {#each zoomButtons as b (b.l)}
              <button
                onclick={b.fn}
                title={b.tip}
                class="size-7 rounded-md bg-panel border border-border_hi cursor-pointer text-text2 text-[14px] flex items-center justify-center"
                style={`transition:background 0.14s`}
              >
                {b.l}
              </button>
            {/each}
            <span class="text-[10px] font-['JetBrains_Mono'] text-muted ml-1">
              {Math.round(transform.scale * 100)}%
            </span>
          </div>

          <!-- Legend -->
          <div
            class="absolute bottom-3 left-3 z-10 flex gap-3.5 items-center bg-panel/94 backdrop-blur-md border border-border_hi rounded-lg py-1.75 px-3.5"
          >
            <span
              class="flex items-center gap-1.5 text-[10px] font-['JetBrains_Mono'] text-text2"
            >
              <span class="size-2 bg-msg_c inline-block rotate-45"></span>
              Message
            </span>
            <span
              class="flex items-center gap-1.5 text-[10px] font-['JetBrains_Mono'] text-text2"
            >
              <span class="text-[10px] text-accent font-['JetBrains_Mono']"
                >{"{ }"}</span
              >
              Handler
            </span>
          </div>

          <!-- Inspector reopen button (shown when collapsed) -->
          {#if inspCollapsed}
            <button
              onclick={() => (inspCollapsed = false)}
              title="Open Inspector"
              class="absolute right-0 top-[50%] translate-y-[-50%] z-10 w-5 h-13 bg-panel border border-border_hi border-r-0 rounded-tl-[7px] rounded-bl-[7px] cursor-pointer text-text2 flex items-center justify-center p-0"
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

          <!-- SVG graph -->
          <svg
            bind:this={svgEl}
            class={`size-full block ${panning ? "cursor-grabbing" : "cursor-grab"} select-none`}
            onpointerdown={onPointerDown}
            onpointermove={onPointerMove}
            onpointerup={onPointerUp}
            role="application"
            aria-label="Trace graph canvas — drag to pan, scroll to zoom"
          >
            <defs>
              <!-- Dot grid -->
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

              <!-- Selection glow filters -->
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

            <!-- Canvas dot grid -->
            <rect width="100%" height="100%" fill="url(#dotgrid)" />

            <g
              transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}
            >
              <!-- Edges first (under nodes) -->
              {#each graph.edges as edge (edge.id)}
                <EdgeEl
                  {edge}
                  {nmap}
                  hovered={hoveredEdgeId === edge.id}
                  onEnter={() => (hoveredEdgeId = edge.id)}
                  onLeave={() => (hoveredEdgeId = null)}
                />
              {/each}

              <!-- Nodes -->
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

      <!-- ── Inspector ────────────────────────────────────────────────────── -->
      {#if hasGraphNodes}
        <aside
          class={`${inspCollapsed ? "w-0" : "w-74.5"} shrink-0 overflow-hidden bg-panel border-l border-l-border_hi flex flex-col`}
          style={`transition:width 0.25s cubic-bezier(0.4,0,0.2,1)`}
        >
          <div class="w-74.5 flex flex-col h-full">
            <!-- Inspector header -->
            <div
              class="py-0 px-3.5 h-10 shrink-0 flex items-center justify-between border-b border-b-border"
            >
              <span
                class="text-[9.5px] font-['JetBrains_Mono'] text-muted tracking-[0.09em]"
              >
                INSPECTOR
              </span>
              <button
                onclick={() => (inspCollapsed = true)}
                title="Collapse inspector"
                class="bg-none border-none cursor-pointer text-muted flex items-center gap-1 py-0.5 px-1 rounded-sm text-[10px] font-['JetBrains_Mono'] transition-colors"
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

            <div class="flex-1 overflow-hidden flex flex-col">
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

    <!-- ══ Timeline ════════════════════════════════════════════════════════ -->
    {#if hasGraphNodes}
      <div class="shrink-0">
        <button
          onclick={() => (timelineOpen = !timelineOpen)}
          class="flex items-center gap-2 w-full py-1.25 px-4.5 bg-panel border-t border-t-border_hi border-none cursor-pointer text-left text-[9.5px] font-['JetBrains_Mono'] text-text2 tracking-[0.07em]"
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
            traceId={trace?.traceId ?? ""}
            {selectedSpanId}
            onSpanClick={handleSpanClick}
          />
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  :global(.edge-anim) {
    animation: dash-flow 1.4s linear infinite;
  }
  @keyframes dash-flow {
    to {
      stroke-dashoffset: -21;
    }
  }
  :global(.live-dot) {
    animation: live-pulse 1.6s ease-in-out infinite;
  }
  @keyframes live-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
</style>
