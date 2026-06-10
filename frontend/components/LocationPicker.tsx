"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";

interface Location {
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  pickup: Location | null;
  dropoff: Location | null;
  onPickupChange: (lat: number, lng: number) => void;
  onDropoffChange: (lat: number, lng: number) => void;
}

const DEFAULT_CENTER: [number, number] = [31.5204, 74.3587];

export default function LocationPicker({
  pickup,
  dropoff,
  onPickupChange,
  onDropoffChange,
}: LocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pickupMarkerRef = useRef<L.CircleMarker | null>(null);
  const dropoffMarkerRef = useRef<L.CircleMarker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const [activePoint, setActivePoint] = useState<"pickup" | "dropoff">("pickup");
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const cssId = "leaflet-cdn-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = L.map(mapContainerRef.current).setView(DEFAULT_CENTER, 13);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(mapRef.current);

    setMapReady(true);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const clickHandler = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (activePoint === "pickup") {
        onPickupChange(lat, lng);
      } else {
        onDropoffChange(lat, lng);
      }
    };

    map.off("click");
    map.on("click", clickHandler);
  }, [activePoint, onPickupChange, onDropoffChange, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (pickup) {
      if (!pickupMarkerRef.current) {
        pickupMarkerRef.current = L.circleMarker([pickup.lat, pickup.lng], {
          radius: 10,
          fillColor: "#3B82F6",
          color: "#1D4ED8",
          weight: 2,
          fillOpacity: 0.9,
        })
          .addTo(map)
          .bindPopup("<b>Pickup</b>");
      } else {
        pickupMarkerRef.current.setLatLng([pickup.lat, pickup.lng]);
      }
    } else if (pickupMarkerRef.current) {
      pickupMarkerRef.current.remove();
      pickupMarkerRef.current = null;
    }

    if (dropoff) {
      if (!dropoffMarkerRef.current) {
        dropoffMarkerRef.current = L.circleMarker([dropoff.lat, dropoff.lng], {
          radius: 10,
          fillColor: "#EF4444",
          color: "#B91C1C",
          weight: 2,
          fillOpacity: 0.9,
        })
          .addTo(map)
          .bindPopup("<b>Dropoff</b>");
      } else {
        dropoffMarkerRef.current.setLatLng([dropoff.lat, dropoff.lng]);
      }
    } else if (dropoffMarkerRef.current) {
      dropoffMarkerRef.current.remove();
      dropoffMarkerRef.current = null;
    }

    if (pickup && dropoff) {
      const latlngs: [number, number][] = [
        [pickup.lat, pickup.lng],
        [dropoff.lat, dropoff.lng],
      ];
      if (!routeLineRef.current) {
        routeLineRef.current = L.polyline(latlngs, {
          color: "#6B7280",
          weight: 3,
          dashArray: "5, 10",
          opacity: 0.6,
        }).addTo(map);
      } else {
        routeLineRef.current.setLatLngs(latlngs);
      }
    } else if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    const points: [number, number][] = [];
    if (pickup) points.push([pickup.lat, pickup.lng]);
    if (dropoff) points.push([dropoff.lat, dropoff.lng]);
    if (points.length === 2) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    } else if (points.length === 1) {
      map.setView(points[0], 14);
    }
  }, [pickup, dropoff, mapReady]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">Select Locations on Map</label>
        <div className="inline-flex rounded-md shadow-sm text-xs">
          <button
            type="button"
            onClick={() => setActivePoint("pickup")}
            className={`px-3 py-1.5 font-semibold rounded-l-md border transition-colors ${
              activePoint === "pickup"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            Pickup
          </button>
          <button
            type="button"
            onClick={() => setActivePoint("dropoff")}
            className={`px-3 py-1.5 font-semibold rounded-r-md border-t border-r border-b transition-colors ${
              activePoint === "dropoff"
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            Dropoff
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Click on the map to set the{" "}
        <span className={activePoint === "pickup" ? "text-blue-600 font-semibold" : "text-red-600 font-semibold"}>
          {activePoint}
        </span>{" "}
        location.
      </p>

      <div className="w-full h-[350px] rounded-lg overflow-hidden border border-gray-200 shadow-inner">
        <div ref={mapContainerRef} className="w-full h-full" style={{ zIndex: 1 }} />
      </div>

      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
          Pickup
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
          Dropoff
        </span>
      </div>
    </div>
  );
}
