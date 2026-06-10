"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "../../lib/api";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const data = await fetchApi("/customers");
      setCustomers(data);
    } catch (err: any) {
      setError(err.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setError("");
    setSuccess("");

    try {
      const newCustomer = await fetchApi("/customers", {
        method: "POST",
        body: JSON.stringify({ name, phone, email }),
      });
      setSuccess(`Customer ${newCustomer.name} created successfully!`);
      setName("");
      setPhone("");
      setEmail("");
      // Refresh list
      loadCustomers();
    } catch (err: any) {
      setError(err.message || "Failed to create customer");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    alert(`Copied Customer ID: ${id}`);
  };

  if (loading && customers.length === 0) {
    return <div className="p-8 text-center">Loading Customers...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border shadow-sm">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-1">Manage accounts and retrieve IDs for order creation.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create Customer Panel */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl border shadow-sm h-fit">
          <h2 className="text-xl font-bold text-gray-900 border-b pb-3 mb-4">Register Customer</h2>
          
          {error && <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-3 rounded text-xs text-red-700">{error}</div>}
          {success && <div className="mb-4 bg-green-50 border-l-4 border-green-400 p-3 rounded text-xs text-green-700">{success}</div>}

          <form onSubmit={handleCreateCustomer} className="space-y-4 text-sm">
            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Jane Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Phone Number</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="+1 (555) 012-3456"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Email Address (Optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="jane.smith@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={createLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {createLoading ? "Creating..." : "Create Customer"}
            </button>
          </form>
        </div>

        {/* Customers List Table */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 border-b pb-3 mb-4">Customer Directory</h2>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Contact Info</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-xs">Customer ID</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-500 uppercase tracking-wider text-xs">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      No customers registered yet. Fill in the form on the left to add one!
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 font-semibold text-gray-800 whitespace-nowrap">{c.name}</td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <p>{c.phone}</p>
                        {c.email && <p className="text-xs text-gray-400 mt-0.5">{c.email}</p>}
                      </td>
                      <td className="px-4 py-4 font-mono text-xs select-all text-gray-500 break-all max-w-[200px]">
                        {c.id}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleCopyId(c.id)}
                          className="bg-gray-100 hover:bg-blue-50 hover:text-blue-600 text-gray-600 px-3 py-1.5 rounded-lg border font-bold text-xs transition-all flex items-center gap-1 mx-auto"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                          Copy ID
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
