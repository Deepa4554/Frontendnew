# Removed Unused Code — Reference for Future Features

This file lists code that was deleted from the frontend (`src/`) on 2026-07-11 because it had **zero real usage anywhere in the app** (confirmed by import-count grep across the whole codebase before deletion). Nothing here was reachable by a real user or wired to any real screen/navigation.

It's kept as a reference in case any of these ideas are worth building for real later — most were half-scaffolded stubs from an earlier prototype phase, superseded by the real React Query + backend API architecture the app actually uses today.

If you want to rebuild any of these, don't resurrect the deleted file — the app's real patterns (React Query hooks in `core/api/hooks/`, calling real ASP.NET Core backend endpoints) are the correct way to do it now, not a Redux slice with mock data.

## Whole feature ideas that were scaffolded but never built for real

- **CRM Campaigns** (`features/crm/presentation/screens/CampaignsScreen.tsx`) — a marketing-campaigns screen (active campaigns, drafts, reach/conversion stats, an "AI Recommendation" card). All data was hardcoded/fake and it was never wired into `CRMNavigator`. If a real campaigns feature is wanted, it would need a real `Campaign` backend entity + endpoints — nothing to reuse from the deleted file.
- **Live Sales Trend chart** (`features/management/dashboard/.../LiveSalesChart.tsx`) — a dashboard widget meant to show a real-time ticking sales chart. Was pure `Math.random()`, updated every 3s, never imported by `DashboardScreen`. A real version would need a websocket/polling endpoint for live order events.
- **Forecast / KPI / Peak Hours / Top-Worst-Items dashboard widgets** (`features/management/dashboard/.../{ForecastChart,KPICard,PeakHoursChart,TopWorstItemsChart}.tsx`) — an earlier draft of dashboard components. The *real* forecast/peak-hours/top-items features already exist and are live — see `AIAssistantScreen.tsx` (real sales forecast + shift optimization) and `DashboardScreen.tsx`'s real `useDashboardAnalytics` (peak hours, top items). These deleted files were dead duplicates, not missing functionality.
- **Enterprise "integrations" mock layer** — `core/integrations/CommunicationService.ts` (SMS/email/push sender), `core/monitoring/{MonitoringService,CrashReporter}.ts` (APM/crash reporting), `core/network/{OfflineSyncManager,RealtimeService}.ts` (offline queue, websocket realtime), `core/security/SecurityService.ts` (security/audit mock). All were fully mocked (console.log + fake delays), never called from anywhere. If any of these are genuinely wanted later (e.g. real crash reporting via Sentry, real push notifications), they should be built against a real third-party SDK, not resurrected from these stubs.
- **Standalone billing engine** — `features/billing/domain/{entities/Invoice.ts,usecases/BillingEngine.ts}` — a client-side cart/tax/split-bill calculation engine. The real billing flow (`features/billing/payment/presentation/screens/BillingScreen.tsx`) uses the backend's real order totals instead — the backend is the source of truth for tax/discount math, not a client-side engine.
- **Client-side subscription management** — `features/billing/subscription/domain/SubscriptionService.ts` — a mock Stripe-style plan-change/limit-check service. The real `SubscriptionScreen.tsx` correctly defers plan changes to "contact your provider" since there's no real payment gateway wired up (see that screen's comment).
- **Refund UI, Daily Closing / Z-Report, standalone Invoice screen** — removed earlier the same day (not part of this batch, but related): a real backend refund endpoint exists (`POST /orders/{id}/refund`, now `[Authorize(Owner|Manager)]`) but has no UI calling it after this cleanup. A real cash-drawer Z-Report was scoped out because the app doesn't track *payment method* (cash/card/UPI) per order yet — see "Payment method tracking" below.

## Redux slices removed (dead state, nothing ever read them)

All of these were registered in `rootReducer.ts` but no component ever did `useSelector(state => state.X...)` — the real screens all use React Query hooks against the real backend instead. Removed: `brandingSlice`, `menuSlice`, `inventorySlice`, `settingsSlice`, `auditSlice`, `notificationSlice`, `approvalSlice`, `orderSlice`, `taskSlice`, `analyticsSlice`, `crmSlice`, `billingSlice`, `saasSlice`.

Only `authSlice`, `tablesSlice`, and `uiSlice` are real and stayed.

Note: `brandingSlice` had a `hasCompletedOnboarding` field that looked important but was dead — the *real* onboarding-completion flag lives on the backend (`Settings.HasCompletedOnboarding`, via `useSettings()`), not in Redux.

## Orphaned domain entities / duplicate screens

- `features/management/profile/domain/entities/CafeProfile.ts`, `features/management/staff/domain/entities/Staff.ts` — unused type definitions, superseded by the real API response types in `core/api/*Api.ts`.
- `features/menu/recipe/presentation/screens/RecipeBuilderScreen.tsx` — an abandoned early draft (41 lines, hardcoded "Latte Recipe" demo). The real, fully-wired Recipe Builder is `features/menu/presentation/screens/RecipeBuilderScreen.tsx` (the one actually registered in `AppNavigator`).
- `features/management/staff/presentation/screens/StaffListScreen.tsx` — dead duplicate of `TeamOverviewScreen.tsx`, which is the one actually used in `TeamPortalNavigator`.

## Unused shared UI components

- `shared/components/atoms/{Button,Input}.tsx` — custom wrappers around `react-native-paper`'s Button/TextInput. Every real screen uses Paper's components directly instead.
- `shared/components/atoms/SkeletonLoader.tsx` — loading-skeleton placeholder, never used (screens use `ActivityIndicator` instead).
- `shared/components/guards/RequirePlan.tsx` — a plan-gating wrapper component. Not wrapped around any route. Plan gating in the real app happens via `usePlanCategory()`/`hasPlan()` checks inside `MoreScreen.tsx` and backend `[Authorize(Policy = Policies.RequirePlus)]` instead.
- `shared/design/tokens.ts` — a full alternate design-token system (colors/spacing/typography). The app's real, actively-used design system is `shared/design/warmTheme.ts` (53 imports). `tokens.ts` was never wired in at all.

## Real but not-yet-used API hooks (kept — these are NOT dead code, just unused capability)

These hooks are thin wrappers around real, working backend endpoints, exported from otherwise-actively-used files in `core/api/hooks/`. They were **not deleted** — they're cheap to keep and represent real backend capability waiting for a UI entry point:

- `useSubmitApproval` (`useApprovals.ts`)
- `useRedeemPoints`, `useAddPoints`, `useIssueCoupon` (`useCustomers.ts`)
- `useLowStockInventory`, `useDeleteInventoryItem`, `useInventoryItemTransactions` (`useInventory.ts`)
- `useOrder`, `useSetOrderStatus`, `useRefundOrder` (`useOrders.ts`) — `useRefundOrder` specifically: the backend refund endpoint is real and authorized correctly; if refund UI is rebuilt later, wire it to this hook rather than recreating it.
- `useDeleteStaff` (`useStaff.ts`)
- `useChangePlan` (`useSubscription.ts`)
- `useDeleteTable` (`useTables.ts`)

## Known real gap: payment method tracking

Not code that was removed, but worth recording here since it came up while reviewing the Refund/Z-Report screens: the `Order` entity has no `PaymentMethod` field. `POST /orders/{id}/pay` just sets `Paid = true` — it never records whether the customer paid cash, card, or UPI. This means:

- Total revenue, daily/monthly sales, order counts — all real and correct (based on `Total`/`Paid`/`CreatedAt`).
- A cash-vs-card-vs-UPI breakdown is **not possible** with the current schema — this is the reason a real cash-drawer Z-Report feature was scoped out rather than built.
- If payment-method tracking is wanted later: add a `PaymentMethod` enum column to `Order`, capture it as a parameter on the `Pay` endpoint, and only then does a real cash-reconciliation report become buildable.
