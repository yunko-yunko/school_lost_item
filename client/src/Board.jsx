import { useEffect, useState } from 'react';
import { request } from './api.js';

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxImageSize = 5 * 1024 * 1024;

function ItemDate({ date }) {
  return <time dateTime={date}>{dateFormat.format(new Date(date))}</time>;
}

function ItemForm({ item, onSave, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hasNewImage, setHasNewImage] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const image = data.get('image');
    if (!image?.name) {
      data.delete('image');
    } else if (image.type && !imageTypes.includes(image.type)) {
      setError('JPG, PNG, WebP 사진을 선택해 주세요.');
      return;
    } else if (image.size > maxImageSize) {
      setError('사진 크기는 5MB 이하여야 합니다.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const saved = await request(item.id ? `/items/${item.id}` : '/items', {
        method: item.id ? 'PATCH' : 'POST',
        data,
      });
      onSave(saved, Boolean(item.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-page">
      <h1>{item.id ? '분실물 수정' : '분실물 등록'}</h1>
      <form className="fields" onSubmit={submit}>
        <label>
          제목
          <input required name="title" maxLength={100} defaultValue={item.title} />
        </label>
        <label>
          발견 장소
          <input required name="locate" maxLength={255} defaultValue={item.locate} />
        </label>
        <label>
          내용
          <textarea required name="description" rows={5} maxLength={1000} defaultValue={item.description} />
        </label>
        <div className="image-fields">
          {item.image_url && (
            <figure className="image-preview">
              <img src={item.image_url} alt={`${item.title} 사진`} />
              <figcaption>현재 사진</figcaption>
            </figure>
          )}
          <label>
            {item.image_url ? '새 사진' : '사진 (선택)'}
            <input
              type="file"
              name="image"
              accept={imageTypes.join(',')}
              aria-describedby="image-hint"
              onChange={(event) => setHasNewImage(event.currentTarget.files.length > 0)}
            />
            <small id="image-hint">JPG, PNG, WebP · 5MB 이하</small>
          </label>
          {item.image_url && !hasNewImage && (
            <label className="checkbox-label">
              <input type="checkbox" name="remove_image" value="true" />
              기존 사진 삭제
            </label>
          )}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button className="primary" type="submit" disabled={busy}>저장</button>
          <button type="button" onClick={onCancel} disabled={busy}>취소</button>
        </div>
      </form>
    </section>
  );
}

export function Board({ withUploaders, profile }) {
  const [items, setItems] = useState(null);
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const path = withUploaders ? '/items/with-uploaders' : '/items';
    request(path, { signal: controller.signal })
      .then(setItems)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [withUploaders]);

  function openEditor(item) {
    setError('');
    setNotice('');
    setEditor(item);
  }

  function saveItem(item, isEdit) {
    setItems((previous) => isEdit
      ? previous.map((row) => row.id === item.id ? item : row)
      : [item, ...previous]);
    setEditor(null);
    setNotice(isEdit ? '분실물 글을 수정했습니다.' : '분실물 글을 등록했습니다.');
  }

  async function removeItem(item) {
    if (!window.confirm('이 분실물 글을 삭제할까요?')) return;
    setDeleting(true);
    setError('');
    setNotice('');
    try {
      await request(`/items/${item.id}`, { method: 'DELETE' });
      setItems((previous) => previous.filter((row) => row.id !== item.id));
      setNotice('분실물 글을 삭제했습니다.');
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  if (editor) {
    return <ItemForm item={editor} onSave={saveItem} onCancel={() => setEditor(null)} />;
  }

  const listPage = withUploaders ? 'writers' : 'items';
  const showActions = !withUploaders && profile && items?.some((item) => item.uploader_id === profile.id);
  return (
    <section>
      <div className="page-header">
        <h1 id="board-title">{withUploaders ? '작성자 조회' : '분실물 목록'}</h1>
        {!withUploaders && profile && (
          <button className="primary" type="button" onClick={() => openEditor({})} disabled={!items || deleting}>
            분실물 등록
          </button>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {!items && !error && <p className="empty-message" role="status">목록을 불러오는 중입니다.</p>}
      {items?.length === 0 && <p className="empty-message">등록된 분실물이 없습니다.</p>}
      {items?.length > 0 && (
        <table className="items" aria-labelledby="board-title" role="table">
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">제목</th>
              <th scope="col" role="columnheader">발견 장소</th>
              {withUploaders && <th scope="col" role="columnheader">작성자</th>}
              <th scope="col" role="columnheader">등록일</th>
              {showActions && <th scope="col" role="columnheader">관리</th>}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {items.map((item) => (
              <tr key={item.id} role="row">
                <td className="item-content" role="cell">
                  <a className="item-link" href={`#${listPage}/${item.id}`}>{item.title}</a>
                  <p>{item.description}</p>
                </td>
                <td className="item-meta" role="cell"><span className="mobile-label">장소 </span>{item.locate}</td>
                {withUploaders && (
                  <td className="item-meta" role="cell">
                    <span className="mobile-label">작성자 </span>{item.uploader_name ?? '탈퇴한 회원'}
                  </td>
                )}
                <td className="item-meta item-date" role="cell">
                  <span className="mobile-label">등록일 </span>
                  <ItemDate date={item.created_at} />
                </td>
                {showActions && (
                  <td className="item-actions" role="cell">
                    {item.uploader_id === profile.id && (
                      <div className="actions">
                        <button type="button" onClick={() => openEditor(item)} disabled={deleting}>수정</button>
                        <button type="button" className="danger" onClick={() => removeItem(item)} disabled={deleting}>삭제</button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function ItemDetail({ itemId, listPage }) {
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    request(`/items/${itemId}`, { signal: controller.signal })
      .then(setItem)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [itemId]);

  return (
    <section className="item-detail" aria-label="분실물 상세">
      <a className="detail-back" href={`#${listPage}`}>
        <span aria-hidden="true">←</span>
        {listPage === 'writers' ? '작성자 조회로 돌아가기' : '분실물 목록으로 돌아가기'}
      </a>
      {error && <p className="error" role="alert">{error}</p>}
      {!item && !error && <p role="status">분실물 정보를 불러오는 중입니다.</p>}
      {item && (
        <>
          <h1>{item.title}</h1>
          <dl className="detail-meta">
            <div><dt>발견 장소</dt><dd>{item.locate}</dd></div>
            <div><dt>작성자</dt><dd>{item.uploader_name ?? '탈퇴한 회원'}</dd></div>
            <div><dt>등록일</dt><dd><ItemDate date={item.created_at} /></dd></div>
          </dl>
          {item.image_url && <img className="detail-image" src={item.image_url} alt={`${item.title} 사진`} />}
          <p className="detail-description">{item.description}</p>
        </>
      )}
    </section>
  );
}
