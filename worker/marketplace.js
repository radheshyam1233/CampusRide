import { ZodError } from "zod";
import { siteUser } from "./identity.js";
import {
  listingInput,
  listingQuery,
  listingUpdate,
  photoId,
  rideId,
} from "./validation.js";
import { samplePage, samples } from "./samples.js";

const day = 86_400_000;
const maxPhoto = 5 * 1024 * 1024;
const photoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const mutableFields = [
  "title",
  "category",
  "price",
  "condition",
  "location",
  "description",
  "contact",
  "year",
];
const sortOrder = {
  newest: "created DESC, id DESC",
  low: "price ASC, id DESC",
  high: "price DESC, id DESC",
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const query = (db, sql, values = []) => db.prepare(sql).bind(...values);
const first = (db, sql, values) => query(db, sql, values).first();
const all = async (db, sql, values) =>
  (await query(db, sql, values).all()).results;
const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const notFound = () => new HttpError(404, "Listing not found.");

function legacyPhoto(row) {
  const id = row.image?.match(/^\/api\/photos\/([a-z0-9-]+)$/i)?.[1];
  return id && photoId.safeParse(id).success ? id : null;
}

function listing(row, user, details = false) {
  const photos = JSON.parse(row.photo_ids);
  const legacy = legacyPhoto(row);
  if (legacy && !photos.includes(legacy)) photos.unshift(legacy);
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    price: row.price,
    condition: row.condition,
    location: row.location,
    description: row.description,
    year: row.year,
    status: row.sold ? "sold" : "available",
    photos,
    createdAt: new Date(row.created).toISOString(),
    seller: { id: row.owner === user?.id ? user.id : null, name: row.seller },
    ...(details && user ? { contact: row.contact } : {}),
  };
}

async function readJson(request) {
  const content = await readBytes(request, 16_384);
  try {
    return JSON.parse(new TextDecoder().decode(content));
  } catch {
    throw new HttpError(400, "Enter valid listing data.");
  }
}

async function readBytes(request, max) {
  if (Number(request.headers.get("Content-Length")) > max)
    throw new HttpError(413, "The request is too large.");
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) {
      await reader.cancel();
      throw new HttpError(413, "The request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function requireUser(user) {
  if (!user) throw new HttpError(401, "Sign in to continue.");
  return user;
}

function requireSameOrigin(request, url) {
  if (
    request.headers.get("Origin") !== url.origin ||
    request.headers.get("Sec-Fetch-Site") === "cross-site" ||
    request.headers.get("X-CSRF-Token") !== "campusride-site"
  ) {
    throw new HttpError(403, "Refresh CampusRide and try again.");
  }
}

async function browse(db, user, params) {
  const filters = listingQuery.parse(Object.fromEntries(params));
  const clauses = ["sold = 0"];
  const values = [];
  if (filters.category) {
    clauses.push("category = ?");
    values.push(filters.category);
  }
  if (filters.maxPrice) {
    clauses.push("price <= ?");
    values.push(filters.maxPrice);
  }
  if (filters.search) {
    clauses.push(
      "(instr(lower(title), lower(?)) > 0 OR instr(lower(location), lower(?)) > 0 OR instr(lower(description), lower(?)) > 0)",
    );
    values.push(filters.search, filters.search, filters.search);
  }
  const where = clauses.join(" AND ");
  const [count, rows] = await db.batch([
    query(db, `SELECT count(*) AS total FROM listings WHERE ${where}`, values),
    query(
      db,
      `SELECT * FROM listings WHERE ${where} ORDER BY ${sortOrder[filters.sort]} LIMIT ? OFFSET ?`,
      [...values, filters.limit, (filters.page - 1) * filters.limit],
    ),
  ]);
  const total = count.results[0].total;
  if (
    !total &&
    !(await first(db, "SELECT id FROM listings WHERE sold = 0 LIMIT 1"))
  ) {
    return samplePage(filters);
  }
  return {
    listings: rows.results.map((row) => listing(row, user)),
    total,
    page: filters.page,
    pages: Math.ceil(total / filters.limit),
  };
}

// Validate photo ownership and draft expiry in the write itself. References in a
// still-active listing keep its attached photo available for edit after expiry.
const validPhotos = `NOT EXISTS (
  SELECT 1 FROM json_each(?) AS requested
  WHERE NOT EXISTS (
    SELECT 1 FROM ride_photos AS upload
    WHERE upload.id = requested.value AND upload.owner = ?
      AND (upload.created >= ? OR EXISTS (
        SELECT 1 FROM listings AS previous, json_each(previous.photo_ids) AS photo
        WHERE previous.owner = upload.owner AND photo.value = upload.id
      ))
  )
)`;

async function createListing(db, user, data) {
  const photoIds = JSON.stringify(data.photos);
  const row = await first(
    db,
    `
    INSERT INTO listings (id, owner, title, category, price, condition, location, description, contact, year, seller, created, photo_ids)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${validPhotos}
    RETURNING *
  `,
    [
      crypto.randomUUID(),
      user.id,
      ...mutableFields.map((key) => data[key] ?? null),
      user.name,
      Date.now(),
      photoIds,
      photoIds,
      user.id,
      Date.now() - day,
    ],
  );
  if (!row) throw new HttpError(400, "Upload your photos again before saving.");
  return listing(row, user, true);
}

async function updateListing(db, user, existing, data) {
  const changes = [];
  const values = [];
  for (const field of mutableFields) {
    if (Object.hasOwn(data, field)) {
      changes.push(`${field} = ?`);
      values.push(data[field]);
    }
  }
  if (data.status) {
    changes.push("sold = ?");
    values.push(data.status === "sold" ? 1 : 0);
  }
  let photoCondition = "";
  let photoValues = [];
  if (data.photos) {
    const legacy = legacyPhoto(existing);
    const photoIds = JSON.stringify(data.photos.filter((id) => id !== legacy));
    changes.push("photo_ids = ?", "image = ?");
    values.push(photoIds, data.photos.includes(legacy) ? existing.image : null);
    photoCondition = ` AND ${validPhotos}`;
    photoValues = [photoIds, user.id, Date.now() - day];
  }
  const row = await first(
    db,
    `UPDATE listings SET ${changes.join(", ")} WHERE id = ? AND owner = ?${photoCondition} RETURNING *`,
    [...values, existing.id, user.id, ...photoValues],
  );
  if (!row)
    throw new HttpError(
      409,
      "The listing or a photo changed. Refresh and try again.",
    );
  return listing(row, user, true);
}

function imageSignature(bytes, type) {
  const text = (offset, length) =>
    new TextDecoder().decode(bytes.subarray(offset, offset + length));
  if (type === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => value === bytes[index],
    );
  return text(0, 4) === "RIFF" && text(8, 4) === "WEBP";
}

async function uploadPhoto(request, env, user) {
  let form;
  const body = await readBytes(request, maxPhoto + 8192);
  try {
    form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("Content-Type") || "" },
    }).formData();
  } catch {
    throw new HttpError(400, "Choose a JPG, PNG or WebP photo.");
  }
  const file = form.get("photo");
  if (
    !(file instanceof File) ||
    !photoTypes.has(file.type) ||
    file.size > maxPhoto ||
    !imageSignature(
      new Uint8Array(await file.slice(0, 16).arrayBuffer()),
      file.type,
    )
  ) {
    throw new HttpError(
      400,
      "Choose a valid JPG, PNG or WebP photo under 5 MB.",
    );
  }

  const noListing = `NOT EXISTS (SELECT 1 FROM listings AS ride, json_each(ride.photo_ids) AS photo
      WHERE ride.owner = ride_photos.owner AND photo.value = ride_photos.id)`;
  const old = await all(
    env.DB,
    `
    DELETE FROM ride_photos WHERE id IN (
      SELECT id FROM ride_photos WHERE owner = ? AND created < ? AND ${noListing} LIMIT 12
    ) RETURNING id
  `,
    [user.id, Date.now() - day],
  );
  if (old.length) {
    try {
      await env.BUCKET.delete(old.map((row) => `market/${row.id}`));
    } catch (error) {
      console.error("Photo cleanup failed", error);
    }
  }
  const id = crypto.randomUUID();
  const created = Date.now();
  const row = await first(
    env.DB,
    `
    INSERT INTO ride_photos (id, owner, created)
    SELECT ?, ?, ? WHERE (
      SELECT count(*) FROM ride_photos WHERE owner = ? AND created >= ? AND ${noListing}
    ) < 16 RETURNING id
  `,
    [id, user.id, created, user.id, created - day],
  );
  if (!row)
    throw new HttpError(
      429,
      "Too many unused photos. Publish a listing with your photos or try again tomorrow.",
    );
  try {
    await env.BUCKET.put(`market/${id}`, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
  } catch (error) {
    await query(env.DB, "DELETE FROM ride_photos WHERE id = ?", [id]).run();
    throw error;
  }
  return { id, url: `/api/photos/${id}` };
}

async function servePhoto(env, user, id) {
  if (!photoId.safeParse(id).success)
    throw new HttpError(404, "Photo not found.");
  const associated = await first(
    env.DB,
    `
    SELECT id FROM ride_photos WHERE id = ? AND (
      (owner = ? AND created >= ?) OR EXISTS (
        SELECT 1 FROM listings AS ride, json_each(ride.photo_ids) AS photo
        WHERE photo.value = ride_photos.id AND ride.owner = ride_photos.owner AND (ride.sold = 0 OR ride.owner = ?)
      )
    )
  `,
    [id, user.id, Date.now() - day, user.id],
  );
  const legacy =
    !associated &&
    (await first(
      env.DB,
      "SELECT id FROM listings WHERE image = ? AND (sold = 0 OR owner = ?) LIMIT 1",
      [`/api/photos/${id}`, user.id],
    ));
  const photo = associated
    ? await env.BUCKET.get(`market/${id}`)
    : legacy
      ? await env.BUCKET.get(id)
      : null;
  const type = photo?.httpMetadata?.contentType;
  if (!photo || !photoTypes.has(type))
    throw new HttpError(404, "Photo not found.");
  return new Response(photo.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function marketplace(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const { method } = request;
  const user = siteUser(request);
  const { DB } = env;
  try {
    if (method === "GET" && pathname === "/api/health") {
      await first(DB, "SELECT id FROM listings LIMIT 1");
      return json({ status: "ok" });
    }
    if (method === "GET" && pathname === "/api/auth/me") {
      return json({ user: requireUser(user), csrf: "campusride-site" });
    }
    if (pathname === "/api/listings" && method === "GET") {
      return json(await browse(DB, user, url.searchParams));
    }
    if (pathname === "/api/listings" && method === "POST") {
      requireUser(user);
      requireSameOrigin(request, url);
      return json(
        {
          listing: await createListing(
            DB,
            user,
            listingInput.parse(await readJson(request)),
          ),
        },
        201,
      );
    }
    if (pathname === "/api/listings/mine" && method === "GET") {
      const rows = await all(
        DB,
        "SELECT * FROM listings WHERE owner = ? ORDER BY created DESC, id DESC",
        [requireUser(user).id],
      );
      return json({ listings: rows.map((row) => listing(row, user, true)) });
    }
    const detail = pathname.match(/^\/api\/listings\/([^/]+)$/)?.[1];
    if (detail) {
      if (method === "GET") {
        const example = samples.find((ride) => ride.id === detail);
        if (example) return json({ listing: example });
      }
      if (!rideId.safeParse(detail).success) throw notFound();
      const row = await first(DB, "SELECT * FROM listings WHERE id = ?", [
        detail,
      ]);
      if (!row) throw notFound();
      if (method === "GET") {
        if (row.sold && row.owner !== user?.id) throw notFound();
        return json({ listing: listing(row, user, true) });
      }
      requireUser(user);
      requireSameOrigin(request, url);
      if (row.owner !== user.id) throw notFound();
      if (method === "PATCH") {
        return json({
          listing: await updateListing(
            DB,
            user,
            row,
            listingUpdate.parse(await readJson(request)),
          ),
        });
      }
      if (method === "DELETE") {
        await query(DB, "DELETE FROM listings WHERE id = ? AND owner = ?", [
          detail,
          user.id,
        ]).run();
        return new Response(null, {
          status: 204,
          headers: { "Cache-Control": "private, no-store" },
        });
      }
    }
    if (pathname === "/api/photos" && method === "POST") {
      requireUser(user);
      requireSameOrigin(request, url);
      return json(await uploadPhoto(request, env, user), 201);
    }
    const photo = pathname.match(/^\/api\/photos\/([^/]+)$/)?.[1];
    if (photo && method === "GET")
      return await servePhoto(env, requireUser(user), photo);
    return json({ error: "This endpoint is unavailable." }, 404);
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      return json(
        {
          error: issue.path.length
            ? `${issue.path[0]} — ${issue.message}`
            : issue.message,
        },
        400,
      );
    }
    console.error("CampusRide request failed", error);
    return json(
      { error: "Could not complete your request. Please try again." },
      500,
    );
  }
}
