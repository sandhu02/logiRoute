"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchApi, setToken, setTenantId } from "../../lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<"business" | "driver">("business");
  
  // Business fields
  const [companyName, setCompanyName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  
  // Driver fields
  const [tenants, setTenants] = useState<any[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [phone, setPhone] = useState("");

  // Common fields
  const [name, setName] = useState(""); // user name (Business contact or Driver name)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (role === "driver") {
      loadTenants();
    }
  }, [role]);

  const loadTenants = async () => {
    try {
      const data = await fetchApi("/auth/tenants");
      setTenants(data);
      if (data.length > 0) {
        setSelectedTenantId(data[0].id);
      }
    } catch (err: any) {
      console.error("Failed to load businesses:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (role === "business") {
        const data = await fetchApi("/auth/business/signup", {
          method: "POST",
          body: JSON.stringify({
            name: companyName,
            subdomain,
            email,
            password
          })
        });

        // Set session
        setToken(data.token);
        setTenantId(data.tenant.id);
        localStorage.setItem("user_role", "business");
        localStorage.setItem("user_name", data.tenant.name);

        router.push("/");
      } else {
        if (!selectedTenantId) {
          setError("Please select a business to associate with.");
          setLoading(false);
          return;
        }

        const data = await fetchApi("/auth/driver/signup", {
          method: "POST",
          body: JSON.stringify({
            name,
            phone,
            email,
            password,
            tenant_id: selectedTenantId
          })
        });

        // Set session
        setToken(data.token);
        setTenantId(data.driver.tenant_id);
        localStorage.setItem("user_role", "driver");
        localStorage.setItem("user_name", data.driver.name);
        localStorage.setItem("driver_id", data.driver.id);
        localStorage.setItem("driver_api_key", data.apiKey);

        router.push("/driver/dashboard");
      }
      
      // Force page refresh to update navbar
      setTimeout(() => {
        window.location.reload();
      }, 100);
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="text-center text-3xl font-extrabold text-gray-900 tracking-tight">
          Create LogiRoute Account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Or{" "}
          <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
            sign in to your existing account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl rounded-xl border border-gray-100 sm:px-10">
          {/* Tab Selector */}
          <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
            <button
              onClick={() => { setRole("business"); setError(""); }}
              className={`flex-1 text-center py-2 text-sm font-medium rounded-md transition-all ${
                role === "business"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Business Owner
            </button>
            <button
              onClick={() => { setRole("driver"); setError(""); }}
              className={`flex-1 text-center py-2 text-sm font-medium rounded-md transition-all ${
                role === "driver"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Driver
            </button>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {role === "business" ? (
              <>
                {/* Business Fields */}
                <div>
                  <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">
                    Company Name
                  </label>
                  <input
                    id="companyName"
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Acme Logistics LLC"
                  />
                </div>

                <div>
                  <label htmlFor="subdomain" className="block text-sm font-medium text-gray-700">
                    Subdomain / Tenant Handle
                  </label>
                  <input
                    id="subdomain"
                    type="text"
                    required
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="acme"
                  />
                  <p className="mt-1 text-xs text-gray-500">Lowercase letters and numbers only.</p>
                </div>
              </>
            ) : (
              <>
                {/* Driver Fields */}
                <div>
                  <label htmlFor="tenant" className="block text-sm font-medium text-gray-700">
                    Select Associated Business
                  </label>
                  {tenants.length === 0 ? (
                    <p className="text-sm text-red-500 mt-1">No businesses registered yet. A business must sign up first.</p>
                  ) : (
                    <select
                      id="tenant"
                      value={selectedTenantId}
                      onChange={(e) => setSelectedTenantId(e.target.value)}
                      className="mt-1 block w-full p-2 border border-gray-300 rounded bg-white text-sm"
                    >
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.subdomain})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Driver Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="+1 (555) 019-2834"
                  />
                </div>
              </>
            )}

            {/* Common Fields */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="••••••••"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || (role === "driver" && tenants.length === 0)}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
              >
                {loading ? "Registering..." : `Register as ${role === "business" ? "Business" : "Driver"}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
