export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export function getTenantId(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('tenant_id');
  }
  return null;
}

export function setTenantId(id: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('tenant_id', id);
    window.dispatchEvent(new Event('auth-change'));
  }
}

export function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('jwt_token');
  }
  return null;
}

export function setToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('jwt_token', token);
    window.dispatchEvent(new Event('auth-change'));
  }
}

export function clearAuth() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('tenant_id');
    localStorage.removeItem('user_role');
    localStorage.removeItem('driver_id');
    localStorage.removeItem('driver_api_key');
    window.dispatchEvent(new Event('auth-change'));
  }
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const tenantId = getTenantId();
  const token = getToken();
  
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  
  if (tenantId) {
    headers.set('x-tenant-id', tenantId);
  }
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}
