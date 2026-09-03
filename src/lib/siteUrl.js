export function getSiteUrl() {
  const envUrl = import.meta.env.VITE_SITE_URL
  const siteUrl = envUrl || window.location.origin

  return siteUrl.replace(/\/$/, '')
}

export function getAppUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return `${getSiteUrl()}${normalizedPath}`
}
