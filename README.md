# copilot-sdk-proxy

A proxy server that wraps the [GitHub Copilot SDK](https://github.com/github/copilot-sdk) and exposes it as an OpenAI, Anthropic, or Codex (Responses) compatible API. Any client that speaks one of these APIs can talk to it.

This is the shared core that [xcode-copilot-server](https://github.com/theblixguy/xcode-copilot-server) builds on. It also works standalone as a general-purpose Copilot proxy.

## Quick start

You need [Node.js](https://nodejs.org) 25.6.0 or later and a GitHub Copilot subscription.

**1. Authenticate** with one of these (you only need one):

```bash
copilot login # Copilot CLI
gh auth login # GitHub CLI
```

Or set a `GITHUB_TOKEN` environment variable with a valid fine-grained Copilot access token.

**2. Install:**

```bash
npm install -g copilot-sdk-proxy
```

**3. Start the server:**

```bash
copilot-proxy
```

By default the server starts on port 8080 in auto mode, which registers all three providers at once. Point your client at `http://localhost:8080` and it will proxy requests through the Copilot SDK.

## Providers

The server runs in **auto mode** by default, which registers all three providers simultaneously. You can also run a single provider with `--provider`:

| Provider | Flag | Routes |
|----------|------|--------|
| All (auto) | _(default)_ | All routes below |
| OpenAI `/chat/completions` | `--provider openai` | `GET /v1/models`, `POST /v1/chat/completions` |
| Anthropic `/messages` | `--provider claude` | `POST /v1/messages`, `POST /v1/messages/count_tokens` |
| OpenAI `/responses` | `--provider codex` | `POST /v1/responses` |

```bash
copilot-proxy                          # auto mode: all providers
copilot-proxy --provider claude        # single provider
copilot-proxy --provider codex --port 9090
```

All three stream responses as server-sent events. The Copilot SDK handles tool execution internally through its built-in CLI tools.

### Feature support

| Feature | `/chat/completions` | `/messages` | `/responses` |
|---------|---------------------|-------------|--------------|
| Streaming (SSE) | Yes | Yes | Yes |
| Tool execution | Yes | Yes | Yes |
| Reasoning/thinking tokens | No (hidden by API) | Yes (thinking blocks) | Yes (reasoning summary) |
| Token counting | No | Yes (`POST /v1/messages/count_tokens`) | No |
| Model listing | Yes (`GET /v1/models`) | No | No |

A `GET /health` endpoint is available on all providers. It pings the Copilot SDK backend and returns `{"status":"ok","message":"...","timestamp":...,"protocolVersion":...}` on success or a 503 with `{"status":"error","message":"..."}` on failure.

## Configuration

The server reads a `config.json5` file. It ships with a default one, but you can point to your own with `--config`:

```bash
copilot-proxy --config ./my-config.json5
```

The config file uses [JSON5](https://json5.org/) format:

```json5
{
  // Per-provider MCP servers. Each provider gets its own set.
  // openai: {
  //   mcpServers: {
  //     filesystem: {
  //       type: "local",
  //       command: "npx",
  //       args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/projects"],
  //     },
  //   },
  // },
  openai: { mcpServers: {} },
  claude: { mcpServers: {} },
  codex: { mcpServers: {} },

  // Built-in Copilot CLI tools allowlist. Use ["*"] to allow all, [] to deny
  // all, or list specific tools like ["glob", "grep", "bash"].
  allowedCliTools: ["*"],

  // Maximum request body size in MiB.
  bodyLimit: 10,

  // Server-level request timeout in minutes. 0: disabled.
  requestTimeout: 0,

  // Reasoning effort for models that support it: "low", "medium", "high", "xhigh".
  // reasoningEffort: null,

  // Auto-approve permission requests. Set to true to approve all, false to deny
  // all, or pass an array of specific kinds: ["read", "write", "shell", "mcp", "url"].
  autoApprovePermissions: true,
}
```

In auto mode, all three provider sections are active. In single-provider mode (`--provider`), only the specified provider's MCP servers are used. Settings like `allowedCliTools`, `bodyLimit`, and `autoApprovePermissions` are shared across all providers.

## CLI reference

```text
copilot-proxy [options]

Options:
  -p, --port <number>            Port to listen on (default: 8080)
  --provider <name>              API format: openai, claude, codex (default: auto: all providers)
  -l, --log-level <level>        Log verbosity (default: info)
  -c, --config <path>            Path to config file
  --cwd <path>                   Working directory for Copilot sessions
  --idle-timeout <minutes>       Shut down after N minutes of inactivity (default: 0, disabled)
  -v, --version                  Output the version number
  -h, --help                     Show help
```

## Architecture

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the codebase is structured, the request lifecycle, streaming protocol translation, and conversation management.

See [TESTING.md](docs/TESTING.md) for how the integration tests work using llm-mock-server and the SDK's BYOK provider.

## Development

```bash
npm run build # Compile TypeScript
npm run dev # Run from source with tsx
npm test # Run tests
npm run lint # Lint with ESLint
npm run typecheck # Type-check without emitting
```

## Using as a library

The package exports its internals so you can build on top of it. This is how [`xcode-copilot-server`](https://github.com/theblixguy/xcode-copilot-server) adds Xcode-specific things like tool bridging and settings patching.

```typescript
import {
  CopilotService,
  createServer,
  Logger,
  Stats,
  providers,
} from "copilot-sdk-proxy";

const logger = new Logger("info");
const service = new CopilotService({ logLevel: "info", logger });
await service.start();

const stats = new Stats();
const app = await createServer(
  { service, logger, config, port: 8080, stats },
  providers.claude,
);
await app.listen({ port: 8080, host: "127.0.0.1" });
```

Some of the main exports:

- `CopilotService` -- manages the SDK lifecycle and authentication
- `createServer` -- builds a Fastify server with provider-specific routes
- `providers` -- registry of `openai`, `claude`, and `codex` with their schemas, prompt formatters, and streaming handlers
- `createAutoProvider` -- registers all three providers on a single server (auto mode)
- `loadAllProviderConfigs` -- loads per-provider configs from a single config file
- `createSessionConfig` -- builds SDK session configs (MCP servers, permissions, reasoning effort)
- `resolveModelForSession` -- model resolution with family-based fallback
- `Logger`, `Stats`, `createSpinner`, `printBanner`, `printUsageSummary`
- Zod schemas: `ChatCompletionRequestSchema`, `AnthropicMessagesRequestSchema`, etc.

## License

MIT License

Copyright (c) 2026 Suyash Srijan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
