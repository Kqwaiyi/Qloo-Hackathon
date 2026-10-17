"use client";

import { useRef, useState } from "react";

import { primaryButton, secondaryButton } from "@/components/ui";
import { BUDGET_TIER_LABELS, BUDGET_TIERS, type BudgetTier } from "@/config/consultations";

import { changeBudgetTierAction } from "./actions";
import { useStylingRequest } from "./use-styling-request";

/**
 * The results header's Budget Tier dropdown, for a body photo. Picking another tier offers "Get new
 * Outfits", and sent, the Styling step takes the page's place while Outfits are built at it from
 * the same Style Icons. Picking alone starts nothing, so the tiers can be stepped through with the
 * keyboard. It's disabled, with the reason on the allowance line, while no Styling can start, and
 * while one runs.
 */
export function BudgetTierDropdown({
  consultationId,
  budgetTier,
  canStart,
  allowanceLineId,
}: {
  consultationId: string;
  /** The current Budget Tier. */
  budgetTier: BudgetTier;
  /** A Styling can start: no limit holds, and none runs on the Consultation. */
  canStart: boolean;
  allowanceLineId: string;
}) {
  const [picked, setPicked] = useState(budgetTier);
  const { sending, failed, send, clearFailed } = useStylingRequest();
  const dropdown = useRef<HTMLSelectElement>(null);

  function pick(value: string) {
    setPicked(BUDGET_TIERS.find((tier) => tier === value) ?? budgetTier);
    clearFailed();
  }

  function cancel() {
    pick(budgetTier);
    dropdown.current?.focus();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="budget-tier" className="text-stone-600">
          Budget Tier
        </label>
        <select
          ref={dropdown}
          id="budget-tier"
          value={picked}
          onChange={(event) => pick(event.target.value)}
          disabled={!canStart || sending}
          aria-describedby={allowanceLineId}
          className="rounded-lg border border-stone-300 bg-white py-2 pr-8 pl-3 font-medium outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {BUDGET_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {BUDGET_TIER_LABELS[tier]}
            </option>
          ))}
        </select>
        {picked !== budgetTier && (
          <>
            <button
              type="button"
              onClick={() => send(() => changeBudgetTierAction(consultationId, picked))}
              disabled={!canStart || sending}
              aria-describedby={`${allowanceLineId} budget-tier-failed`}
              className={`${primaryButton} px-4 py-2`}
            >
              {sending ? "Starting…" : "Get new Outfits"}
            </button>
            <button type="button" onClick={cancel} disabled={sending} className={`${secondaryButton} px-4 py-2 disabled:opacity-40`}>
              Cancel
            </button>
          </>
        )}
      </div>
      {failed && (
        <p id="budget-tier-failed" role="alert" className="mt-1 text-red-700">
          We couldn&apos;t change the Budget Tier just now. Try again in a moment.
        </p>
      )}
    </div>
  );
}
