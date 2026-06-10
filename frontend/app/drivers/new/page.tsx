"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "../../../lib/api";

export default function NewDriverPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const data = await fetchApi("/drivers", {
        method: "POST",
        body: JSON.stringify({ name, phone }),
      });
      alert(`Driver created! API Key (save this): ${data.apiKey}`);
      router.push("/drivers");
    } catch (err: any) {
      setError(err.message || "Failed to create driver");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Add New Driver</h1>
      
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        {error && <div className="text-red-500 mb-4 bg-red-50 p-3 rounded">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full p-2 border border-gray-300 rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Phone</label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 block w-full p-2 border border-gray-300 rounded"
            />
          </div>
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Driver"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/drivers")}
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
