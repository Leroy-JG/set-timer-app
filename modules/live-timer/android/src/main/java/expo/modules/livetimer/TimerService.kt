package expo.modules.livetimer

import android.app.Notification
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/**
 * Service au premier plan pendant une série : sa notification est le compte à rebours (persistante, impossible à perdre de vue)
 * et, tant qu'il tourne, Android ne ferme pas l'app en arrière-plan. L'alarme de fin ne dépend pas de lui (voir [TimerNotifications.arm]).
 */
class TimerService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val safetyStop = Runnable { shutDown() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val endAt = intent?.getLongExtra(TimerNotifications.EXTRA_END_AT, 0L) ?: 0L
    val title = intent?.getStringExtra(TimerNotifications.EXTRA_TITLE) ?: "Binkām"
    val text = intent?.getStringExtra(TimerNotifications.EXTRA_TEXT) ?: "Chrono en cours"

    // Obligatoire dans les secondes qui suivent startForegroundService, même si on s'arrête juste après.
    val notification: Notification = TimerNotifications.buildLive(this, endAt, title, text, timeout = false)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(TimerNotifications.ID_LIVE, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(TimerNotifications.ID_LIVE, notification)
      }
    } catch (e: Exception) {
      // Android refuse le service : on garde au moins la notification simple, l'alarme de fin reste armée.
      try {
        TimerNotifications.notifyLive(this, endAt, title, text)
      } catch (e2: Exception) {
        // ignoré
      }
      stopSelf()
      return START_NOT_STICKY
    }

    handler.removeCallbacks(safetyStop)
    val remaining = endAt - System.currentTimeMillis()
    if (remaining <= 0) {
      shutDown()
    } else {
      // Sécurité : si l'alarme n'a pas arrêté le service peu après l'heure de fin, il s'arrête seul.
      handler.postDelayed(safetyStop, remaining + SAFETY_MARGIN_MS)
    }
    return START_NOT_STICKY
  }

  private fun shutDown() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    handler.removeCallbacks(safetyStop)
    super.onDestroy()
  }

  private companion object {
    const val SAFETY_MARGIN_MS = 15_000L
  }
}
