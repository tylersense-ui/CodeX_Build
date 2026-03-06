/** @param {NS} ns */
export async function main(ns) {
  const target = String(ns.args[0] ?? "");
  const delayMs = Number(ns.args[1] ?? 0);

  if (!target) {
    ns.tprint("[weaken-once] missing target");
    return;
  }

  if (delayMs > 0) await ns.sleep(delayMs);
  await ns.weaken(target);
}