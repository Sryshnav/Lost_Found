
-- Create custom types
CREATE TYPE app_role AS ENUM ('user', 'admin');
CREATE TYPE item_type AS ENUM ('lost', 'found');
CREATE TYPE item_status AS ENUM ('active', 'claimed', 'archived');
CREATE TYPE claim_status AS ENUM ('pending', 'approved', 'rejected');

-- Create profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role app_role DEFAULT 'user',
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create items table
CREATE TABLE public.items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  location TEXT NOT NULL,
  status item_status DEFAULT 'active',
  type item_type NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create claims table
CREATE TABLE public.claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID REFERENCES public.items(id) ON DELETE CASCADE NOT NULL,
  claimant_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  status claim_status DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(item_id, claimant_id)
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create storage bucket for item images
INSERT INTO storage.buckets (id, name, public) VALUES ('item-images', 'item-images', true);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create security definer function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS app_role
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Items policies
CREATE POLICY "Anyone can view active items" ON public.items FOR SELECT USING (status = 'active');
CREATE POLICY "Users can insert own items" ON public.items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own items" ON public.items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all items" ON public.items FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- Claims policies
CREATE POLICY "Users can view claims for their items" ON public.claims FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.items WHERE items.id = claims.item_id AND items.user_id = auth.uid())
  OR claimant_id = auth.uid()
);
CREATE POLICY "Users can create claims" ON public.claims FOR INSERT WITH CHECK (auth.uid() = claimant_id);
CREATE POLICY "Item owners can update claims" ON public.claims FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.items WHERE items.id = claims.item_id AND items.user_id = auth.uid())
);
CREATE POLICY "Admins can manage all claims" ON public.claims FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- Notifications policies
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);

-- Storage policies for item images
CREATE POLICY "Anyone can view item images" ON storage.objects
FOR SELECT USING (bucket_id = 'item-images');

CREATE POLICY "Users can upload item images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'item-images'
  AND auth.role() = 'authenticated'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own item images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'item-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own item images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'item-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INTEGER := 1;
BEGIN
  -- Generate base username from email or metadata
  base_username := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
    split_part(NEW.email, '@', 1)
  );
  
  -- Sanitize username
  base_username := regexp_replace(lower(base_username), '[^a-z0-9_]', '', 'g');
  base_username := substring(base_username from 1 for 20);
  
  -- Ensure username is unique
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    final_username := base_username || counter;
    counter := counter + 1;
  END LOOP;
  
  -- Insert profile
  INSERT INTO public.profiles (id, username, full_name)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), final_username)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for better performance
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_items_user_id ON public.items(user_id);
CREATE INDEX idx_items_status ON public.items(status);
CREATE INDEX idx_items_type ON public.items(type);
CREATE INDEX idx_claims_item_id ON public.claims(item_id);
CREATE INDEX idx_claims_claimant_id ON public.claims(claimant_id);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);

-- Enable realtime for tables
ALTER TABLE public.items REPLICA IDENTITY FULL;
ALTER TABLE public.claims REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.claims;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
