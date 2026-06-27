"use client";

import { useEffect, useRef } from "react";
import maplibregl, { Map, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { ListingCard } from "@/lib/api";

interface MapViewProps {
  items: ListingCard[];
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  onBboxChange: (bbox: string | undefined) => void;
}

const STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

function listingsToGeoJSON(items: ListingCard[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      id: item.id,
      geometry: {
        type: "Point",
        coordinates: [item.longitude, item.latitude],
      },
      properties: {
        id: item.id,
        price: item.price,
        name: item.name ?? "Stay",
      },
    })),
  };
}

export default function MapView({
  items,
  hoveredId,
  onHover,
  onBboxChange,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const hoveredRef = useRef<number | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("listings-unclustered")) return;

    map.setPaintProperty("listings-unclustered", "circle-radius", [
      "case",
      ["==", ["get", "id"], hoveredId ?? -1],
      10,
      7,
    ]);
    map.setPaintProperty("listings-unclustered", "circle-stroke-color", [
      "case",
      ["==", ["get", "id"], hoveredId ?? -1],
      "#fbbf24",
      "#ffffff",
    ]);
  }, [hoveredId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [-9.14, 38.72],
      zoom: 11,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("listings", {
        type: "geojson",
        data: listingsToGeoJSON([]),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "listings",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#e11d48",
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
          "circle-opacity": 0.85,
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "listings",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: "listings-unclustered",
        type: "circle",
        source: "listings",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#be123c",
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });

      map.addLayer({
        id: "listing-price",
        type: "symbol",
        source: "listings",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["concat", "€", ["to-string", ["round", ["get", "price"]]]],
          "text-size": 11,
          "text-offset": [0, 1.4],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#3f3f46",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1,
        },
      });

      map.on("mousemove", "listings-unclustered", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = e.features?.[0];
        const rawId = feature?.properties?.id;
        const id = typeof rawId === "number" ? rawId : Number(rawId);
        if (Number.isFinite(id) && hoveredRef.current !== id) {
          hoveredRef.current = id;
          onHover(id);
        }
      });

      map.on("mouseleave", "listings-unclustered", () => {
        map.getCanvas().style.cursor = "";
        hoveredRef.current = null;
        onHover(null);
      });

      map.on("click", "clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const clusterId = features[0]?.properties?.cluster_id;
        const source = map.getSource("listings") as GeoJSONSource;
        if (clusterId == null) return;
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const geometry = features[0].geometry;
          if (geometry.type === "Point") {
            map.easeTo({ center: geometry.coordinates as [number, number], zoom });
          }
        });
      });
    });

    const emitBbox = () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      onBboxChange(`${sw.lng},${sw.lat},${ne.lng},${ne.lat}`);
    };

    map.on("moveend", emitBbox);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onBboxChange, onHover]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource("listings") as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(listingsToGeoJSON(items));
  }, [items]);

  return <div ref={containerRef} className="h-full w-full" />;
}
