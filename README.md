# CampusRide | IIT BHU

CampusRide is a campus marketplace for buying and selling used cycles and scooters. Students can find rides near their hostel, compare listings, and contact sellers to arrange an inspection and payment.

**[Open the live CampusRide demo](https://campusride-nesa.onrender.com/)** · [Check API health](https://campusride-nesa.onrender.com/api/health)

## What you can do

| Buyers | Sellers |
| --- | --- |
| Search by ride, hostel, or description | Create a listing with up to four photos |
| Filter by vehicle type and budget, then sort by price | Edit a listing, mark it sold, or relist it |
| Save favourites in your browser | Manage and delete your own listings |
| Sign in to view a seller’s contact details | Choose the contact details signed-in buyers can see |

The marketplace updates the current search and filters as listings change. Express sends change notifications with server-sent events, and the visible browse page checks every 15 seconds to recover from missed updates.

## Tech stack

| Layer | Implementation |
| --- | --- |
| Frontend | React, Vite, responsive CSS |
| Backend | Node.js and Express REST API with input validation and listing ownership checks |
| Database | MongoDB Atlas and Mongoose schemas for users, sessions, vehicle listings, and photos |
| Authentication | Signup and login with hashed passwords, JWTs in HttpOnly cookies, and revocable sessions |
| Deployment | One Docker web service on Render serves both the frontend and API |

A separate private preview uses the same React interface with ChatGPT sign-in, a Cloudflare Worker, D1 for listings, and R2 for photos. Its data is separate from the public MERN demo.

## Deploy the MERN app to Render

The `render.yaml` Blueprint starts one Docker web service in Singapore. Express serves the React build and API from the same HTTPS URL. MongoDB Atlas stores accounts, listings, and photos.

1. Push the project to GitHub with `render.yaml`, `Dockerfile`, and `package.json` at the repository root.
2. In MongoDB Atlas, create a cluster and a database user with read/write access to the `campusride` database. Under **Connect → Drivers**, copy the Node.js connection string, replace the credential placeholders, keep the hostname provided by Atlas, and use `/campusride` as the database name before any `?` options. URL-encode any reserved characters in the credentials.
3. In Render, choose **New → Blueprint**, connect the GitHub repository, and paste the Atlas connection string into `MONGODB_URI` when prompted. Render generates `JWT_SECRET` and supplies the public HTTPS URL through `RENDER_EXTERNAL_URL`.
4. Open the Render service and select **Connect → Outbound**. Add the listed CIDR ranges to the Atlas project's IP access list. If the first deploy failed while Atlas access was being configured, choose **Manual Deploy → Deploy latest commit** in Render after the Atlas entries are active.
5. Open the Render URL and visit `/api/health`. An HTTP `200` with `{"status":"ok"}` confirms database connectivity. On the homepage, create an account and publish a test listing. Check that a second browser on the browse page sees it appear automatically.

Keep the Atlas URI and JWT secret in Render's environment settings. For a custom HTTPS domain, set `APP_ORIGIN` to its exact origin without a trailing slash and use that URL when signing up or editing listings.

[Render Blueprint reference](https://render.com/docs/blueprint-spec) · [Connect Render to MongoDB Atlas](https://render.com/docs/connect-to-mongodb-atlas)

## Quick preview

Install Node.js 22.13 or newer and run the following from the project root.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. This preview uses a simulated signed-in student and in-memory data. You can post, edit, delete, and upload photos. Restarting the preview clears those changes.

## Run the MERN project

1. Start MongoDB. With Docker Desktop, run `docker compose up -d mongo`.
2. Copy `server/.env.example` to `server/.env`. In PowerShell, run `Copy-Item server/.env.example server/.env`.
3. Generate a local JWT secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. Paste it into `JWT_SECRET` in `server/.env`. The example points to the local MongoDB service.
4. Run `npm ci` and `npm run dev:mern`.
5. Open http://localhost:5173 and create a CampusRide account. The frontend forwards API calls to Express on port 5000.

For a single-process build, set `APP_ORIGIN` to the URL you will open, for example `http://localhost:5000` locally. Run `npm run build` and `npm start`. Configure an HTTPS origin and the production environment variables when deploying the MERN server. The Dockerfile builds the React frontend and runs Express. Use `ALLOWED_EMAIL_DOMAINS` for a comma-separated signup domain restriction. It checks the supplied domain string.

## API

Both runtimes support these routes. Routes for seller contact and changes apply authentication and ownership checks.

| Request | Use |
| --- | --- |
| `GET /api/listings` | Search and browse with `search`, `category`, `maxPrice`, `sort`, `page`, and `limit` |
| `GET /api/listings/:id` | Inspect one listing |
| `GET /api/listings/mine` | List the signed-in student's available and sold rides |
| `POST /api/listings` | Create a listing |
| `PATCH /api/listings/:id` | Edit details or change availability |
| `DELETE /api/listings/:id` | Delete an owned listing |
| `POST /api/photos` | Upload a JPG, PNG, or WebP image, up to 5 MB, in the multipart field `photo` |
| `GET /api/photos/:id` | Read an image |
| `GET /api/auth/me` | Load the signed-in student |
| `GET /api/health` | Check database connectivity |

The MERN runtime also exposes `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/listings/events` for live listing notifications. The private deployment uses the platform's sign-in and sign-out pages.

## Build and validate

```sh
npm run check
npm run test:private
npm run build
npm run build:private
```

The Express integration suite starts a temporary MongoDB instance. It may download a MongoDB binary on first run. The private API tests run the real Worker handlers against SQLite and a local object-store stand-in. They cover the buyer path, cross-account restrictions, photo ownership, and migration of earlier listings. The private build outputs a Worker module at `dist/server/index.js`. Hosting it requires the Sites access gate and the `DB` and `BUCKET` bindings. Apply the SQL migrations in `drizzle/` in order.

## Repository layout

- `client/` contains the shared React app.
- `server/` contains Express, Mongoose models, JWT auth, and MERN tests.
- `worker/` contains the hosted API, example listings, and hosted API tests.
- `drizzle/` contains versioned D1 schema migrations.
- `scripts/` contains the hosted build and isolated local preview.

Keep `server/.env`, database data, and generated bundles out of version control. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for asset and dependency notices.
