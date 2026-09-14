import AppIntents
import HealthKit
import Security
import SwiftUI
import UIKit
import WidgetKit

private let appGroup = "group.health.lagan.app"
private let keychainSuffix = "health.lagan.widget.shared"
private let keychainService = "health.lagan.widget.actions"

private struct WidgetSteps: Codable {
  var count: Int?
  var status: String
  var updatedAtMs: Double?
}

private struct WidgetLeaderboard: Codable {
  var status: String
  var rank: Int?
}

private struct WidgetAction: Codable {
  var status: String
  var operationId: String?
  var habitId: String?
  var habitName: String?
  var amountLabel: String?
  var message: String?
  var updatedAtMs: Double?
}

private struct UpcomingHabit: Codable {
  var id: String?
  var name: String?
  var label: String
  var time: String?
  var checkInUrl: String?
  var checkInLabel: String
  var preferred: Bool
}

private struct WidgetSnapshot: Codable {
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

private enum WidgetStore {
  static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

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
    return prefix + keychainSuffix
  }

  static func token() -> String? {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
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

  static var hasCredential: Bool { token() != nil }

  static func clearToken() {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: "widget-token",
    ]
    if let group = accessGroup() { query[kSecAttrAccessGroup as String] = group }
    SecItemDelete(query as CFDictionary)
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
      json["lastAction"] = [
        "status": status,
        "operationId": operationId,
        "habitId": habitId,
        "habitName": habitName ?? NSNull(),
        "amountLabel": amountLabel ?? NSNull(),
        "message": message,
        "updatedAtMs": Date().timeIntervalSince1970 * 1000,
      ]
    }
    WidgetCenter.shared.reloadAllTimelines()
  }

  static func request(body: [String: Any]) async throws -> [String: Any] {
    guard let token = token(),
          let urlString = defaults?.string(forKey: "action_url"),
          let url = URL(string: urlString)
    else { throw URLError(.userAuthenticationRequired) }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 20
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    if let anon = defaults?.string(forKey: "anon_key"), !anon.isEmpty {
      request.setValue(anon, forHTTPHeaderField: "apikey")
    }
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    if http.statusCode == 401 || http.statusCode == 503 {
      clearToken()
      WidgetCenter.shared.reloadAllTimelines()
      throw URLError(.userAuthenticationRequired)
    }
    guard (200..<300).contains(http.statusCode),
          let value = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { throw URLError(.badServerResponse) }
    return value
  }

  static func checkIn(habitId: String, habitName: String?, operationId: String) async {
    if let pending = defaults?.dictionary(forKey: "pending_action"),
       pending["habitId"] as? String == habitId,
       pending["operationId"] as? String != operationId {
      return
    }
    setAction(
      status: "queued",
      operationId: operationId,
      habitId: habitId,
      habitName: habitName,
      amountLabel: nil,
      message: "Queued"
    )
    defaults?.set(
      ["habitId": habitId, "habitName": habitName ?? "", "operationId": operationId],
      forKey: "pending_action"
    )
    do {
      let response = try await request(body: [
        "action": "check_in",
        "habitId": habitId,
        "operationId": operationId,
      ])
      let name = response["habitName"] as? String ?? habitName ?? "habit"
      let unit = (response["unit"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
      let number = response["increment"] as? NSNumber
      let amount = number.map { value -> String in
        let base = value.doubleValue.rounded() == value.doubleValue
          ? String(Int(value.doubleValue))
          : String(format: "%.2f", value.doubleValue).replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression).replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
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
      defaults?.removeObject(forKey: "pending_action")
      setAction(
        status: "success",
        operationId: operationId,
        habitId: habitId,
        habitName: name,
        amountLabel: amount,
        message: amount.map { "✓ Logged \($0)" } ?? "✓ Logged \(name)"
      )
    } catch let error as URLError where [.notConnectedToInternet, .networkConnectionLost, .timedOut].contains(error.code) {
      // Keep the exact same operation UUID for timeline retry.
    } catch {
      defaults?.removeObject(forKey: "pending_action")
      setAction(
        status: "error",
        operationId: operationId,
        habitId: habitId,
        habitName: habitName,
        amountLabel: nil,
        message: "Check-in failed"
      )
    }
  }

  static func retryPending() async {
    guard let pending = defaults?.dictionary(forKey: "pending_action"),
          let habitId = pending["habitId"] as? String,
          let operationId = pending["operationId"] as? String
    else { return }
    await checkIn(habitId: habitId, habitName: pending["habitName"] as? String, operationId: operationId)
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
      // The last confirmed/cached values remain visible.
    }
  }

  static func refreshRank() async {
    do {
      let response = try await request(body: ["action": "refresh_rank"])
      patch { json in
        if let leaderboard = response["leaderboard"] { json["leaderboard"] = leaderboard }
      }
    } catch {
      // The last confirmed/cached rank remains visible.
    }
  }
}

@available(iOS 17.0, *)
private struct WidgetCheckInIntent: AppIntent {
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
    await WidgetStore.checkIn(
      habitId: habitId,
      habitName: habitName,
      operationId: UUID().uuidString.lowercased()
    )
    return .result()
  }
}

private struct LaganEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot
}

private struct LaganProvider: TimelineProvider {
  func placeholder(in context: Context) -> LaganEntry {
    LaganEntry(date: Date(), snapshot: .empty)
  }

  func getSnapshot(in context: Context, completion: @escaping (LaganEntry) -> Void) {
    completion(LaganEntry(date: Date(), snapshot: WidgetStore.snapshot()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<LaganEntry>) -> Void) {
    Task {
      await WidgetStore.retryPending()
      if let steps = await WidgetStore.todaySteps() {
        await WidgetStore.syncSteps(steps)
      } else {
        await WidgetStore.refreshRank()
      }
      let entry = LaganEntry(date: Date(), snapshot: WidgetStore.snapshot())
      completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(30 * 60))))
    }
  }
}

private struct LaganWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: LaganEntry

  private var next: UpcomingHabit? { entry.snapshot.upcoming?.first }
  private var openURL: URL { URL(string: next?.checkInUrl ?? entry.snapshot.checkInUrl ?? "lagan://")! }
  private var availableSteps: Int? {
    guard entry.snapshot.steps?.status == "available" else { return nil }
    return entry.snapshot.steps?.count
  }
  private var allTimeRank: Int? {
    guard entry.snapshot.leaderboard?.status == "ranked" else { return nil }
    return entry.snapshot.leaderboard?.rank
  }
  private var isNotJoined: Bool { entry.snapshot.leaderboard?.status == "not_joined" }

  var body: some View {
    layout
      .padding(family == .systemSmall ? 12 : 14)
      .widgetBackground()
      .widgetURL(URL(string: "lagan://"))
  }

  @ViewBuilder private var layout: some View {
    switch family {
    case .systemSmall:
      smallLayout
    case .systemMedium:
      mediumLayout
    default:
      largeLayout
    }
  }

  private var header: some View {
    HStack(spacing: 6) {
      Text(entry.snapshot.title)
        .font(.caption.bold())
        .lineLimit(1)
      Spacer(minLength: 4)
      Text(entry.snapshot.levelLabel)
        .font(.caption2.bold())
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
  }

  private var progress: some View {
    ProgressView(value: Double(entry.snapshot.progressPercent), total: 100)
      .tint(.orange)
  }

  @ViewBuilder private func metadataRow(compact: Bool) -> some View {
    HStack(spacing: 6) {
      if let steps = availableSteps {
        Text(compact ? "\(steps.formatted()) steps" : "\(steps.formatted()) steps today")
          .privacySensitive()
      }
      if availableSteps != nil && (allTimeRank != nil || (isNotJoined && !compact)) {
        Spacer(minLength: 2)
      }
      if let rank = allTimeRank {
        Text(compact ? "All-time #\(rank)" : "All-time rank #\(rank)")
          .privacySensitive()
      } else if isNotJoined && !compact {
        Text("Join leaderboard in Lagan")
      }
    }
    .font(.caption2)
    .lineLimit(1)
    .minimumScaleFactor(0.72)
  }

  @ViewBuilder private var actionStatus: some View {
    if let message = entry.snapshot.lastAction?.message, !message.isEmpty {
      Text(message)
        .font(.caption2.bold())
        .foregroundStyle(.green)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
    }
  }

  private func actionTitle(_ title: String) -> some View {
    Text(title)
      .lineLimit(1)
      .minimumScaleFactor(0.72)
      .frame(maxWidth: .infinity)
  }

  @ViewBuilder private var actionControl: some View {
    if #available(iOS 17.0, *), WidgetStore.hasCredential, let next, let habitId = next.id {
      Button(intent: WidgetCheckInIntent(habitId: habitId, habitName: next.name)) {
        actionTitle("Check in")
      }
      .buttonStyle(.borderedProminent)
      .tint(.orange)
    } else {
      Link(destination: openURL) {
        actionTitle(next?.checkInLabel ?? entry.snapshot.checkInLabel)
      }
      .buttonStyle(.borderedProminent)
      .tint(.orange)
    }
  }

  private var smallLayout: some View {
    VStack(alignment: .leading, spacing: 4) {
      header
      Text(entry.snapshot.completionLabel)
        .font(.subheadline.bold())
        .lineLimit(1)
        .minimumScaleFactor(0.75)
        .layoutPriority(1)
      progress
      metadataRow(compact: true)
      actionStatus
      Spacer(minLength: 0)
      actionControl
        .controlSize(.small)
    }
  }

  private var mediumLayout: some View {
    VStack(alignment: .leading, spacing: 6) {
      header
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 6) {
          Text(entry.snapshot.completionLabel)
            .font(.headline)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
          progress
          if !entry.snapshot.nextHabitLabel.isEmpty {
            Text(entry.snapshot.nextHabitLabel)
              .font(.caption.bold())
              .lineLimit(1)
              .minimumScaleFactor(0.75)
          }
          Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        VStack(alignment: .leading, spacing: 5) {
          metadataRow(compact: false)
          actionStatus
          Spacer(minLength: 0)
          actionControl
            .controlSize(.small)
        }
        .frame(width: 132)
      }
    }
  }

  private var largeLayout: some View {
    VStack(alignment: .leading, spacing: 7) {
      header
      Text(entry.snapshot.completionLabel)
        .font(.headline)
        .lineLimit(2)
      progress
      if !entry.snapshot.nextHabitLabel.isEmpty {
        Text(entry.snapshot.nextHabitLabel)
          .font(.caption.bold())
          .lineLimit(1)
      }
      metadataRow(compact: false)
      actionStatus
      Spacer(minLength: 0)
      actionControl
    }
  }
}

private extension View {
  @ViewBuilder func widgetBackground() -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(.background, for: .widget)
    } else {
      background(Color(UIColor.systemBackground))
    }
  }
}

@main
struct LaganHomeWidget: Widget {
  let kind = "LaganHomeWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LaganProvider()) { entry in
      LaganWidgetView(entry: entry)
    }
    .configurationDisplayName("Lagan Today")
    .description("Habits, steps, streak, and all-time rank.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
