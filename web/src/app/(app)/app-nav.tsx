"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Feed and Places are the two halves of the README's core loop; Trips is the
 * optional grouping over them. Places is live; the rest land in later PRs --
 * the links exist now so the shape of the app is visible from the first screen.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/feed", label: "Feed" },
  { href: "/places", label: "Places" },
  { href: "/trips", label: "Trips" },
  { href: "/profile", label: "Profile" },
];

export function AppNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <ul className={cn("flex items-stretch", className)}>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              // aria-current is what tells a screen reader which tab you are on;
              // the colour change alone says it to sighted users only.
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-card flex min-h-11 items-center justify-center px-3 text-sm font-medium transition-colors",
                "focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2",
                active ? "text-accent" : "text-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
