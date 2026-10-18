import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const COLUMNS = [
  "customer_id",
  "tenure_months",
  "contract_type",
  "monthly_charges",
  "total_charges",
  "support_tickets_90d",
  "payment_method",
  "has_premium_support",
  "last_login_days_ago",
  "plan_tier",
  "cancellation_request_date",
  "churned",
];

// The generator writes no quoted fields, so a plain split is a faithful parse.
const text = readFileSync(fileURLToPath(new URL("../data/churn.csv", import.meta.url)), "utf8").trimEnd();
const [header, ...lines] = text.split("\n");
const rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [COLUMNS[i], v])) as Record<string, string>);
const churners = rows.filter((r) => r.churned === "1");
const stayers = rows.filter((r) => r.churned === "0");
const rate = (xs: Record<string, string>[], pred: (r: Record<string, string>) => boolean) => xs.filter(pred).length / xs.length;

describe("data/churn.csv (scripts/generate_churn.py, seed 42)", () => {
  it("has the expected columns and 5,000 well-formed rows", () => {
    expect(header.split(",")).toEqual(COLUMNS);
    expect(rows).toHaveLength(5000);
    expect(lines.every((l) => l.split(",").length === COLUMNS.length)).toBe(true);
    expect(new Set(rows.map((r) => r.customer_id)).size).toBe(5000);
    expect(new Set(rows.map((r) => r.contract_type))).toEqual(new Set(["month-to-month", "one-year", "two-year"]));
    expect(churners.length + stayers.length).toBe(5000);
  });

  it("is imbalanced at about 15% churn", () => {
    const churnRate = churners.length / rows.length;
    expect(churnRate).toBeGreaterThanOrEqual(0.13);
    expect(churnRate).toBeLessThanOrEqual(0.17);
  });

  it("plants the cancellation_request_date leak (~90% of churners, ~1% of others)", () => {
    const hasDate = (r: Record<string, string>) => /^\d{4}-\d{2}-\d{2}$/.test(r.cancellation_request_date);
    expect(rate(churners, hasDate)).toBeGreaterThan(0.85);
    expect(rate(churners, hasDate)).toBeLessThan(0.95);
    expect(rate(stayers, hasDate)).toBeLessThan(0.03);
    expect(rows.every((r) => r.cancellation_request_date === "" || hasDate(r))).toBe(true);
  });

  it("has ~1% missing total_charges and total ≈ tenure × monthly elsewhere", () => {
    const missing = rate(rows, (r) => r.total_charges === "");
    expect(missing).toBeGreaterThan(0.004);
    expect(missing).toBeLessThan(0.02);
    const filled = rows.filter((r) => r.total_charges !== "");
    const close = rate(filled, (r) => {
      const expected = Number(r.tenure_months) * Number(r.monthly_charges);
      return Math.abs(Number(r.total_charges) - expected) <= Math.max(0.15 * expected, Number(r.monthly_charges));
    });
    expect(close).toBeGreaterThan(0.99);
  });

  it("makes churn depend on tenure and contract type", () => {
    const mean = (xs: Record<string, string>[], k: string) => xs.reduce((s, r) => s + Number(r[k]), 0) / xs.length;
    expect(mean(churners, "tenure_months")).toBeLessThan(mean(stayers, "tenure_months"));
    const m2m = rate(rows.filter((r) => r.contract_type === "month-to-month"), (r) => r.churned === "1");
    const twoYear = rate(rows.filter((r) => r.contract_type === "two-year"), (r) => r.churned === "1");
    expect(m2m).toBeGreaterThan(twoYear * 2);
  });
});
