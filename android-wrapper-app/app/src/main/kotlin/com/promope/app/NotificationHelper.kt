package com.promope.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * NotificationHelper — centralised notification utilities.
 *
 * Manages two channels:
 *  • CHANNEL_CHAT  — heads-up + badge, used for incoming-message alerts
 *  • CHANNEL_SYNC  — silent, low-importance, used by the foreground service
 *
 * Notification ID convention:
 *  • 1       → badge keeper (updated silently to maintain the icon badge count)
 *  • 2       → foreground-service "sync" notification
 *  • 1000+   → per-conversation chat notifications (1000 + conversationId)
 */
object NotificationHelper {

    const val CHANNEL_CHAT = "chat_messages"
    const val CHANNEL_SYNC = "chat_sync"

    private const val NOTIF_ID_BADGE   = 1
    const val         NOTIF_ID_SYNC    = 2
    private const val NOTIF_ID_OFFSET  = 1000   // base for per-conversation IDs

    // ── Channel setup ──────────────────────────────────────────────────────

    /**
     * Create notification channels.  Safe to call multiple times; Android
     * ignores duplicate registrations.  Call once in MainActivity.onCreate().
     */
    fun createChannels(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Chat messages — high importance → heads-up banner + sound + badge
        val chatChannel = NotificationChannel(
            CHANNEL_CHAT,
            "Chat Messages",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Incoming direct messages and group messages"
            setShowBadge(true)
            enableLights(true)
            enableVibration(true)
        }

        // Sync — min importance → no sound, no banner, invisible except in drawer
        val syncChannel = NotificationChannel(
            CHANNEL_SYNC,
            "Chat Sync",
            NotificationManager.IMPORTANCE_MIN
        ).apply {
            description = "Background service — keeps messages up-to-date"
            setShowBadge(false)
        }

        nm.createNotificationChannel(chatChannel)
        nm.createNotificationChannel(syncChannel)
    }

    // ── Incoming message notification ──────────────────────────────────────

    /**
     * Post a heads-up notification for a new message.
     *
     * @param ctx         Application context
     * @param title       e.g. "Ashvin Kumar"
     * @param body        e.g. "QA Test 2 - HR Reply"
     * @param convId      Conversation ID — used to deduplicate (same conv →
     *                    same notification ID, so it's replaced, not stacked)
     */
    fun postChatNotification(ctx: Context, title: String, body: String, convId: Int) {
        val nm = NotificationManagerCompat.from(ctx)

        // PendingIntent: tap → open MainActivity → deep-link to /chat
        val tapIntent = Intent(ctx, MainActivity::class.java).apply {
            action = "com.promope.app.OPEN_CHAT"
            putExtra("navigate_to", "/chat")
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val tapPi = PendingIntent.getActivity(
            ctx,
            convId,          // unique requestCode per conversation
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notif = NotificationCompat.Builder(ctx, CHANNEL_CHAT)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tapPi)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()

        try {
            nm.notify(NOTIF_ID_OFFSET + convId, notif)
        } catch (se: SecurityException) {
            // POST_NOTIFICATIONS permission not granted — silently skip
        }
    }

    // ── Badge management ───────────────────────────────────────────────────

    /**
     * Update (or clear) the launcher-icon unread badge.
     *
     * On API 26+ the badge is driven by an active notification; we maintain a
     * silent "badge keeper" notification (ID = 1) whose number is updated.
     * When count reaches 0 the notification is cancelled, removing the badge.
     */
    fun updateBadge(ctx: Context, count: Int) {
        if (count <= 0) {
            cancelBadge(ctx)
            return
        }
        val nm = NotificationManagerCompat.from(ctx)

        // Tap → open chat (same deep-link intent)
        val tapIntent = Intent(ctx, MainActivity::class.java).apply {
            action = "com.promope.app.OPEN_CHAT"
            putExtra("navigate_to", "/chat")
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val tapPi = PendingIntent.getActivity(
            ctx, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notif = NotificationCompat.Builder(ctx, CHANNEL_CHAT)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("$count unread message${if (count > 1) "s" else ""}")
            .setContentText("Tap to open chat")
            .setNumber(count)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .setOngoing(false)
            .setAutoCancel(true)
            .setContentIntent(tapPi)
            .build()

        try {
            nm.notify(NOTIF_ID_BADGE, notif)
        } catch (se: SecurityException) {
            // no permission — skip
        }
    }

    fun cancelBadge(ctx: Context) {
        NotificationManagerCompat.from(ctx).cancel(NOTIF_ID_BADGE)
    }

    fun cancelAllChatNotifications(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.activeNotifications
            .filter { it.id >= NOTIF_ID_OFFSET }
            .forEach { nm.cancel(it.id) }
        cancelBadge(ctx)
    }

    // ── Foreground-service notification ───────────────────────────────────

    /**
     * Build the required foreground notification for [ChatNotificationService].
     * Uses the silent CHANNEL_SYNC channel so it doesn't disturb the user.
     */
    fun buildSyncNotification(ctx: Context): android.app.Notification {
        return NotificationCompat.Builder(ctx, CHANNEL_SYNC)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("PromoPe")
            .setContentText("Checking for new messages…")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .setOngoing(true)
            .build()
    }
}
