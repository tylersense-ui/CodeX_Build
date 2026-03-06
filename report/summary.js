function hasFlag(ns, flag) {
  return ns.args.includes(flag);
}

function getFlagValue(ns, flag, fallback) {
  const index = ns.args.indexOf(flag);
  if (index === -1 || index + 1 >= ns.args.length) return fallback;
  return ns.args[index + 1];
}

function fmtMoney(value) {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}t`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}m`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}k`;
  return value.toFixed(2);
}

function buildActions(report) {
  const actions = [];

  if (!report.operations?.controllerRunning) {
    actions.push("Run: run /bb_bn1/main/deploy.js --clean");
  }

  const openers = report.progress?.portOpenersOwned ?? 0;
  if (openers === 0) {
    actions.push("Buy TOR then BruteSSH.exe.");
  } else if (openers < 5) {
    actions.push("Buy next port opener to expand rooted servers.");
  }

  const rooted = report.network?.rootedServers ?? 0;
  const total = report.network?.totalServers ?? 0;
  if (total > 0 && rooted < total) {
    actions.push("Rerun deploy after new opener purchase to root more hosts.");
  }

  const best = report.network?.bestTarget;
  if (best && best.moneyPct < 0.85) {
    actions.push(`Target ${best.host} still in prep (money ${(best.moneyPct * 100).toFixed(1)}%).`);
  }

  return actions;
}

/** @param {NS} ns */
export async function main(ns) {
  const filePath = String(getFlagValue(ns, "--file", "/bb_bn1/reports/snapshot-latest.json"));
  const compact = hasFlag(ns, "--compact");

  if (!ns.fileExists(filePath, "home")) {
    ns.tprint(`[summary] missing report file: ${filePath}`);
    return;
  }

  let report;
  try {
    report = JSON.parse(ns.read(filePath));
  } catch {
    ns.tprint(`[summary] invalid JSON in ${filePath}`);
    return;
  }

  const best = report.network?.bestTarget;
  const compactPayload = {
    generatedAt: report.generatedAt,
    hacking: report.player?.hacking ?? 0,
    money: report.player?.money ?? 0,
    scriptIncomePerSec: report.resources?.scriptIncomePerSec ?? 0,
    rootCoverage: {
      rooted: report.network?.rootedServers ?? 0,
      total: report.network?.totalServers ?? 0,
    },
    openers: report.progress?.portOpenersOwned ?? 0,
    bestTarget: best
      ? {
          host: best.host,
          moneyPct: best.moneyPct,
          secDelta: best.secDelta,
          hackChance: best.hackChance,
        }
      : null,
  };

  if (compact) {
    ns.tprint(`BN1_REPORT ${JSON.stringify(compactPayload)}`);
    return;
  }

  const lines = [];
  lines.push(`[summary] source=${filePath}`);
  lines.push(`time=${report.generatedAt}`);
  lines.push(`player: hack=${report.player?.hacking ?? 0} money=${fmtMoney(report.player?.money ?? 0)}`);
  lines.push(
    `coverage: rooted=${report.network?.rootedServers ?? 0}/${report.network?.totalServers ?? 0}` +
      ` openers=${report.progress?.portOpenersOwned ?? 0}`,
  );
  lines.push(
    `home: ram=${fmtMoney(report.resources?.home?.usedRam ?? 0)}/${fmtMoney(report.resources?.home?.maxRam ?? 0)}` +
      ` free=${fmtMoney(report.resources?.home?.freeRam ?? 0)}`,
  );
  lines.push(
    `income: money/s=${fmtMoney(report.resources?.scriptIncomePerSec ?? 0)}` +
      ` exp/s=${fmtMoney(report.resources?.scriptExpPerSec ?? 0)}`,
  );

  if (best) {
    lines.push(
      `bestTarget: ${best.host} money=${(best.moneyPct * 100).toFixed(1)}%` +
        ` sec+${best.secDelta.toFixed(2)} chance=${(best.hackChance * 100).toFixed(1)}%`,
    );
  } else {
    lines.push("bestTarget: none");
  }

  const actions = buildActions(report);
  if (actions.length > 0) {
    lines.push("nextActions:");
    for (const action of actions) {
      lines.push(`- ${action}`);
    }
  }

  ns.tprint(lines.join("\n"));
}