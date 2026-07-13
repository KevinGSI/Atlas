# Crypto payments and legal phone assistant

## Production boundaries

Atlas does not hold crypto private keys, custody client funds, exchange assets, or transmit money. A firm supplies a public receiving address. Atlas creates a payment instruction and books a canonical payment only after an interchangeable chain provider verifies the token contract, destination, amount, transaction hash, and required confirmation depth. Fair-market-value and transaction metadata are retained for accounting review.

The phone assistant is the firm digital twin operating through a replaceable telephony adapter. The initial carrier adapter accepts signed Twilio inbound-call webhooks and returns TwiML. Core call intelligence is not coupled to Twilio or to a particular AI model.

## Phone behavior implemented

- Personalized firm greeting and clear automated-assistant disclosure
- Caller screening and firm-scoped known-contact matching
- Firm-approved administrative FAQ answers
- Preliminary prospective-client intake for conflict checking and attorney review
- Appointment requests, messages, callbacks, billing callbacks, and urgent transfer
- Emergency redirection to local emergency services
- Canonical call session, transcript turns, status, timeline events, and created review work
- Local fictional-call simulator for safe testing without a phone carrier

The assistant cannot give legal advice, accept an engagement, promise an outcome, disclose confidential case information based only on caller ID, or send/file/publish work. Appointment requests and intake remain unconfirmed until firm review.

## Live configuration

For a live number, configure a Twilio voice-capable number to send inbound calls to:

`https://YOUR_ATLAS_HOST/v1/voice/twilio/WORKSPACE_ID/incoming`

Set `TWILIO_AUTH_TOKEN` and `VOICE_PUBLIC_BASE_URL=https://YOUR_ATLAS_HOST` in the Atlas runtime. The public URL must use HTTPS because Atlas verifies each provider signature against the exact webhook URL. Configure the firm greeting and transfer destination inside the authenticated Phone Assistant workspace before directing calls to Atlas.

Outbound automated calling is intentionally not enabled. Any future outbound calling must add recipient-consent, identification, opt-out, quiet-hours, and jurisdiction-specific controls before a carrier adapter may initiate a call.

## Remaining external setup

- Purchase or port a phone number through a telephony carrier and configure its webhook.
- Confirm state-specific call-recording and transcription consent language with firm counsel before enabling recording.
- Provide a production EVM RPC endpoint, supported token contract, public firm wallet, accounting policy, sanctions controls, and tax workflow before accepting crypto.
- Conduct load, failover, audio-quality, accessibility, privacy, and incident-response testing before production launch.
