<script lang="ts">
  import { page } from "$app/state";
</script>

<div
  class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
>
  <div
    class="flex size-12 items-center justify-center rounded-full font-mono text-3xl text-accent"
  >
    {page.status}
  </div>

  <div>
    <h1 class="m-0 text-sm font-semibold text-text">
      {page.status === 404 ? "Page not found" : "Something went wrong"}
    </h1>
    <p class="mb-0 mt-2 max-w-sm text-xs leading-relaxed text-text2">
      {page.error?.message ?? "An unexpected error occurred."}
    </p>
  </div>

  <a
    href="/graph"
    class="mt-1 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white"
  >
    Back to Graph
  </a>
</div>
