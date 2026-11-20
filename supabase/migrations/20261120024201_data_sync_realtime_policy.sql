-- 데이터 변경 신호 채널(private, topic data-sync)을 로그인한 회원만 받게 한다.
-- 테이블 RLS 무정책(기본 거부) 원칙의 예외다. 보내기(insert) 정책은 두지 않아 회원은 신호를 보낼 수 없고,
-- api가 서비스 키로 보내는 REST broadcast만 전달된다.
create policy "data_sync_authenticated_receive"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() = 'data-sync'
    and extension = 'broadcast'
  );
