import type { NextConfig } from "next";

// Everything in this app is per-request (dashboards, webhooks), so we use the
// classic dynamic rendering model instead of Cache Components.
const nextConfig: NextConfig = {
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
