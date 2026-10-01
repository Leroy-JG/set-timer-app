package expo.modules.livetimer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

/**
 * L'utilisateur a balayé le compte à rebours (Android 14+ le permet même pour un service au premier plan). Si la série n'est pas finie,
 * on le remet : c'est la notification qu'il veut retrouver en tirant le volet ou en rallumant l'écran verrouillé.
 */
class LiveDismissReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    try {
      val running = TimerState.read(context) ?: return
      if (running.endAt - System.currentTimeMillis() < 1500) return
      try {
        // le service republie sa notification de premier plan
        ContextCompat.startForegroundService(
          context,
          Intent(context, TimerService::class.java)
            .putExtra(TimerNotifications.EXTRA_END_AT, running.endAt)
            .putExtra(TimerNotifications.EXTRA_TITLE, running.title)
            .putExtra(TimerNotifications.EXTRA_TEXT, running.text)
        )
      } catch (e: Exception) {
        TimerNotifications.notifyLive(context, running.endAt, running.title, running.text)
      }
    } catch (e: Exception) {
      // rien d'autre à tenter
    }
  }
}
