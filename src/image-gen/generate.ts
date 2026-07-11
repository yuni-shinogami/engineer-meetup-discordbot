import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { loadFonts } from './fonts';
import { LtAnnounceTemplate, type LtAnnounceTemplateProps } from './templates/lt-announce';

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 1600;

export interface LtAnnounceParams extends LtAnnounceTemplateProps {
  template: 'lt-announce';
}

export type ImageParams = LtAnnounceParams;

export async function generateImage(params: ImageParams): Promise<Buffer> {
  const fonts = await loadFonts();

  const { template: _t, ...props } = params;
  const element = LtAnnounceTemplate(props);

  const svg = await satori(element, {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    fonts,
  });

  return Buffer.from(new Resvg(svg).render().asPng());
}
