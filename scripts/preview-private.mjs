import { createServer } from "node:http";
import { Readable } from "node:stream";
import { localStorage } from "./preview-storage.mjs";

await import("./build-private.mjs");
const { default: worker } = await import("../dist/server/index.js");
const env = localStorage();
const flag = process.argv.indexOf("--port");
const explicitPort = flag === -1 ? undefined : process.argv[flag + 1];
const npmPort = /^\d+$/.test(process.env.npm_config_port ?? "")
  ? process.env.npm_config_port
  : undefined;
const port = Number(explicitPort || process.env.PORT || npmPort || 5173);

createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value && !key.startsWith("oai-authenticated-user-"))
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
    headers.set("oai-authenticated-user-id", "preview-student");
    headers.set("oai-authenticated-user-email", "student@example.test");
    headers.set("oai-authenticated-user-full-name", "CampusRide Preview");
    // The managed preview proxy terminates HTTPS and forwards the host to Node.
    const host = headers.get("host");
    const forwarded = headers.get("x-forwarded-proto")?.split(",")[0];
    const origin = headers.get("origin");
    const protocol =
      origin && new URL(origin).host === host
        ? new URL(origin).protocol
        : forwarded === "https"
          ? "https:"
          : "http:";
    const body = ["GET", "HEAD"].includes(incoming.method)
      ? undefined
      : Readable.toWeb(incoming);
    const request = new Request(new URL(incoming.url, `${protocol}//${host}`), {
      method: incoming.method,
      headers,
      ...(body ? { body, duplex: "half" } : {}),
    });
    const response = await worker.fetch(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500).end();
  }
}).listen(port, "0.0.0.0", () =>
  console.log(`CampusRide preview ready at http://localhost:${port}/`),
);
