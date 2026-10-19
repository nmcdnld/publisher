export interface Env {
   OPENROUTER_API_KEY?: string;
   /** OpenRouter slug for structured work and the chat default. */
   DEFAULT_MODEL?: string;
   PUBLISHER_MCP_URL?: string;
}

export interface PackageScope {
   environment: string;
   package: string;
}
