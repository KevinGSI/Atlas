import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  BasicFileSecurityScanner,
  ClamAvFileSecurityScanner,
  clamAvInstream,
  clamAvPing,
  createFileSecurityScanner,
  inspectFileSignature
} from '../src/file-security.js';

test('ClamAV readiness transport sends PING and requires a bounded PONG response',async()=>{
  const writes=[];
  class Socket extends EventEmitter {
    setTimeout(value){this.timeout=value;}
    write(value){writes.push(Buffer.from(value));queueMicrotask(()=>this.emit('data',Buffer.from('PONG\0')));return true;}
    destroy(){this.destroyed=true;}
  }
  const socket=new Socket();
  const verdict=await clamAvPing({host:'clamav',port:3310,timeoutMs:3210,connect:()=>{queueMicrotask(()=>socket.emit('connect'));return socket;}});
  assert.equal(verdict,'PONG');
  assert.equal(writes[0].toString('binary'),'zPING\0');
  assert.equal(socket.timeout,3210);
  assert.equal(socket.destroyed,true);
});

test('ClamAV transport streams the protocol command, bounded chunks, and terminator',async()=>{
  const writes=[];
  class Socket extends EventEmitter {
    setTimeout(value){this.timeout=value;}
    write(value){writes.push(Buffer.from(value));if(writes.length===4)queueMicrotask(()=>this.emit('data',Buffer.from('stream: OK\0')));return true;}
    destroy(){this.destroyed=true;}
  }
  const socket=new Socket();
  const content=Buffer.from('%PDF-protocol');
  const verdict=await clamAvInstream({host:'clamav',port:3310,content,timeoutMs:4321,connect:()=>{queueMicrotask(()=>socket.emit('connect'));return socket;}});
  assert.equal(verdict,'stream: OK');
  assert.equal(writes[0].toString('binary'),'zINSTREAM\0');
  assert.equal(writes[1].readUInt32BE(),content.length);
  assert.deepEqual(writes[2],content);
  assert.equal(writes[3].readUInt32BE(),0);
  assert.equal(socket.timeout,4321);
  assert.equal(socket.destroyed,true);
});

test('basic file security verifies supported file signatures before acceptance',async()=>{
  const scanner=new BasicFileSecurityScanner();
  const result=await scanner.scan({content:Buffer.from('%PDF-safe'),mediaType:'application/pdf'});
  assert.deepEqual(result,{status:'clean',provider:'atlas-basic',engineVersion:null,signature:null,malwareScanned:false});
  assert.throws(()=>inspectFileSignature({content:Buffer.from('not a PDF'),mediaType:'application/pdf'}),(error)=>error.code==='FILE_SIGNATURE_MISMATCH'&&error.status===415);
});

test('the standard antivirus test signature is always rejected, including without ClamAV',async()=>{
  const scanner=new BasicFileSecurityScanner();
  await assert.rejects(()=>scanner.scan({content:Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),mediaType:'text/plain'}),(error)=>error.code==='FILE_MALWARE_DETECTED'&&error.status===422);
});

test('ClamAV scanning stays behind a provider-neutral contract and records a clean verdict',async()=>{
  let received;
  const scanner=new ClamAvFileSecurityScanner({host:'clamav.internal',port:3311,timeoutMs:1234,transport:async(input)=>{received=input;return 'stream: OK';}});
  const content=Buffer.from('%PDF-clean');
  const result=await scanner.scan({content,mediaType:'application/pdf'});
  assert.deepEqual({host:received.host,port:received.port,timeoutMs:received.timeoutMs,content:received.content},{host:'clamav.internal',port:3311,timeoutMs:1234,content});
  assert.deepEqual(result,{status:'clean',provider:'clamav',engineVersion:null,signature:null,malwareScanned:true});
});

test('ClamAV malware, unavailable service, and ambiguous responses all fail closed',async()=>{
  const infected=new ClamAvFileSecurityScanner({host:'clamav',transport:async()=> 'stream: Eicar-Test-Signature FOUND'});
  await assert.rejects(()=>infected.scan({content:Buffer.from('%PDF-infected'),mediaType:'application/pdf'}),(error)=>error.code==='FILE_MALWARE_DETECTED'&&error.details.signature==='Eicar-Test-Signature');
  const unavailable=new ClamAvFileSecurityScanner({host:'clamav',transport:async()=>{throw new Error('offline');}});
  await assert.rejects(()=>unavailable.scan({content:Buffer.from('%PDF-safe'),mediaType:'application/pdf'}),(error)=>error.code==='FILE_SCANNER_UNAVAILABLE'&&error.status===503);
  const ambiguous=new ClamAvFileSecurityScanner({host:'clamav',transport:async()=> 'stream: UNKNOWN'});
  await assert.rejects(()=>ambiguous.scan({content:Buffer.from('%PDF-safe'),mediaType:'application/pdf'}),(error)=>error.code==='FILE_SCANNER_INVALID_RESPONSE'&&error.status===503);
});

test('ClamAV readiness accepts only PONG and fails closed on unavailable or ambiguous health',async()=>{
  const healthy=new ClamAvFileSecurityScanner({host:'clamav',healthTransport:async()=> 'PONG'});
  assert.equal(await healthy.ready(),true);
  const unavailable=new ClamAvFileSecurityScanner({host:'clamav',healthTransport:async()=>{throw new Error('offline');}});
  await assert.rejects(()=>unavailable.ready(),(error)=>error.code==='FILE_SCANNER_UNAVAILABLE'&&error.status===503);
  const ambiguous=new ClamAvFileSecurityScanner({host:'clamav',healthTransport:async()=> 'WAIT'});
  await assert.rejects(()=>ambiguous.ready(),(error)=>error.code==='FILE_SCANNER_UNAVAILABLE'&&error.status===503);
});

test('scanner selection is injectable and production ClamAV configuration is explicit',()=>{
  const injected={async scan(){return {status:'clean'};},async ready(){return true;}};
  assert.equal(createFileSecurityScanner({fileMalwareScanner:'clamav'},{fileSecurityScanner:injected}),injected);
  assert.throws(()=>createFileSecurityScanner({fileMalwareScanner:'basic'},{fileSecurityScanner:{async scan(){}}}),(error)=>error.code==='FILE_SCANNER_CONFIGURATION_ERROR');
  assert.equal(createFileSecurityScanner({fileMalwareScanner:'basic'}).capabilities().provider,'atlas-basic');
  assert.equal(createFileSecurityScanner({fileMalwareScanner:'clamav',clamAvHost:'clamav',clamAvPort:3310,clamAvTimeoutMs:5000},{clamAvTransport:async()=> 'stream: OK'}).capabilities().provider,'clamav');
});
