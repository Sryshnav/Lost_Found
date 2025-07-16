
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Camera, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AvatarUploadProps {
  avatarUrl: string;
  onAvatarUpdate: (url: string) => void;
  username: string;
}

export const AvatarUpload = ({ avatarUrl, onAvatarUpdate, username }: AvatarUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.');
      }

      const file = event.target.files[0];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error('Please select an image file.');
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('File size must be less than 5MB.');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}-${Date.now()}.${fileExt}`;

      console.log('Uploading file:', fileName);

      // Upload file to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from('profile-avatars')
        .upload(fileName, file, { 
          cacheControl: '3600',
          upsert: true 
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      console.log('Upload successful:', data);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(fileName);

      console.log('Public URL:', publicUrl);
      
      // Update avatar URL in the parent component
      onAvatarUpdate(publicUrl);

      toast({
        title: "Success",
        description: "Avatar uploaded successfully!",
      });
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload avatar",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative">
        <Avatar className="h-24 w-24">
          <AvatarImage src={avatarUrl} />
          <AvatarFallback className="text-2xl">
            {username?.charAt(0)?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        <label
          htmlFor="avatar-upload"
          className="absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-full cursor-pointer hover:bg-blue-700 transition-colors"
        >
          <Camera className="h-4 w-4" />
        </label>
        <input
          id="avatar-upload"
          type="file"
          accept="image/*"
          onChange={uploadAvatar}
          disabled={uploading}
          className="hidden"
        />
      </div>
      
      <Button
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => document.getElementById('avatar-upload')?.click()}
      >
        <Upload className="h-4 w-4 mr-2" />
        {uploading ? 'Uploading...' : 'Upload Avatar'}
      </Button>
    </div>
  );
};
