
-- Fix RLS policies for profile-avatars storage bucket
CREATE POLICY "Anyone can view profile avatars" ON storage.objects
FOR SELECT USING (bucket_id = 'profile-avatars');

CREATE POLICY "Users can upload profile avatars" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'profile-avatars'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can update their own profile avatars" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'profile-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own profile avatars" ON storage.objects
FOR DELETE USING (
  bucket_id = 'profile-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create messages table for contact functionality
CREATE TABLE public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  item_id UUID REFERENCES public.items(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for messages table
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Messages policies
CREATE POLICY "Users can view messages they sent or received" ON public.messages FOR SELECT USING (
  auth.uid() = sender_id OR auth.uid() = recipient_id
);

CREATE POLICY "Users can send messages" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id
);

CREATE POLICY "Users can update messages they received" ON public.messages FOR UPDATE USING (
  auth.uid() = recipient_id
);

-- Function to create notification when message is sent
CREATE OR REPLACE FUNCTION public.create_message_notification()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (
    NEW.recipient_id,
    'message',
    'New Message',
    'You have received a new message about an item'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for message notifications
CREATE TRIGGER on_message_created
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.create_message_notification();

-- Add indexes for better performance
CREATE INDEX idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX idx_messages_recipient_id ON public.messages(recipient_id);
CREATE INDEX idx_messages_item_id ON public.messages(item_id);
