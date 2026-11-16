require('dotenv').config();
const connectDB = require('./src/config/db');
const app = require('./src/server');
const initBot = require('./src/bot');

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  await connectDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Listening on 0.0.0.0:${PORT}`);
  });
  try {
    initBot();
  } catch (err) {
    console.error('[Bot] failed to start:', err.message);
  }
}

bootstrap().catch((err) => {
  console.error('[Bootstrap Error]', err);
  process.exit(1);
});
