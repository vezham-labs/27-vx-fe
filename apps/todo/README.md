# Todo PWA

Run the Go API from the backend repo, then run `pnpm vx`, `pnpm nx run todo:build`, and `pnpm nx run todo:serve` from this workspace. Open http://127.0.0.1:4173. The production preview installs the offline shell. The dev target provides live editing. Preview proxies /api to the loopback API on 47831.

This sample uses one local test workspace. For the Chromium acceptance test, use a fresh backend database, start the production preview, and run the following from this repository.

```sh
pnpm exec playwright install chromium --only-shell
pnpm nx run todo-e2e:e2e
```
