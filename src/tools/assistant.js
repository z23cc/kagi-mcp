import { formatError, getEnvironmentConfig } from "../utils/formatting.js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

// Thread ID storage for session management
let threadId = null;

/**
 * Get default model from environment or use first model in list
 */
function getDefaultModel() {
  const defaultModel = process.env.KAGI_DEFAULT_MODEL;
  if (defaultModel) {
    return defaultModel;
  }
  // Use first model from the available models list
  const availableModels = getAvailableModels();
  return availableModels[0];
}

/**
 * Get available models from environment variable
 */
function getAvailableModels() {
  const modelList = process.env.KAGI_MODEL_LIST;
  if (!modelList) {
    throw new Error(
      "KAGI_MODEL_LIST environment variable not set. Please provide a comma-separated list of available models (e.g., 'o3-pro,claude-4-sonnet,gemini-2-5-pro')"
    );
  }
  return modelList.split(",").map(m => m.trim()).filter(m => m.length > 0);
}

/**
 * Schema for assistant tool input validation
 */
export const assistantInputSchema = {
  prompt: z.string().describe("The message to send to the Kagi AI assistant."),
  new_conversation: z.boolean().default(true).describe(
    "Whether to start a new conversation. If false, continues the existing conversation thread.",
  ),
  model: z.string().default(getDefaultModel()).describe(
    `AI model to use for the conversation. Available models: ${getAvailableModels().join(", ")}`,
  ),
  internet_access: z.boolean().default(true).describe(
    "Whether to allow the AI assistant to access the internet for current information.",
  ),
  format: z.enum(["html", "markdown", "plain"]).default("markdown").describe(
    "Output format: 'html' preserves original formatting, 'markdown' converts to Markdown, 'plain' strips all formatting.",
  ),
};

/**
 * Convert HTML to Markdown format
 */
function htmlToMarkdown(html) {
  return html
    // Headers
    .replace(/<h([1-6])>(.*?)<\/h[1-6]>/g, (_, level, text) => '#'.repeat(parseInt(level)) + ' ' + text + '\n\n')
    // Bold and italic
    .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
    .replace(/<em>(.*?)<\/em>/g, '*$1*')
    // Code blocks
    .replace(/<div class="codehilite">.*?<pre><span><\/span><code>(.*?)<\/code><\/pre><\/div>/gs, '```\n$1\n```\n')
    // Inline code
    .replace(/<code>(.*?)<\/code>/g, '`$1`')
    // Lists
    .replace(/<ol>/g, '').replace(/<\/ol>/g, '\n')
    .replace(/<ul>/g, '').replace(/<\/ul>/g, '\n')
    .replace(/<li>(.*?)<\/li>/g, '- $1\n')
    // Paragraphs
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(.*?)<\/p>/g, '$1\n\n')
    // Line breaks
    .replace(/<br\s*\/?>/g, '\n')
    // Remove all remaining HTML tags and spans
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    // Clean up excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Strip all HTML tags to plain text
 */
function htmlToPlain(html) {
  return html
    // Replace paragraphs and headers with line breaks
    .replace(/<\/?(p|h[1-6]|div)>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    // Replace list items with dashes
    .replace(/<li>(.*?)<\/li>/g, '- $1\n')
    // Remove all HTML tags
    .replace(/<[^>]+>/g, '')
    // Clean up excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Format assistant response based on requested format
 */
function formatResponse(html, format) {
  switch (format) {
    case 'html':
      return html;
    case 'markdown':
      return htmlToMarkdown(html);
    case 'plain':
      return htmlToPlain(html);
    default:
      return htmlToMarkdown(html); // Default to markdown
  }
}

/**
 * Extract JSON content from streaming response text
 * Based on Python implementation from kagi-cookie-mcp
 *
 * @param {string} text - Source text containing streaming response
 * @param {string} marker - JSON marker to look for (e.g., 'thread.json:', 'new_message.json:')
 * @returns {string|null} Extracted JSON string, or null if not found
 */
function extractJson(text, marker) {
  const markerPos = text.lastIndexOf(marker);
  if (markerPos === -1) {
    return null;
  }

  // Only process text after the marker
  const lastPart = text.substring(markerPos + marker.length).trim();
  const start = lastPart.indexOf("{");
  if (start === -1) {
    return null;
  }

  // Use bracket matching algorithm to extract complete JSON
  let count = 0;
  let inString = false;
  let escape = false;
  const jsonChars = [];

  for (let i = start; i < lastPart.length; i++) {
    const char = lastPart[i];
    jsonChars.push(char);

    if (!inString) {
      if (char === "{") {
        count += 1;
      } else if (char === "}") {
        count -= 1;
        if (count === 0) {
          return jsonChars.join("");
        }
      }
    } else if (char === "\\" && !escape) {
      escape = true;
      continue;
    } else if (char === '"' && !escape) {
      inString = !inString;
    }
    escape = false;
  }

  return null;
}

/**
 * Build request data for Kagi Assistant API
 *
 * @param {string} prompt - User message
 * @param {string} model - AI model to use
 * @param {boolean} internetAccess - Whether to enable internet access
 * @returns {Object} Request data object
 */
function buildRequestData(prompt, model, internetAccess) {
  const focus = {
    thread_id: threadId,
    branch_id: "00000000-0000-4000-0000-000000000000",
    prompt: prompt,
  };

  // If continuing a conversation, generate a message_id
  if (threadId) {
    focus.message_id = uuidv4();
  }

  return {
    focus: focus,
    profile: {
      id: null,
      personalizations: true,
      internet_access: internetAccess,
      model: model,
      lens_id: null,
    },
    threads: [{ tag_ids: [], saved: false, shared: false }],
  };
}

/**
 * Kagi Assistant tool implementation
 * Provides AI conversation capabilities using Kagi's assistant API
 *
 * @param {Object} args - Tool arguments
 * @param {string} args.prompt - User message
 * @param {boolean} args.new_conversation - Whether to start new conversation
 * @param {string} args.model - AI model to use
 * @param {boolean} args.internet_access - Whether to enable internet access
 * @returns {Promise<Object>} MCP tool response
 */
export async function kagiAssistant({
  prompt,
  new_conversation = true,
  model = getDefaultModel(),
  internet_access = true,
  format = "markdown",
}) {
  try {
    if (!prompt) {
      throw new Error("Assistant called with no prompt.");
    }

    const { token } = getEnvironmentConfig();
    const kagiSearchCookie = process.env.KAGI_SEARCH_COOKIE;
    const availableModels = getAvailableModels();

    if (!token) {
      throw new Error(
        "KAGI_SESSION_TOKEN environment variable not set. Please set it before running.",
      );
    }

    if (!kagiSearchCookie) {
      throw new Error(
        "KAGI_SEARCH_COOKIE environment variable not set. Please set it to your _kagi_search_ cookie value.",
      );
    }

    // Validate model
    if (!availableModels.includes(model)) {
      throw new Error(
        `Invalid model "${model}". Available models: ${availableModels.join(", ")}`,
      );
    }

    // Reset thread_id if starting new conversation
    if (new_conversation) {
      threadId = null;
    }

    // Build request data
    const requestData = buildRequestData(prompt, model, internet_access);

    // Build headers (based on your original curl request)
    const headers = {
      "accept": "application/vnd.kagi.stream",
      "accept-language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
      "content-type": "application/json",
      "origin": "https://kagi.com",
      "priority": "u=1, i",
      "referer": "https://kagi.com/assistant",
      "rtt": "300",
      "sec-ch-ua": "\"Chromium\";v=\"140\", \"Not=A?Brand\";v=\"24\", \"Google Chrome\";v=\"140\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      "cookie": `kagi_session=${token}; _kagi_search_=${kagiSearchCookie}`,
    };

    // Debug: Uncomment to see request details
    // console.log("Request Data:", JSON.stringify(requestData, null, 2));

    // Make request to Kagi Assistant API
    const response = await fetch("https://kagi.com/assistant/prompt", {
      method: "POST",
      headers: headers,
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Invalid or expired session token");
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Parse streaming response
    const responseText = await response.text();

    // Extract thread_id for subsequent requests
    const threadJson = extractJson(responseText, "thread.json:");
    if (threadJson) {
      try {
        const threadData = JSON.parse(threadJson);
        if (threadData.id) {
          threadId = threadData.id;
        }
      } catch (error) {
        console.warn("Failed to parse thread JSON:", error);
      }
    }

    // Extract assistant reply
    const messageJson = extractJson(responseText, "new_message.json:");
    if (!messageJson) {
      throw new Error("Failed to parse assistant response");
    }

    let messageData;
    try {
      messageData = JSON.parse(messageJson);
    } catch (error) {
      throw new Error("Failed to parse message JSON response");
    }

    if (messageData.state === "done" && messageData.reply) {
      const formattedReply = formatResponse(messageData.reply, format);
      return {
        content: [
          {
            type: "text",
            text: formattedReply,
          },
        ],
      };
    }

    throw new Error("Assistant response not in expected format");
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: formatError(error),
        },
      ],
    };
  }
}

/**
 * Tool registration configuration for MCP server
 */
export const assistantToolConfig = {
  name: "kagi_assistant",
  description: `
    Interact with Kagi AI Assistant for conversations and questions. Supports multiple AI models
    and can maintain conversation context across multiple exchanges.
    Provides access to current information through internet connectivity.

    Required environment variables:
    - KAGI_SESSION_TOKEN: Your Kagi session token
    - KAGI_SEARCH_COOKIE: Your _kagi_search_ cookie value
    - KAGI_MODEL_LIST: Comma-separated list of available models (e.g., "o3-pro,claude-4-sonnet,gemini-2-5-pro")

    Optional environment variables:
    - KAGI_DEFAULT_MODEL: Default model to use (default: first model in KAGI_MODEL_LIST)
    `.replace(/\s+/gs, " ").trim(),
  inputSchema: assistantInputSchema,
};