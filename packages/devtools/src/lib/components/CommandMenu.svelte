<script lang="ts">
  import * as Command from "$lib/components/ui/command/index.js";
  import DatabaseIcon from "@lucide/svelte/icons/database";
  import ListTreeIcon from "@lucide/svelte/icons/list-tree";
  import SettingsIcon from "@lucide/svelte/icons/settings";

  let {
    open,
    onOpenChange,
    onNavigate,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onNavigate: (destination: "connections" | "settings" | "trace") => void;
  } = $props();

  function route(destination: "connections" | "trace" | "settings") {
    onNavigate(destination);
  }
</script>

<Command.Dialog {open} {onOpenChange}>
  <Command.Input placeholder="Type a command or search..." />
  <Command.List>
    <Command.Empty>No results found.</Command.Empty>
    <Command.Group heading="Navigate">
      <Command.Item onSelect={() => route("trace")}>
        <ListTreeIcon class="size-4" />
        Switch trace
      </Command.Item>
      <Command.Item onSelect={() => route("connections")}>
        <DatabaseIcon class="size-4" />
        Switch connection
      </Command.Item>
    </Command.Group>
    <Command.Group heading="App">
      <Command.Item onSelect={() => route("settings")}>
        <SettingsIcon class="size-4" />
        Open settings
      </Command.Item>
    </Command.Group>
  </Command.List>
</Command.Dialog>
