# Atlas Communications Assistant

Atlas treats phone calls and text messages as native firm events. Both channels enter the same isolated firm workspace, are cataloged as canonical objects, and can trigger reviewable work through the interchangeable intelligence layer.

## Incoming texts

Twilio sends an HTTPS form-encoded webhook to:

`POST /v1/messaging/twilio/:workspaceId/incoming`

Atlas verifies the Twilio signature before accepting the message. A valid message is stored as a canonical `sms_message`, classified, connected to a known client when the phone number matches, and recorded in the immutable event stream. Duplicate provider message IDs are idempotent.

For ordinary messages Atlas may return only the firm's pre-approved receipt acknowledgment. That acknowledgment does not provide legal advice, accept an engagement, promise an outcome, or disclose case information. Atlas also creates a review task and an editable `sms_draft`; it does not send the substantive draft.

STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, and QUIT are treated as opt-outs. Atlas records the request, produces no acknowledgment or follow-up draft, and blocks later outbound sends to the number.

## Outgoing texts

An authenticated firm user can create and edit a draft. Sending requires all of the following:

1. A configured provider and sender number.
2. A pending, unsent canonical draft.
3. The current object version, preventing stale approval.
4. Explicit `confirm: true` approval by the signed-in firm user.
5. No retained opt-out for the recipient.

Successful sends create an outgoing canonical `sms_message` and an immutable `sms.sent` event recording the provider message ID and approving user.

## Runtime configuration

Set these server-side values; never put them in browser code:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_MESSAGING_FROM`
- `PUBLIC_BASE_URL`

The same provider-neutral service can be connected to another messaging provider without changing the canonical communication model or user workflow.

## Production boundary

Local fictional simulation works without Twilio. Real carrier delivery requires a Twilio account, an SMS-capable number, a public HTTPS Atlas URL, applicable sender registration, and documented recipient consent. Delivery status callbacks, media download, shared-inbox assignment, and high-volume campaign tooling are not claimed in this release.
