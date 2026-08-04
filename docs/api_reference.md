# CafePOS API Reference (v1)

All requests must include the `X-Tenant-ID` header.

## Authentication
`POST /api/v1/auth/login`
Authenticates a user and returns a JWT.

## Orders (POS)
`POST /api/v1/orders`
Creates a new order. Triggers a Kitchen Display System (KDS) socket event.

`GET /api/v1/orders/history`
Returns paginated order history for the active branch.

## Inventory
`PUT /api/v1/inventory/transfer`
Moves stock between two valid `branch_id`s within the same Tenant.

## AI Engine
`GET /api/v1/ai/forecast/sales?days=7`
Returns a machine-learning powered sales prediction array.
*Requires Pro or Enterprise Tier.*
