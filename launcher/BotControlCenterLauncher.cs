using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace BotControlCenter.WindowsLauncher
{
    internal static class Program
    {
        private const int ServerPort = 3000;
        private const int AgentPort = 43121;
        private const string MutexName = "Local\\BotControlCenterWindowsLauncher";
        private static Icon applicationIcon;

        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool createdNew;
            using (Mutex launcherMutex = new Mutex(true, MutexName, out createdNew))
            {
                if (!createdNew)
                {
                    MessageBox.Show(
                        "Bot Control Center ya está abierto.",
                        "Bot Control Center",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                    return;
                }

                try
                {
                    RunApplication();
                }
                catch (OperationCanceledException)
                {
                    // Cerrar la ventana de inicio cancela el arranque sin mostrar un error.
                }
                catch (Exception exception)
                {
                    MessageBox.Show(
                        exception.Message,
                        "No se pudo abrir Bot Control Center",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                }
                finally
                {
                    launcherMutex.ReleaseMutex();
                }
            }
        }

        private static void RunApplication()
        {
            using (StartupForm startup = new StartupForm())
            {
                startup.Show();
                startup.SetStatus("Verificando el entorno local…");
                Application.DoEvents();
                RunApplication(startup);
            }
        }

        private static void RunApplication(StartupForm startup)
        {
            string projectRoot = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
            string packagePath = Path.Combine(projectRoot, "package.json");
            string vinextPath = Path.Combine(projectRoot, "node_modules", ".bin", "vinext.cmd");

            if (!File.Exists(packagePath))
            {
                throw new InvalidOperationException("No se encontró el proyecto de Bot Control Center.");
            }

            if (!File.Exists(vinextPath))
            {
                throw new InvalidOperationException(
                    "Faltan las dependencias del proyecto. Ejecutá npm install en:\n" + projectRoot);
            }

            if (IsPortInUse(ServerPort))
            {
                throw new InvalidOperationException(
                    "El puerto 3000 ya está ocupado. Cerrá el proceso que lo usa y volvé a abrir la aplicación.");
            }

            if (IsPortInUse(AgentPort))
            {
                throw new InvalidOperationException(
                    "El puerto 43121 del agente local ya está ocupado. Cerrá el proceso que lo usa y volvé a abrir la aplicación.");
            }

            string nodePath = FindExecutable("node.exe");
            if (nodePath == null)
            {
                throw new InvalidOperationException("No se encontró Node.js en PATH.");
            }

            string browserPath = FindAppBrowser();
            if (browserPath == null)
            {
                throw new InvalidOperationException("No se encontró Microsoft Edge ni Google Chrome.");
            }

            string localDataRoot = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "BotControlCenter");
            string logsDirectory = Path.Combine(localDataRoot, "logs");
            string browserProfile = Path.Combine(localDataRoot, "browser-profile");
            Directory.CreateDirectory(logsDirectory);
            Directory.CreateDirectory(browserProfile);

            string standardLogPath = Path.Combine(logsDirectory, "server.log");
            string errorLogPath = Path.Combine(logsDirectory, "server-error.log");
            string url = "http://localhost:" + ServerPort;
            string agentUrl = "http://127.0.0.1:" + AgentPort + "/api/health";

            startup.SetStatus("Iniciando el servidor…");
            startup.ThrowIfCancellationRequested();
            using (StreamWriter standardLog = CreateLogWriter(standardLogPath))
            using (StreamWriter errorLog = CreateLogWriter(errorLogPath))
            using (KillOnCloseJob serverJob = new KillOnCloseJob())
            using (Process serverProcess = StartServer(nodePath, projectRoot, standardLog, errorLog))
            {
                serverJob.Assign(serverProcess);

                if (!WaitUntilReady(serverProcess, url, agentUrl, TimeSpan.FromSeconds(60), startup))
                {
                    throw new InvalidOperationException(
                        "El servidor no llegó a estar disponible. Revisá los registros en:\n" + logsDirectory);
                }

                startup.SetStatus("Abriendo la aplicación…");
                startup.ThrowIfCancellationRequested();
                using (Process browserProcess = StartBrowser(browserPath, url, browserProfile))
                using (KillOnCloseJob browserJob = new KillOnCloseJob())
                {
                    TryAssignBrowserProcess(browserJob, browserProcess);
                    WaitForBrowserWindowToClose(
                        browserProcess,
                        Path.GetFileNameWithoutExtension(browserPath),
                        browserJob,
                        startup);
                }

                WaitForActiveJobsToFinish(serverProcess, agentUrl, TimeSpan.FromMinutes(45), startup);
            }

            WaitForPortToClose(ServerPort, TimeSpan.FromSeconds(10));
            WaitForPortToClose(AgentPort, TimeSpan.FromSeconds(10));
        }

        private static StreamWriter CreateLogWriter(string path)
        {
            StreamWriter writer = new StreamWriter(path, false, new UTF8Encoding(false));
            writer.AutoFlush = true;
            return writer;
        }

        private static Process StartServer(
            string nodePath,
            string projectRoot,
            StreamWriter standardLog,
            StreamWriter errorLog)
        {
            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = nodePath;
            startInfo.Arguments = "\"scripts\\run-local.mjs\"";
            startInfo.WorkingDirectory = projectRoot;
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.WindowStyle = ProcessWindowStyle.Hidden;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;

            Process process = new Process();
            process.StartInfo = startInfo;
            process.EnableRaisingEvents = true;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
            {
                WriteLogLine(standardLog, eventArgs.Data);
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
            {
                WriteLogLine(errorLog, eventArgs.Data);
            };

            if (!process.Start())
            {
                process.Dispose();
                throw new InvalidOperationException("No se pudo iniciar el servidor local.");
            }

            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            return process;
        }

        private static void WriteLogLine(StreamWriter writer, string line)
        {
            if (line == null)
            {
                return;
            }

            lock (writer)
            {
                writer.WriteLine("[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + line);
            }
        }

        private static bool WaitUntilReady(
            Process serverProcess,
            string url,
            string agentUrl,
            TimeSpan timeout,
            StartupForm startup)
        {
            DateTime deadline = DateTime.UtcNow.Add(timeout);
            while (DateTime.UtcNow < deadline)
            {
                Application.DoEvents();
                startup.ThrowIfCancellationRequested();
                if (serverProcess.HasExited)
                {
                    return false;
                }

                if (IsHttpReady(url) && IsHttpReady(agentUrl))
                {
                    return true;
                }

                Thread.Sleep(250);
            }

            return false;
        }

        private static bool IsHttpReady(string url)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                request.Method = "GET";
                request.Timeout = 700;
                request.ReadWriteTimeout = 700;
                request.Proxy = null;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return (int)response.StatusCode < 500;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void WaitForActiveJobsToFinish(
            Process serverProcess,
            string agentUrl,
            TimeSpan timeout,
            StartupForm startup)
        {
            int activeJobs;
            if (!TryGetActiveJobs(agentUrl, out activeJobs) || activeJobs == 0)
            {
                return;
            }

            startup.ShowForShutdown("Hay un deploy en curso; esperando que termine antes de apagar…");
            DateTime deadline = DateTime.UtcNow.Add(timeout);
            while (DateTime.UtcNow < deadline)
            {
                Application.DoEvents();
                startup.ThrowIfCancellationRequested();
                if (serverProcess.HasExited)
                {
                    return;
                }

                if (TryGetActiveJobs(agentUrl, out activeJobs) && activeJobs == 0)
                {
                    return;
                }

                Thread.Sleep(500);
            }

            throw new InvalidOperationException(
                "El deploy no terminó dentro de 45 minutos. Revisá los logs antes de volver a intentarlo.");
        }

        private static bool TryGetActiveJobs(string agentUrl, out int activeJobs)
        {
            activeJobs = 0;
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(agentUrl);
                request.Method = "GET";
                request.Timeout = 900;
                request.ReadWriteTimeout = 900;
                request.Proxy = null;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                {
                    Match match = Regex.Match(reader.ReadToEnd(), "\\\"activeJobs\\\"\\s*:\\s*(\\d+)");
                    return match.Success && int.TryParse(match.Groups[1].Value, out activeJobs);
                }
            }
            catch
            {
                return false;
            }
        }

        private static Process StartBrowser(string browserPath, string url, string profilePath)
        {
            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = browserPath;
            startInfo.Arguments =
                "--app=" + QuoteArgument(url) +
                " --user-data-dir=" + QuoteArgument(profilePath) +
                " --no-first-run --no-default-browser-check --disable-background-mode";
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.WindowStyle = ProcessWindowStyle.Normal;

            Process process = Process.Start(startInfo);
            if (process == null)
            {
                throw new InvalidOperationException("No se pudo abrir la ventana de la aplicación.");
            }

            return process;
        }

        private static void WaitForBrowserWindowToClose(
            Process browserProcess,
            string browserProcessName,
            KillOnCloseJob browserJob,
            StartupForm startup)
        {
            DateTime startupDeadline = DateTime.UtcNow.AddSeconds(25);
            int missingWindowChecks = 0;
            Process windowProcess = null;

            try
            {
                while (true)
                {
                    Application.DoEvents();
                    startup.ThrowIfCancellationRequested();

                    if (windowProcess == null)
                    {
                        windowProcess = FindBrowserWindowProcess(browserProcessName);
                        if (windowProcess != null)
                        {
                            TryAssignBrowserProcess(browserJob, windowProcess);
                            ApplyWindowTaskbarIdentity(windowProcess.MainWindowHandle);
                            ApplyApplicationIcon(windowProcess.MainWindowHandle);
                            startup.HideForApplication();
                            missingWindowChecks = 0;
                        }
                        else if (DateTime.UtcNow >= startupDeadline)
                        {
                            if (browserProcess.HasExited)
                            {
                                throw new InvalidOperationException(
                                    "Edge cerró el proceso inicial y no se pudo encontrar la ventana de Bot Control Center.");
                            }

                            throw new InvalidOperationException("No se pudo detectar la ventana de Bot Control Center.");
                        }
                    }
                    else
                    {
                        bool windowClosed = false;
                        try
                        {
                            if (windowProcess.HasExited)
                            {
                                windowClosed = true;
                            }
                            else
                            {
                                windowProcess.Refresh();
                                windowClosed = windowProcess.MainWindowHandle == IntPtr.Zero;
                            }
                        }
                        catch
                        {
                            windowClosed = true;
                        }

                        if (windowClosed)
                        {
                            missingWindowChecks += 1;
                            if (missingWindowChecks >= 4)
                            {
                                return;
                            }
                        }
                        else
                        {
                            ApplyApplicationIcon(windowProcess.MainWindowHandle);
                            missingWindowChecks = 0;
                        }
                    }

                    Thread.Sleep(250);
                }
            }
            finally
            {
                if (windowProcess != null)
                {
                    windowProcess.Dispose();
                }
            }
        }

        private static Process FindBrowserWindowProcess(string browserProcessName)
        {
            foreach (Process candidate in Process.GetProcessesByName(browserProcessName))
            {
                bool keepCandidate = false;
                try
                {
                    candidate.Refresh();
                    if (
                        candidate.MainWindowHandle != IntPtr.Zero &&
                        candidate.MainWindowTitle.IndexOf(
                            "Bot Control Center",
                            StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        keepCandidate = true;
                        return candidate;
                    }
                }
                catch
                {
                    // El proceso puede terminar mientras se enumeran las ventanas.
                }
                finally
                {
                    if (!keepCandidate)
                    {
                        candidate.Dispose();
                    }
                }
            }

            return null;
        }

        private static void ApplyWindowTaskbarIdentity(IntPtr windowHandle)
        {
            if (windowHandle == IntPtr.Zero)
            {
                return;
            }

            NativeMethods.IPropertyStore propertyStore = null;
            try
            {
                Guid interfaceId = typeof(NativeMethods.IPropertyStore).GUID;
                int result = NativeMethods.SHGetPropertyStoreForWindow(
                    windowHandle,
                    ref interfaceId,
                    out propertyStore);
                if (result < 0 || propertyStore == null)
                {
                    return;
                }

                // Windows recomienda establecer las propiedades de relanzamiento antes
                // del AppUserModelID, que separa esta ventana del grupo de Edge.
                SetStringWindowProperty(
                    propertyStore,
                    NativeMethods.AppUserModelRelaunchIconResource,
                    Application.ExecutablePath + ",0");
                SetStringWindowProperty(
                    propertyStore,
                    NativeMethods.AppUserModelRelaunchCommand,
                    QuoteArgument(Application.ExecutablePath));
                SetStringWindowProperty(
                    propertyStore,
                    NativeMethods.AppUserModelId,
                    "BotControlCenter.LocalDashboard");
                int commitResult = propertyStore.Commit();
                if (commitResult < 0)
                {
                    Marshal.ThrowExceptionForHR(commitResult);
                }
            }
            catch
            {
                // WM_SETICON sigue siendo el respaldo si Windows no expone el Property Store.
            }
            finally
            {
                if (propertyStore != null)
                {
                    Marshal.FinalReleaseComObject(propertyStore);
                }
            }
        }

        private static void SetStringWindowProperty(
            NativeMethods.IPropertyStore propertyStore,
            NativeMethods.PropertyKey propertyKey,
            string value)
        {
            NativeMethods.PropVariant propertyValue = NativeMethods.PropVariant.FromString(value);
            try
            {
                int result = propertyStore.SetValue(ref propertyKey, ref propertyValue);
                if (result < 0)
                {
                    Marshal.ThrowExceptionForHR(result);
                }
            }
            finally
            {
                propertyValue.Clear();
            }
        }

        internal static Icon GetApplicationIcon()
        {
            if (applicationIcon == null)
            {
                try
                {
                    applicationIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                }
                catch
                {
                    // Windows conserva el icono del navegador si no puede leer el embebido.
                }
            }

            return applicationIcon;
        }

        private static void ApplyApplicationIcon(IntPtr windowHandle)
        {
            Icon icon = GetApplicationIcon();
            if (windowHandle == IntPtr.Zero || icon == null)
            {
                return;
            }

            IntPtr smallIcon = new IntPtr(NativeMethods.IconSmall);
            IntPtr bigIcon = new IntPtr(NativeMethods.IconBig);
            if (NativeMethods.SendMessage(
                windowHandle,
                NativeMethods.WmGetIcon,
                smallIcon,
                IntPtr.Zero) != icon.Handle)
            {
                NativeMethods.SendMessage(
                    windowHandle,
                    NativeMethods.WmSetIcon,
                    smallIcon,
                    icon.Handle);
            }

            if (NativeMethods.SendMessage(
                windowHandle,
                NativeMethods.WmGetIcon,
                bigIcon,
                IntPtr.Zero) != icon.Handle)
            {
                NativeMethods.SendMessage(
                    windowHandle,
                    NativeMethods.WmSetIcon,
                    bigIcon,
                    icon.Handle);
            }
        }

        private static void TryAssignBrowserProcess(KillOnCloseJob browserJob, Process browserProcess)
        {
            try
            {
                if (!browserProcess.HasExited)
                {
                    browserJob.Assign(browserProcess);
                }
            }
            catch
            {
                // Chromium puede haber delegado el arranque o usar su propio Job Object.
            }
        }

        private static string FindExecutable(string executableName)
        {
            string pathValue = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
            string[] directories = pathValue.Split(Path.PathSeparator);
            foreach (string rawDirectory in directories)
            {
                string directory = rawDirectory.Trim().Trim('"');
                if (directory.Length == 0)
                {
                    continue;
                }

                string candidate = Path.Combine(directory, executableName);
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }

            return null;
        }

        private static string FindAppBrowser()
        {
            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string[] candidates = new string[]
            {
                Path.Combine(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(localAppData, "Google", "Chrome", "Application", "chrome.exe")
            };

            foreach (string candidate in candidates)
            {
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }

            return FindExecutable("msedge.exe") ?? FindExecutable("chrome.exe");
        }

        private static string QuoteArgument(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        private static bool IsTcpPortOpen(string host, int port, int timeoutMilliseconds)
        {
            TcpClient client = new TcpClient();
            IAsyncResult connection = null;
            try
            {
                connection = client.BeginConnect(host, port, null, null);
                if (!connection.AsyncWaitHandle.WaitOne(timeoutMilliseconds))
                {
                    return false;
                }

                client.EndConnect(connection);
                return client.Connected;
            }
            catch
            {
                return false;
            }
            finally
            {
                if (connection != null)
                {
                    connection.AsyncWaitHandle.Close();
                }

                client.Close();
            }
        }

        private static bool IsPortInUse(int port)
        {
            try
            {
                IPEndPoint[] listeners = IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners();
                foreach (IPEndPoint listener in listeners)
                {
                    if (listener.Port == port)
                    {
                        return true;
                    }
                }

                return false;
            }
            catch
            {
                return IsTcpPortOpen("127.0.0.1", port, 150) ||
                    IsTcpPortOpen("::1", port, 150);
            }
        }

        private static void WaitForPortToClose(int port, TimeSpan timeout)
        {
            DateTime deadline = DateTime.UtcNow.Add(timeout);
            while (DateTime.UtcNow < deadline)
            {
                if (!IsPortInUse(port))
                {
                    return;
                }

                Thread.Sleep(150);
            }
        }
    }

    internal sealed class StartupForm : Form
    {
        private readonly Label statusLabel;
        private bool allowClose;

        internal StartupForm()
        {
            Text = "Bot Control Center";
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(430, 172);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            ControlBox = true;
            KeyPreview = true;
            MaximizeBox = false;
            MinimizeBox = false;
            BackColor = Color.FromArgb(8, 11, 11);
            ForeColor = Color.FromArgb(232, 237, 235);
            Font = new Font("Segoe UI", 10F, FontStyle.Regular, GraphicsUnit.Point);

            try
            {
                Icon = Program.GetApplicationIcon();
            }
            catch
            {
                // El icono no es necesario para iniciar la aplicación.
            }

            Label titleLabel = new Label();
            titleLabel.Text = "BOT CONTROL CENTER";
            titleLabel.ForeColor = Color.FromArgb(184, 243, 74);
            titleLabel.Font = new Font("Segoe UI Semibold", 16F, FontStyle.Bold, GraphicsUnit.Point);
            titleLabel.AutoSize = true;
            titleLabel.Location = new Point(28, 24);
            Controls.Add(titleLabel);

            statusLabel = new Label();
            statusLabel.Text = "Preparando la aplicación…";
            statusLabel.ForeColor = Color.FromArgb(205, 213, 210);
            statusLabel.AutoSize = false;
            statusLabel.Location = new Point(30, 66);
            statusLabel.Size = new Size(370, 24);
            Controls.Add(statusLabel);

            ProgressBar progress = new ProgressBar();
            progress.Style = ProgressBarStyle.Marquee;
            progress.MarqueeAnimationSpeed = 24;
            progress.Location = new Point(31, 99);
            progress.Size = new Size(368, 8);
            Controls.Add(progress);

            Label noteLabel = new Label();
            noteLabel.Text = "El primer inicio puede demorar unos segundos.";
            noteLabel.ForeColor = Color.FromArgb(111, 122, 119);
            noteLabel.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
            noteLabel.AutoSize = true;
            noteLabel.Location = new Point(29, 124);
            Controls.Add(noteLabel);

            FormClosing += delegate(object sender, FormClosingEventArgs eventArgs)
            {
                if (!allowClose)
                {
                    eventArgs.Cancel = true;
                    RequestCancellation();
                }
            };
            KeyDown += delegate(object sender, KeyEventArgs eventArgs)
            {
                if (eventArgs.KeyCode == Keys.Escape)
                {
                    eventArgs.Handled = true;
                    eventArgs.SuppressKeyPress = true;
                    RequestCancellation();
                }
            };
        }

        internal bool CancellationRequested { get; private set; }

        private void RequestCancellation()
        {
            CancellationRequested = true;
            Hide();
        }

        internal void SetStatus(string status)
        {
            statusLabel.Text = status;
            statusLabel.Refresh();
        }

        internal void ThrowIfCancellationRequested()
        {
            if (CancellationRequested)
            {
                throw new OperationCanceledException();
            }
        }

        internal void HideForApplication()
        {
            allowClose = true;
            Hide();
        }

        internal void ShowForShutdown(string status)
        {
            CancellationRequested = false;
            allowClose = false;
            SetStatus(status);
            Show();
            BringToFront();
        }
    }

    internal sealed class KillOnCloseJob : IDisposable
    {
        private const uint JobObjectLimitKillOnJobClose = 0x00002000;
        private IntPtr handle;

        public KillOnCloseJob()
        {
            handle = NativeMethods.CreateJobObject(IntPtr.Zero, null);
            if (handle == IntPtr.Zero)
            {
                throw new Win32Exception(Marshal.GetLastWin32Error());
            }

            NativeMethods.JobObjectExtendedLimitInformation information =
                new NativeMethods.JobObjectExtendedLimitInformation();
            information.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;

            int length = Marshal.SizeOf(typeof(NativeMethods.JobObjectExtendedLimitInformation));
            IntPtr informationPointer = Marshal.AllocHGlobal(length);
            try
            {
                Marshal.StructureToPtr(information, informationPointer, false);
                if (!NativeMethods.SetInformationJobObject(handle, 9, informationPointer, (uint)length))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                }
            }
            finally
            {
                Marshal.FreeHGlobal(informationPointer);
            }
        }

        public void Assign(Process process)
        {
            if (!NativeMethods.AssignProcessToJobObject(handle, process.Handle))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error());
            }
        }

        public void Dispose()
        {
            if (handle != IntPtr.Zero)
            {
                NativeMethods.CloseHandle(handle);
                handle = IntPtr.Zero;
            }
        }
    }

    internal static class NativeMethods
    {
        internal const uint WmGetIcon = 0x007F;
        internal const uint WmSetIcon = 0x0080;
        internal const int IconSmall = 0;
        internal const int IconBig = 1;
        private const ushort VariantTypeUnicodeString = 31;
        private static readonly Guid AppUserModelFormatId =
            new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");

        internal static readonly PropertyKey AppUserModelRelaunchCommand =
            new PropertyKey(AppUserModelFormatId, 2);
        internal static readonly PropertyKey AppUserModelRelaunchIconResource =
            new PropertyKey(AppUserModelFormatId, 3);
        internal static readonly PropertyKey AppUserModelId =
            new PropertyKey(AppUserModelFormatId, 5);

        [ComImport]
        [Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        internal interface IPropertyStore
        {
            [PreserveSig]
            int GetCount(out uint propertyCount);

            [PreserveSig]
            int GetAt(uint propertyIndex, out PropertyKey propertyKey);

            [PreserveSig]
            int GetValue(ref PropertyKey propertyKey, out PropVariant propertyValue);

            [PreserveSig]
            int SetValue(ref PropertyKey propertyKey, ref PropVariant propertyValue);

            [PreserveSig]
            int Commit();
        }

        [StructLayout(LayoutKind.Sequential, Pack = 4)]
        internal struct PropertyKey
        {
            internal Guid FormatId;
            internal uint PropertyId;

            internal PropertyKey(Guid formatId, uint propertyId)
            {
                FormatId = formatId;
                PropertyId = propertyId;
            }
        }

        [StructLayout(LayoutKind.Explicit)]
        internal struct PropVariant
        {
            [FieldOffset(0)]
            internal ushort ValueType;

            [FieldOffset(8)]
            internal IntPtr PointerValue;

            internal static PropVariant FromString(string value)
            {
                PropVariant propertyValue = new PropVariant();
                propertyValue.ValueType = VariantTypeUnicodeString;
                propertyValue.PointerValue = Marshal.StringToCoTaskMemUni(value);
                return propertyValue;
            }

            internal void Clear()
            {
                NativeMethods.PropVariantClear(ref this);
            }
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct IoCounters
        {
            internal ulong ReadOperationCount;
            internal ulong WriteOperationCount;
            internal ulong OtherOperationCount;
            internal ulong ReadTransferCount;
            internal ulong WriteTransferCount;
            internal ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct JobObjectBasicLimitInformation
        {
            internal long PerProcessUserTimeLimit;
            internal long PerJobUserTimeLimit;
            internal uint LimitFlags;
            internal UIntPtr MinimumWorkingSetSize;
            internal UIntPtr MaximumWorkingSetSize;
            internal uint ActiveProcessLimit;
            internal UIntPtr Affinity;
            internal uint PriorityClass;
            internal uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct JobObjectExtendedLimitInformation
        {
            internal JobObjectBasicLimitInformation BasicLimitInformation;
            internal IoCounters IoInfo;
            internal UIntPtr ProcessMemoryLimit;
            internal UIntPtr JobMemoryLimit;
            internal UIntPtr PeakProcessMemoryUsed;
            internal UIntPtr PeakJobMemoryUsed;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern IntPtr CreateJobObject(IntPtr securityAttributes, string name);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool SetInformationJobObject(
            IntPtr job,
            int informationClass,
            IntPtr information,
            uint informationLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool CloseHandle(IntPtr handle);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        internal static extern IntPtr SendMessage(
            IntPtr window,
            uint message,
            IntPtr wordParameter,
            IntPtr longParameter);

        [DllImport("shell32.dll")]
        internal static extern int SHGetPropertyStoreForWindow(
            IntPtr window,
            ref Guid interfaceId,
            [MarshalAs(UnmanagedType.Interface)] out IPropertyStore propertyStore);

        [DllImport("ole32.dll")]
        internal static extern int PropVariantClear(ref PropVariant propertyValue);
    }
}
