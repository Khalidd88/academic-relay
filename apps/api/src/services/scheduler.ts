import cron from 'node-cron';
import dayjs from 'dayjs';
import { prisma } from '../lib/prisma.js';
import { decryptIcsData } from '../utils/security.js';
import { parseCalendarTasks, APP_TIMEZONE } from './calendar.js';
import { notificationQueue } from '../lib/queue.js';

/**
 * Checks all active TRIAL and PRO users:
 * 1. Downgrades expired accounts to FREE
 * 2. Sends subscription expiry alert if < 24 hours remain (exact minute-based calculation)
 * 3. Reads and decrypts stored .ics content from DB to schedule H-1 day and H-3 hour assignment reminders
 */
export async function runSyncAndReminderCycle(): Promise<void> {
  const now = dayjs().tz(APP_TIMEZONE);
  console.log(`[Scheduler] Running sync and reminder cycle at ${now.format('YYYY-MM-DD HH:mm:ss')} WIB`);

  try {
    // 1. Fetch all active users (TRIAL & PRO)
    const activeUsers = await prisma.user.findMany({
      where: {
        planStatus: {
          in: ['TRIAL', 'PRO'],
        },
      },
    });

    console.log(`[Scheduler] Found ${activeUsers.length} active TRIAL/PRO users`);

    for (const user of activeUsers) {
      const userExpiredAt = dayjs(user.expiredAt).tz(APP_TIMEZONE);

      // Check account expiration
      if (now.isAfter(userExpiredAt)) {
        console.log(`[Scheduler] User ${user.nim} expired at ${userExpiredAt.toISOString()}. Downgrading to FREE.`);
        await prisma.user.update({
          where: { nim: user.nim },
          data: { planStatus: 'FREE' },
        });
        continue;
      }

      // Check H-1 subscription expiry reminder (< 24 hours / 1440 minutes remaining)
      const minutesToSubExpiry = userExpiredAt.diff(now, 'minute');
      if (minutesToSubExpiry <= 1440 && minutesToSubExpiry > 0) {
        const subExpiryUid = `SUB_EXPIRY_${userExpiredAt.toISOString().slice(0, 10)}`;
        const alreadyNotified = await prisma.notificationLog.findUnique({
          where: {
            nim_eventUid_deadlineTimestamp: {
              nim: user.nim,
              eventUid: subExpiryUid,
              deadlineTimestamp: user.expiredAt,
            },
          },
        });

        if (!alreadyNotified) {
          await notificationQueue.add(
            `sub-expiry-${user.nim}`,
            {
              type: 'SUB_EXPIRY',
              nim: user.nim,
              name: user.name,
              whatsappNumber: user.whatsappNumber,
              expiredAt: user.expiredAt.toISOString(),
            },
            {
              jobId: `sub-expiry-${user.nim}-${subExpiryUid}`,
            }
          );
        }
      }

      // Read & decrypt stored .ics calendar tasks from database
      try {
        const icsContent = decryptIcsData(user.encryptedIcsData);
        const tasks = parseCalendarTasks(icsContent);

        // Filter upcoming tasks only
        const upcomingTasks = tasks.filter((t) => dayjs(t.deadline).isAfter(now));

        for (const task of upcomingTasks) {
          const taskDeadline = dayjs(task.deadline).tz(APP_TIMEZONE);
          const diffMinutes = taskDeadline.diff(now, 'minute');

          // Check if user already marked this task DONE
          const isDone = await prisma.notificationLog.findUnique({
            where: {
              nim_eventUid_deadlineTimestamp: {
                nim: user.nim,
                eventUid: `${task.uid}_DONE`,
                deadlineTimestamp: task.deadline,
              },
            },
          });
          if (isDone) {
            continue;
          }

          // Case A: H-3 Hours Reminder (0 < diffMinutes <= 180)
          if (diffMinutes <= 180 && diffMinutes > 0) {
            const eventUidH3 = `${task.uid}_H3`;
            const loggedH3 = await prisma.notificationLog.findUnique({
              where: {
                nim_eventUid_deadlineTimestamp: {
                  nim: user.nim,
                  eventUid: eventUidH3,
                  deadlineTimestamp: task.deadline,
                },
              },
            });

            if (!loggedH3) {
              await notificationQueue.add(
                `remind-h3-${user.nim}-${task.uid}`,
                {
                  type: 'REMINDER',
                  nim: user.nim,
                  whatsappNumber: user.whatsappNumber,
                  eventUid: eventUidH3,
                  taskTitle: task.title,
                  deadlineTimestamp: task.deadline.toISOString(),
                  deadlineFormatted: task.deadlineFormatted,
                  timeRemainingText: task.timeRemainingText,
                  noticeType: 'H_3',
                },
                {
                  jobId: `remind-h3-${user.nim}-${task.uid}-${task.deadline.getTime()}`,
                }
              );
            }
          }
          // Case B: H-1 Day Reminder (180 < diffMinutes <= 1440)
          else if (diffMinutes <= 1440 && diffMinutes > 180) {
            const eventUidH24 = `${task.uid}_H24`;
            const loggedH24 = await prisma.notificationLog.findUnique({
              where: {
                nim_eventUid_deadlineTimestamp: {
                  nim: user.nim,
                  eventUid: eventUidH24,
                  deadlineTimestamp: task.deadline,
                },
              },
            });

            if (!loggedH24) {
              await notificationQueue.add(
                `remind-h24-${user.nim}-${task.uid}`,
                {
                  type: 'REMINDER',
                  nim: user.nim,
                  whatsappNumber: user.whatsappNumber,
                  eventUid: eventUidH24,
                  taskTitle: task.title,
                  deadlineTimestamp: task.deadline.toISOString(),
                  deadlineFormatted: task.deadlineFormatted,
                  timeRemainingText: task.timeRemainingText,
                  noticeType: 'H_24',
                },
                {
                  jobId: `remind-h24-${user.nim}-${task.uid}-${task.deadline.getTime()}`,
                }
              );
            }
          }
        }
      } catch (err: any) {
        console.error(`[Scheduler] Error reading calendar for user ${user.nim}:`, err?.message);
      }
    }
  } catch (error: any) {
    console.error('[Scheduler] Fatal error in sync cycle:', error?.message);
  }
}

/**
 * Initializes the cron scheduler.
 * 1. Runs once immediately after a brief delay on startup.
 * 2. Runs every 15 minutes to catch deadlines within a tight 15-minute window.
 */
export function startCronScheduler(): void {
  // Initial check on boot
  setTimeout(() => {
    runSyncAndReminderCycle().catch((err) => {
      console.error('[Scheduler] Initial startup cycle failed:', err?.message);
    });
  }, 3000);

  // High-precision 15-minute schedule
  cron.schedule('*/15 * * * *', async () => {
    await runSyncAndReminderCycle();
  });

  console.log('[Scheduler] Cron job registered: Running every 15 minutes (*/15 * * * *)');
}
