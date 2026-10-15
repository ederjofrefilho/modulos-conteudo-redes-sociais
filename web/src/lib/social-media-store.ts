import sharp from 'sharp';
import { put } from '@vercel/blob';
import { downloadImage } from '@app/content';
import { IMAGE_PALETTE } from '@app/content/image-templates';
import { setRemoteMediaStore } from '@app/social';

/**
 * Cópia da media das publicações sincronizadas (`@app/social` → sync): as
 * URLs do Instagram expiram e as do LinkedIn são assinadas, por isso a prévia
 * usa uma cópia no Blob do CRM (store `content`, mesma regra do upload:
 * só `BLOB_STORE_ID`). Baixa com a mesma proteção da importação de imagens
 * (só http(s) público, teto de tamanho, tipo pelos bytes) e grava um JPEG de
 * até 1080 px com nome estável — sincronizar de novo sobrescreve, não acumula.
 * Sem Blob (dev local), não regista nada: a prévia usa as URLs originais.
 */
let registered = false;

export function ensureSocialMediaStore() {
  if (registered) return;
  registered = true;
  if (!process.env.BLOB_STORE_ID) return;
  setRemoteMediaStore({
    async copy(sourceUrl, key) {
      const image = await downloadImage(sourceUrl, { maxBytes: 15 * 1024 * 1024 });
      const data = await sharp(image.bytes, { animated: false })
        .rotate()
        .flatten({ background: IMAGE_PALETTE.sheet })
        .resize({ width: 1080, withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      const blob = await put(key, data, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: false, allowOverwrite: true });
      return blob.url;
    },
  });
}
