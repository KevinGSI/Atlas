import { createAtlasServer } from './http.js';
import { InMemoryRepository } from './repository.js';
import { AtlasService } from './service.js';
import { createRuntimeRepository } from './runtime.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
const repository = process.env.DATABASE_URL
  ? await createRuntimeRepository(process.env)
  : new InMemoryRepository();
const server = createAtlasServer(new AtlasService(repository));
server.listen(port, host, () => console.log(`Atlas Core 0.2.0 listening on http://${host}:${port}`));
