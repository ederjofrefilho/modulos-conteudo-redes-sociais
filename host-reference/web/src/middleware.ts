import { NextResponse, type NextRequest } from 'next/server';

const AUTHJS_COOKIE = 'authjs.session-token';
const AUTHJS_COOKIE_SECURE = `__Secure-${AUTHJS_COOKIE}`;

/**
 * Protege as rotas do app. Roda no runtime Edge e NÃO pode consultar o
 * Postgres para validar a sessão de banco — aqui é só um gate OTIMISTA
 * (presença do cookie). A autorização real acontece em requireCtx()/getCtx()
 * (runtime Node), em (app)/layout.tsx e em cada server action/route handler.
 */
/**
 * `meet.example.com` é este mesmo app: o subdomínio mostra só a plataforma
 * de reuniões. `/<caminho>` vira `/meet/<caminho>` (as páginas públicas);
 * `/api/*` e os estáticos passam como estão. Nada do CRM (login, fichas) é
 * alcançável por este host — qualquer outro caminho cai nas rotas de `/meet`.
 */
function isMeetHost(req: NextRequest): boolean {
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(':')[0]!.toLowerCase();
  return host.startsWith('meet.') || (!!process.env.MEET_HOST && host === process.env.MEET_HOST.toLowerCase());
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isMeetHost(req)) {
    // Neste host só existem as rotas públicas da plataforma: a API dela e as páginas.
    if (pathname.startsWith('/api/')) {
      if (pathname.startsWith('/api/meet')) return NextResponse.next();
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }
    const url = req.nextUrl.clone();
    url.pathname = pathname === '/meet' || pathname.startsWith('/meet/') ? pathname : `/meet${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(url);
  }

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/convite') ||
    // Self-service "esqueci minha senha" (24/08/2026) — mesma categoria do
    // /login e /convite: quem chega aqui ainda não tem (ou perdeu) a sessão,
    // então não pode exigir cookie.
    pathname.startsWith('/esqueci-senha') ||
    pathname.startsWith('/redefinir-senha') ||
    pathname.startsWith('/api/auth') ||
    // O cron/agendador externo não tem sessão de navegador — autentica com o
    // header Bearer $CRON_SECRET, checado dentro da própria rota. Esquecer
    // este bypass é o erro mais fácil de cometer aqui: sem ele, todo disparo
    // do cron toma 401 e o sync de e-mail nunca roda, silenciosamente.
    pathname.startsWith('/api/cron') ||
    // Manifesto do auto-updater do app de desktop (Tauri) — quem chama é o
    // app rodando na máquina do usuário, ainda nem logado no CRM quando
    // checa por atualização; não tem cookie de sessão nem faz sentido pedir
    // um. Mesma categoria do bypass de cron acima: esquecer isto faz a rota
    // devolver um redirect HTML pro /login em vez do JSON do manifesto, e o
    // updater do Tauri trata isso como "nenhuma atualização" — falha muda,
    // sem sinal nenhum de que a rota está inacessível.
    pathname.startsWith('/desktop/updates') ||
    // Feed .ics da agenda (Fase 4): quem assina é o app de agenda do celular
    // ou o Google Agenda — sem cookie nem Bearer; o segredo é o token na URL,
    // checado dentro da rota. Esquecer isto devolve o HTML do /login e o
    // calendário assinado fica vazio, sem erro nenhum.
    pathname.startsWith('/api/calendar/feed') ||
    // Descadastro da prospecção (P0): quem clica é o destinatário de um e-mail
    // frio, nunca um usuário logado; e o one-click do List-Unsubscribe é um
    // POST do próprio Gmail/Yahoo, sem cookie nem Bearer. O segredo é o token
    // assinado, checado na rota. Esquecer isto manda o prospect para o /login
    // e o one-click falha em silêncio, o que conta contra a reputação da caixa.
    pathname.startsWith('/descadastro') ||
    pathname.startsWith('/api/unsubscribe') ||
    // Webhook do WhatsApp (Cloud API da Meta): quem chama são os servidores da
    // Meta, sem cookie nem Bearer. O GET de verificação confere o verify token
    // e o POST a assinatura X-Hub-Signature-256, dentro da rota. Mesma
    // pegadinha do /api/cron: sem isto a Meta recebe o 401 e desiste do
    // webhook, e nenhuma mensagem chega ao CRM, sem erro nenhum na tela.
    pathname.startsWith('/api/webhooks/whatsapp') ||
    // Plataforma de reuniões (meet.example.com): páginas de agendamento,
    // salas e a API delas são para visitantes sem conta — e o webhook do
    // servidor de mídia chega assinado, sem cookie. A proteção é por rota
    // (rate limit, captcha próprio, token de gerir, par id/chave da sala).
    // Mesma pegadinha do /api/cron: sem isto o visitante cai no /login.
    pathname === '/meet' ||
    pathname.startsWith('/meet/') ||
    pathname.startsWith('/api/meet') ||
    // MCP remoto (conector OAuth do Claude): metadata pública (RFC 8414/9728),
    // registro dinâmico de client (RFC 7591) e o endpoint de token não têm
    // cookie de sessão NEM header Bearer — quem chama é o client OAuth (o
    // Claude), não um navegador logado. `/api/mcp` (dados) e `/oauth/authorize`
    // (tela de consentimento) NÃO entram aqui de propósito: o primeiro já
    // passa pelo bypass de Bearer logo abaixo; o segundo precisa continuar
    // exigindo sessão (é o próprio ponto de login/consentimento).
    pathname.startsWith('/.well-known/oauth') ||
    pathname.startsWith('/api/mcp/oauth/register') ||
    pathname.startsWith('/api/mcp/oauth/token') ||
    // O próprio `/api/mcp` SEM token também passa: a rota responde 401 com
    // `WWW-Authenticate: Bearer resource_metadata=...`, que é como o cliente
    // OAuth descobre onde autorizar. O 401 genérico daqui não tem esse
    // cabeçalho, e o conector do Claude parava aí sem nunca abrir o login
    // (14/10/2026). A rota valida o token de verdade.
    pathname === '/api/mcp'
  ) {
    return NextResponse.next();
  }

  const hasCookie = req.cookies.has(AUTHJS_COOKIE) || req.cookies.has(AUTHJS_COOKIE_SECURE);
  if (hasCookie) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    // Rotas de API também aceitam Authorization: Bearer <ApiToken> (Fase 8) —
    // sem sessão de navegador. O gate aqui é só otimista (presença do
    // header); requireCtx() valida o token de verdade contra o banco.
    if (req.headers.get('authorization')?.startsWith('Bearer ')) return NextResponse.next();
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  return redirectToLogin(req);
}

function redirectToLogin(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  // Só aceita destinos internos (path começando com uma única "/") — evita
  // open redirect via "//evil.com" ou "https://evil.com" no parâmetro `next`.
  // Preserva a querystring original (não só o pathname) — necessário pro
  // fluxo de consentimento OAuth (/oauth/authorize?client_id=...), que
  // precisa voltar com client_id/redirect_uri/code_challenge/state intactos
  // depois do login.
  if (pathname !== '/' && pathname.startsWith('/') && !pathname.startsWith('//')) {
    url.searchParams.set('next', pathname + req.nextUrl.search);
  }
  return NextResponse.redirect(url);
}

export const config = {
  // Tudo, exceto estáticos do Next, favicon/ícones e assets públicos
  // (/brand/*, imagens, fontes) — sem isto, o próprio otimizador de imagem
  // do Next (que lê arquivos de public/ via uma requisição interna) recebe
  // o redirect para /login no lugar do arquivo e devolve "imagem inválida".
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|apple-icon.png|icon.png|brand/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)',
  ],
};
