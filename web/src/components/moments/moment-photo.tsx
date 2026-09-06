import { cn } from "@/lib/utils";

export interface MomentPhotoProps {
  /** A signed Storage URL, or null when signing failed or the object is gone. */
  url: string | null;
  alt: string;
  /** Stored with the moment so the box is the right shape before the bytes land. */
  width: number;
  height: number;
  className?: string;
  /** The one image above the fold on a page should not be lazy. */
  eager?: boolean;
}

/**
 * A moment's photo, or the space where it would be.
 *
 * A missing URL renders a placeholder rather than a broken image icon: signed
 * URLs are minted per render and a failure to mint one is a server-side
 * hiccup, not something the person did.
 */
export function MomentPhoto({ url, alt, width, height, className, eager }: MomentPhotoProps) {
  const shared = cn("bg-surface-sunken w-full object-cover", className);

  if (!url) {
    return (
      <div
        className={cn(shared, "text-muted flex items-center justify-center text-xs")}
        style={{ aspectRatio: `${width} / ${height}` }}
        role="img"
        aria-label={`${alt} (unavailable)`}
      >
        Photo unavailable
      </div>
    );
  }

  return (
    /* next/image is the wrong tool here. These URLs expire in minutes, so the
       optimiser would be caching a link that dies, and no static remotePatterns
       entry can match a host that comes from runtime config. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={shared}
    />
  );
}
