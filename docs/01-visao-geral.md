# 01 — Visão geral e arquitetura

## O que estes módulos fazem, de ponta a ponta

```
                 CRIAÇÃO (@app/content)                         PUBLICAÇÃO (@app/social)
 ┌──────────────────────────────────────────────┐      ┌───────────────────────────────────────────────┐
 │ Biblioteca de mídia (ContentAsset)           │      │ Contas ligadas (SocialAccount)                │
 │  · upload de imagem/vídeo                    │      │  · LinkedIn (perfil ou Página) e Instagram    │
 │  · gerador de imagens por modelos            │──┐   │  · pessoais (por utilizador) ou da empresa    │
 │  · importação por URL (imagem e vídeo)       │  │   │  · permissões por utilizador (VIEW/DRAFT/PUB) │
 │                                              │  │   │                                               │
 │ Artigos e casos (ContentPost)                │  │   │ Posts (SocialPost)                            │
 │  · editor de blocos, SEO, capa               │──┼──▶│  · texto + mídia da biblioteca + link         │
 │  · agendar / publicar no site                │  │   │  · validação por rede, revisão, aprovação     │
 └──────────────────────────────────────────────┘  │   │  · cron publica no horário (lock, retry)      │
                                                   │   │  · sincroniza posts feitos fora do sistema    │
                                                   └──▶│  · métricas + painel de desempenho            │
                                                       └───────────────────────────────────────────────┘
```

- **`@app/content`** — conteúdo editorial (blog e casos de sucesso) e a biblioteca de mídia
  que alimenta tudo: imagens enviadas, imagens geradas a partir de modelos da marca e vídeos.
- **`@app/social`** — tudo o que leva essa mídia às redes: contas, posts, aprovação,
  publicação automática, sincronização e métricas.
- **`@app/content-contract`** — o esquema (zod) dos blocos do corpo de um artigo, sem Prisma,
  para poder ser importado pelo navegador (editor) e pelo servidor.

## Camadas (e a regra que não pode ser quebrada)

```
 UI (Next.js)    web/src/app/(app)/...   web/src/components/...      ← só apresentação
 Adaptadores     web/src/app/api/...     web/src/lib/...  mcp/...    ← FINOS: autenticam, chamam o módulo
 Módulos         modules/content         modules/social              ← TODA a regra de negócio
 Host            @app/core (Ctx, erros, eventos, cifra, ...)  @app/db (Prisma)
```

1. **Regra de negócio só nos módulos.** Rotas HTTP, server actions e tools MCP são adaptadores:
   resolvem quem é o utilizador (`Ctx`), chamam uma função do módulo e devolvem o resultado.
   Validação, permissões, transições de estado, eventos e notificações acontecem dentro do módulo,
   por isso a mesma regra vale para a UI, para a API e para o MCP.
2. **O que é de fora entra por adaptador.** Os módulos não conhecem Next.js, Vercel Blob,
   `sharp` nem `next/og`. Recebem interfaces (`ImageRenderer`, `ImageCodec`, `ImageStorage`,
   `VideoStorage`, `RemoteMediaStore`, `SocialProviderAdapter`) que a camada web monta.
   Trocar o armazenamento ou o renderizador é trocar o adaptador, não o módulo.
3. **Subpaths puros para o navegador.** Os índices dos módulos puxam o Prisma. O navegador só pode
   importar os subpaths sem I/O:
   - `@app/content/image-templates`, `@app/content/media`
   - `@app/social/rules`, `/status`, `/metrics`, `/analyze`, `/utm`, `/access`, `/remote`
   - `@app/content-contract` (inteiro)
4. **Aprovação humana antes de publicar.** Nenhum post vai para uma rede sem um humano o aprovar
   na tela. Não existe função exposta por MCP que aprove ou publique (ver `docs/03`).

## Dependências entre os pacotes

```
@app/social ──▶ @app/core, @app/db          (lê a tabela ContentAsset/ContentPost direto pelo Prisma;
                                                 NÃO importa @app/content)
@app/content ─▶ @app/content-contract, @app/core, @app/db
web, mcp ──────▶ os três acima
```

O acoplamento entre os dois módulos é **só pelo banco**: `SocialPost.mediaAssetIds` guarda ids de
`ContentAsset` (sem FK, é um array) e `SocialPost.sourceContentPostId` é FK para `ContentPost`.
A camada web junta os dois (o composer social usa o `MediaPicker` do conteúdo).

## Stack original

- TypeScript estrito, ESM, Node ≥ 22, pnpm workspaces + Turborepo.
- Next.js 15 (App Router), React 19, Tailwind (tokens de design via CSS variables).
- Prisma 6 + PostgreSQL (Supabase em produção).
- Vercel (funções Node, Vercel Blob para ficheiros). Crons chamados por agendador externo.
- MCP: `@modelcontextprotocol/sdk` (servidor stdio e rota HTTP `/api/mcp`).
- Editor de artigos: Tiptap 3. Gráficos: Recharts. Arrastar: dnd-kit.
- Imagens: `next/og` (Satori) para desenhar, `sharp` para converter. PDF do carrossel do LinkedIn: `pdf-lib`.

## Idioma e convenções do código

Código, comentários e mensagens em português do Brasil (com algumas mensagens de tela em pt-PT,
herdadas). Prettier a 100 colunas, aspas simples. Testes `*.test.ts` ao lado do código (vitest);
os `*.db.test.ts` precisam de um Postgres real.
