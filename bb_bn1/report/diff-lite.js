function hasFlag(ns, flag) {
  return ns.args.includes(flag);
}

/** @param {NS} ns */
function listArchivedSnapshotsLite(ns) {
  return ns
    .ls("home", "/bb_bn1/reports/snapshot-lite-")
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
    const snapshots = listArchivedSnapshotsLite(ns);
    if (snapshots.length < 2) {
      ns.tprint("[diff-lite] need at least two archived lite snapshots");
      ns.tprint("[diff-lite] run /bb_bn1/report/snapshot-lite.js twice");
      return;
    }

    oldFile = snapshots[snapshots.length - 2];
    newFile = snapshots[snapshots.length - 1];
  }

  const oldReport = readReport(ns, oldFile);
  const newReport = readReport(ns, newFile);

  if (!oldReport || !newReport) {
    ns.tprint(`[diff-lite] unable to parse reports: old=${oldFile} new=${newFile}`);
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

  ns.tprint(`BN1_DIFF ${JSON.stringify(payload)}`);
}
