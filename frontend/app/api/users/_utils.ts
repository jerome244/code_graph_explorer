export const ACCESS = process.env.JWT_ACCESS_COOKIE || "access_token";
export const REFRESH = process.env.JWT_REFRESH_COOKIE || "refresh_token";
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;
export const COOKIE_SECURE = String(process.env.JWT_SECURE_COOKIES || "false") === "true";

export function cookieOptions(maxAgeSeconds?: number) {
  return {
    httpOnly: true as const,
    secure: COOKIE_SECURE,
    sameSite: "lax" as const,
    path: "/",
    ...(typeof maxAgeSeconds === "number" ? { maxAge: maxAgeSeconds } : {}),
  };
}
