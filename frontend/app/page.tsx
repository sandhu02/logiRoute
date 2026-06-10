"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchApi } from "../lib/api";
import dynamic from "next/dynamic";
import { io, Socket } from "socket.io-client";

// Dynamically import Leaflet Map to avoid SSR errors
const Map = dynamic(() => import("../components/Map"), { ssr: false });

export default function Home() {
  const router = useRouter();
  
  const [drivers, setDrivers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    available_drivers: 0,
    pending_orders: 0,
    active_orders: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // 1. Authentication check
    const token = localStorage.getItem("jwt_token");
    const role = localStorage.getItem("user_role");
    
    if (!token) {
      router.push("/login");
      return;
    }

    if (role === "driver") {
      router.push("/driver/dashboard");
      return;
    }

    // Load initial dispatcher data
    initDispatcherDashboard();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const initDispatcherDashboard = async () => {
    try {
      setLoading(true);
      setError("");
      
      const tenantId = localStorage.getItem("tenant_id") || "";
      const token = localStorage.getItem("jwt_token") || "";

      // Load initial drivers with live locations
      const driversData = await fetchApi("/dispatchers/drivers?include_live=true");
      setDrivers(driversData);

      // Load initial orders
      const ordersData = await fetchApi("/dispatchers/orders?include_live=true");
      setOrders(ordersData.rows || ordersData || []);

      // Load stats (also derive available count from driver list as immediate fallback)
      const availableFromDb = driversData.filter((d: any) => d.status === "available").length;
      const statsData = await fetchApi("/dispatchers/stats");
      setStats({
        ...statsData,
        available_drivers: Math.max(statsData.available_drivers ?? 0, availableFromDb),
      });

      // Initialize Socket connection
      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";
      const socket = io(socketUrl, {
        path: "/socket.io",
        auth: {
          token: token,
          clientType: "dispatcher",
        },
        transports: ["websocket", "polling"],
      });

      socketRef.current = socket;

      // Socket Listeners
      socket.on("connect", () => {
        console.log("Dispatcher socket connected:", socket.id);
      });

      // Listen for live driver location updates
      socket.on("driver:location", (loc: any) => {
        setDrivers((prevDrivers) =>
          prevDrivers.map((d) => {
            if (d.id === loc.driver_id) {
              return {
                ...d,
                live_location: {
                  lat: Number(loc.lat),
                  lng: Number(loc.lng),
                  speed: loc.speed,
                  heading: loc.heading,
                },
              };
            }
            return d;
          })
        );
        refreshStats();
      });

      // Listen for driver status updates
      socket.on("driver:status", (statusData: any) => {
        const targetDriverId = statusData.driver_id;
        const newStatus = statusData.new_status || statusData.status;

        setDrivers((prevDrivers) => {
          const updated = prevDrivers.map((d) => {
            if (d.id === targetDriverId) {
              return { ...d, status: newStatus };
            }
            return d;
          });

          setStats((prev) => ({
            ...prev,
            available_drivers: updated.filter((d) => d.status === "available").length,
          }));

          return updated;
        });

        refreshStats();
      });

      // Handle driver disconnects
      socket.on("driver:disconnected", (statusData: any) => {
        setDrivers((prevDrivers) => {
          const updated = prevDrivers.map((d) => {
            if (d.id === statusData.driver_id) {
              return { ...d, status: "offline", live_location: undefined };
            }
            return d;
          });

          setStats((prev) => ({
            ...prev,
            available_drivers: updated.filter((d) => d.status === "available").length,
          }));

          return updated;
        });
        refreshStats();
      });

      // Listen for order assignments or status updates
      socket.on("order:updated", (order: any) => {
        setOrders((prevOrders) => {
          const index = prevOrders.findIndex((o) => o.id === order.id);
          if (index > -1) {
            return prevOrders.map((o) => (o.id === order.id ? order : o));
          } else {
            return [order, ...prevOrders];
          }
        });
        refreshStats();
      });

      socket.on("order:assigned", (data: any) => {
        setOrders((prevOrders) =>
          prevOrders.map((o) => {
            if (o.id === data.order_id) {
              return { ...o, status: "assigned", assigned_driver_id: data.driver_id };
            }
            return o;
          })
        );
        refreshStats();
      });

    } catch (err: any) {
      setError(err.message || "Failed to initialize dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const refreshStats = async () => {
    try {
      const statsData = await fetchApi("/dispatchers/stats");
      setStats(statsData);
    } catch (err) {
      console.error("Failed to refresh stats:", err);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading LogiRoute Dashboard...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border shadow-sm">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Dispatcher Command Center</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time driver tracking and fleet dispatch control.</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/orders/new"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
          >
            Create Dispatch Order
          </Link>
          <button
            onClick={initDispatcherDashboard}
            className="bg-white hover:bg-gray-50 text-gray-700 font-semibold px-4 py-2.5 border rounded-lg shadow-sm transition-colors text-sm"
          >
            Sync Feeds
          </button>
        </div>
      </div>

      {/* Live Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase">Available Drivers</span>
            <h3 className="text-3xl font-black text-green-600 mt-1">{stats.available_drivers}</h3>
          </div>
          <div className="bg-green-50 p-3 rounded-lg text-green-600">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase">Pending Orders</span>
            <h3 className="text-3xl font-black text-amber-500 mt-1">{stats.pending_orders}</h3>
          </div>
          <div className="bg-amber-50 p-3 rounded-lg text-amber-500">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase">Active Shipments</span>
            <h3 className="text-3xl font-black text-blue-600 mt-1">{stats.active_orders}</h3>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg text-blue-600">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M21 16v-3a4 4 0 00-4-4h-4" />
            </svg>
          </div>
        </div>
      </div>

      {/* Live tracking layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Live Map Frame */}
        <div className="lg:col-span-3 bg-white p-4 rounded-xl border shadow-sm h-[500px] flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-gray-800">Live Operations Tracker</h2>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
              Live Telemetry Feed
            </div>
          </div>
          <div className="flex-1 w-full relative">
            <Map drivers={drivers} orders={orders} />
          </div>
        </div>

        {/* Sidebar Status Panels */}
        <div className="lg:col-span-1 space-y-6">
          {/* Driver Fleet Panel */}
          <div className="bg-white p-6 rounded-xl border shadow-sm h-[240px] flex flex-col">
            <h2 className="text-base font-bold text-gray-800 border-b pb-2 mb-3">Fleet Overview</h2>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-sm">
              {drivers.length === 0 ? (
                <div className="text-center text-gray-400 py-8">No drivers registered.</div>
              ) : (
                drivers.map((driver) => {
                  let statusBg = "bg-gray-100 text-gray-800";
                  if (driver.status === "available") statusBg = "bg-green-100 text-green-800";
                  if (driver.status === "busy") statusBg = "bg-amber-100 text-amber-800";
                  
                  return (
                    <div key={driver.id} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded border border-transparent hover:border-gray-200">
                      <div>
                        <p className="font-semibold text-gray-800">{driver.name}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">
                          {driver.live_location ? `${driver.live_location.lat.toFixed(4)}, ${driver.live_location.lng.toFixed(4)}` : "No GPS lock"}
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full uppercase ${statusBg}`}>
                        {driver.status}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Active Orders List */}
          <div className="bg-white p-6 rounded-xl border shadow-sm h-[240px] flex flex-col">
            <h2 className="text-base font-bold text-gray-800 border-b pb-2 mb-3">Recent Dispatch Orders</h2>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-sm">
              {orders.length === 0 ? (
                <div className="text-center text-gray-400 py-8">No orders placed.</div>
              ) : (
                orders.map((order) => {
                  let statusBg = "bg-gray-100 text-gray-700";
                  if (order.status === "delivered") statusBg = "bg-green-100 text-green-800";
                  if (order.status === "pending") statusBg = "bg-amber-100 text-amber-800";
                  if (order.status === "assigned" || order.status === "picked_up") statusBg = "bg-blue-100 text-blue-800";

                  return (
                    <div key={order.id} className="flex justify-between items-center p-2 border hover:bg-gray-50 rounded">
                      <div>
                        <p className="font-semibold text-gray-800">Order #{order.id.split("-")[0]}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {order.assigned_driver_id ? "Driver Assigned" : "Awaiting Driver"}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded uppercase ${statusBg}`}>
                        {order.status}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
