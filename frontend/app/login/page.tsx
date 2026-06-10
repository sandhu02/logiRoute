"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchApi, setToken, setTenantId, clearAuth } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<"business" | "driver">("business");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    clearAuth();
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const endpoint = role === "business" ? "/auth/business/login" : "/auth/driver/login";
      const data = await fetchApi(endpoint, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      // Save credentials based on response
      setToken(data.token);
      
      if (role === "business") {
        setTenantId(data.tenant.id);
        localStorage.setItem("user_role", "business");
        localStorage.setItem("user_name", data.tenant.name);
        window.dispatchEvent(new Event("auth-change"));
        router.push("/");
      } else {
        setTenantId(data.driver.tenant_id);
        localStorage.setItem("user_role", "driver");
        localStorage.setItem("user_name", data.driver.name);
        localStorage.setItem("driver_id", data.driver.id);
        localStorage.setItem("driver_api_key", data.apiKey);
        window.dispatchEvent(new Event("auth-change"));
        router.push("/driver/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Failed to log in. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
          LogiRoute Portal
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Or{" "}
          <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-500">
            register a new account
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
              Business/Dispatcher
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
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder={role === "business" ? "dispatcher@company.com" : "driver@company.com"}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
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
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
              >
                {loading ? "Authenticating..." : `Log in as ${role === "business" ? "Business" : "Driver"}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
