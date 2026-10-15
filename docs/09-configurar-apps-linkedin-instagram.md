# Redes sociais: configuração 

Passo a passo do que precisa ser feito **fora do código** para o CRM publicar
nas redes. O código está pronto para o LinkedIn (Etapa 3) e o Instagram
(Etapa 4).

Enquanto `SOCIAL_PUBLISH` não for `live`, nada sai de verdade: aprovar marca o
post como "publicado em simulação". A ordem segura é: conectar a conta,
aprovar um post de teste em simulação, e só então ligar o `live`.

## LinkedIn (perfil pessoal)

### 1. Criar o app no LinkedIn Developers

1. Entre em <https://www.linkedin.com/developers/apps> com a sua conta e clique
   em **Create app**.
2. Preencha nome (ex.: "CRM"), a **página da empresa no LinkedIn** (todo app
   precisa estar ligado a uma página) e o logo. Aceite os termos.
3. O LinkedIn pede que um admin da página **verifique** o vínculo (aba
   *Settings* → *Verify*). Se você é admin da página, é só abrir o link que
   ele gera e confirmar.

### 2. Ativar os produtos

Na aba **Products**, peça acesso a:

- **Sign In with LinkedIn using OpenID Connect**: o CRM descobre de qual
  perfil é a conta.
- **Share on LinkedIn**: o CRM publica no seu perfil (`w_member_social`).

Os dois costumam ser liberados na hora. Publicar como **página da empresa**
exige outro produto (Community Management API), que passa por análise do
LinkedIn. O código já suporta, mas fica para depois.

### 3. Cadastrar o redirect URL

Na aba **Auth**, em *OAuth 2.0 settings* → *Authorized redirect URLs*,
adicione exatamente (sem barra no fim):

```
https://app.example.com/api/social/linkedin/callback
```

Se o CRM rodar em outro domínio, troque o começo pelo valor de `AUTH_URL` da
Vercel. Tem que bater letra por letra, senão o LinkedIn recusa com
"redirect_uri does not match".

### 4. Variáveis na Vercel

Na mesma aba **Auth** estão o *Client ID* e o *Client Secret*. Na Vercel
(projeto do CRM → Settings → Environment Variables, ambiente Production):

| Variável | Valor |
|---|---|
| `LINKEDIN_CLIENT_ID` | Client ID do app |
| `LINKEDIN_CLIENT_SECRET` | Client Secret do app |
| `SOCIAL_PUBLISH` | deixe **sem valor** (ou `log`) até o teste do passo 6 |

`LINKEDIN_API_VERSION` é opcional: por padrão o CRM usa a versão de dois meses
atrás, que está sempre publicada e dentro do suporte.

Nada disso vai para o `.mcp.json`: o Claude cria e agenda posts pelo MCP, mas
quem conecta e publica é o próprio CRM.

### 5. Deploy e conexão

1. `npx vercel --prod` depois do merge (as variáveis só valem num deploy novo).
2. Abra `/settings/social` e clique em **Conectar LinkedIn**. Autorize no
   LinkedIn; você volta para a mesma tela com a conta listada e a validade do
   acesso (cerca de 60 dias).

### 6. Teste em simulação e virada para valer

1. Com `SOCIAL_PUBLISH` ainda sem valor, peça ao Claude um post de teste, ou
   crie um em `/social/novo`, e aprove. Ele aparece como publicado em
   simulação, sem ir para o LinkedIn.
2. Quando quiser publicar de verdade, ponha `SOCIAL_PUBLISH=live` na Vercel e
   faça um deploy. A partir daí, só o que você aprovar em `/social` vai ao ar.

### Manutenção

- O acesso dura cerca de **60 dias** e o LinkedIn não deixa renovar sozinho
  (sem programa de parceiros). O resumo diário avisa a partir de 7 dias antes;
  basta clicar em **Conectar ou renovar** em `/settings/social`.
- Se o acesso vencer ou for revogado, a conta aparece como desconectada e os
  posts aprovados ficam "Com erro" pedindo para reconectar. Depois de
  reconectar, use "Tentar de novo" em cada um.

## Instagram (conta Profissional)

O CRM usa a **Instagram API com login do Instagram**: não precisa de página do
Facebook, mas a conta tem que ser **Profissional** (Empresa ou Criador).

### 1. Conta Profissional

No app do Instagram: *Configurações → Tipo de conta e ferramentas → Mudar para
conta profissional*. Escolha **Empresa**.

### 2. Criar o app na Meta

1. Entre em <https://developers.facebook.com/apps> e clique em **Create app**.
2. No caso de uso, escolha o de gerenciar mensagens e conteúdo no Instagram
   (*Instagram API*).
3. Em **API setup with Instagram login**, abra **Set up Instagram business
   login** e cadastre o redirect URL exatamente:

```
https://app.example.com/api/social/instagram/callback
```

4. Na mesma tela estão o **Instagram app ID** e o **Instagram app secret**
   (diferentes do ID do app da Meta).

O app pode ficar em **modo de desenvolvimento**: para publicar só na conta da
empresa, quem tem papel no app não precisa de revisão da Meta. Se a conexão
recusar a conta, adicione o Instagram da empresa como testador em *App roles*.

### 3. Variáveis na Vercel

| Variável | Valor |
|---|---|
| `INSTAGRAM_APP_ID` | Instagram app ID |
| `INSTAGRAM_APP_SECRET` | Instagram app secret |

`INSTAGRAM_API_VERSION` é opcional (padrão `v25.0`, a dos exemplos da
documentação em out/2026).

### 4. Conectar

Deploy novo, depois `/settings/social` → **Conectar Instagram**. O CRM recusa
conta pessoal e conexão sem a permissão de publicar.

### Manutenção

- O acesso dura cerca de **60 dias**, mas o CRM **renova sozinho** a cada
  rodada do cron de publicação quando faltam menos de 10 dias. Se a renovação
  falhar, o erro aparece na conta e o resumo diário avisa a 7 dias do fim.
- Todo post do Instagram precisa de ao menos 1 imagem JPEG (até 10 no
  carrossel), entre 4:5 e 1,91:1. Os modelos `ig-*` de `/conteudo/imagens` já
  saem certos (1080×1350).
- Limite do Instagram: 100 publicações por API a cada 24 h. O CRM consulta a
  cota antes de publicar.

## Métricas (painel de desempenho)

O painel em **Redes sociais → Desempenho** só mostra o que cada rede deixa
ler por API. As permissões de publicar não chegam para tudo. O que falta a
cada conta aparece em **Configurações → Redes sociais** e no botão "Métricas
incompletas" do painel.

| Rede e conta | Com as permissões de hoje | Com a permissão extra |
|---|---|---|
| Instagram (conta Profissional) | Gostos, comentários, seguidores | Visualizações (impressões), alcance, partilhas, guardados |
| LinkedIn (perfil pessoal) | Nada | Impressões, alcance, reações, comentários, partilhas, seguidores |
| LinkedIn (página de empresa, se um dia for ligada) | Nada | Impressões, alcance, cliques, reações, comentários, partilhas, seguidores |

Nenhuma rede dá "guardados" no LinkedIn nem cliques por post no Instagram ou
em post de perfil pessoal do LinkedIn. Esses campos ficam com "–".

### Instagram: `instagram_business_manage_insights`

1. Em <https://developers.facebook.com/apps>, abra o app do CRM.
2. **Casos de uso → Instagram → Personalizar → Permissões e recursos**.
3. Em `instagram_business_manage_insights`, clique **Adicionar**.
4. Enquanto o app estiver em modo de desenvolvimento e a conta `@empresa`
   for testadora do app (já é, foi assim que a publicação foi ligada), não é
   preciso revisão da Meta.
5. No CRM, em **Configurações → Redes sociais**, clique em **reconectar com
   permissões de métricas** na secção do Instagram e aceite todas as
   permissões no ecrã do Instagram.
6. A linha da conta passa a dizer "Métricas: completas". Em **Desempenho**,
   clique em **Atualizar métricas**.

### LinkedIn (perfil pessoal): `r_member_postAnalytics` e `r_member_profileAnalytics`

Estas duas permissões fazem parte do produto **Community Management API**,
que o LinkedIn só dá depois de aprovar um pedido.

1. Em <https://www.linkedin.com/developers/apps>, abra o app do CRM, separador
   **Products**.
2. Em **Community Management API**, clique **Request access** e preencha o
   formulário (uso: ler as estatísticas dos posts do próprio perfil num CRM
   interno). O nível "Development" chega.
3. O LinkedIn pode exigir que este produto fique sozinho num app. Se o botão
   aparecer bloqueado por causa dos produtos "Share on LinkedIn" e "Sign In
   with LinkedIn", o pedido tem de ser feito num **app novo** da mesma página
   de empresa. O CRM aceita esse segundo app para a **Página** (secção
   seguinte); as métricas do **perfil pessoal** por um segundo app ainda não
   são suportadas.
4. Com o produto aprovado no mesmo app: no separador **Auth**, confirme que
   `r_member_postAnalytics` e `r_member_profileAnalytics` aparecem em "OAuth
   2.0 scopes".
5. No CRM, em **Configurações → Redes sociais**, clique em **reconectar com
   permissões de métricas** na secção do LinkedIn.

A leitura de métricas do LinkedIn foi escrita pela documentação oficial e
testada com respostas de exemplo. Nunca correu contra a API real, porque a
conta ainda não tem estas permissões. Na primeira recolha, se algum número
vier vazio, o erro fica visível no detalhe do post.

### LinkedIn (Página da empresa): publicar e medir

A Página publica como `urn:li:organization:<id>` e dá métricas por post
(impressões, alcance, cliques, reações, comentários, partilhas). Fica ao lado
do perfil pessoal em **Configurações → Redes sociais**, como outra conta.

1. Confirme que você é **super admin** da Página da empresa (na Página:
   *Ferramentas de administrador → Gerenciar administradores*).
2. Peça a **Community Management API** (passo 2 da secção acima). Se o
   LinkedIn exigir um app só para ela:
   - crie um app novo em <https://www.linkedin.com/developers/apps>, ligado à
     Página da empresa, e em **Settings → Verify** aprove a verificação como
     super admin;
   - cadastre o mesmo redirect URL
     (`https://app.example.com/api/social/linkedin/callback`);
   - peça a Community Management API nesse app;
   - na Vercel, crie `LINKEDIN_PAGES_CLIENT_ID` e `LINKEDIN_PAGES_CLIENT_SECRET`
     com o Client ID/Secret dele e faça um deploy.
3. No separador **Auth** do app, confirme que aparecem `r_organization_social`,
   `w_organization_social` e `rw_organization_admin`.
4. No CRM, **Conectar Página do LinkedIn**. Com as envs das Páginas, o CRM usa
   o app novo e pede só as permissões de Página; o perfil pessoal continua
   ligado pelo app de sempre, com o token dele. Sem elas, usa o app de sempre.
5. O acesso dura ~60 dias, sem renovação automática: clique de novo em
   **Conectar Página do LinkedIn** para renovar (o resumo diário avisa).

### Se "reconectar com permissões de métricas" der erro

A rede recusa o pedido quando o app ainda não tem a permissão. A conta que
já estava ligada não é afetada: continua a publicar como antes. Volte ao
passo do app e tente de novo.

### Recolha

O CRM recolhe sozinho (`/api/cron/social-metrics`): de hora a hora nas
primeiras 48 horas de cada post, uma vez por dia até aos 30 dias e uma vez
por semana até aos 180. Seguidores, uma vez por dia. O botão **Atualizar
métricas** do painel recolhe na hora. Cada recolha fica guardada com data, e
é esse histórico que alimenta os gráficos.
