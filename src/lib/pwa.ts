export const PRODUCTION_URL = "https://nossodinheiro-xi.vercel.app";
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "development";
export type MobilePlatform = "ios" | "android" | "other";

export function mobilePlatform(
  userAgent: string,
  touchPoints: number,
): MobilePlatform {
  if (
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && touchPoints > 1)
  )
    return "ios";
  return /Android/i.test(userAgent) ? "android" : "other";
}

export function versionFromResponse(value: unknown): string | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("app" in value) ||
    value.app !== "nosso-dinheiro" ||
    !("version" in value)
  )
    return null;
  return typeof value.version === "string" &&
    /^[a-zA-Z0-9._:-]{1,100}$/.test(value.version)
    ? value.version
    : null;
}

export function canApplyUpdate(
  current: string,
  available: string | null,
  blocked: boolean,
  visible: boolean,
  online: boolean,
) {
  return Boolean(
    available && available !== current && !blocked && visible && online,
  );
}
