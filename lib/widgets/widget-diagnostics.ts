export type HomeWidgetDiagnosticEntry = {
  timestampMs: number;
  stage: string;
  operationId: string | null;
  httpStatus: number | null;
  category: string | null;
  appVersion: string;
  buildNumber: string;
  runtimeVersion: string;
  osVersion: string;
};

const MAX_ENTRIES = 50;
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export function normalizeHomeWidgetDiagnostics(
  value: unknown,
  nowMs = Date.now(),
): HomeWidgetDiagnosticEntry[] {
  if (!Array.isArray(value)) return [];
  const cutoff = nowMs - MAX_AGE_MS;
  const entries: HomeWidgetDiagnosticEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const timestampMs = Number(raw.timestampMs);
    const stage = boundedString(raw.stage, 64);
    if (
      !Number.isFinite(timestampMs) ||
      timestampMs < cutoff ||
      timestampMs > nowMs + 60_000 ||
      !stage
    ) {
      continue;
    }
    const operation = boundedString(raw.operationId, 64);
    const status = Number(raw.httpStatus);
    entries.push({
      timestampMs,
      stage,
      operationId: operation && OPERATION_ID.test(operation) ? operation.toLowerCase() : null,
      httpStatus: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
      category: boundedString(raw.category, 64),
      appVersion: boundedString(raw.appVersion, 32) ?? "unknown",
      buildNumber: boundedString(raw.buildNumber, 32) ?? "unknown",
      runtimeVersion: boundedString(raw.runtimeVersion, 64) ?? "unknown",
      osVersion: boundedString(raw.osVersion, 128) ?? "unknown",
    });
  }
  return entries.sort((a, b) => a.timestampMs - b.timestampMs).slice(-MAX_ENTRIES);
}

export function parseHomeWidgetDiagnostics(payload: string): HomeWidgetDiagnosticEntry[] {
  try {
    return normalizeHomeWidgetDiagnostics(JSON.parse(payload));
  } catch {
    return [];
  }
}

export function formatHomeWidgetDiagnostics(entries: HomeWidgetDiagnosticEntry[]): string {
  if (!entries.length) return "No widget diagnostics recorded.";
  const header =
    "Lagan iOS Widget Diagnostics\nNo account, habit, URL, or credential data is included.";
  return [
    header,
    ...entries.map((entry) => {
      const details = [
        entry.category && `category=${entry.category}`,
        entry.httpStatus != null && `http=${entry.httpStatus}`,
        entry.operationId && `operation=${entry.operationId}`,
      ].filter(Boolean);
      return `${new Date(entry.timestampMs).toISOString()} ${entry.stage}${details.length ? ` ${details.join(" ")}` : ""} app=${entry.appVersion}(${entry.buildNumber}) runtime=${entry.runtimeVersion} os=${entry.osVersion}`;
    }),
  ].join("\n");
}
