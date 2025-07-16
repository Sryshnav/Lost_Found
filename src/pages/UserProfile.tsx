
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { Profile, Item } from '@/types/database';
import { ArrowLeft, Calendar, MapPin, User } from 'lucide-react';

type UserProfileWithItems = Profile & {
  items?: Item[];
};

export const UserProfile = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<UserProfileWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      fetchUserProfile();
    }
  }, [userId]);

  const fetchUserProfile = async () => {
    try {
      console.log('Fetching user profile for ID:', userId);
      
      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Error fetching user profile:', profileError);
        setError('User not found');
        setLoading(false);
        return;
      }

      // Fetch user's items
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (itemsError) {
        console.error('Error fetching user items:', itemsError);
      }

      setUserProfile({
        ...profileData,
        items: itemsData || []
      });
    } catch (err) {
      console.error('Error in fetchUserProfile:', err);
      setError('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">{error || 'User not found'}</h1>
          <Button onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
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

      {/* User Profile Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={userProfile.avatar_url || undefined} />
              <AvatarFallback className="text-2xl">
                {userProfile.username?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-2xl">{userProfile.full_name || userProfile.username}</CardTitle>
              <p className="text-gray-600">@{userProfile.username}</p>
              <div className="flex items-center gap-4 mt-2">
                <Badge variant={userProfile.role === 'admin' ? 'default' : 'secondary'}>
                  {userProfile.role}
                </Badge>
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Calendar className="h-4 w-4" />
                  <span>Joined {formatDate(userProfile.created_at)}</span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* User's Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Items Posted ({userProfile.items?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {userProfile.items && userProfile.items.length > 0 ? (
            <div className="space-y-4">
              {userProfile.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold">{item.title}</h3>
                      <Badge 
                        variant={item.type === 'lost' ? 'destructive' : 'default'}
                        className={item.type === 'found' ? 'bg-green-500 hover:bg-green-600 text-white' : ''}
                      >
                        {item.type}
                      </Badge>
                      <Badge variant={
                        item.status === 'active' ? 'default' :
                        item.status === 'claimed' ? 'secondary' : 'outline'
                      }>
                        {item.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-1">{item.description}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span>{item.location}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(item.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/items/${item.id}`)}
                  >
                    View Item
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No items posted</h3>
              <p className="text-gray-600">This user hasn't posted any items yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
