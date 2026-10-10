let linkToken: { pathname: string; value: string } | null = null;
export function captureLinkToken() {
  if (
    !['/accept-invitation', '/reset-password'].includes(
      window.location.pathname,
    )
  )
    return;
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (token) {
    linkToken = /^[a-f0-9]{64}$/i.test(token)
      ? { pathname: window.location.pathname, value: token }
      : null;
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }
}
export function getLinkToken() {
  return linkToken?.pathname === window.location.pathname
    ? linkToken.value
    : null;
}
export function clearLinkToken() {
  linkToken = null;
}
