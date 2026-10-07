# Legacy source

`WindowsRepairToolPro.bat` is the original menu-driven repair utility that REcleaner was built from.

REcleaner does not launch this script. Each operation was extracted into a defined action in `src/lib/recleaner/plans.ts` and runs through the execution layer in `src/lib/recleaner/runner.server.ts` (and the desktop process in `desktop/main.cjs`).

Keep the batch file here as the functional reference. It is not the product.
