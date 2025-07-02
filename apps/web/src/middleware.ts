import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define as rotas que devem ser acessíveis publicamente (não requerem autenticação)
const isPublicRoute = createRouteMatcher([
  '/', // Página inicial
  '/sign-in(.*)', // Rotas de sign-in e suas sub-rotas
  '/sign-up(.*)', // Rotas de sign-up e suas sub-rotas
  '/api/webhooks/assinafy(.*)', // Webhook para Assinafy (segurança via verificação de assinatura interna)
  '/api/webhooks/clerk(.*)', // Webhooks do próprio Clerk, se configurados
  // Adicione aqui outras rotas públicas, como '/portal(.*)' se tiver um portal público,
  // ou rotas de API específicas que precisam ser públicas.
]);

// Define as rotas que devem ser ignoradas pelo middleware do Clerk (geralmente arquivos estáticos)
// O matcher em `config` já lida com a maioria dos arquivos estáticos, mas pode ser útil para casos específicos.
// const isIgnoredRoute = createRouteMatcher([
//   '/ignored-route(.*)',
// ]);

export default clerkMiddleware((auth, req) => {
  // Se a rota não for pública, protege-a.
  if (!isPublicRoute(req)) {
    auth().protect();
  }
  // Se você tivesse ignoredRoutes, poderia fazer:
  // if (isIgnoredRoute(req)) {
  //   return NextResponse.next();
  // }
  // if (!isPublicRoute(req)) {
  //   auth().protect();
  // }
});

export const config = {
  // O matcher ajuda a evitar que o middleware rode em caminhos de arquivos estáticos desnecessariamente.
  // Este matcher é uma recomendação comum do Clerk.
  matcher: [
    '/((?!.*\\..*|_next).*)', // Não roda em arquivos com extensão (ex: .png, .css) ou em _next
    '/',                       // Roda na página inicial
    '/(api|trpc)(.*)',         // Roda em todas as rotas de API e TRPC
],
};
