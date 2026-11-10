-- 프로필 아바타 Storage 버킷.
-- 공개 읽기(public = true)이므로 공개 URL(/storage/v1/object/public/avatars/...)은 누구나 조회할 수 있다.
-- 객체 경로는 <playerId>/<uuid>.<ext>로 추측할 수 없게 만든다.
-- storage.objects에 avatars 버킷용 insert·update·delete 정책을 두지 않아 브라우저(anon·authenticated)는 쓸 수 없고,
-- 업로드·삭제는 api(Edge Function)가 service role key로만 한다.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  1048576,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
