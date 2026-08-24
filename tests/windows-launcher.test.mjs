import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const launcherSource = new URL("../launcher/BotControlCenterLauncher.cs", import.meta.url);
const installerSource = new URL("../scripts/install-codex-app.ps1", import.meta.url);
const buildSource = new URL("../scripts/build-windows-launcher.ps1", import.meta.url);
const scheduleInstallerSource = new URL("../scripts/Install-ReleaseSchedule.ps1", import.meta.url);
const scheduleRunnerSource = new URL("../scripts/run-scheduled-release.mjs", import.meta.url);

test("el launcher liga la ventana al ciclo de vida del servidor", async () => {
  const source = await readFile(launcherSource, "utf8");

  assert.match(source, /JobObjectLimitKillOnJobClose/);
  assert.match(source, /127\.0\.0\.1/);
  assert.match(source, /WaitForBrowserWindowToClose/);
  assert.match(source, /FindBrowserWindowProcess/);
  assert.match(source, /Process\.GetProcessesByName/);
  assert.match(source, /MainWindowTitle\.IndexOf/);
  assert.equal(source.match(/ApplyApplicationIcon\(windowProcess\.MainWindowHandle\)/g).length, 2);
  assert.match(source, /ApplyWindowTaskbarIdentity\(windowProcess\.MainWindowHandle\)/);
  assert.match(source, /SHGetPropertyStoreForWindow/);
  assert.match(source, /AppUserModelRelaunchIconResource/);
  assert.match(source, /AppUserModelRelaunchCommand/);
  assert.match(source, /AppUserModelId/);
  assert.match(source, /BotControlCenter\.LocalDashboard/);
  assert.match(source, /propertyStore\.Commit\(\)/);
  assert.match(source, /WmGetIcon = 0x007F/);
  assert.match(source, /WmSetIcon = 0x0080/);
  assert.match(source, /NativeMethods\.SendMessage/);
  assert.match(source, /Icon\.ExtractAssociatedIcon\(Application\.ExecutablePath\)/);
  assert.match(source, /TryAssignBrowserProcess/);
  assert.doesNotMatch(source, /La ventana del navegador se cerró antes de abrirse/);
  assert.match(source, /using \(KillOnCloseJob serverJob/);
  assert.match(source, /AgentPort = 43121/);
  assert.match(source, /run-local\.mjs/);
  assert.match(source, /WaitForActiveJobsToFinish/);
  assert.match(source, /activeJobs/);
  assert.match(source, /StartupForm/);
  assert.match(source, /El primer inicio puede demorar unos segundos/);
  assert.match(source, /ControlBox = true/);
  assert.match(source, /KeyPreview = true/);
  assert.match(source, /Keys\.Escape/);
  assert.match(source, /RequestCancellation\(\)/);
});

test("el instalador crea el acceso en CODEX APPS", async () => {
  const source = await readFile(installerSource, "utf8");
  const build = await readFile(buildSource, "utf8");

  assert.match(source, /CODEX APPS/);
  assert.match(source, /Bot Control Center\.lnk/);
  assert.match(build, /BotControlCenter\.exe/);
  assert.match(build, /public/);
  assert.match(build, /favicon\.ico/);
});

test("el programador mensual persiste fuera de la UI y evita instancias superpuestas", async () => {
  const installer = await readFile(scheduleInstallerSource, "utf8");
  const runner = await readFile(scheduleRunnerSource, "utf8");
  assert.match(installer, /TASK_TRIGGER_MONTHLY/);
  assert.match(installer, /StartWhenAvailable/);
  assert.match(installer, /TASK_INSTANCES_IGNORE_NEW/);
  assert.match(installer, /RestartCount = 12/);
  assert.match(installer, /run-scheduled-release\.mjs/);
  assert.match(runner, /scheduled-release/);
  assert.match(runner, /schedule-disabled/);
});
