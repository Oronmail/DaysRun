import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The first broadcast card lived at /board; the daily slide replaced it on 17 Sep 2026.
  // /w/4h and /w/7d were the Fleet page with one column of the ranking swapped; the table has carried all three paces at once since
  // 19 Sep 2026, so an address already shared still lands on the Fleet page.
  async redirects() { return [{ source: "/board", destination: "/dons-slide", permanent: false },
    { source: "/w/4h", destination: "/", permanent: true }, { source: "/w/7d", destination: "/", permanent: true }]; },
};

export default nextConfig;
