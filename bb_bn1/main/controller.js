import { scanAll, getUsableHosts, totalThreads } from "/bb_bn1/lib/net.js";
import { rootAll } from "/bb_bn1/lib/root.js";
import { pickBestTarget } from "/bb_bn1/lib/targeting.js";

const HACK_SCRIPT = "/bb_bn1/workers/hack-once.js";
const GROW_SCRIPT = "/bb_bn1/workers/grow-once.js";
const WEAKEN_SCRIPT = "/bb_bn1/workers/weaken-once.js";

function hasFlag(ns, flag) {
  return ns.args.includes(flag);
}

function getFlagValue(ns, flag, fallback) {
  const index = ns.args.indexOf(flag);
  if (index === -1 || index + 1 >= ns.args.length) return fallback;
  return ns.args[index + 1];
}

function normalizeThreads(value, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  const floor = Math.floor(value);
  return floor < 0 ? 0 : floor;
}

function scaleTwo(growThreads, weakenThreads, maxThreads) {
  if (maxThreads <= 0) return [0, 0];
  if (maxThreads === 1) return [1, 0];
  if (growThreads + weakenThreads <= maxThreads) return [growThreads, weakenThreads];

  const total = Math.max(1, growThreads + weakenThreads);
  let grow = Math.max(1, Math.floor((growThreads / total) * maxThreads));
  let weaken = Math.max(1, maxThreads - grow);

  if (grow + weaken > maxThreads) {
    const overflow = grow + weaken - maxThreads;
    weaken = Math.max(1, weaken - overflow);
  }

  return [grow, weaken];
}

function scaleThree(hackThreads, growThreads, weakenThreads, maxThreads) {
  if (maxThreads <= 0) return [0, 0, 0];
  if (maxThreads === 1) return [0, 0, 1];
  if (maxThreads === 2) return [0, 1, 1];
  if (hackThreads + growThreads + weakenThreads <= maxThreads) {
    return [hackThreads, growThreads, weakenThreads];
  }

  const total = Math.max(1, hackThreads + growThreads + weakenThreads);
  let hack = Math.max(1, Math.floor((hackThreads / total) * maxThreads));
  let grow = Math.max(1, Math.floor((growThreads / total) * maxThreads));
  let weaken = Math.max(1, maxThreads - hack - grow);

  if (hack + grow + weaken > maxThreads) {
    const overflow = hack + grow + weaken - maxThreads;
    weaken = Math.max(1, weaken - overflow);
  }

  if (hack + grow + weaken > maxThreads) {
    const overflow = hack + grow + weaken - maxThreads;
    grow = Math.max(1, grow - overflow);
  }

  if (hack + grow + weaken > maxThreads) {
    const overflow = hack + grow + weaken - maxThreads;
    hack = Math.max(1, hack - overflow);
  }

  return [hack, grow, weaken];
}

/**
 * @param {NS} ns
 * @param {string} script
 * @param {number} totalNeeded
 * @param {(string|number|boolean)[]} scriptArgs
 * @param {number} reserveHomeRam
 */
function dispatchThreads(ns, script, totalNeeded, scriptArgs, reserveHomeRam) {
  if (totalNeeded <= 0) return 0;

  const scriptRam = ns.getScriptRam(script, "home");
  if (scriptRam <= 0) {
    ns.print(`[dispatch] missing script on home: ${script}`);
    return 0;
  }

  const hosts = getUsableHosts(ns, scriptRam, reserveHomeRam);
  let launched = 0;

  for (const hostInfo of hosts) {
    const remaining = totalNeeded - launched;
    if (remaining <= 0) break;

    const use = Math.min(remaining, hostInfo.threads);
    if (use <= 0) continue;

    const pid = ns.exec(script, hostInfo.host, use, ...scriptArgs);
    if (pid !== 0) launched += use;
  }

  return launched;
}

function buildPlan(ns, target, maxThreads) {
  const moneyNow = Math.max(0, ns.getServerMoneyAvailable(target));
  const moneyMax = Math.max(1, ns.getServerMaxMoney(target));
  const secNow = ns.getServerSecurityLevel(target);
  const secMin = ns.getServerMinSecurityLevel(target);
  const secDelta = secNow - secMin;

  if (maxThreads <= 0) {
    return {
      mode: "idle",
      hackThreads: 0,
      growThreads: 0,
      weakenThreads: 0,
      sleepMs: 2500,
      moneyNow,
      moneyMax,
      secNow,
      secMin,
    };
  }

  if (secDelta > 3) {
    return {
      mode: "stabilize-security",
      hackThreads: 0,
      growThreads: 0,
      weakenThreads: maxThreads,
      sleepMs: ns.getWeakenTime(target) + 250,
      moneyNow,
      moneyMax,
      secNow,
      secMin,
    };
  }

  if (moneyNow < moneyMax * 0.9) {
    const growthFactor = moneyMax / Math.max(1, moneyNow);
    let growThreads = normalizeThreads(ns.growthAnalyze(target, growthFactor), 1);
    let weakenThreads = normalizeThreads((growThreads * 0.004) / 0.05 + 1, 1);

    [growThreads, weakenThreads] = scaleTwo(growThreads, weakenThreads, maxThreads);

    return {
      mode: "prep-money",
      hackThreads: 0,
      growThreads,
      weakenThreads,
      sleepMs: Math.max(ns.getGrowTime(target), ns.getWeakenTime(target)) + 250,
      moneyNow,
      moneyMax,
      secNow,
      secMin,
    };
  }

  const hackFraction = 0.08;
  const hackPerThread = ns.hackAnalyze(target);

  let hackThreads = hackPerThread > 0 ? normalizeThreads(hackFraction / hackPerThread, 1) : 1;
  hackThreads = Math.max(1, Math.min(hackThreads, Math.max(1, Math.floor(maxThreads * 0.4))));

  let growThreads = normalizeThreads(ns.growthAnalyze(target, 1 / (1 - hackFraction)), 1);
  let weakenThreads = normalizeThreads(((hackThreads * 0.002) + (growThreads * 0.004)) / 0.05 + 1, 1);

  [hackThreads, growThreads, weakenThreads] = scaleThree(hackThreads, growThreads, weakenThreads, maxThreads);

  return {
    mode: "batch",
    hackThreads,
    growThreads,
    weakenThreads,
    sleepMs: ns.getWeakenTime(target) + 250,
    moneyNow,
    moneyMax,
    secNow,
    secMin,
  };
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}t`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}m`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}k`;
  return value.toFixed(2);
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const reserveHomeRam = Number(getFlagValue(ns, "--reserve-home", 0));
  const manualTarget = String(getFlagValue(ns, "--target", "")).trim();
  const idleMs = Number(getFlagValue(ns, "--idle", 5000));
  const once = hasFlag(ns, "--once");

  const workerScripts = [HACK_SCRIPT, GROW_SCRIPT, WEAKEN_SCRIPT];
  for (const script of workerScripts) {
    if (ns.getScriptRam(script, "home") <= 0) {
      ns.tprint(`[controller] missing script on home: ${script}`);
      return;
    }
  }

  while (true) {
    const servers = scanAll(ns);
    const newlyRooted = rootAll(ns, servers);

    let target = manualTarget;
    if (target) {
      const targetExists = ns.serverExists(target);
      const targetRooted = targetExists ? ns.hasRootAccess(target) : false;
      const targetMoney = targetExists ? ns.getServerMaxMoney(target) : 0;
      const targetHackReq = targetExists ? ns.getServerRequiredHackingLevel(target) : 999999;
      const canUseManual = targetExists && targetRooted && targetMoney > 0 && targetHackReq <= ns.getHackingLevel();
      if (!canUseManual) target = "";
    }

    if (!target) {
      const best = pickBestTarget(ns, servers);
      target = best ? best.host : "";
    }

    if (!target) {
      ns.print(`[loop] no viable target yet, newRoot=${newlyRooted}`);
      if (once) break;
      await ns.sleep(idleMs);
      continue;
    }

    const maxWorkerRam = Math.max(
      ns.getScriptRam(HACK_SCRIPT, "home"),
      ns.getScriptRam(GROW_SCRIPT, "home"),
      ns.getScriptRam(WEAKEN_SCRIPT, "home"),
    );
    const usable = getUsableHosts(ns, maxWorkerRam, reserveHomeRam);
    const capacity = totalThreads(usable);

    if (capacity <= 0) {
      ns.print(`[loop] no free threads, target=${target}`);
      if (once) break;
      await ns.sleep(idleMs);
      continue;
    }

    const plan = buildPlan(ns, target, capacity);
    let launchedHack = 0;
    let launchedGrow = 0;
    let launchedWeaken = 0;

    if (plan.mode === "stabilize-security") {
      launchedWeaken = dispatchThreads(ns, WEAKEN_SCRIPT, plan.weakenThreads, [target], reserveHomeRam);
    } else if (plan.mode === "prep-money") {
      launchedGrow = dispatchThreads(ns, GROW_SCRIPT, plan.growThreads, [target], reserveHomeRam);
      launchedWeaken = dispatchThreads(ns, WEAKEN_SCRIPT, plan.weakenThreads, [target], reserveHomeRam);
    } else if (plan.mode === "batch") {
      launchedHack = dispatchThreads(ns, HACK_SCRIPT, plan.hackThreads, [target], reserveHomeRam);
      launchedGrow = dispatchThreads(ns, GROW_SCRIPT, plan.growThreads, [target], reserveHomeRam);
      launchedWeaken = dispatchThreads(ns, WEAKEN_SCRIPT, plan.weakenThreads, [target], reserveHomeRam);
    }

    const moneyAfter = ns.getServerMoneyAvailable(target);
    const secAfter = ns.getServerSecurityLevel(target);

    ns.print(
      `[${plan.mode}] target=${target} newRoot=${newlyRooted}` +
        ` launch(h/g/w)=${launchedHack}/${launchedGrow}/${launchedWeaken}` +
        ` money=${formatMoney(moneyAfter)}/${formatMoney(plan.moneyMax)}` +
        ` sec=${secAfter.toFixed(2)}/${plan.secMin.toFixed(2)}`,
    );

    if (once) break;
    const sleepMs = Math.max(500, Math.min(120000, plan.sleepMs));
    await ns.sleep(sleepMs);
  }
}
