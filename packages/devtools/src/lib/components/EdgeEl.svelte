<script lang="ts">
  import type { GraphEdge } from "$lib/domain/types";
  import type { PositionedGraphNode } from "$lib/types";
  import { epath } from "$lib/utils";

  let {
    edge,
    nmap,
    hovered,
    onEnter,
    onLeave,
  }: {
    edge: GraphEdge;
    nmap: Record<string, PositionedGraphNode>;
    hovered: boolean;
    onEnter: () => void;
    onLeave: () => void;
  } = $props();

  const src = $derived(nmap[edge.source]);
  const tgt = $derived(nmap[edge.target]);

  const d = $derived(src && tgt ? epath(src, tgt) : "");

  const baseStroke = "rgba(124,111,224,0.2)";
  const hlStroke = "rgba(124,111,224,0.55)";
  const markId = $derived(`arr-${edge.id}`);

  const sw = $derived(hovered ? 2.5 : 1.5);
  const visStroke = $derived(hovered ? hlStroke : baseStroke);
  const flowOpacity = $derived(hovered ? 0.7 : 0.38);
  const particleDur = 5.5;
</script>

{#if src && tgt}
  <g>
    <!-- Static base -->
    <path
      {d}
      fill="none"
      stroke={visStroke}
      stroke-width={sw}
      marker-end={`url(#${markId})`}
      style="transition: stroke 0.18s, stroke-width 0.18s"
    />

    <!-- Animated flow dash -->
    <path
      {d}
      fill="none"
      stroke="var(--color-accent)"
      stroke-width={hovered ? 1.5 : 1}
      stroke-dasharray="5 16"
      class="edge-anim"
      opacity={flowOpacity}
      style="transition: opacity 0.18s, stroke-width 0.18s"
    />

    <!-- Live particle -->
    <circle
      r={2.5}
      fill="var(--color-accent)"
      opacity={hovered ? 0.9 : 0.5}
      style="transition: opacity 0.18s"
    >
      <animateMotion
        dur={`${particleDur}s`}
        repeatCount="indefinite"
        path={d}
      />
    </circle>

    <!-- Wide invisible hit target -->
    <path
      {d}
      fill="none"
      stroke="transparent"
      stroke-width={28}
      onmouseenter={onEnter}
      onmouseleave={onLeave}
      role="presentation"
      class="cursor-crosshair"
    />
  </g>
{/if}
