"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import styles from "./app.module.css";

export interface NavItem {
  href: string;
  label: string;
}

/** Feed and Places are the two halves of the README's core loop. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/feed", label: "Feed" },
  { href: "/places", label: "Places" },
  { href: "/trips", label: "Trips" },
  { href: "/friends", label: "Friends" },
  { href: "/profile", label: "Profile" },
];

export function AppNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <ul className={cn(styles.navList, className)}>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              // aria-current is what tells a screen reader which tab you are on.
              aria-current={active ? "page" : undefined}
              className={styles.navLink}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
