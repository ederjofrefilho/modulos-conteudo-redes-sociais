# Personalizar com a sua marca

O código veio de um sistema em produção. Nomes de pessoas, domínios e a marca original foram
trocados por marcadores neutros (`empresa`, `marca`, `example.com`, "SUA LOGO"). Esta é a lista de
sítios onde pôr os seus.

## 1. Imagens da marca (modelos de imagem)

Pasta `web/public/conteudo-midia/` — hoje só tem **marcadores** com os tamanhos certos. Substitua
mantendo o nome do ficheiro (ou altere também o catálogo, ponto 2):

| Ficheiro | O que pôr | Formato |
|---|---|---|
| `logo-preto.png` | Logo colorida para fundos claros | PNG transparente, 640×310 (mesma proporção) |
| `logo-branco.png` | Logo colorida para fundos escuros | idem |
| `logo-preto-mono.png`, `logo-branco-mono.png` | Logo numa só cor (preta / branca) | idem |
| `mockup-*.png` | Aparelhos com o seu produto/site | PNG transparente |
| `print-*.jpg` | Prints de painéis/telas | JPG |
| `foto-*.jpg` | Fotos da marca | JPG |
| `miniaturas/*.jpg` | Miniatura de cada item acima (360 px no lado maior) | JPG |

## 2. Catálogo de mídia, cores e tipografia

`modules/content/src/images/templates.ts`:
- `BRAND_MEDIA` — um item por imagem da pasta acima (`id`, `label`, `kind`, `file`, `description`).
  A `description` é lida pelo agente de IA para escolher a imagem: descreva o que a imagem mostra.
  Item novo = ficheiro + miniatura + entrada aqui.
- `IMAGE_PALETTE` — cores usadas pelos modelos (o desenho não lê variáveis CSS).
- Campo `url` do modelo `social-cta`: o placeholder `Ex.: example.com`.

Tipografia: `web/assets/fonts/` (IBM Plex Sans/Mono e Inter, licença OFL) e
`web/src/lib/content-images/fonts.ts`. O desenho de cada modelo está em
`web/src/lib/content-images/art*.tsx`.

## 3. Domínio do site

| Onde | O que é |
|---|---|
| `web/src/components/content/ContentRowActionsMenu.tsx` (linha ~91) | Link "ver no site" de um artigo publicado. |
| `web/src/components/content/PostSettingsDrawer.tsx` (linhas ~60 e ~154) | Prévia do endereço e do resultado de pesquisa. |
| `web/src/components/social/ComposerVariantFields.tsx` (linha ~107) | Placeholder do link de um post. |
| Variáveis `SITE_REVALIDATE_URL`, `SITE_REVALIDATE_SECRET`, `SITE_PREVIEW_SECRET` | Integração com o site (ver `docs/07`). |
| `docs/09-configurar-apps-linkedin-instagram.md`, `host-reference/github/cron-email.yml` | `app.example.com` = endereço da sua aplicação. |

## 4. Textos de tela

As contas partilhadas aparecem como "conta da empresa" / "Página da empresa" / "Instagram da empresa".
Para usar o nome da sua empresa, procure por `da empresa` em `web/src` e `modules/social/src`.
O título das imagens geradas no blog termina em `· Marca` (comentário em `modules/content/src/posts.ts`).
O PDF do carrossel do LinkedIn é marcado como criado por `CRM` (`modules/social/src/providers/linkedin-pdf.ts`).

## 5. Fuso horário e idioma

- `REPORT_TIMEZONE = 'America/Sao_Paulo'` em `modules/social/src/metrics/analyze.ts` (painel: dias e
  melhores horários) e `toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })` em
  `modules/social/src/posts.ts`.
- Textos em português do Brasil, com algumas mensagens em português europeu.

## 6. Nomes técnicos

- Escopo dos pacotes: `@app/*` (`@app/content`, `@app/social`, `@app/content-contract`; o host fornece `@app/core` e `@app/db`).
- Cookies do OAuth: `app_social_oauth_state`, `app_social_flash` (`web/src/lib/social-oauth.ts`).
- Nome do store do Vercel Blob nas mensagens de erro: `content`.
