import axios from 'axios';
import { API_CONFIG } from '../config/api';

const DEFAULT_PROMPT_INTRO = `
You are a font expert and graphic design expert analyzing board game spines. You are looking at the sides of board game boxes that are usually stacked vertically on a shelf.

CRITICAL REQUIREMENTS:
- Identify games where the title is CLEARLY READABLE, even if the entire box side isn't fully visible. Focus on whether you can confidently read and identify the game title, not whether the box is perfectly framed.
- If a title is partially cut off, make an EDUCATED GUESS about the full title based on visible letters, context, and common game title patterns. For example:
  * "ONCEPT" is likely "CONCEPT"
  * "OMINION" is likely "DOMINION"
  * "ICKET" is likely "TICKET TO RIDE" (if you can see enough context)
  * Use visible letters, font style, colors, and your knowledge of board game titles to infer the complete name
- Only skip titles that are too obscured or unclear to make a reasonable inference (e.g., only 1-2 letters visible, completely unreadable).
- If the photo has excessive glare, reflections, or insufficient lighting that prevents clear identification, return an empty games array and include a message in the comments field asking the user to improve lighting and reduce glare.
- If you detect text in a foreign language, translate it to English and use the translated title. Note the original language in the notes field if relevant.

Your task is to:
1. Identify each visible game title where the title text is clearly readable and identifiable
2. Identify any additional text on the spine that is NOT part of the actual game title (e.g., subtitles, taglines, publisher names, edition info, designer names, etc.)
3. Analyze the typography and visual styling of each title
4. Match each title to the most appropriate font from the available font list
5. Extract color and styling information
6. Assess your confidence level for each identification

For each game you identify, return a JSON object with this structure:

{
  "title": "FULL INFERRED GAME TITLE - If the title is partially cut off, infer the complete title based on visible letters and context (e.g., if you see 'ONCEPT', return 'CONCEPT'). If translated from foreign language, use English title.",
  "additionalText": "string or null - any text on the spine that is NOT part of the actual game title (subtitles, taglines, publisher names, edition info, designer names, etc.). Set to null if no additional text is present.",
  "confidence": "high|medium|low",
  "boxDescription": "string or null - REQUIRED when confidence is 'low'. Briefly describe the game box in terms of pictures, patterns, colors, and size (e.g., 'small red box with a dragon on it', 'large blue box with geometric patterns'). Set to null for high/medium confidence.",
  "notes": "optional string - edition notes, original language if translated, font size variations observed within the title, or note if title was inferred from partial text (e.g., 'Title inferred from partially visible text: ONCEPT')",
  "styling": {
    "backgroundColor": "hex color code (e.g., #D97D3A) - primary/dominant background color of the spine",
    "backgroundColorSecondary": "hex color code or null - secondary color if a gradient is clearly visible, otherwise null",
    "fontFamily": "FONT_NAME (choose from available fonts list below - match custom fonts to closest available font based on characteristics)",
    "fontWeight": "100-900 (font weight)",
    "fontSize": "16px (standardize to normal readable size for mobile screens - note any size variations within the title in the notes field)",
    "textTransform": "uppercase | lowercase | capitalize | none",
    "color": "hex color code (e.g., #FFFFFF) - color of the title text",
    "textShadow": "CSS text-shadow value if shadow is present, or 'none'",
    "letterSpacing": "CSS letter-spacing value (e.g., '0.05em', 'normal', '-0.02em')",
    "textAlign": "left | center | right",
    "fontStretch": "condensed | semi-condensed | normal | semi-expanded | expanded",
    "WebkitTextStroke": "stroke width and color if text has outline (e.g., '1px #000000'), or 'none'",
    "rotation": "0deg for horizontal text, 90deg for vertical top-to-bottom, -90deg for vertical bottom-to-top",
    "writingMode": "horizontal-tb | vertical-rl | vertical-lr",
    "fontStyle": "normal | italic | oblique"
  },
  "fontReasoning": "Brief explanation of why you chose this font, including how you matched custom fonts to available fonts based on characteristics (weight, width, style, mood)"
}

AVAILABLE FONTS (choose ONLY from this list - match custom fonts to the closest one based on characteristics):

Heavy/Bold Sans-Serif:
- Bangers - Extreme weight contrast, angled terminals, condensed.
- Titan One - Ultra-bold, low contrast, rounded corners.
- Bungee - Inline (internal line detail), monoline, geometric.
- Black Ops One - Extremely heavy weight, high x-height, condensed.
- Righteous - Bold weight, angled stress, geometric construction.

Condensed/Narrow:
- Bebas Neue - Tall x-height, ultra-condensed, no serifs, geometric.
- Oswald - Condensed, vertical stress, small apertures.
- Fjalla One - Condensed, medium contrast, slightly rounded terminals.
- Antonio - Condensed, geometric, minimal contrast.
- Pathway Gothic One - Narrow, uniform stroke width, tall ascenders.

Rounded/Circular:
- Fredoka - Low contrast, circular forms, open apertures, large x-height.
- Bubblegum Sans - Monoweight, circular letterforms, closed counters.
- Signika - Rounded terminals, open apertures, humanist proportions.
- Varela Round - Uniform rounded terminals, geometric, low contrast.
- Comfortaa - Circular forms, geometric, low contrast, large apertures.

Script/Cursive (Connected Strokes):
- Kalam - Handwritten, irregular baseline, variable stroke width.
- Satisfy - Connected letterforms, high slant angle, thick-thin contrast.
- Caveat - Handwritten, irregular spacing, variable stroke weight.
- Shadows Into Light - Handwritten, upright posture, casual baseline variation.

Display Serif (High Contrast):
- Cinzel - High contrast, bracketed serifs, classical proportions, vertical stress.
- Playfair Display - High contrast serifs, large x-height, transitional style.
- Abril Fatface - Extreme contrast, heavy weight, thin serifs, condensed.
- Bodoni Moda - Extreme thick-thin contrast, hairline serifs, geometric.
- Yeseva One - High contrast, decorative serifs, compressed letterforms.

Old Style/Medieval Serif:
- MedievalSharp - Blackletter/Gothic, angular, ornamental, heavy vertical strokes.
- IM Fell DW Pica - Old style serifs, diagonal stress, moderate contrast.
- Crimson Text - Old style, angled stress, bracketed serifs.

Slab Serif (Blocky):
- Crete Round - Rounded slab serifs, low contrast, large x-height.
- Zilla Slab - Modern slab, slightly condensed, medium weight.
- Bree Serif - Rounded slab terminals, friendly curves, condensed.

Decorative/Ornamental:
- Creepster - Dripping terminals, irregular baseline, horror-style distortion.
- Eater - Eroded/distressed edges, irregular outlines, heavy weight.
- Rye - Inline detail, Western style, decorative serifs, ornamental.
- Press Start 2P - Pixel/bitmap, monospace, 8x8 grid construction.
- Bungee Shade - 3D shadow effect, inline detail, geometric.

Stencil (Disconnected Strokes):
- Sarpanch - Stencil gaps, heavy weight, devanagari-influenced.
- Saira Stencil One - Uniform stencil breaks, geometric, condensed.
- Wallpoet - Stencil gaps, geometric, monoline.

Expanded/Wide:
- Concert One - Wide letterforms, rounded, low contrast.
- Arvo - Slab serif, geometric, wide proportions.
- Changa One - Extended width, heavy weight, rounded.

Handwritten/Marker:
- Permanent Marker - Thick strokes, irregular edges, marker texture.
- Indie Flower - Light weight, handwritten, irregular baseline.
- Patrick Hand - Natural handwriting, consistent weight, casual.

Monospace:
- Courier Prime - Fixed width, typewriter style, serifs.
- Space Mono - Fixed width, geometric, retro-futuristic.

IMPORTANT GUIDELINES:

- Process all game titles where the title is clearly readable and identifiable, even if the box side is partially visible. Make educated guesses for partially cut-off titles using visible letters, context, and common game title patterns. Only skip titles that are too obscured or unclear to make a reasonable inference (e.g., less than 3-4 letters visible, completely unreadable).
- Choose the font that BEST MATCHES the visual characteristics you observe, even if it's a custom font. Analyze the custom font's characteristics (weight, width, style, mood) and match it to the closest available font.
- For backgroundColor, identify the primary/dominant color of that game's spine.
- For backgroundColorSecondary, include a secondary color ONLY if a gradient is clearly visible and the secondary color is obvious. Otherwise, set to null.
- For text color, identify the color of the title text itself.
- Be precise with hex codes for colors.
- If text has an outline/stroke, capture it in WebkitTextStroke.
- Pay attention to whether text is ALL CAPS, Title Case, or lowercase.
- Note the orientation - many board game spines have vertical text.
- Standardize fontSize to "16px" (normal readable size for mobile). If you observe size variations within a single title, note this in the notes field.
- Use "high" confidence when you're certain of the title and it's clearly readable (either fully visible or confidently inferred from partial text).
- Use "medium" confidence when you're fairly sure but there's some ambiguity (e.g., partial visibility where you made an educated guess, similar-looking titles, or when inferring from cut-off text).
- Use "low" confidence when the title is partially visible or unclear but you can still make a reasonable guess about what it might be. Always include a boxDescription when using low confidence.
- IMPORTANT: When confidence is "low", you MUST provide a "boxDescription" field describing the box in terms of pictures, patterns, colors, and size (e.g., "small red box with a dragon on it", "large blue box with geometric patterns"). This helps the user identify which box to type the title for.
- If you see multiple copies or editions, list them separately and note the edition in the "notes" field.
- Look for additional text on the spine that is NOT part of the game title (subtitles, taglines, publisher names, edition info, designer names, etc.). Include this in the "additionalText" field. Only include text that is clearly visible and separate from the main title.
- If lighting is poor, glare is excessive, or visibility is compromised, return an empty games array and include guidance in comments.
- If no clearly readable game titles are visible, return an empty games array.

Return your response as valid JSON in this exact format:
{
  "games": [
    { game object 1 },
    { game object 2 },
    ...
  ],
  "comments": "optional string - general observations, lighting issues, or guidance for the user"
}

Return ONLY valid JSON, no additional commentary, no Markdown formatting.
`.trim();

const buildPrompt = ({ narrationText, rejectedTitles }) => {
  let prompt = DEFAULT_PROMPT_INTRO;

  if (narrationText?.trim()) {
    prompt += `\n\nUser narration (contextual hints): ${narrationText.trim()}`;
  }

  if (Array.isArray(rejectedTitles) && rejectedTitles.length > 0) {
    const rejectedList = rejectedTitles.map((title) => `"${title}"`).join(', ');
    prompt += `\n\nThese titles have been confirmed NOT present in the photo: ${rejectedList}. Do not return them again unless they are clearly visible, and if they reappear explain why.`;
  }

  prompt += `\n\nReturn JSON only—no Markdown, no prose.`;
  return prompt;
};

const extractTextFromClaudeResponse = (contentBlocks = []) => {
  const textBlock = contentBlocks.find((block) => block.type === 'text');
  return textBlock?.text ?? '';
};

const parseClaudeJson = (text) => {
  if (!text) {
    throw new Error('Claude response was empty. Please try again.');
  }

  // Log the raw response for debugging
  if (__DEV__) {
    console.log('[Claude API] Raw response text (first 1000 chars):', text.substring(0, 1000));
    console.log('[Claude API] Raw response text length:', text.length);
  }

  // Try to extract JSON from markdown code blocks if present
  let cleanedText = text.trim();
  
  // Remove markdown code block markers if present
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  
  // Try to find JSON object in the text if it's wrapped in other text
  const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleanedText = jsonMatch[0];
  }

  // Remove control characters (U+0000 thru U+001F) that can cause JSON parse errors
  // BUT preserve newlines (\n = 0x0A) and carriage returns (\r = 0x0D) as they're needed for JSON structure
  cleanedText = cleanedText.replace(/[\x00-\x09\x0B-\x1F]/g, '');

  // Try to fix incomplete JSON strings (common when response is truncated)
  // Look for incomplete strings at the end (missing closing quote)
  const fixIncompleteString = (jsonStr) => {
    // Check if there's an incomplete string (pattern: ,"text without closing quote)
    // This can appear anywhere, not just at the end, if the response was truncated
    const incompleteMatch = jsonStr.match(/,\s*"([^"]*?)(?:\s*\]|\s*$)/);
    if (incompleteMatch) {
      // Find the position where the incomplete string starts (the comma before it)
      const incompleteStart = incompleteMatch.index;
      const beforeIncomplete = jsonStr.substring(0, incompleteStart);
      
      // Find the last complete entry before the incomplete one
      // Look for the last occurrence of "text", pattern (with comma)
      // We need to search backwards from the incomplete start
      let lastCompleteIndex = -1;
      
      // Try to find entries with commas: "text",
      // Search for all matches and get the last one before incompleteStart
      const allCompleteMatches = [];
      const regex = /"([^"]+)",/g;
      let match;
      while ((match = regex.exec(beforeIncomplete)) !== null) {
        allCompleteMatches.push({
          index: match.index,
          endIndex: match.index + match[0].length
        });
      }
      
      if (allCompleteMatches.length > 0) {
        // Use the last complete entry with comma
        const lastComplete = allCompleteMatches[allCompleteMatches.length - 1];
        lastCompleteIndex = lastComplete.endIndex;
      } else {
        // Try to find entry without comma: "text" (might be last item)
        const withoutCommaMatch = beforeIncomplete.match(/"([^"]+)"\s*$/);
        if (withoutCommaMatch) {
          lastCompleteIndex = withoutCommaMatch.index + withoutCommaMatch[0].length;
        } else {
          // Find last comma and use everything before it
          const lastComma = beforeIncomplete.lastIndexOf(',');
          if (lastComma > 0) {
            lastCompleteIndex = lastComma;
          }
        }
      }
      
      if (lastCompleteIndex > 0) {
        let fixed = jsonStr.substring(0, lastCompleteIndex).trim();
        // Remove trailing comma if present (shouldn't be, but just in case)
        fixed = fixed.replace(/,\s*$/, '');
        // Close the array and object properly
        return fixed + '\n  ]\n}';
      }
    }
    
    // Also check if JSON ends with incomplete string (no closing quote)
    if (jsonStr.match(/"[^"]*$/)) {
      // Find the last complete entry
      const allMatches = [];
      const regex = /"([^"]+)",/g;
      let match;
      while ((match = regex.exec(jsonStr)) !== null) {
        allMatches.push({
          index: match.index,
          endIndex: match.index + match[0].length
        });
      }
      
      if (allMatches.length > 0) {
        const lastMatch = allMatches[allMatches.length - 1];
        let fixed = jsonStr.substring(0, lastMatch.endIndex).trim();
        return fixed + '\n  ]\n}';
      }
    }
    
    return jsonStr;
  };

  try {
    return JSON.parse(cleanedText);
  } catch (error) {
    // Try to fix incomplete JSON
    console.warn('[Claude API] Initial JSON parse failed, attempting to fix incomplete JSON...');
    let fixedText = fixIncompleteString(cleanedText);
    
    // Also try to close any unclosed brackets/braces
    const openBraces = (fixedText.match(/\{/g) || []).length;
    const closeBraces = (fixedText.match(/\}/g) || []).length;
    const openBrackets = (fixedText.match(/\[/g) || []).length;
    const closeBrackets = (fixedText.match(/\]/g) || []).length;
    
    // Close unclosed brackets first, then braces
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      fixedText += '\n  ]';
    }
    for (let i = 0; i < openBraces - closeBraces; i++) {
      fixedText += '\n}';
    }
    
    try {
      const parsed = JSON.parse(fixedText);
      console.log('[Claude API] Successfully fixed and parsed incomplete JSON');
      return parsed;
    } catch (fixError) {
      // Log more details about the parsing error
      if (__DEV__) {
        console.error('[Claude API] JSON parse error after fix attempt:', fixError.message);
        console.error('[Claude API] Original text (first 2000 chars):', text.substring(0, 2000));
        console.error('[Claude API] Cleaned text (first 2000 chars):', cleanedText.substring(0, 2000));
        console.error('[Claude API] Fixed text (first 2000 chars):', fixedText.substring(0, 2000));
        console.error('[Claude API] Full cleaned text length:', cleanedText.length);
        console.error('[Claude API] Full fixed text length:', fixedText.length);
      }
      
      // Create error with more context
      const parseError = new Error(`Claude returned an unreadable response. ${error.message}`);
      parseError.originalText = text;
      parseError.cleanedText = cleanedText;
      parseError.fixedText = fixedText;
      throw parseError;
    }
  }
};

/**
 * Identify games present in an image using Claude.
 * @param {Object} params
 * @param {string} params.imageBase64 - base64-encoded image without data URI prefix.
 * @param {string} [params.imageMediaType='image/jpeg'] - MIME type of the image being sent.
 * @param {string} [params.narrationText] - Optional textual narration supplied by the user.
 * @param {Object} [params.audioNarration] - Optional audio payload with base64 data.
 * @param {string} params.audioNarration.data - base64-encoded audio without data URI prefix.
 * @param {string} [params.audioNarration.mediaType='audio/m4a'] - MIME type for the audio clip.
 * @param {Array<string>} [params.rejectedTitles] - Titles previously rejected by the user.
 * @returns {Promise<{ games: Array, comments: string, rawText: string }>}
 */
export const identifyGamesFromImage = async ({
  imageBase64,
  imageMediaType = 'image/jpeg',
  narrationText,
  audioNarration,
  rejectedTitles,
}) => {
  if (!API_CONFIG.ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key is not configured. Set EXPO_PUBLIC_ANTHROPIC_API_KEY before using this feature.');
  }

  if (!imageBase64) {
    throw new Error('A photo is required to identify games.');
  }

  const userContent = [
    {
      type: 'text',
      text: buildPrompt({ narrationText, rejectedTitles }),
    },
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageMediaType,
        data: imageBase64,
      },
    },
  ];

  if (audioNarration?.data) {
    userContent.push({
      type: 'audio',
      source: {
        type: 'base64',
        media_type: audioNarration.mediaType || 'audio/m4a',
        data: audioNarration.data,
      },
    });
  }

  const payload = {
    model: API_CONFIG.ANTHROPIC_DEFAULT_MODEL,
    max_tokens: 4096, // Increased to handle multiple games with detailed styling information
    temperature: 0,
    system: 'Always produce output in strict JSON that conforms to the documented schema. Do not use Markdown code blocks. Return only the raw JSON object.',
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  };

  const headers = {
    'x-api-key': API_CONFIG.ANTHROPIC_API_KEY,
    'anthropic-version': API_CONFIG.ANTHROPIC_VERSION,
    'content-type': 'application/json',
  };

  if (audioNarration?.data) {
    headers['anthropic-beta'] = 'audio';
  }

  const endpoint = `${API_CONFIG.ANTHROPIC_BASE_URL}/v1/messages`;

  // Retry logic for "Overloaded" errors
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Exponential backoff: wait 1s, 2s, 4s before retries
      if (attempt > 0) {
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        if (__DEV__) {
          console.log(`[Claude API] Retry attempt ${attempt}/${maxRetries} after ${delayMs}ms delay`);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const response = await axios.post(endpoint, payload, { headers });
      
      if (__DEV__) {
        console.log('[Claude API] Full response structure:', JSON.stringify(response.data, null, 2).substring(0, 1000));
      }
      
      const rawText = extractTextFromClaudeResponse(response.data?.content);
      
      if (__DEV__) {
        console.log('[Claude API] Extracted raw text length:', rawText?.length || 0);
      }
      
      if (!rawText || rawText.trim().length === 0) {
        throw new Error('Claude returned an empty response. The API response may be malformed.');
      }
      
      const parsed = parseClaudeJson(rawText);

      return {
        games: parsed.games ?? [],
        comments: parsed.comments ?? '',
        rawText,
      };
    } catch (error) {
      lastError = error;
      
      // If this is a JSON parsing error, include more context
      if (error.message && error.message.includes('unreadable response')) {
        if (error.originalText && __DEV__) {
          console.error('[Claude API] Original response that failed:', error.originalText.substring(0, 2000));
        }
        if (error.cleanedText && __DEV__) {
          console.error('[Claude API] Cleaned text that failed:', error.cleanedText.substring(0, 2000));
        }
      }
      
      const errorMessage =
        error.response?.data?.error?.message ||
        error.response?.data?.error ||
        error.message ||
        'Unknown error';

      // If it's an "Overloaded" error and we have retries left, retry
      if (errorMessage.toLowerCase().includes('overloaded') && attempt < maxRetries) {
        if (__DEV__) {
          console.warn(`[Claude API] Overloaded error, will retry (attempt ${attempt + 1}/${maxRetries})`);
        }
        continue; // Retry the request
      }

      // For other errors or if we're out of retries, throw immediately
      const message =
        errorMessage === 'Overloaded'
          ? 'Claude API is temporarily overloaded. Please wait a moment and try again.'
          : errorMessage;

      throw new Error(message);
    }
  }

  // Should never reach here, but just in case
  throw lastError || new Error('Failed to contact Claude after multiple attempts.');
};

export const buildGameIdentificationPrompt = buildPrompt;

/**
 * Format a list of board game titles for BGG API use using Claude.
 * Takes a raw text list and returns properly formatted game titles.
 * Can also interpret descriptions and generate comprehensive lists.
 * @param {string} gameListText - Raw text list of game titles or descriptive query (can be messy, unformatted)
 * @returns {Promise<{ games: Array<string>, rawText: string }>}
 */
export const formatGameListForBGG = async (gameListText) => {
  console.log('[Claude → BGG] Starting formatGameListForBGG with input text:');
  console.log('[Claude → BGG] Input length:', gameListText?.length || 0);
  console.log('[Claude → BGG] Input preview:', gameListText?.substring(0, 200) || 'empty');
  
  if (!API_CONFIG.ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key is not configured. Set EXPO_PUBLIC_ANTHROPIC_API_KEY before using this feature.');
  }

  if (!gameListText || !gameListText.trim()) {
    throw new Error('A game list is required to format.');
  }

  const prompt = `You are an expert on board games and BoardGameGeek (BGG). Your task is to interpret the user's input and generate a list of board game titles based on your best guess of what they're referring to.

The user may provide:
1. A direct list of game titles (one per line, comma-separated, or mixed format)
2. A descriptive query about games they own (e.g., "Pretty much all the 'Dominion' games", "I have almost all the Settlers Expansions", "All the Ticket to Ride games except the base game")

Your task is to:
1. If the input is a direct list: Extract all valid board game titles, format them properly, remove duplicates, and standardize them
2. If the input is a descriptive query: Make your best guess about which specific games the description is referring to. For example:
   - "Pretty much all the 'Dominion' games" → Likely means the main Dominion base games and major expansions (Dominion, Dominion: Intrigue, Dominion: Seaside, Dominion: Prosperity, Dominion: Hinterlands, Dominion: Dark Ages, Dominion: Guilds, Dominion: Adventures, Dominion: Empires, Dominion: Nocturne, Dominion: Renaissance, Dominion: Menagerie, Dominion: Allies, etc.)
   - "I have almost all the Settlers Expansions" → Likely means the main Catan expansions (Catan: Seafarers, Catan: Cities & Knights, Catan: Traders & Barbarians, Catan: Explorers & Pirates, etc.)
   - "All Ticket to Ride games" → Likely means the main Ticket to Ride base games and popular map expansions
   - "All Pandemic games" → Likely means the main Pandemic base games and major expansions
3. When generating lists from descriptions, make your best judgment:
   - Consider the context and wording (e.g., "almost all" vs "all", "pretty much all" vs "all")
   - Include the games that most likely match the description
   - Focus on commonly owned/well-known games in a series rather than obscure promos or micro-expansions
   - Use your knowledge of board game series and what games are typically available
4. Format each title as the full, proper game name as it would appear on BoardGameGeek
5. Remove any duplicates
6. Standardize capitalization and formatting

IMPORTANT: Make your best guess about which games the user is referring to. The user can always remove games from the staging area if they don't have them, or add more if something is missing.

Return your response as valid JSON in this exact format:
{
  "games": [
    "Game Title 1",
    "Game Title 2",
    "Game Title 3"
  ]
}

Return ONLY valid JSON, no additional commentary, no Markdown formatting.

User's input:
${gameListText.trim()}`;

  const payload = {
    model: API_CONFIG.ANTHROPIC_DEFAULT_MODEL,
    max_tokens: 4096,
    temperature: 0,
    system: 'Always produce output in strict JSON that conforms to the documented schema. Do not use Markdown code blocks. Return only the raw JSON object.',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  };

  const headers = {
    'x-api-key': API_CONFIG.ANTHROPIC_API_KEY,
    'anthropic-version': API_CONFIG.ANTHROPIC_VERSION,
    'content-type': 'application/json',
  };

  const endpoint = `${API_CONFIG.ANTHROPIC_BASE_URL}/v1/messages`;

  // Retry logic for "Overloaded" errors
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Exponential backoff: wait 1s, 2s, 4s before retries
      if (attempt > 0) {
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        if (__DEV__) {
          console.log(`[Claude API] Retry attempt ${attempt}/${maxRetries} after ${delayMs}ms delay`);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const response = await axios.post(endpoint, payload, { headers });
      
      if (__DEV__) {
        console.log('[Claude API] Format list response structure:', JSON.stringify(response.data, null, 2).substring(0, 1000));
      }
      
      const rawText = extractTextFromClaudeResponse(response.data?.content);
      
      if (__DEV__) {
        console.log('[Claude API] Extracted raw text length:', rawText?.length || 0);
      }
      
      if (!rawText || rawText.trim().length === 0) {
        throw new Error('Claude returned an empty response. The API response may be malformed.');
      }
      
      const parsed = parseClaudeJson(rawText);

      const gamesList = parsed.games ?? [];
      
      // Log what titles Claude identified
      console.log('[Claude → BGG] Claude identified the following game titles:');
      console.log(`[Claude → BGG] Total titles: ${gamesList.length}`);
      gamesList.forEach((title, index) => {
        console.log(`[Claude → BGG] ${index + 1}. "${title}"`);
      });

      return {
        games: gamesList,
        rawText,
      };
    } catch (error) {
      lastError = error;
      
      const errorMessage =
        error.response?.data?.error?.message ||
        error.response?.data?.error ||
        error.message ||
        'Unknown error';

      // If it's an "Overloaded" error and we have retries left, retry
      if (errorMessage.toLowerCase().includes('overloaded') && attempt < maxRetries) {
        if (__DEV__) {
          console.warn(`[Claude API] Overloaded error, will retry (attempt ${attempt + 1}/${maxRetries})`);
        }
        continue; // Retry the request
      }

      // For other errors or if we're out of retries, throw immediately
      const message =
        errorMessage === 'Overloaded'
          ? 'Claude API is temporarily overloaded. Please wait a moment and try again.'
          : errorMessage;

      throw new Error(message);
    }
  }

  // Should never reach here, but just in case
  throw lastError || new Error('Failed to contact Claude after multiple attempts.');
};


