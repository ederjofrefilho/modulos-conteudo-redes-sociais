import { describe, expect, it } from 'vitest';
import { assertFetchableUrl, downloadImage, isPrivateAddress, sniffImageType } from './download';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const publicDns = async () => ['93.184.216.34'];

function response(body: Uint8Array | string, init: ResponseInit = {}) {
  return new Response(typeof body === 'string' ? body : Buffer.from(body), init);
}

describe('sniffImageType', () => {
  it('reconhece pelos bytes, não pela extensão', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(new TextEncoder().encode('GIF89a'))).toBe('image/gif');
    expect(sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('<html>'))).toBeNull();
  });
});

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('%s é interno', (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111'])('%s é público', (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe('assertFetchableUrl', () => {
  it('recusa esquema que não é http(s)', async () => {
    await expect(assertFetchableUrl('file:///etc/passwd', publicDns)).rejects.toThrow(/http/);
  });

  it('recusa host que resolve para endereço interno', async () => {
    await expect(assertFetchableUrl('https://interno.exemplo', async () => ['10.0.0.5'])).rejects.toThrow(/interno/);
    await expect(assertFetchableUrl('http://127.0.0.1/x.png')).rejects.toThrow(/interno/);
  });
});

describe('downloadImage', () => {
  it('baixa e identifica a imagem', async () => {
    const out = await downloadImage('https://cdn.exemplo/foto.jpg', {
      lookup: publicDns,
      fetch: async () => response(JPEG, { status: 200 }),
    });
    expect(out.mimeType).toBe('image/jpeg');
    expect(out.bytes.byteLength).toBe(JPEG.byteLength);
  });

  it('confere cada redirecionamento (não segue para rede interna)', async () => {
    const lookup = async (host: string) => (host === 'cdn.exemplo' ? ['93.184.216.34'] : ['192.168.0.10']);
    await expect(
      downloadImage('https://cdn.exemplo/a.jpg', {
        lookup,
        fetch: async () => response('', { status: 302, headers: { location: 'http://roteador.local/admin' } }),
      }),
    ).rejects.toThrow(/interno/);
  });

  it('recusa arquivo que não é imagem', async () => {
    await expect(
      downloadImage('https://cdn.exemplo/a.jpg', { lookup: publicDns, fetch: async () => response('<html></html>') }),
    ).rejects.toThrow(/não é uma imagem/);
  });

  it('recusa acima do limite, mesmo sem content-length', async () => {
    await expect(
      downloadImage('https://cdn.exemplo/a.jpg', { lookup: publicDns, maxBytes: 4, fetch: async () => response(JPEG) }),
    ).rejects.toThrow(/MB/);
  });

  it('erro HTTP vira mensagem clara', async () => {
    await expect(
      downloadImage('https://cdn.exemplo/a.jpg', {
        lookup: publicDns,
        fetch: async () => response('', { status: 404 }),
      }),
    ).rejects.toThrow(/404/);
  });
});
