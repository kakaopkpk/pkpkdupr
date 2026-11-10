import { randomUUID } from "crypto";

export const AVATAR_BUCKET = "avatars";
// 버킷 file_size_limit(supabase/migrations/20261110020000_avatars_storage_bucket.sql)과 같은 값을 유지한다.
export const AVATAR_MAX_BYTES = 1024 * 1024;
const AVATAR_MIME_TO_EXT: Record<string, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const PUBLIC_OBJECT_PATH_PREFIX = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
// 경로가 추측 불가하고 내용이 바뀌지 않으므로(교체 시 새 경로) 브라우저·CDN이 오래 캐시해도 된다.
const AVATAR_CACHE_CONTROL = "max-age=31536000";

export class AvatarValidationError extends Error {}

export class AvatarStorageError extends Error {}

export type ParsedAvatar = {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
  ext: "jpg" | "png" | "webp";
};

export const parseAvatarDataUrl = (value: unknown): ParsedAvatar => {
  if (typeof value !== "string") {
    throw new AvatarValidationError("이미지 데이터가 필요합니다.");
  }

  const match = value.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match) {
    throw new AvatarValidationError("지원하지 않는 이미지 형식입니다.");
  }

  const [, mime, base64] = match;
  const ext = AVATAR_MIME_TO_EXT[mime];
  if (!ext) {
    throw new AvatarValidationError("지원하지 않는 이미지 형식입니다.");
  }

  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (!bytes.length) {
    throw new AvatarValidationError("이미지 데이터가 비어 있습니다.");
  }

  if (bytes.length > AVATAR_MAX_BYTES) {
    throw new AvatarValidationError(
      "프로필 이미지는 1MB 이하만 업로드할 수 있습니다.",
    );
  }

  return { bytes, mime, ext };
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

/**
 * Storage 접속 설정. Edge Function에는 Supabase가 SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY를 주입하고,
 * 로컬 Node api는 `pnpm dev`(scripts/dev-app.sh)가 로컬 스택 값을 넣는다.
 * 함수 내부의 SUPABASE_URL은 브라우저가 접근할 수 없는 주소일 수 있어(로컬 `functions serve`의 http://kong:8000)
 * 공개 URL의 base는 STORAGE_PUBLIC_URL로 덮어쓸 수 있다.
 */
const getStorageConfig = () => {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    throw new AvatarStorageError(
      "아바타 저장소가 설정되지 않았습니다. SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 확인하세요.",
    );
  }

  return {
    url: trimTrailingSlash(url),
    serviceKey,
    publicUrl: trimTrailingSlash(process.env.STORAGE_PUBLIC_URL?.trim() || url),
  };
};

const buildAuthHeaders = (serviceKey: string): Record<string, string> => {
  // 새 형식의 secret key(sb_secret_...)는 JWT가 아니므로 apikey 헤더로만 보낸다.
  if (serviceKey.startsWith("sb_")) {
    return { apikey: serviceKey };
  }
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
};

const encodeObjectPath = (objectPath: string) =>
  objectPath.split("/").map(encodeURIComponent).join("/");

const readErrorBody = async (response: Response) =>
  (await response.text().catch(() => "")).slice(0, 300);

/** 아바타 객체 경로 규칙: avatars 버킷 안의 `<playerId>/<uuid>.<ext>` */
export const buildAvatarObjectPath = (playerId: string, ext: string) =>
  `${playerId}/${randomUUID()}.${ext}`;

export const buildAvatarPublicUrl = (objectPath: string) =>
  `${getStorageConfig().publicUrl}${PUBLIC_OBJECT_PATH_PREFIX}${encodeObjectPath(objectPath)}`;

/**
 * players.avatar_url에서 이 플레이어 소유의 Storage 객체 경로를 꺼낸다.
 * 다른 플레이어의 경로나 Storage 공개 URL이 아닌 값이면 null을 돌려 삭제 대상에서 제외한다.
 */
export const getOwnedAvatarObjectPath = (
  playerId: string,
  avatarUrl?: string | null,
): string | null => {
  if (!avatarUrl) {
    return null;
  }

  let pathname: string;
  try {
    pathname = new URL(avatarUrl).pathname;
  } catch {
    return null;
  }

  if (!pathname.startsWith(PUBLIC_OBJECT_PATH_PREFIX)) {
    return null;
  }

  let objectPath: string;
  try {
    objectPath = decodeURIComponent(
      pathname.slice(PUBLIC_OBJECT_PATH_PREFIX.length),
    );
  } catch {
    return null;
  }

  const [owner, fileName, ...rest] = objectPath.split("/");
  if (
    owner !== playerId ||
    !fileName ||
    rest.length > 0 ||
    fileName === "." ||
    fileName === ".."
  ) {
    return null;
  }

  return objectPath;
};

export const uploadAvatarObject = async (
  objectPath: string,
  avatar: ParsedAvatar,
) => {
  const { url, serviceKey } = getStorageConfig();
  const response = await fetch(
    `${url}/storage/v1/object/${AVATAR_BUCKET}/${encodeObjectPath(objectPath)}`,
    {
      method: "POST",
      headers: {
        ...buildAuthHeaders(serviceKey),
        "Content-Type": avatar.mime,
        "cache-control": AVATAR_CACHE_CONTROL,
        "x-upsert": "false",
      },
      body: avatar.bytes,
    },
  );

  if (!response.ok) {
    throw new AvatarStorageError(
      `아바타 업로드에 실패했습니다. (${response.status}) ${await readErrorBody(response)}`.trim(),
    );
  }
};

export const deleteAvatarObject = async (objectPath: string) => {
  const { url, serviceKey } = getStorageConfig();
  const response = await fetch(
    `${url}/storage/v1/object/${AVATAR_BUCKET}/${encodeObjectPath(objectPath)}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(serviceKey),
    },
  );

  // 이미 없는 객체는 삭제된 것으로 본다.
  if (!response.ok && response.status !== 404) {
    throw new AvatarStorageError(
      `아바타 삭제에 실패했습니다. (${response.status}) ${await readErrorBody(response)}`.trim(),
    );
  }
};

/** 삭제 실패를 응답 오류로 전파하지 않고 로그로만 남긴다. 남은 파일은 경로가 추측 불가하므로 노출 위험이 낮다. */
export const deleteAvatarObjectQuietly = async (objectPath: string | null) => {
  if (!objectPath) {
    return;
  }
  try {
    await deleteAvatarObject(objectPath);
  } catch (err) {
    console.warn(`[Avatar] ${objectPath} 삭제 실패:`, (err as Error).message);
  }
};
