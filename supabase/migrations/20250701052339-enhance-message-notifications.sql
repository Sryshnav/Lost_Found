
-- Update the message notification function to include item details
CREATE OR REPLACE FUNCTION public.create_message_notification()
RETURNS TRIGGER AS $$
DECLARE
  item_title TEXT;
BEGIN
  -- Get the item title
  SELECT title INTO item_title FROM public.items WHERE id = NEW.item_id;
  
  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (
    NEW.recipient_id,
    'message',
    'New Message',
    CASE 
      WHEN item_title IS NOT NULL THEN 
        'You have received a new message about "' || item_title || '"'
      ELSE 
        'You have received a new message about an item'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
