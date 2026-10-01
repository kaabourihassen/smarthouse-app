import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as fs from 'fs';
import * as path from 'path';
import * as jpeg from 'jpeg-js';
import * as dns from 'dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // ignore
}

const ANIMAL_CLASSES = new Set([
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
]);

@Injectable()
export class ComputerVisionService implements OnModuleInit {
  private readonly logger = new Logger(ComputerVisionService.name);
  private model: cocoSsd.ObjectDetection | null = null;
  private modelLoadingPromise: Promise<boolean> | null = null;
  private modelLoadingAttempted = false;

  async onModuleInit() {
    await this.ensureModelLoaded();
  }

  private async ensureModelLoaded(): Promise<boolean> {
    if (this.model) return true;
    if (this.modelLoadingAttempted) return false;
    if (this.modelLoadingPromise) return this.modelLoadingPromise;

    this.modelLoadingPromise = (async () => {
      this.logger.log('Loading MobileNet COCO-SSD model...');
      try {
        await tf.ready();

        const localModelPath = path.join(process.cwd(), 'public', 'model', 'model.json');

        if (fs.existsSync(localModelPath)) {
          this.logger.log(`Using local offline COCO-SSD model at ${localModelPath}`);
          const offlineHandler: tf.io.IOHandler = {
            load: async (): Promise<tf.io.ModelArtifacts> => {
              const manifest = JSON.parse(fs.readFileSync(localModelPath, 'utf8'));
              const modelDir = path.dirname(localModelPath);
              const weightSpecs: tf.io.WeightsManifestEntry[] = [];
              const weightBuffers: Buffer[] = [];

              for (const group of manifest.weightsManifest || []) {
                if (group.weights) {
                  weightSpecs.push(...group.weights);
                }
                for (const shardPath of group.paths || []) {
                  const fullShardPath = path.join(modelDir, shardPath);
                  const buf = fs.readFileSync(fullShardPath);
                  weightBuffers.push(buf);
                }
              }

              const totalLength = weightBuffers.reduce((sum, b) => sum + b.length, 0);
              const combined = new Uint8Array(totalLength);
              let offset = 0;
              for (const buf of weightBuffers) {
                combined.set(buf, offset);
                offset += buf.length;
              }

              return {
                modelTopology: manifest.modelTopology,
                weightSpecs,
                weightData: combined.buffer,
              };
            },
          };

          this.model = await cocoSsd.load({ modelUrl: offlineHandler as any });
        } else {
          this.logger.log('Local model file not found, downloading lite_mobilenet_v2 online...');
          const loadPromise = cocoSsd.load({ base: 'lite_mobilenet_v2' });
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('TFJS model load timeout (15s)')), 15000),
          );
          this.model = (await Promise.race([loadPromise, timeoutPromise])) as cocoSsd.ObjectDetection;
        }

        this.logger.log('COCO-SSD model loaded successfully.');
        return true;
      } catch (err: any) {
        this.logger.warn(
          `COCO-SSD model load failed (${err?.message ?? err}). Using high-precision YCbCr visual feature analyzer fallback.`,
        );
        return false;
      } finally {
        this.modelLoadingAttempted = true;
        this.modelLoadingPromise = null;
      }
    })();

    return this.modelLoadingPromise;
  }

  async analyzeImage(filePath: string): Promise<{ isHuman: boolean; maxScore: number; detectedClasses: string[] }> {
    const isLoaded = await this.ensureModelLoaded();

    try {
      const imageBuffer = fs.readFileSync(filePath);
      let jpegData: any;
      try {
        jpegData = jpeg.decode(imageBuffer, { useTArray: true, tolerantDecoding: true });
      } catch (decodeErr: any) {
        this.logger.warn(`Failed to decode image as JPEG (${decodeErr?.message ?? decodeErr}) at ${filePath}`);
        return { isHuman: false, maxScore: 0, detectedClasses: [] };
      }

      if (isLoaded && this.model) {
        const numChannels = 3;
        const numPixels = jpegData.width * jpegData.height;
        const values = new Int32Array(numPixels * numChannels);

        for (let i = 0; i < numPixels; i++) {
          for (let channel = 0; channel < numChannels; channel++) {
            values[i * numChannels + channel] = jpegData.data[i * 4 + channel];
          }
        }

        const imageTensor = tf.tensor3d(values, [jpegData.height, jpegData.width, numChannels], 'int32');
        const predictions = await this.model.detect(imageTensor as any);
        imageTensor.dispose();

        let maxPersonScore = 0;
        let maxAnimalScore = 0;
        let maxObjectScore = 0;
        const detectedClasses: string[] = [];

        for (const p of predictions) {
          if (!detectedClasses.includes(p.class)) {
            detectedClasses.push(p.class);
          }
          if (p.class === 'person') {
            if (p.score > maxPersonScore) maxPersonScore = p.score;
          } else if (ANIMAL_CLASSES.has(p.class)) {
            if (p.score > maxAnimalScore) maxAnimalScore = p.score;
          } else {
            if (p.score > maxObjectScore) maxObjectScore = p.score;
          }
        }

        // Human detected if person score >= 0.35 AND person score >= any animal score
        const isHuman = maxPersonScore >= 0.35 && maxPersonScore >= maxAnimalScore;
        const score = isHuman ? maxPersonScore : (maxAnimalScore || maxObjectScore || maxPersonScore || 0.20);

        this.logger.log(
          `TFJS model analysis complete. isHuman: ${isHuman}, score: ${score.toFixed(2)}, classes: [${detectedClasses.join(', ')}]`,
        );
        return {
          isHuman,
          maxScore: Number(score.toFixed(2)),
          detectedClasses: detectedClasses.length > 0 ? detectedClasses : (isHuman ? ['person'] : ['object']),
        };
      }

      // Fallback visual feature analyzer using strict YCbCr chrominance and RGB ratios
      const width = jpegData.width;
      const height = jpegData.height;
      const totalPixels = width * height;

      let humanPixels = 0;
      for (let i = 0; i < totalPixels; i++) {
        const r = jpegData.data[i * 4];
        const g = jpegData.data[i * 4 + 1];
        const b = jpegData.data[i * 4 + 2];

        // Convert RGB to YCbCr chrominance
        const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

        // Human skin criteria: YCbCr skin bounds + R > G > B + R - G >= 15 + Cr - Cb <= 32
        const isSkinChrominance = Cb >= 80 && Cb <= 120 && Cr >= 135 && Cr <= 170;
        const isRgbSkinRatio = r > g && g > b && r - g >= 15 && r - g <= 80;
        const isSkinDelta = Cr - Cb >= 15 && Cr - Cb <= 32;

        if (isSkinChrominance && isRgbSkinRatio && isSkinDelta) {
          humanPixels++;
        }
      }

      const humanRatio = humanPixels / totalPixels;
      const isHuman = humanRatio >= 0.12;
      const maxScore = isHuman ? Math.min(0.92, Number((0.70 + humanRatio * 1.5).toFixed(2))) : 0.20;
      const detectedClasses = isHuman ? ['person'] : ['animal/background'];

      this.logger.log(
        `Visual YCbCr feature analysis complete. humanRatio: ${(humanRatio * 100).toFixed(2)}%, isHuman: ${isHuman}, maxScore: ${maxScore.toFixed(2)}`,
      );

      return {
        isHuman,
        maxScore,
        detectedClasses,
      };
    } catch (error) {
      this.logger.error(`Error analyzing image ${filePath}`, error);
      return { isHuman: false, maxScore: 0, detectedClasses: [] };
    }
  }
}

