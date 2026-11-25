import type { NextConfig } from "next";

// Everything in this app is per-request (dashboards, webhooks), so we use the
// classic dynamic rendering model instead of Cache Components.
const nextConfig: NextConfig = {
  experimental: {
    // Voice notes for the AI business setup agent (Vercel caps requests at 4.5MB; the recorder stays under 4MB).
    serverActions: { bodySizeLimit: "5mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
