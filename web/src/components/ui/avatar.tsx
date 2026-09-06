import { cn } from "@/lib/utils";

export type AvatarSize = "sm" | "md" | "lg";

const SIZE_STYLES: Record<AvatarSize, string> = {
  sm: "size-8 text-xs",
  md: "size-11 text-sm",
  lg: "size-16 text-lg",
};

/**
 * Up to two initials from a display name or username.
 *
 * Usernames are single tokens, so `mann_talati` and `mann.talati` are split on
 * their separators too -- otherwise every username-only account gets a single
 * letter and they all look alike in a feed.
 */
export function initialsFrom(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name
    .split(/[\s._-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return "?";
  const letters = parts.slice(0, 2).map((part) => Array.from(part)[0] ?? "");
  const initials = letters.join("").toUpperCase();
  return initials.length > 0 ? initials : "?";
}

export interface AvatarProps {
  /** A ready-to-use image URL. Storage paths must be signed before they get here. */
  src?: string | null;
  /** Display name or username; used for the fallback initials and the alt text. */
  name?: string | null;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ src, name, size = "md", className }: AvatarProps) {
  const label = name?.trim() || "Someone";

  return (
    <span
      className={cn(
        "border-border bg-surface-sunken text-muted inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border font-medium",
        SIZE_STYLES[size],
        className,
      )}
      title={name ? label : undefined}
    >
      {src ? (
        /* Avatar sources are short-lived signed Storage URLs. next/image can
           neither cache them nor match them against a static remotePatterns
           entry, and the optimiser would be re-fetching an expiring URL. */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="size-full object-cover" loading="lazy" />
      ) : (
        // Initials are a picture of a name, not the name itself. Hiding them
        // keeps a screen reader from spelling out "MT" next to the display name
        // that is almost always sitting right beside the avatar.
        <span aria-hidden="true">{initialsFrom(name)}</span>
      )}
    </span>
  );
}
