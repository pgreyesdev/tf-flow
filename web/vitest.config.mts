import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            // `server-only` falla fuera de un Server Component; en los tests se sustituye por nada.
            "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)),
        },
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./src/test/setup.ts"],
        restoreMocks: true,
        coverage: {
            provider: "v8",
            include: ["src/**/*.{ts,tsx}"],
            exclude: [
                "src/test/**",
                "src/app/**/page.tsx",
                "src/app/**/layout.tsx",
                "src/**/*.d.ts",
            ],
            thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
        },
    },
});
