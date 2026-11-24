import { Queue, Worker, Job } from 'bullmq';
import { redisConnectionOptions } from './redis.js';
import { sendNotification } from '../services/notification.js';
import { prisma } from './prisma.js';

export const NOTIFICATION_QUEUE_NAME = 'ueu-radar-notifications';

export interface WelcomeJobData {
  type: 'WELCOME';
  nim: string;
  name: string;
  whatsappNumber: string;
  magicLink?: string;
  tasks: Array<{
    title: string;
    deadlineFormatted: string;
    timeRemainingText: string;
    url?: string;
  }>;
}

export interface ReminderJobData {
  type: 'REMINDER';
  nim: string;
  whatsappNumber: string;
  eventUid: string;
  taskTitle: string;
  taskUrl?: string;
  deadlineTimestamp: string; // ISO string
  deadlineFormatted: string;
  timeRemainingText: string;
  noticeType: 'H_24' | 'H_3';
}

export interface SubscriptionExpiryJobData {
  type: 'SUB_EXPIRY';
  nim: string;
  name: string;
  whatsappNumber: string;
  expiredAt: string; // ISO string
}

export interface DirectMessageJobData {
  type: 'DIRECT_MESSAGE';
  whatsappNumber: string;
  message: string;
}

export type NotificationJobPayload =
  | WelcomeJobData
  | ReminderJobData
  | SubscriptionExpiryJobData
  | DirectMessageJobData;

// BullMQ Queue instance
export const notificationQueue = new Queue<NotificationJobPayload>(NOTIFICATION_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: 100,
  },
});

/**
 * Random jitter delay helper between minMs and maxMs (3 to 7 seconds).
 */
const randomJitter = (minMs = 3000, maxMs = 7000): Promise<void> => {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
};

let workerInstance: Worker<NotificationJobPayload> | null = null;

/**
 * Starts the BullMQ worker with 3-7s human-like rate limiting per message.
 */
export function startNotificationWorker(): Worker<NotificationJobPayload> {
  if (workerInstance) {
    return workerInstance;
  }

  workerInstance = new Worker<NotificationJobPayload>(
    NOTIFICATION_QUEUE_NAME,
    async (job: Job<NotificationJobPayload>) => {
      console.log(`[Worker] Processing job ${job.id} of type ${job.data.type}`);

      // Rate limit jitter: 3-7 seconds to prevent WhatsApp bans
      await randomJitter(3000, 7000);

      switch (job.data.type) {
        case 'WELCOME': {
          const { name, whatsappNumber, tasks, magicLink } = job.data;
          let message = `👋 *Halo ${name}! Selamat datang di UEU Academic Radar.*\n\n` +
            `Sistem radar kamu sekarang aktif (Status: *TRIAL 14 Hari*). Bot akan mengingatkanmu H-1 hari dan H-3 jam sebelum batas pengumpulan tugas.\n\n`;

          if (tasks.length === 0) {
            message += `🎉 *Keren!* Belum ada deadline tugas terdeteksi untuk minggu ini. Santai dulu!\n\n`;
          } else {
            message += `📅 *Berikut ${tasks.length} deadline terdekat minggu ini:*\n`;
            tasks.forEach((t, i) => {
              message += `\n${i + 1}. *${t.title}*\n   ⏰ Batas: ${t.deadlineFormatted}\n   ⏳ Sisa: ${t.timeRemainingText}`;
              if (t.url) {
                message += `\n   🔗 Kumpul: ${t.url}`;
              }
            });
            message += `\n\n`;
          }

          if (magicLink) {
            message += `🔗 *Akses Dashboard Pribadi (Tanpa Password):*\n${magicLink}\n\n`;
          }

          message += `💡 *Tips Pintar:*\n` +
            `• Balas *DONE* jika sudah mengumpulkan tugas terdekat agar radar berhenti mengingatkan.\n` +
            `• Balas *CEK* kapan saja untuk melihat rekap tugas aktif minggu ini.`;

          await sendNotification(whatsappNumber, message);
          break;
        }

        case 'REMINDER': {
          const { nim, whatsappNumber, eventUid, taskTitle, taskUrl, deadlineTimestamp, deadlineFormatted, timeRemainingText, noticeType } = job.data;
          const deadlineDate = new Date(deadlineTimestamp);

          // Double-check NotificationLog to prevent duplicate sending
          const existing = await prisma.notificationLog.findUnique({
            where: {
              nim_eventUid_deadlineTimestamp: {
                nim,
                eventUid,
                deadlineTimestamp: deadlineDate,
              },
            },
          });

          if (existing) {
            console.log(`[Worker] Reminder already sent for ${nim} / ${eventUid} at ${deadlineTimestamp}`);
            return;
          }

          const header = noticeType === 'H_3'
            ? `🚨 *PERINGATAN H-3 JAM PENGUMPULAN TUGAS!*`
            : `🔔 *PENGINGAT H-1 HARI PENGUMPULAN TUGAS*`;

          const linkText = taskUrl
            ? `\n🔗 *Buka & Kumpul Langsung:*\n${taskUrl}\n`
            : `\n🔗 *Buka eLearning UEU:*\nhttps://elearning.esaunggul.ac.id/my/\n`;

          const message = `${header}\n\n` +
            `📌 *Mata Kuliah / Tugas:*\n${taskTitle}\n\n` +
            `⏰ *Batas Akhir:* ${deadlineFormatted}\n` +
            `⏳ *Sisa Waktu:* ${timeRemainingText}\n` +
            linkText + `\n` +
            `Pastikan tugas sudah diunggah sebelum portal ditutup!\n\n` +
            `💡 _Balas *DONE* jika kamu sudah mengumpulkannya._`;

          const sendResult = await sendNotification(whatsappNumber, message);

          if (sendResult.success) {
            await prisma.notificationLog.upsert({
              where: {
                nim_eventUid_deadlineTimestamp: {
                  nim,
                  eventUid,
                  deadlineTimestamp: deadlineDate,
                },
              },
              update: {},
              create: {
                nim,
                eventUid,
                deadlineTimestamp: deadlineDate,
              },
            });
            console.log(`[Worker] Notification logged for ${nim} / ${eventUid}`);
          }
          break;
        }

        case 'SUB_EXPIRY': {
          const { nim, name, whatsappNumber, expiredAt } = job.data;
          const expiryDate = new Date(expiredAt);
          const eventUid = `SUB_EXPIRY_${expiryDate.toISOString().slice(0, 10)}`;

          const existing = await prisma.notificationLog.findUnique({
            where: {
              nim_eventUid_deadlineTimestamp: {
                nim,
                eventUid,
                deadlineTimestamp: expiryDate,
              },
            },
          });

          if (existing) {
            console.log(`[Worker] Expiry reminder already sent for ${nim}`);
            return;
          }

          const message = `⚠️ *Halo ${name}! Pengingat Masa Aktif Radar*\n\n` +
            `Masa aktif paket TRIAL UEU Academic Radar kamu akan berakhir besok (kurang dari 24 jam).\n\n` +
            `Untuk tetap mendapatkan notifikasi deadline otomatis via WhatsApp, kamu bisa memperpanjang ke paket *PRO*.\n\n` +
            `Hubungi admin kami untuk aktivasi PRO agar tidak ketinggalan tugas!`;

          const sendResult = await sendNotification(whatsappNumber, message);

          if (sendResult.success) {
            await prisma.notificationLog.upsert({
              where: {
                nim_eventUid_deadlineTimestamp: {
                  nim,
                  eventUid,
                  deadlineTimestamp: expiryDate,
                },
              },
              update: {},
              create: {
                nim,
                eventUid,
                deadlineTimestamp: expiryDate,
              },
            });
          }
          break;
        }

        case 'DIRECT_MESSAGE': {
          await sendNotification(job.data.whatsappNumber, job.data.message);
          break;
        }
      }
    },
    {
      connection: redisConnectionOptions,
      concurrency: 1, // Single concurrency to strictly enforce sequential rate limiting
    }
  );

  workerInstance.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed with error:`, err?.message);
  });

  return workerInstance;
}
