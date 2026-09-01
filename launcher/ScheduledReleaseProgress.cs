using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace BotControlCenter.ScheduledRelease
{
    internal static class Program
    {
        private const string AppUserModelId = "BotControlCenter.LocalDashboard";

        [DllImport("shell32.dll", SetLastError = true)]
        private static extern int SetCurrentProcessExplicitAppUserModelID(
            [MarshalAs(UnmanagedType.LPWStr)] string appId);

        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            SetCurrentProcessExplicitAppUserModelID(AppUserModelId);

            try
            {
                ReleaseArguments releaseArguments = ReleaseArguments.Parse(args);
                using (ProgressForm form = new ProgressForm(releaseArguments))
                {
                    Application.Run(form);
                    Environment.ExitCode = form.ReleaseExitCode;
                }
            }
            catch (Exception exception)
            {
                MessageBox.Show(
                    exception.Message,
                    "No se pudo iniciar el release programado",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                Environment.ExitCode = 1;
            }
        }
    }

    internal sealed class ReleaseArguments
    {
        public string NodePath { get; private set; }
        public string RunnerPath { get; private set; }
        public string ConfigPath { get; private set; }
        public string BotId { get; private set; }

        public static ReleaseArguments Parse(string[] args)
        {
            Dictionary<string, string> values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (int index = 0; index < args.Length; index += 2)
            {
                if (index + 1 >= args.Length || !args[index].StartsWith("--", StringComparison.Ordinal))
                {
                    throw new InvalidOperationException("Los argumentos del release programado no son válidos.");
                }
                values[args[index]] = args[index + 1];
            }

            string nodePath = Required(values, "--node");
            string runnerPath = Required(values, "--runner");
            string configPath = Required(values, "--config");
            string botId = Required(values, "--bot");
            if (!File.Exists(nodePath) || !File.Exists(runnerPath) || !File.Exists(configPath))
            {
                throw new FileNotFoundException("Falta Node.js, el runner o la configuración del release programado.");
            }
            if (!Regex.IsMatch(botId, "^[A-Za-z0-9][A-Za-z0-9._:-]*$"))
            {
                throw new InvalidOperationException("El identificador del bot no es válido.");
            }

            return new ReleaseArguments
            {
                NodePath = Path.GetFullPath(nodePath),
                RunnerPath = Path.GetFullPath(runnerPath),
                ConfigPath = Path.GetFullPath(configPath),
                BotId = botId,
            };
        }

        private static string Required(Dictionary<string, string> values, string name)
        {
            string value;
            if (!values.TryGetValue(name, out value) || String.IsNullOrWhiteSpace(value) || value.IndexOf('"') >= 0)
            {
                throw new InvalidOperationException("Falta el argumento requerido " + name + ".");
            }
            return value;
        }
    }

    internal sealed class ProgressForm : Form
    {
        private readonly ReleaseArguments releaseArguments;
        private readonly Label statusLabel;
        private readonly Label detailLabel;
        private readonly FlowLayoutPanel eventPanel;
        private readonly ProgressBar progressBar;
        private readonly List<string> events = new List<string>();
        private Process releaseProcess;
        private bool releaseRunning;
        private bool closeScheduled;

        public int ReleaseExitCode { get; private set; }

        public ProgressForm(ReleaseArguments arguments)
        {
            releaseArguments = arguments;
            ReleaseExitCode = 1;
            Text = "Release programado · Galerazo Bot";
            BackColor = Color.FromArgb(7, 13, 19);
            ForeColor = Color.FromArgb(238, 242, 245);
            Font = new Font("Segoe UI", 10F, FontStyle.Regular, GraphicsUnit.Point);
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(760, 520);
            MinimumSize = new Size(620, 420);
            FormBorderStyle = FormBorderStyle.Sizable;
            ControlBox = true;
            MinimizeBox = true;
            MaximizeBox = true;
            KeyPreview = true;
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);

            TableLayoutPanel root = new TableLayoutPanel();
            root.Dock = DockStyle.Fill;
            root.Padding = new Padding(32, 28, 32, 28);
            root.RowCount = 6;
            root.ColumnCount = 1;
            root.BackColor = BackColor;
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));

            Label eyebrow = CreateLabel("BOT CONTROL CENTER · RELEASE MENSUAL", 9F, FontStyle.Bold, Color.FromArgb(154, 168, 178));
            eyebrow.Margin = new Padding(0, 0, 0, 10);
            root.Controls.Add(eyebrow, 0, 0);

            Label title = CreateLabel("Galerazo Bot", 24F, FontStyle.Bold, Color.FromArgb(245, 247, 250));
            title.Margin = new Padding(0, 0, 0, 12);
            root.Controls.Add(title, 0, 1);

            statusLabel = CreateLabel("Preparando el release programado…", 13F, FontStyle.Bold, Color.FromArgb(199, 255, 0));
            statusLabel.Margin = new Padding(0, 0, 0, 6);
            root.Controls.Add(statusLabel, 0, 2);

            detailLabel = CreateLabel("La ventana se cerrará automáticamente al finalizar.", 10F, FontStyle.Regular, Color.FromArgb(176, 187, 196));
            detailLabel.Margin = new Padding(0, 0, 0, 18);
            root.Controls.Add(detailLabel, 0, 3);

            Panel eventSurface = new Panel();
            eventSurface.Dock = DockStyle.Fill;
            eventSurface.BackColor = Color.FromArgb(12, 20, 26);
            eventSurface.Padding = new Padding(18);
            eventPanel = new FlowLayoutPanel();
            eventPanel.Dock = DockStyle.Fill;
            eventPanel.FlowDirection = FlowDirection.TopDown;
            eventPanel.WrapContents = false;
            eventPanel.AutoScroll = false;
            eventPanel.BackColor = eventSurface.BackColor;
            eventSurface.Controls.Add(eventPanel);
            root.Controls.Add(eventSurface, 0, 4);

            progressBar = new ProgressBar();
            progressBar.Dock = DockStyle.Fill;
            progressBar.Height = 8;
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.MarqueeAnimationSpeed = 28;
            progressBar.Margin = new Padding(0, 18, 0, 0);
            root.Controls.Add(progressBar, 0, 5);

            Controls.Add(root);
            Shown += delegate { StartRelease(); };
            FormClosing += HandleFormClosing;
            KeyDown += HandleKeyDown;
        }

        private static Label CreateLabel(string text, float size, FontStyle style, Color color)
        {
            Label label = new Label();
            label.AutoSize = true;
            label.MaximumSize = new Size(680, 0);
            label.Text = text;
            label.Font = new Font("Segoe UI", size, style, GraphicsUnit.Point);
            label.ForeColor = color;
            label.BackColor = Color.Transparent;
            return label;
        }

        private void StartRelease()
        {
            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = releaseArguments.NodePath;
            startInfo.Arguments = Quote(releaseArguments.RunnerPath)
                + " --config " + Quote(releaseArguments.ConfigPath)
                + " --bot " + Quote(releaseArguments.BotId);
            startInfo.WorkingDirectory = Path.GetDirectoryName(releaseArguments.RunnerPath);
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;
            startInfo.StandardOutputEncoding = Encoding.UTF8;
            startInfo.StandardErrorEncoding = Encoding.UTF8;

            releaseProcess = new Process();
            releaseProcess.StartInfo = startInfo;
            releaseProcess.EnableRaisingEvents = true;
            releaseProcess.OutputDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
            {
                if (!String.IsNullOrWhiteSpace(eventArgs.Data)) BeginInvoke((Action)(() => AddEvent(eventArgs.Data, false)));
            };
            releaseProcess.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
            {
                if (!String.IsNullOrWhiteSpace(eventArgs.Data)) BeginInvoke((Action)(() => AddEvent(eventArgs.Data, true)));
            };
            releaseProcess.Exited += delegate { BeginInvoke((Action)FinishRelease); };

            releaseRunning = true;
            AddEvent("Iniciando el runner seguro de Bot Control Center…", false);
            if (!releaseProcess.Start())
            {
                throw new InvalidOperationException("Windows no pudo iniciar el runner del release.");
            }
            releaseProcess.BeginOutputReadLine();
            releaseProcess.BeginErrorReadLine();
        }

        private static string Quote(string value)
        {
            return "\"" + value + "\"";
        }

        private void AddEvent(string rawLine, bool isError)
        {
            string line = rawLine.Trim();
            if (line.Length > 220) line = line.Substring(0, 220) + "…";
            events.Add(line);
            if (events.Count > 8) events.RemoveAt(0);
            eventPanel.Controls.Clear();
            foreach (string entry in events)
            {
                Label label = CreateLabel(entry, 9.5F, FontStyle.Regular, isError && entry == line
                    ? Color.FromArgb(255, 151, 151)
                    : Color.FromArgb(207, 216, 222));
                label.Margin = new Padding(0, 0, 0, 8);
                eventPanel.Controls.Add(label);
            }
            statusLabel.Text = isError ? "El release informó un error" : "Release en curso…";
        }

        private void FinishRelease()
        {
            if (!releaseRunning) return;
            releaseProcess.WaitForExit();
            ReleaseExitCode = releaseProcess.ExitCode;
            releaseRunning = false;
            progressBar.Style = ProgressBarStyle.Continuous;
            progressBar.MarqueeAnimationSpeed = 0;
            progressBar.Value = 100;
            AddEvent(ReleaseExitCode == 0 ? "Proceso completado correctamente." : "Proceso finalizado con código " + ReleaseExitCode + ".", ReleaseExitCode != 0);
            statusLabel.Text = ReleaseExitCode == 0 ? "Release finalizado" : "El release terminó con error";
            statusLabel.ForeColor = ReleaseExitCode == 0
                ? Color.FromArgb(199, 255, 0)
                : Color.FromArgb(255, 151, 151);
            detailLabel.Text = "Finalizó a las " + DateTime.Now.ToString("HH:mm:ss") + ". Esta ventana se cerrará sola.";
            ScheduleClose();
        }

        private void ScheduleClose()
        {
            if (closeScheduled) return;
            closeScheduled = true;
            System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
            timer.Interval = 1800;
            timer.Tick += delegate
            {
                timer.Stop();
                timer.Dispose();
                Close();
            };
            timer.Start();
        }

        private void HandleFormClosing(object sender, FormClosingEventArgs eventArgs)
        {
            if (!releaseRunning) return;
            eventArgs.Cancel = true;
            Hide();
        }

        private void HandleKeyDown(object sender, KeyEventArgs eventArgs)
        {
            if (eventArgs.KeyCode != Keys.Escape) return;
            eventArgs.Handled = true;
            Close();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing && releaseProcess != null) releaseProcess.Dispose();
            base.Dispose(disposing);
        }
    }
}
