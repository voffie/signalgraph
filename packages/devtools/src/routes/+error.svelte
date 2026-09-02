<script lang="ts">
  import { page } from "$app/state";
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
  <div class="text-accent flex size-12 items-center justify-center rounded-full font-mono text-3xl">
    {page.status}
  </div>

  <div>
    <h1 class="text-text m-0 text-sm font-semibold">
      {page.status === 404 ? "Page not found" : "Something went wrong"}
    </h1>
    <p class="text-text2 mt-2 mb-0 max-w-sm text-xs leading-relaxed">
      {page.error?.message ?? "An unexpected error occurred."}
    </p>
  </div>

  <a href="/graph" class="bg-accent mt-1 rounded-md px-3 py-2 text-xs font-semibold text-white">
    Back to Graph
  </a>
</div>
