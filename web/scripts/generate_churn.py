#!/usr/bin/env python3
"""Generate the seeded synthetic churn dataset for the Co-learn demo (docs/design-plan.md §14).

Python stdlib only. Run from web/:  python3 scripts/generate_churn.py
Writes data/churn.csv (5,000 rows, ~15% churn).

Teaching hooks planted in the data:
- Class imbalance (~15% churn): accuracy is misleading.
- A leak: cancellation_request_date is filled for ~90% of churners (and ~1% of non-churners),
  so a model that uses it looks near-perfect but would fail in production.
- Missing values: ~1% of total_charges are blank.
- Correlated features: total_charges ~= tenure_months * monthly_charges.
"""
import csv
import datetime as dt
import math
import os
import random

SEED = 42
N_ROWS = 5000
OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "churn.csv")

COLUMNS = [
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
]

PLAN_PRICES = {"basic": (25.0, 8.0), "standard": (60.0, 10.0), "premium": (95.0, 12.0)}
# Intercept calibrated so the overall churn rate lands near 15% with seed 42.
INTERCEPT = -2.45


def weighted_choice(rng, options):
    r = rng.random()
    acc = 0.0
    for value, weight in options:
        acc += weight
        if r < acc:
            return value
    return options[-1][0]


def poisson(rng, lam):
    # Knuth's algorithm; fine for small lambda.
    limit = math.exp(-lam)
    k, p = 0, 1.0
    while True:
        p *= rng.random()
        if p <= limit:
            return k
        k += 1


def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-x))


def make_row(rng, i):
    contract = weighted_choice(rng, [("month-to-month", 0.55), ("one-year", 0.25), ("two-year", 0.20)])
    # Longer contracts skew toward longer tenure.
    tenure_mean = {"month-to-month": 14, "one-year": 30, "two-year": 45}[contract]
    tenure = max(1, min(72, int(round(rng.expovariate(1.0 / tenure_mean))) + 1))

    plan = weighted_choice(rng, [("basic", 0.35), ("standard", 0.45), ("premium", 0.20)])
    mu, sd = PLAN_PRICES[plan]
    monthly = round(max(18.0, min(130.0, rng.gauss(mu, sd))), 2)

    total = tenure * monthly * (1.0 + rng.gauss(0.0, 0.03))
    total_str = "" if rng.random() < 0.01 else f"{max(total, monthly):.2f}"

    premium_support = rng.random() < (0.45 if plan == "premium" else 0.2)
    tickets = poisson(rng, 0.8 if premium_support else 1.3)
    payment = weighted_choice(
        rng,
        [("credit_card", 0.32), ("bank_transfer", 0.28), ("electronic_check", 0.28), ("mailed_check", 0.12)],
    )
    last_login = min(120, int(rng.expovariate(1.0 / 9.0)))

    logit = (
        INTERCEPT
        - 0.045 * tenure
        + 1.1 * (contract == "month-to-month")
        - 0.4 * (contract == "two-year")
        + 0.38 * tickets
        + 0.018 * (monthly - 60.0)
        + rng.gauss(0.0, 0.9)  # unobserved noise keeps a fair model around ROC-AUC 0.8
    )
    churned = 1 if rng.random() < sigmoid(logit) else 0

    # Planted leak: only known *after* the customer has decided to leave.
    has_request = rng.random() < (0.90 if churned else 0.01)
    cancel_date = ""
    if has_request:
        cancel_date = (dt.date(2026, 1, 1) + dt.timedelta(days=rng.randrange(0, 270))).isoformat()

    return {
        "customer_id": f"C{100000 + i}",
        "tenure_months": tenure,
        "contract_type": contract,
        "monthly_charges": f"{monthly:.2f}",
        "total_charges": total_str,
        "support_tickets_90d": tickets,
        "payment_method": payment,
        "has_premium_support": "yes" if premium_support else "no",
        "last_login_days_ago": last_login,
        "plan_tier": plan,
        "cancellation_request_date": cancel_date,
        "churned": churned,
    }


def main():
    random.seed(SEED)
    rng = random
    rows = [make_row(rng, i) for i in range(N_ROWS)]
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    churners = sum(r["churned"] for r in rows)
    leaks = sum(1 for r in rows if r["churned"] and r["cancellation_request_date"])
    print(f"wrote {len(rows)} rows to {os.path.normpath(OUT_PATH)}")
    print(f"churn rate {churners / len(rows):.3f}; leak filled for {leaks / max(churners, 1):.3f} of churners")


if __name__ == "__main__":
    main()
