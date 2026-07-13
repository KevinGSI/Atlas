import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { AccountingService, ProviderRegistry } from '../src/accounting.js';

async function fixture(options = {}) {
  const repository = new InMemoryRepository();
  const atlas = new AtlasService(repository);
  const workspace = await atlas.createWorkspace({ name: 'Accounting Test Firm' });
  const matter = await atlas.createObject(workspace.id, { dimension: 'matter', type: 'civil', title: 'Morgan v. Lakeside' });
  const client = await atlas.createObject(workspace.id, { parentObjectId: matter.id, dimension: 'client', type: 'client', title: 'Taylor Morgan', state: { matterId: matter.id } });
  return { repository, atlas, workspace, matter, client, accounting: new AccountingService(atlas, options) };
}

test('invoices, external payments, refunds, and balances remain canonical firm objects', async () => {
  const { accounting, workspace, matter, repository } = await fixture();
  const invoice = await accounting.createInvoice(workspace.id, { matterId: matter.id, title: 'Initial retainer', amountMinor: 500_000, trustTreatment: 'trust' }, 'usr_billing');
  const payment = await accounting.recordExternalPayment(workspace.id, { invoiceId: invoice.id, amountMinor: 200_000, rail: 'zelle', externalReference: 'zelle-confirmation-1', destinationAccount: 'trust' }, 'usr_billing');
  await accounting.recordRefund(workspace.id, { invoiceId: invoice.id, amountMinor: 50_000, externalReference: 'refund-1' }, 'usr_billing');
  const summary = await accounting.summary(workspace.id);
  assert.equal(invoice.dimension, 'operation');
  assert.equal(payment.parentObjectId, invoice.id);
  assert.equal(summary.billedMinor, 500_000);
  assert.equal(summary.paidMinor, 150_000);
  assert.equal(summary.receivableMinor, 350_000);
  assert.equal(summary.trustReceivedMinor, 200_000);
  assert.equal((await repository.listIntelligenceJobs(workspace.id)).filter((job) => ['invoice', 'payment', 'refund'].includes(job.payload.object?.type)).length, 3);
});

test('card and ACH requests use tokenized provider checkout data and never accept raw credentials', async () => {
  let selectedRail;
  const paymentProviders = new ProviderRegistry('Payment').register('test-processor', {
    describe: () => ({ rails: ['card', 'ach'], hostedCheckout: true }),
    createCheckout: async ({ invoice, amountMinor, rail }) => {selectedRail=rail;return { status: 'pending', externalReference: `pay_${invoice.id}_${amountMinor}`, checkoutUrl: 'https://payments.example/hosted/token' };}
  });
  const { accounting, workspace, matter } = await fixture({ paymentProviders });
  const invoice = await accounting.createInvoice(workspace.id, { matterId: matter.id, title: 'Fees', amountMinor: 125_000 }, 'usr_owner');
  const request = await accounting.createPaymentRequest(workspace.id, { invoiceId: invoice.id, amountMinor: 125_000, rail: 'card', provider: 'test-processor' }, 'usr_owner');
  assert.equal(request.state.tokenized, true);
  assert.equal(request.state.checkoutUrl, 'https://payments.example/hosted/token');
  assert.equal(selectedRail,'card');
  assert.equal(JSON.stringify(request).includes('cardNumber'), false);
  await assert.rejects(() => accounting.createPaymentRequest(workspace.id, { invoiceId: invoice.id, rail: 'ach', provider: 'missing' }, 'usr_owner'), /not configured/);
});

test('Zelle is recorded as an external bank payment rather than represented as an Atlas-controlled rail', async () => {
  const { accounting, workspace, matter } = await fixture();
  const invoice = await accounting.createInvoice(workspace.id, { matterId: matter.id, title: 'Consultation', amountMinor: 25_000 }, 'usr_owner');
  const request = await accounting.createPaymentRequest(workspace.id, { invoiceId: invoice.id, rail: 'zelle', recipientAlias: 'billing@example.test' }, 'usr_owner');
  assert.equal(request.state.status, 'awaiting_external_payment');
  assert.equal(request.state.tokenized, false);
  assert.equal(request.state.provider, 'firm_bank');
});

test('signed processor confirmations book one canonical payment even when delivered twice',async()=>{let confirmation;const paymentProviders=new ProviderRegistry('Payment').register('processor',{createCheckout:async()=>({status:'awaiting_external_payment',externalReference:'checkout_1',checkoutUrl:'https://pay.example/checkout_1'}),verifyWebhook:()=>confirmation});const {accounting,workspace,matter}=await fixture({paymentProviders});const invoice=await accounting.createInvoice(workspace.id,{matterId:matter.id,title:'Invoice',amountMinor:30000},'usr_owner');await accounting.createPaymentRequest(workspace.id,{invoiceId:invoice.id,rail:'ach',provider:'processor'},'usr_owner');confirmation={workspaceId:workspace.id,invoiceId:invoice.id,rail:'ach',externalReference:'checkout_1',processorReference:'payment_1',eventId:'event_1',amountMinor:30000,currency:'USD',receivedAt:new Date().toISOString()};const first=await accounting.processPaymentWebhook('processor','{}','signed');const second=await accounting.processPaymentWebhook('processor','{}','signed');assert.equal(first.duplicate,false);assert.equal(second.duplicate,true);assert.equal((await accounting.summary(workspace.id)).payments.length,1);});

test('client financing requires explicit consent and uses a provider handoff', async () => {
  const financeProviders = new ProviderRegistry('Legal financing').register('test-lender', {
    describe: () => ({ kind: 'client_legal_fee_financing' }),
    beginApplication: async () => ({ status: 'application_started', externalReference: 'loan_1', applicationUrl: 'https://lender.example/apply/loan_1' })
  });
  const { accounting, workspace, matter } = await fixture({ financeProviders });
  const invoice = await accounting.createInvoice(workspace.id, { matterId: matter.id, title: 'Retainer', amountMinor: 750_000 }, 'usr_owner');
  await assert.rejects(() => accounting.beginFinancingApplication(workspace.id, 'test-lender', { invoiceId: invoice.id }, 'usr_owner'), /consent is required/);
  const application = await accounting.beginFinancingApplication(workspace.id, 'test-lender', { invoiceId: invoice.id, consent: true }, 'usr_owner');
  assert.equal(application.type, 'financing_application');
  assert.equal(application.state.applicationUrl, 'https://lender.example/apply/loan_1');
});

test('payments cannot silently over-collect or refunds exceed confirmed receipts', async () => {
  const { accounting, workspace, matter } = await fixture();
  const invoice = await accounting.createInvoice(workspace.id, { matterId: matter.id, title: 'Invoice', amountMinor: 10_000 }, 'usr_owner');
  await assert.rejects(() => accounting.recordExternalPayment(workspace.id, { invoiceId: invoice.id, amountMinor: 10_001, rail: 'ach', externalReference: 'bad' }, 'usr_owner'), /exceeds/);
  await assert.rejects(() => accounting.recordRefund(workspace.id, { invoiceId: invoice.id, amountMinor: 1, externalReference: 'bad-refund' }, 'usr_owner'), /exceeds/);
});

test('standard firm accounting captures time, expenses, balanced journals, and guarded trust activity', async () => {
  const { accounting, workspace, matter, client, atlas } = await fixture();
  await accounting.createTimeEntry(workspace.id, { matterId: matter.id, description: 'Draft motion', minutes: 90, rateMinor: 40_000 }, 'usr_attorney');
  await accounting.createExpense(workspace.id, { matterId: matter.id, description: 'Filing fee', amountMinor: 12_500, vendor: 'Court clerk' }, 'usr_paralegal');
  const trustDeposit=await accounting.createTrustTransaction(workspace.id, { matterId: matter.id, clientId: client.id, direction: 'deposit', amountMinor: 100_000, externalReference: 'bank-1', description: 'Client trust deposit' }, 'usr_billing');
  await accounting.createTrustTransaction(workspace.id, { matterId: matter.id, clientId: client.id, direction: 'disbursement', amountMinor: 25_000, externalReference: 'bank-2', description: 'Earned fee transfer' }, 'usr_billing');
  await accounting.createJournalEntry(workspace.id, { matterId: matter.id, description: 'Recognize earned fee', lines: [{ account: 'Trust liability', debitMinor: 25_000 }, { account: 'Fee income', creditMinor: 25_000 }] }, 'usr_billing');
  const summary = await accounting.summary(workspace.id);
  assert.equal(summary.unbilledTimeMinor, 60_000);
  assert.equal(summary.unbilledExpensesMinor, 12_500);
  assert.equal(summary.trustBalanceMinor, 75_000);
  assert.equal(summary.journalEntries.length, 1);
  await assert.rejects(() => accounting.createTrustTransaction(workspace.id, { matterId: matter.id, clientId: client.id, direction: 'disbursement', amountMinor: 75_001, externalReference: 'bank-3', description: 'Overdraw' }, 'usr_billing'), /exceeds/);
  await assert.rejects(() => accounting.createJournalEntry(workspace.id, { description: 'Bad journal', lines: [{ account: 'Cash', debitMinor: 10 }, { account: 'Income', creditMinor: 9 }] }, 'usr_billing'), /balance/);
  await assert.rejects(() => atlas.updateObject(workspace.id,trustDeposit.id,{version:trustDeposit.version,title:'Changed'},'usr_billing'),/cannot be edited/);
  await assert.rejects(() => atlas.deleteObject(workspace.id,trustDeposit.id,{version:trustDeposit.version},'usr_billing'),/cannot be deleted/);
});
