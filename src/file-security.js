import { connect as netConnect } from 'node:net';
import { AtlasError } from './errors.js';

const EICAR = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE';

function signatureMatches(content, mediaType) {
  if (mediaType === 'application/pdf') return content.subarray(0, 5).toString() === '%PDF-';
  if (mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return content.length >= 4 && content[0] === 0x50 && content[1] === 0x4b && content[2] === 0x03 && content[3] === 0x04;
  }
  if (mediaType === 'image/png') return content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mediaType === 'image/jpeg') return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  if (mediaType === 'text/plain' || mediaType === 'text/csv') {
    if (content.includes(0)) return false;
    return !content.toString('utf8').includes('\ufffd');
  }
  return false;
}

export function inspectFileSignature({ content, mediaType }) {
  if (!Buffer.isBuffer(content) || !content.length) throw new AtlasError('FILE_SECURITY_INVALID', 'File security inspection requires non-empty bytes', 400);
  if (!signatureMatches(content, mediaType)) throw new AtlasError('FILE_SIGNATURE_MISMATCH', 'File bytes do not match the declared media type', 415, { mediaType });
  if (content.toString('ascii').includes(EICAR)) throw new AtlasError('FILE_MALWARE_DETECTED', 'File was rejected by malware protection', 422, { provider: 'atlas-test-signature' });
}

export class BasicFileSecurityScanner {
  capabilities() { return { fileSignatureVerification: true, malwareScanning: false, provider: 'atlas-basic' }; }
  async ready() { return true; }
  async scan(input) {
    inspectFileSignature(input);
    return { status: 'clean', provider: 'atlas-basic', engineVersion: null, signature: null, malwareScanned: false };
  }
}

export function clamAvPing({ host, port, timeoutMs = 5_000, connect = netConnect }) {
  return new Promise((resolve, reject) => {
    let response = '';
    let settled = false;
    let socket;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket?.destroy();
      if (error) reject(error); else resolve(value);
    };
    try { socket = connect({ host, port }); }
    catch (error) { finish(error); return; }
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => socket.write(Buffer.from('zPING\0')));
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
      if (response.length > 128) { finish(new Error('ClamAV ping response exceeded limit')); return; }
      if (response.includes('\0') || response.includes('\n')) finish(null, response.replace(/\0/g, '').trim());
    });
    socket.once('timeout', () => finish(new Error('ClamAV readiness probe timed out')));
    socket.once('error', (error) => finish(error));
    socket.once('end', () => response ? finish(null, response.replace(/\0/g, '').trim()) : finish(new Error('ClamAV returned no readiness response')));
  });
}

export function clamAvInstream({ host, port, content, timeoutMs = 30_000, connect = netConnect }) {
  return new Promise((resolve, reject) => {
    let response = '';
    let settled = false;
    let socket;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket?.destroy();
      if (error) reject(error); else resolve(value);
    };
    try { socket = connect({ host, port }); }
    catch (error) { finish(error); return; }
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.write(Buffer.from('zINSTREAM\0'));
      for (let offset = 0; offset < content.length; offset += 65_536) {
        const chunk = content.subarray(offset, Math.min(offset + 65_536, content.length));
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
      if (response.length > 4_096) { finish(new Error('ClamAV response exceeded limit')); return; }
      if (response.includes('\0') || response.includes('\n')) finish(null, response.replace(/\0/g, '').trim());
    });
    socket.once('timeout', () => finish(new Error('ClamAV scan timed out')));
    socket.once('error', (error) => finish(error));
    socket.once('end', () => response ? finish(null, response.replace(/\0/g, '').trim()) : finish(new Error('ClamAV returned no verdict')));
  });
}

export class ClamAvFileSecurityScanner {
  constructor(options = {}) {
    this.host = options.host;
    this.port = options.port ?? 3310;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.transport = options.transport ?? clamAvInstream;
    this.healthTransport = options.healthTransport ?? clamAvPing;
    if (!this.host) throw new AtlasError('FILE_SCANNER_CONFIGURATION_ERROR', 'ClamAV host is required', 500);
  }
  capabilities() { return { fileSignatureVerification: true, malwareScanning: true, provider: 'clamav', protocol: 'INSTREAM' }; }
  async ready() {
    let verdict;
    try { verdict = await this.healthTransport({ host: this.host, port: this.port, timeoutMs: Math.min(this.timeoutMs, 5_000) }); }
    catch { throw new AtlasError('FILE_SCANNER_UNAVAILABLE', 'Malware scanner readiness check failed', 503, { provider: 'clamav' }); }
    if (String(verdict ?? '').trim() !== 'PONG') throw new AtlasError('FILE_SCANNER_UNAVAILABLE', 'Malware scanner readiness check did not return PONG', 503, { provider: 'clamav' });
    return true;
  }
  async scan(input) {
    inspectFileSignature(input);
    let verdict;
    try { verdict = await this.transport({ host: this.host, port: this.port, content: input.content, timeoutMs: this.timeoutMs }); }
    catch { throw new AtlasError('FILE_SCANNER_UNAVAILABLE', 'Malware scanner is unavailable; the file remains unaccepted', 503, { provider: 'clamav' }); }
    const normalized = String(verdict ?? '').trim();
    const detected = /:\s*(.+)\s+FOUND$/i.exec(normalized);
    if (detected) throw new AtlasError('FILE_MALWARE_DETECTED', 'File was rejected by malware protection', 422, { provider: 'clamav', signature: detected[1].trim() || null });
    if (!/:\s*OK$/i.test(normalized)) throw new AtlasError('FILE_SCANNER_INVALID_RESPONSE', 'Malware scanner did not return a clean verdict', 503, { provider: 'clamav' });
    return { status: 'clean', provider: 'clamav', engineVersion: null, signature: null, malwareScanned: true };
  }
}

export function createFileSecurityScanner(config, dependencies = {}) {
  if (dependencies.fileSecurityScanner) {
    if (typeof dependencies.fileSecurityScanner.scan !== 'function' || typeof dependencies.fileSecurityScanner.ready !== 'function') throw new AtlasError('FILE_SCANNER_CONFIGURATION_ERROR', 'File security scanner must implement scan and ready', 500);
    return dependencies.fileSecurityScanner;
  }
  if (config.fileMalwareScanner === 'clamav') return new ClamAvFileSecurityScanner({ host: config.clamAvHost, port: config.clamAvPort, timeoutMs: config.clamAvTimeoutMs, transport: dependencies.clamAvTransport, healthTransport: dependencies.clamAvHealthTransport });
  return new BasicFileSecurityScanner();
}
