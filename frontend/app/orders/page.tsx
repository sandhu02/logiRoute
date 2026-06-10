"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { fetchApi, getToken } from "../../lib/api";
import { io, Socket } from "socket.io-client";

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const socketRef = useRef<Socket | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const data = await fetchApi("/orders");
      const ordersArray = Array.isArray(data) ? data : (data.rows || []);
      setOrders(ordersArray);
    } catch (err: any) {
      setError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();

    const token = getToken();
    if (!token) return;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";
    const socket = io(socketUrl, {
      path: "/socket.io",
      auth: { token, clientType: "dispatcher" },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("order:updated", (order: any) => {
      setOrders((prev) => {
        const index = prev.findIndex((o) => o.id === order.id);
        if (index > -1) {
          return prev.map((o) => (o.id === order.id ? { ...o, ...order } : o));
        }
        return [order, ...prev];
      });
    });

    socket.on("order:assigned", (data: any) => {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === data.order_id
            ? { ...o, status: "assigned", assigned_driver_id: data.driver_id }
            : o
        )
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [loadOrders]);

  if (loading) return <div>Loading orders...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Orders</h1>
        <Link
          href="/orders/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Create Order
        </Link>
      </div>

      {error && <div className="text-red-500 bg-red-50 p-4 rounded">{error}</div>}

      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">No orders found.</td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{order.id.split("-")[0]}...</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {order.customer?.name || order.customer_id?.split("-")[0] + "..."}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${
                        order.status === "delivered"
                          ? "bg-green-100 text-green-800"
                          : order.status === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : order.status === "cancelled"
                              ? "bg-red-100 text-red-800"
                              : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {order.assigned_driver_id
                      ? order.assignedDriver?.name || order.assigned_driver_id.split("-")[0] + "..."
                      : "—"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/orders/${order.id}`} className="text-indigo-600 hover:text-indigo-900">
                      View / Manage
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
