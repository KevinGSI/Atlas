import { createAtlasServer } from './http.js';
import { InMemoryRepository } from './repository.js';
import { AtlasService } from './service.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
const server = createAtlasServer(new AtlasService(new InMemoryRepository()));
server.listen(port, host, () => console.log(`Atlas Core 0.1.0 listening on http://${host}:${port}`));
