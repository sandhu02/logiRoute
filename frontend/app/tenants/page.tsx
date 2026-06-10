"use client";

import { useState } from "react";
import { fetchApi } from "../../lib/api";

export default function TenantsPage() {
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tenantInfo, setTenantInfo] = useState<any>(null);
  
  const [searchId, setSearchId] = useState("");
  const [searchError, setSearchError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await fetchApi("/tenants", {
        method: "POST",
        body: JSON.stringify({ name, subdomain }),
      });
      setSuccess(`Tenant created with ID: ${data.id}`);
      setName("");
      setSubdomain("");
    } catch (err: any) {
      setError(err.message || "Failed to create tenant");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError("");
    setTenantInfo(null);
    if (!searchId) return;
    try {
      const data = await fetchApi(`/tenants/${searchId}`);
      setTenantInfo(data);
    } catch (err: any) {
      setSearchError(err.message || "Tenant not found");
    }
  };

  const generateApiKey = async () => {
    if (!tenantInfo) return;
    try {
      const data = await fetchApi(`/tenants/${tenantInfo.id}/api-key`, {
        method: "POST"
      });
      alert(`New API Key generated: ${data.api_key}\nSave this, it will not be shown again.`);
      handleSearch(new Event('submit') as any); // Refresh tenant info
    } catch (err: any) {
      alert(err.message || "Failed to generate API key");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold">Tenants Management</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Create Tenant Form */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold mb-4">Create New Tenant</h2>
          {error && <div className="text-red-500 mb-4">{error}</div>}
          {success && <div className="text-green-600 mb-4">{success}</div>}
          
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Company Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full p-2 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Subdomain</label>
              <input
                type="text"
                required
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                className="mt-1 block w-full p-2 border border-gray-300 rounded"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Tenant"}
            </button>
          </form>
        </div>

        {/* Lookup Tenant */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold mb-4">Lookup Tenant</h2>
          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Tenant ID"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              className="flex-1 p-2 border border-gray-300 rounded"
            />
            <button type="submit" className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-900">
              Search
            </button>
          </form>
          {searchError && <div className="text-red-500">{searchError}</div>}
          
          {tenantInfo && (
            <div className="mt-4 p-4 bg-gray-50 rounded border">
              <p><strong>ID:</strong> {tenantInfo.id}</p>
              <p><strong>Name:</strong> {tenantInfo.name}</p>
              <p><strong>Subdomain:</strong> {tenantInfo.subdomain}</p>
              <p><strong>Has API Key:</strong> {tenantInfo.api_key_hash ? "Yes" : "No"}</p>
              
              <button 
                onClick={generateApiKey}
                className="mt-4 bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
              >
                Generate New API Key
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
