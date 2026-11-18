import {GoogleGenAI} from '@google/genai';
import crypto from 'crypto';
import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import {createServer as createViteServer} from 'vite';

const PORT = 3000;
const app = express();
app.use(express.json({limit: '256kb'}));

const TTS_CACHE_DIR = path.resolve(process.cwd(), 'tts_cache');
if (!fs.existsSync(TTS_CACHE_DIR)) {
  fs.mkdirSync(TTS_CACHE_DIR, {recursive: true});
}

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      apiVersion: 'v1alpha',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

const ttsMemoryCache = new Map<string, string>();
const MAX_MEMORY_CACHE = 160;

function getCacheKey(mood: 'story' | 'warning', text: string): string {
  return `${mood}:${text}`;
}

function getCacheFilePath(mood: 'story' | 'warning', text: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(getCacheKey(mood, text))
    .digest('hex')
    .slice(0, 24);
  return path.join(TTS_CACHE_DIR, `${hash}.wav`);
}

function getCachedBase64(mood: 'story' | 'warning', text: string): string | null {
  const key = getCacheKey(mood, text);
  const mem = ttsMemoryCache.get(key);
  if (mem) return mem;

  const filePath = getCacheFilePath(mood, text);
  if (fs.existsSync(filePath)) {
    const base64 = fs.readFileSync(filePath).toString('base64');
    if (ttsMemoryCache.size < MAX_MEMORY_CACHE) {
      ttsMemoryCache.set(key, base64);
    }
    return base64;
  }
  return null;
}

function saveCachedWav(mood: 'story' | 'warning', text: string, wavBuffer: Buffer): string {
  const key = getCacheKey(mood, text);
  const filePath = getCacheFilePath(mood, text);
  fs.writeFileSync(filePath, wavBuffer);
  const base64 = wavBuffer.toString('base64');
  if (ttsMemoryCache.size >= MAX_MEMORY_CACHE) {
    const oldest = ttsMemoryCache.keys().next().value;
    if (oldest) ttsMemoryCache.delete(oldest);
  }
  ttsMemoryCache.set(key, base64);
  return base64;
}

function createWavHeader(
  pcmByteLength: number,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmByteLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmByteLength, 40);
  return header;
}

function splitWavBySilence(wavBuffer: Buffer, texts: string[]): Buffer[] {
  if (texts.length <= 1) return [wavBuffer];
  if (wavBuffer.length < 44 || wavBuffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Invalid RIFF WAV buffer');
  }

  const numChannels = wavBuffer.readUInt16LE(22);
  const sampleRate = wavBuffer.readUInt32LE(24);
  const bitsPerSample = wavBuffer.readUInt16LE(34);

  // Locate 'data' chunk dynamically
  let offset = 12;
  let dataOffset = 44;
  let dataSize = wavBuffer.length - 44;
  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, wavBuffer.length - dataOffset);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  const totalSamples = Math.floor(dataSize / 2);
  const samples = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    samples[i] = wavBuffer.readInt16LE(dataOffset + i * 2);
  }

  // Compute 10ms frame RMS energies
  const winSamples = Math.max(1, Math.floor(sampleRate * 0.01));
  const numFrames = Math.floor(totalSamples / winSamples);
  const frameRms = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    let sumSq = 0;
    const base = f * winSamples;
    for (let s = 0; s < winSamples; s++) {
      const v = samples[base + s];
      sumSq += v * v;
    }
    frameRms[f] = Math.sqrt(sumSq / winSamples);
  }

  // Adaptive silence threshold (18th percentile * 1.5, bounded)
  const sortedRms = Array.from(frameRms).sort((a, b) => a - b);
  const p18 = sortedRms[Math.floor(sortedRms.length * 0.18)] ?? 100;
  const silenceThresh = Math.max(180, Math.min(700, p18 * 1.8));

  // Build cumulative character weights
  const weights = texts.map((t) => Math.max(12, t.length + 6));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const cumRatios: number[] = [];
  let acc = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    acc += weights[i];
    cumRatios.push(acc / totalWeight);
  }

  const splitFrames: number[] = [0];
  const minFramesPerClip = Math.floor((sampleRate * 0.55) / winSamples);

  for (let i = 0; i < cumRatios.length; i++) {
    const prevFrame = splitFrames[splitFrames.length - 1];
    const remainingClips = texts.length - (i + 1);
    const expectedFrame = Math.round(cumRatios[i] * numFrames);
    const searchRadius = Math.round(numFrames * 0.14);

    const minSearch = Math.max(prevFrame + minFramesPerClip, expectedFrame - searchRadius);
    const maxSearch = Math.min(
      numFrames - remainingClips * minFramesPerClip,
      expectedFrame + searchRadius
    );

    let bestMidFrame = expectedFrame;
    let bestScore = -1;

    // Scan silence runs inside [minSearch, maxSearch]
    let runStart = -1;
    for (let f = minSearch; f <= maxSearch; f++) {
      const isSilent = frameRms[f] <= silenceThresh;
      if (isSilent && runStart === -1) {
        runStart = f;
      } else if ((!isSilent || f === maxSearch) && runStart !== -1) {
        const runEnd = isSilent ? f : f - 1;
        const runLen = runEnd - runStart + 1;
        const mid = Math.round((runStart + runEnd) / 2);
        const distPenalty = Math.abs(mid - expectedFrame) / Math.max(1, searchRadius);
        const score = runLen - distPenalty * 14;
        if (runLen >= 6 && score > bestScore) {
          bestScore = score;
          bestMidFrame = mid;
        }
        runStart = -1;
      }
    }

    // Fallback: pick frame with minimum local energy if no long silence run matched
    if (bestScore < 0) {
      let minEnergy = Infinity;
      for (let f = minSearch; f <= maxSearch; f++) {
        if (frameRms[f] < minEnergy) {
          minEnergy = frameRms[f];
          bestMidFrame = f;
        }
      }
    }

    splitFrames.push(bestMidFrame);
  }
  splitFrames.push(numFrames);

  // Slice WAV chunks with clean 40ms silence trimming
  const padSamples = Math.floor(sampleRate * 0.04);
  const results: Buffer[] = [];
  for (let i = 0; i < texts.length; i++) {
    let startFrame = splitFrames[i];
    let endFrame = splitFrames[i + 1];

    while (startFrame < endFrame - 10 && frameRms[startFrame] <= silenceThresh) {
      startFrame++;
    }
    while (endFrame > startFrame + 10 && frameRms[endFrame - 1] <= silenceThresh) {
      endFrame--;
    }

    const startSample = Math.max(0, startFrame * winSamples - padSamples);
    const endSample = Math.min(totalSamples, endFrame * winSamples + padSamples);
    const pcmBytes = (endSample - startSample) * 2;
    const header = createWavHeader(pcmBytes, sampleRate, numChannels, bitsPerSample);
    const body = Buffer.alloc(pcmBytes);
    wavBuffer.copy(body, 0, dataOffset + startSample * 2, dataOffset + endSample * 2);
    results.push(Buffer.concat([header, body]));
  }

  return results;
}

async function generateTtsWav(
  promptText: string,
  voiceName: 'Charon' | 'Puck'
): Promise<Buffer> {
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const modelsToTry = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];
  let lastError: unknown = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [{text: promptText}],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {voiceName},
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        return Buffer.from(base64Audio, 'base64');
      }
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('429') && !msg.includes('RESOURCE_EXHAUSTED')) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('All TTS models hit rate limits.');
}

app.post('/api/tts', async (req, res) => {
  const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const mood = req.body?.mood === 'warning' ? 'warning' : 'story';

  if (!rawText || rawText.length > 320) {
    res.status(400).json({error: 'Valid text (1-320 chars) is required.'});
    return;
  }

  const cached = getCachedBase64(mood, rawText);
  if (cached) {
    res.json({audioBase64: cached, mimeType: 'audio/wav', cached: true});
    return;
  }

  if (!ai) {
    res.status(503).json({
      error: 'GEMINI_API_KEY is not configured on the server.',
    });
    return;
  }

  try {
    const voiceName = mood === 'warning' ? 'Puck' : 'Charon';
    const wavBuf = await generateTtsWav(rawText, voiceName);
    const base64Audio = saveCachedWav(mood, rawText, wavBuf);
    res.json({audioBase64: base64Audio, mimeType: 'audio/wav', cached: false});
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'TTS generation failed.';
    const statusCode =
      message.includes('429') || message.includes('RESOURCE_EXHAUSTED')
        ? 429
        : 500;
    res.status(statusCode).json({error: message});
  }
});

app.post('/api/tts/batch-warm', async (req, res) => {
  const items = Array.isArray(req.body?.items)
    ? (req.body.items as Array<{text?: unknown; mood?: unknown}>)
    : [];
  const cleanItems = items
    .filter((it): it is {text: string; mood?: string} => typeof it?.text === 'string' && it.text.trim().length > 0)
    .map((it) => ({
      text: it.text.trim(),
      mood: (it.mood === 'warning' ? 'warning' : 'story') as 'story' | 'warning',
    }))
    .filter((it) => !getCachedBase64(it.mood, it.text));

  if (cleanItems.length === 0) {
    res.json({generated: 0, alreadyCached: true});
    return;
  }

  if (!ai) {
    res.status(503).json({error: 'GEMINI_API_KEY not configured'});
    return;
  }

  try {
    const mood = cleanItems[0].mood;
    const voiceName = mood === 'warning' ? 'Puck' : 'Charon';
    const joined = cleanItems.map((it) => it.text).join('\n\n... ... ...\n\n');
    const wavBuf = await generateTtsWav(joined, voiceName);
    const clips = splitWavBySilence(
      wavBuf,
      cleanItems.map((it) => it.text)
    );

    const durationsMs: number[] = [];
    for (let i = 0; i < cleanItems.length; i++) {
      saveCachedWav(mood, cleanItems[i].text, clips[i]);
      const pcmBytes = Math.max(0, clips[i].length - 44);
      durationsMs.push(Math.round((pcmBytes / (24000 * 2)) * 1000));
    }

    res.json({generated: cleanItems.length, durationsMs});
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Batch TTS failed.';
    const statusCode =
      message.includes('429') || message.includes('RESOURCE_EXHAUSTED')
        ? 429
        : 500;
    res.status(statusCode).json({error: message});
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'dist', 'index.html');
      const fallbackIndex = path.join(distDir, 'index.html');
      const target = fs.existsSync(fallbackIndex) ? fallbackIndex : indexFile;
      if (fs.existsSync(target)) {
        res.sendFile(target);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
