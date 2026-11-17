let memoryToken: string | null = null;
const SESSION_KEY = 'sc_session_token';

export function setAuthToken(token: string | null, persistSession = true) {
  memoryToken = token;
  if (typeof window !== 'undefined') {
    if (token && persistSession) {
      sessionStorage.setItem(SESSION_KEY, token);
    } else if (!token) {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }
}

export function getAuthToken(): string | null {
  if (memoryToken) return memoryToken;
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      memoryToken = stored;
      return stored;
    }
  }
  return null;
}

export async function apiRequest<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || 'Unexpected response' };
  }

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      data?: any;
    };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export async function uploadMediaFile(file: File | Blob, fileName?: string) {
  const form = new FormData();
  form.append('file', file, fileName || (file instanceof File ? file.name : 'recording.webm'));
  return apiRequest<{
    fileUrl: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    fileType: 'image' | 'video' | 'audio' | 'document';
  }>('/api/uploads', {
    method: 'POST',
    body: form,
  });
}
