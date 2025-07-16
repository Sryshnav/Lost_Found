
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Item } from '@/types/database';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Search, MapPin, Calendar, Filter, Flag } from 'lucide-react';

export const Items = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'lost' | 'found'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching items:', error);
        return;
      }

      setItems(data || []);
    } catch (err) {
      console.error('Error in fetchItems:', err);
    } finally {
      setLoading(false);
    }
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
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit claim",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || item.type === typeFilter;
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    
    return matchesSearch && matchesType && matchesCategory;
  });

  const categories = [...new Set(items.map(item => item.category))];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Lost & Found Items</h1>
        <Button onClick={() => window.location.href = '/report'}>
          Report Item
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={(value: 'all' | 'lost' | 'found') => setTypeFilter(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="lost">Lost Items</SelectItem>
                <SelectItem value="found">Found Items</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.map((item) => (
          <Card key={item.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{item.title}</CardTitle>
                <div className="flex gap-2">
                  <Badge 
                    variant={item.type === 'lost' ? 'destructive' : 'default'}
                    className={item.type === 'found' ? 'bg-green-500 hover:bg-green-600 text-white' : ''}
                  >
                    {item.type}
                  </Badge>
                  <Badge variant="outline">{item.category}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt={item.title}
                  className="w-full h-48 object-cover rounded-lg mb-4"
                />
              )}
              <p className="text-gray-600 mb-4">{item.description}</p>
              <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  <span>{item.location}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>{formatDate(item.created_at)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => window.location.href = `/items/${item.id}`}
                  className="flex-1"
                >
                  View Details
                </Button>
                {user && user.id !== item.user_id && (
                  <Button
                    onClick={() => createClaim(item.id)}
                    className="flex items-center gap-2"
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

      {filteredItems.length === 0 && (
        <div className="text-center py-12">
          <h3 className="text-lg font-semibold mb-2">No items found</h3>
          <p className="text-gray-600">Try adjusting your search filters or check back later.</p>
        </div>
      )}
    </div>
  );
};
