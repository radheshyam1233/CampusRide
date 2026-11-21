import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Listing } from '../models/Listing.js';
import { Photo } from '../models/Photo.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../lib/errors.js';
const objectId = z.string().refine(mongoose.isObjectIdOrHexString, 'Invalid ID');
const contact = z.string().trim().max(100).refine(s => z.email().safeParse(s).success || /^\+?[\d ()-]{10,20}$/.test(s), 'Enter a valid email or phone number');
export const listingInput = z.object({ title: z.string().trim().min(5).max(100), category: z.enum(['Cycle', 'Scooty']), price: z.number().int().min(1).max(500000), condition: z.enum(['Like new','Good','Fair','Needs repair']), location: z.string().trim().min(2).max(100), description: z.string().trim().min(20).max(3000), contact, year: z.number().int().min(1980).max(new Date().getFullYear() + 1).nullable().optional(), photos: z.array(objectId).max(4).default([]) }).strict();
const listingPatch = listingInput.partial().extend({
  photos: listingInput.shape.photos.removeDefault().optional(),
  status: z.enum(['available', 'sold']).optional(),
}).refine(data => Object.keys(data).length > 0, 'Provide at least one change');
function validId(req, res, next) { if (!mongoose.isObjectIdOrHexString(req.params.id)) return next(new HttpError(404, 'Listing not found.')); next(); }
function serialize(listing, details = false) {
  const r = listing.toObject();
  return { id: listing.id, title: r.title, category: r.category, price: r.price, condition: r.condition, location: r.location, description: r.description, year: r.year, status: r.status, photos: r.photos.map(p => String(p)), createdAt: r.createdAt, updatedAt: r.updatedAt, seller: { id: String(r.owner._id || r.owner), name: r.owner.name || 'Student' }, ...(details ? { contact: r.contact } : {}) };
}
async function checkPhotos(ids, owner, listingId) {
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Duplicate photos are not allowed.');
  const photos = await Photo.find({ _id: { $in: ids }, owner, $or: [{ listing: null, expiresAt: { $gt: new Date() } }, ...(listingId ? [{ listing: listingId }] : [])] });
  if (photos.length !== ids.length) throw new HttpError(400, 'Some photos are expired or do not belong to you. Please upload them again.');
}
export function listingRoutes(config, shutdownSignal) {
  const router = Router(); const auth = requireAuth(config);
  const subscribers = new Set();

  function announceChange() {
    for (const response of subscribers) {
      if (!response.writableNeedDrain) {
        response.write('event: listings-updated\ndata: {}\n\n');
      }
    }
  }

  shutdownSignal?.addEventListener('abort', () => {
    for (const response of subscribers) response.end();
  }, { once: true });

  router.get('/events', (req, res) => {
    // Express also sends HEAD requests through GET handlers.
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    });
    if (req.method === 'HEAD' || shutdownSignal?.aborted) return res.end();

    res.write(': connected\n\n');
    subscribers.add(res);
    const heartbeat = setInterval(() => {
      if (!res.writableNeedDrain) res.write(': keep-alive\n\n');
    }, 25_000);
    res.once('close', () => {
      subscribers.delete(res);
      clearInterval(heartbeat);
    });
  });

  router.get('/', async (req, res) => {
    const q = z.object({ search: z.string().trim().max(100).optional(), category: z.enum(['Cycle','Scooty']).optional(), maxPrice: z.coerce.number().min(1).max(500000).optional(), sort: z.enum(['newest','low','high']).default('newest'), page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(50).default(12) }).strict().parse(req.query);
    const filter = { status: 'available' };
    if (q.category) filter.category = q.category;
    if (q.maxPrice) filter.price = { $lte: q.maxPrice };
    if (q.search) { const regex = q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = ['title', 'location', 'description'].map(field => ({ [field]: { $regex: regex, $options: 'i' } })); }
    const sort = q.sort === 'low' ? { price: 1, _id: -1 } : q.sort === 'high' ? { price: -1, _id: -1 } : { createdAt: -1, _id: -1 };
    const [rows, total] = await Promise.all([Listing.find(filter).populate('owner', 'name').sort(sort).skip((q.page-1)*q.limit).limit(q.limit), Listing.countDocuments(filter)]);
    res.json({ listings: rows.map(r => serialize(r)), total, page: q.page, pages: Math.ceil(total/q.limit) });
  });
  router.get('/mine', auth, async (req, res) => { const rows = await Listing.find({ owner: req.user._id }).populate('owner','name').sort({ createdAt: -1 }); res.json({ listings: rows.map(r => serialize(r, true)) }); });
  router.get('/:id', validId, auth, async (req, res) => { const listing = await Listing.findById(req.params.id).populate('owner','name'); if (!listing) throw new HttpError(404, 'Listing not found.'); res.json({ listing: serialize(listing, true) }); });
  router.post('/', auth, async (req, res) => {
    const data = listingInput.parse(req.body);
    await checkPhotos(data.photos, req.user._id);
    const listing = await Listing.create({ ...data, owner: req.user._id });
    // No database transactions required: this also works with local standalone MongoDB.
    await Photo.updateMany({ _id: { $in: data.photos }, owner: req.user._id }, { $set: { listing: listing._id }, $unset: { expiresAt: 1 } });
    await listing.populate('owner','name');
    announceChange();
    res.status(201).json({ listing: serialize(listing, true) });
  });
  router.patch('/:id', validId, auth, async (req, res) => {
    const input = listingPatch.parse(req.body);
    const listing = await Listing.findOne({ _id: req.params.id, owner: req.user._id });
    if (!listing) throw new HttpError(404, 'Listing not found or you do not own it.');
    if (input.photos) {
      await checkPhotos(input.photos, req.user._id, listing._id);
      const removed = listing.photos.filter(id => !input.photos.includes(String(id)));
      // Keep removed images temporarily so an interrupted update never breaks the old listing.
      await Photo.updateMany({ _id: { $in: removed }, owner: req.user._id }, { $set: { listing: null, expiresAt: new Date(Date.now()+86400000) } });
      await Photo.updateMany({ _id: { $in: input.photos }, owner: req.user._id }, { $set: { listing: listing._id }, $unset: { expiresAt: 1 } });
    }
    Object.assign(listing,input); await listing.save(); await listing.populate('owner','name');
    announceChange();
    res.json({ listing: serialize(listing,true) });
  });
  router.delete('/:id', validId, auth, async (req, res) => {
    const listing = await Listing.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!listing) throw new HttpError(404, 'Listing not found or you do not own it.');
    await Photo.deleteMany({ _id: { $in: listing.photos }, owner: req.user._id });
    announceChange();
    res.status(204).end();
  });
  return router;
}
