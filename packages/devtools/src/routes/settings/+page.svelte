<script lang="ts">
  import { enhance } from "$app/forms";

  let { data, form } = $props();
</script>

<main class="mx-auto max-w-md p-8">
  <h1 class="text-text mb-1 text-lg font-semibold">Data source</h1>
  <p class="text-text2 mb-5 text-xs">
    SignalGraph reads traces from a single collector. Configure it below.
  </p>

  <form method="POST" action="?/save" use:enhance class="flex flex-col gap-3">
    <label for="type" class="text-text2 text-[11px]">Collector</label>
    <select
      id="type"
      name="type"
      value={data.type ?? "tempo"}
      class="border-border bg-surface text-text rounded-md border px-2.5 py-2 text-sm">
      <option value="tempo">Tempo</option>
    </select>

    <label for="url" class="text-text2 text-[11px]">Collector URL</label>
    <input
      id="url"
      name="url"
      type="text"
      value={data.url ?? ""}
      placeholder="http://localhost:3200"
      required
      class="border-border bg-surface text-text rounded-md border px-2.5 py-2 font-mono text-sm" />

    {#if form?.error}
      <p class="text-xs text-red-500">{form.error}</p>
    {/if}

    <button type="submit" class="bg-accent mt-1 rounded-md px-3 py-2 font-semibold text-white">
      Save
    </button>
  </form>

  {#if data.type}
    <form method="POST" action="?/disconnect" use:enhance class="mt-3">
      <button type="submit" class="text-xs text-red-400 hover:underline">
        Disconnect data source
      </button>
    </form>
  {/if}
</main>
