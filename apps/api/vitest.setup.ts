/**
 * `getDb()`는 DATABASE_URL이 없으면 생성 시점에 실패한다.
 * 테스트는 저장소를 대체해 실제 연결을 만들지 않으므로, 이 값은 모듈 로딩을 통과시키는 자리표시자다.
 * 셸에 운영 DB 주소가 있어도 테스트가 그쪽을 가리키지 않도록 항상 로컬 주소로 덮어쓴다.
 */
process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
