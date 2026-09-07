import { canVoidItem } from './permissions';

/** Mirrors backend OrdersController.RemoveItem: the Owner/Manager gate applies only once a
 *  line has reached a KOT. If these two ever disagree, the UI either hides a control that
 *  would have worked or shows one that can only 403. */
describe('canVoidItem', () => {
  // Every role that is not Owner/Manager, Cashier and Accountant included — the gate is about
  // authority over a bill, not about standing on the floor, so the till operator sits below it
  // too (same as the backend's IsOwnerOrManager).
  const FLOOR_ROLES = ['Waiter', 'Chef', 'KitchenStaff', 'Cashier', 'Accountant'] as const;

  it('lets any role pull a line the kitchen never saw', () => {
    for (const role of [...FLOOR_ROLES, 'Manager', 'Owner'] as const) {
      expect(canVoidItem(role, 0)).toBe(true);
    }
  });

  it('keeps a fired line off the floor roles', () => {
    for (const role of FLOOR_ROLES) {
      expect(canVoidItem(role, 1)).toBe(false);
    }
  });

  it('lets Owner and Manager void a fired line', () => {
    expect(canVoidItem('Owner', 1)).toBe(true);
    expect(canVoidItem('Manager', 1)).toBe(true);
  });

  it('refuses a fired line when the role is not known yet', () => {
    expect(canVoidItem(undefined, 3)).toBe(false);
  });
});
