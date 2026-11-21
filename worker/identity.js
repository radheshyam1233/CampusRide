export function siteUser(request) {
  const id = request.headers.get("oai-authenticated-user-id");
  if (!id) return null;
  const email = request.headers.get("oai-authenticated-user-email") || "";
  let name = request.headers.get("oai-authenticated-user-full-name") || "";
  if (
    request.headers.get("oai-authenticated-user-full-name-encoding") ===
    "percent-encoded-utf-8"
  ) {
    try {
      name = decodeURIComponent(name);
    } catch {
      name = "";
    }
  }
  return {
    id,
    email,
    name:
      (name || "CampusRide member").trim().slice(0, 80) || "CampusRide member",
  };
}
