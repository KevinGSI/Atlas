# Live email and calendar setup

Atlas supports live Microsoft 365/Outlook and Google Workspace/Gmail connections through interchangeable server-side OAuth connectors. Firms authorize their own mailbox through the provider consent screen. Atlas never requests or stores the mailbox password.

## What becomes live

- Incremental inbox synchronization into canonical firm email records.
- Incremental primary-calendar synchronization into canonical calendar records.
- Supported email attachments are downloaded transiently, malware-scanned before durable storage, linked to the source email, and queued for document intelligence.
- Email and calendar events enter the same canonical event and intelligence pipeline as cases, tasks, documents, communications, and Attorney Inbox work.
- Provider access and refresh tokens are encrypted in the server-side credential vault and excluded from API responses and exports.
- Disconnect revokes provider authorization where supported and deletes Atlas's stored credential reference while retaining already-imported records and provenance.
- Email ingestion is read-only. Atlas can send a stored draft only after an authenticated attorney explicitly approves that action; it cannot delete or modify mailbox messages.
- An attorney-approved Atlas event can be written to the connected Google or Microsoft calendar. No event is added before approval, and attendees are not automatically invited.

## One callback for every provider

Register this exact redirect URI with each provider:

`https://YOUR-ATLAS-HOST/v1/cms/oauth/callback`

For the local demo, the matching callback is:

`http://127.0.0.1:3000/v1/cms/oauth/callback`

Provider redirect URIs must match exactly. Production must use the public HTTPS Atlas origin.

## Google Workspace / Gmail

1. Create a Google Cloud project controlled by Atlas.
2. Enable the Gmail API and Google Calendar API.
3. Configure the OAuth consent screen, authorized domains, privacy information, and test or production users.
4. Create an OAuth client of type **Web application**.
5. Register the exact Atlas callback URI.
6. Store the client ID and client secret only in the Atlas runtime as `GOOGLE_WORKSPACE_CLIENT_ID` and `GOOGLE_WORKSPACE_CLIENT_SECRET`.

Atlas requests offline access, Gmail read and approved-send access, and Calendar Events access. Restricted/sensitive Google scopes may require Google verification before broad public use. Never place the downloaded client secret file in GitHub or the browser application.

Official reference: [Google OAuth for web-server applications](https://developers.google.com/identity/protocols/oauth2/web-server)

## Microsoft 365 / Outlook

1. Register Atlas as a web application in Microsoft Entra ID.
2. Select the intended organizational account audience.
3. Register the exact Atlas callback URI under the web platform.
4. Add delegated Microsoft Graph permissions for `Mail.Read`, `Mail.Send`, and `Calendars.ReadWrite`; Atlas also requests `offline_access` for refresh. `Mail.Send` is used only for an attorney-approved stored draft.
5. Complete tenant consent as required by the organization's policies.
6. Store the application ID and client secret only in the Atlas runtime as `MICROSOFT_365_CLIENT_ID` and `MICROSOFT_365_CLIENT_SECRET`.
7. Set `MICROSOFT_365_TENANT` to `organizations`, the tenant ID, or a verified tenant domain.

After adding `Mail.Send`, disconnect any existing mailbox connection in Atlas and reconnect it so Microsoft issues a token containing the current consent. Verify that ingestion remains read-only and that an email cannot send until the attorney approves its stored draft.

Official references: [Microsoft authorization-code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) and [Microsoft application registration](https://learn.microsoft.com/en-us/graph/auth-register-app-v2)

## Atlas runtime settings

At least one complete provider pair is required for production readiness. Both may be enabled simultaneously.

```text
PUBLIC_BASE_URL=https://YOUR-ATLAS-HOST
CMS_SYNC_ENABLED=true
CMS_CREDENTIAL_ENCRYPTION_KEY=<separate 32-byte base64 key>

GOOGLE_WORKSPACE_CLIENT_ID=
GOOGLE_WORKSPACE_CLIENT_SECRET=

MICROSOFT_365_CLIENT_ID=
MICROSOFT_365_CLIENT_SECRET=
MICROSOFT_365_TENANT=organizations
```

After configuring the provider application and restarting Atlas, open **Email** or **Calendar**, choose the provider, finish consent in the provider window, return to Atlas, and select **Sync email & calendar**.

## Other providers

The UI discovers any registered connector that advertises both email and calendar capabilities. Adding another provider requires one connector implementation for that provider's supported OAuth, mail, calendar, refresh, revocation, and incremental-sync APIs; it does not require changing the canonical case, event, intelligence, or UI workflow.

Atlas does not accept mailbox passwords and does not claim universal compatibility with providers that offer no suitable OAuth mail/calendar API.
