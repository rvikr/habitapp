package health.lagan.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LaganWidgetModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("LaganWidget")

    AsyncFunction("updateAsync") { snapshotJson: String ->
      context
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(SNAPSHOT_KEY, snapshotJson)
        .apply()

      notifyWidgets()
    }

    AsyncFunction("clearAsync") {
      context
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .remove(SNAPSHOT_KEY)
        .apply()

      notifyWidgets()
    }
  }

  private fun notifyWidgets() {
    val provider = ComponentName(context.packageName, "${context.packageName}.LaganWidgetProvider")
    val widgetIds = AppWidgetManager.getInstance(context).getAppWidgetIds(provider)
    val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
      component = provider
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgetIds)
    }
    context.sendBroadcast(intent)
  }

  companion object {
    private const val PREFS_NAME = "lagan_widget"
    private const val SNAPSHOT_KEY = "snapshot_json"
  }
}
