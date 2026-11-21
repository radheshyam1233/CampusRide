import assets from "virtual:campusride-assets";
import { marketplace } from "./marketplace.js";

const types = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  jpg: "image/jpeg",
  svg: "image/svg+xml",
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return marketplace(request, env);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }
    const path = pathname === "/" ? "/index.html" : pathname;
    const asset = Object.hasOwn(assets, path) ? assets[path] : null;
    if (!asset) return new Response("Not found", { status: 404 });
    const contentType =
      types[path.split(".").pop()] || "application/octet-stream";
    const headers = {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'",
      "Cache-Control": path.startsWith("/assets/")
        ? "private, max-age=31536000, immutable"
        : "private, max-age=0",
    };
    const bytes =
      request.method === "HEAD"
        ? null
        : Uint8Array.from(atob(asset), (character) => character.charCodeAt(0));
    return new Response(bytes, { headers });
  },
};
