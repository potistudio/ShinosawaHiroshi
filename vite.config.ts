import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [svelte()],
	clearScreen: false,
	// Vue build flags required internally by Crepe.
	define: {
		__VUE_OPTIONS_API__: true,
		__VUE_PROD_DEVTOOLS__: false,
		__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
	},
	server: { port: 5173, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
	build: { target: "chrome110", chunkSizeWarningLimit: 4000 },
});
