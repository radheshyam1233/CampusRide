ALTER TABLE listings ADD year integer;
--> statement-breakpoint
ALTER TABLE listings ADD photo_ids text NOT NULL DEFAULT '[]';
--> statement-breakpoint
CREATE INDEX listings_market_order ON listings (sold, created);
--> statement-breakpoint
CREATE INDEX listings_owner_order ON listings (owner, created);
--> statement-breakpoint
CREATE TABLE ride_photos (
  id text PRIMARY KEY NOT NULL,
  owner text NOT NULL,
  created integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX ride_photos_owner_created ON ride_photos (owner, created);
