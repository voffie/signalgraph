<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { cn } from "$lib/utils.js";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import CheckIcon from "@lucide/svelte/icons/check";

  let { open, graphLookbackSeconds }: { open: boolean; graphLookbackSeconds: number } = $props();

  const LOOKBACK_OPTIONS = [
    { label: "Last 15 minutes", seconds: 15 * 60 },
    { label: "Last 1 hour", seconds: 60 * 60 },
    { label: "Last 6 hours", seconds: 6 * 60 * 60 },
    { label: "Last 24 hours", seconds: 24 * 60 * 60 },
    { label: "Last 3 days", seconds: 3 * 24 * 60 * 60 },
    { label: "Last 7 days", seconds: 7 * 24 * 60 * 60 },
    { label: "Last 30 days", seconds: 30 * 24 * 60 * 60 },
  ];

  const SETTINGS = [{ id: "lookback" as const, label: "Graph lookback window" }];

  type Step = "settings" | "lookback";
  let step = $state<Step>("settings");
  let settingIndex = $state(0);
  let valueIndex = $state(0);
  let listEl: HTMLDivElement | undefined = $state();
  let valueListEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (step === "settings") listEl?.focus();
    if (step === "lookback") {
      valueIndex = Math.max(
        0,
        LOOKBACK_OPTIONS.findIndex((o) => o.seconds === graphLookbackSeconds),
      );
      valueListEl?.focus();
    }
  });

  function lookbackLabel(seconds: number): string {
    return LOOKBACK_OPTIONS.find((o) => o.seconds === seconds)?.label ?? "Custom";
  }

  function handleSettingsKeydown(e: KeyboardEvent) {
    e.preventDefault();
    if (e.key === "ArrowDown" || e.key === "j") {
      settingIndex = Math.min(settingIndex + 1, SETTINGS.length - 1);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      settingIndex = Math.max(settingIndex - 1, 0);
    } else if (e.key === "Enter") {
      step = SETTINGS[settingIndex].id;
    }
  }

  async function selectLookback(seconds: number) {
    const formData = new FormData();
    formData.set("lookbackSeconds", String(seconds));
    await fetch("/settings?/saveGraphLookback", { method: "POST", body: formData });
    await invalidateAll();
    step = "settings";
  }

  function handleLookbackKeydown(e: KeyboardEvent) {
    e.preventDefault();
    if (e.key === "ArrowDown" || e.key === "j") {
      valueIndex = Math.min(valueIndex + 1, LOOKBACK_OPTIONS.length - 1);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      valueIndex = Math.max(valueIndex - 1, 0);
    } else if (e.key === "Enter") {
      selectLookback(LOOKBACK_OPTIONS[valueIndex].seconds);
    } else if (e.key === "Escape") {
      step = "settings";
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    onOpenAutoFocus={(e) => {
      e.preventDefault();
      if (step === "settings") listEl?.focus();
    }}
    class="flex max-w-md flex-col gap-4 p-5">
    {#if step === "settings"}
      <Dialog.Title class="text-sm font-semibold">Settings</Dialog.Title>
      <div
        bind:this={listEl}
        role="listbox"
        tabindex="0"
        onkeydown={handleSettingsKeydown}
        class="flex flex-col gap-0.5 outline-none">
        {#each SETTINGS as setting, i (setting.id)}
          <button
            role="option"
            aria-selected={i === settingIndex}
            onclick={() => (step = setting.id)}
            class={cn(
              "flex items-center justify-between rounded-md border-l-2 px-3 py-2 text-left text-sm transition-colors",
              i === settingIndex
                ? "border-l-primary bg-muted text-foreground"
                : "text-muted-foreground border-l-transparent",
            )}>
            {setting.label}
            <span class="text-muted-foreground font-mono text-xs"
              >{lookbackLabel(graphLookbackSeconds)}</span>
          </button>
        {/each}
      </div>
      <p class="text-muted-foreground text-xs">↑↓/j k navigate · Enter select</p>
    {:else if step === "lookback"}
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="icon" class="size-6" onclick={() => (step = "settings")}>
          <ArrowLeftIcon class="size-3.5" />
        </Button>
        <h2 class="text-sm font-semibold">Graph lookback window</h2>
      </div>
      <div
        bind:this={valueListEl}
        role="listbox"
        tabindex="0"
        onkeydown={handleLookbackKeydown}
        class="flex flex-col gap-0.5 outline-none">
        {#each LOOKBACK_OPTIONS as option, i (option.seconds)}
          <button
            role="option"
            aria-selected={i === valueIndex}
            onclick={() => selectLookback(option.seconds)}
            class={cn(
              "flex items-center justify-between rounded-md border-l-2 px-3 py-2 text-left text-sm transition-colors",
              i === valueIndex
                ? "border-l-primary bg-muted text-foreground"
                : "text-muted-foreground border-l-transparent",
            )}>
            {option.label}
            {#if option.seconds === graphLookbackSeconds}
              <CheckIcon class="text-primary size-3.5" />
            {/if}
          </button>
        {/each}
      </div>
      <p class="text-muted-foreground text-xs">↑↓/j k navigate · Enter select · Esc back</p>
    {/if}
  </Dialog.Content>
</Dialog.Root>
