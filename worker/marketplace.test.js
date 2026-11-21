import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { marketplace } from "./marketplace.js";
import {
  applyLocalMigrations,
  localStorage,
} from "../scripts/preview-storage.mjs";

const origin = "https://campusride.example.test";
const owner = "student-owner";
const buyer = "student-buyer";
const ride = {
  title: "Firefox campus cycle",
  category: "Cycle",
  price: 4200,
  condition: "Good",
  location: "Limbdi Hostel",
  description: "Recently serviced brake pads and a functioning rear light.",
  contact: "campus-seller@example.test",
  year: 2021,
};

function call(
  env,
  path,
  { method = "GET", data, user = owner, requestOrigin = origin } = {},
) {
  const headers = new Headers({
    Origin: requestOrigin,
    "X-CSRF-Token": "campusride-site",
  });
  if (user) {
    headers.set("oai-authenticated-user-id", user);
    headers.set("oai-authenticated-user-email", user + "@example.test");
    headers.set("oai-authenticated-user-full-name", "Campus Student");
  }
  if (data && !(data instanceof FormData))
    headers.set("Content-Type", "application/json");
  return marketplace(
    new Request(origin + "/api" + path, {
      headers,
      method,
      body:
        data instanceof FormData
          ? data
          : data
            ? JSON.stringify(data)
            : undefined,
    }),
    env,
  );
}

test("student identity and labelled samples work before any listings exist", async () => {
  const env = localStorage();
  assert.equal((await call(env, "/auth/me", { user: null })).status, 401);
  assert.equal((await (await call(env, "/auth/me")).json()).user.id, owner);
  const browse = await (await call(env, "/listings?category=Scooty")).json();
  assert.deepEqual(
    browse.listings.map((row) => row.title),
    ["Honda Activa 5G"],
  );
  assert.ok(browse.listings[0].sample);
  const detail = await (
    await call(env, "/listings/" + browse.listings[0].id)
  ).json();
  assert.equal(detail.listing.contact, undefined);
});

test("two students can browse, inspect and persist listings with ownership and validation", async () => {
  const env = localStorage();
  const add = (data) => call(env, "/listings", { method: "POST", data });
  assert.equal((await add({ ...ride, price: -1 })).status, 400);
  assert.equal(
    (await call(env, "/listings", { method: "POST", data: ride, user: null }))
      .status,
    401,
  );
  assert.equal(
    (
      await call(env, "/listings", {
        method: "POST",
        data: ride,
        requestOrigin: "https://other.example.test",
      })
    ).status,
    403,
  );
  const created = await add(ride);
  assert.equal(created.status, 201);
  const { listing } = await created.json();
  assert.equal(listing.seller.id, owner);
  assert.equal(
    (
      await add({
        ...ride,
        title: "Honda Activa campus scooter",
        category: "Scooty",
        price: 38000,
      })
    ).status,
    201,
  );
  const browse = async (filters = "") =>
    (await call(env, "/listings" + filters, { user: buyer })).json();
  assert.equal((await browse()).total, 2);
  assert.deepEqual(
    (
      await browse("?search=brake+pads&maxPrice=5000&category=Cycle")
    ).listings.map((row) => row.id),
    [listing.id],
  );
  assert.equal(
    (await browse("?sort=high&limit=1")).listings[0].category,
    "Scooty",
  );
  assert.equal(
    (await browse("?sort=high&limit=1&page=2")).listings[0].category,
    "Cycle",
  );
  assert.equal((await browse("?search=no-such-ride")).total, 0);
  assert.equal((await browse()).listings[0].contact, undefined);

  const path = "/listings/" + listing.id;
  const get = async (user) =>
    (await (await call(env, path, { user })).json()).listing;
  assert.equal((await get(buyer)).contact, ride.contact);
  assert.equal((await get(null)).contact, undefined);
  assert.equal((await get(buyer)).seller.id, null);
  const edit = (data, user = owner) =>
    call(env, path, { method: "PATCH", data, user });
  assert.equal((await edit({ price: 1 }, buyer)).status, 404);
  assert.equal(
    (await call(env, path, { method: "DELETE", user: buyer })).status,
    404,
  );
  assert.equal(
    (await edit({ price: 3800, year: null, status: "sold" })).status,
    200,
  );
  assert.equal((await call(env, path, { user: buyer })).status, 404);
  assert.equal((await browse()).total, 1);
  const mine = await (await call(env, "/listings/mine")).json();
  const sold = mine.listings.find((row) => row.id === listing.id);
  assert.equal(sold.status, "sold");
  assert.equal(sold.price, 3800);
  assert.equal(sold.year, null);
  assert.equal((await edit({ status: "available" })).status, 200);
  assert.equal((await browse()).total, 2);
  assert.equal((await call(env, path, { method: "DELETE" })).status, 204);
  assert.equal((await call(env, path)).status, 404);
});

test("photo drafts are private and attaching one exposes it through the published listing", async () => {
  const env = localStorage();
  const bytes = await readFile(
    new URL("../client/public/images/campus-cycle.jpg", import.meta.url),
  );
  const form = new FormData();
  form.set("photo", new Blob([bytes], { type: "image/jpeg" }), "cycle.jpg");
  const uploaded = await call(env, "/photos", { method: "POST", data: form });
  assert.equal(uploaded.status, 201);
  const { id } = await uploaded.json();
  assert.equal((await call(env, "/photos/" + id, { user: buyer })).status, 404);
  assert.equal(
    (
      await call(env, "/listings", {
        method: "POST",
        data: { ...ride, photos: [id] },
        user: buyer,
      })
    ).status,
    400,
  );
  const created = await call(env, "/listings", {
    method: "POST",
    data: { ...ride, photos: [id] },
  });
  assert.equal(created.status, 201);
  const { listing } = await created.json();
  assert.deepEqual(listing.photos, [id]);
  const photo = await call(env, "/photos/" + id, { user: buyer });
  assert.equal(photo.headers.get("Content-Type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), bytes);
  const invalid = new FormData();
  invalid.set(
    "photo",
    new Blob(["not a photo"], { type: "image/jpeg" }),
    "invalid.jpg",
  );
  assert.equal(
    (await call(env, "/photos", { method: "POST", data: invalid })).status,
    400,
  );
});

test("the new migration preserves old listings and previously uploaded photos", async () => {
  const env = localStorage(":memory:", false);
  env.sqlite.exec(
    await readFile(
      new URL("../drizzle/0000_quiet_expediter.sql", import.meta.url),
      "utf8",
    ),
  );
  env.sqlite
    .prepare("INSERT INTO local_migrations VALUES (?)")
    .run("0000_quiet_expediter.sql");
  const id = crypto.randomUUID();
  const photo = crypto.randomUUID();
  env.sqlite
    .prepare(
      "INSERT INTO listings (id,owner,title,category,price,condition,location,description,seller,contact,image,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      owner,
      ride.title,
      ride.category,
      ride.price,
      ride.condition,
      ride.location,
      ride.description,
      "Legacy Student",
      ride.contact,
      "/api/photos/" + photo,
      Date.now(),
    );
  await env.BUCKET.put(photo, new Uint8Array([255, 216, 255]), {
    httpMetadata: { contentType: "image/jpeg" },
  });
  applyLocalMigrations(env.sqlite);
  const result = await (
    await call(env, "/listings/" + id, { user: buyer })
  ).json();
  assert.equal(result.listing.seller.name, "Legacy Student");
  assert.deepEqual(result.listing.photos, [photo]);
  assert.equal(
    (await call(env, "/photos/" + photo, { user: buyer })).status,
    200,
  );
  assert.equal(
    (
      await call(env, "/listings/" + id, {
        method: "PATCH",
        data: { photos: [photo], price: 5000 },
      })
    ).status,
    200,
  );
});
