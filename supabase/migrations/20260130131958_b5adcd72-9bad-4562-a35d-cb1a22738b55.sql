-- ========================================
-- CLEANUP: Eliminar políticas permisivas restantes
-- ========================================

-- chat_events: eliminar políticas con roles public y redundantes
DROP POLICY IF EXISTS "Admin can manage chat_events" ON public.chat_events;
DROP POLICY IF EXISTS "Admin can insert chat_events" ON public.chat_events;

-- payment_update_links: eliminar política con roles public
DROP POLICY IF EXISTS "Admin full access payment_links" ON public.payment_update_links;

-- scheduled_messages: eliminar políticas permisivas
DROP POLICY IF EXISTS "Authenticated users can create scheduled messages" ON public.scheduled_messages;
DROP POLICY IF EXISTS "Authenticated users can delete scheduled messages" ON public.scheduled_messages;
DROP POLICY IF EXISTS "Authenticated users can update scheduled messages" ON public.scheduled_messages;