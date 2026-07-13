import { AtlasError } from './errors.js';

const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function address(value,field='address'){
  const normalized=String(value??'').toLowerCase();
  if(!/^0x[0-9a-f]{40}$/.test(normalized))throw new AtlasError('CRYPTO_ADDRESS_INVALID',`${field} must be a valid EVM address`,400);
  return normalized;
}

function transactionHash(value){const normalized=String(value??'').toLowerCase();if(!/^0x[0-9a-f]{64}$/.test(normalized))throw new AtlasError('CRYPTO_TRANSACTION_INVALID','transactionHash must be a valid EVM transaction hash',400);return normalized;}
function topicAddress(value){return `0x${'0'.repeat(24)}${address(value).slice(2)}`;}
function hexNumber(value){return Number.parseInt(String(value),16);}

export class EvmTokenPaymentProvider{
  constructor({rpcUrl,network,chainId,asset='USDC',tokenAddress,decimals=6,confirmations=12,transport=globalThis.fetch}){
    this.rpcUrl=new URL(rpcUrl).toString();this.network=network;this.chainId=Number(chainId);this.asset=asset;this.tokenAddress=address(tokenAddress,'tokenAddress');this.decimals=Number(decimals);this.confirmations=Number(confirmations);this.transport=transport;this.requestId=0;
    if(!network||!Number.isSafeInteger(this.chainId)||this.chainId<1||!Number.isSafeInteger(this.decimals)||this.decimals<2||this.decimals>18||!Number.isSafeInteger(this.confirmations)||this.confirmations<1)throw new AtlasError('CRYPTO_PROVIDER_INVALID','Invalid EVM token provider configuration',500);
  }
  describe(){return {kind:'direct_wallet',asset:this.asset,network:this.network,chainId:this.chainId,decimals:this.decimals,requiredConfirmations:this.confirmations,custody:false};}
  validateAddress(value){return address(value);}
  quote({amountMinor,currency}){if(currency!=='USD')throw new AtlasError('CRYPTO_QUOTE_UNAVAILABLE','This crypto provider currently quotes USD invoices only',409);const units=BigInt(amountMinor)*10n**BigInt(this.decimals-2);return {asset:this.asset,network:this.network,chainId:this.chainId,tokenAddress:this.tokenAddress,decimals:this.decimals,units:units.toString(),fiatAmountMinor:amountMinor,currency,quotedAt:new Date().toISOString()};}
  instruction({destinationAddress,quote}){const destination=this.validateAddress(destinationAddress);return {destinationAddress:destination,paymentUri:`ethereum:${this.tokenAddress}@${this.chainId}/transfer?address=${destination}&uint256=${quote.units}`};}
  async rpc(method,params){const response=await this.transport(this.rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++this.requestId,method,params})});if(!response?.ok)throw new AtlasError('CRYPTO_NETWORK_UNAVAILABLE','Blockchain provider request failed',502,{status:response?.status});const body=await response.json();if(body.error)throw new AtlasError('CRYPTO_NETWORK_UNAVAILABLE','Blockchain provider returned an error',502,{providerCode:body.error.code});return body.result;}
  async verifyTransaction({transactionHash:value,destinationAddress,expectedUnits}){const hash=transactionHash(value);const destination=address(destinationAddress);const receipt=await this.rpc('eth_getTransactionReceipt',[hash]);if(!receipt)return {status:'pending',transactionHash:hash,confirmations:0};if(receipt.status!=='0x1')return {status:'failed',transactionHash:hash,confirmations:0};const log=(receipt.logs??[]).find(item=>String(item.address).toLowerCase()===this.tokenAddress&&String(item.topics?.[0]).toLowerCase()===transferTopic&&String(item.topics?.[2]).toLowerCase()===topicAddress(destination));if(!log)throw new AtlasError('CRYPTO_TRANSFER_MISMATCH','Transaction does not contain the expected token transfer to the firm address',409);const units=BigInt(log.data);if(units<BigInt(expectedUnits))throw new AtlasError('CRYPTO_PAYMENT_UNDERPAID','Confirmed token transfer is less than the requested amount',409,{expectedUnits:String(expectedUnits),receivedUnits:units.toString()});const current=hexNumber(await this.rpc('eth_blockNumber',[]));const included=hexNumber(receipt.blockNumber);const confirmations=Math.max(0,current-included+1);return {status:confirmations>=this.confirmations?'confirmed':'pending',transactionHash:hash,confirmations,blockNumber:included,receivedUnits:units.toString(),asset:this.asset,network:this.network,tokenAddress:this.tokenAddress};}
}
