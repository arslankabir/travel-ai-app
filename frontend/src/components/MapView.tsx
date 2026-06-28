"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import maplibregl, { Map, GeoJSONSource, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { ListingCard } from "@/lib/api";

export interface MapViewHandle {
  fitToListings: (listings: ListingCard[]) => void;
}

interface MapViewProps {
  items: ListingCard[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onBboxChange: (bbox: string | undefined) => void;
}

const STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const MARKER_LAYERS = ["listings-unclustered", "listing-price"] as const;

function listingsToGeoJSON(items: ListingCard[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: items
      .filter((item) => item.latitude != null && item.longitude != null)
      .map((item) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [Number(item.longitude), Number(item.latitude)],
        },
        properties: {
          id: item.id,
          price: item.price,
          name: item.name ?? "Stay",
        },
      })),
  };
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

function popupHtml(name: string, price: number) {
  return `<div style="font-family:system-ui,sans-serif;font-size:12px;line-height:1.4;max-width:200px">
    <strong style="display:block;margin-bottom:4px;color:#18181b">${name}</strong>
    <span style="color:#52525b">${formatPrice(price)} / night</span>
    <div style="margin-top:6px;color:#be123c;font-size:11px">Click to open details</div>
  </div>`;
}

function listingCoords(items: ListingCard[]): Array<[number, number]> {
  return items
    .map((item) => [Number(item.longitude), Number(item.latitude)] as [number, number])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) && (lat !== 0 || lng !== 0));
}

export function fitMapToItems(map: Map, items: ListingCard[]) {
  const coords = listingCoords(items);
  if (coords.length === 0) return;

  map.resize();

  if (coords.length === 1) {
    map.flyTo({
      center: coords[0],
      zoom: 14,
      duration: 1200,
      essential: true,
    });
    return;
  }

  const bounds = coords.reduce(
    (b, coord) => b.extend(coord),
    new maplibregl.LngLatBounds(coords[0], coords[0]),
  );

  map.fitBounds(bounds, {
    padding: { top: 80, bottom: 80, left: 60, right: 60 },
    maxZoom: 14,
    duration: 1200,
    essential: true,
  });
}

function waitForListingsSource(map: Map, cb: () => void, attemptsLeft = 60) {
  if (map.getSource("listings")) {
    cb();
    return;
  }
  if (attemptsLeft <= 0) return;
  requestAnimationFrame(() => waitForListingsSource(map, cb, attemptsLeft - 1));
}

const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { items, hoveredId, onHover, onBboxChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useImperativeHandle(ref, () => ({
    fitToListings(listings: ListingCard[]) {
      const map = mapRef.current;
      if (!map || listings.length === 0) return;

      const run = () => {
        const source = map.getSource("listings") as GeoJSONSource | undefined;
        source?.setData(listingsToGeoJSON(listings));
        fitMapToItems(map, listings);
      };

      if (map.isStyleLoaded() && map.getSource("listings")) {
        run();
        window.setTimeout(run, 150);
        return;
      }

      if (!map.isStyleLoaded()) {
        map.once("load", () => waitForListingsSource(map, run));
        return;
      }

      waitForListingsSource(map, run);
    },
  }));

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("listings-unclustered")) return;

    map.setPaintProperty("listings-unclustered", "circle-radius", [
      "case",
      ["==", ["get", "id"], hoveredId ?? ""],
      10,
      7,
    ]);
    map.setPaintProperty("listings-unclustered", "circle-stroke-color", [
      "case",
      ["==", ["get", "id"], hoveredId ?? ""],
      "#fbbf24",
      "#ffffff",
    ]);
    map.setPaintProperty("listings-unclustered", "circle-color", [
      "case",
      ["==", ["get", "id"], hoveredId ?? ""],
      "#e11d48",
      "#be123c",
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
    popupRef.current = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "listing-map-popup",
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const openListing = (id: string) => {
      window.open(`/property/${id}`, "_blank", "noopener,noreferrer");
    };

    const showPopup = (id: string, lngLat: maplibregl.LngLatLike) => {
      const listing = itemsRef.current.find((item) => item.id === id);
      if (!listing || !popupRef.current) return;
      popupRef.current
        .setLngLat(lngLat)
        .setHTML(popupHtml(listing.name ?? "Stay", listing.price))
        .addTo(map);
    };

    const hidePopup = () => {
      popupRef.current?.remove();
    };

    map.on("load", () => {
      map.addSource("listings", {
        type: "geojson",
        data: listingsToGeoJSON(itemsRef.current),
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
        const id = rawId != null ? String(rawId) : null;
        if (id && hoveredRef.current !== id) {
          hoveredRef.current = id;
          onHover(id);
        }
        if (id && e.lngLat) {
          showPopup(id, e.lngLat);
        }
      });

      map.on("mouseleave", "listings-unclustered", () => {
        map.getCanvas().style.cursor = "";
        hoveredRef.current = null;
        onHover(null);
        hidePopup();
      });

      map.on("click", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [...MARKER_LAYERS],
        });
        const rawId = features[0]?.properties?.id;
        const id = rawId != null ? String(rawId) : null;
        if (id) openListing(id);
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

      map.resize();
    });

    const emitBbox = () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      onBboxChange(`${sw.lng},${sw.lat},${ne.lng},${ne.lat}`);
    };

    map.on("moveend", emitBbox);

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [onBboxChange, onHover]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyData = () => {
      waitForListingsSource(map, () => {
        const source = map.getSource("listings") as GeoJSONSource;
        source.setData(listingsToGeoJSON(items));
      });
    };

    if (map.isStyleLoaded()) {
      applyData();
    } else {
      map.once("load", applyData);
    }
  }, [items]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hoveredId || !map.isStyleLoaded()) {
      popupRef.current?.remove();
      return;
    }
    const listing = items.find((item) => item.id === hoveredId);
    if (!listing || listing.latitude == null || listing.longitude == null) return;
    popupRef.current
      ?.setLngLat([Number(listing.longitude), Number(listing.latitude)])
      .setHTML(popupHtml(listing.name ?? "Stay", listing.price))
      .addTo(map);
  }, [hoveredId, items]);

  return <div ref={containerRef} className="h-full w-full" />;
});

export default MapView;
