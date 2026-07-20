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
using System.Threading;
using System.Windows.Forms;

namespace BotControlCenter.WindowsLauncher
{
    internal static class Program
    {
        private const int ServerPort = 3000;
        private const string MutexName = "Local\\BotControlCenterWindowsLauncher";

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

            using (StreamWriter standardLog = CreateLogWriter(standardLogPath))
            using (StreamWriter errorLog = CreateLogWriter(errorLogPath))
            using (KillOnCloseJob serverJob = new KillOnCloseJob())
            using (Process serverProcess = StartServer(nodePath, projectRoot, standardLog, errorLog))
            {
                serverJob.Assign(serverProcess);

                if (!WaitUntilReady(serverProcess, url, TimeSpan.FromSeconds(60)))
                {
                    throw new InvalidOperationException(
                        "El servidor no llegó a estar disponible. Revisá los registros en:\n" + logsDirectory);
                }

                using (Process browserProcess = StartBrowser(browserPath, url, browserProfile))
                {
                    KillOnCloseJob browserJob = null;
                    try
                    {
                        browserJob = TryCreateBrowserJob(browserProcess);
                        WaitForBrowserWindowToClose(browserProcess);
                    }
                    finally
                    {
                        if (browserJob != null)
                        {
                            browserJob.Dispose();
                        }
                    }
                }
            }

            WaitForPortToClose(ServerPort, TimeSpan.FromSeconds(10));
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
            startInfo.Arguments =
                "\"scripts\\run-vinext.mjs\" dev --host 127.0.0.1 --port " + ServerPort;
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

        private static bool WaitUntilReady(Process serverProcess, string url, TimeSpan timeout)
        {
            DateTime deadline = DateTime.UtcNow.Add(timeout);
            while (DateTime.UtcNow < deadline)
            {
                if (serverProcess.HasExited)
                {
                    return false;
                }

                if (IsHttpReady(url))
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

        private static void WaitForBrowserWindowToClose(Process browserProcess)
        {
            bool sawWindow = false;
            DateTime startupDeadline = DateTime.UtcNow.AddSeconds(25);
            int missingWindowChecks = 0;

            while (true)
            {
                if (browserProcess.HasExited)
                {
                    if (!sawWindow)
                    {
                        throw new InvalidOperationException("La ventana del navegador se cerró antes de abrirse.");
                    }

                    return;
                }

                browserProcess.Refresh();
                if (browserProcess.MainWindowHandle != IntPtr.Zero)
                {
                    sawWindow = true;
                    missingWindowChecks = 0;
                }
                else if (sawWindow)
                {
                    missingWindowChecks += 1;
                    if (missingWindowChecks >= 4)
                    {
                        return;
                    }
                }
                else if (DateTime.UtcNow >= startupDeadline)
                {
                    throw new InvalidOperationException("No se pudo detectar la ventana de Bot Control Center.");
                }

                Thread.Sleep(250);
            }
        }

        private static KillOnCloseJob TryCreateBrowserJob(Process browserProcess)
        {
            KillOnCloseJob job = null;
            try
            {
                job = new KillOnCloseJob();
                job.Assign(browserProcess);
                return job;
            }
            catch
            {
                if (job != null)
                {
                    job.Dispose();
                }

                return null;
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
    }
}
