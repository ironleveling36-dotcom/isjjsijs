let mode = 'memory';

async function connectDB() {
  const uri = (process.env.MONGODB_URI || '').trim();
  const isLocal = !uri || /127\.0\.0\.1|localhost/.test(uri);

  if (isLocal) {
    mode = 'memory';
    console.log('[DB] No remote MongoDB set. Using in-memory store (data resets on restart).');
    console.log('[DB] Set MONGODB_URI to a cloud URI (Atlas) to persist accounts.');
    return { mode };
  }

  try {
    const mongoose = require('mongoose');
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 15000
    });
    mode = 'mongo';
    console.log('[DB] MongoDB connected');
  } catch (err) {
    mode = 'memory';
    console.warn('[DB] MongoDB unreachable, falling back to memory:', err.message);
  }
  return { mode };
}

function getMode() {
  return mode;
}

module.exports = connectDB;
module.exports.getMode = getMode;
