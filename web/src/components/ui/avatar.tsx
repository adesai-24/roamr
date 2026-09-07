import { cn } from "@/lib/utils";

export type AvatarSize = "sm" | "md" | "lg";

const SIZE_STYLES: Record<AvatarSize, string> = {
  sm: "size-8 text-xs",
  md: "size-11 text-sm",
  lg: "size-16 text-lg",
};

/** Up to two initials from a display name or username. */
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
  /** A ready-to-use image URL. */
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
        /** Avatar sources are short-lived signed Storage URLs. */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="size-full object-cover" loading="lazy" />
      ) : (
        // Initials are a picture of a name, not the name itself.
        <span aria-hidden="true">{initialsFrom(name)}</span>
      )}
    </span>
  );
}
