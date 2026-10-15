import { MAX_VIDEO_BYTES } from '@app/content/media';

/** Largura e altura de uma imagem escolhida no navegador, antes do envio. */
export function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler as dimensões da imagem.'));
    };
    img.src = url;
  });
}

/**
 * Tamanho e duração de um vídeo, lidos pelo próprio navegador (só os
 * metadados, sem tocar o arquivo). É o que as redes conferem: proporção para
 * o Reels e duração mínima e máxima de cada uma.
 */
export function readVideoInfo(file: File): Promise<{ width: number; height: number; durationMs: number }> {
  if (file.size > MAX_VIDEO_BYTES) {
    return Promise.reject(new Error(`O vídeo passa de ${MAX_VIDEO_BYTES / (1024 * 1024)} MB. Exporte numa qualidade menor e envie de novo.`));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const durationMs = Math.round(video.duration * 1000);
      if (!video.videoWidth || !video.videoHeight || !Number.isFinite(durationMs) || durationMs <= 0) {
        reject(new Error('Não foi possível ler o tamanho ou a duração do vídeo. Confira se é um MP4 válido.'));
        return;
      }
      resolve({ width: video.videoWidth, height: video.videoHeight, durationMs });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('O navegador não conseguiu abrir este vídeo. Exporte em MP4 (H.264) e envie de novo.'));
    };
    video.src = url;
  });
}
