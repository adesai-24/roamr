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

/** A moment's photo, or the space where it would be. */
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
    /** next/image is the wrong tool here. */
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
