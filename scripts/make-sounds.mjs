// Génère les trois sons de l'app (assets/sounds/*.wav) : de courtes notes douces, sans aucune source externe.
// Usage : node scripts/make-sounds.mjs   (reproductible : mêmes octets à chaque exécution)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

/** Mêmes notes que le son généré dans le navigateur (src/ui/sound.web.ts). */
const CUES = {
  // départ : deux notes montantes, très courtes
  go: [{ hz: 659.25, at: 0, len: 0.1 }, { hz: 880, at: 0.08, len: 0.16 }],
  // fin de série : deux notes descendantes
  end: [{ hz: 987.77, at: 0, len: 0.16 }, { hz: 783.99, at: 0.14, len: 0.28 }],
  // dernière série : arpège montant
  final: [{ hz: 783.99, at: 0, len: 0.16 }, { hz: 987.77, at: 0.14, len: 0.16 }, { hz: 1318.51, at: 0.28, len: 0.5 }],
};

function render(notes) {
  const total = Math.max(...notes.map((n) => n.at + n.len)) + 0.05;
  const samples = new Float32Array(Math.ceil(total * RATE));
  for (const { hz, at, len } of notes) {
    const start = Math.floor(at * RATE);
    const count = Math.floor(len * RATE);
    for (let i = 0; i < count && start + i < samples.length; i++) {
      const t = i / RATE;
      const attack = Math.min(1, t / 0.008); // pas de « clic » au début
      const decay = Math.exp((-5 * i) / count); // s'éteint doucement
      const tone = Math.sin(2 * Math.PI * hz * t) + 0.25 * Math.sin(4 * Math.PI * hz * t);
      samples[start + i] += 0.42 * attack * decay * tone;
    }
  }
  return samples;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

mkdirSync(out, { recursive: true });
for (const [name, notes] of Object.entries(CUES)) {
  const file = wav(render(notes));
  writeFileSync(join(out, `${name}.wav`), file);
  console.log(`${name}.wav  ${(file.length / 1024).toFixed(1)} Ko`);
}
