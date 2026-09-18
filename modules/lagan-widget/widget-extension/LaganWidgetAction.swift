import AppIntents
import Foundation
import HealthKit
import Security
import WidgetKit

private let widgetAppGroup = "group.health.lagan.app"
private let widgetKeychainSuffix = "health.lagan.widget.shared"
private let widgetKeychainService = "health.lagan.widget.actions"
private let widgetDiagnosticsKey = "widget_diagnostics_v1"
private let widgetPendingActionKey = "pending_action"
private let widgetRetryLimit = 5
private let widgetRetryLifetime: TimeInterval = 24 * 60 * 60

private func widgetJSONValue<T>(_ value: T?) -> Any {
  if let value { return value }
  return NSNull()
}

struct WidgetSteps: Codable {
  var count: Int?
  var status: String
  var updatedAtMs: Double?
}

struct WidgetLeaderboard: Codable {
  var status: String
  var rank: Int?
}

struct WidgetAction: Codable {
  var status: String
  var operationId: String?
  var habitId: String?
  var habitName: String?
  var amountLabel: String?
  var message: String?
  var updatedAtMs: Double?
}

struct UpcomingHabit: Codable {
  var id: String?
  var name: String?
  var label: String
  var time: String?
  var checkInUrl: String?
  var checkInLabel: String
  var preferred: Bool
}

struct WidgetSnapshot: Codable {
  var schemaVersion: Int
  var title: String
  var todayKey: String?
  var updatedAtMs: Double
  var completedCount: Int
  var totalHabits: Int
  var remainingCount: Int
  var progressPercent: Int
  var completionLabel: String
  var nextHabitLabel: String
  var coachLabel: String
  var streakLabel: String
  var levelLabel: String
  var updatedLabel: String
  var checkInLabel: String
  var checkInUrl: String?
  var upcoming: [UpcomingHabit]?
  var steps: WidgetSteps?
  var leaderboard: WidgetLeaderboard?
  var lastAction: WidgetAction?

  static let empty = WidgetSnapshot(
    schemaVersion: 3,
    title: "Today",
    todayKey: nil,
    updatedAtMs: 0,
    completedCount: 0,
    totalHabits: 0,
    remainingCount: 0,
    progressPercent: 0,
    completionLabel: "Open Lagan to start",
    nextHabitLabel: "",
    coachLabel: "",
    streakLabel: "Sign in to sync",
    levelLabel: "Lagan",
    updatedLabel: "",
    checkInLabel: "Open Lagan",
    checkInUrl: nil,
    upcoming: [],
    steps: nil,
    leaderboard: nil,
    lastAction: nil
  )
}

enum WidgetActionOutcome {
  case success
  case alreadyComplete
  case habitUnavailable
  case reconnectRequired
  case temporarilyUnavailable
  case queuedOffline
  case busy
  case failed
}

private struct WidgetActionRequestError: Error {
  let status: Int
  let code: String
}

enum WidgetDiagnostics {
  private static var defaults: UserDefaults? { UserDefaults(suiteName: widgetAppGroup) }

  static func append(
    stage: String,
    operationId: String? = nil,
    httpStatus: Int? = nil,
    category: String? = nil
  ) {
    let nowMs = Date().timeIntervalSince1970 * 1000
    let cutoffMs = nowMs - (7 * 24 * 60 * 60 * 1000)
    var entries = readEntries().filter {
      (($0["timestampMs"] as? NSNumber)?.doubleValue ?? 0) >= cutoffMs
    }
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
      ?? "unknown"
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
      ?? "unknown"
    entries.append([
      "timestampMs": nowMs,
      "stage": stage,
      "operationId": widgetJSONValue(operationId),
      "httpStatus": widgetJSONValue(httpStatus),
      "category": widgetJSONValue(category),
      "appVersion": version,
      "buildNumber": build,
      "runtimeVersion": "appVersion:\(version)",
      "osVersion": ProcessInfo.processInfo.operatingSystemVersionString,
    ])
    if entries.count > 50 { entries = Array(entries.suffix(50)) }
    guard let data = try? JSONSerialization.data(withJSONObject: entries),
          let value = String(data: data, encoding: .utf8)
    else { return }
    defaults?.set(value, forKey: widgetDiagnosticsKey)
  }

  static func clear() {
    defaults?.removeObject(forKey: widgetDiagnosticsKey)
  }

  private static func readEntries() -> [[String: Any]] {
    guard let value = defaults?.string(forKey: widgetDiagnosticsKey),
          let data = value.data(using: .utf8),
          let entries = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else { return [] }
    return entries
  }
}

enum WidgetStore {
  static var defaults: UserDefaults? { UserDefaults(suiteName: widgetAppGroup) }

  private static func expiryDate() -> Date? {
    guard let value = defaults?.string(forKey: "expires_at"), !value.isEmpty else { return nil }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: value) { return date }
    return ISO8601DateFormatter().date(from: value)
  }

  private static var credentialExpired: Bool {
    guard let expiry = expiryDate() else { return true }
    return expiry <= Date()
  }

  static func snapshot() -> WidgetSnapshot {
    guard let json = defaults?.string(forKey: "snapshot_json"),
          let data = json.data(using: .utf8),
          let value = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    else { return .empty }
    return value
  }

  static func accessGroup() -> String? {
    guard let prefix = Bundle.main.object(forInfoDictionaryKey: "LaganAppIdentifierPrefix") as? String,
          !prefix.isEmpty else { return nil }
    return prefix + widgetKeychainSuffix
  }

  static func token() -> String? {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: widgetKeychainService,
      kSecAttrAccount as String: "widget-token",
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    if let group = accessGroup() { query[kSecAttrAccessGroup as String] = group }
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data
    else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static var hasCredential: Bool { token() != nil && !credentialExpired }

  static func clearToken() {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: widgetKeychainService,
      kSecAttrAccount as String: "widget-token",
    ]
    if let group = accessGroup() { query[kSecAttrAccessGroup as String] = group }
    SecItemDelete(query as CFDictionary)
    defaults?.removeObject(forKey: "expires_at")
  }

  static func patch(_ mutate: (inout [String: Any]) -> Void) {
    guard let current = defaults?.string(forKey: "snapshot_json"),
          let data = current.data(using: .utf8),
          var json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    else { return }
    mutate(&json)
    guard let next = try? JSONSerialization.data(withJSONObject: json),
          let value = String(data: next, encoding: .utf8)
    else { return }
    defaults?.set(value, forKey: "snapshot_json")
  }

  static func setAction(
    status: String,
    operationId: String,
    habitId: String,
    habitName: String?,
    amountLabel: String?,
    message: String
  ) {
    patch { json in
      let action: [String: Any] = [
        "status": status,
        "operationId": operationId,
        "habitId": habitId,
        "habitName": widgetJSONValue(habitName),
        "amountLabel": widgetJSONValue(amountLabel),
        "message": message,
        "updatedAtMs": Date().timeIntervalSince1970 * 1000,
      ]
      json["lastAction"] = action
    }
    WidgetCenter.shared.reloadAllTimelines()
  }

  static func request(body: [String: Any], operationId: String? = nil) async throws -> [String: Any] {
    let storedToken = token()
    let hasToken = storedToken != nil && !credentialExpired
    let urlString = defaults?.string(forKey: "action_url")
    let hasURL = urlString.flatMap { URL(string: $0) } != nil
    if let operationId {
      WidgetDiagnostics.append(
        stage: "credential_check",
        operationId: operationId,
        category: hasToken && hasURL ? "ready" : (hasToken ? "configuration_missing" : "credential_missing")
      )
    }
    guard hasToken, let token = storedToken else {
      clearToken()
      throw WidgetActionRequestError(status: 401, code: "session_required")
    }
    guard let urlString, let url = URL(string: urlString) else {
      throw WidgetActionRequestError(status: 0, code: "configuration_missing")
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 20
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    if let anon = defaults?.string(forKey: "anon_key"), !anon.isEmpty {
      request.setValue(anon, forHTTPHeaderField: "apikey")
    }
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    if let operationId {
      WidgetDiagnostics.append(stage: "request_started", operationId: operationId, category: "check_in")
    }
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    if let operationId {
      WidgetDiagnostics.append(
        stage: "response_received",
        operationId: operationId,
        httpStatus: http.statusCode,
        category: value["code"] as? String
      )
    }
    guard (200..<300).contains(http.statusCode) else {
      let code = value["code"] as? String
        ?? (http.statusCode == 401 ? "session_required" : "http_error")
      if http.statusCode == 401 { clearToken() }
      throw WidgetActionRequestError(status: http.statusCode, code: code)
    }
    guard !value.isEmpty else {
      throw WidgetActionRequestError(status: http.statusCode, code: "invalid_response")
    }
    return value
  }

  static func checkIn(habitId: String, habitName: String?, operationId: String) async -> WidgetActionOutcome {
    if let pending = defaults?.dictionary(forKey: widgetPendingActionKey),
       pending["operationId"] as? String != operationId {
      WidgetDiagnostics.append(stage: "outcome", operationId: operationId, category: "busy")
      return .busy
    }
    if defaults?.dictionary(forKey: widgetPendingActionKey) == nil {
      defaults?.set([
        "habitId": habitId,
        "habitName": habitName ?? "",
        "operationId": operationId,
        "retryCount": 0,
        "createdAtMs": Date().timeIntervalSince1970 * 1000,
      ], forKey: widgetPendingActionKey)
    }
    setAction(
      status: "queued",
      operationId: operationId,
      habitId: habitId,
      habitName: habitName,
      amountLabel: nil,
      message: "Logging…"
    )
    do {
      let response = try await request(body: [
        "action": "check_in",
        "habitId": habitId,
        "operationId": operationId,
      ], operationId: operationId)
      let name = response["habitName"] as? String ?? habitName ?? "habit"
      let unit = (response["unit"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
      let number = response["increment"] as? NSNumber
      let amount = number.map { value -> String in
        let base = value.doubleValue.rounded() == value.doubleValue
          ? String(Int(value.doubleValue))
          : String(format: "%.2f", value.doubleValue)
            .replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
        return unit.isEmpty ? base : "\(base) \(unit)"
      }
      patch { json in
        if let leaderboard = response["leaderboard"] { json["leaderboard"] = leaderboard }
        if (response["completed"] as? Bool) == true {
          let total = json["totalHabits"] as? Int ?? 0
          let completed = min(total, (json["completedCount"] as? Int ?? 0) + 1)
          json["completedCount"] = completed
          json["remainingCount"] = max(0, total - completed)
          json["progressPercent"] = total == 0 ? 0 : Int(Double(completed) / Double(total) * 100)
          json["completionLabel"] = completed >= total
            ? "All habits done"
            : "\(completed) of \(total) habits done"
          if let upcoming = json["upcoming"] as? [[String: Any]] {
            let filtered = upcoming.filter { ($0["id"] as? String) != habitId }
            json["upcoming"] = filtered
            json["nextHabitLabel"] = filtered.first?["label"] as? String ?? ""
            json["checkInUrl"] = filtered.first?["checkInUrl"] ?? NSNull()
            json["checkInLabel"] = filtered.first?["checkInLabel"] as? String ?? "Open Lagan"
          }
        }
      }
      defaults?.removeObject(forKey: widgetPendingActionKey)
      setAction(
        status: "success",
        operationId: operationId,
        habitId: habitId,
        habitName: name,
        amountLabel: amount,
        message: amount.map { "\u{2713} Logged \($0)" } ?? "\u{2713} Logged \(name)"
      )
      WidgetDiagnostics.append(stage: "outcome", operationId: operationId, category: "success")
      return .success
    } catch let error as WidgetActionRequestError {
      defaults?.removeObject(forKey: widgetPendingActionKey)
      let outcome: WidgetActionOutcome
      let message: String
      switch error.code {
      case "already_complete":
        outcome = .alreadyComplete
        message = "Already complete"
      case "habit_unavailable":
        outcome = .habitUnavailable
        message = "Habit unavailable"
      case "session_required", "configuration_missing":
        clearToken()
        outcome = .reconnectRequired
        message = "Open Lagan to reconnect"
      case "actions_disabled":
        outcome = .temporarilyUnavailable
        message = "Temporarily unavailable"
      default:
        if error.status == 503 {
          outcome = .temporarilyUnavailable
          message = "Temporarily unavailable"
        } else {
          outcome = .failed
          message = "Check-in failed"
        }
      }
      setAction(
        status: "error",
        operationId: operationId,
        habitId: habitId,
        habitName: habitName,
        amountLabel: nil,
        message: message
      )
      WidgetDiagnostics.append(
        stage: "outcome",
        operationId: operationId,
        httpStatus: error.status > 0 ? error.status : nil,
        category: error.code
      )
      return outcome
    } catch let error as URLError where [
      .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost,
      .cannotFindHost, .dnsLookupFailed, .dataNotAllowed,
    ].contains(error.code) {
      let retained = retainPendingRetry(operationId: operationId)
      WidgetDiagnostics.append(
        stage: "outcome",
        operationId: operationId,
        category: retained ? "queued_offline" : "retry_exhausted"
      )
      if retained { return .queuedOffline }
      defaults?.removeObject(forKey: widgetPendingActionKey)
      setAction(
        status: "error",
        operationId: operationId,
        habitId: habitId,
        habitName: habitName,
        amountLabel: nil,
        message: "Retry in Lagan"
      )
      return .failed
    } catch {
      defaults?.removeObject(forKey: widgetPendingActionKey)
      setAction(
        status: "error",
        operationId: operationId,
        habitId: habitId,
        habitName: habitName,
        amountLabel: nil,
        message: "Check-in failed"
      )
      WidgetDiagnostics.append(stage: "outcome", operationId: operationId, category: "unexpected_error")
      return .failed
    }
  }

  private static func retainPendingRetry(operationId: String) -> Bool {
    guard var pending = defaults?.dictionary(forKey: widgetPendingActionKey),
          pending["operationId"] as? String == operationId
    else { return false }
    let retryCount = (pending["retryCount"] as? NSNumber)?.intValue ?? 0
    let createdAtMs = (pending["createdAtMs"] as? NSNumber)?.doubleValue ?? 0
    let isFresh = Date().timeIntervalSince1970 * 1000 - createdAtMs < widgetRetryLifetime * 1000
    guard isFresh && retryCount + 1 < widgetRetryLimit else { return false }
    pending["retryCount"] = retryCount + 1
    defaults?.set(pending, forKey: widgetPendingActionKey)
    return true
  }

  static func retryPending() async {
    guard let pending = defaults?.dictionary(forKey: widgetPendingActionKey),
          let habitId = pending["habitId"] as? String,
          let operationId = pending["operationId"] as? String
    else { return }
    _ = await checkIn(
      habitId: habitId,
      habitName: pending["habitName"] as? String,
      operationId: operationId
    )
  }

  static func todaySteps() async -> Int? {
    guard HKHealthStore.isHealthDataAvailable(),
          let type = HKQuantityType.quantityType(forIdentifier: .stepCount)
    else { return nil }
    let start = Calendar.current.startOfDay(for: Date())
    let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
    return await withCheckedContinuation { continuation in
      let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) {
        _, result, _ in
        let count = result?.sumQuantity()?.doubleValue(for: .count())
        continuation.resume(returning: count.map { max(0, Int($0)) })
      }
      HKHealthStore().execute(query)
    }
  }

  static func syncSteps(_ steps: Int) async {
    do {
      let response = try await request(body: ["action": "sync_steps", "steps": steps])
      patch { json in
        json["steps"] = [
          "count": steps,
          "status": "available",
          "updatedAtMs": Date().timeIntervalSince1970 * 1000,
        ]
        if let leaderboard = response["leaderboard"] { json["leaderboard"] = leaderboard }
      }
    } catch {
      // Keep the last confirmed values visible.
    }
  }

  static func refreshRank() async {
    do {
      let response = try await request(body: ["action": "refresh_rank"])
      patch { json in
        if let leaderboard = response["leaderboard"] { json["leaderboard"] = leaderboard }
      }
    } catch {
      // Keep the last confirmed rank visible.
    }
  }
}

@available(iOS 17.0, *)
struct WidgetCheckInIntent: AppIntent {
  static var title: LocalizedStringResource = "Check in"
  static var openAppWhenRun = false

  @Parameter(title: "Habit ID") var habitId: String
  @Parameter(title: "Habit name") var habitName: String?

  init() {}
  init(habitId: String, habitName: String?) {
    self.habitId = habitId
    self.habitName = habitName
  }

  func perform() async throws -> some IntentResult {
    let operationId = UUID().uuidString.lowercased()
    WidgetDiagnostics.append(stage: "intent_entered", operationId: operationId)
    WidgetDiagnostics.append(stage: "parameters_present", operationId: operationId, category: "habit_parameters")
    _ = await WidgetStore.checkIn(
      habitId: habitId,
      habitName: habitName,
      operationId: operationId
    )
    return .result()
  }
}
