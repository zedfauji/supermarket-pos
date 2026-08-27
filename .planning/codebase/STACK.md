# Technology Stack

**Analysis Date:** 2026-08-10

## Languages

**Primary:**
- TypeScript 5.8.3 - All frontend code, strict mode with `exactOptionalPropertyTypes: true`, no-implicit-any
- JavaScript (ECMAScript modules) - Node.js scripts, development utilities
- Rust (Edition 2021) - Tauri desktop runtime, native platform-specific code

**Secondary:**
- SQL - Database migrations and queries via Supabase
- Deno TypeScript - Supabase Edge Functions (serverless backend)

## Runtime

**Environment:**
- Node.js (modern LTS, no specific version pinned)
- Deno runtime for Edge Functions (Supabase-managed)
- Tauri 2 runtime for desktop app (Windows WebView2, Linux webkit2gtk, macOS WKWebView)

**Package Manager:**
- npm (modern, uses `type: "module"` for ES modules)
- Lockfile: `package-lock.json` present and committed

## Frameworks

**Core:**
- React 19.1.0 - Function components only, hooks-based UI
- Vite 7.0.4 - Build tool and dev server (port 1420 for Tauri dev)
- Tauri 2 - Desktop app runtime (not Electron)
- Feature-Sliced Design (FSD) - Enforced import boundaries via `eslint-plugin-boundaries`

**State Management:**
- Zustand 5.0.12 - Local UI state, offline queue, Realtime subscriptions
- TanStack Query 5.99.0 - Server state, caching, mutations with optimistic updates
- TanStack Table 8.21.3 - Data grid and table components

**UI & Styling:**
- Tailwind CSS 4.3.3 - Utility-first CSS, dark mode default
- shadcn/ui (4.2.0) - Radix-UI component library with CVA variants
- Class Variance Authority 0.7.1 - Component styling via CVA
- Recharts 3.8.1 - Chart library (bars, donuts, line charts for reports)
- Lucide React 1.8.0 - Icon library

**Validation & Serialization:**
- Zod 4.3.6 - Runtime schema validation, single source of truth in `src/shared/lib/domain.ts`
- React PDF 4.5.1 - Receipt/invoice PDF generation
- XLSX 0.18.5 - Excel export for reports (via CSV intermediate)

**Internationalization:**
- i18next 26.3.6 - i18n singleton (no HTTP backend, all catalogs bundled)
- react-i18next 17.0.10 - React integration
- Supported locales: es-MX (default), en-US

**Testing:**
- Vitest 4.1.4 - Unit test runner
- React Testing Library 16.3.2 - Component testing
- @testing-library/react 16.3.2 - DOM and hooks testing
- Playwright 1.59.1 - E2E test framework (61 spec files in `e2e/`)
- @vitest/browser-playwright - Storybook integration testing
- @vitest/coverage-v8 - Coverage reporting
- fast-check 4.6.0 - Property-based testing for billing math
- jsdom 29.0.2 - DOM simulation for unit tests

**Documentation & Component Development:**
- Storybook 10.3.5 - Component documentation and visual testing
- @storybook/addon-vitest - Storybook ↔ Vitest integration
- @storybook/addon-a11y - Accessibility auditing
- remark-gfm 4.0.1 - Markdown parsing for help content

**Build & Development:**
- @vitejs/plugin-react 4.6.0 - React Fast Refresh for HMR
- TypeScript 5.8.3 - Type checking (strict mode)
- ESLint 9.39.4 - Linting with custom rule plugins
- Prettier 3.8.2 - Code formatting
- Husky 9.1.7 - Git hooks (gitignored; not auto-installed from bar-pos/)
- lint-staged 16.4.0 - Pre-commit linting

**Code Quality:**
- eslint-plugin-boundaries 6.0.2 - FSD layer hierarchy enforcement
- eslint-plugin-i18next 6.1.5 - i18n hardcoded-string detection
- eslint-plugin-react 7.37.5, eslint-plugin-react-hooks 7.0.1 - React rules
- eslint-plugin-tailwindcss 4.2.0 - Tailwind class ordering
- eslint-plugin-import, eslint-plugin-jsx-a11y - Import and accessibility rules
- jscpd 5.0.14 - Copy-paste detection
- knip 6.31.0 - Unused file detection
- madge 8.0.0 - Circular dependency detection
- @esbuild/* (platform-specific) - Build bundling

## Key Dependencies

**Critical:**
- @supabase/supabase-js 2.103.0 - Primary backend client (PostgreSQL + Auth + Realtime)
- @tauri-apps/api 2 - Desktop app IPC and platform APIs
- @tauri-apps/cli 2 - Tauri build and dev commands
- date-fns 4.1.0 - Date manipulation and formatting
- libphonenumber-js 1.12.42 - Phone number parsing and formatting (WhatsApp integration)

**Infrastructure:**
- drizzle-orm 0.45.2 - ORM for server-side scripts and Edge Functions
- sonner 2.0.7 - Toast notifications
- react-error-boundary 6.1.1 - Error boundary component
- input-otp 1.2.4 - OTP input fields
- react-markdown 10.1.0 - Markdown rendering for help/receipt notes
- immer 11.1.4 - Immutable state updates
- clsx 2.1.1 - Conditional CSS class names
- cmdk 1.1.1 - Command/search dialog (POS quick nav)
- tailwind-merge 3.5.0 - Tailwind class merging for component variants
- tw-animate-css 1.4.0 - Animation utility classes

**AI/Agent Integration:**
- @anthropic-ai/sdk 0.91.1 - Anthropic Claude API integration
- openai 6.34.0 - OpenAI GPT integration (dev dependency, fallback only)

**Desktop/Runtime:**
- @tauri-apps/plugin-dialog - File dialogs
- @tauri-apps/plugin-fs - File system access
- @tauri-apps/plugin-notification - Native desktop notifications
- @tauri-apps/plugin-opener - URL/file opening
- @tauri-apps/plugin-updater 2.10.1 - App auto-update via GitHub releases
- @tauri-apps/plugin-process - Process management
- @tauri-apps/plugin-shell - Shell command execution
- @tauri-apps/plugin-sql - Local SQLite database access (deprecated for Tauri 2)

**Utilities:**
- react-router-dom 6.28.0 - Client-side routing
- radix-ui 1.4.3 - Unstyled component primitives
- dotenv 16.6.1 - Environment variable loading (dev only)
- tsx 4.21.0 - TypeScript execution for scripts (dev only)
- glob 13.0.6 - File globbing for scripts

## Configuration

**Environment:**
- Variables configured via `.env.local` (not committed)
- Supabase credentials: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (frontend)
- Service role key: `SUPABASE_SERVICE_ROLE_KEY` (backend scripts only, never in renderer)
- Optional: `VITE_RAPPI_WEBHOOK_SECRET`, `WASENDER_API_KEY`, `RESEND_API_KEY`
- Terminal ID: `VITE_TERMINAL_ID` (defaults to 'POS-1')
- App version: `VITE_APP_VERSION` (for logging)

**Build:**
- `vite.config.ts` - Vite configuration with FSD path aliases and Tauri dev settings
- `tsconfig.json` - TypeScript strict mode, path resolution, ES2022 target
- `tauri.conf.json` - Tauri app config (window size 1280×800, updater, bundle settings)
- `playwright.config.ts` - E2E test config (headless Chrome, port 1420, video/trace/screenshot recording)
- `vitest.config.ts` - Unit test config (jsdom environment, global setup, coverage)
- `.eslintrc.js` / `eslint.config.js` - Lint rules with FSD boundaries and no-literal-strings enforcement
- `.prettierrc` - Code formatting (if present; otherwise inline)

## Platform Requirements

**Development:**
- Node.js (modern LTS, any recent version)
- npm (v9+)
- Rust toolchain (via `rustup`) for Tauri
- Native dependencies on Ubuntu: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `libgtk-3-dev` (installed by `scripts/setup-ubuntu.sh`)
- Git with SSH keys (for Tauri release signing)

**Production:**
- Deployment target: Windows (WebView2), macOS (WKWebView), Linux (webkit2gtk)
- Signed releases via GitHub Actions (Windows code signing via Tauri)
- App updates via GitHub Releases + Tauri auto-updater plugin

## Architecture Patterns

**Module System:**
- ES6 modules throughout (`"type": "module"` in package.json)
- Path aliases via TypeScript `compilerOptions.paths` and Vite `resolve.alias`
- FSD layer structure: `app → pages → widgets → features → entities → shared`

**Async/Await:**
- Promises and async/await (no callbacks or callback hells)
- TanStack Query handles server state async orchestration
- Zustand handles local state mutations

---

*Stack analysis: 2026-08-10*
