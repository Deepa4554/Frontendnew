# CafePOS Coding Standards

## 1. Clean Architecture Strictness
- **Presentation**: UI Components and Redux Slices. NO direct API calls.
- **Domain**: Interfaces, Entities, and pure functions/use cases. NO UI code (no React Native imports).
- **Data**: Repositories, API configurations, and local DB handling.

## 2. Naming Conventions
- React Components: `PascalCase.tsx`
- Redux Slices: `camelCaseSlice.ts`
- Interfaces/Types: `PascalCase.ts` (Do NOT prefix with `I`, e.g., use `User` not `IUser`).

## 3. Theming & Hardcoded Values
- NEVER hardcode hex colors or spacing values. Always use the React Native Paper `useTheme()` hook.
- Use `theme.colors.primary`, `theme.colors.surface`, etc.

## 4. Error Handling
- Use the `CrashReporter.logError(e, context)` utility instead of bare `console.error`.
- Wrap risky operations in `try/catch` and provide meaningful fallback UIs.
