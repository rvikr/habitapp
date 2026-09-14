package health.lagan.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.ZoneId
import java.time.ZonedDateTime

internal data class WidgetCredential(
  val token: String,
  val actionUrl: String,
  val anonKey: String,
  val expiresAt: String,
)

internal object WidgetCredentialStore {
  private const val FILE_NAME = "lagan_widget_secure"

  private fun prefs(context: Context) = EncryptedSharedPreferences.create(
    context,
    FILE_NAME,
    MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
  )

  fun write(context: Context, json: JSONObject) {
    val token = json.optString("token")
    val actionUrl = json.optString("actionUrl")
    val expiresAt = json.optString("expiresAt")
    require(token.length >= 32 && actionUrl.startsWith("https://") && expiresAt.isNotBlank())
    prefs(context).edit()
      .putString("token", token)
      .putString("action_url", actionUrl)
      .putString("anon_key", json.optString("anonKey"))
      .putString("expires_at", expiresAt)
      .commit()
  }

  fun read(context: Context): WidgetCredential? {
    return try {
      val values = prefs(context)
      val token = values.getString("token", null) ?: return null
      val actionUrl = values.getString("action_url", null) ?: return null
      val expiresAt = values.getString("expires_at", null) ?: return null
      if (Instant.parse(expiresAt).isBefore(Instant.now())) return null
      WidgetCredential(token, actionUrl, values.getString("anon_key", "") ?: "", expiresAt)
    } catch (_: Exception) {
      null
    }
  }

  fun clear(context: Context) {
    try { prefs(context).edit().clear().commit() } catch (_: Exception) {}
  }

  fun isFresh(context: Context): Boolean {
    return try {
      val credential = read(context) ?: return false
      Instant.parse(credential.expiresAt).isAfter(Instant.now().plusSeconds(7 * 24 * 60 * 60L))
    } catch (_: Exception) {
      false
    }
  }
}

object WidgetActionScheduler {
  private const val PREFS_NAME = "lagan_widget"
  private const val SNAPSHOT_KEY = "snapshot_json"
  private const val ACTION_WORK_PREFIX = "lagan-widget-check-in-"

  @JvmStatic fun canRun(context: Context): Boolean = WidgetCredentialStore.read(context) != null

  @JvmStatic fun enqueueCheckIn(context: Context, habitId: String, habitName: String?) {
    if (!UUID_REGEX.matches(habitId) || !canRun(context)) return
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    if (!prefs.getString("pending_$habitId", null).isNullOrBlank()) return
    val snapshot = try { JSONObject(prefs.getString(SNAPSHOT_KEY, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
    val current = snapshot.optJSONObject("lastAction")
    if (current?.optString("status") == "queued" && current.optString("habitId") == habitId) return

    val operationId = UUID.randomUUID().toString()
    snapshot.put("lastAction", JSONObject()
      .put("status", "queued")
      .put("operationId", operationId)
      .put("habitId", habitId)
      .put("habitName", habitName ?: JSONObject.NULL)
      .put("amountLabel", JSONObject.NULL)
      .put("message", "Queued")
      .put("updatedAtMs", System.currentTimeMillis()))
    prefs.edit()
      .putString("pending_$habitId", operationId)
      .putString(SNAPSHOT_KEY, snapshot.toString())
      .commit()
    notifyWidgets(context)

    val request = OneTimeWorkRequestBuilder<WidgetCheckInWorker>()
      .addTag("lagan-widget")
      .setInputData(workDataOf("habit_id" to habitId, "habit_name" to (habitName ?: ""), "operation_id" to operationId))
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(
      "$ACTION_WORK_PREFIX$habitId",
      ExistingWorkPolicy.KEEP,
      request,
    )
  }

  @JvmStatic fun cancelAll(context: Context) {
    WorkManager.getInstance(context).cancelAllWorkByTag("lagan-widget")
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val editor = prefs.edit()
    prefs.all.keys.filter { it.startsWith("pending_") }.forEach { editor.remove(it) }
    editor.commit()
  }

  internal fun clearPending(context: Context, habitId: String, operationId: String) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    if (prefs.getString("pending_$habitId", null) == operationId) {
      prefs.edit().remove("pending_$habitId").commit()
    }
  }

  @JvmStatic fun scheduleStepRefresh(context: Context) {
    val request = PeriodicWorkRequestBuilder<WidgetStepWorker>(30, TimeUnit.MINUTES)
      .addTag("lagan-widget")
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
      "lagan-widget-steps",
      ExistingPeriodicWorkPolicy.UPDATE,
      request,
    )
  }

  internal fun updateResult(context: Context, result: JSONObject) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val snapshot = try { JSONObject(prefs.getString(SNAPSHOT_KEY, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
    snapshot.put("lastAction", result)
    prefs.edit().putString(SNAPSHOT_KEY, snapshot.toString()).commit()
    notifyWidgets(context)
  }

  internal fun applyCheckInSuccess(context: Context, response: JSONObject, action: JSONObject) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val snapshot = try { JSONObject(prefs.getString(SNAPSHOT_KEY, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
    val operationId = action.optString("operationId")
    val alreadyApplied = snapshot.optJSONObject("lastAction")?.let {
      it.optString("status") == "success" && it.optString("operationId") == operationId
    } == true
    if (!alreadyApplied && response.optBoolean("completed", false)) {
      val total = snapshot.optInt("totalHabits", 0).coerceAtLeast(0)
      val completed = (snapshot.optInt("completedCount", 0) + 1).coerceIn(0, total)
      snapshot.put("completedCount", completed)
      snapshot.put("remainingCount", (total - completed).coerceAtLeast(0))
      snapshot.put("progressPercent", if (total == 0) 0 else (completed * 100.0 / total).toInt())
      snapshot.put("completionLabel", if (completed >= total) "All habits done" else "$completed of $total habits done")
      val upcoming = snapshot.optJSONArray("upcoming")
      if (upcoming != null) {
        val filtered = org.json.JSONArray()
        for (index in 0 until upcoming.length()) {
          val item = upcoming.optJSONObject(index) ?: continue
          if (item.optString("id") != response.optString("habitId")) filtered.put(item)
        }
        snapshot.put("upcoming", filtered)
        val next = filtered.optJSONObject(0)
        snapshot.put("nextHabitLabel", next?.optString("label", "") ?: "")
        snapshot.put("checkInUrl", next?.opt("checkInUrl") ?: JSONObject.NULL)
        snapshot.put("checkInLabel", next?.optString("checkInLabel", "Open Lagan") ?: "Open Lagan")
      }
    }
    response.optJSONObject("leaderboard")?.let { snapshot.put("leaderboard", it) }
    snapshot.put("lastAction", action)
    prefs.edit().putString(SNAPSHOT_KEY, snapshot.toString()).commit()
    notifyWidgets(context)
  }

  internal fun notifyWidgets(context: Context) {
    val provider = ComponentName(context.packageName, "${context.packageName}.LaganWidgetProvider")
    val ids = AppWidgetManager.getInstance(context).getAppWidgetIds(provider)
    context.sendBroadcast(Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
      component = provider
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
    })
  }

  private val UUID_REGEX = Regex(
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
  )
}

class WidgetCheckInWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    val habitId = inputData.getString("habit_id") ?: return Result.failure()
    val habitName = inputData.getString("habit_name").orEmpty()
    val operationId = inputData.getString("operation_id") ?: return Result.failure()
    val credential = WidgetCredentialStore.read(applicationContext)
      ?: return fail(operationId, habitId, habitName, "Open Lagan to reconnect")

    return try {
      val connection = URL(credential.actionUrl).openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = 15_000
      connection.readTimeout = 20_000
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("Authorization", "Bearer ${credential.token}")
      if (credential.anonKey.isNotBlank()) connection.setRequestProperty("apikey", credential.anonKey)
      val body = JSONObject()
        .put("action", "check_in")
        .put("habitId", habitId)
        .put("operationId", operationId)
        .toString()
      connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      val code = connection.responseCode
      if (code in 200..299) {
        val response = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
        val name = response.optString("habitName", habitName)
        val amount = response.optDouble("increment", Double.NaN)
        val unit = response.optString("unit", "").trim()
        val amountLabel = if (amount.isFinite()) "${formatAmount(amount)}${if (unit.isBlank()) "" else " $unit"}" else null
        val message = if (amountLabel == null) "✓ Logged $name" else "✓ Logged $amountLabel"
        val action = JSONObject()
          .put("status", "success")
          .put("operationId", operationId)
          .put("habitId", habitId)
          .put("habitName", name)
          .put("amountLabel", amountLabel ?: JSONObject.NULL)
          .put("message", message)
          .put("updatedAtMs", System.currentTimeMillis())
        WidgetActionScheduler.applyCheckInSuccess(applicationContext, response, action)
        WidgetActionScheduler.clearPending(applicationContext, habitId, operationId)
        Result.success()
      } else if (code == 401 || code == 503) {
        WidgetCredentialStore.clear(applicationContext)
        fail(operationId, habitId, habitName, "Open Lagan to reconnect")
      } else if (code == 408 || code == 429 || code >= 500) {
        Result.retry()
      } else {
        fail(operationId, habitId, habitName, if (code == 401) "Open Lagan to reconnect" else "Check-in failed")
      }
    } catch (_: IOException) {
      Result.retry()
    } catch (_: Exception) {
      fail(operationId, habitId, habitName, "Check-in failed")
    }
  }

  private fun fail(operationId: String, habitId: String, habitName: String, message: String): Result {
    WidgetActionScheduler.updateResult(applicationContext, JSONObject()
      .put("status", "error")
      .put("operationId", operationId)
      .put("habitId", habitId)
      .put("habitName", habitName)
      .put("amountLabel", JSONObject.NULL)
      .put("message", message)
      .put("updatedAtMs", System.currentTimeMillis()))
    WidgetActionScheduler.clearPending(applicationContext, habitId, operationId)
    return Result.failure()
  }

  private fun formatAmount(value: Double): String =
    if (value % 1.0 == 0.0) value.toLong().toString() else "%.2f".format(value).trimEnd('0').trimEnd('.')
}

class WidgetStepWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    val credential = WidgetCredentialStore.read(applicationContext) ?: return Result.success()
    return try {
      val steps = try {
        if (HealthConnectClient.getSdkStatus(applicationContext) != HealthConnectClient.SDK_AVAILABLE) {
          null
        } else {
          val client = HealthConnectClient.getOrCreate(applicationContext)
          val permission = HealthPermission.getReadPermission(StepsRecord::class)
          if (!client.permissionController.getGrantedPermissions().contains(permission)) {
            null
          } else {
            val now = ZonedDateTime.now()
            val start = now.toLocalDate().atStartOfDay(ZoneId.systemDefault()).toInstant()
            val aggregate = client.aggregate(
              AggregateRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(start, now.toInstant()),
              ),
            )
            aggregate[StepsRecord.COUNT_TOTAL] ?: 0L
          }
        }
      } catch (_: Exception) {
        null
      }
      val connection = URL(credential.actionUrl).openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = 15_000
      connection.readTimeout = 20_000
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("Authorization", "Bearer ${credential.token}")
      if (credential.anonKey.isNotBlank()) connection.setRequestProperty("apikey", credential.anonKey)
      val body = if (steps == null) {
        JSONObject().put("action", "refresh_rank")
      } else {
        JSONObject().put("action", "sync_steps").put("steps", steps)
      }.toString()
      connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      val code = connection.responseCode
      if (code in 200..299) {
        val prefs = applicationContext.getSharedPreferences("lagan_widget", Context.MODE_PRIVATE)
        val snapshot = try { JSONObject(prefs.getString("snapshot_json", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
        if (steps != null) {
          snapshot.put("steps", JSONObject()
            .put("count", steps)
            .put("status", "available")
            .put("updatedAtMs", System.currentTimeMillis()))
        }
        val response = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
        response.optJSONObject("leaderboard")?.let { snapshot.put("leaderboard", it) }
        prefs.edit().putString("snapshot_json", snapshot.toString()).commit()
        WidgetActionScheduler.notifyWidgets(applicationContext)
        Result.success()
      } else if (code == 401 || code == 503) {
        WidgetCredentialStore.clear(applicationContext)
        Result.success()
      } else if (code == 408 || code == 429 || code >= 500) Result.retry() else Result.success()
    } catch (_: IOException) {
      Result.retry()
    } catch (_: Exception) {
      // Health permission/provider failures are non-fatal and must never wake-loop.
      Result.success()
    }
  }
}
