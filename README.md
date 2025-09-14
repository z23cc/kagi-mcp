# kagi-ken-mcp

Node.js MCP server providing Kagi search, summarization and AI assistant tools using your existing Kagi session token.


## Features

- **Search**: Kagi web search with multiple query support
- **Summarizer**: URL/content summarization with customizable formats
- **Assistant**: AI-powered conversations using Kagi's AI models

## Environment Variables

The server requires different environment variables depending on which features you want to use:

### For Search and Summarization only:
- `KAGI_SESSION_TOKEN`: Your Kagi session token
- `KAGI_SUMMARIZER_ENGINE`: Summarizer engine to use (optional, default: "default")

### For Assistant feature (in addition to the above):
- `KAGI_SEARCH_COOKIE`: Your `_kagi_search_` cookie value
- `KAGI_MODEL_LIST`: Comma-separated list of available AI models (required for assistant)
- `KAGI_DEFAULT_MODEL`: Default model to use (optional, uses first from list if not specified)

## Setup

### Get Required Tokens

#### Session Token
1. Visit [Kagi Settings](https://kagi.com/settings/user_details)
2. Copy the **Session Link**
3. Extract the `token` value
4. Set `KAGI_SESSION_TOKEN` env variable

#### Search Cookie (for Assistant feature)
1. Open browser developer tools (F12)
2. Go to Kagi.com and login
3. In Application/Storage tab, find Cookies for kagi.com
4. Copy the value of `_kagi_search_` cookie
5. Set `KAGI_SEARCH_COOKIE` env variable

#### Model Configuration (for Assistant feature)
- Set `KAGI_MODEL_LIST` with comma-separated available models (e.g., "o3-pro,claude-4-sonnet,gemini-2-5-pro")
- Optionally set `KAGI_DEFAULT_MODEL` to specify default model

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kagi-mcp": {
      "command": "npx",
      "args": ["-y", "@duange/kagi-mcp"],
      "env": {
        "KAGI_SESSION_TOKEN": "YOUR_SESSION_TOKEN_HERE",
        "KAGI_SEARCH_COOKIE": "YOUR_KAGI_SEARCH_COOKIE_HERE",
        "KAGI_MODEL_LIST": "o3-pro,claude-4-sonnet,gemini-2-5-pro",
        "KAGI_DEFAULT_MODEL": "claude-4-sonnet",
        "KAGI_SUMMARIZER_ENGINE": "default"
      }
    }
  }
}
```

#### Post-install

[Disable Claude Desktop's built-in websearch](assets/claude-desktop-disable-websearch.png) so it'll use this here MCP server. And maybe add this to your "Personal preferences" (i.e., system prompt) in Settings:

```
For web searches, use kagi-ken-mcp MCP server's `kagi_search_fetch` tool.
For summarizing a URL, use the kagi-ken-mcp MCP server's `kagi_summarizer` tool.
For AI conversations, use the kagi-ken-mcp MCP server's `kagi_assistant` tool.
```

### Claude Code

Add MCP server to Claude Code:

```bash
claude mcp add kagi-mcp \
  --scope user \
  --env KAGI_SESSION_TOKEN="YOUR_SESSION_TOKEN_HERE" \
  --env KAGI_SEARCH_COOKIE="YOUR_KAGI_SEARCH_COOKIE_HERE" \
  --env KAGI_MODEL_LIST="o3-pro,claude-4-sonnet,gemini-2-5-pro" \
  --env KAGI_DEFAULT_MODEL="claude-4-sonnet" \
  npx -y @duange/kagi-mcp
```

#### Post-install

Disable Claude Code's built-in web search (optional) by setting the permission in the relevant `.claude/settings*.json` file:

```json
{
  "permissions": {
    "deny": [
      "WebSearch"
    ],
    "allow": [
      "mcp__kagi-mcp__kagi_search_fetch",
      "mcp__kagi-mcp__kagi_summarizer",
      "mcp__kagi-mcp__kagi_assistant"
    ]
  }
}
```


## Usage: Pose query that requires use of a tool

e.g. _"Who was time's 2024 person of the year?"_ for search, or "summarize this video: https://www.youtube.com/watch?v=sczwaYyaevY" for summarizer.


## Tools

### `kagi_search_fetch`
Fetch web results based on one or more queries using the Kagi Search API. Results are numbered continuously for easy reference.

**Parameters:**
- `queries` (array of strings): One or more search queries

### `kagi_summarizer`
Summarize content from URLs using the Kagi Summarizer API. Supports various document types including webpages, videos, and audio.

**Parameters:**
- `url` (string): URL to summarize
- `summary_type` (enum): `"summary"` for paragraph prose or `"takeaway"` for bullet points (default: `"summary"`)
- `target_language` (string, optional): Language code (e.g., `"EN"` for English, default: `"EN"`)

### `kagi_assistant`
Interact with Kagi's AI assistant models for conversations and queries.

**Parameters:**
- `message` (string): The message or question to send to the assistant
- `model` (string, optional): AI model to use (default: uses configured default model)
- `web_search` (boolean, optional): Enable web search integration (default: true)
- `image` (string, optional): Base64 encoded image for vision models


## Development

### Project Structure
```
kagi-ken-mcp/
├── src/
│   ├── index.js              # Main server entry point
│   ├── tools/
│   │   ├── search.js         # Search tool implementation
│   │   ├── summarizer.js     # Summarizer tool implementation
│   │   └── assistant.js      # Assistant tool implementation
│   └── utils/
│       └── formatting.js     # Utility functions
├── package.json
└── README.md
```

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/z23cc/kagi-mcp.git
   cd kagi-mcp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

### Running in Development Mode
```bash
npm run dev
```

### Debugging

Use the MCP Inspector to debug:
```bash
npx @modelcontextprotocol/inspector node ./src/index.js
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with the MCP Inspector
5. Submit a pull request


## Related Projects

- [czottmann/kagi-ken](https://github.com/czottmann/kagi-ken) - Unofficial session token-based Kagi client, Node
- [czottmann/kagi-ken-cli](https://github.com/czottmann/kagi-ken-cli) - Unofficial Node session token-based CLI tool, Node
- [Official Kagi MCP Server](https://github.com/kagisearch/kagimcp) - Python
- [Model Context Protocol](https://modelcontextprotocol.io/)
