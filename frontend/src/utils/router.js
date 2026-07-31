export function navigate(path, { replace = false } = {}) {
  const method = replace ? 'replaceState' : 'pushState'
  window.history[method]({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
