import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes so a caller-supplied class wins over a component's
 * default instead of both landing in the DOM and the cascade picking a winner
 * at random.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
