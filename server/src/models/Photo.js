import mongoose from 'mongoose';
// Re-encoded images are capped at 1 MB, well below MongoDB's document limit.
const schema = new mongoose.Schema({ owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, data: { type: Buffer, required: true, select: false }, contentType: { type: String, default: 'image/webp' }, listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null }, expiresAt: { type: Date, default: () => new Date(Date.now() + 86400000), expires: 0 } }, { timestamps: true });
export const Photo = mongoose.model('Photo', schema);
