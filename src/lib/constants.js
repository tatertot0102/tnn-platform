export const PRIORITIES = {
  'ultra-high': { label: '1. Ultra-High', color: 'bg-red-900 text-red-300', dot: 'bg-red-400' },
  'high':       { label: '2. High',       color: 'bg-orange-900 text-orange-300', dot: 'bg-orange-400' },
  'medium':     { label: '3. Medium',     color: 'bg-yellow-900 text-yellow-300', dot: 'bg-yellow-400' },
  'low':        { label: '4. Low',        color: 'bg-green-900 text-green-300', dot: 'bg-green-400' },
  'tbd':        { label: '5. TBD',        color: 'bg-gray-800 text-gray-400', dot: 'bg-gray-500' },
}

export const STATUSES = {
  'not-started': { label: 'Not started', color: 'bg-gray-800 text-gray-400' },
  'in-progress': { label: 'In progress', color: 'bg-blue-900 text-blue-300' },
  'blocked':     { label: 'Blocked',     color: 'bg-red-900 text-red-300' },
  'done':        { label: 'Done',        color: 'bg-green-900 text-green-300' },
}

export const DEPARTMENTS = {
  'pre-production':  { label: 'Pre-Production',  color: 'bg-purple-900 text-purple-300' },
  'production':      { label: 'Production',      color: 'bg-blue-900 text-blue-300' },
  'post-production': { label: 'Post-Production', color: 'bg-indigo-900 text-indigo-300' },
  'marketing':       { label: 'Marketing',       color: 'bg-pink-900 text-pink-300' },
  'sports':          { label: 'Sports',          color: 'bg-green-900 text-green-300' },
  'audio':           { label: 'Audio',           color: 'bg-teal-900 text-teal-300' },
  'hr':              { label: 'HR',              color: 'bg-orange-900 text-orange-300' },
  'etc':             { label: 'Etc.',            color: 'bg-gray-800 text-gray-300' },
}

// Primary roles now support multiple assignees — no uniqueness enforced in UI
export const PRIMARY_ROLES = ['Script Writer', 'Director', 'Video Editor']

export const SECONDARY_ROLES = [
  'Producer', 'Camera Operator', 'Audio Engineer', 'Motion Graphics',
  'Thumbnail Designer', 'Social Media', 'Researcher', 'Interviewer',
]

export const USER_ROLES = { MEMBER: 'member', EXEC: 'exec', ADMIN: 'admin' }