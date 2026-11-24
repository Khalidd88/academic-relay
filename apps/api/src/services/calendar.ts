import nodeIcal from 'node-ical';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import duration from 'dayjs/plugin/duration.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import { sanitizeEventText } from '../utils/security.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(duration);
dayjs.extend(relativeTime);

export const APP_TIMEZONE = 'Asia/Jakarta';

export interface CalendarTask {
  uid: string;
  title: string;
  description: string;
  deadline: Date;
  deadlineFormatted: string;
  isPast: boolean;
  hoursUntilDeadline: number;
  timeRemainingText: string;
}

/**
 * Formats a Date object into readable Indonesian time string in Asia/Jakarta timezone.
 * Example: "Senin, 24 Nov 2026 23:59 WIB"
 */
export function formatJakartaDate(date: Date): string {
  const d = dayjs(date).tz(APP_TIMEZONE);
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  const dayName = dayNames[d.day()];
  const dayNum = d.date();
  const monthName = monthNames[d.month()];
  const year = d.year();
  const time = d.format('HH:mm');

  return `${dayName}, ${dayNum} ${monthName} ${year} ${time} WIB`;
}

/**
 * Human friendly countdown calculation.
 */
export function formatCountdown(deadline: Date): { hours: number; text: string } {
  const now = dayjs().tz(APP_TIMEZONE);
  const due = dayjs(deadline).tz(APP_TIMEZONE);
  const diffMinutes = due.diff(now, 'minute');

  if (diffMinutes <= 0) {
    return { hours: 0, text: 'Sudah lewat' };
  }

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  const days = Math.floor(hours / 24);

  if (days >= 1) {
    const remHours = hours % 24;
    return {
      hours,
      text: `${days} hari ${remHours > 0 ? `${remHours} jam lagi` : 'lagi'}`,
    };
  }

  if (hours > 0) {
    return {
      hours,
      text: `${hours} jam ${minutes > 0 ? `${minutes} menit lagi` : 'lagi'}`,
    };
  }

  return {
    hours: 0,
    text: `${minutes} menit lagi`,
  };
}

/**
 * Parses raw ICS content into sanitized CalendarTask objects in Asia/Jakarta timezone.
 * Ignores events whose summary ends with " opens" (case-insensitive) to only track closing/due deadlines.
 */
export function parseCalendarTasks(icsContent: string): CalendarTask[] {
  const parsedData = nodeIcal.sync.parseICS(icsContent);
  const tasks: CalendarTask[] = [];
  const now = dayjs().tz(APP_TIMEZONE);

  for (const key of Object.keys(parsedData)) {
    const item = parsedData[key];
    if (!item || item.type !== 'VEVENT') continue;

    const rawSummary = String(item.summary || '').trim();

    // Ignore events that represent opening schedules instead of submission deadlines
    if (/ opens$/i.test(rawSummary)) {
      continue;
    }

    // Determine deadline timestamp:
    // Moodle assignment deadlines typically use 'end' or 'start'
    const rawDeadline = item.end instanceof Date ? item.end : item.start instanceof Date ? item.start : null;
    if (!rawDeadline || isNaN(rawDeadline.getTime())) continue;

    const deadlineJkt = dayjs(rawDeadline).tz(APP_TIMEZONE).toDate();
    const uid = String(item.uid || key).trim();
    const title = sanitizeEventText(rawSummary || 'Tugas Tanpa Judul');
    const description = sanitizeEventText(item.description || '');

    const isPast = dayjs(deadlineJkt).isBefore(now);
    const countdown = formatCountdown(deadlineJkt);

    tasks.push({
      uid,
      title,
      description,
      deadline: deadlineJkt,
      deadlineFormatted: formatJakartaDate(deadlineJkt),
      isPast,
      hoursUntilDeadline: countdown.hours,
      timeRemainingText: countdown.text,
    });
  }

  // Sort tasks by deadline ascending (nearest deadline first)
  return tasks.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}

/**
 * Returns upcoming active tasks (deadline in the future).
 */
export function filterUpcomingTasks(tasks: CalendarTask[], limit?: number): CalendarTask[] {
  const now = dayjs().tz(APP_TIMEZONE);
  const upcoming = tasks.filter((t) => dayjs(t.deadline).isAfter(now));
  return typeof limit === 'number' ? upcoming.slice(0, limit) : upcoming;
}

/**
 * Returns tasks due within this week (next 7 days).
 */
export function filterTasksThisWeek(tasks: CalendarTask[], limit?: number): CalendarTask[] {
  const now = dayjs().tz(APP_TIMEZONE);
  const sevenDaysLater = now.add(7, 'day');

  const thisWeek = tasks.filter((t) => {
    const due = dayjs(t.deadline);
    return due.isAfter(now) && due.isBefore(sevenDaysLater);
  });

  return typeof limit === 'number' ? thisWeek.slice(0, limit) : thisWeek;
}
