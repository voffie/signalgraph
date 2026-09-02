<script lang="ts">
  import { page } from "$app/state";
  import "./layout.css";

  let { data, children } = $props();

  const navItems = [
    {
      title: "Graph",
      href: "/graph",
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" /><circle cx="4" cy="6" r="2" /><circle cx="20" cy="6" r="2" />
        <circle cx="4" cy="18" r="2" /><circle cx="20" cy="18" r="2" />
        <path d="M6 6.5 9.5 10M14.5 10 18 6.5M6 17.5 9.5 14M14.5 14 18 17.5" />
      </svg>`,
    },
    {
      title: "Services",
      href: "/services",
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="5" rx="1" /><rect x="2" y="10" width="20" height="5" rx="1" /><rect x="2" y="17" width="20" height="5" rx="1" />
      </svg>`,
    },
    {
      title: "Traces",
      href: "/traces",
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>`,
    },
    {
      title: "Events",
      href: "/events",
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 4.5 13.5 11 13.5 9 22 18.5 10.5 12 10.5 13 2" />
      </svg>`,
    },
    {
      title: "Settings",
      href: "/settings",
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>`,
    },
  ];
</script>

<div class="flex h-screen w-screen overflow-hidden bg-bg font-sans text-text">
  <nav
    class="flex w-12 shrink-0 flex-col items-center gap-0.75 border-r border-r-border_hi bg-panel py-2.5"
  >
    {#each navItems as item (item.title)}
      <a
        href={item.href}
        title={item.title}
        class={`flex size-9 items-center justify-center rounded-lg border transition-all ${
          page.url.pathname.startsWith(item.href)
            ? "border-accent/38 bg-accent/18 text-accent"
            : "border-transparent bg-transparent text-muted"
        }`}
      >
        {@html item.icon}
      </a>
    {/each}
  </nav>

  <div class="flex min-w-0 flex-1 flex-col">
    {#if !data.hasDataSource && page.url.pathname !== "/settings"}
      <div
        class="flex items-center justify-between gap-3 border-b border-border_hi bg-panel px-4 py-2 text-xs text-text2"
      >
        <span
          >No data source configured - connect one to start exploring traces.</span
        >
        <a
          href="/settings"
          class="rounded-md bg-accent px-2.5 py-1 font-medium text-white"
        >
          Go to settings
        </a>
      </div>
    {/if}

    {@render children()}
  </div>
</div>
