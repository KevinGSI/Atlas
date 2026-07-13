# Atlas Accounting, Payments, Banking, and Client Financing

Status: Atlas-branded embedded ACH and card checkout implemented through Atlas Core 0.45.0. A deployment must still supply its own processor account, secrets, underwriting approval, and compliance evidence.

## Product boundary

Atlas owns the firm’s canonical accounting ledger and workflow. It does not hold client money, underwrite credit, originate loans, or collect raw bank and card credentials.

Card and ACH collection must use a sponsored, compliant payment provider through a hosted or tokenized interface. Atlas stores only an opaque provider reference, hosted checkout URL, status, amount, and reconciliation metadata. It never accepts or stores a primary account number, CVV, online-banking password, or full routing/account credentials.

Zelle is treated as an external bank payment. A firm uses Zelle through an eligible business account at its financial institution; Atlas issues or displays firm instructions and records the bank confirmation for reconciliation. Atlas does not represent itself as a Zelle network participant.

## Implemented accounting capabilities

- Case-owned invoices with currency, due date, trust/operating treatment, line items, and status.
- Derived accounts receivable, billed, paid, refunded, and outstanding balances.
- Time entries with professional, duration, rate, billable value, and invoice linkage.
- Case expenses with vendor, reimbursable status, and invoice linkage.
- Confirmed external payments for ACH, card, and Zelle.
- Refunds guarded against amounts greater than confirmed receipts.
- Trust deposits and disbursements with client/case attribution and overdraft prevention.
- Balanced double-entry journal records.
- Payment requests through interchangeable processor adapters.
- Hosted/tokenized card and ACH checkout; no raw payment credentials in Atlas.
- Concrete Stripe embedded Checkout adapter for ACH and debit/credit cards, registered only when deployment secrets are present.
- Atlas-owned client checkout page with signed 24-hour links; the processor client secret is never stored in the link or canonical accounting object.
- Signed Stripe webhook verification against the unmodified request body, five-minute replay protection, payment-state checks, and repeat-safe canonical receipt booking.
- Interchangeable bank-authorization adapters.
- Interchangeable legal-financing application adapters.
- Explicit client consent before a lender handoff.
- Canonical events and intelligence jobs for every accounting object, so the digital twin can reason over billing and payment changes.
- Firm isolation through the same workspace authorization boundary as cases and other Atlas data.

## Production integrations still required

1. Select a PCI-compliant card/ACH processor or bank/acquirer sponsor and execute the commercial and compliance agreements.
2. Configure the included Stripe adapter or implement another provider against `ProviderRegistry`; every alternative must use hosted/tokenized collection and signed, repeat-safe webhooks.
3. Select a bank-data provider, implement OAuth/token exchange in the encrypted credential vault, and add transaction synchronization and reconciliation matching.
4. Configure each firm’s trust and operating accounts, jurisdiction-specific trust rules, chart of accounts, opening balances, and approval permissions.
5. Select legal-fee financing partners, complete legal/compliance review, and implement application/status webhook adapters.
6. Complete PCI validation, ACH role analysis, fraud controls, security review, incident response, audit retention, and jurisdiction-by-jurisdiction legal-ethics review before production money movement.

## Why Atlas should not invent the regulated rails

The PCI Security Standards Council states that PCI DSS still applies when payment processing is outsourced and that merchants retain vendor oversight and compliance-validation responsibilities. It also prohibits storing card verification values after authorization. Nacha imposes risk-assessment, agreements, due diligence, exposure limits, monitoring, security, and registration responsibilities on Third-Party Senders. Those are regulated operational relationships, not ordinary application features.

References:

- [PCI SSC: outsourced payment processing responsibilities](https://www.pcisecuritystandards.org/faqs/does-pci-dss-apply-to-merchants-who-outsource-all-payment-processing-operations-and-never-store-process-or-transmit-cardholder-data/)
- [PCI SSC: card verification values may not be stored after authorization](https://www.pcisecuritystandards.org/faqs/are-merchants-allowed-to-request-card-verification-codes-values-from-cardholders/)
- [Nacha: Third-Party Sender roles and responsibilities](https://www.nacha.org/rules/third-party-sender-roles-and-responsibilities)
- [Zelle: small-business eligibility is controlled by the financial institution](https://www.zellepay.com/faq/small-business-using-zelle)

## Legal-fee financing integration candidates

This is a diligence list, not a representation that Atlas has a partnership or approved integration.

| Candidate | Fit | Public integration signal | Caveat / next step |
| --- | --- | --- | --- |
| CaseFunders | Retainers, invoices, and ongoing legal fees; firm paid upfront and client repays third-party provider | Publicly advertises an open API for proprietary intake/CRM systems | Best first partner conversation; validate lender coverage, licensing, underwriting, disclosures, webhook security, trust treatment, and commercial terms. |
| LawPay Pay Later / Affirm | Legal-fee lending; firm receives invoice or trust amount upfront | Embedded in LawPay and powered by Affirm | Public materials say it is exclusive to LawPay; pursue a platform partnership rather than assuming direct lender API access. |
| QuickFee | Financing and payment options for accounting and law firms | Publicly markets professional-services financing and upfront firm payment | Confirm U.S. legal-practice coverage, API/embedded application support, trust-account flows, and current loan structure. |
| Invoygo | Payment-plan and financing support oriented toward bankruptcy practices | Publicly markets faster firm payment while clients pay over time | Narrower practice-area fit; confirm lender identity, state availability, integration API, and funding mechanics. |
| StructuredPay | Legal-fee financing for U.S. immigration lawyers | Publicly markets upfront law-firm payment and client installments | Narrower practice-area fit; complete enhanced diligence on lending entity, licensing, disclosures, security, and API capability. |

Primary product pages reviewed July 13, 2026:

- [CaseFunders partner/API page](https://www.casefunders.com/partners/)
- [CaseFunders law-firm financing page](https://attorneys.casefunders.com/)
- [LawPay Pay Later](https://www.lawpay.com/features/legal-fee-financing/)
- [QuickFee](https://quickfee.com/)
- [Invoygo](https://invoygo.com/)
- [StructuredPay operator page](https://www.hrconsortium.us/)

ABA Formal Opinion 484 states that lawyers may participate in fee-financing arrangements subject to applicable professional-conduct duties. Atlas still needs jurisdiction-specific review, fair and reasonable terms, conflicts analysis, disclosures, informed consent where required, confidentiality safeguards, and trust-account treatment for every deployment.

- [ABA Formal Opinion 484](https://www.americanbar.org/content/dam/aba/administrative/professional_responsibility/ethics-opinions/aba-formal-opinion-484.pdf)
