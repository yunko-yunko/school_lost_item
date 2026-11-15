import { useEffect, useState } from 'react';
import { HiOutlinePencilSquare } from 'react-icons/hi2';
import { request } from './api.js';

export function Account({ page, profile, onProfileChange }) {
  if (page === 'profile') return <Profile profile={profile} onProfileChange={onProfileChange} />;
  return <AuthForm page={page} onProfileChange={onProfileChange} />;
}

function AccountFields({ profile, emailOnly = false }) {
  return (
    <>
      {!emailOnly && (
        <label>
          이름
          <input
            required
            name="username"
            autoComplete="name"
            maxLength={50}
            defaultValue={profile?.username}
            autoFocus={Boolean(profile)}
          />
        </label>
      )}
      <label>
        이메일
        <input required type="email" name="email" autoComplete="email" maxLength={255} defaultValue={profile?.email} />
      </label>
      {!emailOnly && (
        <label>
          학번
          <input required name="student_id" maxLength={20} defaultValue={profile?.student_id} />
        </label>
      )}
    </>
  );
}

function AuthForm({ page, onProfileChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const isLogin = page === 'login';
  const heading = isLogin ? '로그인' : '회원가입';

  async function submit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (isLogin) {
        onProfileChange(await request('/auth/login', { method: 'POST', data }));
        window.location.hash = 'items';
      } else {
        await request('/auth/register', { method: 'POST', data });
        setNotice('회원가입을 완료했습니다.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-page">
      <h1>{heading}</h1>
      {notice && <p className="notice" role="status">{notice}</p>}
      {!isLogin && notice ? (
        <a className="button primary" href="#login">로그인</a>
      ) : (
        <form className="fields" onSubmit={submit}>
          <AccountFields emailOnly={isLogin} />
          <label>
            비밀번호
            <input
              required
              type="password"
              name="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              minLength={isLogin ? undefined : 8}
              aria-describedby={isLogin ? undefined : 'password-hint'}
            />
            {!isLogin && <small id="password-hint">8자 이상, UTF-8 기준 72바이트 이하</small>}
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button className="primary" type="submit" disabled={busy}>{heading}</button>
            {isLogin && <a className="button" href="#register">회원가입</a>}
            {!isLogin && <a className="button" href="#login">로그인</a>}
          </div>
        </form>
      )}
    </section>
  );
}

function Profile({ profile, onProfileChange }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function toggleEditing(value) {
    setEditing(value);
    setError('');
    setNotice('');
  }

  async function save(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try {
      onProfileChange(await request('/users/me', { method: 'PATCH', data }));
      setEditing(false);
      setNotice('프로필을 저장했습니다.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-page">
      <h1>마이페이지</h1>
      <section className="profile-section" aria-label="프로필 정보">
        {editing ? (
          <form className="fields" onSubmit={save}>
            <AccountFields profile={profile} />
            {error && <p className="error" role="alert">{error}</p>}
            <div className="actions profile-actions">
              <button type="button" onClick={() => toggleEditing(false)} disabled={busy}>취소</button>
              <button className="primary" type="submit" disabled={busy}>저장</button>
            </div>
          </form>
        ) : (
          <>
            <dl className="profile-summary">
              <div><dt>이름</dt><dd>{profile.username}</dd></div>
              <div><dt>이메일</dt><dd>{profile.email}</dd></div>
              <div><dt>학번</dt><dd>{profile.student_id}</dd></div>
            </dl>
            {notice && <p className="notice" role="status">{notice}</p>}
            <div className="actions profile-actions">
              <button className="profile-edit-button" type="button" onClick={() => toggleEditing(true)}>
                <HiOutlinePencilSquare aria-hidden="true" />
                정보 수정
              </button>
            </div>
          </>
        )}
      </section>
      <MyPosts key={profile.id} />
    </div>
  );
}

function MyPosts() {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    request('/users/me/items', { signal: controller.signal })
      .then(setPosts)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="my-posts" aria-labelledby="my-posts-heading">
      <h2 id="my-posts-heading">내가 쓴 게시글</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {!posts && !error && <p className="empty-message" role="status">게시글을 불러오는 중입니다.</p>}
      {posts?.length === 0 && <p className="empty-message">작성한 게시글이 없습니다.</p>}
      {posts?.length > 0 && (
        <ul className="my-posts-list">
          {posts.map((post) => (
            <li key={post.id}>
              <a className="item-link" href={`#items/${post.id}`}>{post.title}</a>
              <span className="my-post-meta">{post.locate}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
