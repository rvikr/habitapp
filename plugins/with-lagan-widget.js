const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require("@expo/config-plugins");

const { getMainApplicationOrThrow } = AndroidConfig.Manifest;

const APPWIDGET_UPDATE_ACTION = "android.appwidget.action.APPWIDGET_UPDATE";
const WIDGET_PROVIDER = ".LaganWidgetProvider";
const WIDGET_INFO_RESOURCE = "@xml/lagan_widget_info";
const TREND_DAYS = 7;
const IOS_WIDGET_TARGET = "LaganWidgetExtension";
const IOS_WIDGET_BUNDLE_ID = "health.lagan.app.widget";
const IOS_APP_GROUP = "group.health.lagan.app";
const IOS_KEYCHAIN_GROUP = "$(AppIdentifierPrefix)health.lagan.widget.shared";

const IOS_WIDGET_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key><string>Lagan</string>
  <key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key><string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
  <key>LaganAppIdentifierPrefix</key><string>$(AppIdentifierPrefix)</string>
  <key>NSExtension</key><dict>
    <key>NSExtensionPointIdentifier</key><string>com.apple.widgetkit-extension</string>
  </dict>
</dict></plist>
`;

const IOS_WIDGET_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.application-groups</key><array><string>${IOS_APP_GROUP}</string></array>
  <key>keychain-access-groups</key><array><string>${IOS_KEYCHAIN_GROUP}</string></array>
  <key>com.apple.developer.healthkit</key><true/>
</dict></plist>
`;

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

function kotlinIdList(prefix) {
  return Array.from({ length: TREND_DAYS }, (_, index) => `R.id.${prefix}${index}`).join(
    ",\n      ",
  );
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
import health.lagan.widget.WidgetActionScheduler
import java.util.Calendar
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

class LaganWidgetProvider : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_CHECK_IN) {
      val habitId = intent.getStringExtra(EXTRA_HABIT_ID) ?: return
      WidgetActionScheduler.enqueueCheckIn(context, habitId, intent.getStringExtra(EXTRA_HABIT_NAME))
      updateAll(context)
    }
  }

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
    private const val CHECK_IN_URL_PREFIX = "lagan://widget/check-in?"
    private const val UPCOMING_LIMIT = 15
    private const val ACTION_CHECK_IN = "health.lagan.widget.CHECK_IN"
    private const val EXTRA_HABIT_ID = "habit_id"
    private const val EXTRA_HABIT_NAME = "habit_name"

    // Zero-padded "HH:MM"; anything else in an upcoming entry means "no time".
    private val TIME_REGEX = Regex("""\\d{2}:\\d{2}""")

    private val TREND_DOT_IDS = intArrayOf(
      ${kotlinIdList("lagan_widget_trend_dot_")},
    )
    private val TREND_LETTER_IDS = intArrayOf(
      ${kotlinIdList("lagan_widget_trend_letter_")},
    )

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
      val now = Calendar.getInstance()
      val nowDateKey = String.format(
        Locale.US,
        "%04d-%02d-%02d",
        now.get(Calendar.YEAR),
        now.get(Calendar.MONTH) + 1,
        now.get(Calendar.DAY_OF_MONTH),
      )
      val nowHHMM = String.format(
        Locale.US,
        "%02d:%02d",
        now.get(Calendar.HOUR_OF_DAY),
        now.get(Calendar.MINUTE),
      )
      // Day rollover: a snapshot written on an earlier day must not present
      // yesterday's progress (or a stale deep link) as today's.
      val isStale = snapshot.todayKey != null && snapshot.todayKey != nowDateKey

      val views = RemoteViews(context.packageName, R.layout.lagan_widget).apply {
        setTextViewText(R.id.lagan_widget_title, snapshot.title)
        setTextViewText(R.id.lagan_widget_level, snapshot.levelLabel)
        setTextViewText(R.id.lagan_widget_updated, snapshot.updatedLabel)
        setOnClickPendingIntent(R.id.lagan_widget_root, openAppPendingIntent(context))
        if (isStale) {
          bindStaleDay(this, context, snapshot)
        } else {
          bindToday(this, context, snapshot, nowHHMM)
        }
      }
      manager.updateAppWidget(widgetId, views)
    }

    private fun bindStaleDay(views: RemoteViews, context: Context, snapshot: WidgetSnapshot) {
      views.apply {
        setTextViewText(R.id.lagan_widget_completion, snapshot.staleLabels.completionLabel)
        setViewVisibility(R.id.lagan_widget_next_habit, View.GONE)
        setViewVisibility(R.id.lagan_widget_coach, View.GONE)
        // The trend row would claim yesterday's last dot is "today" — hide it.
        setViewVisibility(R.id.lagan_widget_trend_row, View.GONE)
        setTextViewText(R.id.lagan_widget_progress_text, "0%")
        setProgressBar(R.id.lagan_widget_progress, 100, 0, false)
        setTextViewText(R.id.lagan_widget_streak, snapshot.staleLabels.streakLabel)
        setViewVisibility(R.id.lagan_widget_steps, View.GONE)
        setViewVisibility(R.id.lagan_widget_rank, View.GONE)
        setViewVisibility(R.id.lagan_widget_action_status, View.GONE)
        setTextViewText(R.id.lagan_widget_check_in, snapshot.staleLabels.checkInLabel)
        setOnClickPendingIntent(R.id.lagan_widget_check_in, openAppPendingIntent(context))
      }
    }

    private fun bindToday(
      views: RemoteViews,
      context: Context,
      snapshot: WidgetSnapshot,
      nowHHMM: String,
    ) {
      // Advance the "Next:" line as reminder times pass; fall back to the
      // labels synced by the app when the snapshot predates schema v2.
      val selected = selectNext(snapshot.upcoming, nowHHMM)
      val nextHabitLabel = selected?.label ?: snapshot.nextHabitLabel
      val checkInLabel = if (selected != null) selected.checkInLabel else snapshot.checkInLabel
      val checkInUrl = if (selected != null) selected.checkInUrl else snapshot.checkInUrl
      val checkInHabitName = selected?.name

      views.apply {
        setTextViewText(R.id.lagan_widget_completion, snapshot.completionLabel)
        setTextViewText(R.id.lagan_widget_next_habit, nextHabitLabel)
        setViewVisibility(
          R.id.lagan_widget_next_habit,
          if (nextHabitLabel.isBlank()) View.GONE else View.VISIBLE,
        )
        setTextViewText(R.id.lagan_widget_coach, snapshot.coachLabel)
        setViewVisibility(
          R.id.lagan_widget_coach,
          if (snapshot.coachLabel.isBlank()) View.GONE else View.VISIBLE,
        )
        if (snapshot.trend.size == TREND_DOT_IDS.size) {
          setViewVisibility(R.id.lagan_widget_trend_row, View.VISIBLE)
          snapshot.trend.forEachIndexed { index, day ->
            setTextViewText(TREND_LETTER_IDS[index], day.letter)
            setImageViewResource(
              TREND_DOT_IDS[index],
              when (day.state) {
                "full" -> R.drawable.lagan_widget_dot_full
                "partial" -> R.drawable.lagan_widget_dot_partial
                else -> R.drawable.lagan_widget_dot_empty
              },
            )
          }
        } else {
          // v1 snapshots (or missing trend data) simply hide the row.
          setViewVisibility(R.id.lagan_widget_trend_row, View.GONE)
        }
        setTextViewText(R.id.lagan_widget_progress_text, "\${snapshot.progressPercent}%")
        setProgressBar(R.id.lagan_widget_progress, 100, snapshot.progressPercent, false)
        setTextViewText(R.id.lagan_widget_streak, snapshot.streakLabel)
        if (snapshot.stepsCount != null) {
          setTextViewText(R.id.lagan_widget_steps, String.format(Locale.US, "%,d steps today", snapshot.stepsCount))
          setViewVisibility(R.id.lagan_widget_steps, View.VISIBLE)
        } else {
          setViewVisibility(R.id.lagan_widget_steps, View.GONE)
        }
        when (snapshot.leaderboardStatus) {
          "ranked" -> {
            setTextViewText(R.id.lagan_widget_rank, "All-time rank #" + snapshot.leaderboardRank)
            setViewVisibility(R.id.lagan_widget_rank, View.VISIBLE)
          }
          "not_joined" -> {
            setTextViewText(R.id.lagan_widget_rank, "Join leaderboard in Lagan")
            setViewVisibility(R.id.lagan_widget_rank, View.VISIBLE)
          }
          else -> setViewVisibility(R.id.lagan_widget_rank, View.GONE)
        }
        setTextViewText(R.id.lagan_widget_action_status, snapshot.actionMessage)
        setViewVisibility(
          R.id.lagan_widget_action_status,
          if (snapshot.actionMessage.isNullOrBlank()) View.GONE else View.VISIBLE,
        )
        setTextViewText(R.id.lagan_widget_check_in, checkInLabel)
        setOnClickPendingIntent(
          R.id.lagan_widget_check_in,
          checkInPendingIntent(context, checkInUrl, checkInHabitName),
        )
      }
    }

    // Mirrors selectNextUpcoming() in lib/widgets/widget-upcoming.ts — keep
    // both in sync. The coach-preferred habit wins until its time passes,
    // then the first future-timed habit, then the first untimed one; when
    // everything is past-due the first item stays "next" (app parity).
    private fun selectNext(upcoming: List<UpcomingHabit>, nowHHMM: String): UpcomingHabit? {
      if (upcoming.isEmpty()) return null
      upcoming.firstOrNull { it.preferred && (it.time == null || it.time >= nowHHMM) }
        ?.let { return it }
      return upcoming.firstOrNull { it.time != null && it.time >= nowHHMM }
        ?: upcoming.firstOrNull { it.time == null }
        ?: upcoming.first()
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
          checkInLabel = text(json, "checkInLabel", "Open Lagan"),
          checkInUrl = optionalText(json, "checkInUrl"),
          todayKey = optionalText(json, "todayKey"),
          stepsCount = json.optJSONObject("steps")
            ?.takeIf { it.optString("status") == "available" && it.has("count") }
            ?.optLong("count"),
          leaderboardStatus = json.optJSONObject("leaderboard")?.optString("status", "unavailable")
            ?: "unavailable",
          leaderboardRank = json.optJSONObject("leaderboard")?.optInt("rank", 0) ?: 0,
          actionMessage = optionalText(json.optJSONObject("lastAction") ?: JSONObject(), "message"),
          trend = parseTrend(json.optJSONArray("trend")),
          upcoming = parseUpcoming(json.optJSONArray("upcoming")),
          staleLabels = parseStaleLabels(json.optJSONObject("staleLabels")),
        )
      } catch (_: Exception) {
        WidgetSnapshot.empty()
      }
    }

    private fun parseTrend(array: JSONArray?): List<TrendDay> {
      if (array == null || array.length() != TREND_DOT_IDS.size) return emptyList()
      val days = mutableListOf<TrendDay>()
      for (index in 0 until array.length()) {
        val item = array.optJSONObject(index) ?: return emptyList()
        days.add(
          TrendDay(
            state = item.optString("state", "empty"),
            letter = item.optString("letter", ""),
          ),
        )
      }
      return days
    }

    private fun parseUpcoming(array: JSONArray?): List<UpcomingHabit> {
      if (array == null) return emptyList()
      val items = mutableListOf<UpcomingHabit>()
      for (index in 0 until array.length()) {
        if (items.size >= UPCOMING_LIMIT) break
        val item = array.optJSONObject(index) ?: continue
        val label = item.optString("label", "")
        if (label.isBlank() || label == "null") continue
        items.add(
          UpcomingHabit(
            id = item.optString("id", ""),
            name = item.optString("name", ""),
            label = label,
            time = optionalText(item, "time")?.takeIf { TIME_REGEX.matches(it) },
            checkInUrl = optionalText(item, "checkInUrl"),
            checkInLabel = text(item, "checkInLabel", "Open Lagan"),
            preferred = item.optBoolean("preferred", false),
          ),
        )
      }
      return items
    }

    private fun parseStaleLabels(json: JSONObject?): StaleLabels {
      if (json == null) return StaleLabels.defaults()
      return StaleLabels(
        completionLabel = text(json, "completionLabel", StaleLabels.DEFAULT_COMPLETION),
        streakLabel = text(json, "streakLabel", StaleLabels.DEFAULT_STREAK),
        checkInLabel = text(json, "checkInLabel", StaleLabels.DEFAULT_CHECK_IN),
      )
    }

    private fun text(json: JSONObject, key: String, fallback: String): String {
      val value = json.optString(key, fallback)
      return if (value.isBlank() || value == "null") fallback else value
    }

    // org.json renders JSON null as the string "null" — treat it as absent.
    private fun optionalText(json: JSONObject, key: String): String? {
      val value = json.optString(key, "")
      return value.takeIf { it.isNotBlank() && it != "null" }
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

    private fun checkInPendingIntent(
      context: Context,
      checkInUrl: String?,
      habitName: String?,
    ): PendingIntent {
      if (checkInUrl.isNullOrBlank() || !checkInUrl.startsWith(CHECK_IN_URL_PREFIX)) {
        return openAppPendingIntent(context)
      }

      val uri = try {
        Uri.parse(checkInUrl)
      } catch (_: Exception) {
        return openAppPendingIntent(context)
      }
      if (uri.scheme != "lagan" || uri.host != "widget" || uri.path != "/check-in") {
        return openAppPendingIntent(context)
      }

      val habitId = uri.getQueryParameter("habitId") ?: return openAppPendingIntent(context)
      if (WidgetActionScheduler.canRun(context)) {
        val intent = Intent(context, LaganWidgetProvider::class.java).apply {
          action = ACTION_CHECK_IN
          putExtra(EXTRA_HABIT_ID, habitId)
          putExtra(EXTRA_HABIT_NAME, habitName)
        }
        return PendingIntent.getBroadcast(
          context,
          checkInUrl.hashCode(),
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
      }

      val intent = Intent(Intent.ACTION_VIEW, uri).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      return PendingIntent.getActivity(
        context,
        checkInUrl.hashCode(),
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
  val checkInLabel: String,
  val checkInUrl: String?,
  val todayKey: String?,
  val stepsCount: Long?,
  val leaderboardStatus: String,
  val leaderboardRank: Int,
  val actionMessage: String?,
  val trend: List<TrendDay>,
  val upcoming: List<UpcomingHabit>,
  val staleLabels: StaleLabels,
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
      checkInLabel = "Open Lagan",
      checkInUrl = null,
      todayKey = null,
      stepsCount = null,
      leaderboardStatus = "unavailable",
      leaderboardRank = 0,
      actionMessage = null,
      trend = emptyList(),
      upcoming = emptyList(),
      staleLabels = StaleLabels.defaults(),
    )
  }
}

private data class TrendDay(
  val state: String,
  val letter: String,
)

private data class UpcomingHabit(
  val id: String,
  val name: String,
  val label: String,
  val time: String?,
  val checkInUrl: String?,
  val checkInLabel: String,
  val preferred: Boolean,
)

private data class StaleLabels(
  val completionLabel: String,
  val streakLabel: String,
  val checkInLabel: String,
) {
  companion object {
    const val DEFAULT_COMPLETION = "New day — open Lagan"
    const val DEFAULT_STREAK = "Open Lagan to keep your streak"
    const val DEFAULT_CHECK_IN = "Open Lagan"

    fun defaults() = StaleLabels(
      completionLabel = DEFAULT_COMPLETION,
      streakLabel = DEFAULT_STREAK,
      checkInLabel = DEFAULT_CHECK_IN,
    )
  }
}
`;
}

function trendCellXml(index) {
  return `    <LinearLayout
      android:layout_width="0dp"
      android:layout_height="wrap_content"
      android:layout_weight="1"
      android:gravity="center_horizontal"
      android:orientation="vertical">

      <TextView
        android:id="@+id/lagan_widget_trend_letter_${index}"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text=""
        android:textColor="@color/lagan_widget_muted"
        android:textSize="9sp"
        android:maxLines="1" />

      <ImageView
        android:id="@+id/lagan_widget_trend_dot_${index}"
        android:layout_width="10dp"
        android:layout_height="10dp"
        android:layout_marginTop="2dp"
        android:src="@drawable/lagan_widget_dot_empty"
        android:importantForAccessibility="no" />
    </LinearLayout>`;
}

const WIDGET_TREND_ROW_XML = `  <LinearLayout
    android:id="@+id/lagan_widget_trend_row"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="10dp"
    android:orientation="horizontal"
    android:visibility="gone">

${Array.from({ length: TREND_DAYS }, (_, index) => trendCellXml(index)).join("\n\n")}
  </LinearLayout>`;

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
    android:textColor="@color/lagan_widget_primary"
    android:textSize="14sp"
    android:textStyle="bold" />

  <TextView
    android:id="@+id/lagan_widget_completion"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="6dp"
    android:text="Open Lagan to start"
    android:textColor="@color/lagan_widget_primary"
    android:textSize="18sp"
    android:textStyle="bold"
    android:maxLines="2" />

  <TextView
    android:id="@+id/lagan_widget_next_habit"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="4dp"
    android:text=""
    android:textColor="@color/lagan_widget_primary"
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
    android:textColor="@color/lagan_widget_secondary"
    android:textSize="11sp"
    android:maxLines="2"
    android:ellipsize="end"
    android:visibility="gone" />

${WIDGET_TREND_ROW_XML}

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="8dp"
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
      android:textColor="@color/lagan_widget_primary"
      android:textSize="12sp"
      android:textStyle="bold" />
  </LinearLayout>

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="8dp"
    android:orientation="horizontal">

    <TextView
      android:id="@+id/lagan_widget_streak"
      android:layout_width="0dp"
      android:layout_height="wrap_content"
      android:layout_weight="1"
      android:text="Sign in to sync"
      android:textColor="@color/lagan_widget_secondary"
      android:textSize="12sp"
      android:maxLines="1" />

    <TextView
      android:id="@+id/lagan_widget_level"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:text="Lagan"
      android:textColor="@color/lagan_widget_secondary"
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
    android:textColor="@color/lagan_widget_muted"
    android:textSize="10sp"
    android:maxLines="1" />

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="4dp"
    android:orientation="horizontal">

    <TextView
      android:id="@+id/lagan_widget_steps"
      android:layout_width="0dp"
      android:layout_height="wrap_content"
      android:layout_weight="1"
      android:textColor="@color/lagan_widget_secondary"
      android:textSize="11sp"
      android:maxLines="1"
      android:visibility="gone" />

    <TextView
      android:id="@+id/lagan_widget_rank"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:textColor="@color/lagan_widget_secondary"
      android:textSize="11sp"
      android:maxLines="1"
      android:visibility="gone" />
  </LinearLayout>

  <TextView
    android:id="@+id/lagan_widget_action_status"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="4dp"
    android:textColor="@color/lagan_widget_success"
    android:textSize="11sp"
    android:textStyle="bold"
    android:maxLines="1"
    android:ellipsize="end"
    android:visibility="gone" />

  <TextView
    android:id="@+id/lagan_widget_check_in"
    android:layout_width="match_parent"
    android:layout_height="36dp"
    android:layout_marginTop="10dp"
    android:background="@drawable/lagan_widget_button_background"
    android:gravity="center"
    android:text="Open Lagan"
    android:textColor="#FFFFFF"
    android:textSize="13sp"
    android:textStyle="bold"
    android:maxLines="1" />
</LinearLayout>
`;

const WIDGET_BACKGROUND_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="@color/lagan_widget_background" />
  <corners android:radius="20dp" />
</shape>
`;

const WIDGET_BUTTON_BACKGROUND_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
  <solid android:color="#F26B1F" />
  <corners android:radius="18dp" />
</shape>
`;

function dotDrawableXml(color) {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
  android:shape="oval">
  <solid android:color="${color}" />
  <size android:width="10dp" android:height="10dp" />
</shape>
`;
}

const WIDGET_DOT_FULL_XML = dotDrawableXml("#F26B1F");
const WIDGET_DOT_PARTIAL_XML = dotDrawableXml("#F8B98A");
const WIDGET_DOT_EMPTY_XML = dotDrawableXml("#F0E3D8");

const WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="160dp"
  android:minHeight="200dp"
  android:minResizeWidth="140dp"
  android:minResizeHeight="160dp"
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

const WIDGET_COLORS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="lagan_widget_background">#FFF8F2</color>
  <color name="lagan_widget_primary">#1F1A17</color>
  <color name="lagan_widget_secondary">#5B5049</color>
  <color name="lagan_widget_muted">#7B6C62</color>
  <color name="lagan_widget_success">#237A4B</color>
</resources>
`;

const WIDGET_COLORS_NIGHT_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="lagan_widget_background">#211A17</color>
  <color name="lagan_widget_primary">#FFF8F2</color>
  <color name="lagan_widget_secondary">#D9C9BF</color>
  <color name="lagan_widget_muted">#B8A59A</color>
  <color name="lagan_widget_success">#72D6A0</color>
</resources>
`;

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function findTarget(project, name) {
  const section = project.pbxNativeTargetSection();
  return Object.entries(section).find(
    ([key, value]) => !key.endsWith("_comment") && String(value.name).replaceAll('"', "") === name,
  );
}

function configureIosTarget(project, target) {
  const list =
    project.hash.project.objects.XCConfigurationList[target.pbxNativeTarget.buildConfigurationList];
  for (const entry of list?.buildConfigurations ?? []) {
    const settings = project.hash.project.objects.XCBuildConfiguration[entry.value]?.buildSettings;
    if (!settings) continue;
    settings.APPLICATION_EXTENSION_API_ONLY = "YES";
    settings.CODE_SIGN_ENTITLEMENTS = `"${IOS_WIDGET_TARGET}/${IOS_WIDGET_TARGET}.entitlements"`;
    settings.CODE_SIGN_STYLE = "Automatic";
    settings.CURRENT_PROJECT_VERSION = 1;
    settings.GENERATE_INFOPLIST_FILE = "NO";
    settings.IPHONEOS_DEPLOYMENT_TARGET = "15.1";
    settings.MARKETING_VERSION = "1.1.0";
    settings.PRODUCT_BUNDLE_IDENTIFIER = `"${IOS_WIDGET_BUNDLE_ID}"`;
    settings.SKIP_INSTALL = "YES";
    settings.SWIFT_VERSION = "5.9";
    settings.TARGETED_DEVICE_FAMILY = '"1,2"';
  }
}

function withLaganIosWidget(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.LaganAppIdentifierPrefix = "$(AppIdentifierPrefix)";
    return config;
  });

  config = withEntitlementsPlist(config, (config) => {
    const groups = new Set(config.modResults["com.apple.security.application-groups"] ?? []);
    groups.add(IOS_APP_GROUP);
    config.modResults["com.apple.security.application-groups"] = [...groups];
    const keychainGroups = new Set(config.modResults["keychain-access-groups"] ?? []);
    keychainGroups.add(IOS_KEYCHAIN_GROUP);
    config.modResults["keychain-access-groups"] = [...keychainGroups];
    return config;
  });

  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const root = config.modRequest.platformProjectRoot;
      const targetRoot = path.join(root, IOS_WIDGET_TARGET);
      const template = path.join(
        config.modRequest.projectRoot,
        "modules",
        "lagan-widget",
        "widget-extension",
        "LaganWidget.swift",
      );
      writeFile(path.join(targetRoot, "LaganWidget.swift"), fs.readFileSync(template, "utf8"));
      writeFile(path.join(targetRoot, `${IOS_WIDGET_TARGET}-Info.plist`), IOS_WIDGET_INFO_PLIST);
      writeFile(
        path.join(targetRoot, `${IOS_WIDGET_TARGET}.entitlements`),
        IOS_WIDGET_ENTITLEMENTS,
      );
      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    let targetEntry = findTarget(project, IOS_WIDGET_TARGET);
    if (!targetEntry) {
      const target = project.addTarget(
        IOS_WIDGET_TARGET,
        "app_extension",
        IOS_WIDGET_TARGET,
        IOS_WIDGET_BUNDLE_ID,
      );
      project.addBuildPhase(
        [`${IOS_WIDGET_TARGET}/LaganWidget.swift`],
        "PBXSourcesBuildPhase",
        "Sources",
        target.uuid,
      );
      targetEntry = [target.uuid, target.pbxNativeTarget];
    }
    configureIosTarget(project, { uuid: targetEntry[0], pbxNativeTarget: targetEntry[1] });
    return config;
  });

  return config;
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
      writeFile(
        path.join(resRoot, "drawable", "lagan_widget_button_background.xml"),
        WIDGET_BUTTON_BACKGROUND_XML,
      );
      writeFile(path.join(resRoot, "drawable", "lagan_widget_dot_full.xml"), WIDGET_DOT_FULL_XML);
      writeFile(
        path.join(resRoot, "drawable", "lagan_widget_dot_partial.xml"),
        WIDGET_DOT_PARTIAL_XML,
      );
      writeFile(path.join(resRoot, "drawable", "lagan_widget_dot_empty.xml"), WIDGET_DOT_EMPTY_XML);
      writeFile(path.join(resRoot, "xml", "lagan_widget_info.xml"), WIDGET_INFO_XML);
      writeFile(path.join(resRoot, "values", "lagan_widget_strings.xml"), WIDGET_STRINGS_XML);
      writeFile(path.join(resRoot, "values", "lagan_widget_colors.xml"), WIDGET_COLORS_XML);
      writeFile(
        path.join(resRoot, "values-night", "lagan_widget_colors.xml"),
        WIDGET_COLORS_NIGHT_XML,
      );

      return config;
    },
  ]);

  return withLaganIosWidget(config);
};

module.exports = createRunOncePlugin(withLaganWidget, "with-lagan-widget", "2.0.0");
