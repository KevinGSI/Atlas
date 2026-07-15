# Microsoft 365 email and calendar setup

Atlas uses one Microsoft OAuth connection for a read-only Outlook inbox, primary-calendar synchronization, and attorney-approved calendar additions. The lawyer signs in on Microsoft's site; Atlas never receives the Microsoft 365 password. Imported messages and events become firm-isolated canonical Atlas objects and enter the same native-intelligence event pipeline as other firm activity. Atlas may propose a calendar event after analyzing an email, attachment, call, case deadline, or other case activity, but it cannot create the Atlas or Outlook event until an attorney approves the proposal in **While You Were Gone**.

## 1. Register Atlas in Microsoft Entra

1. In the Microsoft Entra admin center, open **App registrations** and create a registration for Atlas.
2. Choose the supported account type that matches the deployment:
   - use the firm's specific tenant for a single-tenant installation; or
   - use organizational-directory accounts for a multi-firm Atlas deployment.
3. Add a **Web** redirect URI using the exact deployed Atlas origin:

   ```text
   https://YOUR-ATLAS-HOST/v1/cms/oauth/callback
   ```

   The scheme, hostname, port, path, and capitalization must match the address from which the Atlas web application is opened. Atlas derives this callback on the server from `PUBLIC_BASE_URL`; it does not trust a callback supplied by the browser.
4. Under **API permissions**, add these delegated Microsoft Graph permissions:

   ```text
   Mail.Read
   Calendars.ReadWrite
   offline_access
   ```

   Atlas Phase 1 and the ingestion acceptance test do not request `Mail.Send`. Email remains read-only, and the Microsoft connector exposes no email-send operation. `Calendars.ReadWrite` is used only to synchronize the calendar and add an Atlas event after an attorney's explicit approval. Atlas does not put attendees in the Microsoft Graph create request, so approval does not automatically send invitations.

   If this Entra application previously included `Mail.Send`, remove that delegated permission before the acceptance test. Then disconnect the existing Microsoft mailbox in Atlas and reconnect it so Microsoft issues consent and tokens for only the current least-privilege scopes.
5. Create a client secret. Copy the secret value once and store it in the deployment's secret manager. Do not commit it to Git.

## 2. Configure the Atlas runtime

Set these deployment secrets and runtime values:

```text
MICROSOFT_365_CLIENT_ID=<Entra application client ID>
MICROSOFT_365_CLIENT_SECRET=<Entra client secret value>
MICROSOFT_365_TENANT=organizations
CMS_CREDENTIAL_ENCRYPTION_KEY=<separate base64-encoded 32-byte key>
CMS_SYNC_ENABLED=true
PUBLIC_BASE_URL=https://YOUR-ATLAS-HOST
```

For a single-tenant deployment, replace `organizations` with the Microsoft tenant GUID or verified tenant domain. Atlas intentionally rejects `common` and `consumers` because this product connection is for organizational law-firm accounts. `PUBLIC_BASE_URL` must contain only the public HTTPS origin, with no path, query string, or fragment. Atlas always turns it into the exact callback `https://YOUR-ATLAS-HOST/v1/cms/oauth/callback`. `CMS_CREDENTIAL_ENCRYPTION_KEY` protects refresh and access credentials at rest and must be different from the AI-content encryption key.

Restart the API and synchronization worker after changing deployment secrets. In a multi-instance deployment, Atlas uses a distributed scheduler lease so only one active instance synchronizes a connection during each cycle.

## 3. Connect and verify a mailbox

1. Sign in to Atlas and open **Email** or **Calendar**.
2. Choose **Connect Microsoft 365**.
3. Complete Microsoft's consent screen in the secure Microsoft window.
   - If consent is canceled or denied, Atlas consumes the one-time OAuth state, deletes the temporary PKCE secret, stores no connection, and shows a safe failure page.
4. Return to Atlas and choose **Sync email & calendar**.
5. Confirm that the connection card reports email and calendar counts, then open **Calendar** and confirm an Outlook event appears with the correct time, location, and attendees.
6. Cause Atlas to detect a source-supported court date, scheduled call, deposition, deadline, or meeting. Confirm that it appears in **While You Were Gone**, approve it, and verify that one event appears in Atlas and in the approving user's Microsoft calendar.

An existing Microsoft connection created before this permission change must be disconnected and connected again so Microsoft can obtain consent for `Calendars.ReadWrite`.

The first synchronization reads the most recent 30 days of inbox messages and a calendar window extending through the next year. Atlas then retains Microsoft Graph delta links, so subsequent cycles retrieve changes and deletions instead of rescanning the entire mailbox and calendar. If Microsoft expires a delta token, Atlas safely rebuilds that resource's synchronization window.

## Operational boundary

- Email ingestion and provider synchronization remain read-only. The only Phase 1 Microsoft write is creation of an attorney-approved calendar event.
- The approving or assigned user's own Microsoft connection is used. If that user has not connected Microsoft 365, the canonical Atlas event remains marked pending and the next successful Microsoft synchronization retries it.
- Atlas uses a stable Microsoft Graph transaction ID to reduce duplicate event creation during safe retries.
- Attendee addresses may be retained in the Atlas proposal for review, but Atlas does not send invitations or include attendees in the automatic Microsoft write.
- OAuth credentials are stored only through the encrypted connector vault.
- The OAuth callback is fixed by the server, protected by one-time state and PKCE, and cannot be replaced by a browser-supplied origin in production.
- Microsoft continuation links are accepted only from the HTTPS Microsoft Graph v1 endpoint, with no embedded credentials, alternate port, or fragment.
- Source deletions are preserved as reconciliation state in Atlas rather than silently erasing firm history.
- Imported calendar events create `calendar.synchronized` events and `calendar.received` intelligence work so the digital twin can evaluate them with the rest of the firm's current situation.
- A production acceptance test must still authorize a real test mailbox in the target Microsoft tenant and confirm the deployed redirect URI, tenant policy, consent, and network access.

## Required live acceptance evidence

Do not open Atlas to customer traffic until all of these pass against the deployed staging system and a real organizational Microsoft 365 test account:

1. Connect Microsoft 365 and confirm the callback returns to the deployed Atlas hostname.
2. Sync a recent inbox message and a real calendar event into the correct isolated firm.
3. Confirm a PDF attachment is stored, scanned, cataloged, and queued for Atlas review without exposing OAuth credentials.
4. Change and delete a test message or event, run synchronization again, and confirm the delta update is reflected without erasing Atlas history.
5. Let Atlas propose a calendar event, approve it as the connected attorney, and confirm exactly one event appears in that attorney's Outlook calendar.
6. Deny a fresh consent attempt and confirm no connection is created.
7. Allow the access token to refresh (or use an expiring test token) and confirm background synchronization continues with the rotated encrypted refresh credential.

These are live vendor checks. Automated repository tests verify Atlas behavior and safety boundaries, but cannot prove the Entra registration, tenant consent policy, deployed network, or a real mailbox without access to that external tenant.

Microsoft references: [authorization code flow with PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [message delta synchronization](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0), [calendar-view delta synchronization](https://learn.microsoft.com/en-us/graph/delta-query-events), and [create an event](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0).
