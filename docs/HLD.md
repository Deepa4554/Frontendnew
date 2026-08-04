# CafePOS Enterprise — High-Level Design (HLD)

## 1. System Overview

CafePOS is a **Multi-Tenant, Offline-First, AI-Powered Cafe SaaS Platform** comparable to Toast POS, Square, and Petpooja. It enables cloud-based POS operations, analytics, team management, subscription billing, and AI-driven insights across multiple branches.

---

## 2. Architecture

### 2.1 Multi-Tenant Isolation Model

Each HTTP request carries:
- **`X-Tenant-ID`** — The business account identifier
- **`X-Branch-ID`** — The specific location context

All database queries include a `WHERE tenant_id = :tenantId AND branch_id = :branchId` clause. The Redux `saasSlice` enforces this on the frontend with the `activeBranchId` context.

---

## 3. Redux State Architecture

```
RootState
├── auth          — JWT, user profile, permissions
├── billing       — Cart, orders, payment state
├── crm           — Customers, loyalty, coupons
├── analytics     — KPIs, chart data, period selection
├── saas          — tenantId, branches, subscription tier, usage
├── branding      — Logo, theme colors, receipt footer
├── audit         — Immutable event log (last 500 entries)
├── notifications — Inbox, unread count, delivery status
├── approvals     — Multi-level approval workflow queue
└── tasks         — Staff task board with priority/status
```

---

## 4. Feature Matrix by Subscription Tier

| Feature | FREE_TRIAL | STARTER | PROFESSIONAL | ENTERPRISE |
|---|---|---|---|---|
| Branches | 1 | 1 | 3 | Unlimited |
| Monthly Orders | 100 | 1,000 | 10,000 | Unlimited |
| Staff Accounts | 2 | 5 | 20 | Unlimited |
| AI Modules | No | No | Yes | Yes |
| Stock Transfers | No | No | Yes | Yes |
| Audit Logs | No | Yes | Yes | Yes |
| Approval Workflows | No | No | Yes | Yes |
| White Label | No | No | No | Yes |

---

## 5. Complete Screen Inventory

### POS & Core Operations
- `POSCheckoutScreen` — Real-time order processing
- `BillingNavigator` → DailyClosingScreen, InvoicesScreen
- `KDSScreen` — Kitchen Display System
- `TableManagementScreen` — Table booking and status

### Menu & Inventory
- `MenuScreen`, `RecipeBuilderScreen`
- `InventoryScreen`

### CRM
- `CustomerProfileScreen`, `OrderHistoryScreen`
- `CouponsScreen`, `GiftCardsScreen`, `FeedbackScreen`, `QRMenuScreen`

### Management & Analytics
- `DashboardScreen` — KPI + Live Charts (BI Dashboard)
- `AIAssistantScreen` — 7-day forecasts, depletion risk (Pro+)
- `AIChatScreen` — Conversational AI operations assistant (NEW)

### Enterprise Workflow (NEW)
- `NotificationCenterScreen` — Inbox, archive, delete, retry failed deliveries
- `ApprovalWorkflowScreen` — Multi-level approve/reject/escalate
- `TaskManagementScreen` — Priority task board with kanban-style cards
- `GlobalSearchScreen` — Universal entity search with saved queries
- `HelpCenterScreen` — Knowledge base and article search

### SaaS & Multi-Branch
- `BranchManagementScreen` — Add branches, switch context, stock transfers
- `SubscriptionScreen` — Plans, coupons, usage limits, billing history
- `IntegrationsHubScreen` — WhatsApp, SMS, Printers, Payment GW

### Super Admin
- `SuperAdminDashboard` — Global MRR, tenant count, subscription distribution
- `TenantManagementScreen` — Suspend/upgrade tenants
- `FeatureFlagsScreen` — Global feature toggles, maintenance mode
- `AuditLogScreen` — Searchable immutable event log with severity filters (NEW)

---

## 6. Key API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/v1/auth/login | Authenticate user, return JWT pair |
| GET | /api/v1/orders | Paginated order history for branch |
| POST | /api/v1/orders | Create order (triggers KDS event) |
| PUT | /api/v1/inventory/transfer | Transfer stock between branches |
| GET | /api/v1/ai/forecast?days=7 | ML sales forecast (Pro+) |
| GET | /api/v1/audit?action&resource&severity | Searchable audit log |
| POST | /api/v1/approvals/:id/approve | Approve a workflow request |
| POST | /api/v1/approvals/:id/reject | Reject a workflow request |
| GET | /api/v1/notifications | Fetch notification inbox |
| POST | /api/v1/subscriptions/change | Upgrade/downgrade plan |

All endpoints require `Authorization: Bearer <JWT>`, `X-Tenant-ID`, and `X-Branch-ID` headers.

---

## 7. Security Architecture

| Layer | Control |
|---|---|
| Transport | HTTPS + SSL Pinning (production) |
| Auth | JWT (15m access) + Refresh Token (30d) |
| Storage | MMKV with encrypted partition for secrets |
| API | X-Tenant-ID enforced at middleware layer |
| Device | Root/Jailbreak detection via SecurityService |
| Rate Limiting | Client-side + Server-side enforcement |
| Audit | Immutable event log for all state changes |
| Input | SecurityService.sanitizeInput() on all user fields |

---

## 8. CI/CD Pipeline (GitHub Actions)

```
Push to main branch
  -> 1. Lint & TypeScript check
  -> 2. Unit tests + coverage
  -> 3. [on pass] Build Android (.aab) -> Play Store
  -> 4. [on pass] Build iOS (.ipa) -> TestFlight
  -> OTA Updates: CodePush for non-native JS bundles
```

---

## 9. Offline Architecture

1. User performs action while offline (Redux updates optimistically).
2. OfflineSyncManager.enqueue() persists task to MMKV with priority.
3. When online: setOnlineStatus(true) triggers flushQueue().
4. Tasks replayed in priority order. Failed tasks retried up to maxRetries.

---

*Document Version: 2.0.0 | Last Updated: June 2026*
