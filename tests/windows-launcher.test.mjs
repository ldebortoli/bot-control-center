import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const launcherSource = new URL("../launcher/BotControlCenterLauncher.cs", import.meta.url);
const installerSource = new URL("../scripts/install-codex-app.ps1", import.meta.url);
const buildSource = new URL("../scripts/build-windows-launcher.ps1", import.meta.url);

test("el launcher liga la ventana al ciclo de vida del servidor", async () => {
  const source = await readFile(launcherSource, "utf8");

  assert.match(source, /JobObjectLimitKillOnJobClose/);
  assert.match(source, /127\.0\.0\.1/);
  assert.match(source, /WaitForBrowserWindowToClose/);
  assert.match(source, /FindBrowserWindowProcess/);
  assert.match(source, /Process\.GetProcessesByName/);
  assert.match(source, /MainWindowTitle\.IndexOf/);
  assert.match(source, /TryAssignBrowserProcess/);
  assert.doesNotMatch(source, /La ventana del navegador se cerró antes de abrirse/);
  assert.match(source, /using \(KillOnCloseJob serverJob/);
  assert.match(source, /AgentPort = 43121/);
  assert.match(source, /run-local\.mjs/);
  assert.match(source, /WaitForActiveJobsToFinish/);
  assert.match(source, /activeJobs/);
  assert.match(source, /StartupForm/);
  assert.match(source, /El primer inicio puede demorar unos segundos/);
});

test("el instalador crea el acceso en CODEX APPS", async () => {
  const source = await readFile(installerSource, "utf8");
  const build = await readFile(buildSource, "utf8");

  assert.match(source, /CODEX APPS/);
  assert.match(source, /Bot Control Center\.lnk/);
  assert.match(build, /BotControlCenter\.exe/);
});
