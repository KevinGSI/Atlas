import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AtlasError, required } from './errors.js';
import { BasicFileSecurityScanner } from './file-security.js';
import { FileSecurityIncidentService, isBlockedFileSecurityCode } from './file-security-incidents.js';

const SAFE_MEDIA_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png'
]);

function safeWorkspaceId(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new AtlasError('FILE_REFERENCE_INVALID', 'File workspace reference is invalid', 500);
  return value;
}

function cleanFilename(value) {
  const filename = required(value, 'filename').trim().replace(/[\\/\0]/g, '_');
  if (!filename || filename === '.' || filename === '..' || filename.length > 240) {
    throw new AtlasError('FILE_INVALID', 'The filename is invalid', 400);
  }
  return filename;
}

function decodeBase64(value) {
  if (typeof value !== 'string' || !value.length || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new AtlasError('FILE_INVALID', 'File content must be valid base64', 400);
  }
  const content = Buffer.from(value, 'base64');
  if (!content.length || content.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) {
    throw new AtlasError('FILE_INVALID', 'File content must be valid base64', 400);
  }
  return content;
}

export class InMemoryBlobStore {
  #items = new Map();
  async write({ workspaceId, sha256, content }) {
    const reference = `atlas-blob://${workspaceId}/${sha256}`;
    if (!this.#items.has(reference)) this.#items.set(reference, Buffer.from(content));
    return reference;
  }
  async read(reference) {
    const content = this.#items.get(reference);
    if (!content) throw new AtlasError('FILE_NOT_FOUND', 'Stored file was not found', 404);
    return Buffer.from(content);
  }
  async delete(reference) { this.#items.delete(reference); }
}

export class RepositoryBlobStore {
  constructor(repository,clock=()=>new Date().toISOString()){if(typeof repository?.createDocumentBlob!=='function'||typeof repository?.getDocumentBlob!=='function')throw new AtlasError('BLOB_STORE_INVALID','Repository blob methods are required',500);this.repository=repository;this.clock=clock;}
  async write({workspaceId,sha256,content}){await this.repository.createDocumentBlob(workspaceId,sha256,content,this.clock());return `atlas-blob://${workspaceId}/${sha256}`;}
  async read(reference){const match=/^atlas-blob:\/\/([^/]+)\/([a-f0-9]{64})$/.exec(reference);if(!match)throw new AtlasError('FILE_REFERENCE_INVALID','Stored file reference is invalid',500);return (await this.repository.getDocumentBlob(safeWorkspaceId(match[1]),match[2])).content;}
  async delete(reference){const match=/^atlas-blob:\/\/([^/]+)\/([a-f0-9]{64})$/.exec(reference);if(match)await this.repository.deleteDocumentBlob(safeWorkspaceId(match[1]),match[2]);}
}

export class FileSystemBlobStore {
  constructor(root) {
    if (!root) throw new AtlasError('BLOB_STORE_INVALID', 'A file storage path is required', 500);
    this.root = resolve(root);
  }
  path(workspaceId, sha256) { return join(this.root, safeWorkspaceId(workspaceId), sha256); }
  async write({ workspaceId, sha256, content }) {
    const directory = join(this.root, workspaceId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = this.path(workspaceId, sha256);
    try { await writeFile(path, content, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    return `atlas-blob://${workspaceId}/${sha256}`;
  }
  parse(reference) {
    const match = /^atlas-blob:\/\/([^/]+)\/([a-f0-9]{64})$/.exec(reference);
    if (!match) throw new AtlasError('FILE_REFERENCE_INVALID', 'Stored file reference is invalid', 500);
    return this.path(safeWorkspaceId(match[1]), match[2]);
  }
  async read(reference) {
    try { return await readFile(this.parse(reference)); }
    catch (error) { if (error.code === 'ENOENT') throw new AtlasError('FILE_NOT_FOUND', 'Stored file was not found', 404); throw error; }
  }
  async delete(reference) { try { await unlink(this.parse(reference)); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}

export class AtlasFileService {
  constructor(atlas, ingestion, blobStore, { maxBytes = 25_000_000, fileSecurityScanner = new BasicFileSecurityScanner(), fileSecurityIncidents = new FileSecurityIncidentService(atlas.repository,atlas.clock) } = {}) {
    if (typeof blobStore?.write !== 'function' || typeof blobStore?.read !== 'function') {
      throw new AtlasError('BLOB_STORE_INVALID', 'Blob store must implement write and read', 500);
    }
    this.atlas = atlas;
    this.ingestion = ingestion;
    this.blobStore = blobStore;
    this.maxBytes = maxBytes;
    this.fileSecurityScanner=fileSecurityScanner;
    this.fileSecurityIncidents=fileSecurityIncidents;
  }

  async upload(workspaceId, input, actorId) {
    const filename = cleanFilename(input.filename);
    const mediaType = required(input.mediaType, 'mediaType').toLowerCase();
    if (!SAFE_MEDIA_TYPES.has(mediaType)) throw new AtlasError('FILE_TYPE_NOT_ALLOWED', 'This file type is not allowed', 415);
    const content = decodeBase64(input.contentBase64);
    if (content.length > this.maxBytes) throw new AtlasError('FILE_TOO_LARGE', `Files may not exceed ${this.maxBytes} bytes`, 413);
    const sha256 = createHash('sha256').update(content).digest('hex');
    let securityScan;
    try{securityScan=await this.fileSecurityScanner.scan({content,filename,mediaType,workspaceId});}
    catch(error){if(isBlockedFileSecurityCode(error?.code))await this.fileSecurityIncidents.record({workspaceId,actorId,filename,mediaType,sha256,error,source:'atlas-upload'});throw error;}
    const storageRef = await this.blobStore.write({ workspaceId, sha256, content });
    return this.ingestion.ingestDocument(workspaceId, {
        connector: 'atlas-upload',
        externalId: input.externalId ?? randomUUID(),
        matterId: input.matterId ?? null,
        filename,
        mediaType,
        size: content.length,
        sha256,
        storageRef,
        documentType: input.documentType ?? null,
        securityScan
      }, actorId);
  }

  async download(workspaceId, objectId) {
    const document = await this.atlas.getObject(workspaceId, objectId);
    if (document.dimension !== 'document' || !document.state?.storageRef) {
      throw new AtlasError('FILE_NOT_AVAILABLE', 'This object does not contain a stored file', 404);
    }
    if (!document.state.storageRef.startsWith(`atlas-blob://${workspaceId}/`)) {
      throw new AtlasError('FILE_NOT_AVAILABLE', 'This file is managed by an external connector', 409);
    }
    const content = await this.blobStore.read(document.state.storageRef);
    const digest = createHash('sha256').update(content).digest('hex');
    if (digest !== document.state.sha256 || content.length !== document.state.size) {
      throw new AtlasError('FILE_INTEGRITY_FAILED', 'Stored file integrity verification failed', 500);
    }
    return { document, content };
  }
}
