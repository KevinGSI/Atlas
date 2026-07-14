import { AtlasError } from './errors.js';

export const CALENDAR_EVENT_TYPES = new Set(['court_date','scheduled_call','deposition','deadline','meeting','other']);

const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text=(value,max,name,{required=false}={})=>{const result=String(value??'').trim();if(required&&!result)throw new AtlasError('CALENDAR_EVENT_INVALID',`${name} is required`,400);if(result.length>max)throw new AtlasError('CALENDAR_EVENT_INVALID',`${name} is too long`,400);return result||null;};
const instant=(value,name)=>{const date=new Date(value);if(!value||Number.isNaN(date.getTime()))throw new AtlasError('CALENDAR_EVENT_INVALID',`${name} must be a valid date and time`,400);return date;};

export function normalizeCalendarEventProposal(input={},options={}){
  const title=text(input.title,240,'calendar title',{required:true});
  const eventType=String(input.eventType??'other').trim().toLowerCase();
  if(!CALENDAR_EVENT_TYPES.has(eventType))throw new AtlasError('CALENDAR_EVENT_INVALID','calendar eventType is unsupported',400,{eventType});
  const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(String(input.startsAt??''));
  const start=instant(input.startsAt,'startsAt');
  const isAllDay=input.isAllDay===undefined?dateOnly:Boolean(input.isAllDay);
  const fallbackDuration=isAllDay?86_400_000:60*60*1000;
  const end=input.endsAt?instant(input.endsAt,'endsAt'):new Date(start.getTime()+fallbackDuration);
  if(end<=start)throw new AtlasError('CALENDAR_EVENT_INVALID','endsAt must be after startsAt',400);
  if(end-start>31*86_400_000)throw new AtlasError('CALENDAR_EVENT_INVALID','calendar events cannot span more than 31 days',400);
  const attendees=input.attendees??[];
  if(!Array.isArray(attendees)||attendees.length>50||attendees.some(value=>typeof value!=='string'||!emailPattern.test(value.trim())))throw new AtlasError('CALENDAR_EVENT_INVALID','attendees must contain at most 50 valid email addresses',400);
  const matterId=input.matterId??null;const targetUserId=input.targetUserId??options.defaultTargetUserId??null;
  if((matterId!==null&&typeof matterId!=='string')||(targetUserId!==null&&typeof targetUserId!=='string'))throw new AtlasError('CALENDAR_EVENT_INVALID','calendar ownership references are invalid',400);
  return {
    title,eventType,matterId,targetUserId,startsAt:start.toISOString(),endsAt:end.toISOString(),isAllDay,
    timeZone:text(input.timeZone??'UTC',100,'timeZone')??'UTC',location:text(input.location,500,'location'),
    description:text(input.description,10_000,'description'),attendees:[...new Set(attendees.map(value=>value.trim().toLowerCase()))],
    sourceType:text(input.sourceType??options.sourceType??'atlas_intelligence',80,'sourceType')??'atlas_intelligence',
    reminderMinutesBeforeStart:Number.isInteger(input.reminderMinutesBeforeStart)&&input.reminderMinutesBeforeStart>=0&&input.reminderMinutesBeforeStart<=40_320?input.reminderMinutesBeforeStart:15
  };
}

export function calendarProposalKey(input={}){
  const normalized=normalizeCalendarEventProposal(input);
  return [normalized.matterId??'',normalized.targetUserId??'',normalized.eventType,normalized.startsAt,normalized.title.toLowerCase()].join('|');
}
