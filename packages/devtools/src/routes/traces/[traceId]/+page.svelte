<script lang="ts">
  import type { PageData } from "./$types";
  import { parseTempoTrace } from "$lib/trace/backends/tempo";

  let { data }: { data: PageData } = $props();

  const trace = parseTempoTrace(data.trace);
</script>

<svelte:head>
  <title>Trace {trace.traceId}</title>
</svelte:head>

<h1>Trace ID: {trace.traceId}</h1>

<p>Duration: {trace.duration} ms</p>

{#each trace.spans as span}
  <div>
    <strong>{span.name}</strong>
    {span.duration} ms
  </div>
{/each}
