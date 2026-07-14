# Microsoft 365 email and calendar setup

Atlas uses one Microsoft OAuth connection for read-only Outlook inbox and primary-calendar synchronization. The lawyer signs in on Microsoft's site; Atlas never receives the Microsoft 365 password. Imported messages and events become firm-isolated canonical Atlas objects and enter the same native-intelligence event pipeline as other firm activity.

## 1. Register Atlas in Microsoft Entra

1. In the Microsoft Entra admin center, open **App registrations** and create a registration for Atlas.
2. Choose the supported account type that matches the deployment:
   - use the firm's specific tenant for a single-tenant installation; or
   - use organizational-directory accounts for a multi-firm Atlas deployment.
3. Add a **Web** redirect URI using the exact deployed Atlas origin:

   ```text
   https://YOUR-ATLAS-HOST/v1/cms/oauth/callback
   ```

   The scheme, hostname, port, path, and capitalization must match the address from which the Atlas web application is opened.
4. Under **API permissions**, add these delegated Microsoft Graph permissions:

   ```text
   Mail.Read
   Calendars.Read
   offline_access
   ```

   Atlas Phase 1 does not request `Mail.Send` or `Calendars.ReadWrite`. It cannot send Microsoft email or change the Outlook calendar.
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

For a single-tenant deployment, replace `organizations` with the Microsoft tenant ID. `CMS_CREDENTIAL_ENCRYPTION_KEY` protects refresh and access credentials at rest and must be different from the AI-content encryption key.

Restart the API and synchronization worker after changing deployment secrets. In a multi-instance deployment, Atlas uses a distributed scheduler lease so only one active instance synchronizes a connection during each cycle.

## 3. Connect and verify a mailbox

1. Sign in to Atlas and open **Email** or **Calendar**.
2. Choose **Connect Microsoft 365**.
3. Complete Microsoft's consent screen in the secure Microsoft window.
4. Return to Atlas and choose **Sync email & calendar**.
5. Confirm that the connection card reports email and calendar counts, then open **Calendar** and confirm an Outlook event appears with the correct time, location, and attendees.

The first synchronization reads the most recent 30 days of inbox messages and a calendar window extending through the next year. Atlas then retains Microsoft Graph delta links, so subsequent cycles retrieve changes and deletions instead of rescanning the entire mailbox and calendar. If Microsoft expires a delta token, Atlas safely rebuilds that resource's synchronization window.

## Operational boundary

- The connection is read-only and can be disconnected from Atlas without deleting already imported canonical records.
- OAuth credentials are stored only through the encrypted connector vault.
- Microsoft continuation links are accepted only from the HTTPS Microsoft Graph v1 endpoint.
- Source deletions are preserved as reconciliation state in Atlas rather than silently erasing firm history.
- Imported calendar events create `calendar.synchronized` events and `calendar.received` intelligence work so the digital twin can evaluate them with the rest of the firm's current situation.
- A production acceptance test must still authorize a real test mailbox in the target Microsoft tenant and confirm the deployed redirect URI, tenant policy, consent, and network access.

