import { Injectable } from '@nestjs/common';

export interface BlurRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * BlurService is kept for backwards compatibility.
 * Actual blur processing is now handled by the Python YuNet script
 * via AiService.blurFaces().
 */
@Injectable()
export class BlurService {
  /**
   * Apply Gaussian blur to specific regions of an image buffer.
   * Used as a fallback if the Python pipeline is unavailable.
   */
  async blurRegions(
    imageBuffer: Buffer,
    regions: BlurRegion[],
    blurStrength: number = 25,
  ): Promise<Buffer> {
    const sharp = (await import('sharp')).default;

      const composites: Array<{ input: Buffer; left: number; top: number }> = [];
    for (const region of regions) {
      const blurred = await sharp(imageBuffer)
        .extract({
          left: region.x,
          top: region.y,
          width: region.width,
          height: region.height,
        })
        .blur(blurStrength)
        .toBuffer();

      composites.push({ input: blurred, left: region.x, top: region.y });
    }

    return sharp(imageBuffer).composite(composites).jpeg({ quality: 95 }).toBuffer();
  }
}