import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HiOutlineArrowRightOnRectangle, HiOutlineUserMinus } from 'react-icons/hi2';
import { Account } from './Account.jsx';
import { Board, ItemDetail } from './Board.jsx';
import { request } from './api.js';
import './styles.css';

const pages = ['items', 'writers', 'login', 'register', 'profile'];

function currentPage() {
  const hash = window.location.hash.slice(1);
  const detail = /^(items|writers)\/([1-9]\d*)$/.exec(hash);
  if (detail) return { page: detail[1], itemId: detail[2] };
  return { page: pages.includes(hash) ? hash : 'items' };
}

function NavLink({ to, page, children }) {
  return <a href={`#${to}`} aria-current={page === to ? 'page' : undefined}>{children}</a>;
}

function SidebarAccount({ onLeave }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function leave(removeAccount) {
    if (removeAccount && !window.confirm('회원 탈퇴 후에도 작성한 분실물 글은 남습니다. 탈퇴할까요?')) return;

    setBusy(true);
    setError('');
    try {
      if (removeAccount) await request('/users/me', { method: 'DELETE' });
      else await request('/auth/logout', { method: 'POST' });
      onLeave();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sidebar-account">
      <div className="sidebar-account-actions">
        <button type="button" onClick={() => leave(false)} disabled={busy}>
          <HiOutlineArrowRightOnRectangle aria-hidden="true" />
          <span>로그아웃</span>
        </button>
        <button type="button" className="danger" onClick={() => leave(true)} disabled={busy}>
          <HiOutlineUserMinus aria-hidden="true" />
          <span>회원 탈퇴</span>
        </button>
      </div>
      {error && <p className="sidebar-account-error" role="alert">{error}</p>}
    </div>
  );
}

function App() {
  const [{ page, itemId }, setPage] = useState(currentPage);
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    function onHashChange() {
      setPage(currentPage());
      window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    request('/users/me', { signal: controller.signal })
      .then(setProfile)
      .catch(() => {
        if (!controller.signal.aborted) setProfile(null);
      });
    return () => controller.abort();
  }, []);

  function saveProfile(updatedProfile) {
    setProfile((current) => current?.id === updatedProfile.id ? updatedProfile : current);
  }

  function leaveAccount() {
    setProfile(null);
    window.location.hash = 'items';
  }

  const showBoard = page === 'items' || page === 'writers';
  let accountPage = page;
  if (profile) accountPage = 'profile';
  else if (page === 'profile') accountPage = 'login';
  const activePage = showBoard ? page : accountPage;

  let content;
  if (itemId) {
    content = <ItemDetail key={`${page}/${itemId}`} itemId={itemId} listPage={page} />;
  } else if (showBoard) {
    content = <Board key={page} withUploaders={page === 'writers'} profile={profile} />;
  } else if (profile === undefined) {
    content = <p role="status">로그인 상태를 확인하고 있습니다.</p>;
  } else {
    content = (
      <Account
        key={accountPage}
        page={accountPage}
        profile={profile}
        onProfileChange={profile ? saveProfile : setProfile}
      />
    );
  }

  return (
    <>
      <aside className="site-sidebar">
        <a className="site-name" href="#items">학교 분실물</a>
        <nav aria-label="주 메뉴">
          <NavLink to="items" page={activePage}>분실물 목록</NavLink>
          <NavLink to="writers" page={activePage}>작성자 조회</NavLink>
          {profile && <NavLink to="profile" page={activePage}>마이페이지</NavLink>}
          {profile === null && <NavLink to="login" page={activePage}>로그인</NavLink>}
        </nav>
        {profile && <SidebarAccount key={profile.id} onLeave={leaveAccount} />}
      </aside>
      <main className="shell">{content}</main>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
