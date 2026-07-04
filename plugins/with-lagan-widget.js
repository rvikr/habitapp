const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");

const { getMainApplicationOrThrow } = AndroidConfig.Manifest;

const APPWIDGET_UPDATE_ACTION = "android.appwidget.action.APPWIDGET_UPDATE";
const WIDGET_PROVIDER = ".LaganWidgetProvider";
const WIDGET_INFO_RESOURCE = "@xml/lagan_widget_info";

function ensureArray(parent, key) {
  if (!Array.isArray(parent[key])) parent[key] = [];
  return parent[key];
}

function upsertWidgetReceiver(mainApplication) {
  const receivers = ensureArray(mainApplication, "receiver");
  const nextReceivers = receivers.filter(
    (receiver) => receiver.$?.["android:name"] !== WIDGET_PROVIDER,
  );

  nextReceivers.push({
    $: {
      "android:name": WIDGET_PROVIDER,
      "android:exported": "false",
    },
    "intent-filter": [
      {
        action: [{ $: { "android:name": APPWIDGET_UPDATE_ACTION } }],
      },
    ],
    "meta-data": [
      {
        $: {
          "android:name": "android.appwidget.provider",
          "android:resource": WIDGET_INFO_RESOURCE,
        },
      },
    ],
  });

  mainApplication.receiver = nextReceivers;
}

function buildProviderSource(packageName) {
  return `package ${packageName}

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

class LaganWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    appWidgetIds.forEach { widgetId ->
      updateWidget(context, appWidgetManager, widgetId)
    }
  }

  companion object {
    private const val PREFS_NAME = "lagan_widget"
    private const val SNAPSHOT_KEY = "snapshot_json"

    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, LaganWidgetProvider::class.java)
      manager.getAppWidgetIds(component).forEach { widgetId ->
        updateWidget(context, manager, widgetId)
      }
    }

    private fun updateWidget(
      context: Context,
      manager: AppWidgetManager,
      widgetId: Int,
    ) {
      val snapshot = readSnapshot(context)
      val views = RemoteViews(context.packageName, R.layout.lagan_widget).apply {
        setTextViewText(R.id.lagan_widget_title, snapshot.title)
        setTextViewText(R.id.lagan_widget_completion, snapshot.completionLabel)
        setTextViewText(R.id.lagan_widget_next_habit, snapshot.nextHabitLabel)
        setViewVisibility(
          R.id.lagan_widget_next_habit,
          if (snapshot.nextHabitLabel.isBlank()) View.GONE else View.VISIBLE,
        )
        setTextViewText(R.id.lagan_widget_coach, snapshot.coachLabel)
        setViewVisibility(
          R.id.lagan_widget_coach,
          if (snapshot.coachLabel.isBlank()) View.GONE else View.VISIBLE,
        )
        setTextViewText(R.id.lagan_widget_progress_text, "\${snapshot.progressPercent}%")
        setTextViewText(R.id.lagan_widget_streak, snapshot.streakLabel)
        setTextViewText(R.id.lagan_widget_level, snapshot.levelLabel)
        setTextViewText(R.id.lagan_widget_updated, snapshot.updatedLabel)
        setProgressBar(R.id.lagan_widget_progress, 100, snapshot.progressPercent, false)
        setOnClickPendingIntent(R.id.lagan_widget_root, openAppPendingIntent(context))
      }
      manager.updateAppWidget(widgetId, views)
    }

    private fun readSnapshot(context: Context): WidgetSnapshot {
      val payload = context
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(SNAPSHOT_KEY, null)
        ?: return WidgetSnapshot.empty()

      return try {
        val json = JSONObject(payload)
        WidgetSnapshot(
          title = text(json, "title", "Today"),
          completionLabel = text(json, "completionLabel", "Open Lagan to start"),
          // Blank means "hide the line" — do not fall back like text() does.
          nextHabitLabel = json.optString("nextHabitLabel", ""),
          coachLabel = json.optString("coachLabel", ""),
          progressPercent = json.optInt("progressPercent", 0).coerceIn(0, 100),
          streakLabel = text(json, "streakLabel", "Sign in to sync"),
          levelLabel = text(json, "levelLabel", "Lagan"),
          updatedLabel = text(json, "updatedLabel", ""),
        )
      } catch (_: Exception) {
        WidgetSnapshot.empty()
      }
    }

    private fun text(json: JSONObject, key: String, fallback: String): String {
      val value = json.optString(key, fallback)
      return if (value.isBlank()) fallback else value
    }

    private fun openAppPendingIntent(context: Context): PendingIntent {
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent(Intent.ACTION_VIEW, Uri.parse("lagan://")).setPackage(context.packageName)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

      return PendingIntent.getActivity(
        context,
        0,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
  }
}

private data class WidgetSnapshot(
  val title: String,
  val completionLabel: String,
  val nextHabitLabel: String,
  val coachLabel: String,
  val progressPercent: Int,
  val streakLabel: String,
  val levelLabel: String,
  val updatedLabel: String,
) {
  companion object {
    fun empty() = WidgetSnapshot(
      title = "Today",
      completionLabel = "Open Lagan to start",
      nextHabitLabel = "",
      coachLabel = "",
      progressPercent = 0,
      streakLabel = "Sign in to sync",
      levelLabel = "Lagan",
      updatedLabel = "",
    )
  }
}
`;
}

const WIDGET_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/lagan_widget_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:orientation="vertical"
  android:padding="16dp"
  android:background="@drawable/lagan_widget_background">

  <TextView
    android:id="@+id/lagan_widget_title"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:text="Today"
    android:textColor="#3A2418"
    android:textSize="14sp"
    android:textStyle="bold" />

  <TextView
    android:id="@+id/lagan_widget_completion"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="6dp"
    android:text="Open Lagan to start"
    android:textColor="#1F1A17"
    android:textSize="18sp"
    android:textStyle="bold"
    android:maxLines="2" />

  <TextView
    android:id="@+id/lagan_widget_next_habit"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="4dp"
    android:text=""
    android:textColor="#3A2418"
    android:textSize="13sp"
    android:textStyle="bold"
    android:maxLines="1"
    android:ellipsize="end"
    android:visibility="gone" />

  <TextView
    android:id="@+id/lagan_widget_coach"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="4dp"
    android:text=""
    android:textColor="#5B5049"
    android:textSize="11sp"
    android:maxLines="2"
    android:ellipsize="end"
    android:visibility="gone" />

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="12dp"
    android:gravity="center_vertical"
    android:orientation="horizontal">

    <ProgressBar
      android:id="@+id/lagan_widget_progress"
      style="?android:attr/progressBarStyleHorizontal"
      android:layout_width="0dp"
      android:layout_height="8dp"
      android:layout_weight="1"
      android:max="100"
      android:progress="0"
      android:progressTint="#F26B1F"
      android:progressBackgroundTint="#F5D7BE" />

    <TextView
      android:id="@+id/lagan_widget_progress_text"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginStart="8dp"
      android:text="0%"
      android:textColor="#3A2418"
      android:textSize="12sp"
      android:textStyle="bold" />
  </LinearLayout>

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="12dp"
    android:orientation="horizontal">

    <TextView
      android:id="@+id/lagan_widget_streak"
      android:layout_width="0dp"
      android:layout_height="wrap_content"
      android:layout_weight="1"
      android:text="Sign in to sync"
      android:textColor="#5B5049"
      android:textSize="12sp"
      android:maxLines="1" />

    <TextView
      android:id="@+id/lagan_widget_level"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:text="Lagan"
      android:textColor="#5B5049"
      android:textSize="12sp"
      android:textStyle="bold"
      android:maxLines="1" />
  </LinearLayout>

  <TextView
    android:id="@+id/lagan_widget_updated"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="6dp"
    android:text=""
    android:textColor="#7B6C62"
    android:textSize="10sp"
    android:maxLines="1" />
</LinearLayout>
`;

const WIDGET_BACKGROUND_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="#FFF8F2" />
  <corners android:radius="20dp" />
</shape>
`;

const WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="160dp"
  android:minHeight="140dp"
  android:minResizeWidth="140dp"
  android:minResizeHeight="120dp"
  android:updatePeriodMillis="1800000"
  android:initialLayout="@layout/lagan_widget"
  android:resizeMode="horizontal|vertical"
  android:widgetCategory="home_screen"
  android:description="@string/lagan_widget_description" />
`;

const WIDGET_STRINGS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="lagan_widget_description">Today habit progress</string>
</resources>
`;

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

const withLaganWidget = (config) => {
  config = withAndroidManifest(config, (config) => {
    const mainApplication = getMainApplicationOrThrow(config.modResults);
    upsertWidgetReceiver(mainApplication);
    return config;
  });

  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const packageName = config.android?.package;
      if (!packageName) {
        throw new Error("android.package is required for LaganWidgetProvider");
      }

      const androidRoot = config.modRequest.platformProjectRoot;
      const packageDir = path.join(
        androidRoot,
        "app",
        "src",
        "main",
        "java",
        ...packageName.split("."),
      );
      const resRoot = path.join(androidRoot, "app", "src", "main", "res");

      writeFile(path.join(packageDir, "LaganWidgetProvider.kt"), buildProviderSource(packageName));
      writeFile(path.join(resRoot, "layout", "lagan_widget.xml"), WIDGET_LAYOUT_XML);
      writeFile(
        path.join(resRoot, "drawable", "lagan_widget_background.xml"),
        WIDGET_BACKGROUND_XML,
      );
      writeFile(path.join(resRoot, "xml", "lagan_widget_info.xml"), WIDGET_INFO_XML);
      writeFile(path.join(resRoot, "values", "lagan_widget_strings.xml"), WIDGET_STRINGS_XML);

      return config;
    },
  ]);

  return config;
};

module.exports = createRunOncePlugin(withLaganWidget, "with-lagan-widget", "1.1.0");
