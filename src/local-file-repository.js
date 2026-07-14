import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import { InMemoryRepository } from './repository.js';

const FORMAT_VERSION = 1;
const MUTATING_METHOD = /^(transaction|create|update|delete|softDelete|restore|record|clear|consume|revoke|invalidate|decide|claim|complete|fail|review|upsert|cancel|accept|acquire|renew|release)/;

export class LocalFileRepository {
  constructor(path) {
    if (!path) throw new Error('LOCAL_DATA_PATH is required for durable local storage');
    this.path = resolve(path);
    this.repository = new InMemoryRepository();
    this.load();
    return new Proxy(this, {
      get: (target, property, receiver) => {
        if (property in target) {
          const value = Reflect.get(target, property, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        }
        const value = target.repository[property];
        if (typeof value !== 'function') return value;
        return (...args) => {
          const result = value.apply(target.repository, args);
          if (!MUTATING_METHOD.test(String(property))) return result;
          if (result && typeof result.then === 'function') {
            return result.then((resolved) => { target.save(); return resolved; });
          }
          target.save();
          return result;
        };
      }
    });
  }

  load() {
    if (!existsSync(this.path)) return false;
    let envelope;
    try { envelope = deserialize(readFileSync(this.path)); }
    catch (error) { throw new Error(`Atlas could not read durable local data at ${this.path}: ${error.message}`); }
    if (envelope?.formatVersion !== FORMAT_VERSION || !envelope.state) {
      throw new Error(`Atlas local data at ${this.path} uses an unsupported format`);
    }
    this.repository.importState(envelope.state);
    return true;
  }

  save() {
    const directory = dirname(this.path);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.path}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, serialize({ formatVersion: FORMAT_VERSION, state: this.repository.exportState() }), { mode: 0o600 });
    renameSync(temporaryPath, this.path);
    chmodSync(this.path, 0o600);
  }
}

export function createLocalFileRuntime(path) {
  const repository = new LocalFileRepository(path);
  return {
    repository,
    ready: async () => true,
    close: async () => repository.save()
  };
}
