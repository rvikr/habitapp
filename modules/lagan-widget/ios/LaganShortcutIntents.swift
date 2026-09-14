import AppIntents
import Foundation
import Security

private let shortcutAppGroup = "group.health.lagan.app"
private let shortcutKeychainSuffix = "health.lagan.widget.shared"
private let shortcutKeychainService = "health.lagan.widget.actions"
private let shortcutQueueKey = "shortcut_pending_actions"
private let shortcutQueueLimit = 20

private struct ShortcutHabitRecord: Codable, Sendable {
  let id: String
  let name: String
  let unit: String?
  let target: Double?
}

private struct ShortcutPendingAction: Codable, Sendable {
  let habitId: String
  let habitName: String
  let operationId: String
  let createdAtMs: Double
}

private enum ShortcutActionOutcome: Sendable {
  case success(habitName: String, amount: String?)
  case queued
  case alreadyComplete
  case habitUnavailable
  case setupRequired
  case disabled
  case queueFull
  case failed
}

private struct ShortcutActionError: Error {
  let status: Int
  let code: String
}

private enum ShortcutCatalog {
  static var defaults: UserDefaults? { UserDefaults(suiteName: shortcutAppGroup) }

  static func habits() -> [ShortcutHabitRecord] {
    guard let json = defaults?.string(forKey: "snapshot_json"),
          let data = json.data(using: .utf8),
          let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return [] }

    let rows = (root["shortcutHabits"] as? [[String: Any]])
      ?? (root["upcoming"] as? [[String: Any]])
      ?? []
    var seen = Set<String>()
    return rows.compactMap { row in
      guard let id = (row["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
            let name = (row["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
            !id.isEmpty,
            !name.isEmpty,
            seen.insert(id).inserted
      else { return nil }
      let unit = (row["unit"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      return ShortcutHabitRecord(
        id: id,
        name: name,
        unit: unit?.isEmpty == false ? unit : nil,
        target: (row["target"] as? NSNumber)?.doubleValue
      )
    }
  }
}

@available(iOS 16.0, *)
struct LaganHabitEntity: AppEntity, Identifiable {
  static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Habit")
  static let defaultQuery = LaganHabitQuery()

  let id: String
  let name: String
  let unit: String?
  let target: Double?

  fileprivate init(record: ShortcutHabitRecord) {
    id = record.id
    name = record.name
    unit = record.unit
    target = record.target
  }

  var displayRepresentation: DisplayRepresentation {
    let subtitle: String? = {
      guard let target, target > 0 else { return unit }
      let value = target.rounded() == target ? String(Int(target)) : String(format: "%.2f", target)
      return unit.map { "Goal: \(value) \($0)" } ?? "Goal: \(value)"
    }()
    if let subtitle {
      return DisplayRepresentation(title: "\(name)", subtitle: "\(subtitle)")
    }
    return DisplayRepresentation(title: "\(name)")
  }
}

@available(iOS 16.0, *)
struct LaganHabitQuery: EntityStringQuery {
  func entities(for identifiers: [String]) async throws -> [LaganHabitEntity] {
    let wanted = Set(identifiers)
    return ShortcutCatalog.habits().filter { wanted.contains($0.id) }.map(LaganHabitEntity.init)
  }

  func entities(matching string: String) async throws -> [LaganHabitEntity] {
    let needle = string.trimmingCharacters(in: .whitespacesAndNewlines)
    let habits = ShortcutCatalog.habits()
    if needle.isEmpty { return habits.map(LaganHabitEntity.init) }
    return habits
      .filter { $0.name.localizedCaseInsensitiveContains(needle) }
      .map(LaganHabitEntity.init)
  }

  func suggestedEntities() async throws -> [LaganHabitEntity] {
    ShortcutCatalog.habits().map(LaganHabitEntity.init)
  }
}

actor LaganShortcutActionCoordinator {
  static let shared = LaganShortcutActionCoordinator()

  private var defaults: UserDefaults? { UserDefaults(suiteName: shortcutAppGroup) }

  private func accessGroup() -> String? {
    guard let prefix = Bundle.main.object(forInfoDictionaryKey: "LaganAppIdentifierPrefix") as? String,
          !prefix.isEmpty
    else { return nil }
    return prefix + shortcutKeychainSuffix
  }

  private func token() -> String? {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: shortcutKeychainService,
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

  private func clearToken() {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: shortcutKeychainService,
      kSecAttrAccount as String: "widget-token",
    ]
    if let group = accessGroup() { query[kSecAttrAccessGroup as String] = group }
    SecItemDelete(query as CFDictionary)
  }

  private func queue() -> [ShortcutPendingAction] {
    guard let data = defaults?.data(forKey: shortcutQueueKey),
          let actions = try? JSONDecoder().decode([ShortcutPendingAction].self, from: data)
    else { return [] }
    return actions
  }

  private func saveQueue(_ actions: [ShortcutPendingAction]) {
    if actions.isEmpty {
      defaults?.removeObject(forKey: shortcutQueueKey)
    } else if let data = try? JSONEncoder().encode(actions) {
      defaults?.set(data, forKey: shortcutQueueKey)
    }
  }

  private func enqueue(_ action: ShortcutPendingAction) -> Bool {
    var actions = queue()
    if actions.contains(where: { $0.operationId == action.operationId }) { return true }
    guard actions.count < shortcutQueueLimit else { return false }
    actions.append(action)
    saveQueue(actions)
    return true
  }

  private func request(_ action: ShortcutPendingAction) async throws -> [String: Any] {
    guard let token = token(),
          let urlString = defaults?.string(forKey: "action_url"),
          let url = URL(string: urlString)
    else { throw ShortcutActionError(status: 401, code: "session_required") }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 20
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    if let anon = defaults?.string(forKey: "anon_key"), !anon.isEmpty {
      request.setValue(anon, forHTTPHeaderField: "apikey")
    }
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "action": "check_in",
      "habitId": action.habitId,
      "operationId": action.operationId,
    ])
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    guard (200..<300).contains(http.statusCode) else {
      if http.statusCode == 401 { clearToken() }
      throw ShortcutActionError(
        status: http.statusCode,
        code: value["code"] as? String ?? (http.statusCode == 401 ? "session_required" : "unknown")
      )
    }
    return value
  }

  private func amountLabel(_ response: [String: Any]) -> String? {
    guard let number = response["increment"] as? NSNumber else { return nil }
    let value = number.doubleValue
    let amount = value.rounded() == value
      ? String(Int(value))
      : String(format: "%.2f", value)
        .replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
        .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
    let unit = (response["unit"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return unit.isEmpty ? amount : "\(amount) \(unit)"
  }

  private func outcome(for error: ShortcutActionError) -> ShortcutActionOutcome {
    switch error.code {
    case "already_complete": return .alreadyComplete
    case "habit_unavailable": return .habitUnavailable
    case "session_required": return .setupRequired
    case "actions_disabled": return .disabled
    default: return .failed
    }
  }

  fileprivate func checkIn(habitId: String, habitName: String) async -> ShortcutActionOutcome {
    let action = ShortcutPendingAction(
      habitId: habitId,
      habitName: habitName,
      operationId: UUID().uuidString.lowercased(),
      createdAtMs: Date().timeIntervalSince1970 * 1000
    )
    do {
      let response = try await request(action)
      return .success(
        habitName: response["habitName"] as? String ?? habitName,
        amount: amountLabel(response)
      )
    } catch let error as URLError where [
      .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost,
    ].contains(error.code) {
      return enqueue(action) ? .queued : .queueFull
    } catch let error as ShortcutActionError {
      return outcome(for: error)
    } catch {
      return .failed
    }
  }

  func retryPending() async {
    var actions = queue()
    while let action = actions.first {
      do {
        _ = try await request(action)
        actions.removeFirst()
        saveQueue(actions)
      } catch let error as URLError where [
        .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost,
      ].contains(error.code) {
        return
      } catch let error as ShortcutActionError {
        if ["session_required", "actions_disabled"].contains(error.code) { return }
        actions.removeFirst()
        saveQueue(actions)
      } catch {
        return
      }
    }
  }
}

@available(iOS 16.0, *)
struct LaganLogHabitIntent: AppIntent {
  static let title: LocalizedStringResource = "Log Habit"
  static let description = IntentDescription("Log the default check-in amount for a Lagan habit.")
  static let openAppWhenRun = false

  @Parameter(title: "Habit", description: "The Lagan habit to log.")
  var habit: LaganHabitEntity?

  static var parameterSummary: some ParameterSummary {
    Summary("Log \(\.$habit)")
  }

  init() {}

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let selected: LaganHabitEntity
    if let habit {
      selected = habit
    } else {
      let options = ShortcutCatalog.habits().map(LaganHabitEntity.init)
      guard !options.isEmpty else {
        return .result(dialog: "Open Lagan first so Siri can load your habits.")
      }
      selected = try await $habit.requestDisambiguation(
        among: options,
        dialog: "Which habit would you like to log?"
      )
    }

    let outcome = await LaganShortcutActionCoordinator.shared.checkIn(
      habitId: selected.id,
      habitName: selected.name
    )
    switch outcome {
    case let .success(habitName, amount):
      if let amount { return .result(dialog: "Logged \(amount) for \(habitName).") }
      return .result(dialog: "Logged \(habitName).")
    case .queued:
      return .result(dialog: "You're offline. \(selected.name) is queued and Lagan will retry.")
    case .alreadyComplete:
      return .result(dialog: "\(selected.name) is already complete today.")
    case .habitUnavailable:
      return .result(dialog: "That habit is no longer available in Lagan.")
    case .setupRequired:
      return .result(dialog: "Open Lagan first to enable Siri habit logging.")
    case .disabled:
      return .result(dialog: "Siri habit logging is temporarily unavailable.")
    case .queueFull:
      return .result(dialog: "Lagan's offline queue is full. Open Lagan before logging another habit.")
    case .failed:
      return .result(dialog: "Lagan couldn't log \(selected.name). Please try again.")
    }
  }
}

@available(iOS 16.0, *)
struct LaganAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: LaganLogHabitIntent(),
      phrases: [
        "Log \(\.$habit) with \(.applicationName)",
        "Check in \(\.$habit) with \(.applicationName)",
        "Log a habit with \(.applicationName)",
      ],
      shortTitle: "Log Habit",
      systemImageName: "checkmark.circle"
    )
  }

  static var shortcutTileColor: ShortcutTileColor { .orange }
}
