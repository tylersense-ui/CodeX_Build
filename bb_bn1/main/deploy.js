import { scanAll } from "/bb_bn1/lib/net.js";
import { rootAll } from "/bb_bn1/lib/root.js";

const MANIFEST = "/bb_bn1/manifest.txt";
const MAIN_CONTROLLER = "/bb_bn1/main/controller.js";
const EARLY_CONTROLLER = "/bb_bn1/main/early-controller.js";
const SCP_ALLOWED_EXTENSIONS = [".js", ".script", ".ns", ".txt", ".lit"];

function hasFlag(ns, flag) {
  return ns.args.includes(flag);
}

function getFlagValue(ns, flag, fallback) {
  const index = ns.args.indexOf(flag);
  if (index === -1 || index + 1 >= ns.args.length) return fallback;
  return ns.args[index + 1];
}

function isScpCopyable(file) {
  const lower = file.toLowerCase();
  return SCP_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * @param {NS} ns
 * @param {string[]} files
 */
function sanitizeManagedFiles(ns, files) {
  const seen = new Set();
  const clean = [];

  for (const file of files) {
    if (!isScpCopyable(file)) continue;
    if (!ns.fileExists(file, "home")) continue;
    if (seen.has(file)) continue;

    seen.add(file);
    clean.push(file);
  }

  return clean;
}

/** @param {NS} ns */
function getManagedFiles(ns) {
  const fallback = [
    MAIN_CONTROLLER,
    EARLY_CONTROLLER,
    "/bb_bn1/workers/hack-once.js",
    "/bb_bn1/workers/grow-once.js",
    "/bb_bn1/workers/weaken-once.js",
    "/bb_bn1/lib/net.js",
    "/bb_bn1/lib/root.js",
    "/bb_bn1/lib/targeting.js",
    "/bb_bn1/manifest.txt",
  ];

  if (!ns.fileExists(MANIFEST, "home")) return sanitizeManagedFiles(ns, fallback);

  const files = ns
    .read(MANIFEST)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => (line.startsWith("/") ? line : `/${line}`));

  const clean = sanitizeManagedFiles(ns, files);
  return clean.length > 0 ? clean : sanitizeManagedFiles(ns, fallback);
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
function pickController(ns) {
  const forceEarly = hasFlag(ns, "--force-early");
  const forceMain = hasFlag(ns, "--force-main");

  const homeMaxRam = ns.getServerMaxRam("home");
  const mainRam = ns.getScriptRam(MAIN_CONTROLLER, "home");
  const earlyRam = ns.getScriptRam(EARLY_CONTROLLER, "home");

  if (forceMain) {
    return {
      controller: MAIN_CONTROLLER,
      reason: "forced-main",
      controllerRam: mainRam,
      homeMaxRam,
    };
  }

  if (forceEarly) {
    return {
      controller: EARLY_CONTROLLER,
      reason: "forced-early",
      controllerRam: earlyRam,
      homeMaxRam,
    };
  }

  if (mainRam > 0 && mainRam <= homeMaxRam) {
    return {
      controller: MAIN_CONTROLLER,
      reason: "auto-main",
      controllerRam: mainRam,
      homeMaxRam,
    };
  }

  return {
    controller: EARLY_CONTROLLER,
    reason: "auto-early",
    controllerRam: earlyRam,
    homeMaxRam,
  };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const reserveHomeRam = Number(getFlagValue(ns, "--reserve-home", 0));
  const forcedTarget = String(getFlagValue(ns, "--target", "")).trim();
  const clean = hasFlag(ns, "--clean");
  const dryRun = hasFlag(ns, "--dry-run");

  const servers = scanAll(ns);
  const newRooted = rootAll(ns, servers);
  const rooted = servers.filter((host) => ns.hasRootAccess(host));

  const files = getManagedFiles(ns);
  if (files.length === 0) {
    ns.tprint("[deploy] no copyable files found on home under /bb_bn1");
    return;
  }

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
        ` copied=${copied} copyFail=${copyFail} killed=${killed} files=${files.length}`,
    );
    return;
  }

  ns.scriptKill(MAIN_CONTROLLER, "home");
  ns.scriptKill(EARLY_CONTROLLER, "home");

  const picked = pickController(ns);
  const controller = picked.controller;
  const controllerRam = picked.controllerRam;

  if (controllerRam <= 0) {
    ns.tprint(`[deploy] selected controller missing on home: ${controller}`);
    return;
  }

  if (controllerRam > picked.homeMaxRam) {
    ns.tprint(
      `[deploy] selected controller needs ${controllerRam.toFixed(2)}GB but home max is ${picked.homeMaxRam.toFixed(2)}GB.` +
        " Upgrade home RAM first.",
    );
    return;
  }

  const runArgs = [];
  if (controller === MAIN_CONTROLLER) {
    runArgs.push("--reserve-home", reserveHomeRam);
  }
  if (forcedTarget) {
    runArgs.push("--target", forcedTarget);
  }

  ns.tprint(
    `[deploy] ok newRoot=${newRooted} rooted=${rooted.length}` +
      ` copied=${copied} copyFail=${copyFail} cleanKilled=${killed} files=${files.length}` +
      ` mode=${picked.reason} controller=${controller}`,
  );

  ns.spawn(controller, 1, ...runArgs);
}
