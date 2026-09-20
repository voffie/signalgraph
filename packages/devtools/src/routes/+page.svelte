<script lang="ts">
  import CommandMenu from "$lib/components/CommandMenu.svelte";
  import ConnectionsDialog from "$lib/components/ConnectionsDialog.svelte";
  import EdgeEl from "$lib/components/EdgeEl.svelte";
  import GraphSearchBar from "$lib/components/GraphSearchBar.svelte";
  import InspectorPanel from "$lib/components/InspectorPanel.svelte";
  import NodeEl from "$lib/components/NodeEl.svelte";
  import SettingsDialog from "$lib/components/SettingsDialog.svelte";
  import TimelinePanel from "$lib/components/TimelinePanel.svelte";
  import TraceDialog from "$lib/components/TraceDialog.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { buildGraph } from "$lib/domain/graph";
  import { NODE_HEIGHT, NODE_WIDTH, positionGraphNodes } from "$lib/domain/layout";
  import type { TraceSpan } from "$lib/domain/types";
  import type { InspTab, SearchField } from "$lib/types";
  import { buildNmap, cn, matchSearch } from "$lib/utils.js";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
  import CircleOffIcon from "@lucide/svelte/icons/circle-off";
  import DatabaseIcon from "@lucide/svelte/icons/database";
  import MaximizeIcon from "@lucide/svelte/icons/maximize";
  import MinusIcon from "@lucide/svelte/icons/minus";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SearchXIcon from "@lucide/svelte/icons/search-x";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import WaypointsIcon from "@lucide/svelte/icons/waypoints";
  import { tick } from "svelte";

  let { data } = $props();

  let selectedId = $state<string | null>(null);
  let selectedSpanId = $state<string | null>(null);
  let hoveredEdgeId = $state<string | null>(null);
  let hoveredNodeId = $state<string | null>(null);
  let search = $state("");
  let searchField = $state<SearchField>("any");
  let timelineOpen = $state(true);
  let inspCollapsed = $state(true);
  let inspTab = $state<InspTab>("overview");
  let transform = $state({ x: 20, y: 55, scale: 0.76 });
  let panning = $state(false);
  let overlay = $state<"command" | "connections" | "trace" | "settings" | null>(null);

  let panRef: { x: number; y: number; tx: number; ty: number } = { x: 0, y: 0, tx: 0, ty: 0 };
  let svgEl: SVGSVGElement | undefined = $state();
  let canvasEl: HTMLElement | undefined = $state();

  const graph = $derived(data.trace ? buildGraph(data.trace) : null);
  const positionedNodes = $derived(graph ? positionGraphNodes(graph) : []);
  const nmap = $derived(buildNmap(positionedNodes));
  const selected = $derived(selectedId ? (nmap[selectedId] ?? null) : null);

  const filteredIds: Set<string> | null = $derived(
    search.trim()
      ? new Set(positionedNodes.filter((n) => matchSearch(n, search, searchField)).map((n) => n.id))
      : null,
  );

  const matchCount = $derived(filteredIds?.size ?? 0);
  const hasGraphNodes = $derived(positionedNodes.length > 0);

  $effect(() => {
    if (hasGraphNodes) tick().then(handleFitView);
  });

  $effect(() => {
    const el = svgEl;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      transform = { ...transform, scale: Math.max(0.2, Math.min(3, transform.scale * factor)) };
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
    const maxX = Math.max(...positionedNodes.map((node) => node.x + NODE_WIDTH));
    const maxY = Math.max(...positionedNodes.map((node) => node.y + NODE_HEIGHT));

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

  function handleSpanClick(span: TraceSpan) {
    selectedSpanId = span.spanId;
    selectedId = graph?.spanNodeIds[span.spanId] ?? null;
    inspTab = "overview";
    inspCollapsed = false;
  }

  function handleNodeClick(nodeId: string) {
    const nextSelectedId = selectedId === nodeId ? null : nodeId;

    selectedId = nextSelectedId;
    selectedSpanId = nextSelectedId ? (nmap[nextSelectedId]?.primarySpanId ?? null) : null;

    if (nextSelectedId) {
      inspTab = "overview";
      inspCollapsed = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    const isModPressed = e.metaKey || e.ctrlKey;

    if (isModPressed && e.key === "k") {
      overlay = null;
      e.preventDefault();
      overlay = "command";
      return;
    }

    if (isModPressed && e.key === ",") {
      e.preventDefault();
      overlay = "settings";
      return;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet header()}
  <header
    class="bg-background sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4">
    <div class="flex items-center gap-2">
      <svg width={18} height={18} viewBox="0 0 20 20" fill="none">
        <circle cx={10} cy={10} r={2.8} fill="var(--color-primary)" />
        <circle cx={3} cy={5} r={1.6} fill="var(--color-primary)" opacity={0.5} />
        <circle cx={17} cy={5} r={1.6} fill="var(--color-primary)" opacity={0.5} />
        <circle cx={3} cy={15} r={1.6} fill="var(--color-primary)" opacity={0.5} />
        <circle cx={17} cy={15} r={1.6} fill="var(--color-primary)" opacity={0.5} />
        <path
          d="M4.4 5.7 7.6 8.4M12.4 8.4 15.6 5.7M4.4 14.3 7.6 11.6M12.4 11.6 15.6 14.3"
          stroke="var(--color-primary)"
          stroke-width={1}
          opacity={0.45} />
      </svg>
      <span class="font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
        SignalGraph
      </span>
    </div>

    <div class="flex items-center gap-1">
      <button
        onclick={() => (overlay = "command")}
        class="text-muted-foreground hover:text-foreground flex items-center gap-2 px-2 py-1.5 text-xs transition-colors">
        Search
        <kbd
          class="bg-popover rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px]"
          >⌘K</kbd>
      </button>
      <Button
        variant="ghost"
        size="icon"
        title="Settings (⌘,)"
        onclick={() => (overlay = "settings")}>
        <SettingsIcon class="size-4" />
      </Button>
    </div>
  </header>
{/snippet}

<CommandMenu
  open={overlay === "command"}
  onOpenChange={(open) => {
    if (!open) overlay = null;
  }}
  onNavigate={(name) => (overlay = name)} />

<ConnectionsDialog
  open={overlay === "connections"}
  dataSources={data.dataSources}
  onOpenChange={(open) => {
    if (!open) overlay = null;
  }} />

<TraceDialog
  open={overlay === "trace"}
  selectedTraceId={data.trace?.traceId ?? null}
  onOpenChange={(open) => {
    if (!open) overlay = null;
  }} />

<SettingsDialog
  open={overlay === "settings"}
  graphLookbackSeconds={data.graphLookbackSeconds}
  onOpenChange={(open) => {
    if (!open) overlay = null;
  }} />

<div class="flex min-h-0 flex-1 flex-col">
  {@render header()}

  {#if data.error}
    <Empty.Root class="flex-1">
      <Empty.Header>
        <Empty.Media variant="icon">
          <CircleAlertIcon />
        </Empty.Media>
        <Empty.Title>Unable to Load Trace</Empty.Title>
        <Empty.Description>{data.error}</Empty.Description>
      </Empty.Header>
    </Empty.Root>
  {:else if !data.hasAnyDataSource}
    <Empty.Root class="flex-1">
      <Empty.Header>
        <Empty.Media variant="icon">
          <DatabaseIcon />
        </Empty.Media>
        <Empty.Title>No Connections Configured</Empty.Title>
        <Empty.Description>Add a connection to start viewing traces.</Empty.Description>
      </Empty.Header>
      <Empty.Content>
        <Button variant="link" onclick={() => (overlay = "connections")}>Add connection</Button>
      </Empty.Content>
    </Empty.Root>
  {:else if !data.hasActiveDataSource}
    <Empty.Root class="flex-1">
      <Empty.Header>
        <Empty.Media variant="icon">
          <CircleOffIcon />
        </Empty.Media>
        <Empty.Title>No Active Connection</Empty.Title>
        <Empty.Description>
          Set one of your saved connections as active to load a trace.
        </Empty.Description>
      </Empty.Header>
      <Empty.Content>
        <Button variant="link" onclick={() => (overlay = "connections")}>Switch connection</Button>
      </Empty.Content>
    </Empty.Root>
  {:else if !graph}
    <Empty.Root class="flex-1">
      <Empty.Header>
        <Empty.Media variant="icon">
          <SearchXIcon />
        </Empty.Media>
        <Empty.Title>No Traces Found</Empty.Title>
        <Empty.Description>Waiting for SignalGraph traces to be generated.</Empty.Description>
      </Empty.Header>
      <Empty.Content>
        <div>
          <Button variant="link" onclick={() => (overlay = "settings")}>Go to Settings</Button>
        </div>
      </Empty.Content>
    </Empty.Root>
  {:else}
    <div class="flex min-h-0 flex-1">
      <main bind:this={canvasEl} class="bg-secondary relative min-w-0 flex-1 overflow-hidden">
        {#if hasGraphNodes}
          <div class="absolute top-3 left-3 z-10 flex items-center gap-2">
            <GraphSearchBar
              {search}
              {searchField}
              {matchCount}
              onSearchChange={(value) => (search = value)}
              onSearchFieldChange={(value) => (searchField = value)} />

            <div class="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                class="size-7"
                title="Zoom in"
                onclick={() =>
                  (transform = { ...transform, scale: Math.min(3, transform.scale * 1.2) })}>
                <PlusIcon class="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                class="size-7"
                title="Zoom out"
                onclick={() =>
                  (transform = { ...transform, scale: Math.max(0.2, transform.scale * 0.8) })}>
                <MinusIcon class="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                class="size-7"
                title="Fit view"
                onclick={handleFitView}>
                <MaximizeIcon class="size-3.5" />
              </Button>
              <span class="text-muted-foreground ml-1 font-mono text-[10px]">
                {Math.round(transform.scale * 100)}%
              </span>
            </div>
          </div>

          <div
            class="bg-popover/94 absolute bottom-3 left-3 z-10 flex items-center gap-3.5 rounded-lg border border-white/10 px-3.5 py-1.75 backdrop-blur-md">
            <span class="flex items-center gap-1.5 font-mono text-[10px]">
              <span class="bg-chart-1 inline-block size-2 rotate-45"></span>
              Message
            </span>
            <span class="flex items-center gap-1.5 font-mono text-[10px]">
              <span class="text-primary font-mono text-[10px]">{"{ }"}</span>
              Handler
            </span>
          </div>

          {#if inspCollapsed}
            <Button
              variant="outline"
              size="icon"
              title="Open Inspector"
              class="absolute top-1/2 right-0 z-10 h-13 w-5 -translate-y-1/2 rounded-r-none border-r-0"
              onclick={() => (inspCollapsed = false)}>
              <ChevronLeftIcon class="size-3.5" />
            </Button>
          {/if}

          <svg
            bind:this={svgEl}
            class={cn("block size-full select-none", panning ? "cursor-grabbing" : "cursor-grab")}
            onpointerdown={onPointerDown}
            onpointermove={onPointerMove}
            onpointerup={onPointerUp}
            role="application"
            aria-label="Trace graph canvas — drag to pan, scroll to zoom">
            <defs>
              <pattern
                id="dotgrid"
                x={0}
                y={0}
                width={28}
                height={28}
                patternUnits="userSpaceOnUse">
                <circle cx={0.5} cy={0.5} r={0.6} fill="rgba(255,255,255,0.07)" />
              </pattern>
              <filter id="glow-evt" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="blur" />
                <feFlood flood-color="var(--color-chart-1)" flood-opacity="0.5" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-hnd" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="blur" />
                <feFlood flood-color="var(--color-primary)" flood-opacity="0.5" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect width="100%" height="100%" fill="url(#dotgrid)" />

            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
              {#each graph.edges as edge (edge.id)}
                <EdgeEl
                  {edge}
                  {nmap}
                  hovered={hoveredEdgeId === edge.id}
                  onEnter={() => (hoveredEdgeId = edge.id)}
                  onLeave={() => (hoveredEdgeId = null)} />
              {/each}

              {#each positionedNodes as node (node.id)}
                <NodeEl
                  {node}
                  selected={selectedId === node.id}
                  dimmed={filteredIds !== null && !filteredIds.has(node.id)}
                  hovered={hoveredNodeId === node.id}
                  onClick={() => handleNodeClick(node.id)}
                  onEnter={() => (hoveredNodeId = node.id)}
                  onLeave={() => (hoveredNodeId = null)} />
              {/each}
            </g>
          </svg>
        {:else}
          <Empty.Root class="flex-1">
            <Empty.Header>
              <Empty.Media variant="icon">
                <WaypointsIcon />
              </Empty.Media>
              <Empty.Title>No SignalGraph spans found</Empty.Title>
              <Empty.Description>
                This trace was loaded successfully, but it does not contain spans instrumented with
                SignalGraph.
              </Empty.Description>
            </Empty.Header>
          </Empty.Root>
        {/if}
      </main>

      {#if hasGraphNodes}
        <aside
          class={cn(
            "bg-popover flex shrink-0 flex-col overflow-hidden border-l border-white/10",
            inspCollapsed ? "w-0" : "w-74.5",
          )}
          style={`transition:width 0.25s cubic-bezier(0.4,0,0.2,1)`}>
          <div class="flex h-full w-74.5 flex-col">
            <div
              class="border-b-border flex h-10 shrink-0 items-center justify-between border-b px-3.5">
              <span class="text-muted-foreground font-mono text-[9.5px] tracking-[0.09em]">
                INSPECTOR
              </span>
              <Button
                variant="ghost"
                size="icon"
                class="text-muted-foreground size-5"
                title="Collapse inspector"
                onclick={() => (inspCollapsed = true)}>
                <ChevronRightIcon class="size-3.5" />
              </Button>
            </div>

            <div class="flex flex-1 flex-col overflow-hidden">
              <InspectorPanel node={selected} tab={inspTab} onTabChange={(t) => (inspTab = t)} />
            </div>
          </div>
        </aside>
      {/if}
    </div>

    {#if hasGraphNodes}
      <div class="shrink-0">
        <button
          onclick={() => (timelineOpen = !timelineOpen)}
          class="bg-popover flex w-full items-center gap-2 border-t border-white/10 px-4.5 py-1.25 text-left font-mono text-[9.5px] tracking-[0.07em]">
          <svg
            width={12}
            height={12}
            viewBox="0 0 12 12"
            class={cn("shrink-0", timelineOpen ? "rotate-0" : "rotate-180")}
            style="transition:transform 0.2s cubic-bezier(0.4,0,0.2,1)">
            <path
              d="M 2 8 L 6 4 L 10 8"
              fill="none"
              stroke="currentColor"
              stroke-width={1.5}
              stroke-linecap="round" />
          </svg>
          TIMELINE
        </button>

        <div
          class={cn("overflow-scroll", timelineOpen ? "max-h-52.5" : "max-h-0")}
          style="transition:max-height 0.24s cubic-bezier(0.4,0,0.2,1)">
          <TimelinePanel
            spans={graph.traceSpans}
            traceId={data.trace?.traceId ?? ""}
            {selectedSpanId}
            onSpanClick={handleSpanClick} />
        </div>
      </div>
    {/if}
  {/if}
</div>
