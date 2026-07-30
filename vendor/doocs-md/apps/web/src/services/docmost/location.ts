export function takeDocmostTicketFromLocation(location: Location = window.location): string | null {
  const params = new URLSearchParams(location.search)
  const ticket = params.get(`docmost`)?.trim() || null
  if (!params.has(`docmost`))
    return null

  params.delete(`docmost`)
  params.delete(`api`)
  const search = params.toString()
  const cleanUrl = `${location.pathname}${search ? `?${search}` : ``}${location.hash}`
  window.history.replaceState({}, ``, cleanUrl)
  return ticket
}
