import SwiftUI
import UIKit
import WidgetKit

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
      WidgetDiagnostics.append(stage: "timeline_reload")
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
  private var needsReconnect: Bool {
    if entry.snapshot.lastAction?.status == "error"
      && entry.snapshot.lastAction?.message == "Open Lagan to reconnect" {
      return true
    }
    if #available(iOS 17.0, *) { return !WidgetStore.hasCredential }
    return false
  }

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
        .foregroundStyle(entry.snapshot.lastAction?.status == "success" ? Color.green : Color.secondary)
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
        actionTitle(needsReconnect ? "Open Lagan to reconnect" : (next?.checkInLabel ?? entry.snapshot.checkInLabel))
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
