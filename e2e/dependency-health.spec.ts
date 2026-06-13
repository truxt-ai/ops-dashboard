import { expect, test, type Locator } from "@playwright/test";

import { createTestApi, loginAsDefault } from "./helpers";
import type { TestApiClient } from "./fixtures";

let api: TestApiClient | undefined;

test.afterEach(async () => {
  await api?.cleanup();
  api = undefined;
});

test.describe("dependency health dashboard workflows", () => {
  test.describe("clean dependency state", () => {
    test.beforeEach(async ({ page }) => {
      api = await createTestApi(cleanAudit());
      await loginAsDefault(page);
      await api.start();
    });

    test("shows the clean dependency health state without exposing raw audit JSON", async ({ page }) => {
      await page.goto(api!.dashboardPath("/"));

      const card = page.getByTestId("dependency-health-card");
      await expect(card).toBeVisible();
      await expect(card.getByText("No known dependency vulnerabilities.")).toBeVisible();
      await expect(card.getByTestId("dependency-total-risk")).toHaveText("0");
      await expect(card).toContainText(/clean/i);
      await expect(page.locator("body")).not.toContainText(/"vulnerabilities"\s*:/i);
      await expect(page.locator("body")).not.toContainText(/"auditReportVersion"\s*:/i);
    });
  });

  test.describe("risky dependency state", () => {
    test.beforeEach(async ({ page }) => {
      api = await createTestApi(riskyAudit());
      await loginAsDefault(page);
      await api.start();
    });

    test("shows risky dependency details with priority-ordered severities and remediation", async ({ page }) => {
      await page.goto(api!.dashboardPath("/"));

      const card = page.getByTestId("dependency-health-card");
      await expect(card).toBeVisible();
      await expect(card).toContainText(/risk present|vulnerabilit(?:y|ies) found/i);
      await expect(card.getByTestId("severity-critical")).toContainText("1");
      await expect(card.getByTestId("severity-high")).toContainText("1");
      await expect(card.getByTestId("severity-moderate")).toContainText("1");
      await expect(card.getByTestId("severity-low")).toContainText("1");
      await expect(card.getByTestId("severity-info")).toContainText("1");

      await expectSeverityOrder(card, ["critical", "high", "moderate", "low", "info"]);
      await expectCriticalAndHighEmphasis(page);

      const details = page.getByTestId("dependency-health-details");
      const detailsToggle = page.getByRole("button", {
        name: /view dependency details|show affected dependencies|show details/i,
      });
      if (await detailsToggle.isVisible()) {
        await detailsToggle.click();
      }

      await expect(details).toBeVisible();
      await expect(details.getByRole("row", { name: /lodash.*critical.*Prototype Pollution.*4\.17\.4.*4\.17\.21/i })).toBeVisible();
      await expect(details.getByRole("row", { name: /minimist.*high.*Prototype Pollution.*1\.2\.0.*1\.2\.8/i })).toBeVisible();
      await expect(details.getByRole("row", { name: /ejs.*moderate.*template injection.*2\.5\.7.*3\.1\.10/i })).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/"vulnerabilities"\s*:/i);
    });
  });

  test.describe("malformed dependency data", () => {
    test.beforeEach(async ({ page }) => {
      api = await createTestApi('{ "auditReportVersion": 2, "vulnerabilities": {');
      await loginAsDefault(page);
      await api.start();
    });

    test("shows a visible dependency health error when stored audit data is malformed", async ({ page }) => {
      await page.goto(api!.dashboardPath("/"));

      const card = page.getByTestId("dependency-health-card");
      await expect(card).toBeVisible();
      await expect(card).toContainText(/dependency health unavailable|unable to load dependency health/i);
      await expect(card).toContainText(/stored audit data/i);
      await expect(page.locator("body")).not.toContainText(/SyntaxError|Unexpected token|ENOENT/i);
      await expect(page.locator("body")).not.toContainText(/"vulnerabilities"\s*:/i);
    });
  });
});

async function expectSeverityOrder(card: Locator, severities: string[]): Promise<void> {
  const summary = card.getByTestId("dependency-health-severity-summary");
  await expect(summary).toBeVisible();

  const summaryText = await summary.innerText();
  let previousIndex = -1;
  for (const severity of severities) {
    const index = summaryText.toLowerCase().indexOf(severity);
    expect(index, `${severity} should be visible in severity summary`).toBeGreaterThan(-1);
    expect(index, `${severity} should appear after higher-priority severities`).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}

async function expectCriticalAndHighEmphasis(page: { getByTestId(testId: string): Locator }): Promise<void> {
  const critical = page.getByTestId("severity-critical");
  const high = page.getByTestId("severity-high");
  const low = page.getByTestId("severity-low");

  await expect(critical).toBeVisible();
  await expect(high).toBeVisible();
  await expect(low).toBeVisible();

  const criticalStyles = await visualStyles(critical);
  const highStyles = await visualStyles(high);
  const lowStyles = await visualStyles(low);

  expect(
    criticalStyles.fontWeight > lowStyles.fontWeight ||
      criticalStyles.backgroundColor !== lowStyles.backgroundColor ||
      criticalStyles.color !== lowStyles.color,
    "critical severity should be visually emphasized over low severity",
  ).toBe(true);
  expect(
    highStyles.fontWeight > lowStyles.fontWeight ||
      highStyles.backgroundColor !== lowStyles.backgroundColor ||
      highStyles.color !== lowStyles.color,
    "high severity should be visually emphasized over low severity",
  ).toBe(true);
}

async function visualStyles(locator: Locator): Promise<{
  backgroundColor: string;
  color: string;
  fontWeight: number;
}> {
  return locator.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      fontWeight: Number.parseInt(styles.fontWeight, 10) || 400,
    };
  });
}

function cleanAudit() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        total: 0,
      },
      dependencies: {
        prod: 5,
        dev: 1,
        optional: 0,
        peer: 0,
        peerOptional: 0,
        total: 6,
      },
    },
  };
}

function riskyAudit() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      lodash: {
        name: "lodash",
        severity: "critical",
        currentVersion: "4.17.4",
        vulnerableVersionRange: "<4.17.21",
        fixedVersion: "4.17.21",
        remediation: "Upgrade lodash to 4.17.21.",
        via: [
          {
            source: 1106913,
            name: "lodash",
            dependency: "lodash",
            title: "Prototype Pollution in lodash",
            severity: "critical",
            range: "<4.17.21",
          },
        ],
        effects: [],
        range: "<4.17.21",
        nodes: ["node_modules/lodash"],
        fixAvailable: {
          name: "lodash",
          version: "4.17.21",
          isSemVerMajor: false,
        },
      },
      minimist: {
        name: "minimist",
        severity: "high",
        currentVersion: "1.2.0",
        vulnerableVersionRange: "<1.2.8",
        fixedVersion: "1.2.8",
        remediation: "Upgrade minimist to 1.2.8.",
        via: [
          {
            source: 1096466,
            name: "minimist",
            dependency: "minimist",
            title: "Prototype Pollution in minimist",
            severity: "high",
            range: "<1.2.8",
          },
        ],
        effects: [],
        range: "<1.2.8",
        nodes: ["node_modules/minimist"],
        fixAvailable: {
          name: "minimist",
          version: "1.2.8",
          isSemVerMajor: false,
        },
      },
      ejs: {
        name: "ejs",
        severity: "moderate",
        currentVersion: "2.5.7",
        vulnerableVersionRange: "<3.1.10",
        fixedVersion: "3.1.10",
        remediation: "Upgrade ejs to 3.1.10.",
        via: [
          {
            source: 1099595,
            name: "ejs",
            dependency: "ejs",
            title: "Server-side template injection in ejs",
            severity: "moderate",
            range: "<3.1.10",
          },
        ],
        effects: [],
        range: "<3.1.10",
        nodes: ["node_modules/ejs"],
        fixAvailable: {
          name: "ejs",
          version: "3.1.10",
          isSemVerMajor: false,
        },
      },
      "debug-helper": {
        name: "debug-helper",
        severity: "low",
        currentVersion: "0.1.0",
        vulnerableVersionRange: "<0.1.2",
        fixedVersion: "0.1.2",
        remediation: "Upgrade debug-helper to 0.1.2.",
        via: [
          {
            source: 1000001,
            name: "debug-helper",
            dependency: "debug-helper",
            title: "Verbose dependency diagnostics leak non-sensitive metadata",
            severity: "low",
            range: "<0.1.2",
          },
        ],
        effects: [],
        range: "<0.1.2",
        nodes: ["node_modules/debug-helper"],
        fixAvailable: {
          name: "debug-helper",
          version: "0.1.2",
          isSemVerMajor: false,
        },
      },
      "license-notice": {
        name: "license-notice",
        severity: "info",
        currentVersion: "1.0.0",
        vulnerableVersionRange: "informational",
        fixedVersion: null,
        remediation: "Review advisory and no code upgrade is required.",
        via: [
          {
            source: 1000002,
            name: "license-notice",
            dependency: "license-notice",
            title: "Informational dependency advisory",
            severity: "info",
            range: "informational",
          },
        ],
        effects: [],
        range: "informational",
        nodes: ["node_modules/license-notice"],
        fixAvailable: false,
      },
    },
    metadata: {
      vulnerabilities: {
        info: 1,
        low: 1,
        moderate: 1,
        high: 1,
        critical: 1,
        total: 5,
      },
      dependencies: {
        prod: 7,
        dev: 1,
        optional: 0,
        peer: 0,
        peerOptional: 0,
        total: 8,
      },
    },
  };
}
