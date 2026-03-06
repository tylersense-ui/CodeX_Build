import { countPortOpeners } from "/bb_bn1/lib/net.js";

/** @param {NS} ns */
function openPorts(ns, host) {
  let opened = 0;

  if (ns.fileExists("BruteSSH.exe", "home")) {
    try {
      ns.brutessh(host);
      opened += 1;
    } catch {
      // ignored
    }
  }

  if (ns.fileExists("FTPCrack.exe", "home")) {
    try {
      ns.ftpcrack(host);
      opened += 1;
    } catch {
      // ignored
    }
  }

  if (ns.fileExists("relaySMTP.exe", "home")) {
    try {
      ns.relaysmtp(host);
      opened += 1;
    } catch {
      // ignored
    }
  }

  if (ns.fileExists("HTTPWorm.exe", "home")) {
    try {
      ns.httpworm(host);
      opened += 1;
    } catch {
      // ignored
    }
  }

  if (ns.fileExists("SQLInject.exe", "home")) {
    try {
      ns.sqlinject(host);
      opened += 1;
    } catch {
      // ignored
    }
  }

  return opened;
}

/**
 * @param {NS} ns
 * @param {string} host
 */
export function canNuke(ns, host) {
  if (host === "home") return true;
  if (ns.hasRootAccess(host)) return true;
  return countPortOpeners(ns) >= ns.getServerNumPortsRequired(host);
}

/**
 * @param {NS} ns
 * @param {string} host
 */
export function tryRoot(ns, host) {
  if (host === "home") return true;
  if (ns.hasRootAccess(host)) return true;

  const requiredPorts = ns.getServerNumPortsRequired(host);
  const openedPorts = openPorts(ns, host);
  if (openedPorts < requiredPorts) return false;

  try {
    ns.nuke(host);
  } catch {
    return false;
  }

  return ns.hasRootAccess(host);
}

/**
 * @param {NS} ns
 * @param {string[]} servers
 */
export function rootAll(ns, servers) {
  let gained = 0;

  for (const host of servers) {
    if (host === "home" || ns.hasRootAccess(host)) continue;
    const rooted = tryRoot(ns, host);
    if (rooted) gained += 1;
  }

  return gained;
}