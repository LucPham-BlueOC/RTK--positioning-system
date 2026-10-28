# Phần 1: Khung monorepo, lint, CI

Trạng thái: **xong**

## Kết quả

- pnpm workspaces: `apps/web`, `apps/server`, `packages/shared` (`pnpm-workspace.yaml`).
- TypeScript strict dùng chung (`tsconfig.base.json`), mỗi gói có `typecheck`.
- ESLint (typescript-eslint, react-hooks) ở `eslint.config.js`; Prettier ở `.prettierrc.json`.
- Script gốc: `dev`, `build`, `start`, `tunnel`, `tunnel:dev`, `lint`, `typecheck`, `test`, `test:e2e`.
- CI: `.github/workflows/ci.yml` chạy lint, typecheck, test, e2e trên Node 24.
- `.gitignore` loại `node_modules`, `dist`, file SQLite trong `data/`, `.env`.

## Kiểm chứng

`pnpm lint` và `pnpm typecheck` sạch.
