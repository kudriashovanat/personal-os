export { default } from "next-auth/middleware";

// Защищаем всё, кроме страницы входа, эндпоинтов NextAuth и статики
export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
