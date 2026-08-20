<script lang="ts">
  let data: unknown = $state(null);
  let error: string | null = $state(null);

  async function loadTraces() {
    try {
      const response = await fetch("/api/tempo/search");

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      data = await response.json();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  loadTraces();
</script>

<h1>SignalGraph DevTools</h1>

<button onclick={loadTraces}>
  Fetch traces
</button>

{#if error}
  <p>{error}</p>
{:else if data}
  <pre>{JSON.stringify(data, null, 2)}</pre>
{:else}
  <p>Loading...</p>
{/if}
