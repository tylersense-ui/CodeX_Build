import { scanAll, countPortOpeners } from "/bb_bn1/lib/net.js";
import { listTargets } from "/bb_bn1/lib/targeting.js";

const PROGRAMS = [
  "BruteSSH.exe",
  "FTPCrack.exe",
  "relaySMTP.exe",
  "HTTPWorm.exe",
  "SQLInject.exe",
  "ServerProfiler.exe",
  "DeepscanV1.exe",
  "DeepscanV2.exe",
  "AutoLink.exe",
  "Formulas.exe",
];

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
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(
    date.getUTCMinutes(),
  )}${pad(date.getUTCSeconds())}Z`;
}

/**
 * @param {NS} ns
 * @param {string[]} rootedHosts
 */
function summarizeProcesses(ns, rootedHosts) {
  const result = [];

  for (const host of rootedHosts) {
    const processes = ns.ps(host);
    if (processes.length === 0) continue;

    const perScript = new Map();
    let totalThreads = 0;

    for (const proc of processes) {
      totalThreads += proc.threads;
      const current = perScript.get(proc.filename) || {
        filename: proc.filename,
        threads: 0,
        instances: 0,
      };
      current.threads += proc.threads;
      current.instances += 1;
      perScript.set(proc.filename, current);
    }

    const scripts = [...perScript.values()].sort((a, b) => b.threads - a.threads || a.filename.localeCompare(b.filename));

    result.push({
      host,
      processCount: processes.length,
      totalThreads,
      scripts,
    });
  }

  result.sort((a, b) => b.totalThreads - a.totalThreads || a.host.localeCompare(b.host));
  return result;
}

function buildHints(report) {
  const hints = [];

  if (!report.operations.controllerRunning) {
    hints.push("Controller is not running. Run /bb_bn1/main/deploy.js.");
  }

  if (!report.progress.programsOwned.BruteSSHExe) {
    hints.push("Buy TOR and BruteSSH.exe as first unlock.");
  }

  if (report.progress.portOpenersOwned < 5) {
    hints.push("Keep buying port openers to expand root coverage.");
  }

  if (report.network.bestTarget && report.network.bestTarget.moneyPct < 0.85) {
    hints.push("Best target not fully prepped. Let prep cycles run longer.");
  }

  if (report.resources.home.freeRam < 8) {
    hints.push("Home free RAM is low. Consider next home RAM upgrade.");
  }

  return hints;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const outputFile = String(getFlagValue(ns, "--out", "/bb_bn1/reports/snapshot-latest.json"));
  const topCount = Math.max(1, Number(getFlagValue(ns, "--top", 15)));
  const label = String(getFlagValue(ns, "--label", "")).trim();
  const noArchive = hasFlag(ns, "--no-archive");

  const now = new Date();
  const servers = scanAll(ns);
  const rootedHosts = servers.filter((host) => ns.hasRootAccess(host));
  const unrootedHosts = servers.filter((host) => !ns.hasRootAccess(host));

  const player = ns.getPlayer();
  const scriptIncome = ns.getTotalScriptIncome();
  const openersOwned = countPortOpeners(ns);

  let totalMaxRam = 0;
  let totalUsedRam = 0;

  for (const host of rootedHosts) {
    totalMaxRam += ns.getServerMaxRam(host);
    totalUsedRam += ns.getServerUsedRam(host);
  }

  const homeMaxRam = ns.getServerMaxRam("home");
  const homeUsedRam = ns.getServerUsedRam("home");

  const purchasedServers = ns.getPurchasedServers().map((host) => ({
    host,
    maxRam: num(ns.getServerMaxRam(host)),
    usedRam: num(ns.getServerUsedRam(host)),
    freeRam: num(ns.getServerMaxRam(host) - ns.getServerUsedRam(host)),
  }));

  purchasedServers.sort((a, b) => b.maxRam - a.maxRam || a.host.localeCompare(b.host));

  const targets = listTargets(ns, servers);
  const topTargets = targets.slice(0, topCount).map((target) => ({
    host: target.host,
    score: num(target.score),
    money: num(target.money),
    maxMoney: num(target.maxMoney),
    moneyPct: num(target.moneyPct),
    sec: num(target.sec),
    minSec: num(target.minSec),
    secDelta: num(target.secDelta),
    growth: target.growth,
    requiredHack: target.requiredHack,
    hackChance: num(target.hackChance),
    hackTime: num(target.hackTime),
    growTime: num(target.growTime),
    weakenTime: num(target.weakenTime),
  }));

  const processSummary = summarizeProcesses(ns, rootedHosts);

  const report = {
    schema: "bb_bn1_snapshot_v1",
    generatedAt: now.toISOString(),
    label,
    player: {
      money: num(player.money),
      hacking: ns.getHackingLevel(),
      city: player.city,
      location: player.location,
      factions: Array.isArray(player.factions) ? [...player.factions] : [],
      numPeopleKilled: player.numPeopleKilled ?? 0,
      entropy: num(player.entropy ?? 0),
      hp: player.hp ?? null,
      playtimeSinceLastAug: player.playtimeSinceLastAug ?? 0,
      playtimeSinceLastBitnode: player.playtimeSinceLastBitnode ?? 0,
    },
    progress: {
      portOpenersOwned: openersOwned,
      programsOwned: {
        BruteSSHExe: ns.fileExists("BruteSSH.exe", "home"),
        FTPCrackExe: ns.fileExists("FTPCrack.exe", "home"),
        relaySMTPExe: ns.fileExists("relaySMTP.exe", "home"),
        HTTPWormExe: ns.fileExists("HTTPWorm.exe", "home"),
        SQLInjectExe: ns.fileExists("SQLInject.exe", "home"),
        FormulasExe: ns.fileExists("Formulas.exe", "home"),
      },
      ownedPrograms: PROGRAMS.filter((program) => ns.fileExists(program, "home")),
    },
    resources: {
      home: {
        maxRam: num(homeMaxRam),
        usedRam: num(homeUsedRam),
        freeRam: num(homeMaxRam - homeUsedRam),
        cpuCores: ns.getServer("home").cpuCores,
      },
      networkRam: {
        totalMaxRam: num(totalMaxRam),
        totalUsedRam: num(totalUsedRam),
        totalFreeRam: num(totalMaxRam - totalUsedRam),
      },
      purchasedServers,
      scriptIncomePerSec: num(scriptIncome[0]),
      scriptExpPerSec: num(scriptIncome[1]),
    },
    network: {
      totalServers: servers.length,
      rootedServers: rootedHosts.length,
      unrootedServers: unrootedHosts.length,
      rootedPercent: servers.length > 0 ? num((rootedHosts.length / servers.length) * 100, 2) : 0,
      serversWithMoney: targets.length,
      bestTarget: topTargets.length > 0 ? topTargets[0] : null,
      topTargets,
      serverTable: servers
        .map((host) => ({
          host,
          rooted: ns.hasRootAccess(host),
          purchasedByPlayer: ns.getServer(host).purchasedByPlayer,
          requiredHack: ns.getServerRequiredHackingLevel(host),
          requiredPorts: ns.getServerNumPortsRequired(host),
          maxRam: num(ns.getServerMaxRam(host)),
          moneyMax: num(ns.getServerMaxMoney(host)),
          moneyAvailable: num(ns.getServerMoneyAvailable(host)),
          minSec: num(ns.getServerMinSecurityLevel(host)),
          sec: num(ns.getServerSecurityLevel(host)),
        }))
        .sort((a, b) => a.requiredHack - b.requiredHack || b.moneyMax - a.moneyMax),
    },
    operations: {
      controllerRunning: ns.scriptRunning("/bb_bn1/main/controller.js", "home"),
      runningHosts: processSummary.length,
      processSummary,
    },
  };

  report.hints = buildHints(report);

  const payload = JSON.stringify(report, null, 2);
  ns.write(outputFile, payload, "w");

  let archiveFile = "";
  if (!noArchive) {
    archiveFile = `/bb_bn1/reports/snapshot-${toTag(now)}.json`;
    ns.write(archiveFile, payload, "w");
  }

  const archiveNote = archiveFile ? ` archive=${archiveFile}` : "";
  ns.tprint(`[snapshot] wrote ${outputFile}${archiveNote}`);
}