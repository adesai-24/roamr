"use client";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import type { Coordinates } from "./pin-map";

/**
 * The optional pin, and the machinery for keeping it optional.
 *
 * `ssr: false` plus a dynamic import means maplibre-gl is a separate chunk that
 * is only requested once somebody actually opens the map. The README calls the
 * pin an optional extra "for people who want to mark exactly where a photo was
 * taken", which is a minority -- everyone else should not be paying for a map
 * renderer to reach the save button.
 */
const PinMap = dynamic(() => import("./pin-map"), {
  ssr: false,
  loading: () => (
    <div className="border-border bg-surface-sunken rounded-card text-muted flex h-64 items-center justify-center border text-sm">
      Loading the map…
    </div>
  ),
});

export interface PinFieldProps {
  value: Coordinates | null;
  onChange: (value: Coordinates | null) => void;
  /**
   * Where the map opens: the photo's own GPS if it had any, the city centre
   * otherwise. Null means there is nowhere sensible to open it yet.
   */
  suggested: Coordinates | null;
  disabled?: boolean;
}

function format(value: number): string {
  // Five decimal places is a little over a metre. More is false precision for
  // a point someone tapped with a thumb.
  return value.toFixed(5);
}

export function PinField({ value, onChange, suggested, disabled }: PinFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Pin</span>
        <span className="text-muted text-sm">
          Optional. The city is what the moment gets filed under either way.
        </span>
      </div>

      {value ? (
        <>
          <PinMap center={value} onChange={onChange} />
          <div className="flex flex-wrap items-center gap-3">
            {/* The coordinates in text are not decoration: the map itself is not
                reachable without a pointer, so this is the part of the control
                that a screen reader and a keyboard can both use. */}
            <p className="text-muted text-sm" aria-live="polite">
              Pinned at {format(value.lat)}, {format(value.lng)}
            </p>
            <Button variant="ghost" size="sm" onClick={() => onChange(null)} disabled={disabled}>
              Remove pin
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={disabled || !suggested}
            onClick={() => suggested && onChange(suggested)}
          >
            Add an exact pin
          </Button>
          {!suggested ? (
            <p className="text-muted text-sm">
              Choose a city first so the map knows where to open.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
