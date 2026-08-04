/**
 * Equal-split maths for the Tables bill splitter. Kept out of the screen so the one part
 * that's genuinely easy to get wrong — rounding — is unit-testable on its own.
 *
 * The rule every POS needs and a naive `total / ways` misses: rupees don't divide evenly.
 * ₹100 across 3 is 33.333..., and three shares of ₹33.33 collect ₹99.99, leaving a stranded
 * paisa that keeps the bill from ever closing (the API's own settle check allows only a
 * 0.01 tolerance — see OrdersController's Pay). So every share but the last is rounded DOWN
 * to the paisa and the last one absorbs whatever's left over: 33.33 + 33.33 + 33.34.
 */
export const equalShares = (total: number, ways: number): number[] => {
  if (!Number.isFinite(total) || total <= 0 || ways < 1) return [];

  const totalPaise = Math.round(total * 100);
  const basePaise = Math.floor(totalPaise / ways);
  const shares = Array<number>(ways).fill(basePaise / 100);
  // Whatever the floor division dropped, all of it onto the last share. At most
  // (ways - 1) paise, so this never meaningfully skews one guest's bill.
  shares[ways - 1] = (basePaise + (totalPaise - basePaise * ways)) / 100;
  return shares;
};

/**
 * How many leading shares are already covered by what's been collected on this order.
 *
 * The API records payments as a running total against the bill (OrderPayment rows → the
 * order's amountPaid), not per person — it has no concept of "Person 2 paid". Rather than
 * keep a parallel per-person tally in component state, which a refresh or a second device
 * would immediately contradict, this derives the paid/unpaid marks from the one number the
 * server does know. Shares are therefore settled front to back, which costs nothing: two
 * shares of the same amount are interchangeable as far as the bill is concerned.
 */
export const paidShareCount = (shares: number[], amountPaid: number): number => {
  let covered = 0;
  let count = 0;
  for (const share of shares) {
    covered += share;
    // 0.01 tolerance, matching the API's own settle comparison — a share recorded as
    // 33.34 against a 33.33 expectation must still read as paid.
    if (covered > amountPaid + 0.01) break;
    count += 1;
  }
  return count;
};
