import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { Photo } from '../models/Photo.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../lib/errors.js';
export function photoRoutes(config) {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } });
  router.post('/', requireAuth(config), upload.single('photo'), async (req, res) => {
    if (!req.file || !['image/jpeg','image/png','image/webp'].includes(req.file.mimetype)) throw new HttpError(400, 'Choose a JPG, PNG or WebP photo.');
    if (await Photo.countDocuments({ owner: req.user._id, listing: null }) >= 12) throw new HttpError(429, 'Too many unused uploads. Please try again tomorrow.');
    let data;
    try { data = await sharp(req.file.buffer, { limitInputPixels: 25000000, animated: false }).rotate().resize(1400, 1100, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(); }
    catch { throw new HttpError(400, 'This file is not a supported, valid image.'); }
    if (data.length > 1024 * 1024) throw new HttpError(400, 'Photo is too complex. Please choose a smaller image.');
    const photo = await Photo.create({ owner: req.user._id, data });
    res.status(201).json({ id: photo.id, url: `/api/photos/${photo.id}` });
  });
  router.get('/:id', async (req, res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) throw new HttpError(404, 'Photo not found.');
    const photo = await Photo.findById(req.params.id).select('+data');
    if (!photo || (!photo.listing && photo.expiresAt < new Date())) throw new HttpError(404, 'Photo not found.');
    res.set({ 'Content-Type': photo.contentType, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' }).send(photo.data);
  });
  return router;
}
