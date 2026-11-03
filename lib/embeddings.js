// Converts complaint text into a 384-dimension vector using the
// all-MiniLM-L6-v2 sentence-transformer model. The model runs locally
// inside Node (transformers.js), so no API key is needed. It is downloaded
// once (~23 MB) the first time it is used and cached after that.
import { pipeline } from '@xenova/transformers';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

let extractor = null;

export async function getEmbedding(text) {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', MODEL_NAME);
  }
  // mean pooling + normalisation gives one unit-length vector per sentence,
  // which is what cosine similarity expects
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// title and description are embedded together so short titles still get context
export function ticketText(title, description) {
  return `${title}. ${description}`;
}

// pgvector accepts vectors written as the string '[0.1,0.2,...]'
export function toPgVector(values) {
  return '[' + values.join(',') + ']';
}
