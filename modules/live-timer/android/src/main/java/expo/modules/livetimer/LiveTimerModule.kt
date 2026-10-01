package expo.modules.livetimer

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Notification « chrono en direct » : un compte à rebours affiché par le système lui-même dans la barre de notifications
 * (`setUsesChronometer` + `setChronometerCountDown`, `when` = heure de fin). Le téléphone fait défiler le temps sans que l'app
 * ait besoin de tourner : ça marche en arrière-plan, écran verrouillé et même si le système ferme l'app. Elle est retirée toute seule
 * à l'heure de fin (`setTimeoutAfter`). La notification sonore de fin de série reste celle d'`expo-notifications`.
 * Aucune permission de plus : seulement l'autorisation de notifier (POST_NOTIFICATIONS), déjà demandée par l'app.
 */
class LiveTimerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LiveTimer")

    // endAt : heure de fin en millisecondes (epoch). Renvoie true si la notification est affichée.
    Function("show") { endAt: Double, title: String, text: String ->
      show(endAt.toLong(), title, text)
    }

    Function("hide") {
      hide()
    }
  }

  private val applicationContext: Context?
    get() = appContext.reactContext?.applicationContext

  @SuppressLint("MissingPermission")
  private fun show(endAt: Long, title: String, text: String): Boolean {
    return try {
      val context = applicationContext ?: return false
      val manager = NotificationManagerCompat.from(context)
      val remaining = endAt - System.currentTimeMillis()
      if (remaining <= 0 || !manager.areNotificationsEnabled()) {
        manager.cancel(NOTIFICATION_ID)
        return false
      }
      ensureChannel(context)

      // Même icône que les autres notifications de l'app (générée par le plugin expo-notifications).
      val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
        .takeIf { it != 0 }
        ?: context.applicationInfo.icon.takeIf { it != 0 }
        ?: android.R.drawable.ic_dialog_info

      val builder = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(icon)
        .setColor(BRAND_COLOR)
        .setContentTitle(title)
        .setContentText(text)
        .setWhen(endAt)
        .setShowWhen(true)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setTimeoutAfter(remaining)

      // Toucher la notification rouvre l'app.
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
        builder.setContentIntent(
          PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        )
      }

      manager.notify(NOTIFICATION_ID, builder.build())
      true
    } catch (e: Exception) {
      false
    }
  }

  private fun hide() {
    try {
      val context = applicationContext ?: return
      NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    } catch (e: Exception) {
      // rien à faire : au pire la notification disparaît à son heure de fin
    }
  }

  /** Canal discret (pas de son, pas de vibration, pas de bandeau) : le compte à rebours ne doit jamais déranger. */
  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Chrono en cours", NotificationManager.IMPORTANCE_LOW)
    channel.description = "Affiche le temps restant de la série pendant le décompte"
    channel.setShowBadge(false)
    channel.enableVibration(false)
    channel.setSound(null, null)
    channel.lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
    manager.createNotificationChannel(channel)
  }

  private companion object {
    const val CHANNEL_ID = "set-live"
    // distinct de l'identifiant 0 utilisé par expo-notifications
    const val NOTIFICATION_ID = 4242
    // même couleur que le fond de marque (#5C2E8A)
    val BRAND_COLOR: Int = 0xFF5C2E8A.toInt()
  }
}
