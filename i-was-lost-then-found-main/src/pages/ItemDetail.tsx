
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { Item } from '@/types/database';
import { useAuth } from '@/hooks/useAuth';
import { MapPin, Calendar, User, ArrowLeft } from 'lucide-react';
import { ContactButton } from '@/components/ContactButton';

type ItemWithProfile = Item & {
  profiles?: {
    id: string;
    username: string;
    role: string;
    avatar_url?: string;
    created_at: string;
    updated_at: string;
  } | null;
};

export const ItemDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [item, setItem] = useState<ItemWithProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchItem();
    }
  }, [id]);

  const fetchItem = async () => {
    try {
      console.log('Fetching item with ID:', id);
      
      // First fetch the item
      const { data: itemData, error: itemError } = await supabase
        .from('items')
        .select('*')
        .eq('id', id)
        .single();

      if (itemError) {
        console.error('Error fetching item:', itemError);
        setError('Item not found');
        setLoading(false);
        return;
      }

      console.log('Item data fetched:', itemData);

      // Then fetch the profile for this item's user
      let profileData = null;
      if (itemData.user_id) {
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, role, avatar_url, created_at, updated_at')
          .eq('id', itemData.user_id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
        } else {
          profileData = data;
        }
      }

      console.log('Profile data:', profileData);

      // Combine item with profile
      const processedItem: ItemWithProfile = {
        ...itemData,
        profiles: profileData
      };

      setItem(processedItem);
    } catch (err) {
      console.error('Error in fetchItem:', err);
      setError('Failed to load item');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const handleUserClick = () => {
    if (item?.profiles?.id) {
      navigate(`/users/${item.profiles.id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">{error || 'Item not found'}</h1>
          <Button onClick={() => navigate('/items')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Items
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button 
        variant="ghost" 
        onClick={() => navigate(-1)}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{item.title}</CardTitle>
              <div className="flex items-center gap-4 mt-2 text-gray-600">
                <Badge variant={item.type === 'lost' ? 'destructive' : 'secondary'}>
                  {item.type}
                </Badge>
                <span className="text-sm bg-gray-100 px-2 py-1 rounded">
                  {item.category}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {item.image_url && (
            <div className="w-full h-64 md:h-96 bg-gray-200 rounded-lg overflow-hidden">
              <img 
                src={item.image_url} 
                alt={item.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          
          <div>
            <h3 className="font-semibold text-lg mb-2">Description</h3>
            <p className="text-gray-700">{item.description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="h-4 w-4" />
              <span>{item.location}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(item.created_at)}</span>
            </div>
            {item.profiles && (
              <div className="flex items-center gap-2 text-gray-600">
                <div 
                  className="flex items-center gap-2 cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={handleUserClick}
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={item.profiles.avatar_url} />
                    <AvatarFallback className="text-xs">
                      {item.profiles.username?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hover:underline">Posted by {item.profiles.username}</span>
                </div>
              </div>
            )}
          </div>

          {item.tags && item.tags.length > 0 && (
            <div>
              <h3 className="font-semibold text-lg mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {item.tags.map((tag, index) => (
                  <span 
                    key={index}
                    className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {user && user.id !== item.user_id && item.profiles && (
            <div className="pt-4 border-t">
              <ContactButton
                itemId={item.id}
                itemTitle={item.title}
                ownerUserId={item.user_id}
                ownerUsername={item.profiles.username}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
