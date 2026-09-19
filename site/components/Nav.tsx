// site/components/Nav.tsx — the menu. On a desk it is a row of links. On a phone nine links wrapped over three rows and pushed the
// page down by a third of the screen, so there it is ONE row that is swiped sideways, fading out at the right edge to show that it
// goes on. A client component only to bring the current page's link into view when a page opens.
"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { DESKTOP_ONLY } from "@/lib/nav";
export default function Nav({ items, active }: { items: [string, string][]; active: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { const nav = ref.current, el = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && el && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = el.offsetLeft - nav.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2; }, [active]);
  return <nav ref={ref} className="wrap mont site-nav" aria-label="Pages">
    {items.map(([n, href]) => <Link key={n} href={href} className={DESKTOP_ONLY.includes(href) ? "only-desktop-inline" : undefined} aria-current={n === active ? "page" : undefined}>{n}</Link>)}
  </nav>;
}
