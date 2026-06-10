"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchApi } from "../../../lib/api";

export default function DriverDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const [driver, setDriver] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [status, setStatus] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadDriver();
  }, [id]);

  const loadDriver = async () => {
    try {
      const data = await fetchApi(`/drivers/${id}`);
      setDriver(data);
      setStatus(data.status);
    } catch (err: any) {
      setError(err.message || "Failed to load driver details");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    try {
      await fetchApi(`/drivers/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      alert("Status updated successfully");
      loadDriver();
    } catch (err: any) {
      alert(err.message || "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div>Loading driver details...</div>;
  if (error) return <div className="text-red-500">{error}</div>;
  if (!driver) return <div>Driver not found.</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Driver Details</h1>
        <button
          onClick={() => router.push("/drivers")}
          className="text-blue-600 hover:underline"
        >
          &larr; Back to Drivers
        </button>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="space-y-4 mb-8">
          <p><strong>ID:</strong> {driver.id}</p>
          <p><strong>Name:</strong> {driver.name}</p>
          <p><strong>Phone:</strong> {driver.phone}</p>
          <p><strong>Current Status:</strong> {driver.status}</p>
          <p><strong>Created At:</strong> {new Date(driver.created_at).toLocaleString()}</p>
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
              <option value="offline">Offline</option>
              <option value="available">Available</option>
              <option value="busy">Busy</option>
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
