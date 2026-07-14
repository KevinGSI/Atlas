import { AtlasError } from './errors.js';
import { OAuthCmsConnector } from './cms-provider-adapters.js';
import { createHash } from 'node:crypto';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events'
];
const MICROSOFT_SCOPES = ['offline_access', 'Mail.Read', 'Calendars.ReadWrite'];
const DOWNLOADABLE_MEDIA_TYPES=new Set(['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/csv','image/jpeg','image/png']);

function expiresAt(value, now = Date.now()) {
  const seconds = Number(value?.expires_in);
  return Number.isFinite(seconds) && seconds > 0 ? now + seconds * 1000 : null;
}
function parseAddresses(value) {
  return String(value ?? '').split(',').map((entry) => {
    const match = entry.match(/<([^>]+)>/);
    return (match?.[1] ?? entry).trim().toLowerCase();
  }).filter((entry) => entry.includes('@'));
}

function stripHtml(value) {
  return String(value ?? '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function microsoftGraphUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'graph.microsoft.com' || url.port || url.username || url.password || url.hash || !url.pathname.startsWith('/v1.0/')) throw new Error('untrusted');
    return url;
  } catch {
    throw new AtlasError('MAIL_SYNC_PROVIDER_ERROR', 'Microsoft Graph returned an invalid continuation URL', 502, { provider: 'microsoft' });
  }
}

function microsoftDate(value, timeZone) {
  if (!value) return null;
  const candidate = timeZone === 'UTC' && !/[zZ]|[+-]\d\d:\d\d$/.test(value) ? `${value}Z` : value;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function graphTransactionId(value){const hex=createHash('sha256').update(String(value)).digest('hex').slice(0,32);return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
function graphDateTime(value){return new Date(value).toISOString().replace(/Z$/,'');}
function googleEventId(value){return createHash('sha256').update(String(value)).digest('hex').slice(0,32);}

function decodeBase64Url(value) {
  if (!value) return '';
  try { return Buffer.from(value, 'base64url').toString('utf8'); }
  catch { return ''; }
}

function googleHeaders(payload) {
  return new Map((payload?.headers ?? []).map((item) => [String(item.name).toLowerCase(), item.value]));
}

function googleBody(part) {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64Url(part.body.data);
  const plain = (part.parts ?? []).map(googleBody).find(Boolean);
  if (plain) return plain;
  if (part.mimeType === 'text/html' && part.body?.data) return stripHtml(decodeBase64Url(part.body.data));
  return '';
}

function googleAttachments(part, results = []) {
  if (!part) return results;
  if (part.filename) results.push({ filename: part.filename, mediaType: part.mimeType ?? 'application/octet-stream', providerAttachmentId: part.body?.attachmentId ?? null, size: Number(part.body?.size ?? 0), ...(part.body?.data?{contentBase64:Buffer.from(part.body.data,'base64url').toString('base64')}:{}) });
  for (const child of part.parts ?? []) googleAttachments(child, results);
  return results;
}

function googleEmail(message) {
  const headers = googleHeaders(message.payload);
  const receivedAt = headers.get('date') ? new Date(headers.get('date')).toISOString() : new Date(Number(message.internalDate ?? Date.now())).toISOString();
  const attachments = googleAttachments(message.payload);
  const from = parseAddresses(headers.get('from'))[0] ?? 'unknown@invalid.local';
  return {
    type: 'email', id: String(message.id), updatedAt: receivedAt, checksum: String(message.historyId ?? message.id),
    data: {
      title: headers.get('subject') || '(no subject)', subject: headers.get('subject') || '(no subject)', from,
      to: parseAddresses(headers.get('to')), cc: parseAddresses(headers.get('cc')), bodyText: googleBody(message.payload) || message.snippet || '',
      receivedAt, threadId: message.threadId ?? null, internetMessageId: headers.get('message-id') ?? null,
      hasAttachments: attachments.length > 0, attachments
    }
  };
}

function googleCalendar(event) {
  const start = event.start?.dateTime ?? event.start?.date ?? null;
  const end = event.end?.dateTime ?? event.end?.date ?? null;
  return {
    type: 'calendar', id: String(event.id), updatedAt: event.updated ?? start, checksum: event.etag ?? null,
    deleted: event.status === 'cancelled', deletedAt: event.status === 'cancelled' ? event.updated ?? new Date().toISOString() : null,
    data: { title: event.summary || '(untitled calendar event)', start, startsAt:start, end, endsAt:end, location: event.location ?? null, description: event.description ?? null, attendees: (event.attendees ?? []).map((item) => item.email).filter(Boolean), organizer:event.organizer?.email??null, status: event.status ?? 'confirmed', webLink: event.htmlLink ?? null }
  };
}

function microsoftEmail(message, now = new Date().toISOString()) {
  if (message['@removed']) return { type: 'email', id: String(message.id), updatedAt: now, checksum: `removed:${message['@removed'].reason ?? 'deleted'}`, deleted: true, deletedAt: now, data: {} };
  const from = message.from?.emailAddress?.address?.toLowerCase() ?? 'unknown@invalid.local';
  const recipients = (items) => (items ?? []).map((item) => item.emailAddress?.address?.toLowerCase()).filter(Boolean);
  const receivedAt = message.receivedDateTime ?? new Date().toISOString();
  const bodyText = message.body?.contentType?.toLowerCase() === 'text' ? message.body.content : stripHtml(message.body?.content ?? message.bodyPreview);
  return {
    type: 'email', id: String(message.id), updatedAt: message.lastModifiedDateTime ?? receivedAt, checksum: message.changeKey ?? message.id,
    data: { title: message.subject || '(no subject)', subject: message.subject || '(no subject)', from, to: recipients(message.toRecipients), cc: recipients(message.ccRecipients), bodyText: bodyText || message.bodyPreview || '', receivedAt, threadId: message.conversationId ?? null, internetMessageId: message.internetMessageId ?? null, hasAttachments: Boolean(message.hasAttachments), attachments: [] }
  };
}

function microsoftCalendar(event, now = new Date().toISOString()) {
  const removed = Boolean(event['@removed']);
  const cancelled = removed || Boolean(event.isCancelled);
  const start = microsoftDate(event.start?.dateTime, event.start?.timeZone);
  const end = microsoftDate(event.end?.dateTime, event.end?.timeZone);
  return {
    type: 'calendar', id: String(event.id), updatedAt: event.lastModifiedDateTime ?? start ?? now, checksum: event.changeKey ?? (removed ? `removed:${event['@removed'].reason ?? 'deleted'}` : event.id),
    deleted: cancelled, deletedAt: cancelled ? event.lastModifiedDateTime ?? now : null,
    data: removed ? {} : { title: event.subject || '(untitled calendar event)', start, startsAt: start, end, endsAt: end, timeZone: event.start?.timeZone ?? null, location: event.location?.displayName ?? null, description: stripHtml(event.body?.content ?? event.bodyPreview), attendees: (event.attendees ?? []).map((item) => item.emailAddress?.address?.toLowerCase()).filter(Boolean), organizer: event.organizer?.emailAddress?.address?.toLowerCase() ?? null, status: event.showAs ?? null, responseStatus: event.responseStatus?.response ?? null, isAllDay: Boolean(event.isAllDay), isOnlineMeeting: Boolean(event.isOnlineMeeting), onlineMeetingUrl: event.onlineMeeting?.joinUrl ?? event.onlineMeetingUrl ?? null, webLink: event.webLink ?? null }
  };
}

class MailOAuthConnector extends OAuthCmsConnector {
  constructor(options) { super(options); this.clock = options.clock ?? (() => Date.now());this.maxAttachmentBytes=options.maxAttachmentBytes??25_000_000; }
  capabilities() { return { oauth2: true, pkce: true, incrementalSync: true, readOnly: true, resources: ['email', 'calendar'], nativeIntelligence: true }; }
  async exchangeCode(input) {
    const credentials = await super.exchangeCode(input);
    return { ...credentials, expires_at: expiresAt(credentials, this.clock()) };
  }
  async currentCredentials(credentials, force = false) {
    if (!force && credentials.access_token && (!credentials.expires_at || Number(credentials.expires_at) > this.clock() + 60_000)) return credentials;
    if (!credentials.refresh_token) return credentials;
    const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: this.clientId, refresh_token: credentials.refresh_token });
    if (this.clientSecret) body.set('client_secret', this.clientSecret);
    if (this.scopes.length) body.set('scope', this.scopes.join(' '));
    const response = await this.transport(this.tokenEndpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!response.ok) throw new AtlasError('MAIL_AUTHORIZATION_REFRESH_FAILED', 'Mailbox authorization could not be refreshed', 502, { provider: this.name, status: response.status });
    const refreshed = await response.json();
    return { ...credentials, ...refreshed, refresh_token: refreshed.refresh_token ?? credentials.refresh_token, expires_at: expiresAt(refreshed, this.clock()) };
  }
  async providerRequest(url, credentials, request = {}) {
    let current = await this.currentCredentials(credentials);
    const options={method:request.method??'GET',headers:{authorization:`Bearer ${current.access_token}`,...(request.headers??{})},...(request.body===undefined?{}:{body:request.body})};
    let response = await this.transport(url, options);
    if (response.status === 401 && current.refresh_token) {
      current = await this.currentCredentials(current, true);
      options.headers.authorization=`Bearer ${current.access_token}`;response = await this.transport(url, options);
    }
    if (!response.ok) throw new AtlasError('MAIL_SYNC_PROVIDER_ERROR', 'Mailbox provider synchronization failed', 502, { provider: this.name, status: response.status });
    return { body: await response.json(), credentials: current };
  }
  async providerJson(url,credentials,additionalHeaders={}){return this.providerRequest(url,credentials,{headers:additionalHeaders});}
  initialSince() { return new Date(this.clock() - 30 * 86_400_000).toISOString(); }
}

export class GoogleWorkspaceConnector extends MailOAuthConnector {
  constructor(options) {
    super({ ...options, name: 'google', authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth', tokenEndpoint: 'https://oauth2.googleapis.com/token', revokeEndpoint: 'https://oauth2.googleapis.com/revoke', apiBase: 'https://gmail.googleapis.com', scopes: GOOGLE_SCOPES, resources: [] });
  }
  beginAuthorization(input) {
    const url = new URL(super.beginAuthorization(input));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
    return url.toString();
  }
  capabilities(){return {...super.capabilities(),calendarWriteAfterApproval:true,mailReadOnly:true};}
  async createCalendarEvent({credentials,calendarEvent}){
    const state=calendarEvent?.state??{};if(calendarEvent?.type!=='calendar_event'||!state.startsAt||!state.endsAt)throw new AtlasError('CALENDAR_EVENT_INVALID','A canonical approved calendar event is required',400);
    const id=googleEventId(calendarEvent.id);const url=`https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none`;
    const payload={id,summary:calendarEvent.title,description:state.description??'Created by Atlas after attorney approval.',start:{dateTime:new Date(state.startsAt).toISOString(),timeZone:'UTC'},end:{dateTime:new Date(state.endsAt).toISOString(),timeZone:'UTC'},location:state.location??'',visibility:'private',reminders:{useDefault:false,overrides:[{method:'popup',minutes:state.reminderMinutesBeforeStart??15}]},extendedProperties:{private:{atlasEventId:calendarEvent.id}}};
    let result;try{result=await this.providerRequest(url,credentials,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});}catch(error){if(error?.details?.status!==409)throw error;result=await this.providerJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,credentials);}
    if(!result.body?.id)throw new AtlasError('MAIL_SYNC_PROVIDER_ERROR','Google Calendar did not return the created event',502,{provider:'google'});
    return {record:googleCalendar(result.body),credentials:result.credentials};
  }
  async pull({ credentials, cursor }) {
    const position = cursor ?? { resource: 'email', pageToken: null, since: this.initialSince(), syncStartedAt: new Date(this.clock()).toISOString() };
    if (position.resource === 'email') {
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
      url.searchParams.set('maxResults', '50');
      url.searchParams.set('q', `after:${Math.floor(new Date(position.since).getTime() / 1000)}`);
      if (position.pageToken) url.searchParams.set('pageToken', position.pageToken);
      const listed = await this.providerJson(url, credentials);
      const records = [];
      let current = listed.credentials;
      for (const item of listed.body.messages ?? []) {
        const detail = await this.providerJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`, current);
        current = detail.credentials;
        const record=googleEmail(detail.body);
        for(const attachment of record.data.attachments){if(attachment.contentBase64||!attachment.providerAttachmentId)continue;if(attachment.size>this.maxAttachmentBytes||!DOWNLOADABLE_MEDIA_TYPES.has(attachment.mediaType)){attachment.skippedReason=attachment.size>this.maxAttachmentBytes?'too_large':'unsafe_type';continue;}const downloaded=await this.providerJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}/attachments/${encodeURIComponent(attachment.providerAttachmentId)}`,current);current=downloaded.credentials;attachment.contentBase64=Buffer.from(String(downloaded.body.data??''),'base64url').toString('base64');attachment.size=Number(downloaded.body.size??attachment.size);}
        records.push(record);
      }
      const nextCursor = listed.body.nextPageToken
        ? { ...position, pageToken: listed.body.nextPageToken }
        : { ...position, resource: 'calendar', pageToken: null };
      return { records, nextCursor, hasMore: true, credentials: current };
    }
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('maxResults', '250'); url.searchParams.set('singleEvents', 'true'); url.searchParams.set('orderBy', 'startTime'); url.searchParams.set('timeMin', position.since);
    if (position.pageToken) url.searchParams.set('pageToken', position.pageToken);
    const listed = await this.providerJson(url, credentials);
    const more = listed.body.nextPageToken;
    return {
      records: (listed.body.items ?? []).map(googleCalendar),
      nextCursor: more ? { ...position, pageToken: more } : { resource: 'email', pageToken: null, since: position.syncStartedAt, syncStartedAt: new Date(this.clock()).toISOString() },
      hasMore: Boolean(more), credentials: listed.credentials
    };
  }
}

export class Microsoft365Connector extends MailOAuthConnector {
  constructor(options) {
    const tenant = options.tenant ?? 'organizations';
    super({ ...options, name: 'microsoft', authorizeEndpoint: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`, tokenEndpoint: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, apiBase: 'https://graph.microsoft.com/v1.0', scopes: MICROSOFT_SCOPES, resources: [] });
  }
  capabilities(){return {...super.capabilities(),calendarWriteAfterApproval:true,mailReadOnly:true};}
  async createCalendarEvent({credentials,calendarEvent}){
    const state=calendarEvent?.state??{};if(calendarEvent?.type!=='calendar_event'||!state.startsAt||!state.endsAt)throw new AtlasError('CALENDAR_EVENT_INVALID','A canonical approved calendar event is required',400);
    const payload={subject:calendarEvent.title,body:{contentType:'Text',content:state.description??'Created by Atlas after attorney approval.'},start:{dateTime:graphDateTime(state.startsAt),timeZone:'UTC'},end:{dateTime:graphDateTime(state.endsAt),timeZone:'UTC'},location:{displayName:state.location??''},isAllDay:Boolean(state.isAllDay),isReminderOn:true,reminderMinutesBeforeStart:state.reminderMinutesBeforeStart??15,showAs:'busy',transactionId:graphTransactionId(calendarEvent.id),categories:['Atlas']};
    const result=await this.providerRequest('https://graph.microsoft.com/v1.0/me/events',credentials,{method:'POST',headers:{'content-type':'application/json',Prefer:'outlook.timezone="UTC"'},body:JSON.stringify(payload)});
    if(!result.body?.id)throw new AtlasError('MAIL_SYNC_PROVIDER_ERROR','Microsoft Graph did not return the created calendar event',502,{provider:'microsoft'});
    return {record:microsoftCalendar(result.body,new Date(this.clock()).toISOString()),credentials:result.credentials};
  }
  async pull({ credentials, cursor }) {
    const position = cursor ?? { resource: 'email', nextUrl: null, since: this.initialSince(), syncStartedAt: new Date(this.clock()).toISOString() };
    if (position.resource === 'email') {
      const initial = new URL('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta');
      initial.searchParams.set('$top', '50');
      initial.searchParams.set('$select', 'id,subject,receivedDateTime,lastModifiedDateTime,from,toRecipients,ccRecipients,bodyPreview,body,hasAttachments,internetMessageId,conversationId,changeKey');
      initial.searchParams.set('$filter', `receivedDateTime ge ${position.since}`);
      initial.searchParams.set('$orderby', 'receivedDateTime desc');
      const continuation = position.nextUrl ?? position.emailDeltaUrl;
      const url = continuation ? microsoftGraphUrl(continuation) : initial;
      let listed;
      try { listed = await this.providerJson(url, credentials, { Prefer: 'odata.maxpagesize=50' }); }
      catch (error) {
        if (!continuation || error?.details?.status !== 410) throw error;
        listed = await this.providerJson(initial, credentials, { Prefer: 'odata.maxpagesize=50' });
      }
      const next = listed.body['@odata.nextLink'] ?? null;
      const delta = listed.body['@odata.deltaLink'] ?? position.emailDeltaUrl ?? null;
      const now = new Date(this.clock()).toISOString();
      const records=[];let current=listed.credentials;for(const message of listed.body.value??[]){const record=microsoftEmail(message,now);if(!record.deleted&&message.hasAttachments){const metadata=await this.providerJson(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(message.id)}/attachments?$select=id,name,contentType,size,isInline`,current);current=metadata.credentials;const attachments=[];for(const item of metadata.body.value??[]){if(item['@odata.type']!=='#microsoft.graph.fileAttachment'||item.isInline)continue;const attachment={filename:item.name,mediaType:item.contentType??'application/octet-stream',providerAttachmentId:item.id,size:Number(item.size??0)};if(attachment.size>this.maxAttachmentBytes||!DOWNLOADABLE_MEDIA_TYPES.has(attachment.mediaType)){attachment.skippedReason=attachment.size>this.maxAttachmentBytes?'too_large':'unsafe_type';attachments.push(attachment);continue;}const downloaded=await this.providerJson(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(item.id)}?$select=id,name,contentType,size,contentBytes`,current);current=downloaded.credentials;attachment.contentBase64=downloaded.body.contentBytes;attachment.size=Number(downloaded.body.size??attachment.size);attachments.push(attachment);}record.data.attachments=attachments;record.data.hasAttachments=attachments.length>0;}records.push(record);}
      return { records, nextCursor: next ? { ...position, resource: 'email', nextUrl: next } : { ...position, resource: 'calendar', nextUrl: null, emailDeltaUrl: delta }, hasMore: true, credentials: current };
    }
    const refreshWindow = !position.calendarEnd || new Date(position.calendarEnd).getTime() < this.clock() + 60 * 86_400_000;
    const calendarStart = refreshWindow ? this.initialSince() : position.calendarStart;
    const calendarEnd = refreshWindow ? new Date(this.clock() + 365 * 86_400_000).toISOString() : position.calendarEnd;
    const initial = new URL('https://graph.microsoft.com/v1.0/me/calendarView/delta');
    initial.searchParams.set('startDateTime', calendarStart); initial.searchParams.set('endDateTime', calendarEnd);
    const continuation = position.nextUrl ?? (refreshWindow ? null : position.calendarDeltaUrl);
    const url = continuation ? microsoftGraphUrl(continuation) : initial;
    let listed;
    try { listed = await this.providerJson(url, credentials, { Prefer: 'outlook.timezone="UTC", odata.maxpagesize=250' }); }
    catch (error) {
      if (!continuation || error?.details?.status !== 410) throw error;
      listed = await this.providerJson(initial, credentials, { Prefer: 'outlook.timezone="UTC", odata.maxpagesize=250' });
    }
    const next = listed.body['@odata.nextLink'] ?? null;
    const delta = listed.body['@odata.deltaLink'] ?? position.calendarDeltaUrl ?? null;
    const now = new Date(this.clock()).toISOString();
    return { records: (listed.body.value ?? []).map(event=>microsoftCalendar(event,now)), nextCursor: next ? { ...position, resource: 'calendar', nextUrl: next, calendarStart, calendarEnd } : { resource: 'email', nextUrl: null, emailDeltaUrl: position.emailDeltaUrl??null, calendarDeltaUrl: delta, calendarStart, calendarEnd, since: position.syncStartedAt, syncStartedAt: now }, hasMore: Boolean(next), credentials: listed.credentials };
  }
}
