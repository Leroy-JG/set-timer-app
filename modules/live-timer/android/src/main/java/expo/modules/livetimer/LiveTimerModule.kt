package expo.modules.livetimer

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Pont avec le JS : une série = une alarme de fin (notification bandeau + son + vibration, même app fermée) et un compte à rebours
 * persistant dans la barre de notifications (service au premier plan). Toutes les fonctions sont sans danger : en cas de problème
 * elles renvoient false / ne font rien, et le JS retombe sur la notification programmée d'expo-notifications.
 * Permissions : seulement celles du manifeste de ce module (service au premier plan, exemption d'économie de batterie, sans Internet).
 */
class LiveTimerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LiveTimer")

    // endAt : heure de fin en millisecondes (epoch). Renvoie true si l'alarme de fin est armée.
    Function("start") { endAt: Double, title: String, text: String, endTitle: String, endText: String ->
      start(endAt.toLong(), title, text, endTitle, endText)
    }

    Function("stop") {
      stop()
    }

    // true si le téléphone laisse l'app tourner en arrière-plan sans restriction de batterie (ou si on ne sait pas).
    Function("isBackgroundUnrestricted") {
      isBackgroundUnrestricted()
    }

    // Ouvre la fenêtre du système « Autoriser l'app à rester active en arrière-plan ? ».
    Function("requestBackgroundUnrestricted") {
      requestBackgroundUnrestricted()
    }
  }

  private val applicationContext: Context?
    get() = appContext.reactContext?.applicationContext

  private fun start(endAt: Long, title: String, text: String, endTitle: String, endText: String): Boolean {
    return try {
      val context = applicationContext ?: return false
      if (endAt - System.currentTimeMillis() <= 0 || !NotificationManagerCompat.from(context).areNotificationsEnabled()) return false

      TimerNotifications.cancelDone(context) // la notification de fin de la série précédente
      // 1) l'alarme de fin : c'est elle qui prévient, quoi qu'il arrive à l'app
      if (!TimerNotifications.arm(context, endAt, endTitle, endText)) return false
      TimerState.save(context, endAt, title, text)
      // 2) le compte à rebours persistant (service au premier plan ; à défaut, notification simple)
      val intent = Intent(context, TimerService::class.java)
        .putExtra(TimerNotifications.EXTRA_END_AT, endAt)
        .putExtra(TimerNotifications.EXTRA_TITLE, title)
        .putExtra(TimerNotifications.EXTRA_TEXT, text)
      try {
        ContextCompat.startForegroundService(context, intent)
      } catch (e: Exception) {
        TimerNotifications.notifyLive(context, endAt, title, text)
      }
      true
    } catch (e: Exception) {
      false
    }
  }

  /** Série arrêtée avant l'heure (appui sur le chrono, réglage modifié, bouton coupé) : plus d'alarme ni de compte à rebours. */
  private fun stop() {
    try {
      val context = applicationContext ?: return
      TimerState.clear(context)
      TimerNotifications.cancelAlarm(context)
      context.stopService(Intent(context, TimerService::class.java))
      TimerNotifications.cancelLive(context)
    } catch (e: Exception) {
      // ignoré
    }
  }

  private fun isBackgroundUnrestricted(): Boolean {
    return try {
      val context = applicationContext ?: return true
      context.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(context.packageName) ?: true
    } catch (e: Exception) {
      true
    }
  }

  @SuppressLint("BatteryLife")
  private fun requestBackgroundUnrestricted() {
    val context = applicationContext ?: return
    try {
      val request = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + context.packageName))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(request)
    } catch (e: Exception) {
      try {
        // à défaut, la liste des réglages de batterie
        context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (e2: Exception) {
        // ignoré
      }
    }
  }
}
