import { BUDGET_TIER_LABELS, type BudgetTier } from "@/config/consultations";

// Small wordings the chapters share.

/** The sample's Budget Tier on a chip: "Medium Budget Tier", or "Any price" for No Budget. */
export function budgetTierChip(budgetTier: BudgetTier | null): string {
  return !budgetTier || budgetTier === "no_budget" ? "No Budget: any price" : `${BUDGET_TIER_LABELS[budgetTier]} Budget Tier`;
}

/** Which Brands Qloo finds, by the sample's Budget Tier. */
export function budgetTierPhrase(budgetTier: BudgetTier | null): string {
  if (!budgetTier || budgetTier === "no_budget") return "at any price";
  return `within the ${BUDGET_TIER_LABELS[budgetTier]} Budget Tier`;
}
