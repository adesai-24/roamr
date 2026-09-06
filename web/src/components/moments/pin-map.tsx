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

/**
 * Dropping the optional pin.
 *
 * Default-exported and kept in its own file so the page can pull it in with
 * `next/dynamic`. maplibre-gl is a few hundred kilobytes of WebGL renderer, and
 * most people never set a pin -- making everyone download it to skip it would
 * be the wrong trade on the phone this app is aimed at.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * A keyless vector basemap. Good enough to recognise a street on, and it needs
 * no token -- which matters because the Mapbox token is server-side config and
 * deliberately not exposed to the browser. Worth revisiting alongside a paid
 * tile plan if this ever sees real traffic.
 */
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/** Close enough to pick a building out, far enough to see which block it is on. */
const INITIAL_ZOOM = 14;

export interface PinMapProps {
  /** Where to open the map. The pin's current position, or the city centre. */
  center: Coordinates;
  onChange: (value: Coordinates) => void;
}

export default function PinMap({ center, onChange }: PinMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Frozen at mount. Re-centering as the person drags would fight them for
  // control of the viewport.
  const [origin] = useState(center);

  // Held in a ref so an inline handler from the parent does not tear the map
  // down and rebuild it on every render.
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

    // Tap to place and drag to fine-tune. Both matter: the first is how you use
    // this on a phone, the second is how you use it with a mouse.
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
      // A fixed height because the map has no intrinsic size; a container that
      // collapses to nothing renders a blank canvas with no error.
      className="border-border rounded-card h-64 w-full overflow-hidden border"
    />
  );
}
