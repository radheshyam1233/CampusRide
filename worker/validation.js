import { z } from "zod";

export const rideId = z.uuid();
export const photoId = z.uuid();
const category = z.enum(["Cycle", "Scooty"]);
const condition = z.enum(["Like new", "Good", "Fair", "Needs repair"]);
const requiredText = (min, max) => z.string().trim().min(min).max(max);
const contact = requiredText(3, 100).refine((value) => {
  const digits = value.replace(/\D/g, "");
  return (
    z.email().safeParse(value).success ||
    (/^\+?[\d ()-]+$/.test(value) && digits.length >= 10 && digits.length <= 15)
  );
}, "Enter a valid email or phone number.");

export const listingInput = z.strictObject({
  title: requiredText(5, 100),
  category,
  price: z.number().int().min(1).max(500000),
  condition,
  location: requiredText(2, 100),
  description: requiredText(20, 3000),
  contact,
  year: z
    .number()
    .int()
    .min(1980)
    .max(new Date().getFullYear() + 1)
    .nullable()
    .optional(),
  photos: z
    .array(photoId)
    .max(4)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Each photo can appear only once.",
    )
    .default([]),
});

const { photos, ...fields } = listingInput.shape;
export const listingUpdate = z
  .strictObject({
    ...Object.fromEntries(
      Object.entries(fields).map(([key, schema]) => [key, schema.optional()]),
    ),
    photos: photos.removeDefault().optional(),
    status: z.enum(["available", "sold"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "Enter at least one change.");

export const listingQuery = z.strictObject({
  search: z.string().trim().max(100).default(""),
  category: category.optional(),
  maxPrice: z.coerce.number().int().min(1).max(500000).optional(),
  sort: z.enum(["newest", "low", "high"]).default("newest"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
