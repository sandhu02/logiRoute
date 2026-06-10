"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "../../../lib/api";
import { io, Socket } from "socket.io-client";
import dynamic from "next/dynamic";

const Map = dynamic(() => import("../../../components/Map"), { ssr: false });

export default function DriverDashboard() {
  const router = useRouter();
  const [driver, setDriver] = useState<any>(null);
  const [status, setStatus] = useState("offline");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Real-time dispatch offer state
  const [offer, setOffer] = useState<any>(null);
  const [countdown, setCountdown] = useState(30);

  // Active order state
  const [activeOrder, setActiveOrder] = useState<any>(null);

  // Location tracking state
  const [gpsLatitude, setGpsLatitude] = useState(31.5204);
  const [gpsLongitude, setGpsLongitude] = useState(74.3587);
  const [isSimulating, setIsSimulating] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const trackingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const simulationStepRef = useRef(0);
  const statusRef = useRef(status);
  const gpsRef = useRef({ lat: gpsLatitude, lng: gpsLongitude });

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    gpsRef.current = { lat: gpsLatitude, lng: gpsLongitude };
  }, [gpsLatitude, gpsLongitude]);

  const pushLocationUpdate = (driverStatus: string, lat?: number, lng?: number) => {
    if (!socketRef.current?.connected || driverStatus === "offline") return;

    const coords = {
      lat: lat ?? gpsRef.current.lat,
      lng: lng ?? gpsRef.current.lng,
    };

    socketRef.current.emit("driver:location:update", {
      lat: coords.lat,
      lng: coords.lng,
      heading: Math.floor(Math.random() * 360),
      speed: driverStatus === "busy" ? 45 : 0,
      status: driverStatus,
    });
  };

  useEffect(() => {
    // 1. Verify driver session
    const role = localStorage.getItem("user_role");
    const token = localStorage.getItem("jwt_token");
    const driverId = localStorage.getItem("driver_id");

    if (!token || role !== "driver" || !driverId) {
      router.push("/login");
      return;
    }

    loadDriverData(driverId);
  }, []);

  // Set up socket connection and location tracking when driver data is loaded
  useEffect(() => {
    if (!driver) return;

    const token = localStorage.getItem("jwt_token") || "";
    const driverId = driver.id;
    const tenantId = driver.tenant_id;

    // Connect to WebSocket Server
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";
    const socket = io(socketUrl, {
      path: "/socket.io",
      auth: {
        token: token,
        clientType: "driver",
      },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Socket connected for driver:", socket.id);
      if (statusRef.current !== "offline") {
        pushLocationUpdate(statusRef.current);
      }
    });

    socket.on("connected", (data) => {
      console.log("Socket acknowledgment received:", data);
    });

    // Listen for incoming dispatch offers in real-time
    socket.on("dispatch:offer", (data: any) => {
      console.log("Incoming offer payload:", data);
      
      if (data.accepted_by_other || data.expired || data.expired_by_timeout) {
        // Clear active offer if taken or expired
        setOffer(null);
        setCountdown(30);
      } else if (data.offer_id) {
        // Set new offer and start countdown
        setOffer(data);
        setCountdown(data.expires_in || 30);
      }
    });

    // Handle order updates (e.g. if dispatcher cancels or updates order)
    socket.on("order:updated", (order: any) => {
      if (activeOrder && order.id === activeOrder.id) {
        setActiveOrder(order);
        if (order.status === "cancelled" || order.status === "delivered") {
          setActiveOrder(null);
        }
      }
    });

    // Initialize position tracking updates loop
    startTrackingUpdates();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [driver]);

  // Handle offer countdown timer
  useEffect(() => {
    if (!offer) {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }

    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setOffer(null);
          clearInterval(countdownIntervalRef.current!);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [offer]);

  const loadDriverData = async (driverId: string) => {
    try {
      const data = await fetchApi(`/drivers/${driverId}`);
      setDriver(data);
      setStatus(data.status);
      statusRef.current = data.status;

      // Check if there are any assigned orders already for this driver
      const ordersData = await fetchApi("/orders");
      const ordersArray = Array.isArray(ordersData) ? ordersData : (ordersData.rows || []);
      const active = ordersArray.find(
        (o: any) => o.assigned_driver_id === driverId && o.status !== "delivered" && o.status !== "cancelled"
      );
      if (active) {
        setActiveOrder(active);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!driver) return;
    try {
      await fetchApi(`/drivers/${driver.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setStatus(newStatus);

      if (socketRef.current?.connected) {
        socketRef.current.emit("driver:status:update", {
          status: newStatus,
          orderId: activeOrder?.id || null,
        });
        pushLocationUpdate(newStatus);
      }
    } catch (err: any) {
      alert(err.message || "Failed to update status.");
    }
  };

  // Accept incoming offer
  const handleAcceptOffer = async () => {
    if (!offer || !driver) return;
    try {
      const result = await fetchApi("/dispatch/accept", {
        method: "POST",
        body: JSON.stringify({
          order_id: offer.order_id,
          offer_id: offer.offer_id,
        }),
      });

      alert("Offer accepted successfully!");
      setActiveOrder(result.order);
      setOffer(null);
      setStatus("busy");
      
      // Update socket status
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("driver:status:update", {
          status: "busy",
          orderId: offer.order_id,
        });
      }
      simulationStepRef.current = 0;
    } catch (err: any) {
      alert(err.message || "Failed to accept offer.");
      setOffer(null);
    }
  };

  // Decline incoming offer
  const handleDeclineOffer = async () => {
    if (!offer) return;
    try {
      await fetchApi("/dispatch/decline", {
        method: "POST",
        body: JSON.stringify({
          order_id: offer.order_id,
          offer_id: offer.offer_id,
        }),
      });
      setOffer(null);
    } catch (err: any) {
      console.error("Decline offer error:", err);
      setOffer(null);
    }
  };

  // Update Active Order Status
  const handleUpdateOrderStatus = async (newStatus: string) => {
    if (!activeOrder) return;
    try {
      // Fetch current token user ID
      const updatedOrder = await fetchApi(`/orders/${activeOrder.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setActiveOrder(updatedOrder);

      if (newStatus === "delivered" || newStatus === "cancelled") {
        setActiveOrder(null);
        // Switch status back to available
        handleStatusChange("available");
      }
    } catch (err: any) {
      alert(err.message || "Failed to update order status.");
    }
  };

  // Tracking Updates loop (Every 4 seconds)
  const startTrackingUpdates = () => {
    if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);

    trackingIntervalRef.current = setInterval(() => {
      if (isSimulating) {
        let lat = gpsLatitude;
        let lng = gpsLongitude;

        // Simulate coordinates movement
        if (activeOrder) {
          // If moving to Pickup vs Dropoff
          const targetLat = activeOrder.status === "assigned" 
            ? Number(activeOrder.pickup_lat) 
            : Number(activeOrder.dropoff_lat);
          const targetLng = activeOrder.status === "assigned" 
            ? Number(activeOrder.pickup_lng) 
            : Number(activeOrder.dropoff_lng);

          const startLat = activeOrder.status === "assigned" 
            ? (driver ? Number(gpsLatitude) : 31.5204) 
            : Number(activeOrder.pickup_lat);
          const startLng = activeOrder.status === "assigned" 
            ? (driver ? Number(gpsLongitude) : 74.3587) 
            : Number(activeOrder.pickup_lng);

          simulationStepRef.current += 1;
          const totalSteps = 15; // Complete route in 15 updates (~1 minute)
          const fraction = Math.min(simulationStepRef.current / totalSteps, 1);

          lat = startLat + (targetLat - startLat) * fraction;
          lng = startLng + (targetLng - startLng) * fraction;

          // Add a tiny random offset to make it look realistic
          if (fraction < 1) {
            lat += (Math.random() - 0.5) * 0.0002;
            lng += (Math.random() - 0.5) * 0.0002;
          }
        } else {
          // Random walk simulation when idle
          lat += (Math.random() - 0.5) * 0.0005;
          lng += (Math.random() - 0.5) * 0.0005;
        }

        setGpsLatitude(lat);
        setGpsLongitude(lng);

        if (statusRef.current !== "offline") {
          pushLocationUpdate(statusRef.current, lat, lng);
        }
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const currentLat = position.coords.latitude;
            const currentLng = position.coords.longitude;
            setGpsLatitude(currentLat);
            setGpsLongitude(currentLng);
            if (statusRef.current !== "offline") {
              pushLocationUpdate(statusRef.current, currentLat, currentLng);
            }
          },
          () => {
            if (statusRef.current !== "offline") {
              pushLocationUpdate(statusRef.current);
            }
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      } else if (statusRef.current !== "offline") {
        pushLocationUpdate(statusRef.current);
      }
    }, 4000);
  };

  // Trigger tracking restarts when simulation/coords state changes
  useEffect(() => {
    if (driver) {
      startTrackingUpdates();
    }
  }, [gpsLatitude, gpsLongitude, isSimulating, activeOrder, status]);

  if (loading) return <div className="p-8 text-center">Loading Driver Dashboard...</div>;
  if (error) return <div className="p-8 text-center text-red-500 bg-red-50 m-6 rounded-lg">{error}</div>;
  if (!driver) return <div className="p-8 text-center">Driver session not found. Please log in.</div>;

  const driverForMap = driver ? [{
    id: driver.id,
    name: driver.name,
    status: status,
    live_location: {
      lat: gpsLatitude,
      lng: gpsLongitude,
      speed: status === "busy" ? 45 : 0
    }
  }] : [];

  const ordersForMap = activeOrder ? [activeOrder] : [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-xl border border-gray-200 shadow-sm gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Driver Console</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time Dispatch & Telemetry Portal</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">Status:</span>
          <div className="inline-flex rounded-md shadow-sm">
            <button
              onClick={() => handleStatusChange("offline")}
              className={`px-4 py-2 text-xs font-semibold rounded-l-md transition-colors ${
                status === "offline" ? "bg-gray-800 text-white" : "bg-white text-gray-700 border hover:bg-gray-50"
              }`}
            >
              Offline
            </button>
            <button
              onClick={() => handleStatusChange("available")}
              className={`px-4 py-2 text-xs font-semibold transition-colors ${
                status === "available" ? "bg-green-600 text-white" : "bg-white text-gray-700 border-t border-b hover:bg-gray-50"
              }`}
            >
              Available
            </button>
            <button
              onClick={() => handleStatusChange("busy")}
              className={`px-4 py-2 text-xs font-semibold rounded-r-md transition-colors ${
                status === "busy" ? "bg-amber-500 text-white" : "bg-white text-gray-700 border hover:bg-gray-50"
              }`}
            >
              Busy
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Driver Info & GPS controls */}
        <div className="md:col-span-1 space-y-6">
          {/* Driver Profile */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 border-b pb-3 mb-4">Driver Profile</h2>
            <div className="space-y-3 text-sm">
              <p className="text-gray-500">Name</p>
              <p className="font-semibold text-gray-800">{driver.name}</p>
              
              <p className="text-gray-500 mt-2">Phone</p>
              <p className="font-semibold text-gray-800">{driver.phone}</p>
              
              <p className="text-gray-500 mt-2">Email</p>
              <p className="font-semibold text-gray-800">{driver.email}</p>

              <div className="pt-3 border-t">
                <span className="text-xs text-gray-400 block">API Key</span>
                <code className="text-xs text-gray-600 break-all select-all block bg-gray-50 p-2 rounded mt-1 border">
                  {localStorage.getItem("driver_api_key") || driver.api_key}
                </code>
              </div>
            </div>
          </div>

          {/* GPS Status & Telemetry Simulator */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 border-b pb-3 mb-4">Telemetry Stream</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600 font-medium">GPS Simulation Mode</span>
                <input
                  type="checkbox"
                  checked={isSimulating}
                  onChange={(e) => setIsSimulating(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
              </div>

              <div className="bg-gray-50 p-3 rounded border text-xs font-mono space-y-2">
                <p>LAT: <span className="text-blue-600">{gpsLatitude.toFixed(6)}</span></p>
                <p>LNG: <span className="text-blue-600">{gpsLongitude.toFixed(6)}</span></p>
                <p>SPEED: <span className="text-blue-600">{status === "busy" ? "48.2 km/h" : "0 km/h"}</span></p>
                <p>STREAMING: <span className={status !== "offline" ? "text-green-600" : "text-red-500 font-bold"}>
                  {status !== "offline" ? "ACTIVE (4s)" : "PAUSED (OFFLINE)"}
                </span></p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Columns: Offers & Active Order */}
        <div className="md:col-span-2 space-y-6">
          {/* Dispatch Offer Card */}
          {offer && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm relative overflow-hidden animate-pulse">
              <div className="absolute top-0 left-0 h-1.5 bg-blue-600 transition-all" style={{ width: `${(countdown / 30) * 100}%` }} />
              
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-1.5 rounded-full uppercase tracking-wider">
                    New Dispatch Offer
                  </span>
                  <h3 className="text-xl font-extrabold text-gray-900 mt-3">
                    Order {offer.order_id.split("-")[0]}
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-blue-600">{countdown}s</span>
                  <p className="text-xs text-gray-500">expires</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                <div className="bg-white p-3 rounded-lg border">
                  <span className="font-semibold text-gray-500 block mb-1 text-xs">Pickup Coordinates</span>
                  Lat: {Number(offer.pickup.lat).toFixed(4)}<br/>Lng: {Number(offer.pickup.lng).toFixed(4)}
                </div>
                <div className="bg-white p-3 rounded-lg border">
                  <span className="font-semibold text-gray-500 block mb-1 text-xs">Dropoff Coordinates</span>
                  Lat: {Number(offer.dropoff.lat).toFixed(4)}<br/>Lng: {Number(offer.dropoff.lng).toFixed(4)}
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleAcceptOffer}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-md transition-colors"
                >
                  Accept & Dispatch
                </button>
                <button
                  onClick={handleDeclineOffer}
                  className="flex-1 bg-white hover:bg-gray-100 text-gray-800 border font-bold py-2.5 px-4 rounded-lg shadow-sm transition-colors"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Active Assigned Order Card */}
          {activeOrder ? (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
              <div className="flex justify-between items-center border-b pb-4">
                <div>
                  <span className="text-xs font-semibold text-gray-400 uppercase">Active Dispatch Order</span>
                  <h3 className="text-lg font-bold text-gray-800 mt-1">ID: {activeOrder.id}</h3>
                </div>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-semibold rounded-full uppercase">
                  {activeOrder.status}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg border">
                  <span className="text-xs font-semibold text-gray-400 block uppercase mb-1">Pickup Location</span>
                  Lat: {activeOrder.pickup_lat}<br/>Lng: {activeOrder.pickup_lng}
                </div>
                <div className="p-4 bg-gray-50 rounded-lg border">
                  <span className="text-xs font-semibold text-gray-400 block uppercase mb-1">Dropoff Location</span>
                  Lat: {activeOrder.dropoff_lat}<br/>Lng: {activeOrder.dropoff_lng}
                </div>
              </div>

              {/* Order Flow Controller */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-bold text-gray-700 mb-3">Update Order Flow</h4>
                
                {activeOrder.status === "assigned" && (
                  <button
                    onClick={() => handleUpdateOrderStatus("picked_up")}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow transition-colors"
                  >
                    Confirm Order Picked Up
                  </button>
                )}

                {activeOrder.status === "picked_up" && (
                  <button
                    onClick={() => handleUpdateOrderStatus("delivered")}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg shadow transition-colors"
                  >
                    Confirm Order Delivered
                  </button>
                )}
              </div>
            </div>
          ) : (
            !offer && (
              <div className="bg-white p-12 text-center rounded-xl border border-gray-200 shadow-sm text-gray-500">
                <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                </svg>
                <h3 className="text-lg font-medium text-gray-900 mb-1">
                  {status === "available" ? "Waiting for Dispatch Offers" : "No Active Orders"}
                </h3>
                <p className="text-sm max-w-sm mx-auto">
                  {status === "offline" ? (
                    <>
                      Set your status to <strong className="text-green-600">Available</strong> to receive incoming dispatch orders.
                    </>
                  ) : status === "available" ? (
                    <>
                      You are online and listening for orders. Ask the business to create an order, or check the{" "}
                      <strong>Orders</strong> tab. Enable <strong>GPS Simulation</strong> if location is not streaming.
                    </>
                  ) : (
                    <>You are marked as busy. Set status to Available when ready for new orders.</>
                  )}
                </p>
              </div>
            )
          )}

          {/* Driver Live Location Map */}
          {driver && (
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm h-[400px] flex flex-col mt-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-bold text-gray-800">Your Live Location Map</h3>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className={`w-2 h-2 rounded-full ${status !== 'offline' ? 'bg-green-500 animate-ping' : 'bg-red-500'}`} />
                  {status !== 'offline' ? 'Streaming Location' : 'Location Paused'}
                </div>
              </div>
              <div className="flex-1 w-full relative">
                <Map 
                  drivers={driverForMap} 
                  orders={ordersForMap} 
                  center={[gpsLatitude, gpsLongitude]} 
                  zoom={14} 
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
