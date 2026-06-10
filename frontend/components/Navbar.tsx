"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTenantId, setTenantId, clearAuth, getToken } from "../lib/api";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const router = useRouter();
  const [tenantId, setLocalTenantId] = useState("");
  const [token, setLocalToken] = useState<string | null>(null);
  const [role, setLocalRole] = useState<string | null>(null);
  const [name, setLocalName] = useState<string | null>(null);

  const syncAuthState = () => {
    const storedTenant = getTenantId();
    if (storedTenant) setLocalTenantId(storedTenant);
    setLocalToken(getToken());
    setLocalRole(localStorage.getItem("user_role"));
    setLocalName(localStorage.getItem("user_name"));
  };

  useEffect(() => {
    syncAuthState();

    const onAuthChange = () => syncAuthState();
    window.addEventListener("auth-change", onAuthChange);
    return () => window.removeEventListener("auth-change", onAuthChange);
  }, []);

  const handleSaveTenant = () => {
    setTenantId(tenantId);
    alert("Active Tenant ID updated!");
    window.location.reload();
  };

  const handleLogout = () => {
    clearAuth();
    alert("Logged out successfully.");
    router.push("/login");
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  return (
    <nav className="bg-gray-950 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 flex-wrap gap-4 py-2">
          {/* Logo and Primary Nav Links */}
          <div className="flex gap-8 items-center">
            <Link href="/" className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              LogiRoute
            </Link>

            {token && (
              <div className="hidden md:flex items-center gap-6 text-sm font-semibold">
                {role === "business" ? (
                  <>
                    <Link href="/" className="hover:text-blue-400 transition-colors text-gray-200">Dashboard</Link>
                    <Link href="/customers" className="hover:text-blue-400 transition-colors text-gray-200">Customers</Link>
                    <Link href="/drivers" className="hover:text-blue-400 transition-colors text-gray-200">Drivers</Link>
                    <Link href="/orders" className="hover:text-blue-400 transition-colors text-gray-200">Orders</Link>
                  </>
                ) : (
                  <>
                    <Link href="/driver/dashboard" className="hover:text-blue-400 transition-colors text-gray-200">Driver Dashboard</Link>
                    <Link href="/driver/orders" className="hover:text-blue-400 transition-colors text-gray-200">Orders</Link>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right Align User Profile / Auth State */}
          <div className="flex items-center gap-4 ml-auto">
            {token ? (
              <div className="flex items-center gap-4">
                {/* Profile Widget */}
                <div className="text-right text-xs">
                  <p className="font-bold text-gray-100">{name || "User"}</p>
                  <p className="text-gray-400 capitalize">{role === "business" ? "Business / Admin" : "Driver"}</p>
                </div>

                <button
                  onClick={handleLogout}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-1.5 rounded text-xs transition-colors shadow-sm"
                >
                  Log Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-gray-200 hover:text-white font-semibold text-sm px-3 py-1.5 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded text-xs transition-colors shadow-sm"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
