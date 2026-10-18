import { BUDGET_TIER_LABELS, type BudgetTier } from "@/config/consultations";

// Small wordings the chapters share.

/** A Style Icon's initials, shown in place of a picture: Qloo's images of them have no licence. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** The sample's Budget Tier on a chip: "Medium Budget Tier", or "Any price" for No Budget. */
export function budgetTierChip(budgetTier: BudgetTier | null): string {
  return !budgetTier || budgetTier === "no_budget" ? "No Budget: any price" : `${BUDGET_TIER_LABELS[budgetTier]} Budget Tier`;
}

/** Which Brands Qloo picks from, by the sample's Budget Tier. */
export function budgetTierPhrase(budgetTier: BudgetTier | null): string {
  if (!budgetTier || budgetTier === "no_budget") return "at any price";
  return `within the ${BUDGET_TIER_LABELS[budgetTier]} Budget Tier`;
}
