import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { StripeCheckoutProvider } from '../src/payment-provider-adapters.js';

const secret='whsec_test_secret';
function provider(overrides={}){return new StripeCheckoutProvider({secretKey:'sk_test_private',publishableKey:'pk_test_public',webhookSecret:secret,checkoutSigningSecret:'checkout-signing-secret-at-least-32-characters',returnUrl:'https://atlas.example/accounting',clock:()=>1_800_000_000_000,...overrides});}
function signature(body,timestamp=1_800_000_000){return `t=${timestamp},v1=${createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex')}`;}

test('Stripe adapter creates hosted tokenized card and ACH checkout without collecting credentials',async()=>{
  const calls=[];const stripe=provider({transport:async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>({id:'cs_test_1',client_secret:'cs_test_1_secret_private'})};}});const invoice={id:'obj_invoice',title:'Legal services'};
  const card=await stripe.createCheckout({workspaceId:'wsp_1',invoice,amountMinor:12500,currency:'USD',rail:'card'});await stripe.createCheckout({workspaceId:'wsp_1',invoice,amountMinor:12500,currency:'USD',rail:'ach'});
  assert.match(card.checkoutUrl,/^https:\/\/atlas\.example\/pay\?checkout=/);assert.equal(calls[0].options.body.get('ui_mode'),'embedded');assert.equal(calls[0].options.body.get('payment_method_types[0]'),'card');assert.equal(calls[1].options.body.get('payment_method_types[0]'),'us_bank_account');assert.equal(calls[0].options.headers.authorization,'Bearer sk_test_private');assert.equal(String(calls[0].options.body).includes('cardNumber'),false);assert.equal(String(calls[0].options.body).includes('routingNumber'),false);assert.equal(card.checkoutUrl.includes('secret_private'),false);
});

test('Atlas checkout token is signed, expires, and retrieves only browser-safe configuration',async()=>{const stripe=provider({transport:async()=>({ok:true,status:200,json:async()=>({id:'cs_test_1',client_secret:'cs_test_1_secret_private',status:'open',payment_status:'unpaid',amount_total:12500,currency:'usd',expires_at:1_800_086_400})})});const token=stripe.signCheckout('cs_test_1');const config=await stripe.checkoutConfiguration(token);assert.equal(config.publishableKey,'pk_test_public');assert.equal(config.clientSecret,'cs_test_1_secret_private');assert.equal(config.amountMinor,12500);assert.throws(()=>stripe.verifyCheckout(`${token}tampered`),/invalid/);const expired=provider({clock:()=>1_800_086_401_000});assert.throws(()=>expired.verifyCheckout(token),/expired/);});

test('Stripe webhook verification rejects forgery and normalizes a paid checkout',()=>{
  const stripe=provider();const event={id:'evt_1',type:'checkout.session.async_payment_succeeded',created:1_800_000_000,data:{object:{id:'cs_1',payment_status:'paid',payment_intent:'pi_1',amount_total:25000,currency:'usd',metadata:{workspaceId:'wsp_1',invoiceId:'obj_invoice',rail:'ach'}}}};const body=JSON.stringify(event);
  const result=stripe.verifyWebhook(body,signature(body));assert.equal(result.amountMinor,25000);assert.equal(result.currency,'USD');assert.equal(result.rail,'ach');assert.throws(()=>stripe.verifyWebhook(body,'t=1800000000,v1=forged'),/signature is invalid/);assert.throws(()=>stripe.verifyWebhook(body,signature(body,1_799_999_000)),/time window/);
});

test('unpaid or unrelated Stripe webhook events do not book an Atlas payment',()=>{const stripe=provider();const event={id:'evt_pending',type:'checkout.session.completed',created:1_800_000_000,data:{object:{id:'cs_pending',payment_status:'unpaid'}}};const body=JSON.stringify(event);assert.deepEqual(stripe.verifyWebhook(body,signature(body)),{ignored:true,pending:true,eventId:'evt_pending',eventType:'checkout.session.completed'});});
