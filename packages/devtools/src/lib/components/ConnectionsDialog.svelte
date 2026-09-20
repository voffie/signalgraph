<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import type { DataSourceProfile } from "$lib/server/db/dataSource";
  import { TRACE_VENDORS, type TraceVendor } from "$lib/telemetry/traces";
  import { cn } from "$lib/utils";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import CheckIcon from "@lucide/svelte/icons/check";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import { tick } from "svelte";

  import { moveListIndex } from "../listNavigation";

  let {
    open,
    onOpenChange,
    dataSources,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dataSources: Array<DataSourceProfile>;
  } = $props();

  type Step = "list" | "name" | "vendor" | "url";

  let step = $state<Step>("list");
  let selectedIndex = $state(0);
  let vendorIndex = $state(0);

  let editingCurrentName = $state<string | null>(null);
  let formName = $state("");
  let formVendor = $state<TraceVendor | null>(null);
  let formUrl = $state("");
  let error = $state<string | null>(null);
  let saving = $state(false);

  let listEl = $state<HTMLDivElement | null>(null);
  let vendorListEl = $state<HTMLDivElement | null>(null);
  let nameInputEl = $state<HTMLInputElement | null>(null);
  let vendorUrlEl = $state<HTMLInputElement | null>(null);

  function startCreate() {
    editingCurrentName = null;
    formName = "";
    formVendor = null;
    formUrl = "";
    vendorIndex = 0;
    error = null;
    step = "name";
  }

  function startEdit(row: DataSourceProfile) {
    editingCurrentName = row.name;
    formName = row.name;
    formVendor = row.vendor;
    formUrl = row.config.url;
    vendorIndex = Math.max(
      0,
      TRACE_VENDORS.findIndex((v) => v.value === row.vendor),
    );
    error = null;
    step = "name";
  }

  async function setActive(name: string) {
    const formData = new FormData();
    formData.set("name", name);
    await fetch("/settings?/setActive", { method: "POST", body: formData });
    await invalidateAll();
  }

  async function deleteConnection(name: string) {
    if (!confirm(`Delete connection "${name}"? This cannot be undone.`)) return;
    const formData = new FormData();
    formData.set("name", name);
    await fetch("/settings?/delete", { method: "POST", body: formData });
    await invalidateAll();
    selectedIndex = Math.max(0, Math.min(selectedIndex, dataSources.length - 1));
  }

  function handleListKeydown(e: KeyboardEvent) {
    if (e.key === "n") {
      e.preventDefault();
      startCreate();
      return;
    }

    switch (e.key) {
      case "ArrowDown":
      case "j":
        e.preventDefault();
        selectedIndex = moveListIndex(selectedIndex, "down", dataSources.length);
        break;
      case "ArrowUp":
      case "k":
        e.preventDefault();
        selectedIndex = moveListIndex(selectedIndex, "up", dataSources.length);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        setActive(dataSources[selectedIndex].name);
        break;
      case "e":
        e.preventDefault();
        startEdit(dataSources[selectedIndex]);
        break;
      case "d":
      case "Backspace":
        e.preventDefault();
        deleteConnection(dataSources[selectedIndex].name);
        break;
    }
  }

  function goToVendor() {
    if (!formName.trim()) {
      error = "Connection name is required.";
      return;
    }
    error = null;
    step = "vendor";
  }

  function handleVendorKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
      case "j":
        e.preventDefault();
        vendorIndex = Math.min(vendorIndex + 1, TRACE_VENDORS.length - 1);
        break;
      case "ArrowUp":
      case "k":
        e.preventDefault();
        vendorIndex = Math.max(vendorIndex - 1, 0);
        break;
      case "Enter":
        e.preventDefault();
        formVendor = TRACE_VENDORS[vendorIndex].value;
        step = "url";
        break;
      case "Escape":
        e.preventDefault();
        step = "name";
        break;
    }
  }

  async function save() {
    if (!formVendor) return;
    if (!formUrl.trim()) {
      error = "Vendor URL is required.";
      return;
    }

    saving = true;
    error = null;
    try {
      const formData = new FormData();
      if (editingCurrentName) {
        formData.set("currentName", editingCurrentName);
      }
      formData.set("name", formName.trim());
      formData.set("vendor", formVendor);
      formData.set("url", formUrl.trim());

      const res = await fetch("/settings?/save", { method: "POST", body: formData });
      const result = await res.json();

      if (result.type === "failure") {
        error = result.data?.error ?? "Something went wrong.";
        return;
      }

      await invalidateAll();
      step = "list";
    } finally {
      saving = false;
    }
  }

  function focusStep(currentStep: Step) {
    tick().then(() => {
      if (currentStep === "list") listEl?.focus();
      if (currentStep === "name") nameInputEl?.focus();
      if (currentStep === "vendor") vendorListEl?.focus();
      if (currentStep === "url") vendorUrlEl?.focus();
    });
  }

  $effect(() => {
    if (!open) return;

    const currentStep = step;
    focusStep(currentStep);
  });
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content
    onOpenAutoFocus={(event) => {
      event.preventDefault();
      focusStep(step);
    }}
    class="flex max-w-md flex-col gap-4 p-5">
    {#if step === "list"}
      <div class="flex items-center justify-between pr-8">
        <Dialog.Title class="text-sm font-semibold">Connections</Dialog.Title>
        <Button size="sm" variant="outline" class="gap-1.5" onclick={startCreate}>
          <PlusIcon class="size-3.5" />
          New
          <kbd class="text-muted-foreground ml-1 font-mono text-[10px]">n</kbd>
        </Button>
      </div>

      <div
        bind:this={listEl}
        role="listbox"
        tabindex="0"
        onkeydown={handleListKeydown}
        class="flex flex-col gap-0.5 outline-none">
        {#if dataSources.length === 0}
          <p class="text-muted-foreground p-2 text-sm">
            No connections yet. Press <kbd>n</kbd> or click New to add one.
          </p>
        {:else}
          {#each dataSources as source, i (source.name)}
            <div
              role="option"
              aria-selected={i === selectedIndex}
              class={cn(
                "flex items-center gap-3 rounded-md border-l-2 px-2.5 py-2 transition-colors",
                i === selectedIndex ? "border-l-primary bg-muted" : "border-l-transparent",
              )}>
              <button
                title={source.isActive ? "Active" : "Set active"}
                onclick={() => setActive(source.name)}
                class="flex size-5 shrink-0 items-center justify-center rounded-full border border-white/10">
                {#if source.isActive}
                  <CheckIcon class="text-primary size-3.5" />
                {/if}
              </button>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{source.name}</p>
                <p class="text-muted-foreground truncate font-mono text-xs">
                  {source.vendor} · {source.config.url}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-xs"
                onclick={() => startEdit(source)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive h-7 px-2 text-xs"
                onclick={() => deleteConnection(source.name)}>
                Delete
              </Button>
            </div>
          {/each}
        {/if}
      </div>
      {#if dataSources.length > 0}
        <p class="text-muted-foreground text-xs">
          ↑↓/j k move · Enter/Space set active · e edit · d delete
        </p>
      {/if}
    {:else if step === "name"}
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="icon" class="size-6" onclick={() => (step = "list")}>
          <ArrowLeftIcon class="size-3.5" />
        </Button>
        <h2 class="text-sm font-semibold">
          {editingCurrentName ? "Edit connection" : "New connection"}
        </h2>
      </div>
      <div class="flex flex-col gap-2">
        <Label for="conn-name">Connection name</Label>
        <Input
          id="conn-name"
          bind:value={formName}
          bind:ref={nameInputEl}
          placeholder="e.g. production, staging"
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              goToVendor();
            }
          }} />
      </div>
      {#if error}
        <p class="text-destructive text-xs">{error}</p>
      {/if}
      <div class="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onclick={() => (step = "list")}>Cancel</Button>
        <Button size="sm" onclick={goToVendor}>Next</Button>
      </div>
    {:else if step === "vendor"}
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="icon" class="size-6" onclick={() => (step = "name")}>
          <ArrowLeftIcon class="size-3.5" />
        </Button>
        <h2 class="text-sm font-semibold">Choose a vendor</h2>
      </div>
      <div
        bind:this={vendorListEl}
        role="listbox"
        tabindex="0"
        onkeydown={handleVendorKeydown}
        class="flex flex-col gap-0.5 outline-none">
        {#each TRACE_VENDORS as v, i (v.value)}
          <button
            role="option"
            aria-selected={i === vendorIndex}
            onclick={() => {
              formVendor = v.value;
              step = "url";
            }}
            class={cn(
              "flex items-center justify-between rounded-md border-l-2 px-3 py-2 text-left text-sm transition-colors",
              i === vendorIndex
                ? "border-l-primary bg-muted text-foreground"
                : "text-muted-foreground border-l-transparent",
            )}>
            {v.label}
            {#if v.value === formVendor}
              <CheckIcon class="text-primary size-3.5" />
            {/if}
          </button>
        {/each}
      </div>
      <p class="text-muted-foreground text-xs">↑↓/j k navigate · Enter select · Esc back</p>
    {:else if step === "url" && formVendor}
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="icon" class="size-6" onclick={() => (step = "vendor")}>
          <ArrowLeftIcon class="size-3.5" />
        </Button>
        <h2 class="text-sm font-semibold">
          {editingCurrentName ? "Edit connection" : "New connection"}
        </h2>
      </div>
      <div class="flex flex-col gap-2">
        <Label for="conn-url">Vendor URL</Label>
        <Input
          id="conn-url"
          bind:value={formUrl}
          bind:ref={vendorUrlEl}
          placeholder="http://localhost:3200"
          class="font-mono [font-variant-ligatures:none]"
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }} />
      </div>
      {#if error}
        <p class="text-destructive text-xs">{error}</p>
      {/if}
      <div class="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onclick={() => (step = "list")}>Cancel</Button>
        <Button size="sm" onclick={save} disabled={saving}>
          {saving ? "Saving..." : editingCurrentName ? "Save changes" : "Create connection"}
        </Button>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
