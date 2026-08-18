/**
 * Which kitchen tickets this tab has already printed, keyed by the server's own KOT number
 * (FireBatch.kotNumber — globally unique, so no need to pair it with an order id). Every
 * explicit print trigger (POS/Table/Takeaway/Token screens firing an order, PendingOrdersHost
 * confirming a guest's first round) marks its own batch here the moment it prints it, so
 * AutoKotPrintHost's safety-net poll — which exists for the one case nothing else covers, a
 * guest firing a LATER round via "Add more items" with no staff action at all — never
 * double-prints a ticket someone already handled.
 *
 * Deliberately just an in-memory Set, not persisted: it only has to survive one tab's session.
 * A reload re-baselines AutoKotPrintHost against whatever's already fired (see its own
 * comments), which is the correct behaviour anyway — nothing here needs to survive a reload.
 */
const printed = new Set<string>();

export const isKotPrinted = (kotNumber: string): boolean => printed.has(kotNumber);

export const markKotPrinted = (kotNumber: string): void => {
  printed.add(kotNumber);
};
