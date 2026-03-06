import { scanAll } from "/bb_bn1/lib/net.js";
import { rootAll } from "/bb_bn1/lib/root.js";

const MANIFEST = "/bb_bn1/manifest.txt";
const CONTROLLER = "/bb_bn1/main/controller.js";

function hasFlag(ns, flag) {
  return ns.args.includes(flag);
}

function getFlagValue(ns, flag, fallback) {
  const index = ns.args.indexOf(flag);
  if (index === -1 || index + 1 >= ns.args.length) return fallback;
  return ns.args[index + 1];
}

/** @param {NS} ns */
function getManagedFiles(ns) {
  const fallback = [
    "/bb_bn1/main/controller.js",
    "/bb_bn1/workers/hack-once.js",
    "/bb_bn1/workers/grow-once.js",
    "/bb_bn1/workers/weaken-once.js",
    "/bb_bn1/lib/net.js",
    "/bb_bn1/lib/root.js",
    "/bb_bn1/lib/targeting.js",
  ];

  if (!ns.fileExists(MANIFEST, "home")) return fallback;

  const files = ns
    .read(MANIFEST)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => (line.startsWith("/") ? line : `/${line}`));

  return files.length > 0 ? files : fallback;
}

/**
 * @param {NS} ns
 * @param {string[]} hosts
 * @param {number} selfPid
 */
function killManagedScripts(ns, hosts, selfPid) {
  let killed = 0;

  for (const host of hosts) {
    const processes = ns.ps(host);
    for (const proc of processes) {
      if (!proc.filename.startsWith("/bb_bn1/")) continue;
      if (proc.pid === selfPid) continue;
      if (ns.kill(proc.pid)) killed += 1;
    }
  }

  return killed;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const reserveHomeRam = Number(getFlagValue(ns, "--reserve-home", 32));
  const forcedTarget = String(getFlagValue(ns, "--target", "")).trim();
  const clean = hasFlag(ns, "--clean");
  const dryRun = hasFlag(ns, "--dry-run");

  const servers = scanAll(ns);
  const newRooted = rootAll(ns, servers);
  const rooted = servers.filter((host) => ns.hasRootAccess(host));

  const files = getManagedFiles(ns);

  let copied = 0;
  let copyFail = 0;
  for (const host of rooted) {
    if (host === "home") continue;
    const ok = await ns.scp(files, host, "home");
    if (ok) copied += 1;
    else copyFail += 1;
  }

  let killed = 0;
  if (clean) {
    killed = killManagedScripts(ns, rooted, ns.pid);
  }

  if (dryRun) {
    ns.tprint(
      `[deploy] dry-run complete newRoot=${newRooted} rooted=${rooted.length}` +
        ` copied=${copied} copyFail=${copyFail} killed=${killed}`,
    );
    return;
  }

  ns.scriptKill(CONTROLLER, "home");

  const runArgs = ["--reserve-home", reserveHomeRam];
  if (forcedTarget) {
    runArgs.push("--target", forcedTarget);
  }

  const pid = ns.run(CONTROLLER, 1, ...runArgs);
  if (pid === 0) {
    ns.tprint("[deploy] failed to start controller (check home RAM and reserve value)");
    return;
  }

  ns.tprint(
    `[deploy] ok newRoot=${newRooted} rooted=${rooted.length}` +
      ` copied=${copied} copyFail=${copyFail} cleanKilled=${killed} controllerPid=${pid}`,
  );
}