import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The SQL files are read at runtime by the "Criar tabelas" button in the panel.
  outputFileTracingIncludes: {
    "/api/admin/setup": ["./supabase/migrations/**/*.sql"],
  },
  poweredByHeader: false,
  // The panel must never be framed (clickjacking). /embed gets its own CSP from proxy.ts.
  async headers() {
    return [
      {
        source: "/admin/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
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
