"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

interface PropertyMapProps {
  latitude: number;
  longitude: number;
  name?: string | null;
}

export default function PropertyMap({ latitude, longitude, name }: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [longitude, latitude],
      zoom: 14,
      interactive: false,
    });

    new maplibregl.Marker({ color: "#e11d48" })
      .setLngLat([longitude, latitude])
      .setPopup(new maplibregl.Popup({ offset: 16 }).setText(name ?? "Stay"))
      .addTo(map);

    return () => map.remove();
  }, [latitude, longitude, name]);

  return <div ref={containerRef} className="h-48 w-full rounded-lg" />;
}
