
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Item } from '@/types/database';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, MapPin, Calendar, Flag, FileText, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Create a type for items with profile data
type ItemWithProfile = Item & {
  profiles?: {
    id: string;
    username: string;
    role: string;
    created_at: string;
    updated_at: string;
  } | null;
};

export const Dashboard = () => {
  const [items, setItems] = useState<ItemWithProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState({
    itemsSubmitted: 0,
    claimsMade: 0
  });
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchRecentItems();
    if (user) {
      fetchUserStats();
    }
  }, [user]);

  const fetchUserStats = async () => {
    if (!user) return;

    try {
      // Get count of items submitted by user
      const { count: itemsCount } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Get count of claims made by user
      const { count: claimsCount } = await supabase
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .eq('claimant_id', user.id);

      setUserStats({
        itemsSubmitted: itemsCount || 0,
        claimsMade: claimsCount || 0
      });
    } catch (error) {
      console.error('Error fetching user stats:', error);
    }
  };

  const fetchRecentItems = async () => {
    try {
      // First fetch items, then fetch profiles separately to avoid join issues
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(12);

      if (itemsError) {
        console.error('Items query error:', itemsError);
        return;
      }

      if (!itemsData || itemsData.length === 0) {
        setItems([]);
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(itemsData.map(item => item.user_id))];

      // Fetch profiles for these users
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, role, created_at, updated_at')
        .in('id', userIds);

      if (profilesError) {
        console.error('Profiles query error:', profilesError);
      }

      // Create a map of user_id to profile
      const profilesMap = new Map();
      if (profilesData) {
        profilesData.forEach(profile => {
          profilesMap.set(profile.id, profile);
        });
      }

      // Combine items with their profiles
      const processedItems: ItemWithProfile[] = itemsData.map(item => ({
        ...item,
        profiles: profilesMap.get(item.user_id) || null
      }));
      
      console.log('Processed items:', processedItems);
      setItems(processedItems);
    } catch (err) {
      console.error('Error in fetchRecentItems:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigate(`/items?search=${encodeURIComponent(searchQuery)}`);
    } else {
      navigate('/items');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const createClaim = async (itemId: string) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to claim an item",
        variant: "destructive",
      });
      return;
    }

    // Check if user has already claimed this item
    try {
      const { data: existingClaim } = await supabase
        .from('claims')
        .select('id')
        .eq('item_id', itemId)
        .eq('claimant_id', user.id)
        .single();

      if (existingClaim) {
        toast({
          title: "Already Claimed",
          description: "You have already submitted a claim for this item",
          variant: "destructive",
        });
        return;
      }
    } catch (error) {
      // If no existing claim found, continue with creating new claim
      console.log('No existing claim found, proceeding with new claim');
    }

    const message = prompt('Enter a message for your claim:');
    if (!message) return;

    try {
      // Get item details for notification
      const { data: itemData } = await supabase
        .from('items')
        .select('title, user_id')
        .eq('id', itemId)
        .single();

      const { error } = await supabase
        .from('claims')
        .insert({
          item_id: itemId,
          claimant_id: user.id,
          message: message,
          status: 'pending'
        });

      if (error) {
        console.error('Error creating claim:', error);
        throw new Error('Failed to create claim');
      }

      // Create notification for the item owner
      if (itemData && itemData.user_id) {
        await supabase
          .from('notifications')
          .insert({
            user_id: itemData.user_id,
            type: 'claim',
            title: 'New Claim Received',
            message: `Someone has claimed your item "${itemData.title}"`
          });
      }

      toast({
        title: "Success",
        description: "Your claim has been submitted successfully",
      });

      // Refresh user stats
      fetchUserStats();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit claim",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6 rounded-lg">
        <h1 className="text-3xl font-bold mb-2">
          Welcome back, {profile?.username}!
        </h1>
        <p className="text-blue-100 mb-4">
          Help your community find their lost items or claim found ones.
        </p>
        
        {/* User Statistics */}
        <div className="flex gap-4 mb-4">
          <div className="bg-white/20 rounded-lg p-3 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <div>
              <div className="text-lg font-semibold">{userStats.itemsSubmitted}</div>
              <div className="text-sm text-blue-100">Items Submitted</div>
            </div>
          </div>
          <div className="bg-white/20 rounded-lg p-3 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <div>
              <div className="text-lg font-semibold">{userStats.claimsMade}</div>
              <div className="text-sm text-blue-100">Claims Made</div>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <Button 
            onClick={() => navigate('/report')}
            className="bg-white text-blue-600 hover:bg-gray-100 font-semibold"
          >
            <Plus className="h-4 w-4 mr-2" />
            Report Item
          </Button>
          <Button 
            variant="outline" 
            onClick={() => navigate('/items')}
            className="text-white border-white hover:bg-white hover:text-blue-600 font-semibold bg-transparent"
          >
            Browse All Items
          </Button>
        </div>
      </div>

      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Quick Search
          </CardTitle>
          <CardDescription>
            Search for lost or found items in your area
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Search for items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch}>Search</Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Items */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Recent Items</h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <div className="h-48 bg-gray-200 rounded-t-lg"></div>
                <CardContent className="p-4">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <Card 
                key={item.id} 
                className="hover:shadow-lg transition-shadow"
              >
                <div className="h-48 bg-gray-200 rounded-t-lg overflow-hidden">
                  {item.image_url ? (
                    <img 
                      src={item.image_url} 
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      No Image
                    </div>
                  )}
                </div>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-lg truncate">{item.title}</h3>
                    <Badge 
                      variant={item.type === 'lost' ? 'destructive' : 'default'}
                      className={item.type === 'found' ? 'bg-green-500 hover:bg-green-600 text-white' : ''}
                    >
                      {item.type}
                    </Badge>
                  </div>
                  <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                    {item.description}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {item.location}
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(item.created_at)}
                    </div>
                  </div>
                  {item.profiles && (
                    <div className="mb-3 text-xs text-gray-500">
                      Posted by {item.profiles.username}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => navigate(`/items/${item.id}`)}
                      className="flex-1"
                      size="sm"
                    >
                      View Details
                    </Button>
                    {user && user.id !== item.user_id && (
                      <Button
                        onClick={() => createClaim(item.id)}
                        className="flex items-center gap-2"
                        size="sm"
                      >
                        <Flag className="h-4 w-4" />
                        Claim
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
