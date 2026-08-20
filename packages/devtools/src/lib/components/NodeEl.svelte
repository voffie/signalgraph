<script lang="ts">
  import { ACCENT, MSG_C, NW, NH, TEXT, TEXT2 } from "$lib/tokens";
  import type { PositionedGraphNode } from "$lib/types";

  let {
    node,
    selected,
    dimmed,
    hovered,
    onClick,
    onEnter,
    onLeave,
  }: {
    node: PositionedGraphNode;
    selected: boolean;
    dimmed: boolean;
    hovered: boolean;
    onClick: () => void;
    onEnter: () => void;
    onLeave: () => void;
  } = $props();

  const isMsg = $derived(node.kind === "message");
  const kindC = $derived(isMsg ? MSG_C : ACCENT);

  const fillBase = "#0a0718";
  const fillSel = $derived(
    isMsg ? "rgba(79,142,247,0.10)" : "rgba(124,111,224,0.10)",
  );

  const strokeNorm = "rgba(255,255,255,0.075)";

  const strokeSel = $derived(kindC);
  const strokeHov = $derived(`${kindC}66`);

  const stroke = $derived(
    selected ? strokeSel : hovered ? strokeHov : strokeNorm,
  );

  const sw = $derived(selected ? 1.5 : 1);

  const glowFilter = $derived(
    selected ? (isMsg ? "url(#glow-evt)" : "url(#glow-hnd)") : undefined,
  );
</script>

<g
  class="graph-node"
  transform={`translate(${node.x},${node.y})`}
  filter={glowFilter}
  onclick={onClick}
  onmouseenter={onEnter}
  onmouseleave={onLeave}
  role="button"
  tabindex="0"
  onkeydown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
  style={`cursor:pointer;opacity:${dimmed ? 0.1 : 1};transition:opacity 0.15s`}
>
  <!-- Hover ring -->
  {#if hovered && !selected}
    <rect
      x={-4}
      y={-4}
      width={NW + 8}
      height={NH + 8}
      rx={13}
      fill="none"
      stroke={kindC}
      stroke-width={0.75}
      opacity={0.35}
    />
  {/if}

  <!-- Body -->
  <rect
    x={0}
    y={0}
    width={NW}
    height={NH}
    rx={9}
    fill={selected ? fillSel : fillBase}
    {stroke}
    stroke-width={sw}
    style="transition: fill 0.15s, stroke 0.15s, stroke-width 0.12s"
  />

  <!-- Top accent stripe — visually differentiates kind -->
  <rect
    x={1}
    y={0}
    width={NW - 2}
    height={3}
    rx={1.5}
    fill={kindC}
    opacity={selected ? 0.85 : hovered ? 0.5 : 0.28}
    style="transition: opacity 0.15s"
  />

  <!-- Header row divider -->
  <line
    x1={0}
    y1={29}
    x2={NW}
    y2={29}
    stroke="rgba(255,255,255,0.042)"
    stroke-width={0.5}
  />

  <!-- Kind icon + label -->
  {#if isMsg}
    <g transform="translate(11,10)">
      <polygon
        points="6,0 12,6 6,12 0,6"
        fill={kindC}
        opacity={selected ? 0.85 : 0.55}
      />
    </g>
  {:else}
    <text
      x={10}
      y={21}
      font-size={11}
      font-family="'JetBrains Mono', monospace"
      font-weight={500}
      fill={kindC}
      opacity={selected ? 0.9 : 0.6}
      style="transition: opacity 0.15s"
    >
      {"{}"}
    </text>
  {/if}
  <text
    x={isMsg ? 28 : 32}
    y={21}
    font-size={7.5}
    font-family="'JetBrains Mono', monospace"
    fill={TEXT2}
    letter-spacing="0.09em"
  >
    {isMsg ? "MESSAGE" : "HANDLER"}
  </text>

  <!-- Main label -->
  <text
    x={11}
    y={49}
    font-size={13}
    font-family="'Inter', sans-serif"
    font-weight={600}
    fill={TEXT}
  >
    {node.label}
  </text>
</g>
