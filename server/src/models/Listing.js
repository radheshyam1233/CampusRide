import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  category: { type: String, enum: ['Cycle', 'Scooty'], required: true },
  price: { type: Number, required: true, min: 1, max: 500000, validate: Number.isInteger },
  condition: { type: String, enum: ['Like new', 'Good', 'Fair', 'Needs repair'], required: true },
  location: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, required: true, trim: true, maxlength: 3000 },
  contact: { type: String, required: true, trim: true, maxlength: 100 },
  year: { type: Number, min: 1980, max: 2100 },
  status: { type: String, enum: ['available', 'sold'], default: 'available' },
  photos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }],
}, { timestamps: true });
schema.index({ status: 1, category: 1, createdAt: -1 });
schema.index({ status: 1, price: 1 });
export const Listing = mongoose.model('Listing', schema);
