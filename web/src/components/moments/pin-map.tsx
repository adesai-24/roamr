"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import {
  MapLibreMap,
  Marker,
  NavigationControl,
  type LngLat,
  type MapMouseEvent,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

/** Dropping the optional pin. */

export interface Coordinates {
  lat: number;
  lng: number;
}

/** A keyless vector basemap. */
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/** Close enough to pick a building out, far enough to see which block it is on. */
const INITIAL_ZOOM = 14;

export interface PinMapProps {
  /** Where to open the map. */
  center: Coordinates;
  onChange: (value: Coordinates) => void;
}

export default function PinMap({ center, onChange }: PinMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Frozen at mount.
  const [origin] = useState(center);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new MapLibreMap({
      container,
      style: BASEMAP_STYLE,
      center: [origin.lng, origin.lat],
      zoom: INITIAL_ZOOM,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    const marker = new Marker({ draggable: true }).setLngLat([origin.lng, origin.lat]).addTo(map);

    const report = (value: LngLat) => {
      onChangeRef.current({ lat: value.lat, lng: value.lng });
    };

    // Tap to place and drag to fine-tune.
    marker.on("dragend", () => report(marker.getLngLat()));
    map.on("click", (event: MapMouseEvent) => {
      marker.setLngLat(event.lngLat);
      report(event.lngLat);
    });

    return () => {
      marker.remove();
      // Releases the WebGL context, which browsers cap at a handful per page.
      map.remove();
    };
  }, [origin]);

  return (
    <div
      ref={containerRef}
      // A fixed height because the map has no intrinsic size.
      className="border-border rounded-card h-64 w-full overflow-hidden border"
    />
  );
}
