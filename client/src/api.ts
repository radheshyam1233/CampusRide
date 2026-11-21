let csrf = "";
export function setCSRF(value: string) {
  csrf = value;
}
export async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (options.method && !["GET", "HEAD"].includes(options.method))
    headers.set("X-CSRF-Token", csrf);
  const response = await fetch("/api" + url, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => {
    throw new Error(
      "The server did not return listing data. Refresh and try again.",
    );
  });
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}
export type Listing = {
  id: string;
  title: string;
  category: "Cycle" | "Scooty";
  price: number;
  condition: string;
  location: string;
  description: string;
  contact?: string;
  year?: number | null;
  status: "available" | "sold";
  photos: string[];
  createdAt: string;
  sample?: boolean;
  previewImage?: string;
  seller: { id: string | null; name: string };
};
export type User = { id: string; name: string; email: string };
