import axios from 'axios';
import { API_CONFIG } from '../config/api';

const DEFAULT_PROMPT_INTRO = `
You are a board game identification assistant helping MeepleUp members catalogue their collections.
Study the provided photo carefully and list every distinct board game you can confidently recognise.
Use the exact published English titles whenever possible.
If you see multiple copies or editions, list them separately and note the edition.
If you are uncertain about a title, mark the confidence as "low".
If no games are recognisable, return an empty list.
Respond strictly with valid JSON that matches this schema:
{
  "games": [
    {"title": "string", "confidence": "high|medium|low", "notes": "optional string"}
  ],
  "comments": "optional string"
}
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

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Claude returned an unreadable response. Please retry or adjust the prompt.');
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
    max_tokens: 1024,
    temperature: 0,
    system: 'Always produce output in strict JSON that conforms to the documented schema.',
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

  try {
    const response = await axios.post(endpoint, payload, { headers });
    const rawText = extractTextFromClaudeResponse(response.data?.content);
    const parsed = parseClaudeJson(rawText);

    return {
      games: parsed.games ?? [],
      comments: parsed.comments ?? '',
      rawText,
    };
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.error ||
      error.message ||
      'Failed to contact Claude. Please try again later.';

    throw new Error(message);
  }
};

export const buildGameIdentificationPrompt = buildPrompt;


