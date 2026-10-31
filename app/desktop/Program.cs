using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace StreamSprites.Desktop
{
    internal static class Program
    {
        private const string MutexName = @"Local\StreamSprites.Desktop";

        [STAThread]
        private static void Main()
        {
            using (var mutex = new Mutex(true, MutexName, out bool createdNew))
            {
                if (!createdNew)
                {
                    MessageBox.Show("Stream Sprites is already running.", "Stream Sprites",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MainForm());
                GC.KeepAlive(mutex);
            }
        }
    }

    internal sealed class MainForm : Form
    {
        private const string AppName = "Stream Sprites";
        private const string WebView2DownloadUrl = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
        private static readonly HashSet<string> AuthHosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "twitch.tv",
            "www.twitch.tv",
            "id.twitch.tv",
            "passport.twitch.tv",
            "dashboard.twitch.tv"
        };

        private readonly Stopwatch _clock = Stopwatch.StartNew();
        private readonly HttpClient _http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        private readonly object _logLock = new object();
        private readonly WebView2 _webView = new WebView2();
        private readonly Panel _loadingPanel = new Panel();
        private readonly PictureBox _logoBox = new PictureBox();
        private readonly Label _titleLabel = new Label();
        private readonly Label _subtitleLabel = new Label();
        private readonly Label _statusLabel = new Label();
        private readonly LinkLabel _actionLink = new LinkLabel();
        private readonly System.Windows.Forms.Timer _dotsTimer = new System.Windows.Forms.Timer();

        private Panel _loadingContent = null!;
        private string _appDir = string.Empty;
        private string _dataDir = string.Empty;
        private string _configPath = string.Empty;
        private string _assetsDir = string.Empty;
        private string _storageConfigPath = string.Empty;
        private string _logDir = string.Empty;
        private string _desktopLogPath = string.Empty;
        private string _cliNodePath = string.Empty;
        private string _serverUrl = string.Empty;
        private string _statusBase = "Starting";
        private string _actionTarget = string.Empty;
        private StreamWriter? _logWriter;
        private FileStream? _logStream;
        private Process? _server;
        private Icon? _appIcon;
        private int _port = 8080;
        private int _dotCount;
        private bool _webViewReady;
        private bool _serverReady;
        private bool _hasBeenHealthy;
        private bool _closing;
        private bool _shutdownStarted;
        private bool _restarting;
        private bool _navigating;
        private string _lastNavigationUri = string.Empty;
        private long _windowShownMs = -1;
        private string _windowStatePath = string.Empty;

        public MainForm()
        {
            _dataDir = ResolveDataDirectory();
            _windowStatePath = Path.Combine(_dataDir, "window-state.json");
            BuildUi();
            ApplySavedWindowState();

            _dotsTimer.Interval = 450;
            _dotsTimer.Tick += DotsTimer_Tick;

            Shown += MainForm_Shown;
        }

        private static string ResolveDataDirectory()
        {
            string overrideDir = Environment.GetEnvironmentVariable("STREAM_SPRITES_DESKTOP_DATA_DIR") ?? string.Empty;
            return !string.IsNullOrWhiteSpace(overrideDir)
                ? Path.GetFullPath(overrideDir)
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), AppName);
        }

        private void ApplySavedWindowState()
        {
            try
            {
                if (!File.Exists(_windowStatePath)) return;
                WindowStateData? state = JsonSerializer.Deserialize<WindowStateData>(File.ReadAllText(_windowStatePath));
                if (state == null) return;

                int width = Math.Max(MinimumSize.Width, state.Width);
                int height = Math.Max(MinimumSize.Height, state.Height);
                Rectangle requested = new Rectangle(state.Left, state.Top, width, height);
                bool onScreen = false;
                foreach (Screen screen in Screen.AllScreens)
                {
                    if (screen.WorkingArea.IntersectsWith(requested))
                    {
                        onScreen = true;
                        Rectangle work = screen.WorkingArea;
                        width = Math.Min(width, work.Width);
                        height = Math.Min(height, work.Height);
                        requested = new Rectangle(
                            Math.Max(work.Left, Math.Min(state.Left, work.Right - width)),
                            Math.Max(work.Top, Math.Min(state.Top, work.Bottom - height)),
                            width,
                            height);
                        break;
                    }
                }

                StartPosition = FormStartPosition.Manual;
                Bounds = onScreen
                    ? requested
                    : new Rectangle(0, 0, width, height);
                if (!onScreen) StartPosition = FormStartPosition.CenterScreen;
                if (state.Maximized) WindowState = FormWindowState.Maximized;
            }
            catch
            {
                // A corrupt or inaccessible state file should never block startup.
            }
        }

        private void SaveWindowState()
        {
            try
            {
                Rectangle bounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
                if (bounds.Width <= 0 || bounds.Height <= 0) return;
                var state = new WindowStateData
                {
                    Left = bounds.Left,
                    Top = bounds.Top,
                    Width = bounds.Width,
                    Height = bounds.Height,
                    Maximized = WindowState == FormWindowState.Maximized
                };
                Directory.CreateDirectory(_dataDir);
                string json = JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true });
                string temp = _windowStatePath + ".tmp";
                File.WriteAllText(temp, json);
                File.Move(temp, _windowStatePath, true);
            }
            catch
            {
                // Window persistence is best-effort.
            }
        }

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

        private void BuildUi()
        {
            SuspendLayout();

            Text = AppName;
            ClientSize = new Size(1280, 860);
            MinimumSize = new Size(900, 600);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(17, 17, 17);
            AutoScaleMode = AutoScaleMode.Dpi;
            Font = new Font("Segoe UI", 9F);

            _appIcon = TryLoadExecutableIcon();
            if (_appIcon != null) Icon = _appIcon;

            _webView.Dock = DockStyle.Fill;
            _webView.DefaultBackgroundColor = Color.FromArgb(17, 17, 17);
            _webView.Visible = false;

            _loadingPanel.Dock = DockStyle.Fill;
            _loadingPanel.BackColor = Color.FromArgb(17, 17, 17);

            _loadingContent = new Panel
            {
                Size = new Size(520, 280),
                BackColor = Color.FromArgb(17, 17, 17)
            };

            _logoBox.Location = new Point(224, 8);
            _logoBox.Size = new Size(72, 72);
            _logoBox.SizeMode = PictureBoxSizeMode.Zoom;
            _logoBox.BackColor = Color.FromArgb(17, 17, 17);
            _logoBox.Image = _appIcon?.ToBitmap();

            _titleLabel.Location = new Point(0, 98);
            _titleLabel.Size = new Size(520, 42);
            _titleLabel.Text = AppName;
            _titleLabel.TextAlign = ContentAlignment.MiddleCenter;
            _titleLabel.ForeColor = Color.White;
            _titleLabel.Font = new Font("Segoe UI", 22F, FontStyle.Bold);

            _subtitleLabel.Location = new Point(0, 144);
            _subtitleLabel.Size = new Size(520, 24);
            _subtitleLabel.Text = "Starting your local dashboard";
            _subtitleLabel.TextAlign = ContentAlignment.MiddleCenter;
            _subtitleLabel.ForeColor = Color.FromArgb(148, 163, 184);
            _subtitleLabel.Font = new Font("Segoe UI", 10F);

            _statusLabel.Location = new Point(0, 180);
            _statusLabel.Size = new Size(520, 26);
            _statusLabel.Text = "Preparing";
            _statusLabel.TextAlign = ContentAlignment.MiddleCenter;
            _statusLabel.ForeColor = Color.FromArgb(56, 189, 248);
            _statusLabel.Font = new Font("Segoe UI", 9.5F);

            _actionLink.Location = new Point(0, 216);
            _actionLink.Size = new Size(520, 24);
            _actionLink.Text = string.Empty;
            _actionLink.TextAlign = ContentAlignment.MiddleCenter;
            _actionLink.LinkColor = Color.FromArgb(125, 211, 252);
            _actionLink.ActiveLinkColor = Color.White;
            _actionLink.Visible = false;
            _actionLink.LinkClicked += ActionLink_LinkClicked;

            _loadingContent.Controls.Add(_logoBox);
            _loadingContent.Controls.Add(_titleLabel);
            _loadingContent.Controls.Add(_subtitleLabel);
            _loadingContent.Controls.Add(_statusLabel);
            _loadingContent.Controls.Add(_actionLink);

            _loadingPanel.Controls.Add(_loadingContent);
            _loadingPanel.Resize += (_, __) => CenterLoadingContent();

            Controls.Add(_webView);
            Controls.Add(_loadingPanel);
            _loadingPanel.BringToFront();

            CenterLoadingContent();
            ResumeLayout(false);
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            try
            {
                int dark = 1;
                if (DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int)) != 0)
                {
                    DwmSetWindowAttribute(Handle, 19, ref dark, sizeof(int));
                }
            }
            catch
            {
                // Older Windows builds may not support the dark title bar attribute.
            }
        }

        private static Icon? TryLoadExecutableIcon()
        {
            try
            {
                return Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch
            {
                return null;
            }
        }

        private void CenterLoadingContent()
        {
            if (_loadingContent == null) return;
            int left = Math.Max(0, (_loadingPanel.ClientSize.Width - _loadingContent.Width) / 2);
            int top = Math.Max(0, (_loadingPanel.ClientSize.Height - _loadingContent.Height) / 2);
            _loadingContent.Location = new Point(left, top);
        }

        private void MainForm_Shown(object? sender, EventArgs e)
        {
            _windowShownMs = _clock.ElapsedMilliseconds;
            _dotsTimer.Start();
            _ = StartAsync();
        }

        private async Task StartAsync()
        {
            try
            {
                PrepareEnvironment();
                LogEvent("environment_ready");

                Task webViewTask = InitializeWebViewAsync();
                Task serverTask = StartServerAndWaitAsync();
                await Task.WhenAll(webViewTask, serverTask);

                LogEvent("startup_ready");
                NavigateToApp();
            }
            catch (WebView2RuntimeNotFoundException ex)
            {
                LogEvent("startup_failed webview2_missing: " + ex.Message);
                ShowError(
                    "Microsoft Edge WebView2 Runtime is required.",
                    WebView2DownloadUrl,
                    "Install WebView2");
            }
            catch (Exception ex)
            {
                LogEvent("startup_failed: " + ex);
                string message = string.IsNullOrWhiteSpace(ex.Message)
                    ? "Stream Sprites could not start."
                    : ex.Message;
                ShowError(message, _logDir, "Open logs folder");
            }
        }

        private void PrepareEnvironment()
        {
            _appDir = LocateAppDirectory();
            _dataDir = ResolveDataDirectory();
            _configPath = Path.Combine(_dataDir, "config.json");
            _assetsDir = Path.Combine(_dataDir, "assets");
            _storageConfigPath = Path.Combine(_dataDir, "storage-config.json");
            _logDir = Path.Combine(_dataDir, "logs");
            _desktopLogPath = Path.Combine(_logDir, "desktop.log");

            Directory.CreateDirectory(_dataDir);
            Directory.CreateDirectory(Path.Combine(_dataDir, "db"));
            Directory.CreateDirectory(_assetsDir);
            Directory.CreateDirectory(_logDir);
            Directory.CreateDirectory(Path.Combine(_dataDir, "WebView2"));

            SeedSkins();
            OpenDesktopLog();
            if (_windowShownMs >= 0)
            {
                WriteLog(string.Format("desktop +{0} ms window_shown", _windowShownMs));
            }
            UpdateLogoFromAppDirectory();
        }

        private static string LocateAppDirectory()
        {
            string baseDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            string[] candidates =
            {
                Path.Combine(baseDir, "app"),
                baseDir
            };

            foreach (string candidate in candidates)
            {
                if (File.Exists(Path.Combine(candidate, "server", "server.js"))) return candidate;
            }

            DirectoryInfo? current = Directory.GetParent(baseDir);
            while (current != null)
            {
                string candidate = Path.Combine(current.FullName, "app");
                if (File.Exists(Path.Combine(candidate, "server", "server.js"))) return candidate;
                if (File.Exists(Path.Combine(current.FullName, "server", "server.js"))) return current.FullName;
                current = current.Parent;
            }

            throw new DirectoryNotFoundException("Could not find the Stream Sprites app folder next to the executable.");
        }

        private void SeedSkins()
        {
            string source = Path.Combine(_appDir, "assets", "skins");
            string destination = Path.Combine(_assetsDir, "skins");
            Directory.CreateDirectory(destination);
            if (!Directory.Exists(source)) return;

            foreach (string file in Directory.EnumerateFiles(source))
            {
                string target = Path.Combine(destination, Path.GetFileName(file));
                if (File.Exists(target)) continue;
                try
                {
                    File.Copy(file, target);
                }
                catch (Exception ex)
                {
                    LogEvent("skin_seed_failed " + Path.GetFileName(file) + ": " + ex.Message);
                }
            }
        }

        private void UpdateLogoFromAppDirectory()
        {
            string iconPath = Path.Combine(_appDir, "favicon.ico");
            if (!File.Exists(iconPath)) return;

            try
            {
                using (var icon = new Icon(iconPath, 96, 96))
                {
                    Image? old = _logoBox.Image;
                    _logoBox.Image = icon.ToBitmap();
                    old?.Dispose();
                }
                Icon? oldIcon = _appIcon;
                _appIcon = new Icon(iconPath, 64, 64);
                Icon = _appIcon;
                oldIcon?.Dispose();
            }
            catch (Exception ex)
            {
                LogEvent("icon_load_failed: " + ex.Message);
            }
        }

        private void OpenDesktopLog()
        {
            const long maxBytes = 5 * 1024 * 1024;
            try
            {
                if (File.Exists(_desktopLogPath) && new FileInfo(_desktopLogPath).Length > maxBytes)
                {
                    string previous = _desktopLogPath + ".1";
                    if (File.Exists(previous)) File.Delete(previous);
                    File.Move(_desktopLogPath, previous);
                }

                _logStream = new FileStream(_desktopLogPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
                _logWriter = new StreamWriter(_logStream, new UTF8Encoding(false)) { AutoFlush = true };
            }
            catch
            {
                _logWriter = null;
                _logStream = null;
            }
        }

        private void LogEvent(string message)
        {
            WriteLog(string.Format("desktop +{0} ms {1}", _clock.ElapsedMilliseconds, message));
        }

        private void WriteLog(string message)
        {
            string line = string.Format("[{0:O}] {1}", DateTime.UtcNow, message);
            lock (_logLock)
            {
                try
                {
                    _logWriter?.WriteLine(line);
                }
                catch
                {
                    // Logging must never take the app down.
                }
            }
            Debug.WriteLine(line);
        }

        private void WriteServerLog(string stream, string line)
        {
            WriteLog("[" + stream + "] " + line);
        }

        private static string? FindBundledWebView2Runtime()
        {
            string runtimeDir = Path.Combine(AppContext.BaseDirectory, "webview2");
            return File.Exists(Path.Combine(runtimeDir, "msedgewebview2.exe")) ? runtimeDir : null;
        }

        private async Task InitializeWebViewAsync()
        {
            string? bundledRuntime = FindBundledWebView2Runtime();
            string version = bundledRuntime == null
                ? CoreWebView2Environment.GetAvailableBrowserVersionString()
                : CoreWebView2Environment.GetAvailableBrowserVersionString(bundledRuntime);
            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(
                bundledRuntime,
                Path.Combine(_dataDir, "WebView2"),
                null);
            await _webView.EnsureCoreWebView2Async(environment);

            CoreWebView2 core = _webView.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.NewWindowRequested += Core_NewWindowRequested;
            core.NavigationStarting += Core_NavigationStarting;
            core.NavigationCompleted += Core_NavigationCompleted;

            _webViewReady = true;
            LogEvent("webview_ready version=" + version + " runtime=" + (bundledRuntime ?? "installed"));
        }

        private void Core_NewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            if (IsAuthHost(e.Uri)) return;
            OpenExternal(e.Uri);
        }

        private void Core_NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
        {
            _lastNavigationUri = e.Uri;
            if (IsAppUrl(e.Uri) || IsAuthHost(e.Uri)) return;

            e.Cancel = true;
            OpenExternal(e.Uri);
        }

        private void Core_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (_closing) return;

            if (!e.IsSuccess)
            {
                if (IsAppUrl(_lastNavigationUri))
                {
                    _navigating = false;
                    ShowError(
                        "The dashboard could not be loaded from the local server.",
                        _logDir,
                        "Open logs folder");
                }
                return;
            }

            if (IsAppUrl(_lastNavigationUri))
            {
                _navigating = false;
                LogEvent("dashboard_loaded url=" + _lastNavigationUri);
                ShowDashboard();
            }
        }

        private bool IsAppUrl(string url)
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out Uri? uri)) return false;
            if (uri.Scheme != Uri.UriSchemeHttp) return false;
            if (!uri.IsLoopback) return false;
            string port = uri.IsDefaultPort ? "80" : uri.Port.ToString();
            return port == _port.ToString();
        }

        private static bool IsAuthHost(string url)
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out Uri? uri)) return false;
            if (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp) return false;
            return AuthHosts.Contains(uri.Host);
        }

        private static void OpenExternal(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch
            {
                // Ignore malformed or unsupported external links.
            }
        }

        private async Task StartServerAndWaitAsync()
        {
            if (_closing) return;

            _port = ReadConfiguredPort();
            _serverUrl = "http://localhost:" + _port + "/";
            _serverReady = false;
            ShowLoading("Starting the local server");

            _cliNodePath = FindNodeExecutable();
            LogEvent("server_starting node=" + _cliNodePath);
            Process process = StartNodeServer(_cliNodePath);
            _server = process;

            DateTime deadline = DateTime.UtcNow.AddSeconds(30);
            while (DateTime.UtcNow < deadline)
            {
                if (_closing) throw new OperationCanceledException();
                if (process.HasExited)
                {
                    throw new InvalidOperationException(
                        "The local server exited during startup. Port " + _port +
                        " may already be in use. See the desktop log for details.");
                }

                if (await IsHealthyAsync())
                {
                    _serverReady = true;
                    _hasBeenHealthy = true;
                    LogEvent("server_ready pid=" + process.Id + " port=" + _port);
                    return;
                }

                await Task.Delay(250);
            }

            throw new TimeoutException("The local server did not become ready in time.");
        }

        private int ReadConfiguredPort()
        {
            try
            {
                if (File.Exists(_configPath))
                {
                    using (JsonDocument document = JsonDocument.Parse(File.ReadAllText(_configPath)))
                    {
                        if (document.RootElement.TryGetProperty("serverPort", out JsonElement value) &&
                            value.TryGetInt32(out int port) && port > 0 && port < 65536)
                        {
                            return port;
                        }
                    }
                }
            }
            catch
            {
                // The server creates a default config when it starts.
            }
            return 8080;
        }

        private static string FindNodeExecutable()
        {
            string explicitPath = Environment.GetEnvironmentVariable("STREAM_SPRITES_NODE") ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(explicitPath) && File.Exists(explicitPath)) return explicitPath;

            string bundledNode = Path.Combine(AppContext.BaseDirectory, "node", "node.exe");
            if (File.Exists(bundledNode)) return bundledNode;

            string adjacentNode = Path.Combine(AppContext.BaseDirectory, "node.exe");
            if (File.Exists(adjacentNode)) return adjacentNode;

            string? path = Environment.GetEnvironmentVariable("PATH");
            if (!string.IsNullOrWhiteSpace(path))
            {
                foreach (string directory in path.Split(Path.PathSeparator))
                {
                    try
                    {
                        string candidate = Path.Combine(directory.Trim(), "node.exe");
                        if (File.Exists(candidate)) return candidate;
                    }
                    catch
                    {
                        // Ignore malformed PATH entries.
                    }
                }
            }

            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string[] common =
            {
                Path.Combine(programFiles, "nodejs", "node.exe"),
                Path.Combine(programFilesX86, "nodejs", "node.exe")
            };
            foreach (string candidate in common)
            {
                if (File.Exists(candidate)) return candidate;
            }

            throw new NodeNotFoundException("The bundled Node.js runtime is missing. Reinstall Stream Sprites or set STREAM_SPRITES_NODE.");
        }

        private Process StartNodeServer(string nodePath)
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = nodePath,
                WorkingDirectory = _appDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };
            startInfo.ArgumentList.Add(Path.Combine(_appDir, "server", "server.js"));
            startInfo.Environment["STREAM_SPRITES_DESKTOP"] = "1";
            startInfo.Environment["STREAM_SPRITES_SUPERVISED"] = "1";
            startInfo.Environment["STREAM_SPRITES_CONFIG"] = _configPath;
            startInfo.Environment["STREAM_SPRITES_DATA_DIR"] = _dataDir;
            startInfo.Environment["STREAM_SPRITES_ASSETS_DIR"] = _assetsDir;
            startInfo.Environment["STREAM_SPRITES_STORAGE_CONFIG"] = _storageConfigPath;
            startInfo.Environment["STREAM_SPRITES_LOG_DIR"] = _logDir;

            var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
            process.OutputDataReceived += (_, e) =>
            {
                if (e.Data != null) WriteServerLog("server", e.Data);
            };
            process.ErrorDataReceived += (_, e) =>
            {
                if (e.Data != null) WriteServerLog("server:error", e.Data);
            };
            process.Exited += ServerExited;

            if (!process.Start())
            {
                throw new InvalidOperationException("Could not start the local Node.js server.");
            }

            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            LogEvent("server_started pid=" + process.Id + " node=" + nodePath);
            return process;
        }

        private void ServerExited(object? sender, EventArgs e)
        {
            if (!(sender is Process process)) return;
            int code;
            try { code = process.ExitCode; } catch { code = -1; }
            LogEvent("server_exited pid=" + process.Id + " code=" + code);

            if (_closing) return;
            if (!ReferenceEquals(process, _server)) return;

            _server = null;
            _serverReady = false;
            if (!_hasBeenHealthy || _restarting) return;

            BeginInvoke(new Action(async () => await RestartServerAsync()));
        }

        private async Task RestartServerAsync()
        {
            if (_closing || _restarting) return;
            _restarting = true;
            try
            {
                ShowLoading("Restarting the local server");
                await StartServerAndWaitAsync();
                NavigateToApp();
            }
            catch (Exception ex)
            {
                LogEvent("restart_failed: " + ex);
                ShowError(ex.Message, _logDir, "Open logs folder");
            }
            finally
            {
                _restarting = false;
            }
        }

        private async Task<bool> IsHealthyAsync()
        {
            try
            {
                using (HttpResponseMessage response = await _http.GetAsync("http://127.0.0.1:" + _port + "/healthz"))
                {
                    if (!response.IsSuccessStatusCode) return false;
                    string body = await response.Content.ReadAsStringAsync();
                    using (JsonDocument document = JsonDocument.Parse(body))
                    {
                        return document.RootElement.TryGetProperty("status", out JsonElement status) &&
                               status.GetString() == "ok";
                    }
                }
            }
            catch
            {
                return false;
            }
        }

        private void NavigateToApp()
        {
            if (_closing || _navigating || !_webViewReady || !_serverReady || _webView.CoreWebView2 == null) return;

            _navigating = true;
            _lastNavigationUri = string.Empty;
            ShowLoading("Loading dashboard");
            _webView.CoreWebView2.Navigate(_serverUrl);
        }

        private void ShowLoading(string status)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action<string>(ShowLoading), status);
                return;
            }

            _titleLabel.Text = AppName;
            _subtitleLabel.Text = "Starting your local dashboard";
            _statusBase = status;
            _statusLabel.Text = status;
            _statusLabel.ForeColor = Color.FromArgb(56, 189, 248);
            _actionLink.Visible = false;
            _actionTarget = string.Empty;
            _webView.Visible = false;
            _loadingPanel.Visible = true;
            _loadingPanel.BringToFront();
            _dotsTimer.Start();
        }

        private void ShowDashboard()
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action(ShowDashboard));
                return;
            }

            _dotsTimer.Stop();
            _loadingPanel.Visible = false;
            _webView.Visible = true;
            _webView.BringToFront();
        }

        private void ShowError(string message, string target, string linkText)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action<string, string, string>(ShowError), message, target, linkText);
                return;
            }

            _dotsTimer.Stop();
            _titleLabel.Text = "Unable to start";
            _subtitleLabel.Text = message;
            _statusLabel.Text = "See the app log for more details.";
            _statusLabel.ForeColor = Color.FromArgb(248, 113, 113);
            _actionTarget = target;
            _actionLink.Text = linkText;
            _actionLink.Visible = true;
            _webView.Visible = false;
            _loadingPanel.Visible = true;
            _loadingPanel.BringToFront();
        }

        private void DotsTimer_Tick(object? sender, EventArgs e)
        {
            _dotCount = (_dotCount + 1) % 4;
            _statusLabel.Text = _statusBase + new string('.', _dotCount);
        }

        private void ActionLink_LinkClicked(object? sender, LinkLabelLinkClickedEventArgs e)
        {
            if (string.IsNullOrWhiteSpace(_actionTarget)) return;
            try
            {
                if (Directory.Exists(_actionTarget))
                {
                    Process.Start(new ProcessStartInfo("explorer.exe", "\"" + _actionTarget + "\"")
                    {
                        UseShellExecute = true
                    });
                }
                else
                {
                    Process.Start(new ProcessStartInfo(_actionTarget) { UseShellExecute = true });
                }
            }
            catch
            {
                // Ignore failures opening external destinations.
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!_shutdownStarted)
            {
                _shutdownStarted = true;
                _closing = true;
                SaveWindowState();
                e.Cancel = true;
                Hide();
                BeginInvoke(new Action(async () =>
                {
                    await ShutdownAsync();
                    Close();
                }));
                return;
            }

            base.OnFormClosing(e);
        }

        private async Task ShutdownAsync()
        {
            LogEvent("shutting_down");
            _dotsTimer.Stop();
            Process? process = _server;
            _server = null;
            if (process != null)
            {
                try
                {
                    if (!process.HasExited)
                    {
                        await process.StandardInput.WriteLineAsync("shutdown");
                        await process.StandardInput.FlushAsync();
                    }
                }
                catch
                {
                    // Fall back to terminating the process below.
                }

                try
                {
                    using (var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3)))
                    {
                        await process.WaitForExitAsync(timeout.Token);
                    }
                }
                catch
                {
                    KillProcessTree(process);
                }
            }

            lock (_logLock)
            {
                try { _logWriter?.Flush(); } catch { }
                try { _logWriter?.Dispose(); } catch { }
                _logWriter = null;
                try { _logStream?.Dispose(); } catch { }
                _logStream = null;
            }
        }

        private static void KillProcessTree(Process process)
        {
            try
            {
                if (process.HasExited) return;
                var startInfo = new ProcessStartInfo("taskkill", "/PID " + process.Id + " /T /F")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (Process? killer = Process.Start(startInfo))
                {
                    killer?.WaitForExit(3000);
                }
            }
            catch
            {
                try { process.Kill(true); } catch { }
            }
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            _dotsTimer.Dispose();
            _http.Dispose();
            _webView.Dispose();
            _logoBox.Image?.Dispose();
            _appIcon?.Dispose();
            base.OnFormClosed(e);
        }

        private sealed class WindowStateData
        {
            public int Left { get; set; }
            public int Top { get; set; }
            public int Width { get; set; }
            public int Height { get; set; }
            public bool Maximized { get; set; }
        }

        private sealed class NodeNotFoundException : Exception
        {
            public NodeNotFoundException(string message) : base(message) { }
        }
    }
}
