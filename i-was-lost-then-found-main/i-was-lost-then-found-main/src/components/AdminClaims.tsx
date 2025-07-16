
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { Claim, ClaimStatus } from '@/types/database';

// Define the specific types for what we're selecting from the database
type ClaimItemDetails = {
  title: string;
  type: string;
};

type ClaimProfileDetails = {
  username: string;
};

type ClaimWithDetails = Claim & {
  items?: ClaimItemDetails | null;
  profiles?: ClaimProfileDetails | null;
};

export const AdminClaims = () => {
  const [claims, setClaims] = useState<ClaimWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchClaims();
  }, []);

  const fetchClaims = async () => {
    try {
      console.log('Fetching claims...');
      
      // First, get all claims
      const { data: claimsData, error: claimsError } = await supabase
        .from('claims')
        .select('*')
        .order('created_at', { ascending: false });

      if (claimsError) {
        console.error('Error fetching claims:', claimsError);
        return;
      }

      console.log('Claims data:', claimsData);

      if (!claimsData || claimsData.length === 0) {
        console.log('No claims found');
        setClaims([]);
        return;
      }

      // Get unique item IDs and user IDs
      const itemIds = [...new Set(claimsData.map(claim => claim.item_id))];
      const userIds = [...new Set(claimsData.map(claim => claim.claimant_id))];

      // Fetch items for these claims
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('id, title, type')
        .in('id', itemIds);

      if (itemsError) {
        console.error('Items query error:', itemsError);
      }

      // Fetch profiles for these users
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      if (profilesError) {
        console.error('Profiles query error:', profilesError);
      }

      // Create maps for easy lookup
      const itemsMap = new Map();
      if (itemsData) {
        itemsData.forEach(item => {
          itemsMap.set(item.id, { title: item.title, type: item.type });
        });
      }

      const profilesMap = new Map();
      if (profilesData) {
        profilesData.forEach(profile => {
          profilesMap.set(profile.id, { username: profile.username });
        });
      }

      // Combine claims with their related data
      const processedClaims: ClaimWithDetails[] = claimsData.map(claim => ({
        ...claim,
        items: itemsMap.get(claim.item_id) || null,
        profiles: profilesMap.get(claim.claimant_id) || null
      }));

      console.log('Processed claims:', processedClaims);
      setClaims(processedClaims);
    } catch (err) {
      console.error('Error in fetchClaims:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateClaimStatus = async (claimId: string, status: ClaimStatus) => {
    try {
      const { error } = await supabase
        .from('claims')
        .update({ status })
        .eq('id', claimId);

      if (error) {
        console.error('Error updating claim status:', error);
        throw new Error('Failed to update claim status');
      }

      // If claim is approved, update item status to claimed
      if (status === 'approved') {
        const claim = claims.find(c => c.id === claimId);
        if (claim) {
          const { error: itemError } = await supabase
            .from('items')
            .update({ status: 'claimed' })
            .eq('id', claim.item_id);

          if (itemError) {
            console.error('Error updating item status:', itemError);
          }
        }
      }

      toast({
        title: "Success",
        description: `Claim ${status} successfully`,
      });

      fetchClaims(); // Refresh data
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update claim status",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Claims Management ({claims.length} claims)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {claims.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No claims found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Claimant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((claim) => (
                <TableRow key={claim.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{claim.items?.title || 'Unknown Item'}</div>
                      <Badge variant="outline" className="text-xs">
                        {claim.items?.type || 'Unknown'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>{claim.profiles?.username || 'Unknown User'}</TableCell>
                  <TableCell>
                    <Badge variant={
                      claim.status === 'approved' ? 'default' :
                      claim.status === 'rejected' ? 'destructive' : 'secondary'
                    }>
                      {claim.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(claim.created_at)}</TableCell>
                  <TableCell>
                    <div className="max-w-xs truncate text-sm text-gray-600">
                      {claim.message}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {claim.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateClaimStatus(claim.id, 'approved')}
                            className="text-green-600 hover:text-green-700"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateClaimStatus(claim.id, 'rejected')}
                            className="text-red-600 hover:text-red-700"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
