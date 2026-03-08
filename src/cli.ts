#!/usr/bin/env node
import { join, dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { Command } from "commander";
import { CopilotService } from "./copilot-service.js";
import { loadConfig, loadAllProviderConfigs, resolveConfigPath } from "./config.js";
import type { AllProviderConfigs, ServerConfig } from "./config.js";
import { createServer } from "./server.js";
import { Logger } from "./logger.js";
import { Stats } from "./stats.js";
import { providers, createAutoProvider } from "./providers/index.js";
import type { Provider } from "./providers/types.js";
import type { AppContext } from "./context.js";
import type { ProviderMode } from "./schemas/config.js";
import {
  parsePort,
  parseLogLevel,
  parseProvider,
  parseIdleTimeout,
} from "./cli-validators.js";
import { bold, dim, createSpinner, printBanner, printUsageSummary } from "./ui.js";

const PACKAGE_ROOT = dirname(import.meta.dirname);
const DEFAULT_CONFIG_PATH = join(PACKAGE_ROOT, "config.json5");

const { version } = z.object({ version: z.string() }).parse(
  JSON.parse(await readFile(join(PACKAGE_ROOT, "package.json"), "utf-8")),
);

interface StartOptions {
  port: string;
  provider?: string;
  logLevel: string;
  config?: string;
  cwd?: string;
  idleTimeout?: string;
}

async function loadProvider(
  mode: ProviderMode,
  configPath: string,
  logger: Logger,
): Promise<{ provider: Provider; config: ServerConfig; allConfigs?: AllProviderConfigs }> {
  if (mode === "auto") {
    const allConfigs = await loadAllProviderConfigs(configPath, logger);
    return { provider: createAutoProvider(allConfigs.providers), config: allConfigs.shared, allConfigs };
  }
  const config = await loadConfig(configPath, logger, mode);
  return { provider: providers[mode], config };
}

async function startServer(options: StartOptions): Promise<void> {
  const logLevel = parseLogLevel(options.logLevel);
  const logger = new Logger(logLevel);
  const port = parsePort(options.port);
  const mode: ProviderMode = options.provider ? parseProvider(options.provider) : "auto";
  const idleTimeoutMinutes = options.idleTimeout ? parseIdleTimeout(options.idleTimeout) : 0;

  const configPath = options.config ?? resolveConfigPath(options.cwd, process.cwd(), DEFAULT_CONFIG_PATH);
  const { provider, config, allConfigs } = await loadProvider(mode, configPath, logger);
  const cwd = options.cwd;

  const service = new CopilotService({
    logLevel,
    logger,
    cwd,
  });

  const quiet = logLevel === "none";

  if (!quiet) {
    console.log();
    console.log(`  ${bold("copilot-proxy")} ${dim(`v${version}`)}`);
    console.log();
  }

  const bootSpinner = quiet ? null : createSpinner("Initialising Copilot SDK...");
  await service.start();
  bootSpinner?.succeed("Copilot SDK initialised");

  const authSpinner = quiet ? null : createSpinner("Authenticating...");
  const auth = await service.getAuthStatus();
  if (!auth.isAuthenticated) {
    authSpinner?.fail("Not authenticated");
    logger.error(
      "Sign in with the Copilot CLI (copilot login) or GitHub CLI (gh auth login), or set a GITHUB_TOKEN environment variable.",
    );
    await service.stop();
    process.exit(1);
  }
  const login = auth.login ?? "unknown";
  const authType = auth.authType ?? "unknown";
  authSpinner?.succeed(`Authenticated as ${bold(login)} ${dim(`(${authType})`)}`);

  const stats = new Stats();
  const ctx: AppContext = { service, logger, config, port, stats };
  const app = await createServer(ctx, provider);

  let lastActivity = Date.now();
  app.addHook("onResponse", () => {
    lastActivity = Date.now();
  });

  const listenSpinner = quiet ? null : createSpinner(`Starting server on port ${String(port)}...`);
  const prevPinoLevel = app.log.level;
  app.log.level = "silent";
  await app.listen({ port, host: "127.0.0.1" });
  app.log.level = prevPinoLevel;
  listenSpinner?.succeed(`Listening on ${bold(`http://localhost:${String(port)}`)}`);

  if (!quiet) {
    printBanner({
      port,
      provider: mode,
      providerName: provider.name,
      routes: [...provider.routes, "GET /health"],
      cwd: service.cwd,
    });
  }

  logger.debug(`Config loaded from ${configPath}`);
  const mcpCount = allConfigs
    ? Object.values(allConfigs.providers).reduce((sum, c) => sum + Object.keys(c.mcpServers).length, 0)
    : Object.keys(config.mcpServers).length;
  const cliToolsSummary = config.allowedCliTools.includes("*")
    ? "all CLI tools allowed"
    : `${String(config.allowedCliTools.length)} allowed CLI tool(s)`;
  logger.debug(`${String(mcpCount)} MCP server(s), ${cliToolsSummary}`);

  const shutdown = async (signal: string) => {
    process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
      logger.debug(`Ignoring error during shutdown: ${err.message}`);
    });

    logger.info(`Got ${signal}, shutting down...`);

    await app.close();

    const stopPromise = service.stop().then(() => {
      logger.info("Clean shutdown complete");
    });
    const timeoutPromise = new Promise<void>((resolve) =>
      setTimeout(() => {
        logger.warn("Copilot client didn't stop in time, forcing exit");
        resolve();
      }, 3000),
    );

    await Promise.race([stopPromise, timeoutPromise]);

    if (!quiet) {
      printUsageSummary(stats.snapshot());
    }

    process.exit(0);
  };

  let shuttingDown = false;
  const onSignal = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    shutdown(signal).catch((err: unknown) => {
      console.error("Shutdown error:", err);
      process.exit(1);
    });
  };
  process.on("SIGINT", () => { onSignal("SIGINT"); });
  process.on("SIGTERM", () => { onSignal("SIGTERM"); });

  if (idleTimeoutMinutes > 0) {
    const idleMs = idleTimeoutMinutes * 60_000;
    const checkInterval = Math.min(idleMs, 60_000);
    const timer = setInterval(() => {
      if (Date.now() - lastActivity >= idleMs) {
        clearInterval(timer);
        logger.info(`Idle for ${String(idleTimeoutMinutes)} minute(s), shutting down`);
        onSignal("idle-timeout");
      }
    }, checkInterval);
    timer.unref();
  }
}

const program = new Command()
  .name("copilot-proxy")
  .description("Generic proxy server translating API requests into GitHub Copilot SDK sessions")
  .version(version, "-v, --version");

program
  .command("start", { isDefault: true })
  .description("Start the proxy server")
  .option("-p, --port <number>", "port to listen on", "8080")
  .option("--provider <name>", "run a single provider: openai, claude, codex")
  .option("-l, --log-level <level>", "log verbosity", "info")
  .option("-c, --config <path>", "path to config file")
  .option("--cwd <path>", "working directory for Copilot sessions")
  .option("--idle-timeout <minutes>", "shut down after N minutes of inactivity", "0")
  .action((options: StartOptions) => startServer(options));

program.parseAsync().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
