import { PrismaPlugin } from '@prisma/nextjs-monorepo-workaround-plugin';

// `output: 'standalone'` só é ativado pro build do app de desktop
// (`apps/desktop`, empacotado via Tauri — roda como servidor Node local,
// conectando direto no Postgres, sem passar pela Vercel). Deliberadamente
// condicional: a Vercel já faz seu próprio tracing de output; nunca alterar
// o formato do build de produção só por causa do desktop.
const isDesktopBuild = process.env.TAURI_BUILD === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isDesktopBuild ? { output: 'standalone' } : {}),
  // Pacotes do monorepo consumidos como TypeScript direto.
  transpilePackages: [
    '@app/db',
    '@app/core',
    '@app/outreach',
    '@app/mcp',
    '@app/calendar',
    '@app/meetings',
    '@app/content',
    '@app/content-contract',
    '@app/prospecting',
    '@app/social',
    '@app/ads',
    '@app/whatsapp',
  ],
  // Sem isto, o cache de navegação do CLIENTE para rotas `force-dynamic`
  // (todas as de /email — ver [threadKey]/page.tsx e @lista/page.tsx) tem
  // staleTime 0 por padrão no Next 15: reabrir uma conversa que você acabou
  // de ver refaz o round-trip inteiro ao servidor (RSC + Postgres) em vez de
  // reusar o que já foi buscado, mesmo com `prefetch` no Link. 30s é curto o
  // bastante para não esconder uma mensagem nova por muito tempo (ações como
  // enviar/arquivar já chamam `revalidatePath`, que invalida a entrada na
  // hora, independente deste valor) e longo o bastante para reabrir a mesma
  // conversa repetidas vezes ficar instantâneo.
  experimental: {
    staleTimes: { dynamic: 30 },
  },
  // RFC 8414/9728 exigem esses paths exatos na raiz do domínio. Em vez de uma
  // pasta de rota com nome iniciado por ponto (ambíguo entre bundlers/SO),
  // as rotas reais vivem em nomes convencionais e são expostas aqui.
  async rewrites() {
    return [
      {
        source: '/.well-known/oauth-authorization-server',
        destination: '/api/mcp/well-known/authorization-server',
      },
      {
        source: '/.well-known/oauth-protected-resource',
        destination: '/api/mcp/well-known/protected-resource',
      },
      // RFC 9728: o cliente tenta primeiro a URL com o caminho do recurso inserido.
      {
        source: '/.well-known/oauth-protected-resource/api/mcp',
        destination: '/api/mcp/well-known/protected-resource',
      },
    ];
  },
  // imapflow/mailparser usam charset/encoding com require() dinâmico
  // (iconv-lite, encoding-japanese) que o bundler do webpack não rastreia
  // corretamente — funcionam em dev por acidente, mas quebram em produção
  // sem isto (verificado no plano da Fase 7).
  serverExternalPackages: ['@prisma/client', '@node-rs/argon2', 'imapflow', 'mailparser'],
  // Fontes TTF da arte das imagens de conteúdo (`src/lib/content-images`),
  // lidas com fs em runtime — o tracing não enxerga um caminho montado a
  // partir de process.cwd(), então sem isto a função sobe sem as fontes.
  outputFileTracingIncludes: {
    // Fontes e o catálogo de mockups/prints da arte das imagens (lidos com fs).
    '/api/content/assets/*': ['./assets/fonts/*', './public/conteudo-midia/*'],
    // MCP remoto: `render_content_image` renderiza no próprio processo.
    '/api/mcp': ['./assets/fonts/*', './public/conteudo-midia/*'],
  },
  // Nossos pacotes usam imports ESM com extensão .js apontando p/ fontes .ts.
  // Ensina o resolver do webpack a tentar .ts/.tsx antes de .js.
  webpack: (config, { isServer, dev }) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    // A suíte Playwright (e2e/) grava traces/screenshots dentro do app enquanto
    // o `next dev` roda; sem isto cada arquivo novo dispara recompilação, e a
    // enxurrada de rebuilds corrompe a leitura dos manifests (`Unexpected end
    // of JSON input`, `Expected clientReferenceManifest`) e trava o login.
    if (dev) {
      const prev = config.watchOptions?.ignored;
      const prevList = Array.isArray(prev) ? prev : prev ? [prev] : [];
      // Watchpack não aceita array misturando RegExp e glob: o padrão do Next
      // (uma RegExp para node_modules/.git/.next) é reescrito aqui como glob.
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          ...prevList.filter((p) => typeof p === 'string'),
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/e2e/**',
          '**/.playwright-mcp/**',
        ],
      };
    }
    // Workaround oficial da Prisma: em monorepos, a Vercel às vezes não
    // inclui o binário da Query Engine no bundle serverless. Este plugin
    // garante que o engine certo seja copiado junto.
    //
    // Só no build de produção da Vercel: em `next dev` o plugin tenta copiar
    // `query_engine_bg.js` (arquivo que só existe no engine wasm) e derruba a
    // compilação de qualquer rota que toque o Prisma com ENOENT/500. E no
    // build standalone do desktop (`isDesktopBuild`) ele quebra por outro
    // motivo: faz `require.resolve('.prisma/client')` a partir do próprio
    // pacote do plugin, e no layout de node_modules deste pnpm monorepo isso
    // nunca resolve fora do ambiente da Vercel (`Cannot find module
    // '.prisma/client'`, mesmo com o client já gerado). O plugin existe pra
    // compensar uma limitação específica do bundler serverless da Vercel —
    // no build standalone o próprio file-tracing do Next já inclui o engine
    // certo (gerado localmente, nativo pra esta máquina), então não precisa
    // dele. Pelo mesmo motivo, fica fora de qualquer build que não seja o da
    // Vercel (`VERCEL=1` é variável de sistema dela no build) — o e2e do CI
    // roda sobre `next build` num runner comum desde a Fase 2 do redesign.
    if (isServer && process.env.NODE_ENV === 'production' && process.env.VERCEL === '1' && !isDesktopBuild) {
      config.plugins = [...config.plugins, new PrismaPlugin()];
    }
    // `@app/core` é transpilado (fonte TS), então o webpack segue os imports
    // dele e tenta empacotar o binário nativo do argon2 (.node) — falha com
    // "Module parse failed". `serverExternalPackages` não alcança imports
    // originados dentro de pacotes transpilados; aqui vira require() em runtime.
    if (isServer) {
      config.externals = [
        ...(config.externals ?? []),
        { '@node-rs/argon2': 'commonjs @node-rs/argon2' },
      ];
    }
    return config;
  },
};

export default nextConfig;
