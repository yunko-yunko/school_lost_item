# 학교 분실물 게시판

학교에서 발견한 분실물의 위치와 특징을 공유하는 게시판입니다. `client`는 React와 JavaScript, `server`는 Node.js, Express와 JavaScript로 구성했습니다.

## 로컬 실행

Node.js 22.12 이상과 npm을 설치한 뒤 로컬 MySQL을 실행합니다. 기본 접속 정보는 `127.0.0.1:3306`, 사용자 `root`, 비밀번호 `1234`입니다.

`package-lock.json`은 `server`와 `client`에 각각 있습니다. `--prefix`로 폴더를 지정하면 프로젝트 최상위 폴더에서 명령을 실행할 수 있습니다.

첫 번째 터미널 창에서 백엔드를 실행합니다. `db:init`은 `school_lost_item` 데이터베이스와 두 테이블을 준비합니다. 이전 버전을 사용했다면 `db:init`을 한 번 더 실행해 기존 `lost_items`에 `image_url` 컬럼을 추가합니다.

```cmd
cd C:\dbp\school_lost_item
npm --prefix server ci
npm --prefix server run db:init
npm --prefix server start
```

두 번째 창에서 프론트엔드를 실행합니다.

```cmd
cd C:\dbp\school_lost_item
npm --prefix client ci
npm --prefix client run dev
```

PowerShell에서 `npm.ps1` 실행이 차단되면 `npm` 대신 `npm.cmd`를 사용합니다.

브라우저에서 [http://127.0.0.1:5173](http://127.0.0.1:5173)을 엽니다. 백엔드는 `127.0.0.1:3001`에서 실행됩니다.

## 사용 방법

- **분실물 목록**에서 글 제목을 누르면 사진, 발견 장소, 작성자와 글 내용을 볼 수 있습니다. 로그인하면 글을 등록하고 본인이 등록한 글을 수정하거나 삭제할 수 있습니다.
- 등록·수정 시 JPEG, PNG, WebP 사진을 한 장 첨부할 수 있습니다. 최대 크기는 5MB이며, 사진 파일은 `server/upload/`에 저장합니다. MySQL의 `lost_items.image_url`에는 사진 경로가 기록됩니다.
- **작성자 조회**는 `lost_items`와 `users`를 `LEFT JOIN`하여 분실물과 작성자 이름을 표시합니다. 작성자가 탈퇴한 글에는 ‘탈퇴한 회원’이 표시됩니다.
- **마이페이지**에서 이름, 이메일, 학번과 내가 쓴 게시글을 확인합니다. ‘정보 수정’을 누르면 프로필을 수정할 수 있습니다. 로그아웃과 회원 탈퇴는 왼쪽 메뉴 하단에 있습니다.
- 회원 비밀번호는 bcrypt 해시로 저장됩니다. 백엔드를 재시작하면 다시 로그인해야 합니다.
