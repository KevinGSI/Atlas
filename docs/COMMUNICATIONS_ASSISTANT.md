# Atlas Communications Assistant

Atlas treats phone calls and text messages as native firm events. Both channels enter the same isolated firm workspace, are cataloged as canonical objects, and can trigger reviewable work through the interchangeable intelligence layer.

## Case contact actions

Every case Communications tab provides a separate recipient selector for calling, texting, emailing, and proposing a meeting. The directory contains only canonical contacts connected to that case. Each result retains the precise contact identifier defined in `CONTACTS.md`, then maps it into the guarded client, opposing counsel, judicial assistant, expert witness, or other-contact communication group. Each person remains visible when a channel is unavailable, but Atlas disables that action instead of guessing a missing phone number or email address.

The browser submits only the selected canonical `contactId`. The server re-resolves that object inside the authenticated firm and case before using its stored contact details; browser-supplied addresses, numbers, client IDs, recipient lists, and role overrides are rejected. This protects firm and case isolation even if a request is modified outside the interface.

The case offers four actions:

1. **Call** creates a case-parented `phone_call` in `prepared` state for the selected contact and opens the user's device dialer. Atlas does not originate the call, claim it connected, or mark it complete.
2. **Text** creates a case-parented `sms_draft` for the selected contact. The text remains unsent until a firm user separately approves the exact current version through the configured messaging provider.
3. **Email** gives the interchangeable AI model a role-bounded snapshot of the authorized case context and creates a case-parented `email_draft`. The recipient is resolved by the server and the draft remains unsent for attorney review.
4. **Set up meeting** creates an unsent email draft to the selected contact offering two to five attorney-selected future times for a phone call or in-person appointment. It does not create a calendar event or confirm a meeting before the recipient selects a time.

Each preparation stores `contactId`, detailed `contactType`, and guarded `contactRole` on the canonical work and produces an immutable case communication event. Client communications may use the bounded client case context. Drafts to opposing counsel, judicial assistants, experts, and other contacts exclude internal tasks and intelligence observations; judicial-assistant drafting is restricted to neutral procedural administration and cannot be used for an ex parte merits communication. AI-created drafts retain provider/model provenance when the configured adapter supplies it.

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

Website consultation scheduling uses the canonical SMS path and intentionally bypasses the Atlas Attorney Inbox. A firm may explicitly enable consultation alerts and save the attorney mobile number in authenticated Communications settings. Atlas texts the attorney calendar-derived options without scheduling them; the attorney replies `1`, `2`, or `3` to the authenticated Atlas text. Atlas then texts that proposal—not an appointment—to the consented prospective client. A signed inbound client `YES` reply is stored as a canonical communication, rechecks availability under an attorney-scoped database transaction lock, publishes the event, and texts final call details directly to both sides. A client may instead text a better time; Atlas forwards it directly to the attorney with refreshed numbered options. If the client declines the final proposal, subsequent texts are relayed directly between the prospective client and attorney for scheduling. Every proposal, reply, state transition, provider delivery, conflict, and final event remains attached to the canonical consultation request without creating an Attorney Inbox card.

## Runtime configuration

Set these server-side values; never put them in browser code:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_MESSAGING_FROM`
- `PUBLIC_BASE_URL`

The same provider-neutral service can be connected to another messaging provider without changing the canonical communication model or user workflow.

## Production boundary

Local fictional simulation works without Twilio. Real carrier delivery requires a Twilio account, an SMS-capable number, a public HTTPS Atlas URL, applicable A2P sender registration, and documented recipient consent. Consultation alerts also require the firm to enable that setting and save the attorney mobile number. Delivery status callbacks, media download, shared-inbox assignment, and high-volume campaign tooling are not claimed in this release.
