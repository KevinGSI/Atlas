import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import { InMemoryRepository } from './repository.js';

const FORMAT_VERSION = 1;
const MUTATING_METHOD = /^(transaction|create|update|delete|softDelete|restore|record|clear|consume|revoke|invalidate|decide|claim|complete|fail|review|upsert|cancel|accept|acquire|renew|release)/;

function readEnvelope(path) {
  let envelope;
  try { envelope = deserialize(readFileSync(path)); }
  catch (cause) {
    const error = new Error(`Atlas could not read durable local data at ${path}: ${cause.message}`);
    error.code = 'ATLAS_LOCAL_DATA_CORRUPT';
    throw error;
  }
  if (envelope?.formatVersion !== FORMAT_VERSION || !envelope.state) {
    const error = new Error(`Atlas local data at ${path} uses an unsupported format`);
    error.code = 'ATLAS_LOCAL_DATA_UNSUPPORTED';
    throw error;
  }
  return envelope;
}

function atomicCopy(source, destination) {
  const temporaryPath = `${destination}.${process.pid}.tmp`;
  copyFileSync(source, temporaryPath);
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, destination);
  chmodSync(destination, 0o600);
}

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
    try { envelope = readEnvelope(this.path); }
    catch (error) {
      const previousPath = `${this.path}.previous`;
      if (error.code !== 'ATLAS_LOCAL_DATA_CORRUPT' || !existsSync(previousPath)) throw error;
      envelope = readEnvelope(previousPath);
      atomicCopy(previousPath, this.path);
      console.warn(`Atlas recovered durable local data from ${previousPath}`);
    }
    this.repository.importState(envelope.state);
    return true;
  }

  save() {
    const directory = dirname(this.path);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (existsSync(this.path)) atomicCopy(this.path, `${this.path}.previous`);
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
