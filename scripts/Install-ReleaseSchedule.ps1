[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $ConfigPath,
    [Parameter(Mandatory = $true)][string] $NodePath,
    [Parameter(Mandatory = $true)][string] $BotId,
    [ValidateRange(1, 28)][int] $DayOfMonth = 1,
    [ValidatePattern('^(?:[01]\d|2[0-3]):[0-5]\d$')][string] $At = "03:00",
    [switch] $Disable
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($BotId -notmatch '^[A-Za-z0-9][A-Za-z0-9._:-]*$') {
    throw "Identificador de bot invalido."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedConfig = (Resolve-Path -LiteralPath $ConfigPath).Path
$resolvedNode = (Resolve-Path -LiteralPath $NodePath).Path
$runnerPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "run-scheduled-release.mjs")).Path
$taskName = "Bot Control Center - Release - $BotId"

$service = New-Object -ComObject "Schedule.Service"
$service.Connect()
$folder = $service.GetFolder("\")

if ($Disable) {
    $removed = $false
    try {
        $null = $folder.GetTask("\$taskName")
        $folder.DeleteTask($taskName, 0)
        $removed = $true
    }
    catch {
        # Deshabilitar es idempotente cuando la tarea todavia no existe.
    }
    [ordered]@{
        enabled = $false
        taskName = $taskName
        removed = $removed
        nextRunAt = $null
    } | ConvertTo-Json -Compress
    exit 0
}

$definition = $service.NewTask(0)
$definition.RegistrationInfo.Description = "Publica y despliega un corte inmutable de $BotId solo cuando hay commits nuevos."
$definition.RegistrationInfo.Author = "Bot Control Center"
$definition.Principal.LogonType = 3 # TASK_LOGON_INTERACTIVE_TOKEN
$definition.Principal.RunLevel = 0 # TASK_RUNLEVEL_LUA

$definition.Settings.Enabled = $true
$definition.Settings.Hidden = $true
$definition.Settings.AllowDemandStart = $true
$definition.Settings.StartWhenAvailable = $true
$definition.Settings.MultipleInstances = 2 # TASK_INSTANCES_IGNORE_NEW
$definition.Settings.DisallowStartIfOnBatteries = $false
$definition.Settings.StopIfGoingOnBatteries = $false
$definition.Settings.ExecutionTimeLimit = "PT3H"
$definition.Settings.RestartCount = 12
$definition.Settings.RestartInterval = "PT1H"

$timeParts = $At.Split(":")
$now = Get-Date
$start = Get-Date -Year $now.Year -Month $now.Month -Day $DayOfMonth -Hour ([int]$timeParts[0]) -Minute ([int]$timeParts[1]) -Second 0
if ($start -le $now) {
    $start = $start.AddMonths(1)
}

$trigger = $definition.Triggers.Create(4) # TASK_TRIGGER_MONTHLY
$trigger.Id = "MonthlyRelease"
$trigger.Enabled = $true
$trigger.StartBoundary = $start.ToString("yyyy-MM-dd'T'HH:mm:ss")
$trigger.DaysOfMonth = [int](1 -shl ($DayOfMonth - 1))
$trigger.MonthsOfYear = 4095

function Quote-TaskArgument {
    param([Parameter(Mandatory = $true)][string] $Value)
    return '"' + $Value.Replace('"', '\"') + '"'
}

$action = $definition.Actions.Create(0) # TASK_ACTION_EXEC
$action.Path = $resolvedNode
$action.WorkingDirectory = $projectRoot
$action.Arguments = @(
    (Quote-TaskArgument $runnerPath),
    "--config",
    (Quote-TaskArgument $resolvedConfig),
    "--bot",
    (Quote-TaskArgument $BotId)
) -join " "

$null = $folder.RegisterTaskDefinition(
    $taskName,
    $definition,
    6, # TASK_CREATE_OR_UPDATE
    $null,
    $null,
    3, # TASK_LOGON_INTERACTIVE_TOKEN
    $null
)

$registered = $folder.GetTask("\$taskName")
$nextRun = if ($registered.NextRunTime.Year -gt 1900) { $registered.NextRunTime.ToString("o") } else { $null }
[ordered]@{
    enabled = $true
    taskName = $taskName
    dayOfMonth = $DayOfMonth
    at = $At
    nextRunAt = $nextRun
    startWhenAvailable = $true
    retryHours = 12
} | ConvertTo-Json -Compress
