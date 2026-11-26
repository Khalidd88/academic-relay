import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import dayjs from 'dayjs';
import { prisma } from '../lib/prisma.js';
import {
  encryptIcsData,
  decryptIcsData,
  validateIcsContent,
  generateVerificationCode,
  createDashboardToken,
  verifyDashboardToken,
} from '../utils/security.js';
import {
  parseCalendarTasks,
  filterTasksThisWeek,
  filterUpcomingTasks,
  APP_TIMEZONE,
  CalendarTask,
  formatJakartaDate,
} from '../services/calendar.js';
import { notificationQueue } from '../lib/queue.js';
import { sendNotification } from '../services/notification.js';

interface RegisterBody {
  nim: string;
  name: string;
  whatsappNumber: string;
  icsContent: string;
}

interface UpdateIcsBody {
  nim?: string;
  icsContent: string;
}

export const apiRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * POST /api/register
   * Anti-Spoofing: Reverse-Initiated Verification.
   * Rate-limited to max 5 requests per 15 minutes per IP.
   * Saves to PendingRegistration with 15-minute expiry and returns verification code + waLink.
   */
  fastify.post<{ Body: RegisterBody }>(
    '/api/register',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const { nim, name, whatsappNumber, icsContent } = request.body || {};

      // 1. Basic validation
      if (!nim || typeof nim !== 'string' || nim.trim().length === 0) {
        return reply.status(400).send({ error: 'NIM wajib diisi.' });
      }

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return reply.status(400).send({ error: 'Nama panggilan wajib diisi.' });
      }

      let cleanWaNumber = (whatsappNumber || '').replace(/\D/g, '');
      if (cleanWaNumber.startsWith('08')) {
        cleanWaNumber = '628' + cleanWaNumber.slice(2);
      } else if (cleanWaNumber.startsWith('8')) {
        cleanWaNumber = '628' + cleanWaNumber.slice(1);
      }
      if (!cleanWaNumber.startsWith('628') || cleanWaNumber.length < 10 || cleanWaNumber.length > 15) {
        return reply.status(400).send({
          error: 'Nomor WhatsApp tidak valid. Format wajib diawali 628 atau 08 (contoh: 081234567890).',
        });
      }

      // 2. Validate .ics content directly
      try {
        validateIcsContent(icsContent);
      } catch (err: any) {
        return reply.status(400).send({
          error: `Validasi file kalender gagal: ${err.message}`,
        });
      }

      // 3. Encrypt raw .ics content
      let encryptedIcsData: string;
      try {
        encryptedIcsData = encryptIcsData(icsContent.trim());
      } catch (err: any) {
        return reply.status(500).send({ error: 'Gagal mengamankan data kalender.' });
      }

      const cleanNim = nim.trim();
      const now = dayjs().tz(APP_TIMEZONE);

      // 4. Check for active pending registration for this NIM to avoid duplicate spam
      const existingPending = await prisma.pendingRegistration.findUnique({
        where: { nim: cleanNim },
      });

      let verificationCode: string;
      let expiresAt: Date;

      if (existingPending && dayjs(existingPending.expiresAt).isAfter(now)) {
        // Reuse existing valid code or renew expiry
        verificationCode = existingPending.verificationCode;
        expiresAt = dayjs().tz(APP_TIMEZONE).add(15, 'minute').toDate();

        await prisma.pendingRegistration.update({
          where: { nim: cleanNim },
          data: {
            name: name.trim(),
            whatsappNumber: cleanWaNumber,
            encryptedIcsData,
            expiresAt,
          },
        });
      } else {
        // Generate new unique code
        verificationCode = generateVerificationCode();
        expiresAt = dayjs().tz(APP_TIMEZONE).add(15, 'minute').toDate();

        await prisma.pendingRegistration.upsert({
          where: { nim: cleanNim },
          update: {
            name: name.trim(),
            whatsappNumber: cleanWaNumber,
            encryptedIcsData,
            verificationCode,
            expiresAt,
          },
          create: {
            nim: cleanNim,
            name: name.trim(),
            whatsappNumber: cleanWaNumber,
            encryptedIcsData,
            verificationCode,
            expiresAt,
          },
        });
      }

      const botNumber = process.env.WA_BOT_NUMBER || '6281234567890';
      const waLink = `https://wa.me/${botNumber}?text=${encodeURIComponent(verificationCode)}`;

      return reply.status(200).send({
        success: true,
        verificationCode,
        botNumber,
        waLink,
        expiresInMinutes: 15,
        message: 'Kode verifikasi telah dibuat. Silakan kirimkan kode verifikasi melalui tautan WhatsApp berikut untuk mengaktifkan bot.',
      });
    }
  );

  /**
   * GET /api/me?token=...
   * Authenticates user using HMAC-SHA256 signed magic link token.
   */
  fastify.get<{ Querystring: { token: string } }>('/api/me', async (request, reply) => {
    const { token } = request.query;
    if (!token) {
      return reply.status(401).send({ error: 'Token autentikasi tidak ditemukan.' });
    }

    const verification = verifyDashboardToken(token);
    if (!verification.valid || !verification.nim) {
      return reply.status(401).send({ error: 'Token tidak valid atau telah kedaluwarsa.' });
    }

    const user = await prisma.user.findUnique({
      where: { nim: verification.nim },
    });

    if (!user) {
      return reply.status(404).send({ error: 'Pengguna tidak ditemukan.' });
    }

    const now = dayjs().tz(APP_TIMEZONE);
    const userExpiredAt = dayjs(user.expiredAt).tz(APP_TIMEZONE);
    const isExpired = now.isAfter(userExpiredAt);
    const effectivePlanStatus = isExpired && user.planStatus !== 'FREE' ? 'FREE' : user.planStatus;

    const daysRemaining = Math.max(0, userExpiredAt.diff(now, 'day'));
    const hoursRemaining = Math.max(0, userExpiredAt.diff(now, 'hour'));

    // Decrypt and parse tasks
    let tasks: CalendarTask[] = [];
    try {
      const icsContent = decryptIcsData(user.encryptedIcsData);
      tasks = parseCalendarTasks(icsContent);
    } catch (err: any) {
      fastify.log.warn(`[API /me] Could not decrypt calendar: ${err.message}`);
    }

    // Match done tasks
    const doneLogs = await prisma.notificationLog.findMany({
      where: {
        nim: user.nim,
        eventUid: { endsWith: '_DONE' },
      },
    });
    const doneUids = new Set(doneLogs.map((l) => l.eventUid.replace('_DONE', '')));

    const activeTasks = tasks.map((t) => ({
      ...t,
      isDone: doneUids.has(t.uid),
    }));

    return reply.send({
      nim: user.nim,
      name: user.name,
      whatsappNumber: user.whatsappNumber,
      planStatus: effectivePlanStatus,
      expiredAt: user.expiredAt,
      isExpired,
      daysRemaining,
      hoursRemaining,
      tasks: activeTasks,
    });
  });

  /**
   * POST /api/me/update-ics?token=...
   * Updates .ics calendar for user authenticated via HMAC token.
   */
  fastify.post<{ Querystring: { token: string }; Body: { icsContent: string } }>(
    '/api/me/update-ics',
    async (request, reply) => {
      const { token } = request.query;
      const { icsContent } = request.body || {};

      const verification = verifyDashboardToken(token);
      if (!verification.valid || !verification.nim) {
        return reply.status(401).send({ error: 'Token tidak valid.' });
      }

      try {
        validateIcsContent(icsContent);
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }

      const encryptedIcsData = encryptIcsData(icsContent.trim());
      await prisma.user.update({
        where: { nim: verification.nim },
        data: { encryptedIcsData },
      });

      const tasks = parseCalendarTasks(icsContent);
      return reply.send({
        success: true,
        message: 'Jadwal kalender berhasil diperbarui.',
        totalTasks: tasks.length,
      });
    }
  );

  /**
   * POST /api/update-ics
   * Direct update with NIM (used by internal processes/forms)
   */
  fastify.post<{ Body: UpdateIcsBody }>('/api/update-ics', async (request, reply) => {
    const { nim, icsContent } = request.body || {};

    if (!nim || typeof nim !== 'string' || nim.trim().length === 0) {
      return reply.status(400).send({ error: 'NIM wajib diisi.' });
    }

    const cleanNim = nim.trim();
    const user = await prisma.user.findUnique({
      where: { nim: cleanNim },
    });

    if (!user) {
      return reply.status(404).send({ error: `Pengguna dengan NIM ${cleanNim} tidak ditemukan.` });
    }

    try {
      validateIcsContent(icsContent);
    } catch (err: any) {
      return reply.status(400).send({
        error: `Validasi file kalender gagal: ${err.message}`,
      });
    }

    const encryptedIcsData = encryptIcsData(icsContent.trim());
    await prisma.user.update({
      where: { nim: cleanNim },
      data: { encryptedIcsData },
    });

    const tasks = parseCalendarTasks(icsContent);
    return reply.send({
      success: true,
      message: 'Jadwal kalender berhasil diperbarui.',
      totalTasks: tasks.length,
    });
  });

  /**
   * GET /api/dashboard/:nim
   */
  fastify.get<{ Params: { nim: string } }>('/api/dashboard/:nim', async (request, reply) => {
    const { nim } = request.params;

    const user = await prisma.user.findUnique({
      where: { nim },
    });

    if (!user) {
      return reply.status(404).send({ error: `Pengguna dengan NIM ${nim} tidak ditemukan.` });
    }

    const now = dayjs().tz(APP_TIMEZONE);
    const userExpiredAt = dayjs(user.expiredAt).tz(APP_TIMEZONE);
    const isExpired = now.isAfter(userExpiredAt);
    const effectivePlanStatus = isExpired && user.planStatus !== 'FREE' ? 'FREE' : user.planStatus;

    const daysRemaining = Math.max(0, userExpiredAt.diff(now, 'day'));
    const hoursRemaining = Math.max(0, userExpiredAt.diff(now, 'hour'));

    let tasks: CalendarTask[] = [];
    try {
      const icsContent = decryptIcsData(user.encryptedIcsData);
      tasks = parseCalendarTasks(icsContent);
    } catch (err: any) {
      fastify.log.warn(`[Dashboard] Could not decrypt calendar for ${nim}: ${err.message}`);
    }

    const doneLogs = await prisma.notificationLog.findMany({
      where: {
        nim: user.nim,
        eventUid: { endsWith: '_DONE' },
      },
    });

    const doneEventUids = new Set(doneLogs.map((log) => log.eventUid.replace('_DONE', '')));
    const activeTasks = tasks.map((t) => ({
      ...t,
      isDone: doneEventUids.has(t.uid),
    }));

    return reply.send({
      nim: user.nim,
      name: user.name,
      whatsappNumber: user.whatsappNumber,
      planStatus: effectivePlanStatus,
      expiredAt: user.expiredAt,
      isExpired,
      daysRemaining,
      hoursRemaining,
      tasks: activeTasks,
    });
  });

  // =========================================================================
  // ADMIN API ROUTES (/api/admin/*)
  // Protected with x-admin-secret header
  // =========================================================================
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/api/admin')) {
      const adminSecret = request.headers['x-admin-secret'];
      const expectedSecret = process.env.ADMIN_SECRET || 'ueu-radar-super-secret-admin-key-2026';

      if (!adminSecret || adminSecret !== expectedSecret) {
        return reply.status(401).send({ error: 'Akses ditolak: Admin Secret Key tidak valid.' });
      }
    }
  });

  /**
   * GET /api/admin/overview
   * Returns overview metrics and all users list (without encryptedIcsData).
   */
  fastify.get('/api/admin/overview', async (_request, reply) => {
    const now = dayjs().tz(APP_TIMEZONE);
    const todayStart = now.startOf('day').toDate();

    const [
      totalUsers,
      trialUsers,
      freeUsers,
      allProUsers,
      pendingVerifications,
      notificationsSentToday,
      notificationsTotal,
      users,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { planStatus: 'TRIAL' } }),
      prisma.user.count({ where: { planStatus: 'FREE' } }),
      prisma.user.findMany({
        where: { planStatus: 'PRO' },
        select: { nim: true, expiredAt: true },
      }),
      prisma.pendingRegistration.count({
        where: { expiresAt: { gt: now.toDate() } },
      }),
      prisma.notificationLog.count({
        where: { sentAt: { gte: todayStart } },
      }),
      prisma.notificationLog.count(),
      prisma.user.findMany({
        select: {
          nim: true,
          name: true,
          whatsappNumber: true,
          planStatus: true,
          expiredAt: true,
          createdAt: true,
          _count: {
            select: { notificationLogs: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Active PRO users are those with planStatus PRO whose expiredAt is in the future
    const activeProUsers = allProUsers.filter((u) => dayjs(u.expiredAt).isAfter(now)).length;
    const estimatedRevenue = activeProUsers * 15000;
    const revenueSplit5050 = Math.round(estimatedRevenue / 2);

    // Compute last 7 days registrations trend
    const last7Days: Array<{ date: string; label: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = now.subtract(i, 'day');
      const startOfDay = d.startOf('day').toDate();
      const endOfDay = d.endOf('day').toDate();
      const count = users.filter((u) => {
        const created = new Date(u.createdAt).getTime();
        return created >= startOfDay.getTime() && created <= endOfDay.getTime();
      }).length;
      last7Days.push({
        date: d.format('YYYY-MM-DD'),
        label: d.format('DD MMM'),
        count,
      });
    }

    return reply.send({
      totalUsers,
      trialUsers,
      freeUsers,
      activeProUsers,
      pendingVerifications,
      notificationsSentToday,
      notificationsTotal,
      estimatedRevenue,
      revenueSplit5050,
      dailyRegistrations: last7Days,
      planBreakdown: {
        pro: activeProUsers,
        trial: trialUsers,
        free: freeUsers,
      },
      systemHealth: {
        channel: (process.env.NOTIFY_CHANNEL || 'TELEGRAM').toUpperCase(),
        botNumber: process.env.WA_BOT_NUMBER || '6281234567890',
        serverTimeWib: now.format('YYYY-MM-DD HH:mm:ss') + ' WIB',
        nodeEnv: process.env.NODE_ENV || 'development',
      },
      users,
    });
  });

  /**
   * POST /api/admin/users/:nim/activate-pro
   * Activates/extends PRO plan for 30 days and sends notification.
   */
  fastify.post<{ Params: { nim: string } }>('/api/admin/users/:nim/activate-pro', async (request, reply) => {
    const { nim } = request.params;
    const user = await prisma.user.findUnique({
      where: { nim },
    });

    if (!user) {
      return reply.status(404).send({ error: `User dengan NIM ${nim} tidak ditemukan.` });
    }

    const now = dayjs().tz(APP_TIMEZONE);
    const currentExpiry = dayjs(user.expiredAt).tz(APP_TIMEZONE);

    // If currently active, extend from currentExpiry; otherwise extend from now
    const baseDate = currentExpiry.isAfter(now) ? currentExpiry : now;
    const newExpiredAt = baseDate.add(30, 'day').toDate();

    const updatedUser = await prisma.user.update({
      where: { nim },
      data: {
        planStatus: 'PRO',
        expiredAt: newExpiredAt,
      },
      select: {
        nim: true,
        name: true,
        whatsappNumber: true,
        planStatus: true,
        expiredAt: true,
      },
    });

    // Notify user via BullMQ
    const formattedExpiry = formatJakartaDate(newExpiredAt);
    const message =
      `🎉 *Selamat ${user.name}! Paket PRO UEU Academic Radar Anda telah aktif selama 30 hari.*\n\n` +
      `📅 Masa aktif berlaku s/d: *${formattedExpiry}*\n\n` +
      `Terima kasih atas dukungannya! Radar akan terus memantau seluruh deadline tugasmu secara otomatis. 🚀`;

    await notificationQueue.add(`admin-pro-${user.nim}`, {
      type: 'DIRECT_MESSAGE',
      whatsappNumber: user.whatsappNumber,
      message,
    });

    return reply.send({
      success: true,
      message: `Paket PRO untuk NIM ${nim} berhasil diaktifkan selama 30 hari.`,
      user: updatedUser,
    });
  });

  /**
   * DELETE /api/admin/users/:nim
   * Deletes a user and related logs (anti-abuse/moderation).
   */
  fastify.delete<{ Params: { nim: string } }>('/api/admin/users/:nim', async (request, reply) => {
    const { nim } = request.params;

    const user = await prisma.user.findUnique({ where: { nim } });
    if (!user) {
      return reply.status(404).send({ error: `User dengan NIM ${nim} tidak ditemukan.` });
    }

    await prisma.user.delete({ where: { nim } });
    await prisma.pendingRegistration.deleteMany({ where: { nim } }).catch(() => {});

    return reply.send({
      success: true,
      message: `User ${nim} (${user.name}) berhasil dihapus.`,
    });
  });

  // =========================================================================
  // WEBHOOK HELPERS & COMMANDS
  // =========================================================================
  async function handleIncomingMessage(
    senderPhone: string,
    rawText: string,
    replyFn: (msg: string) => Promise<any>
  ) {
    const cleanPhone = senderPhone.replace(/[:@].*$/, '').replace(/\D/g, '');
    const textTrimmed = rawText.trim();
    const commandUpper = textTrimmed.toUpperCase();
    const now = dayjs().tz(APP_TIMEZONE);

    console.log(`[handleIncomingMessage] sender: "${senderPhone}", clean: "${cleanPhone}", command: "${commandUpper}"`);

    // 1. Check for Anti-Spoofing Verification Code ("VERIF-XXXX")
    if (commandUpper.startsWith('VERIF-')) {
      const code = commandUpper;
      const pending = await prisma.pendingRegistration.findUnique({
        where: { verificationCode: code },
      });

      if (!pending) {
        await replyFn('⚠️ Kode verifikasi tidak ditemukan. Pastikan Anda telah mengisi formulir pendaftaran di website.');
        return;
      }

      if (now.isAfter(dayjs(pending.expiresAt))) {
        await prisma.pendingRegistration.delete({ where: { nim: pending.nim } }).catch(() => {});
        await replyFn('⚠️ Kode verifikasi telah kedaluwarsa (lebih dari 15 menit). Silakan lakukan pendaftaran ulang di website.');
        return;
      }

      // Check phone match
      // If Telegram channel is active in testing mode, allow test chat ID sender
      const isTelegramChannel = process.env.NOTIFY_CHANNEL === 'TELEGRAM';
      const isTestMatch = isTelegramChannel && (senderPhone === process.env.TELEGRAM_TEST_CHAT_ID || cleanPhone === pending.whatsappNumber);

      if (!isTestMatch && cleanPhone !== pending.whatsappNumber) {
        await replyFn(
          `⚠️ Nomor WhatsApp pengirim (+${cleanPhone}) tidak cocok dengan nomor yang didaftarkan (+${pending.whatsappNumber}). Untuk keamanan, verifikasi dibatalkan.`
        );
        return;
      }

      // Reverse-Initiated Verification SUCCESS! Move to User table
      const trialExpiredAt = now.add(14, 'day').toDate();
      const user = await prisma.user.upsert({
        where: { nim: pending.nim },
        update: {
          name: pending.name,
          whatsappNumber: pending.whatsappNumber,
          encryptedIcsData: pending.encryptedIcsData,
          planStatus: 'TRIAL',
          expiredAt: trialExpiredAt,
        },
        create: {
          nim: pending.nim,
          name: pending.name,
          whatsappNumber: pending.whatsappNumber,
          encryptedIcsData: pending.encryptedIcsData,
          planStatus: 'TRIAL',
          expiredAt: trialExpiredAt,
        },
      });

      // Remove from PendingRegistration
      await prisma.pendingRegistration.delete({ where: { nim: pending.nim } });

      // Generate HMAC-SHA256 Dashboard Magic Link
      const dashboardToken = createDashboardToken(user.nim);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const magicLink = `${frontendUrl}/m/${dashboardToken}`;

      // Parse upcoming tasks for instant welcome message
      let nearestTasks: CalendarTask[] = [];
      try {
        const rawIcs = decryptIcsData(user.encryptedIcsData);
        const allTasks = parseCalendarTasks(rawIcs);
        nearestTasks = filterTasksThisWeek(allTasks, 3);
      } catch (err: any) {
        fastify.log.warn(`[Verification] Error parsing tasks: ${err.message}`);
      }

      // Enqueue welcome job
      await notificationQueue.add(`instant-welcome-${user.nim}`, {
        type: 'WELCOME',
        nim: user.nim,
        name: user.name,
        whatsappNumber: user.whatsappNumber,
        magicLink,
        tasks: nearestTasks.map((t) => ({
          title: t.title,
          deadlineFormatted: t.deadlineFormatted,
          timeRemainingText: t.timeRemainingText,
          url: t.url,
        })),
      });

      await replyFn(
        `🎉 *Verifikasi WhatsApp Berhasil!*\n\n` +
          `Selamat datang di UEU Academic Radar, *${user.name}*!\n\n` +
          `Status akunmu: *TRIAL 14 Hari*\n` +
          `Sistem radar telah aktif dan akan otomatis mengingatkan tugas-tugasmu.\n\n` +
          `🔗 *Dashboard Pribadi Kamu (Tanpa Password):*\n${magicLink}\n\n` +
          `_Simpan link di atas untuk melihat tugas aktif kapan saja!_`
      );
      return;
    }

    // Lookup user strictly by WhatsApp number
    let user = await prisma.user.findFirst({
      where: { whatsappNumber: cleanPhone },
    });

    // In local Telegram testing simulation ONLY, allow test chat ID sender to act on the latest test user
    const isTelegramTestMode =
      process.env.NOTIFY_CHANNEL === 'TELEGRAM' &&
      senderPhone === process.env.TELEGRAM_TEST_CHAT_ID;

    if (!user && isTelegramTestMode) {
      user = await prisma.user.findFirst({
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!user) {
      await replyFn(
        `⚠️ Nomor WhatsApp Anda (+${cleanPhone}) belum terdaftar di UEU Academic Radar. Silakan daftar terlebih dahulu melalui website.`
      );
      return;
    }

    // 2. Command "DONE" / "SELESAI" / "SUDAH" / "BERES"
    const isDoneCmd = ['DONE', 'SELESAI', 'SUDAH', 'BERES'].some((kw) => commandUpper.startsWith(kw));
    if (isDoneCmd) {
      try {
        const icsContent = decryptIcsData(user.encryptedIcsData);
        const tasks = parseCalendarTasks(icsContent);

        const upcomingTasks = tasks.filter((t) => dayjs(t.deadline).isAfter(now));
        const doneLogs = await prisma.notificationLog.findMany({
          where: {
            nim: user.nim,
            eventUid: { endsWith: '_DONE' },
          },
        });
        const doneUids = new Set(doneLogs.map((l) => l.eventUid.replace('_DONE', '')));
        const pendingTasks = upcomingTasks.filter((t) => !doneUids.has(t.uid));

        if (pendingTasks.length === 0) {
          await replyFn(
            `ℹ️ Halo ${user.name}, saat ini tidak ada tugas aktif mendatang yang perlu ditandai selesai.`
          );
          return;
        }

        const nearestTask = pendingTasks[0];
        const doneEventUid = `${nearestTask.uid}_DONE`;

        await prisma.notificationLog.upsert({
          where: {
            nim_eventUid_deadlineTimestamp: {
              nim: user.nim,
              eventUid: doneEventUid,
              deadlineTimestamp: nearestTask.deadline,
            },
          },
          update: {},
          create: {
            nim: user.nim,
            eventUid: doneEventUid,
            deadlineTimestamp: nearestTask.deadline,
          },
        });

        for (const suffix of ['_H24', '_H3']) {
          await prisma.notificationLog.upsert({
            where: {
              nim_eventUid_deadlineTimestamp: {
                nim: user.nim,
                eventUid: `${nearestTask.uid}${suffix}`,
                deadlineTimestamp: nearestTask.deadline,
              },
            },
            update: {},
            create: {
              nim: user.nim,
              eventUid: `${nearestTask.uid}${suffix}`,
              deadlineTimestamp: nearestTask.deadline,
            },
          });
        }

        await replyFn(
          `✅ *Hebat, ${user.name}!* Tugas berikut berhasil ditandai *SELESAI*:\n\n` +
            `📌 *${nearestTask.title}*\n` +
            `⏰ Batas: ${nearestTask.deadlineFormatted}\n\n` +
            `Sistem radar tidak akan mengirimkan pengingat lagi untuk tugas ini. Istirahatlah dengan tenang! 🎉`
        );
      } catch (err: any) {
        fastify.log.error(err);
        await replyFn(`❌ Terjadi kendala saat memeriksa tugas: ${err.message}`);
      }
      return;
    }

    // 3. Command "CEK" / "JADWAL" / "TUGAS"
    const isCekCmd = ['CEK', 'CHECK', 'JADWAL', 'TUGAS', 'INFO', 'LIST'].some((kw) => commandUpper.startsWith(kw));
    if (isCekCmd) {
      try {
        const icsContent = decryptIcsData(user.encryptedIcsData);
        const allTasks = parseCalendarTasks(icsContent);
        let activeList = filterTasksThisWeek(allTasks);
        let isExtended = false;

        if (activeList.length === 0) {
          const upcoming = filterUpcomingTasks(allTasks, 3);
          if (upcoming.length > 0) {
            activeList = upcoming;
            isExtended = true;
          }
        }

        if (activeList.length === 0) {
          await replyFn(
            `🎉 *Kabar Baik, ${user.name}!* Tidak ada tugas aktif mendatang di kalender kamu. Nikmati waktumu!`
          );
          return;
        }

        let replyMsg = isExtended
          ? `📋 *Daftar Tugas Terdekat Mendatang (NIM: ${user.nim})*\n\n`
          : `📋 *Daftar Tugas Aktif Minggu Ini (NIM: ${user.nim})*\n\n`;

        activeList.forEach((t, i) => {
          replyMsg += `${i + 1}. *${t.title}*\n   ⏰ Batas: ${t.deadlineFormatted}\n   ⏳ Sisa: ${t.timeRemainingText}\n   🔗 Buka: ${t.url || 'https://elearning.esaunggul.ac.id/my/'}\n\n`;
        });
        replyMsg += `💡 _Ketik *DONE* jika sudah selesai tugas terdekat, atau *LINK* untuk buka dashboard._`;

        await replyFn(replyMsg);
      } catch (err: any) {
        fastify.log.error(err);
        await replyFn(`❌ Gagal menyinkronkan tugas kalender: ${err.message}`);
      }
      return;
    }

    // 4. Command "LINK" / "DASHBOARD"
    const isLinkCmd = ['LINK', 'DASHBOARD', 'LOGIN', 'WEB'].some((kw) => commandUpper.startsWith(kw));
    if (isLinkCmd) {
      const dashboardToken = createDashboardToken(user.nim);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const magicLink = `${frontendUrl}/m/${dashboardToken}`;
      await replyFn(
        `🔗 *Akses Dashboard Pribadi Kamu (Tanpa Password):*\n${magicLink}\n\n` +
          `Klik tautan di atas untuk melihat tugas aktif atau memperbarui kalender eLearning kamu.`
      );
      return;
    }

    // Default response
    await replyFn(
      `👋 Halo ${user.name}!\n\n` +
        `Perintah yang dapat kamu gunakan:\n` +
        `• *DONE* : Menandai tugas terdekat sebagai selesai.\n` +
        `• *CEK* : Melihat rekap seluruh tugas aktif minggu ini.\n` +
        `• *LINK* : Mendapatkan tautan akses dashboard pribadimu.`
    );
  }

  /**
   * POST /webhook/telegram
   */
  fastify.post('/webhook/telegram', async (request, reply) => {
    const body = request.body as any;
    const message = body?.message;

    if (!message || !message.text) {
      return reply.send({ ok: true, ignored: true });
    }

    const chatId = String(message.chat?.id || '');
    const rawText = message.text;

    await handleIncomingMessage(chatId, rawText, async (msgText) => {
      await sendNotification(chatId, msgText);
    });

    return reply.send({ ok: true });
  });

  /**
   * POST /webhook/waha (and alias /api/webhook/waha)
   */
  const wahaWebhookHandler = async (request: any, reply: any) => {
    const body = request.body as any;
    const payload = body?.payload;

    if (!payload || payload.fromMe) {
      return reply.send({ ok: true, ignored: true });
    }

    const rawFrom = String(payload.from || '');
    const text = String(payload.body || payload.text || '');

    // Ignore group messages & status broadcasts
    if (!rawFrom || !text || rawFrom.endsWith('@g.us') || rawFrom === 'status@broadcast') {
      return reply.send({ ok: true, ignored: true });
    }

    // Resolve real phone number (handle WhatsApp @lid JIDs)
    let resolvedJid = rawFrom;
    const altJid =
      payload._data?.key?.remoteJidAlt ||
      payload._data?.key?.senderPn ||
      payload._data?.senderPn ||
      payload.participant;

    if (altJid && String(altJid).includes('@') && !String(altJid).endsWith('@lid')) {
      resolvedJid = String(altJid);
    } else if (rawFrom.endsWith('@lid')) {
      try {
        const wahaBase = process.env.WAHA_BASE_URL || 'http://127.0.0.1:3005';
        const wahaSession = process.env.WAHA_SESSION || 'default';
        const wahaKey = process.env.WAHA_API_KEY || '';
        const headers: Record<string, string> = {};
        if (wahaKey) headers['X-Api-Key'] = wahaKey;

        const lidRes = await fetch(`${wahaBase}/api/${wahaSession}/lids/${encodeURIComponent(rawFrom)}`, {
          headers,
        });
        if (lidRes.ok) {
          const lidData = (await lidRes.json()) as { pn?: string };
          if (lidData?.pn) {
            resolvedJid = lidData.pn;
          }
        }
      } catch (err) {
        console.warn('[WAHA Webhook] Failed to resolve LID:', err);
      }
    }

    const fromPhone = resolvedJid.replace(/[:@].*$/, '').replace(/\D/g, '');
    console.log(`[WAHA Webhook] rawFrom: "${rawFrom}", resolvedPhone: "${fromPhone}", text: "${text}"`);

    if (!fromPhone) {
      return reply.send({ ok: true, ignored: true });
    }

    await handleIncomingMessage(fromPhone, text, async (msgText) => {
      console.log(`[WAHA Webhook] Sending reply to "${rawFrom}": "${msgText.slice(0, 50)}..."`);
      await sendNotification(rawFrom, msgText);
    });

    return reply.send({ ok: true });
  };

  fastify.post('/webhook/waha', wahaWebhookHandler);
  fastify.post('/api/webhook/waha', wahaWebhookHandler);
};
