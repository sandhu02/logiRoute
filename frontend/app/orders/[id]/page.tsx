"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchApi } from "../../../lib/api";

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [status, setStatus] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadOrder();
  }, [id]);

  const loadOrder = async () => {
    try {
      const data = await fetchApi(`/orders/${id}`);
      setOrder(data);
      setStatus(data.status);
    } catch (err: any) {
      setError(err.message || "Failed to load order details");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    try {
      // The backend uses JWT to get user role, but for this frontend bypass we might need to send it if required.
      // Assuming the backend has a way to bypass or we just send it.
      await fetchApi(`/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      alert("Order status updated successfully");
      loadOrder();
    } catch (err: any) {
      alert(err.message || "Failed to update order status");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div>Loading order details...</div>;
  if (error) return <div className="text-red-500">{error}</div>;
  if (!order) return <div>Order not found.</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Order Details</h1>
        <button
          onClick={() => router.push("/orders")}
          className="text-blue-600 hover:underline"
        >
          &larr; Back to Orders
        </button>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="space-y-4 mb-8">
          <p><strong>ID:</strong> {order.id}</p>
          <p><strong>Customer ID:</strong> {order.customer_id}</p>
          <p><strong>Current Status:</strong> {order.status}</p>
          <p><strong>Assigned Driver ID:</strong> {order.assigned_driver_id || "None"}</p>
          
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="p-3 bg-gray-50 rounded">
              <span className="text-sm font-semibold text-gray-500 block mb-1">Pickup Location</span>
              Lat: {order.pickup_lat}<br/>Lng: {order.pickup_lng}
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <span className="text-sm font-semibold text-gray-500 block mb-1">Dropoff Location</span>
              Lat: {order.dropoff_lat}<br/>Lng: {order.dropoff_lng}
            </div>
          </div>
          <p className="mt-4"><strong>Created At:</strong> {new Date(order.created_at).toLocaleString()}</p>
        </div>

        <h2 className="text-xl font-semibold mb-4 border-t pt-4">Update Status</h2>
        <form onSubmit={handleUpdateStatus} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 block w-full p-2 border border-gray-300 rounded bg-white"
            >
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="picked_up">Picked Up</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={updating}
            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {updating ? "Updating..." : "Update"}
          </button>
        </form>
      </div>
    </div>
  );
}
