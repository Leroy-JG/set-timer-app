package expo.modules.livetimer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Reçoit l'alarme de fin de série (même si l'app n'est plus en mémoire) : affiche la notification de fin, puis arrête le compte à rebours.
 */
class EndReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val title = intent?.getStringExtra(TimerNotifications.EXTRA_END_TITLE) ?: "Binkām"
    val text = intent?.getStringExtra(TimerNotifications.EXTRA_END_TEXT) ?: "Série terminée."
    try {
      TimerNotifications.postDone(context, title, text)
    } catch (e: Exception) {
      // rien d'autre à tenter : l'app vibre et sonne de son côté si elle est ouverte
    }
    try {
      context.stopService(Intent(context, TimerService::class.java))
      TimerNotifications.cancelLive(context)
    } catch (e: Exception) {
      // le compte à rebours disparaît de toute façon à l'arrêt du service
    }
  }
}
