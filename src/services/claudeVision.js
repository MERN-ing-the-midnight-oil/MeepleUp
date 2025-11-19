import axios from 'axios';
import { API_CONFIG } from '../config/api';

const DEFAULT_PROMPT_INTRO = `
You are a font expert and graphic design expert analyzing board game spines. You are looking at the sides of board game boxes that are usually stacked vertically on a shelf.

CRITICAL REQUIREMENTS:
- ONLY identify games where you can see the COMPLETE box side (whole rectangle). Ignore any partially visible titles or cut-off boxes.
- If the photo has excessive glare, reflections, or insufficient lighting that prevents clear identification, return an empty games array and include a message in the comments field asking the user to improve lighting and reduce glare.
- If you detect text in a foreign language, translate it to English and use the translated title. Note the original language in the notes field if relevant.

Your task is to:
1. Identify each visible game title on complete box spines (whole rectangles only)
2. Identify any additional text on the spine that is NOT part of the actual game title (e.g., subtitles, taglines, publisher names, edition info, designer names, etc.)
3. Analyze the typography and visual styling of each title
4. Match each title to the most appropriate font from the available font list
5. Extract color and styling information
6. Assess your confidence level for each identification

For each game you identify, return a JSON object with this structure:

{
  "title": "EXACT GAME TITLE AS IT APPEARS (translated to English if foreign language)",
  "additionalText": "string or null - any text on the spine that is NOT part of the actual game title (subtitles, taglines, publisher names, edition info, designer names, etc.). Set to null if no additional text is present.",
  "confidence": "high|medium|low",
  "notes": "optional string - edition notes, original language if translated, or font size variations observed within the title",
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

Bold/Geometric Sans (High Impact):
- Bebas Neue - Ultra-condensed, all-caps display font with uniform stroke width. Strong vertical emphasis, no lowercase. Perfect for bold headlines.
- Anton - Extra bold sans-serif with compressed width. Very heavy weight, geometric construction. Commanding presence.
- Francois One - Bold condensed sans with rounded corners. Friendly but strong. Good readability despite weight.
- Passion One - Ultra-bold display font with tight spacing. Very impactful, condensed proportions.
- Archivo Black - Ultra-bold sans-serif with slight geometric influence. Very heavy strokes, excellent for display.

Medium Weight Sans (Versatile):
- Roboto - Neo-grotesque sans with mechanical skeleton. Neutral, readable, modern standard.
- Montserrat - Geometric sans inspired by urban typography. Clean, modern, multiple weights.
- Lato - Semi-rounded humanist sans. Warm, stable, professional.
- Poppins - Geometric sans with circular forms. International, modern, very readable.
- Raleway - Elegant sans with unique 'w'. Thin to black weights, sophisticated.

Rounded/Friendly Sans:
- Quicksand - Geometric rounded sans with circular forms. Friendly, modern, clean.
- Comfortaa - Rounded geometric sans with soft curves. Very friendly, approachable.
- Fredoka - Rounded display sans with playful character. Multiple weights, very friendly.
- Nunito - Rounded sans with balanced proportions. Soft, readable, versatile.

Condensed Fonts:
- Roboto Condensed - Condensed version of Roboto. Clean, efficient, modern.
- Barlow Condensed - Slightly rounded condensed sans. Tall x-height, versatile.
- Fjalla One - Bold condensed sans with strong presence. Medium contrast.
- Yanone Kaffeesatz - Narrow sans with elegant proportions. Light to bold.

Playful/Display/Comic:
- Bangers - Comic book style with irregular baseline. Bold, energetic, fun.
- Permanent Marker - Hand-drawn marker font. Irregular, casual, authentic.
- Titan One - Bold display with playful proportions. Strong, friendly.
- Righteous - Futuristic display with geometric forms. Bold, sci-fi influenced.
- Luckiest Guy - Heavy casual display. Very bold, cheerful.

Elegant/Sophisticated Serif:
- Playfair Display - High-contrast transitional serif. Elegant, sophisticated, large display.
- Cinzel - Classical Roman-inspired capitals. Strong serifs, elegant proportions.
- Cormorant - Delicate display serif with calligraphic influence. Elegant, refined.
- Libre Baskerville - Classic serif for body text. Traditional, readable.
- Merriweather - Condensed serif with strong character. Slightly bold, very readable.

Bold/Display Serif (Slab):
- Abril Fatface - Ultra-bold display serif with high contrast. Dramatic, elegant.
- Alfa Slab One - Ultra-bold slab serif display. Very heavy, retro feel.
- Bree Serif - Upright italic slab serif. Friendly, distinctive.

Vintage/Retro/Technical:
- Special Elite - Typewriter font with authentic imperfections. Vintage, distinctive.
- Staatliches - Industrial condensed display. Strong, geometric, vintage industrial.
- Audiowide - Futuristic/retro display. Geometric, sci-fi influenced.
- Monoton - Art deco inline display. Elegant, vintage, geometric.

Script/Handwritten:
- Pacifico - Casual brush script. Friendly, flowing, relaxed.
- Caveat - Handwritten marker style. Casual, authentic, irregular.
- Amatic SC - Hand-drawn narrow font. Casual, distinctive.

Monospace/Pixel:
- Press Start 2P - 8-bit pixel font. Video game aesthetic, blocky.
- Space Mono - Geometric monospace with personality. Modern, distinctive.

IMPORTANT GUIDELINES:

- ONLY process complete box sides (whole rectangles). Skip any partially visible or cut-off boxes.
- Choose the font that BEST MATCHES the visual characteristics you observe, even if it's a custom font. Analyze the custom font's characteristics (weight, width, style, mood) and match it to the closest available font.
- For backgroundColor, identify the primary/dominant color of that game's spine.
- For backgroundColorSecondary, include a secondary color ONLY if a gradient is clearly visible and the secondary color is obvious. Otherwise, set to null.
- For text color, identify the color of the title text itself.
- Be precise with hex codes for colors.
- If text has an outline/stroke, capture it in WebkitTextStroke.
- Pay attention to whether text is ALL CAPS, Title Case, or lowercase.
- Note the orientation - many board game spines have vertical text.
- Standardize fontSize to "16px" (normal readable size for mobile). If you observe size variations within a single title, note this in the notes field.
- Use "high" confidence only when you're certain of the title and can see the complete box side.
- Use "medium" confidence when you're fairly sure but there's some ambiguity.
- Use "low" confidence when the title is unclear even though the box side is complete.
- If you see multiple copies or editions, list them separately and note the edition in the "notes" field.
- Look for additional text on the spine that is NOT part of the game title (subtitles, taglines, publisher names, edition info, designer names, etc.). Include this in the "additionalText" field. Only include text that is clearly visible and separate from the main title.
- If lighting is poor, glare is excessive, or visibility is compromised, return an empty games array and include guidance in comments.
- If no complete box sides are visible, return an empty games array.

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

  try {
    return JSON.parse(cleanedText);
  } catch (error) {
    // Log more details about the parsing error
    if (__DEV__) {
      console.error('[Claude API] JSON parse error:', error.message);
      console.error('[Claude API] Original text (first 2000 chars):', text.substring(0, 2000));
      console.error('[Claude API] Cleaned text (first 2000 chars):', cleanedText.substring(0, 2000));
      console.error('[Claude API] Full cleaned text length:', cleanedText.length);
    }
    
    // Create error with more context
    const parseError = new Error(`Claude returned an unreadable response. ${error.message}`);
    parseError.originalText = text;
    parseError.cleanedText = cleanedText;
    throw parseError;
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


