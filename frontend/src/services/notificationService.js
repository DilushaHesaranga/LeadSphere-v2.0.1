import { supabase } from '../utils/supabase.js'

async function rpc(name, parameters = {}) {
  const { data, error } = await supabase.rpc(name, parameters)
  if (error) throw new Error(error.message || 'Notifications could not be loaded.')
  return data
}

export const notificationService = Object.freeze({
  list: (limit = 40) => rpc('get_user_notifications', { p_limit: limit }),
  markRead: (notificationId) => rpc('mark_user_notifications_read', { p_notification_id: notificationId }),
  markAllRead: () => rpc('mark_user_notifications_read', { p_notification_id: null }),
})
