package expo.modules.livetimer

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Tout ce qui touche au système Android pour une série : la minuterie de fin, la notification de fin (bandeau + son + vibration)
 * et la notification « compte à rebours » (chronomètre à rebours animé par le système lui-même).
 * Rien ici ne dépend de React Native : l'alarme sonne même si l'app a été fermée par le système.
 */
internal object TimerNotifications {
  const val CHANNEL_LIVE = "set-live"

  /** Même canal que celui créé côté JS par expo-notifications (« Fin de série ») : un seul réglage dans les paramètres du téléphone. */
  const val CHANNEL_DONE = "set-end"

  // distincts de l'identifiant 0 utilisé par expo-notifications
  const val ID_LIVE = 4242
  const val ID_DONE = 4243

  const val EXTRA_END_AT = "endAt"
  const val EXTRA_TITLE = "title"
  const val EXTRA_TEXT = "text"
  const val EXTRA_END_TITLE = "endTitle"
  const val EXTRA_END_TEXT = "endText"

  private const val REQUEST_ALARM = 1
  private const val REQUEST_OPEN = 2
  private const val REQUEST_DISMISS = 3
  private val VIBRATION = longArrayOf(0, 500, 250, 500)

  // même couleur que le fond de marque (#5C2E8A)
  private val BRAND_COLOR: Int = 0xFF5C2E8A.toInt()

  /**
   * Canaux : le compte à rebours est silencieux (ni son ni vibration) mais d'importance « par défaut », pas « basse » : ainsi il
   * apparaît tout en haut du volet de notifications, avec son icône dans la barre d'état, et reste sur l'écran verrouillé même si
   * l'utilisateur a masqué les notifications silencieuses. La fin de série est insistante (bandeau, son, vibration).
   */
  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_LIVE) == null) {
      val live = NotificationChannel(CHANNEL_LIVE, "Chrono en cours", NotificationManager.IMPORTANCE_DEFAULT)
      live.description = "Affiche le temps restant de la série pendant le décompte"
      live.setShowBadge(false)
      live.enableVibration(false)
      live.setSound(null, null)
      live.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      manager.createNotificationChannel(live)
    }
    if (manager.getNotificationChannel(CHANNEL_DONE) == null) {
      val done = NotificationChannel(CHANNEL_DONE, "Fin de série", NotificationManager.IMPORTANCE_HIGH)
      done.description = "Prévient quand le chrono d’une série arrive à 00:00"
      done.setShowBadge(false)
      done.enableVibration(true)
      done.vibrationPattern = VIBRATION
      done.setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      done.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      manager.createNotificationChannel(done)
    }
  }

  private fun smallIcon(context: Context): Int =
    // même icône que les autres notifications de l'app (générée par le plugin expo-notifications)
    context.resources.getIdentifier("notification_icon", "drawable", context.packageName).takeIf { it != 0 }
      ?: context.applicationInfo.icon.takeIf { it != 0 }
      ?: android.R.drawable.ic_dialog_info

  /** Toucher une notification rouvre l'app. */
  fun openIntent(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    return PendingIntent.getActivity(context, REQUEST_OPEN, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  /**
   * Notification « compte à rebours » : `when` = heure de fin, chronomètre à rebours animé par le système (aucun code de l'app
   * ne tourne), persistante (`ongoing`). `timeout` : retirée toute seule à l'heure de fin (pour la version sans service).
   */
  fun buildLive(context: Context, endAt: Long, title: String, text: String, timeout: Boolean): Notification {
    ensureChannels(context)
    val builder = NotificationCompat.Builder(context, CHANNEL_LIVE)
      .setSmallIcon(smallIcon(context))
      .setColor(BRAND_COLOR)
      .setContentTitle(title)
      .setContentText(text)
      .setWhen(endAt)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      // Android 12+ retarde de 10 s l'affichage d'une notification de service au premier plan, sauf si on le demande
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      // Si l'utilisateur la balaie (Android 14+ le permet même pour un service), elle est republiée tant que la série dure.
      .setDeleteIntent(
        PendingIntent.getBroadcast(
          context, REQUEST_DISMISS, Intent(context, LiveDismissReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      )
      // Android 16 « Live Updates » : le temps restant s'affiche aussi dans la barre d'état et en tête de l'écran verrouillé
      // (sans effet sur les versions précédentes).
      .addExtras(Bundle().apply { putBoolean("android.requestPromotedOngoing", true) })
    val remaining = endAt - System.currentTimeMillis()
    if (timeout && remaining > 0) builder.setTimeoutAfter(remaining)
    openIntent(context)?.let { builder.setContentIntent(it) }
    return builder.build()
  }

  /** Version sans service (si Android refuse d'en démarrer un) : la même notification, affichée directement. */
  @SuppressLint("MissingPermission")
  fun notifyLive(context: Context, endAt: Long, title: String, text: String) {
    NotificationManagerCompat.from(context).notify(ID_LIVE, buildLive(context, endAt, title, text, timeout = true))
  }

  /**
   * Notification de fin de série : une notification ordinaire (bandeau, son de notification et vibration du téléphone), pas une sonnerie
   * de réveil. Pas de catégorie « alarme » : le mode Ne pas déranger la fait taire comme les autres. Elle est relayée sur les montres
   * connectées (Wear OS, Galaxy Watch, Garmin…) comme toute notification : on ne la garde surtout pas « locale ».
   */
  @SuppressLint("MissingPermission")
  fun postDone(context: Context, title: String, text: String) {
    ensureChannels(context)
    val builder = NotificationCompat.Builder(context, CHANNEL_DONE)
      .setSmallIcon(smallIcon(context))
      .setColor(BRAND_COLOR)
      .setContentTitle(title)
      .setContentText(text)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setLocalOnly(false)
      .setAutoCancel(true)
      // avant Android 8, le son et la vibration se règlent ici ; ensuite c'est le canal qui décide
      .setDefaults(NotificationCompat.DEFAULT_SOUND)
      .setVibrate(VIBRATION)
    openIntent(context)?.let { builder.setContentIntent(it) }
    NotificationManagerCompat.from(context).notify(ID_DONE, builder.build())
  }

  fun cancelLive(context: Context) = NotificationManagerCompat.from(context).cancel(ID_LIVE)

  fun cancelDone(context: Context) = NotificationManagerCompat.from(context).cancel(ID_DONE)

  private fun alarmIntent(context: Context): Intent = Intent(context, EndReceiver::class.java)

  /**
   * Programme le réveil du téléphone à l'heure de fin de série (minuterie du système, invisible : ce n'est PAS une alarme de réveil,
   * aucune icône d'alarme ni sonnerie). Exacte si le téléphone l'autorise (USE_EXACT_ALARM est accordée à l'installation),
   * sinon la plus précise possible. Renvoie false si rien n'a pu être programmé.
   */
  fun arm(context: Context, endAt: Long, endTitle: String, endText: String): Boolean {
    val manager = context.getSystemService(AlarmManager::class.java) ?: return false
    val intent = alarmIntent(context).putExtra(EXTRA_END_TITLE, endTitle).putExtra(EXTRA_END_TEXT, endText)
    val operation = PendingIntent.getBroadcast(context, REQUEST_ALARM, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    return try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()) {
        manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAt, operation)
      } else {
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAt, operation)
      }
      true
    } catch (e: SecurityException) {
      try {
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAt, operation)
        true
      } catch (e2: Exception) {
        false
      }
    }
  }

  fun cancelAlarm(context: Context) {
    val manager = context.getSystemService(AlarmManager::class.java) ?: return
    val existing = PendingIntent.getBroadcast(context, REQUEST_ALARM, alarmIntent(context), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
    if (existing != null) {
      manager.cancel(existing)
      existing.cancel()
    }
  }
}

/** Série en cours (mémorisée pour republier le compte à rebours si l'utilisateur le balaie, même si l'app n'est plus en mémoire). */
internal object TimerState {
  private const val PREFS = "binkam_live_timer"

  class Running(val endAt: Long, val title: String, val text: String)

  fun save(context: Context, endAt: Long, title: String, text: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putLong(TimerNotifications.EXTRA_END_AT, endAt)
      .putString(TimerNotifications.EXTRA_TITLE, title)
      .putString(TimerNotifications.EXTRA_TEXT, text)
      .apply()
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }

  fun read(context: Context): Running? {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val endAt = prefs.getLong(TimerNotifications.EXTRA_END_AT, 0L)
    if (endAt <= 0L) return null
    return Running(endAt, prefs.getString(TimerNotifications.EXTRA_TITLE, null) ?: "Binkām", prefs.getString(TimerNotifications.EXTRA_TEXT, null) ?: "Chrono en cours")
  }
}
