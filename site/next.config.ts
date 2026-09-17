import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The first broadcast card lived at /board; the daily slide replaced it on 17 Sep 2026.
  async redirects() { return [{ source: "/board", destination: "/dons-slide", permanent: false }]; },
};

export default nextConfig;
