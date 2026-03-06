/** @param {NS} ns */
export function scanAll(ns, start = "home") {
  const seen = new Set([start]);
  const queue = [start];
  const result = [];

  while (queue.length > 0) {
    const host = queue.shift();
    result.push(host);
    for (const next of ns.scan(host)) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  return result;
}

const OPENER_PROGRAMS = [
  "BruteSSH.exe",
  "FTPCrack.exe",
  "relaySMTP.exe",
  "HTTPWorm.exe",
  "SQLInject.exe",
];

/** @param {NS} ns */
export function countPortOpeners(ns) {
  let count = 0;
  for (const program of OPENER_PROGRAMS) {
    if (ns.fileExists(program, "home")) count += 1;
  }
  return count;
}

/** @param {NS} ns */
export function getRootedServers(ns, start = "home") {
  return scanAll(ns, start).filter((host) => ns.hasRootAccess(host));
}

/**
 * @param {NS} ns
 * @param {number} scriptRam
 * @param {number} reserveHomeRam
 */
export function getUsableHosts(ns, scriptRam, reserveHomeRam = 32) {
  const rooted = getRootedServers(ns);
  const usable = [];

  for (const host of rooted) {
    const maxRam = ns.getServerMaxRam(host);
    if (maxRam < scriptRam) continue;

    const usedRam = ns.getServerUsedRam(host);
    const reserve = host === "home" ? reserveHomeRam : 0;
    const freeRam = Math.max(0, maxRam - usedRam - reserve);
    const threads = Math.floor(freeRam / scriptRam);

    if (threads <= 0) continue;
    usable.push({ host, threads, freeRam, usedRam, maxRam });
  }

  usable.sort((a, b) => b.threads - a.threads || a.host.localeCompare(b.host));
  return usable;
}

/** @param {{threads:number}[]} usableHosts */
export function totalThreads(usableHosts) {
  return usableHosts.reduce((sum, item) => sum + item.threads, 0);
}