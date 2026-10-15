# Módulos de Conteúdo e Redes Sociais (extraídos do sistema original)

Este repositório contém **apenas** dois módulos do sistema original, separados para serem
entregues e integrados noutro projeto:

| Módulo | Pacote | O que faz |
|---|---|---|
| **Criação de conteúdo** | `@app/content` (+ `@app/content-contract`) | Artigos de blog e casos de sucesso (editor de blocos, SEO, agendamento, publicação para um site), biblioteca de mídia, **gerador de imagens por modelos** (capas, slides de carrossel, números, citações, CTA) e importação de vídeo. |
| **Publicação nas redes sociais** | `@app/social` | Contas LinkedIn/Instagram por utilizador, posts com aprovação humana, validação por rede, **publicação automática no horário** (imagem, carrossel, vídeo), sincronização das publicações feitas fora do sistema, métricas e painel de desempenho. |

Os dois andam juntos porque as publicações sociais usam a mídia criada no
módulo de conteúdo (`SocialPost.mediaAssetIds` → `ContentAsset`) e podem
nascer de um artigo (`SocialPost.sourceContentPostId` → `ContentPost`).

> Os ficheiros vieram de um sistema em produção e foram copiados sem alterações de lógica; nomes,
> domínios e imagens da marca original foram trocados por marcadores neutros. Para pôr a sua marca,
> veja [`PERSONALIZAR.md`](PERSONALIZAR.md). Não contém credenciais.

## Por onde começar

1. [`docs/01-visao-geral.md`](docs/01-visao-geral.md) — arquitetura, camadas e o que é módulo vs. o que é do projeto host.
2. [`docs/02-modulo-conteudo.md`](docs/02-modulo-conteudo.md) — `@app/content` em detalhe.
3. [`docs/03-modulo-redes-sociais.md`](docs/03-modulo-redes-sociais.md) — `@app/social` em detalhe.
4. [`docs/04-modelo-de-dados.md`](docs/04-modelo-de-dados.md) — tabelas, enums, relações e SQL.
5. [`docs/05-contrato-com-o-host.md`](docs/05-contrato-com-o-host.md) — **tudo o que o projeto destino tem de fornecer** (lista fechada).
6. [`docs/06-rotas-cron-e-mcp.md`](docs/06-rotas-cron-e-mcp.md) — telas, rotas HTTP, crons e tools MCP.
7. [`docs/07-configuracao-e-variaveis.md`](docs/07-configuracao-e-variaveis.md) — variáveis de ambiente, apps no LinkedIn/Instagram, armazenamento.
8. [`docs/08-integracao-passo-a-passo.md`](docs/08-integracao-passo-a-passo.md) — roteiro para pôr os módulos a funcionar no projeto novo.
9. [`docs/09-configurar-apps-linkedin-instagram.md`](docs/09-configurar-apps-linkedin-instagram.md) — criar os apps das redes, produtos e permissões.
10. [`PERSONALIZAR.md`](PERSONALIZAR.md) — onde pôr a sua marca, domínio e imagens.
11. [`MANIFESTO.md`](MANIFESTO.md) — de onde veio cada ficheiro.

## Estrutura deste repositório

```
modules/
  content/                 @app/content   — regras de negócio do conteúdo (servidor)
  social/                  @app/social    — regras de negócio das redes sociais (servidor)
packages/
  content-contract/        @app/content-contract — esquema zod dos blocos (puro, roda no navegador)
web/                       Camada Next.js 15 (App Router) — telas, rotas HTTP, crons e adaptadores
  src/app/(app)/conteudo   Telas de conteúdo (lista, editor, gerador de imagens)
  src/app/(app)/social     Telas de redes sociais (fila/calendário, composer, desempenho)
  src/app/(app)/settings/social   Contas ligadas e permissões
  src/app/api/content|social|cron/...   Rotas HTTP e crons
  src/components/content|social         Componentes de UI dos dois módulos
  src/lib/content-images, ...           Adaptadores (next/og, sharp, Vercel Blob)
  public/conteudo-midia, assets/fonts   Mockups, prints, logos e fontes usados pelos modelos de imagem
mcp/src/tools/             Tools MCP (content.ts, content-images.ts, social.ts)
prisma/
  social-content.prisma    Modelos e enums dos módulos (verbatim do schema original)
  host-required.prisma     O mínimo que os módulos esperam do banco do host
  migration-consolidada.sql  SQL das tabelas, na ordem em que foram criadas
  migrations-originais/    As migrations originais que tocaram estas tabelas
host-reference/            NÃO faz parte dos módulos: cópia do código do sistema original
                           de que os módulos dependem (core, UI base, MCP util),
                           para consulta ou para usar como ponto de partida
docs/                      Documentação técnica (09 = como criar os apps no LinkedIn e na Meta)
```

## O que NÃO veio (de propósito)

- O resto do CRM (contas, contatos, negócios, e-mail, agenda, reuniões, anúncios, WhatsApp, prospecção).
- Autenticação, sessão e tokens de API do CRM: os módulos recebem um `Ctx` pronto (ver contrato).
- O design system completo do CRM: os componentes de UI base usados estão em `host-reference/web`, só para referência.
- Segredos de qualquer tipo. Nenhuma credencial está neste repositório; as variáveis estão descritas em `docs/07`.
