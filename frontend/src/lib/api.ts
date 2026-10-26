// API client methods for WhatsApp Client frontend

export interface User {
  id: string;
  email: string;
  name?: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  name: string;
  phoneNumber?: string | null;
  status: 'idle' | 'connecting' | 'qr' | 'connected' | 'reconnecting' | 'logged_out' | 'error';
  lastConnectedAt?: string | null;
  lastDisconnectReason?: string | null;
  qr?: string | null;
  createdAt: string;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(endpoint, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `HTTP error ${res.status}`);
  }

  return data as T;
}

export const api = {
  // Auth
  canRegister: () => request<{ canRegister: boolean }>('/api/auth/can-register'),
  getMe: () => request<{ user: User }>('/api/auth/me'),
  login: (body: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  register: (body: { email: string; password: string; name?: string }) =>
    request<{ user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  logout: () =>
    request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
    }),

  // Sessions
  getSessions: () => request<{ sessions: Session[] }>('/api/sessions'),
  createSession: (name: string) =>
    request<{ session: Session }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  connect: (id: string) =>
    request<{ message: string; status: string; qr?: string | null }>(`/api/sessions/${id}/connect`, {
      method: 'POST',
    }),
  requestPairingCode: (id: string, phoneNumber: string) =>
    request<{ code: string }>(`/api/sessions/${id}/pairing-code`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),
  disconnect: (id: string) =>
    request<{ message: string; status: string }>(`/api/sessions/${id}/disconnect`, {
      method: 'POST',
    }),
  logoutSession: (id: string) =>
    request<{ message: string; status: string }>(`/api/sessions/${id}/logout`, {
      method: 'POST',
    }),
};
