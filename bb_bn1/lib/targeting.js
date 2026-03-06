/**
 * @param {NS} ns
 * @param {string} host
 */
export function scoreTarget(ns, host) {
  const maxMoney = ns.getServerMaxMoney(host);
  if (maxMoney <= 0) return 0;

  const chance = Math.max(0.01, ns.hackAnalyzeChance(host));
  const growth = Math.max(1, ns.getServerGrowth(host));
  const weakenTime = Math.max(1, ns.getWeakenTime(host));

  return (maxMoney * chance * (1 + growth / 100)) / (weakenTime / 1000);
}

/**
 * @param {NS} ns
 * @param {string[]} servers
 */
export function listTargets(ns, servers) {
  const playerHack = ns.getHackingLevel();
  const targets = [];

  for (const host of servers) {
    if (host === "home") continue;
    if (!ns.hasRootAccess(host)) continue;

    const maxMoney = ns.getServerMaxMoney(host);
    if (maxMoney <= 0) continue;

    const requiredHack = ns.getServerRequiredHackingLevel(host);
    if (requiredHack > playerHack) continue;

    const money = ns.getServerMoneyAvailable(host);
    const minSec = ns.getServerMinSecurityLevel(host);
    const sec = ns.getServerSecurityLevel(host);

    targets.push({
      host,
      score: scoreTarget(ns, host),
      money,
      maxMoney,
      moneyPct: maxMoney > 0 ? money / maxMoney : 0,
      sec,
      minSec,
      secDelta: sec - minSec,
      growth: ns.getServerGrowth(host),
      requiredHack,
      hackChance: ns.hackAnalyzeChance(host),
      hackTime: ns.getHackTime(host),
      growTime: ns.getGrowTime(host),
      weakenTime: ns.getWeakenTime(host),
    });
  }

  targets.sort((a, b) => b.score - a.score || b.maxMoney - a.maxMoney);
  return targets;
}

/**
 * @param {NS} ns
 * @param {string[]} servers
 */
export function pickBestTarget(ns, servers) {
  const targets = listTargets(ns, servers);
  return targets.length > 0 ? targets[0] : null;
}