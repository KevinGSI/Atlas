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

test('QuickBooks imports are summarized separately without double-counting Atlas native books',async()=>{const {accounting,atlas,workspace,matter}=await fixture();await accounting.createInvoice(workspace.id,{matterId:matter.id,title:'Atlas invoice',amountMinor:10000},'usr_owner');await atlas.createObject(workspace.id,{dimension:'operation',type:'accounting_entry',title:'QBO invoice 42',state:{entryType:'invoice',amountMinor:25000,balanceMinor:9000,currency:'USD',externalSource:{provider:'quickbooks',externalId:'Invoice:42',status:'active'}}});await atlas.createObject(workspace.id,{dimension:'operation',type:'accounting_entry',title:'QBO payment 8',state:{entryType:'payment',amountMinor:16000,currency:'USD',externalSource:{provider:'quickbooks',externalId:'Payment:8',status:'active'}}});const summary=await accounting.summary(workspace.id);assert.equal(summary.billedMinor,10000);assert.equal(summary.quickBooks.recordCount,2);assert.equal(summary.quickBooks.billedMinor,25000);assert.equal(summary.quickBooks.receivableMinor,9000);assert.equal(summary.quickBooks.paymentsMinor,16000);assert.equal(summary.externalAccountingEntries.length,2);});

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

test('requested funds and payment plans remain canonical reviewable objects without automatic charges', async () => {
  const { accounting, workspace, matter, client } = await fixture();
  const request = await accounting.createFundRequest(workspace.id, { matterId: matter.id, clientId: client.id, title: 'Replenish trust', amountMinor: 150_000, trustTreatment: 'trust', dueAt: '2026-08-01' }, 'usr_billing');
  const invoice = await accounting.createInvoice(workspace.id, { matterId: matter.id, clientId: client.id, title: 'Legal services', amountMinor: 240_000 }, 'usr_billing');
  const plan = await accounting.createPaymentPlan(workspace.id, { invoiceId: invoice.id, installmentCount: 4, frequency: 'monthly', startAt: '2026-08-15' }, 'usr_billing');
  const summary = await accounting.summary(workspace.id);
  assert.equal(request.type, 'fund_request');
  assert.equal(request.parentObjectId, matter.id);
  assert.equal(plan.type, 'payment_plan');
  assert.equal(plan.parentObjectId, invoice.id);
  assert.equal(plan.state.installmentAmountMinor, 60_000);
  assert.equal(plan.state.automaticCharges, false);
  assert.equal(summary.fundRequests.length, 1);
  assert.equal(summary.paymentPlans.length, 1);
  await assert.rejects(() => accounting.createPaymentPlan(workspace.id, { invoiceId: invoice.id, installmentCount: 1, frequency: 'monthly' }, 'usr_billing'), /2 to 120/);
});

test('legacy reconciliation records historical payment provenance and updates invoice balance', async () => {
  const { accounting, workspace, matter, client } = await fixture();
  const invoice = await accounting.createInvoice(workspace.id, { matterId: matter.id, clientId: client.id, title: 'Migrated invoice', amountMinor: 90_000 }, 'usr_billing');
  const payment = await accounting.recordLegacyReconciliation(workspace.id, { invoiceId: invoice.id, amountMinor: 35_000, rail: 'ach', externalReference: 'prior-system-882', legacySystem: 'Prior CMS', receivedAt: '2026-06-20', notes: 'Matched to bank statement' }, 'usr_billing');
  const summary = await accounting.summary(workspace.id);
  assert.equal(payment.state.legacyReconciliation, true);
  assert.equal(payment.state.provider, 'legacy');
  assert.equal(payment.state.legacySystem, 'Prior CMS');
  assert.equal(summary.paidMinor, 35_000);
  assert.equal(summary.receivableMinor, 55_000);
});

test('trust overdraft protection is isolated to the specific client rather than the firm total', async () => {
  const { accounting, atlas, workspace, matter, client } = await fixture();
  const otherMatter = await atlas.createObject(workspace.id, { dimension: 'matter', type: 'civil', title: 'Jordan v. Hill' });
  const otherClient = await atlas.createObject(workspace.id, { parentObjectId: otherMatter.id, dimension: 'client', type: 'client', title: 'Alex Jordan', state: { matterId: otherMatter.id } });
  await accounting.createTrustTransaction(workspace.id, { matterId: matter.id, clientId: client.id, direction: 'deposit', amountMinor: 100_000, externalReference: 'bank-a', description: 'Morgan deposit' }, 'usr_billing');
  await assert.rejects(() => accounting.createTrustTransaction(workspace.id, { matterId: otherMatter.id, clientId: otherClient.id, direction: 'disbursement', amountMinor: 1, externalReference: 'bank-b', description: 'Jordan disbursement' }, 'usr_billing'), /this client/);
  assert.equal(await accounting.trustBalanceForClient(workspace.id, client.id), 100_000);
  assert.equal(await accounting.trustBalanceForClient(workspace.id, otherClient.id), 0);
});
