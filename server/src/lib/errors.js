export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function errorHandler(error, req, res, next) {
  if (error.name === 'ZodError') return res.status(400).json({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
  if (error.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' });
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Each image must be under 5 MB.' });
  if (error.name === 'MulterError') return res.status(400).json({ error: 'Upload one photo at a time in the photo field.' });
  if (error.name === 'ValidationError' || error.name === 'CastError' || error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request data.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  const status = error.status || 500;
  if (status >= 500) console.error(error.name, error.message);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong. Please try again.' : error.message });
}
