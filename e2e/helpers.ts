import type { Page } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import type { AuditFixture, TestApiClient } from "./fixtures";

class DashboardTestApi implements TestApiClient {
  private readonly repoRoot = path.resolve(__dirname, "..");
  private readonly auditContent: AuditFixture;
  private server?: ChildProcessWithoutNullStreams;
  private tempDir?: string;
  private auditPath?: string;
  private output = "";

  public baseURL = "";

  constructor(auditContent: AuditFixture) {
    this.auditContent = auditContent;
  }

  async start(): Promise<void> {
    const port = await reservePort();
    this.baseURL = `http://127.0.0.1:${port}`;
    this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ops-dashboard-e2e-"));
    this.auditPath = path.join(this.tempDir, "npm-audit.json");

    const auditFile =
      typeof this.auditContent === "string"
        ? this.auditContent
        : JSON.stringify(this.auditContent, null, 2);
    await fs.writeFile(this.auditPath, auditFile, "utf8");

    this.server = spawn(process.execPath, ["src/server.js", "--port", String(port)], {
      cwd: this.repoRoot,
      env: {
        ...process.env,
        DEPENDENCY_AUDIT_FILE: this.auditPath,
        DEPENDENCY_AUDIT_FIXTURE: this.auditPath,
        NODE_ENV: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.server.stdout.on("data", (chunk) => {
      this.output += String(chunk);
    });
    this.server.stderr.on("data", (chunk) => {
      this.output += String(chunk);
    });

    await waitForUrl(this.dashboardPath("/"), () => this.output);
  }

  dashboardPath(pathname = "/"): string {
    return new URL(pathname, this.baseURL).toString();
  }

  async cleanup(): Promise<void> {
    if (this.server && !this.server.killed) {
      this.server.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        this.server?.once("exit", () => resolve());
        setTimeout(resolve, 1000);
      });
    }

    if (this.tempDir) {
      await fs.rm(this.tempDir, { force: true, recursive: true });
    }
  }
}

export async function createTestApi(auditContent: AuditFixture): Promise<TestApiClient> {
  return new DashboardTestApi(auditContent);
}

export async function loginAsDefault(page: Page): Promise<void> {
  await page.context().clearCookies();
}

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to reserve a local port"));
        return;
      }

      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitForUrl(url: string, serverOutput: () => string): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Dashboard did not start at ${url}: ${String(lastError)}\n${serverOutput()}`);
}
