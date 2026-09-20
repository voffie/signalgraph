<script lang="ts">
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import XIcon from "@lucide/svelte/icons/x";
</script>

<Empty.Root class="flex-1">
  <Empty.Header>
    <Empty.Media variant="icon">
      <XIcon />
    </Empty.Media>
    <Empty.Title>{page.status === 404 ? "Page not found" : "Something went wrong"}</Empty.Title>
    <Empty.Description>{page.error?.message ?? "An unexpected error occurred."}</Empty.Description>
  </Empty.Header>
  <Empty.Content>
    <div class="flex gap-2">
      <Button href="/" variant="link">Back to graph</Button>
    </div>
  </Empty.Content>
</Empty.Root>
