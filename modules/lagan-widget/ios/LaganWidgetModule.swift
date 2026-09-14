import ExpoModulesCore
import Foundation
import Security
import WidgetKit

private let appGroup = "group.health.lagan.app"
private let keychainSuffix = "health.lagan.widget.shared"
private let keychainService = "health.lagan.widget.actions"

private func sharedAccessGroup() -> String? {
  guard let prefix = Bundle.main.object(forInfoDictionaryKey: "LaganAppIdentifierPrefix") as? String,
        !prefix.isEmpty else { return nil }
  return prefix + keychainSuffix
}

private func storeToken(_ token: String?) throws {
  var query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: keychainService,
    kSecAttrAccount as String: "widget-token",
  ]
  if let group = sharedAccessGroup() { query[kSecAttrAccessGroup as String] = group }
  SecItemDelete(query as CFDictionary)
  guard let token else { return }
  query[kSecValueData as String] = Data(token.utf8)
  query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
  let status = SecItemAdd(query as CFDictionary, nil)
  guard status == errSecSuccess else {
    throw NSError(domain: "LaganWidget", code: Int(status), userInfo: nil)
  }
}

private func hasStoredToken() -> Bool {
  var query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: keychainService,
    kSecAttrAccount as String: "widget-token",
    kSecReturnData as String: false,
    kSecMatchLimit as String: kSecMatchLimitOne,
  ]
  if let group = sharedAccessGroup() { query[kSecAttrAccessGroup as String] = group }
  return SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess
}

public final class LaganWidgetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LaganWidget")

    AsyncFunction("updateAsync") { (snapshotJson: String) in
      UserDefaults(suiteName: appGroup)?.set(snapshotJson, forKey: "snapshot_json")
      WidgetCenter.shared.reloadAllTimelines()
    }

    AsyncFunction("clearAsync") {
      UserDefaults(suiteName: appGroup)?.removeObject(forKey: "snapshot_json")
      WidgetCenter.shared.reloadAllTimelines()
    }

    AsyncFunction("getDeviceIdAsync") { () -> String in
      let defaults = UserDefaults(suiteName: appGroup)
      if let existing = defaults?.string(forKey: "device_id") { return existing }
      let value = UUID().uuidString.lowercased()
      defaults?.set(value, forKey: "device_id")
      return value
    }

    AsyncFunction("configureActionsAsync") { (configurationJson: String) in
      guard
        let data = configurationJson.data(using: .utf8),
        let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        let token = value["token"] as? String,
        token.count >= 32,
        let actionUrl = value["actionUrl"] as? String,
        actionUrl.hasPrefix("https://")
      else { throw NSError(domain: "LaganWidget", code: 1) }
      try storeToken(token)
      let defaults = UserDefaults(suiteName: appGroup)
      defaults?.set(actionUrl, forKey: "action_url")
      defaults?.set(value["anonKey"] as? String ?? "", forKey: "anon_key")
      defaults?.set(value["expiresAt"] as? String ?? "", forKey: "expires_at")
    }

    AsyncFunction("clearActionCredentialsAsync") {
      try storeToken(nil)
      let defaults = UserDefaults(suiteName: appGroup)
      ["action_url", "anon_key", "expires_at", "pending_action"].forEach {
        defaults?.removeObject(forKey: $0)
      }
    }


    AsyncFunction("hasValidActionSessionAsync") { () -> Bool in
      guard hasStoredToken(),
            let expiresAt = UserDefaults(suiteName: appGroup)?.string(forKey: "expires_at"),
            let expiry = ISO8601DateFormatter().date(from: expiresAt)
      else { return false }
      // Rotate before the final seven days rather than failing mid-queue.
      return expiry.timeIntervalSinceNow > 7 * 24 * 60 * 60
    }
  }
}
