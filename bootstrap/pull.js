/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const repo = String(ns.args[0] ?? "").trim();
  const branch = String(ns.args[1] ?? "main").trim();
  const manifestPath = String(ns.args[2] ?? "bb_bn1/manifest.txt").trim();

  if (!repo) {
    ns.tprint("Usage: run /bb_bn1/bootstrap/pull.js <owner/repo> [branch] [manifestPath]");
    return;
  }

  const baseUrl = `https://raw.githubusercontent.com/${repo}/${branch}/`;
  const manifestUrl = `${baseUrl}${manifestPath}?v=${Date.now()}`;
  const localManifest = "/bb_bn1/.manifest.tmp.txt";

  ns.tprint(`[pull] downloading manifest: ${manifestPath}`);
  const manifestOk = await ns.wget(manifestUrl, localManifest, "home");
  if (!manifestOk) {
    ns.tprint(`[pull] failed to download manifest from ${manifestUrl}`);
    return;
  }

  const files = ns
    .read(localManifest)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (files.length === 0) {
    ns.tprint("[pull] manifest is empty");
    ns.rm(localManifest, "home");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const file of files) {
    const localPath = file.startsWith("/") ? file : `/${file}`;
    const fileUrl = `${baseUrl}${file}?v=${Date.now()}`;
    const downloaded = await ns.wget(fileUrl, localPath, "home");
    if (downloaded) {
      ok += 1;
      ns.print(`[ok] ${file}`);
    } else {
      fail += 1;
      ns.tprint(`[pull] FAIL ${file}`);
    }
    await ns.sleep(10);
  }

  ns.rm(localManifest, "home");
  ns.tprint(`[pull] complete: ok=${ok} fail=${fail}`);
}