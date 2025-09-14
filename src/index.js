#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Import tools
import { kagiSearchFetch, searchToolConfig } from "./tools/search.js";
import { kagiSummarizer, summarizerToolConfig } from "./tools/summarizer.js";
import { kagiAssistant, assistantToolConfig } from "./tools/assistant.js";

/**
 * Kagi MCP Server using kagi-ken package
 * Provides search, summarization, and AI assistant capabilities compatible with official Kagi MCP
 */
class KagiKenMcpServer {
  constructor() {
    this.server = new McpServer({
      name: "kagi-ken-mcp",
      version: "1.0.0",
    });
    this.setupTools();
  }

  /**
   * Register tools with the MCP server
   */
  setupTools() {
    // Register search tool
    this.server.registerTool(
      searchToolConfig.name,
      {
        title: "Kagi Search",
        description: searchToolConfig.description,
        inputSchema: searchToolConfig.inputSchema,
      },
      async (args) => await kagiSearchFetch(args),
    );

    // Register summarizer tool
    this.server.registerTool(
      summarizerToolConfig.name,
      {
        title: "Kagi Summarizer",
        description: summarizerToolConfig.description,
        inputSchema: summarizerToolConfig.inputSchema,
      },
      async (args) => await kagiSummarizer(args),
    );

    // Register assistant tool
    this.server.registerTool(
      assistantToolConfig.name,
      {
        title: "Kagi Assistant",
        description: assistantToolConfig.description,
        inputSchema: assistantToolConfig.inputSchema,
      },
      async (args) => await kagiAssistant(args),
    );
  }

  /**
   * Start the MCP server
   */
  async start() {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("Kagi Ken MCP Server started successfully");
    } catch (error) {
      console.error("Failed to start Kagi Ken MCP Server:", error);
      process.exit(1);
    }
  }
}

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start the server
const server = new KagiKenMcpServer();
await server.start();
