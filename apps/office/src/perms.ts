// Each role's normal permissions (same as the database). The owner can change single ones per person.
export const DEF: Record<string, Record<string, boolean>> = {
  supervisor: { seePrices: true, schedule: true, assign: true, allJobs: true, customers: true, estimates: true, payments: true, prices: true, discounts: true, remove: true, pricebook: false, acctnums: true, inventory: true },
  tech: { seePrices: true, schedule: false, assign: false, allJobs: false, customers: true, estimates: true, payments: true, prices: false, discounts: true, remove: false, pricebook: false, acctnums: false, inventory: false },
  apprentice: {},
};
