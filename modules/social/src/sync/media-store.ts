// Onde a sincronização guarda a cópia da media das publicações (as URLs do
// Instagram expiram; as do LinkedIn exigem token). O que é de fora — baixar
// com segurança, reduzir e gravar no Vercel Blob — é montado pelo apps/web
// (`lib/social-media-store.ts`). Sem loja registada (MCP local, testes), a
// sincronização guarda só as URLs originais e a prévia usa-as enquanto valem.

export interface RemoteMediaStore {
  /** Copia a imagem em `sourceUrl` para o CRM e devolve a URL pública da cópia (null = não deu). */
  copy(sourceUrl: string, key: string): Promise<string | null>;
}

let store: RemoteMediaStore | null = null;

export function setRemoteMediaStore(next: RemoteMediaStore | null) {
  store = next;
}

export function getRemoteMediaStore(): RemoteMediaStore | null {
  return store;
}
