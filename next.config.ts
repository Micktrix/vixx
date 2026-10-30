import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
