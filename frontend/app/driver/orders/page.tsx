"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchApi } from "../../../lib/api";
import { io, Socket } from "socket.io-client";

interface DispatchOffer {
  offer_id: string;
  order_id: string;
  expires_in: number;
  pickup: { lat: number; lng: number };
  dropoff: { lat: number; lng: number };
  order?: any;
}

export default function DriverOrdersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [offers, setOffers] = useState<DispatchOffer[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [ordersData, offersData] = await Promise.all([
        fetchApi("/orders"),
        fetchApi("/dispatch/offers").catch(() => []),
      ]);

      const ordersArray = Array.isArray(ordersData) ? ordersData : (ordersData.rows || []);
      const currentDriverId = localStorage.getItem("driver_id");

      setPendingOrders(ordersArray.filter((o: any) => o.status === "pending"));
      setMyOrders(
        ordersArray.filter(
          (o: any) =>
            o.assigned_driver_id === currentDriverId &&
            o.status !== "delivered" &&
            o.status !== "cancelled"
        )
      );
      setOffers(Array.isArray(offersData) ? offersData : []);
    } catch (err: any) {
      setError(err.message || "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const role = localStorage.getItem("user_role");
    const token = localStorage.getItem("jwt_token");
    const id = localStorage.getItem("driver_id");

    if (!token || role !== "driver" || !id) {
      router.push("/login");
      return;
    }

    loadData();

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";
    const socket = io(socketUrl, {
      path: "/socket.io",
      auth: { token, clientType: "driver" },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("dispatch:offer", (data: any) => {
      if (data.accepted_by_other || data.expired || data.expired_by_timeout) {
        setOffers((prev) => prev.filter((o) => o.order_id !== data.order_id));
      } else if (data.offer_id) {
        setOffers((prev) => {
          const filtered = prev.filter((o) => o.order_id !== data.order_id);
          return [
            {
              offer_id: data.offer_id,
              order_id: data.order_id,
              expires_in: data.expires_in || 30,
              pickup: data.pickup,
              dropoff: data.dropoff,
            },
            ...filtered,
          ];
        });
        loadData();
      }
    });

    socket.on("order:updated", () => {
      loadData();
    });

    return () => {
      socket.disconnect();
    };
  }, [router, loadData]);

  useEffect(() => {
    if (offers.length === 0) return;

    const interval = setInterval(() => {
      setOffers((prev) =>
        prev
          .map((o) => ({ ...o, expires_in: o.expires_in - 1 }))
          .filter((o) => o.expires_in > 0)
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [offers.length]);

  const getOfferForOrder = (orderId: string) => offers.find((o) => o.order_id === orderId);

  const handleAccept = async (offer: DispatchOffer) => {
    setActionLoading(offer.offer_id);
    try {
      const result = await fetchApi("/dispatch/accept", {
        method: "POST",
        body: JSON.stringify({
          order_id: offer.order_id,
          offer_id: offer.offer_id,
        }),
      });

      const driverId = localStorage.getItem("driver_id");
      if (driverId) {
        await fetchApi(`/drivers/${driverId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "busy" }),
        }).catch(() => {});

        if (socketRef.current?.connected) {
          socketRef.current.emit("driver:status:update", {
            status: "busy",
            orderId: offer.order_id,
          });
        }
      }

      alert("Order accepted successfully!");
      setOffers((prev) => prev.filter((o) => o.offer_id !== offer.offer_id));
      setPendingOrders((prev) => prev.filter((o) => o.id !== offer.order_id));
      if (result.order) {
        setMyOrders((prev) => [result.order, ...prev.filter((o) => o.id !== result.order.id)]);
      }
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to accept order.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (offer: DispatchOffer) => {
    setActionLoading(offer.offer_id);
    try {
      await fetchApi("/dispatch/decline", {
        method: "POST",
        body: JSON.stringify({
          order_id: offer.order_id,
          offer_id: offer.offer_id,
        }),
      });
      setOffers((prev) => prev.filter((o) => o.offer_id !== offer.offer_id));
    } catch (err: any) {
      alert(err.message || "Failed to decline order.");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading orders...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-1">View available orders and accept dispatch offers</p>
        </div>
        <Link
          href="/driver/dashboard"
          className="text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          Back to Dashboard
        </Link>
      </div>

      {error && (
        <div className="text-red-500 bg-red-50 p-4 rounded-lg border border-red-200">{error}</div>
      )}

      {offers.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-800">Incoming Offers</h2>
          {offers.map((offer) => (
            <div
              key={offer.offer_id}
              className="bg-blue-50 border border-blue-200 rounded-xl p-5 shadow-sm"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-1 rounded-full uppercase">
                    Dispatch Offer
                  </span>
                  <h3 className="text-lg font-bold text-gray-900 mt-2">
                    Order {offer.order_id.split("-")[0]}
                  </h3>
                </div>
                <span className="text-xl font-black text-blue-600">{offer.expires_in}s</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div className="bg-white p-3 rounded-lg border">
                  <span className="text-xs font-semibold text-gray-400 block mb-1">Pickup</span>
                  {Number(offer.pickup.lat).toFixed(4)}, {Number(offer.pickup.lng).toFixed(4)}
                </div>
                <div className="bg-white p-3 rounded-lg border">
                  <span className="text-xs font-semibold text-gray-400 block mb-1">Dropoff</span>
                  {Number(offer.dropoff.lat).toFixed(4)}, {Number(offer.dropoff.lng).toFixed(4)}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleAccept(offer)}
                  disabled={actionLoading === offer.offer_id}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
                >
                  {actionLoading === offer.offer_id ? "Accepting..." : "Accept Order"}
                </button>
                <button
                  onClick={() => handleDecline(offer)}
                  disabled={actionLoading === offer.offer_id}
                  className="flex-1 bg-white hover:bg-gray-100 text-gray-800 border font-bold py-2 px-4 rounded-lg disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {myOrders.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-800">My Active Orders</h2>
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pickup</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dropoff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {myOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-6 py-4 text-sm font-medium">{order.id.split("-")[0]}...</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 uppercase">
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {Number(order.pickup_lat).toFixed(4)}, {Number(order.pickup_lng).toFixed(4)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {Number(order.dropoff_lat).toFixed(4)}, {Number(order.dropoff_lng).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500">
            Manage your active order from the{" "}
            <Link href="/driver/dashboard" className="text-blue-600 font-semibold hover:underline">
              Driver Dashboard
            </Link>
            .
          </p>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-800">Available Orders</h2>
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pickup</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dropoff</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pendingOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No pending orders available. Set your status to Available on the dashboard to receive offers.
                  </td>
                </tr>
              ) : (
                pendingOrders.map((order) => {
                  const offer = getOfferForOrder(order.id);
                  return (
                    <tr key={order.id}>
                      <td className="px-6 py-4 text-sm font-medium">{order.id.split("-")[0]}...</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {Number(order.pickup_lat).toFixed(4)}, {Number(order.pickup_lng).toFixed(4)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {Number(order.dropoff_lat).toFixed(4)}, {Number(order.dropoff_lng).toFixed(4)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(order.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {offer ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAccept(offer)}
                              disabled={actionLoading === offer.offer_id}
                              className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded disabled:opacity-50"
                            >
                              Accept ({offer.expires_in}s)
                            </button>
                            <button
                              onClick={() => handleDecline(offer)}
                              disabled={actionLoading === offer.offer_id}
                              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold px-3 py-1.5 rounded border disabled:opacity-50"
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Awaiting offer</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
