"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";

interface Driver {
  id: string;
  name: string;
  status: string;
  live_location?: {
    lat: number;
    lng: number;
    speed?: number;
    heading?: number;
  };
}

interface Order {
  id: string;
  customer_id: string;
  status: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  assigned_driver_id?: string;
}

interface MapProps {
  drivers: Driver[];
  orders: Order[];
  center?: [number, number];
  zoom?: number;
}

export default function Map({ drivers, orders, center = [31.5204, 74.3587], zoom = 12 }: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker | L.CircleMarker | L.Polyline }>({});
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    // 1. Inject Leaflet CSS dynamically to prevent SSR/compilation styles issues
    const cssId = "leaflet-cdn-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    if (!mapContainerRef.current || mapRef.current) return;

    // 2. Initialize Leaflet Map
    mapRef.current = L.map(mapContainerRef.current).setView(center, zoom);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
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

  // Update markers when drivers or orders change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const currentMarkers = markersRef.current;
    const newKeys = new Set<string>();

    // 3. Render orders (Pickup, Dropoff, and Route Polyline)
    orders.forEach((order) => {
      const pickupKey = `order-pickup-${order.id}`;
      const dropoffKey = `order-dropoff-${order.id}`;
      const polylineKey = `order-route-${order.id}`;
      newKeys.add(pickupKey);
      newKeys.add(dropoffKey);
      newKeys.add(polylineKey);

      // Pickup marker (Circle)
      if (!currentMarkers[pickupKey]) {
        currentMarkers[pickupKey] = L.circleMarker([Number(order.pickup_lat), Number(order.pickup_lng)], {
          radius: 8,
          fillColor: "#3B82F6", // Blue
          color: "#1D4ED8",
          weight: 2,
          fillOpacity: 0.8,
        })
          .addTo(map)
          .bindPopup(`<b>Order Pickup</b><br/>Order: ${order.id.split("-")[0]}<br/>Status: ${order.status}`);
      } else {
        (currentMarkers[pickupKey] as L.CircleMarker).setLatLng([Number(order.pickup_lat), Number(order.pickup_lng)]);
      }

      // Dropoff marker (Circle)
      if (!currentMarkers[dropoffKey]) {
        currentMarkers[dropoffKey] = L.circleMarker([Number(order.dropoff_lat), Number(order.dropoff_lng)], {
          radius: 8,
          fillColor: "#EF4444", // Red
          color: "#B91C1C",
          weight: 2,
          fillOpacity: 0.8,
        })
          .addTo(map)
          .bindPopup(`<b>Order Dropoff</b><br/>Order: ${order.id.split("-")[0]}<br/>Status: ${order.status}`);
      } else {
        (currentMarkers[dropoffKey] as L.CircleMarker).setLatLng([Number(order.dropoff_lat), Number(order.dropoff_lng)]);
      }

      // Connecting line (Polyline)
      if (!currentMarkers[polylineKey]) {
        currentMarkers[polylineKey] = L.polyline(
          [
            [Number(order.pickup_lat), Number(order.pickup_lng)],
            [Number(order.dropoff_lat), Number(order.dropoff_lng)],
          ],
          {
            color: "#6B7280",
            weight: 3,
            dashArray: "5, 10",
            opacity: 0.6,
          }
        ).addTo(map);
      } else {
        (currentMarkers[polylineKey] as L.Polyline).setLatLngs([
          [Number(order.pickup_lat), Number(order.pickup_lng)],
          [Number(order.dropoff_lat), Number(order.dropoff_lng)],
        ]);
      }
    });

    // 4. Render drivers
    drivers.forEach((driver) => {
      const loc = driver.live_location;
      if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return;

      const driverKey = `driver-${driver.id}`;
      newKeys.add(driverKey);

      // Color mapping based on driver status
      let color = "#9CA3AF"; // Offline (Gray)
      if (driver.status === "available") color = "#10B981"; // Available (Green)
      if (driver.status === "busy") color = "#F59E0B"; // Busy (Orange)

      const speedInfo = loc.speed ? `<br/>Speed: ${loc.speed.toFixed(1)} km/h` : "";
      const popupText = `<b>Driver: ${driver.name}</b><br/>Status: ${driver.status}${speedInfo}`;

      if (!currentMarkers[driverKey]) {
        // Create custom SVG/HTML representation of vehicle marker
        const carIcon = L.divIcon({
          html: `
            <div style="
              width: 32px; 
              height: 32px; 
              background-color: ${color}; 
              border: 3px solid white; 
              border-radius: 50%; 
              box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); 
              display: flex; 
              align-items: center; 
              justify-content: center;
              transition: all 0.3s ease;
            ">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
                <circle cx="7" cy="17" r="2"/>
                <path d="M9 17h6"/>
                <circle cx="17" cy="17" r="2"/>
              </svg>
            </div>
          `,
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        currentMarkers[driverKey] = L.marker([loc.lat, loc.lng], { icon: carIcon })
          .addTo(map)
          .bindPopup(popupText);
      } else {
        const marker = currentMarkers[driverKey] as L.Marker;
        marker.setLatLng([loc.lat, loc.lng]);
        
        // Update popup text dynamically
        marker.setPopupContent(popupText);

        // Update color icon if status changes
        const carIcon = L.divIcon({
          html: `
            <div style="
              width: 32px; 
              height: 32px; 
              background-color: ${color}; 
              border: 3px solid white; 
              border-radius: 50%; 
              box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); 
              display: flex; 
              align-items: center; 
              justify-content: center;
              transition: all 0.3s ease;
            ">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
                <circle cx="7" cy="17" r="2"/>
                <path d="M9 17h6"/>
                <circle cx="17" cy="17" r="2"/>
              </svg>
            </div>
          `,
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        marker.setIcon(carIcon);
      }
    });

    // 5. Clean up stale/removed markers
    Object.keys(currentMarkers).forEach((key) => {
      if (!newKeys.has(key)) {
        currentMarkers[key].remove();
        delete currentMarkers[key];
      }
    });
  }, [drivers, orders, mapReady]);

  return (
    <div className="w-full h-full rounded-xl overflow-hidden shadow-inner border border-gray-200">
      <div ref={mapContainerRef} className="w-full h-full min-h-[400px]" style={{ zIndex: 1 }} />
    </div>
  );
}
