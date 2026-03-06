function hasFlag(ns, flag) {
  return ns.args.includes(flag);
}

function fmtDelta(value) {
  if (!Number.isFinite(value)) return "0";
  const sign = value >= 0 ? "+" : "";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${sign}${(value / 1e12).toFixed(2)}t`;
  if (abs >= 1e9) return `${sign}${(value / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `${sign}${(value / 1e6).toFixed(2)}m`;
  if (abs >= 1e3) return `${sign}${(value / 1e3).toFixed(2)}k`;
  return `${sign}${value.toFixed(2)}`;
}

/** @param {NS} ns */
function listArchivedSnapshots(ns) {
  return ns
    .ls("home", "/bb_bn1/reports/snapshot-")
    .filter((file) => file.endsWith(".json") && !file.endsWith("latest.json"))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * @param {NS} ns
 * @param {string} file
 */
function readReport(ns, file) {
  if (!ns.fileExists(file, "home")) return null;
  try {
    return JSON.parse(ns.read(file));
  } catch {
    return null;
  }
}

/** @param {NS} ns */
export async function main(ns) {
  const asJson = hasFlag(ns, "--json");

  let oldFile = String(ns.args[0] ?? "");
  let newFile = String(ns.args[1] ?? "");

  if (!oldFile || !newFile) {
    const snapshots = listArchivedSnapshots(ns);
    if (snapshots.length < 2) {
      ns.tprint("[diff] need at least two archived snapshots");
      ns.tprint("[diff] run /bb_bn1/report/snapshot.js twice (without --no-archive)");
      return;
    }

    oldFile = snapshots[snapshots.length - 2];
    newFile = snapshots[snapshots.length - 1];
  }

  const oldReport = readReport(ns, oldFile);
  const newReport = readReport(ns, newFile);

  if (!oldReport || !newReport) {
    ns.tprint(`[diff] unable to parse reports: old=${oldFile} new=${newFile}`);
    return;
  }

  const oldTime = Date.parse(oldReport.generatedAt ?? "");
  const newTime = Date.parse(newReport.generatedAt ?? "");
  const elapsedMinutes = Number.isFinite(oldTime) && Number.isFinite(newTime) ? (newTime - oldTime) / 60000 : 0;

  const payload = {
    oldFile,
    newFile,
    oldTime: oldReport.generatedAt,
    newTime: newReport.generatedAt,
    elapsedMinutes,
    delta: {
      money: (newReport.player?.money ?? 0) - (oldReport.player?.money ?? 0),
      hacking: (newReport.player?.hacking ?? 0) - (oldReport.player?.hacking ?? 0),
      rootedServers: (newReport.network?.rootedServers ?? 0) - (oldReport.network?.rootedServers ?? 0),
      totalServers: (newReport.network?.totalServers ?? 0) - (oldReport.network?.totalServers ?? 0),
      incomePerSec: (newReport.resources?.scriptIncomePerSec ?? 0) - (oldReport.resources?.scriptIncomePerSec ?? 0),
      expPerSec: (newReport.resources?.scriptExpPerSec ?? 0) - (oldReport.resources?.scriptExpPerSec ?? 0),
      openersOwned: (newReport.progress?.portOpenersOwned ?? 0) - (oldReport.progress?.portOpenersOwned ?? 0),
    },
    bestTarget: {
      old: oldReport.network?.bestTarget?.host ?? null,
      new: newReport.network?.bestTarget?.host ?? null,
    },
  };

  if (asJson) {
    ns.tprint(`BN1_DIFF ${JSON.stringify(payload)}`);
    return;
  }

  const lines = [];
  lines.push(`[diff] old=${oldFile}`);
  lines.push(`[diff] new=${newFile}`);
  lines.push(`elapsed=${elapsedMinutes.toFixed(2)}m`);
  lines.push(`money ${fmtDelta(payload.delta.money)}`);
  lines.push(`hacking +${payload.delta.hacking}`);
  lines.push(`rooted ${payload.delta.rootedServers >= 0 ? "+" : ""}${payload.delta.rootedServers}`);
  lines.push(`income/s ${fmtDelta(payload.delta.incomePerSec)}`);
  lines.push(`exp/s ${fmtDelta(payload.delta.expPerSec)}`);
  lines.push(`openers ${payload.delta.openersOwned >= 0 ? "+" : ""}${payload.delta.openersOwned}`);
  lines.push(`bestTarget ${payload.bestTarget.old ?? "none"} -> ${payload.bestTarget.new ?? "none"}`);

  ns.tprint(lines.join("\n"));
}