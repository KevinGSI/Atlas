import { AtlasError, required } from './errors.js';

const paymentRails = new Set(['ach', 'card', 'zelle', 'crypto']);
const invoiceStatuses = new Set(['draft', 'issued']);
const accountTreatments = new Set(['operating', 'trust']);

function positiveMinor(value, field = 'amountMinor') {
  if (!Number.isSafeInteger(value) || value < 1) throw new AtlasError('VALIDATION_ERROR', `${field} must be a positive integer in the currency's smallest unit`, 400);
  return value;
}

function optionalDate(value, field) {
  if (value == null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new AtlasError('VALIDATION_ERROR', `${field} must be a valid date`, 400);
  return parsed.toISOString();
}

export class ProviderRegistry {
  constructor(kind) { this.kind = kind; this.providers = new Map(); }
  register(name, provider) {
    if (!name || !provider) throw new AtlasError('PROVIDER_INVALID', `${this.kind} provider requires a name and implementation`, 500);
    this.providers.set(name, provider); return this;
  }
  list() { return [...this.providers.entries()].map(([name, provider]) => ({ name, ...(provider.describe?.() ?? {}) })); }
  resolve(name) {
    const provider = this.providers.get(name);
    if (!provider) throw new AtlasError('PROVIDER_NOT_CONFIGURED', `${this.kind} provider is not configured`, 409, { provider: name });
    return provider;
  }
}

export class AccountingService {
  constructor(atlasService, options = {}) {
    this.atlas = atlasService;
    this.paymentProviders = options.paymentProviders ?? new ProviderRegistry('Payment');
    this.bankProviders = options.bankProviders ?? new ProviderRegistry('Bank connection');
    this.financeProviders = options.financeProviders ?? new ProviderRegistry('Legal financing');
    this.cryptoProviders = options.cryptoProviders ?? new ProviderRegistry('Crypto payment');
    this.subscriptionPrices = options.subscriptionPrices ?? {};
    this.platformCryptoAccount = options.platformCryptoAccount ?? null;
  }

  async objects(workspaceId) { return this.atlas.listObjects(workspaceId, { dimension: 'operation' }); }

  async requireMatter(workspaceId, matterId) {
    const matter = await this.atlas.getObject(workspaceId, required(matterId, 'matterId'));
    if (matter.dimension !== 'matter') throw new AtlasError('VALIDATION_ERROR', 'matterId must identify a case', 400);
    return matter;
  }

  async requireInvoice(workspaceId, invoiceId) {
    const invoice = await this.atlas.getObject(workspaceId, required(invoiceId, 'invoiceId'));
    if (invoice.dimension !== 'operation' || invoice.type !== 'invoice') throw new AtlasError('VALIDATION_ERROR', 'invoiceId must identify an invoice', 400);
    return invoice;
  }

  async requireClient(workspaceId, clientId) {
    if (!clientId) return null;
    const client = await this.atlas.getObject(workspaceId, clientId);
    if (!['client', 'person'].includes(client.dimension)) throw new AtlasError('VALIDATION_ERROR', 'clientId must identify a client or person in this firm', 400);
    return client;
  }

  async createInvoice(workspaceId, input, actorId) {
    const matter = await this.requireMatter(workspaceId, input.matterId);
    const amountMinor = positiveMinor(input.amountMinor);
    const status = input.status ?? 'issued';
    if (!invoiceStatuses.has(status)) throw new AtlasError('VALIDATION_ERROR', 'Invoice status must be draft or issued', 400);
    const trustTreatment = input.trustTreatment ?? 'operating';
    if (!accountTreatments.has(trustTreatment)) throw new AtlasError('VALIDATION_ERROR', 'trustTreatment must be operating or trust', 400);
    await this.requireClient(workspaceId, input.clientId);
    return this.atlas.createObject(workspaceId, {
      parentObjectId: matter.id, dimension: 'operation', type: 'invoice', actorId,
      title: required(input.title, 'title'),
      state: {
        scope: 'matter', matterId: matter.id, clientId: input.clientId ?? null,
        invoiceNumber: input.invoiceNumber ?? null, currency: input.currency ?? 'USD', amountMinor,
        dueAt: optionalDate(input.dueAt, 'dueAt'), status, trustTreatment,
        lineItems: Array.isArray(input.lineItems) ? input.lineItems : [], notes: input.notes ?? null
      }
    });
  }

  async invoiceBalance(workspaceId, invoice) {
    const objects = await this.objects(workspaceId);
    const applied = objects.filter((item) => item.type === 'payment' && item.state?.invoiceId === invoice.id && item.state?.status === 'confirmed')
      .reduce((sum, item) => sum + Number(item.state.amountMinor ?? 0), 0);
    const refunded = objects.filter((item) => item.type === 'refund' && item.state?.invoiceId === invoice.id && item.state?.status === 'confirmed')
      .reduce((sum, item) => sum + Number(item.state.amountMinor ?? 0), 0);
    return { amountMinor: Number(invoice.state.amountMinor), paidMinor: applied - refunded, outstandingMinor: Math.max(0, Number(invoice.state.amountMinor) - applied + refunded) };
  }

  async createPaymentRequest(workspaceId, input, actorId) {
    const invoice = await this.requireInvoice(workspaceId, input.invoiceId);
    const balance = await this.invoiceBalance(workspaceId, invoice);
    const amountMinor = positiveMinor(input.amountMinor ?? balance.outstandingMinor);
    if (amountMinor > balance.outstandingMinor) throw new AtlasError('PAYMENT_EXCEEDS_BALANCE', 'Payment request exceeds the outstanding invoice balance', 400);
    const rail = required(input.rail, 'rail');
    if (!paymentRails.has(rail)) throw new AtlasError('VALIDATION_ERROR', 'rail must be ach, card, zelle, or crypto', 400);
    if(rail==='crypto')throw new AtlasError('CRYPTO_CONFIRMATION_REQUIRED','Crypto payments must be confirmed through the blockchain verification endpoint',409);
    let external = { status: 'awaiting_external_payment', externalReference: null, checkoutUrl: null };
    if (rail !== 'zelle') {
      const provider = this.paymentProviders.resolve(required(input.provider, 'provider'));
      external = await provider.createCheckout({ workspaceId, invoice, amountMinor, currency: invoice.state.currency, returnUrl: input.returnUrl ?? null, rail });
    }
    return this.atlas.createObject(workspaceId, {
      parentObjectId: invoice.id, dimension: 'operation', type: 'payment_request', actorId,
      title: `${rail.toUpperCase()} payment request · ${invoice.title}`,
      state: {
        scope: 'matter', matterId: invoice.state.matterId, invoiceId: invoice.id, clientId: invoice.state.clientId,
        rail, provider: input.provider ?? (rail === 'zelle' ? 'firm_bank' : null), amountMinor, currency: invoice.state.currency,
        status: external.status ?? 'pending', externalReference: external.externalReference ?? null,
        checkoutUrl: external.checkoutUrl ?? null, recipientAlias: rail === 'zelle' ? (input.recipientAlias ?? null) : null,
        tokenized: rail !== 'zelle', expiresAt: optionalDate(input.expiresAt, 'expiresAt')
      }
    });
  }

  async recordExternalPayment(workspaceId, input, actorId) {
    const invoice = await this.requireInvoice(workspaceId, input.invoiceId);
    const balance = await this.invoiceBalance(workspaceId, invoice);
    const amountMinor = positiveMinor(input.amountMinor);
    if (amountMinor > balance.outstandingMinor && !input.allowCreditBalance) throw new AtlasError('PAYMENT_EXCEEDS_BALANCE', 'Payment exceeds the outstanding invoice balance', 400);
    const rail = required(input.rail, 'rail');
    if (!paymentRails.has(rail)) throw new AtlasError('VALIDATION_ERROR', 'rail must be ach, card, or zelle', 400);
    if(rail==='crypto')throw new AtlasError('CRYPTO_CONFIRMATION_REQUIRED','Crypto payments must be confirmed through the blockchain verification endpoint',409);
    const destinationAccount = input.destinationAccount ?? invoice.state.trustTreatment;
    if (!accountTreatments.has(destinationAccount)) throw new AtlasError('VALIDATION_ERROR', 'destinationAccount must be operating or trust', 400);
    return this.atlas.createObject(workspaceId, {
      parentObjectId: invoice.id, dimension: 'operation', type: 'payment', actorId,
      title: `Payment received · ${invoice.title}`,
      state: {
        scope: 'matter', matterId: invoice.state.matterId, invoiceId: invoice.id, clientId: invoice.state.clientId,
        rail, provider: input.provider ?? 'external', amountMinor, currency: invoice.state.currency, status: 'confirmed',
        externalReference: required(input.externalReference, 'externalReference'), receivedAt: optionalDate(input.receivedAt, 'receivedAt') ?? new Date().toISOString(),
        destinationAccount, manuallyVerified: input.manuallyVerified !== false
      }
    });
  }

  async confirmProcessorPayment(workspaceId,input,actorId='processor'){
    const objects=await this.objects(workspaceId);const request=objects.find(item=>item.type==='payment_request'&&item.state?.provider===input.provider&&item.state?.externalReference===input.externalReference);
    if(!request)throw new AtlasError('PAYMENT_REQUEST_NOT_FOUND','No matching Atlas payment request was found',404);
    const existing=objects.find(item=>item.type==='payment'&&item.state?.provider===input.provider&&item.state?.processorEventId===input.eventId);if(existing)return existing;
    if(request.state.invoiceId!==input.invoiceId||request.state.rail!==input.rail||request.state.amountMinor!==input.amountMinor||String(request.state.currency).toUpperCase()!==String(input.currency).toUpperCase())throw new AtlasError('PAYMENT_CONFIRMATION_MISMATCH','Processor confirmation does not match the Atlas payment request',409);
    const invoice=await this.requireInvoice(workspaceId,input.invoiceId);const destinationAccount=invoice.state.trustTreatment;
    return this.atlas.createObject(workspaceId,{parentObjectId:invoice.id,dimension:'operation',type:'payment',actorId,title:`Payment received · ${invoice.title}`,state:{scope:'matter',matterId:invoice.state.matterId,invoiceId:invoice.id,clientId:invoice.state.clientId,rail:input.rail,provider:input.provider,amountMinor:input.amountMinor,currency:input.currency,status:'confirmed',externalReference:input.processorReference,processorEventId:input.eventId,receivedAt:input.receivedAt,destinationAccount,manuallyVerified:false,tokenized:true}});
  }

  async processPaymentWebhook(providerName,rawBody,signature){const provider=this.paymentProviders.resolve(providerName);if(typeof provider.verifyWebhook!=='function')throw new AtlasError('PAYMENT_WEBHOOK_UNSUPPORTED','Payment provider does not support signed webhooks',409);const confirmation=provider.verifyWebhook(rawBody,signature);if(confirmation.ignored)return confirmation;if(!confirmation.workspaceId)throw new AtlasError('PAYMENT_CONFIRMATION_MISMATCH','Payment confirmation is missing its Atlas workspace',409);const duplicate=(await this.objects(confirmation.workspaceId)).some(item=>item.type==='payment'&&item.state?.provider===providerName&&item.state?.processorEventId===confirmation.eventId);const payment=await this.confirmProcessorPayment(confirmation.workspaceId,{...confirmation,provider:providerName},`processor:${providerName}`);return {received:true,paymentId:payment.id,duplicate};}
  async paymentCheckoutConfiguration(providerName,token){const provider=this.paymentProviders.resolve(providerName);if(typeof provider.checkoutConfiguration!=='function')throw new AtlasError('PAYMENT_CHECKOUT_UNSUPPORTED','Payment provider does not support embedded checkout',409);return provider.checkoutConfiguration(token);}

  async recordRefund(workspaceId, input, actorId) {
    const invoice = await this.requireInvoice(workspaceId, input.invoiceId);
    const balance = await this.invoiceBalance(workspaceId, invoice);
    const amountMinor = positiveMinor(input.amountMinor);
    if (amountMinor > balance.paidMinor) throw new AtlasError('REFUND_EXCEEDS_PAID', 'Refund exceeds confirmed payments on the invoice', 400);
    return this.atlas.createObject(workspaceId, {
      parentObjectId: invoice.id, dimension: 'operation', type: 'refund', actorId,
      title: `Refund · ${invoice.title}`,
      state: { scope: 'matter', matterId: invoice.state.matterId, invoiceId: invoice.id, amountMinor, currency: invoice.state.currency, status: 'confirmed', externalReference: required(input.externalReference, 'externalReference'), sourceAccount: input.sourceAccount ?? invoice.state.trustTreatment, reason: input.reason ?? null }
    });
  }

  async createTimeEntry(workspaceId, input, actorId) {
    const matter = await this.requireMatter(workspaceId, input.matterId);
    await this.requireClient(workspaceId, input.clientId);
    if (!Number.isSafeInteger(input.minutes) || input.minutes < 1) throw new AtlasError('VALIDATION_ERROR', 'minutes must be a positive integer', 400);
    const rateMinor = positiveMinor(input.rateMinor, 'rateMinor');
    return this.atlas.createObject(workspaceId, {
      parentObjectId: matter.id, dimension: 'operation', type: 'time_entry', actorId,
      title: required(input.description, 'description'),
      state: { scope: 'matter', matterId: matter.id, clientId: input.clientId ?? null, professionalId: actorId, minutes: input.minutes, rateMinor, valueMinor: Math.round(input.minutes * rateMinor / 60), currency: input.currency ?? 'USD', billable: input.billable !== false, billedInvoiceId: input.billedInvoiceId ?? null, performedAt: optionalDate(input.performedAt, 'performedAt') ?? new Date().toISOString() }
    });
  }

  async createExpense(workspaceId, input, actorId) {
    const matter = await this.requireMatter(workspaceId, input.matterId);
    await this.requireClient(workspaceId, input.clientId);
    return this.atlas.createObject(workspaceId, {
      parentObjectId: matter.id, dimension: 'operation', type: 'expense', actorId,
      title: required(input.description, 'description'),
      state: { scope: 'matter', matterId: matter.id, clientId: input.clientId ?? null, amountMinor: positiveMinor(input.amountMinor), currency: input.currency ?? 'USD', vendor: input.vendor ?? null, reimbursable: input.reimbursable !== false, billedInvoiceId: input.billedInvoiceId ?? null, incurredAt: optionalDate(input.incurredAt, 'incurredAt') ?? new Date().toISOString() }
    });
  }

  async createTrustTransaction(workspaceId, input, actorId) {
    const matter = await this.requireMatter(workspaceId, input.matterId);
    await this.requireClient(workspaceId, required(input.clientId, 'clientId'));
    const direction = required(input.direction, 'direction');
    if (!['deposit', 'disbursement'].includes(direction)) throw new AtlasError('VALIDATION_ERROR', 'direction must be deposit or disbursement', 400);
    const amountMinor = positiveMinor(input.amountMinor);
    const summary = await this.summary(workspaceId);
    if (direction === 'disbursement' && amountMinor > summary.trustBalanceMinor) throw new AtlasError('INSUFFICIENT_TRUST_FUNDS', 'Trust disbursement exceeds the recorded trust balance', 409);
    return this.atlas.createObject(workspaceId, {
      parentObjectId: matter.id, dimension: 'operation', type: 'trust_transaction', actorId,
      title: required(input.description, 'description'),
      state: { scope: 'matter', matterId: matter.id, clientId: input.clientId, direction, amountMinor, currency: input.currency ?? 'USD', externalReference: required(input.externalReference, 'externalReference'), occurredAt: optionalDate(input.occurredAt, 'occurredAt') ?? new Date().toISOString(), reconciled: input.reconciled === true }
    });
  }

  async createJournalEntry(workspaceId, input, actorId) {
    const lines = Array.isArray(input.lines) ? input.lines : [];
    if (lines.length < 2) throw new AtlasError('VALIDATION_ERROR', 'A journal entry requires at least two lines', 400);
    const normalized = lines.map((line) => ({ account: required(line.account, 'account'), debitMinor: Number(line.debitMinor ?? 0), creditMinor: Number(line.creditMinor ?? 0) }));
    for (const line of normalized) if (!Number.isSafeInteger(line.debitMinor) || !Number.isSafeInteger(line.creditMinor) || line.debitMinor < 0 || line.creditMinor < 0 || (line.debitMinor && line.creditMinor)) throw new AtlasError('VALIDATION_ERROR', 'Journal lines require non-negative integer debit or credit values', 400);
    const debits = normalized.reduce((sum, line) => sum + line.debitMinor, 0);
    const credits = normalized.reduce((sum, line) => sum + line.creditMinor, 0);
    if (debits < 1 || debits !== credits) throw new AtlasError('UNBALANCED_JOURNAL', 'Journal entry debits and credits must balance', 400);
    return this.atlas.createObject(workspaceId, { parentObjectId: input.matterId ?? null, dimension: 'operation', type: 'journal_entry', actorId, title: required(input.description, 'description'), state: { scope: input.matterId ? 'matter' : 'firm', matterId: input.matterId ?? null, currency: input.currency ?? 'USD', lines: normalized, postedAt: optionalDate(input.postedAt, 'postedAt') ?? new Date().toISOString(), status: 'posted' } });
  }

  async summary(workspaceId) {
    const objects = await this.objects(workspaceId);
    const invoices = objects.filter((item) => item.type === 'invoice');
    const rows = await Promise.all(invoices.map(async (invoice) => ({ invoice, ...(await this.invoiceBalance(workspaceId, invoice)) })));
    const payments = objects.filter((item) => item.type === 'payment');
    const refunds = objects.filter((item) => item.type === 'refund');
    const timeEntries = objects.filter((item) => item.type === 'time_entry');
    const expenses = objects.filter((item) => item.type === 'expense');
    const trustTransactions = objects.filter((item) => item.type === 'trust_transaction');
    const trustReceivedMinor = payments.filter((item) => item.state.destinationAccount === 'trust').reduce((sum, item) => sum + Number(item.state.amountMinor ?? 0), 0);
    const trustRefundedMinor = refunds.filter((item) => item.state.sourceAccount === 'trust').reduce((sum, item) => sum + Number(item.state.amountMinor ?? 0), 0);
    const trustAdjustmentsMinor = trustTransactions.reduce((sum, item) => sum + (item.state.direction === 'deposit' ? 1 : -1) * Number(item.state.amountMinor ?? 0), 0);
    return {
      currency: 'USD', invoiceCount: rows.length,
      billedMinor: rows.reduce((sum, row) => sum + row.amountMinor, 0),
      paidMinor: rows.reduce((sum, row) => sum + row.paidMinor, 0),
      receivableMinor: rows.reduce((sum, row) => sum + row.outstandingMinor, 0),
      trustReceivedMinor, trustBalanceMinor: trustReceivedMinor - trustRefundedMinor + trustAdjustmentsMinor,
      unbilledTimeMinor: timeEntries.filter((item) => item.state.billable && !item.state.billedInvoiceId).reduce((sum, item) => sum + Number(item.state.valueMinor ?? 0), 0),
      unbilledExpensesMinor: expenses.filter((item) => item.state.reimbursable && !item.state.billedInvoiceId).reduce((sum, item) => sum + Number(item.state.amountMinor ?? 0), 0),
      invoices: rows, payments, refunds,
      timeEntries, expenses, trustTransactions, journalEntries: objects.filter((item) => item.type === 'journal_entry'),
      bankConnections: objects.filter((item) => item.type === 'bank_connection'),
      financingApplications: objects.filter((item) => item.type === 'financing_application')
    };
  }

  listProviders() { return { payments: this.paymentProviders.list(), banks: this.bankProviders.list(), financing: this.financeProviders.list(), crypto: this.cryptoProviders.list(), rails: [...paymentRails] }; }

  async createCryptoReceivingAccount(workspaceId,input,actorId){const provider=this.cryptoProviders.resolve(required(input.provider,'provider'));const publicAddress=provider.validateAddress(required(input.address,'address'));const existing=(await this.objects(workspaceId)).find(item=>item.type==='crypto_receiving_account'&&item.state?.provider===input.provider&&item.state?.address===publicAddress);if(existing)return existing;return this.atlas.createObject(workspaceId,{dimension:'operation',type:'crypto_receiving_account',actorId,title:`${provider.describe().asset} receiving account`,state:{scope:'firm',provider:input.provider,address:publicAddress,...provider.describe(),status:'active',custody:false}});}

  async cryptoRequest(workspaceId,{providerName,address:destination,amountMinor,currency,title,parentObjectId=null,matterId=null,clientId=null,invoiceId=null,purpose},actorId){const provider=this.cryptoProviders.resolve(providerName);const quote=provider.quote({amountMinor,currency});const instruction=provider.instruction({destinationAddress:destination,quote});return this.atlas.createObject(workspaceId,{parentObjectId,dimension:'operation',type:'crypto_payment_request',actorId,title,state:{scope:matterId?'matter':'firm',matterId,clientId,invoiceId,purpose,provider:providerName,status:'awaiting_payment',amountMinor,currency,...quote,...instruction,custody:false,createdAt:new Date().toISOString()}});}

  async createInvoiceCryptoRequest(workspaceId,input,actorId){const invoice=await this.requireInvoice(workspaceId,input.invoiceId);const balance=await this.invoiceBalance(workspaceId,invoice);const amountMinor=positiveMinor(input.amountMinor??balance.outstandingMinor);if(amountMinor>balance.outstandingMinor)throw new AtlasError('PAYMENT_EXCEEDS_BALANCE','Crypto request exceeds the outstanding invoice balance',400);const account=await this.atlas.getObject(workspaceId,required(input.receivingAccountId,'receivingAccountId'));if(account.type!=='crypto_receiving_account'||account.state?.status!=='active')throw new AtlasError('CRYPTO_ACCOUNT_INVALID','receivingAccountId must identify an active firm crypto account',400);return this.cryptoRequest(workspaceId,{providerName:account.state.provider,address:account.state.address,amountMinor,currency:invoice.state.currency,title:`Crypto payment request · ${invoice.title}`,parentObjectId:invoice.id,matterId:invoice.state.matterId,clientId:invoice.state.clientId,invoiceId:invoice.id,purpose:'client_invoice'},actorId);}

  async createSubscriptionCryptoRequest(workspaceId,input,actorId){const subscription=await this.atlas.repository.getSubscription(workspaceId);const amountMinor=this.subscriptionPrices[subscription.plan];if(!Number.isSafeInteger(amountMinor)||amountMinor<1)throw new AtlasError('SUBSCRIPTION_CRYPTO_PRICE_UNAVAILABLE','Crypto subscription pricing is not configured for this plan',409,{plan:subscription.plan});if(!this.platformCryptoAccount)throw new AtlasError('PLATFORM_CRYPTO_ACCOUNT_UNAVAILABLE','Atlas subscription crypto collection is not configured',503);return this.cryptoRequest(workspaceId,{providerName:this.platformCryptoAccount.provider,address:this.platformCryptoAccount.address,amountMinor,currency:'USD',title:`Atlas ${subscription.plan} subscription`,purpose:'atlas_subscription'},actorId);}

  async confirmCryptoPayment(workspaceId,input,actorId){const request=await this.atlas.getObject(workspaceId,required(input.paymentRequestId,'paymentRequestId'));if(request.type!=='crypto_payment_request')throw new AtlasError('VALIDATION_ERROR','paymentRequestId must identify a crypto payment request',400);const provider=this.cryptoProviders.resolve(request.state.provider);const verified=await provider.verifyTransaction({transactionHash:required(input.transactionHash,'transactionHash'),destinationAddress:request.state.destinationAddress,expectedUnits:request.state.units});if(verified.status!=='confirmed')return {status:verified.status,confirmations:verified.confirmations,requiredConfirmations:provider.describe().requiredConfirmations,payment:null};const objects=await this.objects(workspaceId);const duplicate=objects.find(item=>['payment','subscription_payment'].includes(item.type)&&item.state?.transactionHash===verified.transactionHash);if(duplicate)return {status:'confirmed',confirmations:verified.confirmations,payment:duplicate,duplicate:true};const type=request.state.purpose==='atlas_subscription'?'subscription_payment':'payment';const payment=await this.atlas.createObject(workspaceId,{parentObjectId:request.state.invoiceId??null,dimension:'operation',type,actorId,title:type==='payment'?`Crypto payment received · ${request.title}`:'Atlas subscription paid in crypto',state:{scope:request.state.matterId?'matter':'firm',matterId:request.state.matterId,clientId:request.state.clientId,invoiceId:request.state.invoiceId,paymentRequestId:request.id,rail:'crypto',provider:request.state.provider,status:'confirmed',amountMinor:request.state.amountMinor,currency:request.state.currency,asset:verified.asset,network:verified.network,tokenAddress:verified.tokenAddress,units:verified.receivedUnits,transactionHash:verified.transactionHash,blockNumber:verified.blockNumber,confirmations:verified.confirmations,fairMarketValueMinor:request.state.amountMinor,valuedAt:new Date().toISOString(),custody:false,destinationAccount:request.state.purpose==='client_invoice'?'operating':'platform'}});if(type==='subscription_payment'){const subscription=await this.atlas.repository.getSubscription(workspaceId);const periodEnd=new Date();periodEnd.setUTCMonth(periodEnd.getUTCMonth()+1);await this.atlas.repository.updateSubscription(workspaceId,{status:'active',currentPeriodEndsAt:periodEnd.toISOString()},new Date().toISOString());}return {status:'confirmed',confirmations:verified.confirmations,payment};}

  async beginBankAuthorization(workspaceId, providerName, input, actorId) {
    const provider = this.bankProviders.resolve(providerName);
    return provider.beginAuthorization({ workspaceId, actorId, redirectUri: required(input.redirectUri, 'redirectUri') });
  }

  async beginFinancingApplication(workspaceId, providerName, input, actorId) {
    const invoice = await this.requireInvoice(workspaceId, input.invoiceId);
    if (input.consent !== true) throw new AtlasError('CLIENT_CONSENT_REQUIRED', 'Client consent is required before sharing an application with a lender', 400);
    const balance = await this.invoiceBalance(workspaceId, invoice);
    const amountMinor = positiveMinor(input.amountMinor ?? balance.outstandingMinor);
    const provider = this.financeProviders.resolve(providerName);
    const handoff = await provider.beginApplication({ workspaceId, invoice, amountMinor, currency: invoice.state.currency, returnUrl: input.returnUrl ?? null });
    return this.atlas.createObject(workspaceId, {
      parentObjectId: invoice.id, dimension: 'operation', type: 'financing_application', actorId,
      title: `Client financing · ${invoice.title}`,
      state: { scope: 'matter', matterId: invoice.state.matterId, clientId: invoice.state.clientId, invoiceId: invoice.id, provider: providerName, amountMinor, currency: invoice.state.currency, status: handoff.status ?? 'application_started', externalReference: handoff.externalReference ?? null, applicationUrl: handoff.applicationUrl ?? null, consentedAt: new Date().toISOString() }
    });
  }
}
