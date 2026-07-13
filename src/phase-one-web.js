import { readFile } from 'node:fs/promises';

const assets={
  frontendIndex:{path:new URL('../web/phase-one/index.html',import.meta.url),contentType:'text/html; charset=utf-8'},
  frontendApp:{path:new URL('../web/phase-one/app.js',import.meta.url),contentType:'text/javascript; charset=utf-8'},
  templateEditor:{path:new URL('../web/phase-one/template-editor.html',import.meta.url),contentType:'text/html; charset=utf-8'},
  templateEditorApp:{path:new URL('../web/phase-one/template-editor.js',import.meta.url),contentType:'text/javascript; charset=utf-8'}
  ,paymentPage:{path:new URL('../web/phase-one/payment.html',import.meta.url),contentType:'text/html; charset=utf-8'}
  ,paymentApp:{path:new URL('../web/phase-one/payment.js',import.meta.url),contentType:'text/javascript; charset=utf-8'}
};

export async function phaseOneAsset(name){const asset=assets[name];if(!asset)return null;return {content:await readFile(asset.path),contentType:asset.contentType};}
