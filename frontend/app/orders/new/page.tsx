"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { fetchApi } from "../../../lib/api";

const LocationPicker = dynamic(() => import("../../../components/LocationPicker"), { ssr: false });

export default function NewOrderPage() {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCustomers() {
      try {
        const data = await fetchApi("/customers");
        const list = Array.isArray(data) ? data : [];
        setCustomers(list);
        if (list.length > 0) {
          setCustomerId(list[0].id);
        }
      } catch (err) {
        console.error("Failed to load customers:", err);
      } finally {
        setLoadingCustomers(false);
      }
    }
    loadCustomers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setError("Please select or create a customer first.");
      return;
    }
    if (!pickup || !dropoff) {
      setError("Please select both pickup and dropoff locations on the map.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      await fetchApi("/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_id: customerId,
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          dropoff_lat: dropoff.lat,
          dropoff_lng: dropoff.lng,
        }),
      });
      alert("Order created!");
      router.push("/orders");
    } catch (err: any) {
      setError(err.message || "Failed to create order");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Create New Order</h1>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        {error && <div className="text-red-500 mb-4 bg-red-50 p-3 rounded">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Customer</label>
            {loadingCustomers ? (
              <div className="text-sm text-gray-500 mt-1">Loading customers...</div>
            ) : customers.length === 0 ? (
              <div className="text-sm text-amber-600 mt-1">
                No customers found. Please{" "}
                <Link href="/customers" className="underline font-bold text-blue-600">
                  create a customer
                </Link>{" "}
                first.
              </div>
            ) : (
              <select
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="mt-1 block w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email || c.phone})
                  </option>
                ))}
              </select>
            )}
          </div>

          <LocationPicker
            pickup={pickup}
            dropoff={dropoff}
            onPickupChange={(lat, lng) => setPickup({ lat, lng })}
            onDropoffChange={(lat, lng) => setDropoff({ lat, lng })}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Pickup Coordinates</label>
              <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded text-sm font-mono text-gray-600">
                {pickup
                  ? `${pickup.lat.toFixed(6)}, ${pickup.lng.toFixed(6)}`
                  : "Click map to set pickup"}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Dropoff Coordinates</label>
              <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded text-sm font-mono text-gray-600">
                {dropoff
                  ? `${dropoff.lat.toFixed(6)}, ${dropoff.lng.toFixed(6)}`
                  : "Click map to set dropoff"}
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-2">
            <button
              type="submit"
              disabled={loading || !pickup || !dropoff}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Order"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/orders")}
              className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
