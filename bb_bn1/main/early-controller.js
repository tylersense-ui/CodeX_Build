function getFlagValue(ns, flag, fallback) {
  const index = ns.args.indexOf(flag);
  if (index === -1 || index + 1 >= ns.args.length) return fallback;
  return ns.args[index + 1];
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

/** @param {NS} ns */
function pickTarget(ns) {
  const hacking = ns.getHackingLevel();
  let best = "";
  let bestMoney = 0;

  for (const host of scanAll(ns)) {
    if (host === "home") continue;
    if (!ns.hasRootAccess(host)) continue;

    const requiredHack = ns.getServerRequiredHackingLevel(host);
    if (requiredHack > hacking) continue;

    const maxMoney = ns.getServerMaxMoney(host);
    if (maxMoney <= bestMoney) continue;

    best = host;
    bestMoney = maxMoney;
  }

  if (best) return best;
  if (ns.hasRootAccess("n00dles")) return "n00dles";
  return "";
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const forcedTarget = String(getFlagValue(ns, "--target", "")).trim();
  const retargetEvery = Math.max(1, Number(getFlagValue(ns, "--retarget-loops", 20)));

  let target = forcedTarget || pickTarget(ns);
  if (!target) {
    ns.tprint("[early-controller] no target available yet (need rooted server with money)");
    return;
  }

  ns.tprint(`[early-controller] started on target=${target}`);

  let loops = 0;
  while (true) {
    if (!forcedTarget && loops % retargetEvery === 0) {
      const next = pickTarget(ns);
      if (next && next !== target) {
        target = next;
        ns.print(`[early-controller] retarget -> ${target}`);
      }
    }

    const maxMoney = ns.getServerMaxMoney(target);
    const money = ns.getServerMoneyAvailable(target);
    const minSec = ns.getServerMinSecurityLevel(target);
    const sec = ns.getServerSecurityLevel(target);

    if (sec > minSec + 5) {
      await ns.weaken(target);
    } else if (money < maxMoney * 0.75) {
      await ns.grow(target);
    } else {
      await ns.hack(target);
    }

    loops += 1;
  }
}
