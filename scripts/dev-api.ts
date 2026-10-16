import 'dotenv/config';
import { createDevServer } from '../server/http/dev-adapter';

const port = Number(process.env.API_PORT ?? 3001);
createDevServer().listen(port, '127.0.0.1', () => {
  console.log(`API listening on http://127.0.0.1:${port}`);
});
