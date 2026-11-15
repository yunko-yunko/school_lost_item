export async function request(path, { method = 'GET', data, signal } = {}) {
  const isJson = data && !(data instanceof FormData);
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: isJson ? { 'Content-Type': 'application/json' } : undefined,
      body: isJson ? JSON.stringify(data) : data,
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('서버에 연결할 수 없습니다.');
  }

  if (response.status === 204) return;

  const result = await response.json().catch(() => null);
  if (!response.ok || result === null) {
    throw new Error(result?.message || '요청을 처리하지 못했습니다. 다시 시도해 주세요.');
  }
  return result;
}
