import { defineConfig } from "blume";
import { cloudflare } from "blume/deploy";
import { orama } from "blume/search";
import { filesystem } from "blume/sources";

export default defineConfig({
  title: "SignalGraph",
  description: "Documentation powered by Blume.",
  logo: {
    image: "/icon.svg",
    text: "SignalGraph"
  },
  github: {
    owner: "voffie",
    repo: "signalgraph",
    branch: "main",
    dir: "apps/docs"
  },
  theme: {
    accent: "#7c6fe0",
    background: "#050508",
    radius: "sm",
    mode: "system",
    toggle: false,
    fonts: {
      display: "geist",
      body: "geist",
      mono: "geist-mono"
    }
  },
  navigation: {
    sidebar: {
      display: "group"
    }
  },
  search: orama(),
  markdown: {
    imageZoom: true,
    code: {
      icons: true,
      wrap: false
    }
  },
  seo: {
    og: { enabled: true, logo: "/icon.svg" },
    rss: { enabled: false },
    sitemap: true,
    robots: true,
    structuredData: true
  },
  agents: {
    mcp: {
      enabled: true
    }
  },
  content: {
    sources: [filesystem({ root: "docs" })]
  },
  deployment: cloudflare({ site: "https://signalgraph-docs.voffie.workers.dev" })
});
