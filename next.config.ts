import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Færdselsstyrelsens modulplaner (PDF) læses fra disken, når en plan udfyldes.
  outputFileTracingIncludes: {
    "/api/modulplan/[studentId]": ["./src/lib/modulplan/templates/*.pdf"],
  },
  // Cache Components er slået fra: næsten alle sider ligger bag login og er dynamiske,
  // og klassisk server-rendering holder login-tjekket enkelt.
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
