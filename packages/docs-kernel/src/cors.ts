/** Permissive dev CORS for the localhost docs-lab client. */
export const CORS_HEADERS = {
	"access-control-allow-origin": "*",
	"access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS",
	"access-control-allow-headers": "Content-Type",
} as const;
