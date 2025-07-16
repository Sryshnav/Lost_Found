
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Item, AppRole } from '@/types/database';
import { Shield, Eye, Flag, Trash2, CheckCircle, XCircle, BarChart3, Users, MessageSquare, Edit } from 'lucide-react';
import { AdminUsers } from '@/components/AdminUsers';
import { AdminClaims } from '@/components/AdminClaims';

type ItemProfile = {
  id: string;
  username: string;
  avatar_url?: string;
  role: AppRole;
  created_at: string;
  updated_at: string;
};

type ItemWithProfile = Item & {
  profiles?: ItemProfile | null;
};

export const Admin = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<ItemWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalItems: 0,
    activeItems: 0,
    claimedItems: 0,
    archivedItems: 0,
    totalUsers: 0,
    pendingClaims: 0
  });
  const [activeTab, setActiveTab] = useState('items');

  useEffect(() => {
    if (!user) return;
    
    // Check if user is admin
    if (profile?.role !== 'admin') {
      navigate('/');
      return;
    }

    fetchAdminData();
  }, [user, profile, navigate]);

  // Refresh stats when switching to claims tab
  useEffect(() => {
    if (activeTab === 'claims' && profile?.role === 'admin') {
      fetchAdminData();
    }
  }, [activeTab, profile]);

  const fetchAdminData = async () => {
    try {
      console.log('Fetching admin data...');
      
      // Fetch all items with profiles
      const { data, error } = await supabase
        .from('items')
        .select(`
          *,
          profiles (
            id,
            username,
            avatar_url,
            role,
            created_at,
            updated_at
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Admin items query error:', error);
        return;
      }

      // Type guard and mapper function to handle the type conversion
      const mapToItemWithProfile = (item: any): ItemWithProfile | null => {
        if (!item.profiles || typeof item.profiles !== 'object' || ('error' in item.profiles)) {
          return {
            ...item,
            profiles: null
          } as ItemWithProfile;
        }

        return {
          ...item,
          profiles: {
            ...item.profiles,
            role: item.profiles.role as AppRole
          }
        } as ItemWithProfile;
      };

      // Filter and map the data
      const validItems: ItemWithProfile[] = (data || [])
        .map(mapToItemWithProfile)
        .filter((item): item is ItemWithProfile => item !== null);

      setItems(validItems);

      // Fetch additional stats including pending claims count
      const [profilesResponse, claimsResponse] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact' }),
        supabase.from('claims').select('id', { count: 'exact' }).eq('status', 'pending')
      ]);

      console.log('Claims response:', claimsResponse);

      // Calculate stats
      const itemStats = {
        totalItems: validItems.length,
        activeItems: validItems.filter(item => item.status === 'active').length,
        claimedItems: validItems.filter(item => item.status === 'claimed').length,
        archivedItems: validItems.filter(item => item.status === 'archived').length,
        totalUsers: profilesResponse.count || 0,
        pendingClaims: claimsResponse.count || 0
      };
      
      console.log('Updated stats:', itemStats);
      setStats(itemStats);

    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateItemStatus = async (itemId: string, status: 'active' | 'claimed' | 'archived') => {
    try {
      const { error } = await supabase
        .from('items')
        .update({ status })
        .eq('id', itemId);

      if (error) {
        console.error('Error updating item status:', error);
        throw new Error('Failed to update item status');
      }

      toast({
        title: "Success",
        description: `Item status updated to ${status}`,
      });

      fetchAdminData(); // Refresh data
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update item status",
        variant: "destructive",
      });
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
      return;
    }

    try {
      // First delete any claims associated with this item
      const { error: claimsError } = await supabase
        .from('claims')
        .delete()
        .eq('item_id', itemId);

      if (claimsError) {
        console.error('Error deleting item claims:', claimsError);
        throw new Error('Failed to delete item claims');
      }

      // Then delete the item
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', itemId);

      if (error) {
        console.error('Error deleting item:', error);
        throw new Error('Failed to delete item');
      }

      toast({
        title: "Success",
        description: "Item deleted successfully",
      });

      fetchAdminData(); // Refresh data
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive",
      });
    }
  };

  const createAdminClaim = async (itemId: string) => {
    if (!user) return;

    const message = prompt('Enter claim message (optional):') || 'Admin claim verification';

    try {
      const { error } = await supabase
        .from('claims')
        .insert({
          item_id: itemId,
          claimant_id: user.id,
          message: message,
          status: 'pending'
        });

      if (error) {
        console.error('Error creating admin claim:', error);
        throw new Error('Failed to create claim');
      }

      toast({
        title: "Success",
        description: "Claim created successfully",
      });

      fetchAdminData(); // Refresh stats
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create claim",
        variant: "destructive",
      });
    }
  };

  const editItem = async (item: ItemWithProfile) => {
    const newTitle = prompt('Enter new title:', item.title);
    if (!newTitle || newTitle === item.title) return;

    const newDescription = prompt('Enter new description:', item.description);
    if (newDescription === null) return;

    const newLocation = prompt('Enter new location:', item.location);
    if (newLocation === null) return;

    try {
      const { error } = await supabase
        .from('items')
        .update({
          title: newTitle,
          description: newDescription || item.description,
          location: newLocation || item.location
        })
        .eq('id', item.id);

      if (error) {
        console.error('Error updating item:', error);
        throw new Error('Failed to update item');
      }

      toast({
        title: "Success",
        description: "Item updated successfully",
      });

      fetchAdminData(); // Refresh data
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update item",
        variant: "destructive",
      });
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

  if (profile?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-4">You don't have permission to access the admin dashboard.</p>
          <Button onClick={() => navigate('/')}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.activeItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Claimed Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.claimedItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Archived Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{stats.archivedItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pending Claims</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.pendingClaims}</div>
          </CardContent>
        </Card>
      </div>

      {/* Admin Management Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="items" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Items Management
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            User Management
          </TabsTrigger>
          <TabsTrigger value="claims" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Claims Management
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Items Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
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
                        <span>By: {item.profiles?.username || 'Unknown'}</span>
                        <span>Location: {item.location}</span>
                        <span>Date: {formatDate(item.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/items/${item.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => createAdminClaim(item.id)}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        Claim
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => editItem(item)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateItemStatus(item.id, 'active')}
                        disabled={item.status === 'active'}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateItemStatus(item.id, 'archived')}
                        disabled={item.status === 'archived'}
                      >
                        <Flag className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <AdminUsers />
        </TabsContent>

        <TabsContent value="claims">
          <AdminClaims />
        </TabsContent>
      </Tabs>
    </div>
  );
};
