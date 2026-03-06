function hasFlag(ns, flag) {
  return ns.args.includes(flag);
}

function getFlagValue(ns, flag, fallback) {
  const index = ns.args.indexOf(flag);
  if (index === -1 || index + 1 >= ns.args.length) return fallback;
  return ns.args[index + 1];
}

function num(value, digits = 4) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function toTag(date) {
  const pad = (v) => String(v).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(
    date.getUTCMinutes(),
  )}${pad(date.getUTCSeconds())}Z`;
}

/** @param {NS} ns */
function scanAll(ns) {
  const seen = new Set(["home"]);
  const queue = ["home"];
  const out = [];

  while (queue.length > 0) {
    const host = queue.shift();
    out.push(host);
    for (const next of ns.scan(host)) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  return out;
}

/**
 * @param {NS} ns
 * @param {string[]} servers
 */
function pickBestTargetLite(ns, servers) {
  const hacking = ns.getHackingLevel();
  let best = null;

  for (const host of servers) {
    if (host === "home") continue;
    if (!ns.hasRootAccess(host)) continue;

    const requiredHack = ns.getServerRequiredHackingLevel(host);
    if (requiredHack > hacking) continue;

    const maxMoney = ns.getServerMaxMoney(host);
    if (maxMoney <= 0) continue;

    const money = ns.getServerMoneyAvailable(host);
    const sec = ns.getServerSecurityLevel(host);
    const minSec = ns.getServerMinSecurityLevel(host);

    const candidate = {
      host,
      maxMoney: num(maxMoney),
      money: num(money),
      moneyPct: maxMoney > 0 ? num(money / maxMoney) : 0,
      sec: num(sec),
      minSec: num(minSec),
      secDelta: num(sec - minSec),
      requiredHack,
    };

    if (!best || candidate.maxMoney > best.maxMoney) {
      best = candidate;
    }
  }

  return best;
}

/** @param {NS} ns */
function countPortOpenersLite(ns) {
  const openers = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
  ];

  let count = 0;
  for (const file of openers) {
    if (ns.fileExists(file, "home")) count += 1;
  }

  return count;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const outputFile = String(getFlagValue(ns, "--out", "/bb_bn1/reports/snapshot-lite-latest.json"));
  const label = String(getFlagValue(ns, "--label", "")).trim();
  const noArchive = hasFlag(ns, "--no-archive");
  const compact = hasFlag(ns, "--compact");

  const now = new Date();
  const servers = scanAll(ns);
  const rooted = servers.filter((host) => ns.hasRootAccess(host));
  const unrooted = servers.length - rooted.length;

  const player = ns.getPlayer();
  const income = ns.getTotalScriptIncome();
  const homeMax = ns.getServerMaxRam("home");
  const homeUsed = ns.getServerUsedRam("home");

  const report = {
    schema: "bb_bn1_snapshot_lite_v1",
    generatedAt: now.toISOString(),
    label,
    player: {
      hacking: ns.getHackingLevel(),
      money: num(player.money),
      city: player.city,
    },
    resources: {
      home: {
        maxRam: num(homeMax),
        usedRam: num(homeUsed),
        freeRam: num(homeMax - homeUsed),
      },
      scriptIncomePerSec: num(income[0]),
      scriptExpPerSec: num(income[1]),
    },
    progress: {
      portOpenersOwned: countPortOpenersLite(ns),
      programsOwned: {
        BruteSSHExe: ns.fileExists("BruteSSH.exe", "home"),
        FTPCrackExe: ns.fileExists("FTPCrack.exe", "home"),
        relaySMTPExe: ns.fileExists("relaySMTP.exe", "home"),
        HTTPWormExe: ns.fileExists("HTTPWorm.exe", "home"),
        SQLInjectExe: ns.fileExists("SQLInject.exe", "home"),
      },
    },
    network: {
      totalServers: servers.length,
      rootedServers: rooted.length,
      unrootedServers: unrooted,
      bestTarget: pickBestTargetLite(ns, servers),
    },
    operations: {
      mainControllerRunning: ns.scriptRunning("/bb_bn1/main/controller.js", "home"),
      earlyControllerRunning: ns.scriptRunning("/bb_bn1/main/early-controller.js", "home"),
    },
  };

  const payload = JSON.stringify(report);
  ns.write(outputFile, `${payload}\n`, "w");

  let archiveFile = "";
  if (!noArchive) {
    archiveFile = `/bb_bn1/reports/snapshot-lite-${toTag(now)}.json`;
    ns.write(archiveFile, `${payload}\n`, "w");
  }

  if (compact) {
    ns.tprint(`BN1_REPORT ${payload}`);
    return;
  }

  const archivePart = archiveFile ? ` archive=${archiveFile}` : "";
  ns.tprint(`[snapshot-lite] wrote ${outputFile}${archivePart}`);
  ns.tprint(`BN1_REPORT ${payload}`);
}
